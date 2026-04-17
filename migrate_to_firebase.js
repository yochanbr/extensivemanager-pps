const admin = require('firebase-admin');
const crypto = require('crypto-js');
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// --- CONFIGURATION ---
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'nammamart_secret_key_change_me';
const FIREBASE_KEY_PATH = './extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json';

// --- INITIALIZE FIREBASE ---
const serviceAccount = require(FIREBASE_KEY_PATH);
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- ENCRYPTION HELPER ---
function encrypt(text) {
    if (!text) return text;
    if (typeof text !== 'string') text = JSON.stringify(text);
    return crypto.AES.encrypt(text, ENCRYPTION_SECRET).toString();
}

// --- MIGRATION LOGIC ---

async function migrateLowDB() {
    console.log('--- Migrating db.json (lowdb) ---');
    if (!fs.existsSync('db.json')) {
        console.log('db.json not found, skipping.');
        return;
    }
    const data = JSON.parse(fs.readFileSync('db.json', 'utf8'));

    // 1. Employees
    if (data.employees) {
        console.log(`Migrating ${data.employees.length} employees...`);
        for (const emp of data.employees) {
            const encryptedEmp = { ...emp };
            ['password', 'phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number'].forEach(field => {
                if (encryptedEmp[field]) encryptedEmp[field] = encrypt(encryptedEmp[field]);
            });
            await db.collection('employees').doc(emp.id).set(encryptedEmp);
        }
    }

    // 2. Settings & Global State
    console.log('Migrating settings and global state...');
    await db.collection('settings').doc('config').set(data.settings || {});
    await db.collection('settings').doc('state').set({
        store_closed: data.store_closed || false,
        broadcast: data.broadcast || { message: "", timestamp: 0 },
        nextShiftId: data.nextShiftId || 1
    });

    // 3. Attendance Logs
    if (data.attendance_logs) {
        console.log(`Migrating ${data.attendance_logs.length} attendance logs...`);
        let batch = db.batch();
        let count = 0;
        for (const log of data.attendance_logs) {
            const logId = log.id || `log_${Date.now()}_${count}`;
            const ref = db.collection('attendance_logs').doc(logId);
            batch.set(ref, log);
            count++;
            if (count % 500 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        await batch.commit();
    }

    // 4. Daily Sessions
    if (data.daily_sessions) {
        console.log(`Migrating ${data.daily_sessions.length} daily sessions...`);
        let batch = db.batch();
        let count = 0;
        for (const session of data.daily_sessions) {
            const sessionId = session.id || `session_${Date.now()}_${count}`;
            const ref = db.collection('daily_sessions').doc(sessionId);
            batch.set(ref, session);
            count++;
            if (count % 500 === 0) {
                await batch.commit();
                batch = db.batch();
            }
        }
        await batch.commit();
    }
}

async function migrateSQLite() {
    console.log('--- Migrating esrjpg.db (SQLite) ---');
    if (!fs.existsSync('esrjpg.db')) {
        console.log('esrjpg.db not found, skipping.');
        return;
    }

    const sqliteDb = new Database('esrjpg.db');
    
    // 1. ESR Reports
    try {
        const reports = sqliteDb.prepare('SELECT * FROM esr_reports').all();
        console.log(`Migrating ${reports.length} ESR reports...`);
        for (const report of reports) {
            const encryptedReport = {
                ...report,
                report_data: encrypt(report.report_data)
            };
            await db.collection('esr_reports').doc(String(report.id)).set(encryptedReport);
        }
    } catch (e) {
        console.log('esr_reports table might not exist, skipping.');
    }

    // 2. ESR JPGs -> Migrated to Firestore (No Storage needed!)
    try {
        const jpgs = sqliteDb.prepare('SELECT * FROM esr_jpgs').all();
        console.log(`Migrating ${jpgs.length} ESR images to Firestore (Base64)...`);
        for (const jpg of jpgs) {
            // Encode buffer to base64, then encrypt
            const base64Jpg = jpg.jpg_data.toString('base64');
            const encryptedJpg = encrypt(base64Jpg);
            
            await db.collection('esr_jpgs').doc(String(jpg.id)).set({
                employee_id: jpg.employee_id,
                date: jpg.date,
                shift_id: jpg.shift_id,
                jpg_data_encrypted: encryptedJpg,
                created_at: jpg.created_at
            });
        }
    } catch (e) {
        console.log('esr_jpgs table might not exist, skipping.');
    }
}

async function run() {
    try {
        await migrateLowDB();
        await migrateSQLite();
        console.log('✅ Migration COMPLETED successfully (All data in Firestore)!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration FAILED:', error);
        process.exit(1);
    }
}

run();
