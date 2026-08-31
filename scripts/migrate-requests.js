const admin = require('firebase-admin');
const serviceAccount = require('../extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json'); 
const fs = require('fs');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const firestore = admin.firestore();
const db = {
    leave_requests: () => firestore.collection('leave_requests'),
    shift_swaps: () => firestore.collection('shift_swaps'),
    counters: () => firestore.collection('counters'),
    leave_balances: () => firestore.collection('leave_balances'),
    employees: () => firestore.collection('employees')
};

const isDryRun = process.argv.includes('--dry-run');

async function getNextId(type, t) {
    const counterRef = db.counters().doc(type);
    const doc = await t.get(counterRef);
    let count = 1;
    if (doc.exists) count = doc.data().count + 1;
    t.set(counterRef, { count }, { merge: true });
    const prefix = type === 'leave' ? 'LV' : 'SW';
    const year = new Date().getFullYear();
    return prefix + '-' + year + '-' + String(count).padStart(6, '0');
}

async function migrate() {
    console.log("Starting migration... " + (isDryRun ? "[DRY RUN]" : "[LIVE EXECUTION]"));
    
    let stats = {
        leaves: { total: 0, missingRequestId: 0, missingUpdatedAt: 0, modified: 0 },
        swaps: { total: 0, missingRequestId: 0, missingUpdatedAt: 0, modified: 0 },
        employees: { total: 0, missingLeaveBalance: 0, modified: 0 }
    };

    const leaves = await db.leave_requests().get();
    stats.leaves.total = leaves.size;
    for (const doc of leaves.docs) {
        const data = doc.data();
        let needsUpdate = false;
        const update = {};

        if (!data.requestId) {
            stats.leaves.missingRequestId++;
            needsUpdate = true;
            if (!isDryRun) {
                await firestore.runTransaction(async (t) => {
                    const freshDoc = await t.get(doc.ref);
                    if (!freshDoc.data().requestId) {
                        const newId = await getNextId('leave', t);
                        t.update(doc.ref, { requestId: newId });
                    }
                });
            }
        }
        
        if (!data.updatedAt) {
            stats.leaves.missingUpdatedAt++;
            needsUpdate = true;
            if (!isDryRun) {
                update.updatedAt = data.createdAt ? (typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt) : admin.firestore.FieldValue.serverTimestamp();
            }
        }

        if (data.createdAt && typeof data.createdAt === 'string') {
             needsUpdate = true;
             update.legacyCreatedAt = data.createdAt;
        }

        if (needsUpdate) {
            if (!isDryRun && Object.keys(update).length > 0) {
                await doc.ref.update(update);
            }
            stats.leaves.modified++;
        }
    }
    
    const swaps = await db.shift_swaps().get();
    stats.swaps.total = swaps.size;
    for (const doc of swaps.docs) {
        const data = doc.data();
        let needsUpdate = false;
        const update = {};

        if (!data.requestId) {
            stats.swaps.missingRequestId++;
            needsUpdate = true;
            if (!isDryRun) {
                await firestore.runTransaction(async (t) => {
                    const freshDoc = await t.get(doc.ref);
                    if (!freshDoc.data().requestId) {
                        const newId = await getNextId('swap', t);
                        t.update(doc.ref, { requestId: newId });
                    }
                });
            }
        }
        
        if (!data.updatedAt) {
            stats.swaps.missingUpdatedAt++;
            needsUpdate = true;
            if (!isDryRun && Object.keys(update).length > 0) {
                 update.updatedAt = data.createdAt ? (typeof data.createdAt === 'string' ? new Date(data.createdAt) : data.createdAt) : admin.firestore.FieldValue.serverTimestamp();
            }
        }

        if (needsUpdate) {
            if (!isDryRun && Object.keys(update).length > 0) {
                await doc.ref.update(update);
            }
            stats.swaps.modified++;
        }
    }

    const emps = await db.employees().get();
    stats.employees.total = emps.size;
    for (const doc of emps.docs) {
        const balDoc = await db.leave_balances().doc(doc.id).get();
        if (!balDoc.exists) {
            stats.employees.missingLeaveBalance++;
            if (!isDryRun) {
                const defaultBalance = {
                    employeeId: doc.id,
                    year: new Date().getFullYear(),
                    paid: { total: 12, used: 0, pending: 0, available: 12 },
                    sick: { total: 5, used: 0, pending: 0, available: 5 },
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                };
                await db.leave_balances().doc(doc.id).set(defaultBalance);
            }
            stats.employees.modified++;
        }
    }

    console.log("\\n--- MIGRATION SUMMARY ---");
    console.log("Leave requests:");
    console.log("  total: " + stats.leaves.total);
    console.log("  missing requestId: " + stats.leaves.missingRequestId);
    console.log("  missing updatedAt: " + stats.leaves.missingUpdatedAt);
    
    console.log("\\nShift swaps:");
    console.log("  total: " + stats.swaps.total);
    console.log("  missing requestId: " + stats.swaps.missingRequestId);
    
    console.log("\\nEmployees:");
    console.log("  missing leave balance: " + stats.employees.missingLeaveBalance);
    
    if (isDryRun) {
        console.log("\\nNo data modified. (Dry Run)");
    } else {
        console.log("\\nModified " + stats.leaves.modified + " leaves, " + stats.swaps.modified + " swaps, and " + stats.employees.modified + " employees.");
    }

    process.exit(0);
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
