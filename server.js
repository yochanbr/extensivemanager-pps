const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');

// --- SYSTEM TIME CONFIGURATION (IST) ---
process.env.TZ = 'Asia/Kolkata';

const shortid = require('shortid');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const crypto = require('crypto-js');
const { execSync } = require('child_process');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const app = express();
app.set('trust proxy', 1);
app.use(cookieParser());
const port = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

// --- MANDATORY SECRETS CHECK ---
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || JWT_SECRET + '_refresh';

if (!ADMIN_USER || !ADMIN_PASS || !JWT_SECRET) {
    console.error('🔥 CRITICAL: Missing mandatory security environment variables (ADMIN_USER, ADMIN_PASS, JWT_SECRET). Server crashed for safety.');
    process.exit(1);
}

// Ensure ADMIN_PASS is hashed for safe comparisons later
const ADMIN_PASS_HASH = bcrypt.hashSync(ADMIN_PASS, 10);

// Export for Vercel (Must be early)
if (isVercel) {
    module.exports = app;
}

// --- GLOBAL SECURITY HARDENING ---
// Manual Security Headers (Helmet-lite)
app.use((req, res, next) => {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=*, geolocation=(), microphone=()');
    next();
});


// Secure Rate Limiters
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { success: false, message: 'Too many requests. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const loginLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5, // 5 attempts
    message: { success: false, message: 'Too many login attempts. Please try again after a minute.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Diagnostic route (no DB dependency)
app.get('/api/health', (req, res) => {
    res.json({
        status: 'online',
        time: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        firebaseInitialized: !!firestore,
        nodeVersion: process.version
    });
});

// Heavy dependencies (Deferred for serverless compatibility)
let puppeteer;

// Firebase Configuration
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'nammamart_secret_key_change_me';
const FIREBASE_KEY_PATH = './extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json';

// Backup Configuration
const BACKUP_PAT = process.env.BACKUP_PAT;
const BACKUP_OWNER = 'yochanbr';
const BACKUP_REPO = 'backup-extensivemanager';
const BACKUP_FILE_PATH = 'latest_system_backup.json';

// Initialize Firebase Admin
let firestore;
try {
    let serviceAccount;
    const rawAccount = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (rawAccount) {
        console.log('📡 Attempting to initialize Firebase from environment variable...');
        try {
            // Trim and handle base64 or raw JSON
            const cleaned = rawAccount.trim();
            const jsonString = cleaned.startsWith('{') ? cleaned : Buffer.from(cleaned, 'base64').toString();
            serviceAccount = JSON.parse(jsonString);
            console.log('✅ Service account JSON parsed successfully');
        } catch (parseError) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT JSON:', parseError.message);
            throw parseError;
        }
    } else {
        console.log('📂 Attempting to initialize Firebase from local file...');
        if (fs.existsSync(FIREBASE_KEY_PATH)) {
            serviceAccount = require(FIREBASE_KEY_PATH);
        } else {
            console.warn('⚠️ Local firebase-key.json not found.');
        }
    }

    if (serviceAccount && !admin.apps.length) {
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firestore = admin.firestore();
        console.log('🚀 Firebase Admin initialized successfully');
    }
} catch (error) {
    console.error('🔥 CRITICAL: Firebase Initialization Error:', error.message);
}

// Global check for firestore availability
const ensureDb = (req, res, next) => {
    if (!firestore) {
        return res.status(500).json({
            success: false,
            message: 'Database not initialized. Check server logs for FIREBASE_SERVICE_ACCOUNT errors.'
        });
    }
    next();
};

// Encryption Utilities
const encrypt = (text) => {
    if (!text) return text;
    if (typeof text !== 'string') text = JSON.stringify(text);
    return crypto.AES.encrypt(text, ENCRYPTION_SECRET).toString();
};

const decrypt = (text) => {
    if (!text || typeof text !== 'string') return text;
    if (!text.startsWith('U2FsdGVkX1')) return text;
    try {
        const bytes = crypto.AES.decrypt(text, ENCRYPTION_SECRET);
        const originalText = bytes.toString(crypto.enc.Utf8);
        return originalText || text;
    } catch (e) {
        return text;
    }
};

const refreshLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 refresh attempts per window per IP
    message: { success: false, message: 'Too many refresh attempts.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- SECURE JWT AUTHENTICATION SYSTEM ---
const createSession = async (user, req, res) => {
    // 1. Session Cleanup: Limit active sessions to 5 per user
    const activeSessionsSnap = await db.auth_sessions().where('userId', '==', user.id).where('isValid', '==', true).get();
    if (activeSessionsSnap.size >= 5) {
        const sessions = activeSessionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        sessions.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const toDelete = sessions.length - 4;
        const batch = firestore.batch();
        for (let i = 0; i < toDelete; i++) batch.update(db.auth_sessions().doc(sessions[i].id), { isValid: false });
        await batch.commit();
    }

    const sessionId = shortid.generate();
    const actualCsrfToken = shortid.generate() + shortid.generate();
    
    const accessToken = jwt.sign({ id: user.id, role: user.role, sessionId }, JWT_SECRET, { expiresIn: '15m' });
    const refreshToken = jwt.sign({ id: user.id, role: user.role, sessionId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
    const refreshTokenHash = bcrypt.hashSync(refreshToken, 10);
    
    await db.auth_sessions().doc(sessionId).set({
        sessionId,
        userId: user.id,
        role: user.role,
        refreshTokenHash,
        userAgent: req.headers['user-agent'] || 'Unknown',
        ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        isValid: true
    });
    
    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' };
    res.cookie('accessToken', accessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
    res.cookie('refreshToken', refreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.cookie('xsrf-token', actualCsrfToken, { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict', maxAge: 7 * 24 * 60 * 60 * 1000 });
};

const revokeSession = async (req, res) => {
    let sessionId = null;
    try {
        if (req.cookies.accessToken) sessionId = jwt.verify(req.cookies.accessToken, JWT_SECRET, { ignoreExpiration: true }).sessionId;
        else if (req.cookies.refreshToken) sessionId = jwt.verify(req.cookies.refreshToken, JWT_REFRESH_SECRET, { ignoreExpiration: true }).sessionId;
    } catch (e) {}

    if (sessionId) await db.auth_sessions().doc(sessionId).update({ isValid: false }).catch(() => {});

    const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' };
    res.clearCookie('accessToken', cookieOptions);
    res.clearCookie('refreshToken', cookieOptions);
    res.clearCookie('xsrf-token', { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
};

const verifyAuth = (roles) => (req, res, next) => {
    const isApi = req.path.startsWith('/api/');
    
    // CSRF Protection for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const csrfCookie = req.cookies['xsrf-token'];
        const csrfHeader = req.headers['x-xsrf-token'];
        if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
            return isApi ? res.status(403).json({ success: false, message: 'Forbidden: CSRF token mismatch.' }) : res.redirect('/');
        }
    }
    
    const accessToken = req.cookies.accessToken;
    if (!accessToken) return isApi ? res.status(401).json({ success: false, message: 'Unauthorized: Session missing.' }) : res.redirect('/');
    
    let decoded;
    try {
        decoded = jwt.verify(accessToken, JWT_SECRET);
    } catch (e) {
        return isApi ? res.status(401).json({ success: false, message: 'Unauthorized: Access token expired or invalid.' }) : res.redirect('/');
    }
    
    if (roles && !roles.includes(decoded.role) && decoded.role !== 'admin') {
        const cookieOpts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' };
        res.clearCookie('accessToken', cookieOpts);
        res.clearCookie('refreshToken', cookieOpts);
        res.clearCookie('xsrf-token', { secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' });
        return isApi ? res.status(401).json({ success: false, message: 'Unauthorized: Session missing or invalid role.' }) : res.redirect('/');
    }
    
    req.user = decoded;
    if (decoded.role === 'admin') req.admin = decoded; // Backwards compatibility
    next();
};

const verifyAdmin = verifyAuth(['admin']);
const verifyEmployee = verifyAuth(['employee', 'admin']);

const serveProtected = (roles, filePath) => [verifyAuth(roles), (req, res) => {
    res.sendFile(path.join(__dirname, filePath));
}];

// --- GLOBAL API SECURITY & IDENTITY ENFORCEMENT ---
app.use('/api', (req, res, next) => {
    if (req.path === '/health') return next();
    if (req.path.startsWith('/employees') && req.method === 'GET') return next();
    if (req.path.startsWith('/attendance/state/') && req.method === 'GET') return next();
    if (req.path === '/attendance/scan' && req.method === 'POST') return next();
    
    // Authenticate all API requests automatically
    verifyEmployee(req, res, () => {
        // Enforce Identity: Prevent employees from impersonating others via request payloads
        if (req.user && req.user.role === 'employee') {
            if (req.body && typeof req.body === 'object' && 'employeeId' in req.body) req.body.employeeId = req.user.id;
            if (req.query && typeof req.query === 'object' && 'employeeId' in req.query) req.query.employeeId = req.user.id;
            if (req.params && typeof req.params === 'object' && 'employeeId' in req.params) req.params.employeeId = req.user.id;
        }
        next();
    });
});

// Firestore Collection Wrappers
const db = {
    settings: () => firestore.collection('settings'),
    employees: () => firestore.collection('employees'),
    broadcast: () => firestore.collection('settings').doc('state'),
    attendance_logs: () => firestore.collection('attendance_logs'),
    daily_sessions: () => firestore.collection('daily_sessions'),
    esr_reports: () => firestore.collection('esr_reports'),
    esr_jpgs: () => firestore.collection('esr_jpgs'),
    leave_swaps: () => firestore.collection('leave_swaps'),
    auth_sessions: () => firestore.collection('auth_sessions')
};


// --- Secure GitHub Backup System (Git-less API Implementation) ---
const syncToBackupRepo = async () => {
    try {
        if (!BACKUP_PAT) {
            console.error('❌ BACKUP_PAT not found in environment.');
            return { success: false, error: 'Cloud Sync configuration missing (BACKUP_PAT).' };
        }

        // 1. Data Export
        console.log('📡 Fetching latest Firestore state...');
        const collections = ['settings', 'employees', 'attendance_logs', 'daily_sessions', 'esr_reports', 'esr_jpgs', 'leave_swaps'];
        const backupData = {};
        for (const colName of collections) {
            const snapshot = await firestore.collection(colName).get();
            backupData[colName] = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        }

        const timestamp = new Date().toISOString();
        const contentBase64 = Buffer.from(JSON.stringify(backupData, null, 2)).toString('base64');
        const apiUrl = `https://api.github.com/repos/${BACKUP_OWNER}/${BACKUP_REPO}/contents/${BACKUP_FILE_PATH}`;

        // 2. Check for existing file SHA (required for updating files in GitHub API)
        let sha = null;
        try {
            const getRes = await fetch(apiUrl, {
                headers: { 'Authorization': `token ${BACKUP_PAT}`, 'Accept': 'application/vnd.github+json' }
            });
            if (getRes.ok) {
                const fileData = await getRes.json();
                sha = fileData.sha;
            }
        } catch (err) { console.log('ℹ️ Creating new backup file on GitHub.'); }

        // 3. Push to Cloud via REST API
        console.log('📦 Pushing to GitHub Cloud API...');
        const putRes = await fetch(apiUrl, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${BACKUP_PAT}`,
                'Accept': 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                message: `System Backup [${timestamp}]`,
                content: contentBase64,
                sha: sha || undefined
            })
        });

        const result = await putRes.json();
        if (putRes.ok) {
            console.log('✅ GitHub API Backup Successful.');
            return { success: true, message: 'Data synced to GitHub Cloud API successfully.', timestamp };
        } else {
            console.error('❌ GitHub API Error:', result.message);
            return { success: false, error: result.message };
        }
    } catch (error) {
        console.error('❌ Cloud Backup Critical Failure:', error.message);
        return { success: false, error: error.message };
    }
};


// Professional Directory Structure Static Serving
app.use('/css', express.static(path.join(__dirname, 'public/css')));
app.use('/js', express.static(path.join(__dirname, 'public/js')));
app.use('/assets', express.static(path.join(__dirname, 'public/assets')));

// Prevent direct access to .html files since we serve them securely
app.use((req, res, next) => {
    if (req.path.endsWith('.html') && !req.path.endsWith('scan.html')) return res.redirect('/');
    next();
});
app.use(express.static(path.join(__dirname, 'public/html')));

// Specifically serve models directory (Crucial for Vercel/Face-API)
app.use('/models', express.static(path.join(__dirname, 'models')));
app.use('/ads', express.static(path.join(__dirname, 'ads')));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Email configuration (provided)
const emailConfig = {
    from: 'nsoridcodings@gmail.com',
    recipients: ['yochanbr@gmail.com', '', ''],
    transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.GMAIL_USER || 'nsoridcodings@gmail.com',
            pass: process.env.GMAIL_PASS || 'thvp krkn ipml dzzp'
        }
    })
};

// Simple in-memory OTP store for end-shift flow
let endShiftOtp = {
    otp: null,
    expiresAt: 0
};

// Simple in-memory OTP store for employee end-shift flow
let employeeEndShiftOtp = {
    otp: null,
    expiresAt: 0,
    employeeId: null
};

// Update progress tracking
let updateInProgress = false;
let updateStartTime = null;

// Note: OTPs are now stored in Firestore to support serverless environments (Vercel)

// Test close flag
let testCloseDone = false;

// Handle logout
app.post('/logout', async (req, res) => {
    await revokeSession(req, res);
    res.json({ success: true });
});

// Explicit Refresh Endpoint
app.post('/api/auth/refresh', refreshLimiter, async (req, res) => {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'No refresh token provided.' });

    try {
        const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
        const sessionDoc = await db.auth_sessions().doc(decoded.sessionId).get();

        if (!sessionDoc.exists || !sessionDoc.data().isValid || new Date(sessionDoc.data().expiresAt) < new Date()) {
            return res.status(401).json({ success: false, message: 'Session invalid or expired.' });
        }

        const sessionData = sessionDoc.data();

        // Check hash to detect replay attacks
        if (!bcrypt.compareSync(refreshToken, sessionData.refreshTokenHash)) {
            console.error(`🚨 REPLAY ATTACK DETECTED: IP ${req.headers['x-forwarded-for'] || req.socket.remoteAddress}, User: ${decoded.id}, Time: ${new Date().toISOString()}`);
            await sessionDoc.ref.update({ isValid: false });
            return res.status(401).json({ success: false, message: 'Security Alert: Session compromised.' });
        }

        // Issue new tokens (Rotation)
        const newAccessToken = jwt.sign({ id: decoded.id, role: decoded.role, sessionId: decoded.sessionId }, JWT_SECRET, { expiresIn: '15m' });
        const newRefreshToken = jwt.sign({ id: decoded.id, role: decoded.role, sessionId: decoded.sessionId }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
        const newRefreshTokenHash = bcrypt.hashSync(newRefreshToken, 10);
        
        await sessionDoc.ref.update({ refreshTokenHash: newRefreshTokenHash });

        const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Strict' };
        res.cookie('accessToken', newAccessToken, { ...cookieOptions, maxAge: 15 * 60 * 1000 });
        res.cookie('refreshToken', newRefreshToken, { ...cookieOptions, maxAge: 7 * 24 * 60 * 60 * 1000 });
        
        res.json({ success: true });
    } catch (e) {
        res.status(401).json({ success: false, message: 'Invalid refresh token.' });
    }
});

// Handle login requests
app.post('/login', loginLimiter, ensureDb, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Username and password are required.' });
        }

        const trimmedUsername = username.trim();

        // 1. Check Admin Credentials against secure env variables
        if (trimmedUsername === ADMIN_USER && bcrypt.compareSync(password, ADMIN_PASS_HASH)) {
            await createSession({ id: 'admin', role: 'admin' }, req, res);
            return res.json({ success: true, redirectUrl: '/admin' });
        }


        // 3. Find Employee (Username is primary key or we query by field)
        // In our migration, we used employee.id as document ID, but we should search by username
        const empQuery = await db.employees().where('username', '==', trimmedUsername).get();

        if (empQuery.empty) {
            return res.status(401).json({
                success: false,
                message: `No account found with username "${trimmedUsername}".`,
                code: 'USER_NOT_FOUND'
            });
        }

        const employeeDoc = empQuery.docs[0];
        let employee = employeeDoc.data();

        // 4. Decrypt sensitive fields for comparison
        employee.password = decrypt(employee.password);

        if (employee.isActive === false) {
            return res.status(403).json({ success: false, message: 'You are not allowed by admin', code: 'USER_DEACTIVATED' });
        }

        // Password check (bcrypt is handled before encryption in our logic usually)
        const validPassword = bcrypt.compareSync(password, employee.password);

        if (!validPassword) {
            return res.status(401).json({ success: false, message: 'Incorrect password.', code: 'INVALID_PASSWORD' });
        }

        // Initialize counter_selections if missing
        if (!employee.counter_selections) {
            employee.counter_selections = [];
            await employeeDoc.ref.update({ counter_selections: [] });
        }

        const today = new Date().toISOString().split('T')[0];
        const sessionSnapshot = await db.daily_sessions()
            .where('employeeId', '==', employee.id)
            .where('date', '==', today)
            .get();

        const sessions = sessionSnapshot.docs.map(d => d.data());
        // Sort to get the most recent session first
        sessions.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

        const activeSession = sessions.find(s => s.status === 'active');

        if (!activeSession) {
            const lastSession = sessions.length > 0 ? sessions[0] : null;
            
            let msg = 'Access Denied: You must be Checked-In to enter the portal.';
            if (lastSession && lastSession.status === 'on_break') {
                msg = 'Access Denied: You are currently ON BREAK. Please end your break on the scan page first.';
            } else if (lastSession && lastSession.status === 'completed') {
                msg = 'Access Denied: Your shift for today is already completed.';
            } else {
                msg = 'Access Denied: You have not Checked-In yet. Please scan your face to start your shift first.';
            }

            return res.status(401).json({
                success: false,
                message: msg,
                code: 'NOT_WORKING'
            });
        }

        let hasActiveShift = false;
        if (employee.counter_selections && employee.counter_selections.length > 0) {
            const lastShift = employee.counter_selections[employee.counter_selections.length - 1];
            if (!lastShift.shiftEndTime && lastShift.shiftStartTime && lastShift.shiftStartTime.startsWith(today)) {
                hasActiveShift = true;
            }
        }

        await createSession({ id: employee.id, role: 'employee' }, req, res);

        if (hasActiveShift) {
            res.json({ success: true, redirectUrl: '/employee', employeeId: employee.id });
        } else {
            res.json({ success: true, redirectUrl: '/counter_selection', employeeId: employee.id });
        }
    } catch (error) {
        console.error('Error during login:', error);
        res.status(500).json({ success: false, message: 'Internal server error during login.' });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/index.html'));
});

// Secure dynamic routing for HTML files
app.get('/admin', serveProtected(['admin'], 'public/html/admin.html'));
app.get('/scan', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/html/scan.html'));
});
app.get('/employee', serveProtected(['employee', 'admin'], 'public/html/employee.html'));
app.get('/counter_selection', serveProtected(['employee', 'admin'], 'public/html/counter_selection.html'));
app.get('/add_employee', serveProtected(['admin'], 'public/html/add_employee.html'));
app.get('/report', serveProtected(['admin'], 'public/html/report.html'));

// Handle add employee requests
app.post('/api/employees', verifyAdmin, async (req, res) => {
    const employeeData = req.body;

    // Set username to employee-id
    employeeData.username = employeeData['employee-id'];
    delete employeeData['employee-id'];

    // Encrypt the password BEFORE encryption wrapper
    const salt = bcrypt.genSaltSync(10);
    employeeData.password = bcrypt.hashSync(employeeData.password, salt);

    employeeData.id = shortid.generate();
    employeeData.shiftEnded = false;
    employeeData.counter_selections = [];

    // Encrypt sensitive fields before Firestore
    ['password', 'phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number'].forEach(field => {
        if (employeeData[field]) employeeData[field] = encrypt(employeeData[field]);
    });

    await db.employees().doc(employeeData.id).set(employeeData);
    res.json({ success: true, message: 'Employee added successfully.' });
});

// Get all employees
app.get('/api/employees', async (req, res) => {
    const snapshot = await db.employees().get();
    const employees = snapshot.docs.map(doc => {
        const data = doc.data();
        data.id = doc.id;
        // Decrypt sensitive fields
        ['phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number', 'designation', 'department', 'pfNumber', 'uanNumber', 'location'].forEach(field => {
            if (data[field]) data[field] = decrypt(data[field]);
        });
        return data;
    });
    res.json(employees);
});

// Delete an employee
app.delete('/api/employees/:id', verifyAdmin, async (req, res) => {
    const employeeId = req.params.id;
    await db.employees().doc(employeeId).delete();
    res.json({ success: true, message: 'Employee deleted successfully.' });
});

// Post a new broadcast message
app.post('/api/broadcast', verifyAdmin, async (req, res) => {
    const { message } = req.body;
    const timestamp = Date.now();
    await db.broadcast().update({
        broadcast: { message: message || "", timestamp }
    });
    res.json({ success: true, message: 'Broadcast updated successfully.', timestamp });
});

// Get current broadcast message
app.get('/api/broadcast', async (req, res) => {
    const doc = await db.broadcast().get();
    if (doc.exists) {
        res.json(doc.data().broadcast || { message: "", timestamp: 0 });
    } else {
        res.json({ message: "", timestamp: 0 });
    }
});



// Get a single employee by ID
app.get('/api/employees/:id', async (req, res) => {
    try {
        const employeeId = req.params.id;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const emp = doc.data();
            if (emp.isActive === false) {
                return res.status(403).json({ success: false, message: 'You are not allowed by admin', code: 'USER_DEACTIVATED' });
            }

            // Decrypt sensitive fields
            ['phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number'].forEach(field => {
                if (emp[field]) emp[field] = decrypt(emp[field]);
            });

            res.json(emp);
        } else {
            res.status(404).json({ success: false, message: 'Employee not found.' });
        }
    } catch (e) {
        console.error('Error in /api/employees/:id:', e);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

// Update an employee's details
app.put('/api/employees/:id', verifyAdmin, async (req, res) => {
    const employeeId = req.params.id;
    const employeeData = req.body;

    // If the password is being updated, hash it then encrypt it
    if (employeeData.password && employeeData.password.trim() !== '') {
        const salt = bcrypt.genSaltSync(10);
        employeeData.password = encrypt(bcrypt.hashSync(employeeData.password, salt));
    } else {
        delete employeeData.password;
    }

    // Encrypt other sensitive fields
    ['phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number'].forEach(field => {
        if (employeeData[field]) employeeData[field] = encrypt(employeeData[field]);
    });

    await db.employees().doc(employeeId).update(employeeData);
    res.json({ success: true, message: 'Employee updated successfully.' });
});

// Register or update an employee's face descriptor
app.post('/api/employees/:id/face', async (req, res) => {
    const employeeId = req.params.id;
    const { descriptor } = req.body;

    if (!descriptor || !Array.isArray(descriptor)) {
        return res.status(400).json({ success: false, message: 'Invalid face descriptor data provided.' });
    }

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    await doc.ref.update({ faceDescriptor: descriptor });
    res.json({ success: true, message: 'Face descriptor recorded successfully.' });
});

// Handle counter selection data submission (FIXED SHIFT START)
app.post('/api/counter-selection', async (req, res) => {
    const { employeeId, counter, pineLabValue, timestamp } = req.body;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    // Generate shift ID safely avoiding Firestore global counter race conditions
    const namePart = (employee.name || "EMP").replace(/\s/g, '').substr(0, 3).toUpperCase();
    const uniquePrefix = shortid.generate().replace(/[-_]/g, '').substring(0, 5).toUpperCase();
    const shiftId = `${uniquePrefix}-${namePart}`;

    // Create new shift entry
    const newShift = {
        id: shortid.generate(),
        shiftId: shiftId,
        counter,
        pineLabValue,
        shiftStartTime: timestamp,
        shiftEndTime: null,
        timestamp,
    };

    const selections = employee.counter_selections || [];
    selections.push(newShift);

    await doc.ref.update({
        counter_selections: selections,
        shiftEnded: false
    });

    return res.json({ success: true, message: 'Shift started successfully.' });
});

// Real-time Session Status Check for Employee Guard
app.get('/api/attendance/session-status/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const today = new Date().toISOString().split('T')[0];
        const snapshot = await db.daily_sessions()
            .where('employeeId', '==', employeeId)
            .where('date', '==', today)
            .get();

        const sessions = snapshot.docs.map(d => d.data());
        // Sort to get late session state
        sessions.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));
        
        const latestStatus = sessions.length > 0 ? sessions[0].status : 'idle';
        res.json({
            success: true,
            status: latestStatus === 'active' ? 'active' : 'inactive'
        });
    } catch (e) {
        res.status(500).json({ success: false, message: 'Status check failed' });
    }
});

// Handle extra data submission
app.post('/api/extra', async (req, res) => {
    const extraData = req.body;
    const employeeId = extraData.employeeId;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    const extra = employee.extra || [];
    extra.push({
        id: shortid.generate(),
        itemName: extraData.itemName,
        billNumber: extraData.billNumber,
        extraAmount: extraData.extraAmount,
        modeOfPay: extraData.modeOfPay,
        timestamp: new Date().toISOString()
    });

    await doc.ref.update({ extra });
    res.json({ success: true, message: 'Extra data saved successfully.' });
});

// Get extra data for an employee
app.get('/api/extra', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.extra || [];
            data = data.filter(item => item && typeof item === 'object' && item.timestamp);

            if (date) {
                data = data.filter(item => item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }

            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/extra:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle delivery data submission
app.post('/api/delivery', async (req, res) => {
    const deliveryData = req.body;
    const employeeId = deliveryData.employeeId;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    const delivery = employee.delivery || [];
    delivery.push({
        id: shortid.generate(),
        billNumber: deliveryData.billNumber,
        amount: deliveryData.amount,
        extraAmount: deliveryData.extraAmount,
        totalAmount: deliveryData.totalAmount,
        modeOfPay: deliveryData.modeOfPay,
        delivered: false,
        timestamp: new Date().toISOString()
    });

    await doc.ref.update({ delivery });
    res.json({ success: true, message: 'Delivery data saved successfully.' });
});

// Get delivery data for an employee
app.get('/api/delivery', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.delivery || [];

            if (date) {
                data = data.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp && item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }
            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/delivery:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle bill_paid data submission
app.post('/api/bill_paid', async (req, res) => {
    const billPaidData = req.body;
    const employeeId = billPaidData.employeeId;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    const bill_paid = employee.bill_paid || [];
    bill_paid.push({
        id: shortid.generate(),
        vendorSupplier: billPaidData.vendorSupplier,
        amountPaid: billPaidData.amountPaid,
        timestamp: new Date().toISOString()
    });

    await doc.ref.update({ bill_paid });
    res.json({ success: true, message: 'Bill paid data saved successfully.' });
});

// Get bill_paid data for an employee
app.get('/api/bill_paid', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId) return res.json([]);

        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.bill_paid || [];

            if (date) {
                data = data.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp && item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }
            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/bill_paid:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle issue data submission
app.post('/api/issue', async (req, res) => {
    const issueData = req.body;
    const employeeId = issueData.employeeId;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    const issue = employee.issue || [];
    issue.push({
        id: shortid.generate(),
        billNumber: issueData.billNumber,
        issueDescription: issueData.issueDescription,
        timestamp: new Date().toISOString()
    });

    await doc.ref.update({ issue });
    res.json({ success: true, message: 'Issue data saved successfully.' });
});

// Get issue data for an employee
app.get('/api/issue', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.issue || [];

            if (date) {
                data = data.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp && item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }
            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/issue:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Handle retail_credit data submission
app.post('/api/retail_credit', async (req, res) => {
    const retailCreditData = req.body;
    const employeeId = retailCreditData.employeeId;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();

    const retail_credit = employee.retail_credit || [];
    retail_credit.push({
        id: shortid.generate(),
        phoneNumber: retailCreditData.phoneNumber,
        amount: retailCreditData.amount,
        modeOfPay: retailCreditData.modeOfPay,
        timestamp: new Date().toISOString()
    });

    await doc.ref.update({ retail_credit });
    res.json({ success: true, message: 'Retail credit data saved successfully.' });
});

// Get retail_credit data for an employee
app.get('/api/retail_credit', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.retail_credit || [];

            if (date) {
                data = data.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp && item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }
            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/retail_credit:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Activity History Endpoint
app.get('/api/history', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ message: 'Employee not found' });
        const employee = doc.data();

        let history = [];
        const addHistory = (arr, type) => {
            if (arr && Array.isArray(arr)) {
                arr.forEach(item => {
                    if (item && item.timestamp) {
                        history.push({ ...item, type: type, action: item.action || 'add' });
                    }
                });
            }
        };

        addHistory(employee.extra, 'extra');
        addHistory(employee.delivery, 'delivery');
        addHistory(employee.bill_paid, 'bill_paid');
        addHistory(employee.issue, 'issue');
        addHistory(employee.retail_credit, 'retail_credit');

        if (employee.audit_history && Array.isArray(employee.audit_history)) {
            employee.audit_history.forEach(log => history.push(log));
        }

        if (date) history = history.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
        else if (month) history = history.filter(item => item.timestamp && item.timestamp.startsWith(month));
        else if (startDate && endDate) history = history.filter(item => {
            if (!item.timestamp) return false;
            const ts = item.timestamp.split('T')[0];
            return ts >= startDate && ts <= endDate;
        });

        if (shiftStartTime) {
            const start = new Date(shiftStartTime);
            if (!isNaN(start.getTime())) {
                history = history.filter(item => new Date(item.timestamp) >= start);
                if (shiftEndTime) {
                    const end = new Date(shiftEndTime);
                    if (!isNaN(end.getTime())) {
                        history = history.filter(item => new Date(item.timestamp) <= end);
                    }
                }
            }
        }

        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(history);
    } catch (error) {
        console.error('Error in /api/history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Get Audit History specifically
app.get('/api/audit_history', async (req, res) => {
    try {
        const { employeeId, date } = req.query;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ message: 'Employee not found' });
        const employee = doc.data();

        let audit = employee.audit_history || [];
        if (date) {
            audit = audit.filter(item => item.timestamp && item.timestamp.startsWith(date));
        }
        audit.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        res.json(audit);
    } catch (error) {
        console.error('Error in /api/audit_history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Delete audit log permanently
app.delete('/api/audit_history/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const snapshot = await db.employees().get();
        for (const empDoc of snapshot.docs) {
            let emp = empDoc.data();
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const audit = [...emp.audit_history];
                    audit.splice(histIndex, 1);
                    await empDoc.ref.update({ audit_history: audit });
                    return res.json({ success: true });
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch (err) { 
        console.error(err); 
        res.status(500).json({ message: 'Error deleting permanently' }); 
    }
});

// Edit audit log reason / details
app.post('/api/audit_history/edit/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const { reason } = req.body;
        const snapshot = await db.employees().get();
        for (const empDoc of snapshot.docs) {
            let emp = empDoc.data();
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const audit = [...emp.audit_history];
                    audit[histIndex].reason = reason || 'Updated by Admin';
                    await empDoc.ref.update({ audit_history: audit });
                    return res.json({ success: true });
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch (err) { 
        console.error(err); 
        res.status(500).json({ message: 'Error editing audit log' }); 
    }
});


// Formalize shift termination
app.post('/api/end-shift', async (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) return res.status(400).json({ success: false, message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Employee not found' });
        const employee = doc.data();

        if (employee.counter_selections && employee.counter_selections.length > 0) {
            const selections = [...employee.counter_selections];
            const activeShift = selections[selections.length - 1];
            if (!activeShift.shiftEndTime) {
                const endShiftTime = new Date().toISOString();
                activeShift.shiftEndTime = endShiftTime;
                
                await doc.ref.update({
                    counter_selections: selections,
                    shiftEnded: true
                });

                // Generate and save report to cloud
                const employeeName = employee.name || 'Employee';
                const shiftStartTime = activeShift.shiftStartTime;
                const shiftId = activeShift.shiftId || `manual_${Date.now()}`;
                
                await generateAndSaveESR(employeeId, employeeName, shiftStartTime, endShiftTime, shiftId);

                return res.json({ success: true, message: 'Shift strictly terminated and report generated.' });
            }
        }
        res.json({ success: true, message: 'No active shift to terminate.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});


/**
 * Endpoint: Master Reset - Clear All Attendance Data
 * NOTE: This must be ABOVE generalize delete route to avoid route matching conflicts.
 */
app.delete('/api/attendance/reset', verifyAdmin, async (req, res) => {
    const { password, targets } = req.body;

    if (password !== 'admin12nammamart') {
        return res.status(401).json({ success: false, message: 'Invalid master password verification.' });
    }

    if (!targets || !Array.isArray(targets) || targets.length === 0) {
        return res.status(400).json({ success: false, message: 'No data categories selected for reset.' });
    }

    try {
        const stats = {};

        // 1. Standalone Collections Reset (Attendance, Sessions, Swaps)
        const collectionTargets = {
            'attendance': [db.attendance_logs(), db.daily_sessions()],
            'leave_swaps': [db.leave_swaps()]
        };

        // 2. Employee-Embedded Data Reset (Extra, Delivery, Bill Paid, Issue, Credit)
        const employeeTargets = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];

        // Helper: Safe batch delete for collections
        const deleteBatch = async (colRef) => {
            const snapshot = await colRef.limit(500).get();
            if (snapshot.size === 0) return 0;
            const batch = firestore.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            return snapshot.size;
        };

        // Execution: Collections
        for (const target of targets) {
            if (collectionTargets[target]) {
                const results = await Promise.all(collectionTargets[target].map(col => deleteBatch(col)));
                stats[target] = results.reduce((a, b) => a + b, 0);
            }
        }

        // Execution: Employee Embedded Fields
        const activeEmpTargets = targets.filter(t => employeeTargets.includes(t));
        if (activeEmpTargets.length > 0) {
            console.log(`🧹 Cleaning Employee Fields: ${activeEmpTargets.join(', ')}`);
            const empSnapshot = await db.employees().get();
            const batch = firestore.batch();
            let count = 0;

            empSnapshot.docs.forEach(doc => {
                const update = {};
                activeEmpTargets.forEach(field => {
                    update[field] = []; // Clear the array
                });
                batch.update(doc.ref, update);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                activeEmpTargets.forEach(field => {
                    stats[field] = count; // We cleared this field for all employees
                });
            }
        }

        console.log('✅ Smart Reset Complete. Stats:', stats);
        res.json({ success: true, stats });
    } catch (e) {
        console.error('Smart Reset Failed:', e);
        res.status(500).json({ success: false, message: 'Server error during batch purge.' });
    }
});

// Generalized Update Record Route
app.put('/api/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const validTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid record type' });

        const data = req.body;
        const employeeId = data.employeeId;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ message: 'Employee not found' });
        const employee = doc.data();
        if (!employee[type]) return res.status(404).json({ message: 'Record array not found' });

        const records = [...employee[type]];
        const index = records.findIndex(item => item && item.id === id);
        if (index === -1) return res.status(404).json({ message: 'Record not found' });

        const original = records[index];
        const updated = { ...original, ...data, timestamp: original.timestamp, id: original.id };
        records[index] = updated;

        const audit_history = employee.audit_history || [];
        audit_history.push({
            id: shortid.generate(),
            action: 'edit',
            type: type,
            reason: data.editReason || 'User edited record via UI',
            timestamp: new Date().toISOString(),
            originalRecord: original,
            newRecord: Object.keys(data).reduce((acc, k) => { if (original[k] !== data[k] && typeof original[k] !== 'undefined') acc[k] = data[k]; return acc; }, {})
        });

        await doc.ref.update({ [type]: records, audit_history });
        res.json({ success: true });
    } catch (err) {
        console.error('PUT Error:', err);
        res.status(500).json({ message: 'System error' });
    }
});

// Generalized Delete Record Route
app.delete('/api/:type/:id', async (req, res) => {
    try {
        const { type, id } = req.params;
        const { employeeId, reason } = req.query;
        const validTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];

        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid record type' });
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ message: 'Employee not found' });
        const employee = doc.data();
        if (!employee[type]) return res.status(404).json({ message: 'Record array not found' });

        const records = [...employee[type]];
        const index = records.findIndex(item => item && item.id === id);
        if (index === -1) return res.status(404).json({ message: 'Record not found' });

        const original = records[index];
        records.splice(index, 1);

        const audit_history = employee.audit_history || [];
        audit_history.push({
            id: shortid.generate(),
            action: 'delete',
            type: type,
            reason: reason || 'User deleted record via UI',
            timestamp: new Date().toISOString(),
            originalRecord: original
        });

        await doc.ref.update({ [type]: records, audit_history });
        res.json({ success: true });
    } catch (err) {
        console.error('DELETE Error:', err);
        res.status(500).json({ message: 'System error' });
    }
});

// Restore deleted item
app.post('/api/restore/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const snapshot = await db.employees().get();
        for (const empDoc of snapshot.docs) {
            let emp = empDoc.data();
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const log = emp.audit_history[histIndex];
                    if (log.action === 'delete') {
                        const records = emp[log.type] || [];
                        records.push(log.originalRecord);
                        const audit = [...emp.audit_history];
                        audit.splice(histIndex, 1);
                        await empDoc.ref.update({ [log.type]: records, audit_history: audit });
                        return res.json({ success: true });
                    }
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Error restoring' }); }
});

// Revert edit item
app.post('/api/revert-edit/:historyId', async (req, res) => {
    try {
        const { historyId } = req.params;
        const snapshot = await db.employees().get();
        for (const empDoc of snapshot.docs) {
            let emp = empDoc.data();
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const log = emp.audit_history[histIndex];
                    if (log.action === 'edit') {
                        const records = emp[log.type] || [];
                        const mainIndex = records.findIndex(r => r && r.id === log.originalRecord.id);
                        if (mainIndex !== -1) {
                            records[mainIndex] = log.originalRecord;
                        } else {
                            records.push(log.originalRecord);
                        }
                        const audit = [...emp.audit_history];
                        audit.splice(histIndex, 1);
                        await empDoc.ref.update({ [log.type]: records, audit_history: audit });
                        return res.json({ success: true });
                    }
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch (err) { console.error(err); res.status(500).json({ message: 'Error reverting' }); }
});

// Get counter_data for an employee
app.get('/api/counter_data', async (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            const employee = doc.data();
            let data = employee.counter_selections || [];

            if (date) {
                data = data.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
            } else if (month) {
                data = data.filter(item => item.timestamp && item.timestamp.startsWith(month));
            } else if (startDate && endDate) {
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const ts = item.timestamp.split('T')[0];
                    return ts >= startDate && ts <= endDate;
                });
            }
            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    data = data.filter(item => {
                        const ts = new Date(item.timestamp);
                        return ts >= start;
                    });
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime())) {
                            data = data.filter(item => {
                                const ts = new Date(item.timestamp);
                                return ts <= end;
                            });
                        }
                    }
                }
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/counter_data:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});



/**
 * Verify admin approval OTP for employee relogin
 * Additionally, set employee startShiftTime and reset shiftEnded flag
 */
app.post('/api/verify-admin-approval-otp', async (req, res) => {
    const { otp, employeeId } = req.body;
    if (isEmpty(otp) || isEmpty(employeeId)) {
        return res.status(400).json({ success: false, message: 'OTP and Employee ID are required.' });
    }

    if (!adminApprovalOtp.otp || Date.now() > adminApprovalOtp.expiresAt || adminApprovalOtp.employeeId !== employeeId) {
        adminApprovalOtp.otp = null;
        adminApprovalOtp.expiresAt = 0;
        adminApprovalOtp.employeeId = null;
        return res.status(400).json({ success: false, message: 'OTP expired or not requested.' });
    }

    if (String(otp).trim() !== String(adminApprovalOtp.otp)) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    adminApprovalOtp.otp = null;
    adminApprovalOtp.expiresAt = 0;
    adminApprovalOtp.employeeId = null;

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Set shiftEnded to false and record startShiftTime to current time
    await doc.ref.update({
        shiftEnded: false,
        startShiftTime: new Date().toISOString()
    });

    return res.json({ success: true, message: 'OTP verified. New shift started.', redirectUrl: '/counter_selection.html', employeeId });
});




// Verify admin password for start shift and record startShiftTime
// Verify admin password for start shift and record startShiftTime
app.post('/api/start-shift', async (req, res) => {
    const { password } = req.body;
    const settingsDoc = await db.settings().doc('config').get();
    const adminPassword = settingsDoc.exists ? settingsDoc.data().adminPassword : 'admin12nammamart';

    if (password === adminPassword) {
        const startShiftTime = new Date().toISOString();
        await db.broadcast().update({
            startShiftTime: startShiftTime
        });
        res.json({ success: true, startShiftTime });
    } else {
        res.json({ success: false });
    }
});

// Get today's date from server
app.get('/api/today-date', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    res.json({ date: today });
});





// Update data entry
app.put('/api/:type/:id', async (req, res) => {
    let { type, id } = req.params;
    if (type === 'counter_data') {
        type = 'counter_selections';
    }
    const updateData = req.body;
    const employeeId = updateData.employeeId;

    // Require a non-empty edit reason for audit purposes
    if (!updateData.editReason || String(updateData.editReason).trim() === '') {
        return res.status(400).json({ success: false, message: 'editReason is required when editing an entry.' });
    }

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ message: 'Employee not found' });
    }
    const employee = doc.data();

    const dataArray = employee[type];
    if (!dataArray) {
        return res.status(404).json({ message: 'Data type not found' });
    }

    const index = dataArray.findIndex(item => item.id === id);
    if (index === -1) {
        return res.status(404).json({ message: 'Data entry not found' });
    }

    // Store original data in history
    if (!employee.history) {
        employee.history = [];
    }
    const originalData = { ...dataArray[index] };
    employee.history.push({
        id: shortid.generate(),
        timestamp: new Date().toISOString(),
        action: 'edit',
        type: type,
        itemId: id,
        reason: updateData.editReason || '',
        originalData: originalData,
        modifiedData: { ...dataArray[index], ...updateData }
    });

    // Remove editReason from updateData
    delete updateData.editReason;

    dataArray[index] = { ...dataArray[index], ...updateData };
    await doc.ref.update({ [type]: dataArray, history: employee.history || [] });

    res.json({ success: true, message: 'Data updated successfully.' });
});

// --- RE-RESTORED REPORTING APIS ---

/**
 * Attendance Grid Report Data (Restored)
 * Aggregates monthly or daily data into a matrix structure.
 */
app.get('/api/reports/attendance-grid', verifyAdmin, async (req, res) => {
    try {
        const monthStr = req.query.month; // Expected YYYY-MM
        const dayStr = req.query.day; // Expected YYYY-MM-DD

        let startDate, endDate;
        if (dayStr) {
            startDate = new Date(dayStr);
            endDate = new Date(dayStr);
        } else if (monthStr) {
            const [year, month] = monthStr.split('-').map(Number);
            startDate = new Date(year, month - 1, 1);
            endDate = new Date(year, month, 0); // Last day of month
        } else {
            return res.status(400).json({ success: false, message: 'Month or Day parameter is required.' });
        }

        const year = startDate.getFullYear();
        const month = startDate.getMonth() + 1;
        const todayStr = new Date().toISOString().split('T')[0];

        // 1. Get all employees
        const empSnap = await db.employees().get();
        const employees = empSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // 2. Get all daily_sessions
        const sessionSnap = await db.daily_sessions().get();
        const rawSessions = sessionSnap.docs.map(doc => doc.data());

        // 3. Get all leaves
        const leaveSnap = await db.leave_swaps().get();
        const rawLeaves = leaveSnap.docs.map(doc => doc.data());

        // Prepare Headers
        const dateHeaders = [];
        const numDays = dayStr ? 1 : endDate.getDate();
        const startDay = dayStr ? startDate.getDate() : 1;

        for (let d = startDay; d <= startDay + numDays - 1; d++) {
            const dateObj = new Date(year, month - 1, d);
            const dateIso = dateObj.toISOString().split('T')[0];
            const dayName = dateObj.toLocaleString('en-us', { weekday: 'long' });
            dateHeaders.push({
                day: d,
                label: `${d}-${dateObj.toLocaleString('en-us', { month: 'short' })}-${year}`,
                weekday: dayName,
                iso: dateIso
            });
        }

        const grid = [];
        for (const emp of employees) {
            const empData = { name: emp.name, id: emp.id, daily: {} };

            // Expected Minutes Logic
            let expectedMins = 480;
            if (emp.startTime && emp.endTime) {
                const [h1, m1] = emp.startTime.split(':').map(Number);
                const [h2, m2] = emp.endTime.split(':').map(Number);
                expectedMins = (h2 * 60 + m2) - (h1 * 60 + m1);
                if (expectedMins < 0) expectedMins += 1440;
            }

            for (const header of dateHeaders) {
                const dateKey = header.iso;
                const sessions = rawSessions.filter(s => s.employeeId == emp.id && s.date === dateKey);
                const leaves = rawLeaves.filter(l => l.employeeId == emp.id && l.date === dateKey && l.status === 'approved');

                let status = 'A';
                let variance = 0;
                let colorClass = 'grid-a';

                const dayLower = header.weekday.toLowerCase();
                const empWeekOff = (emp.weekOff || 'sunday').toLowerCase();

                if (dayLower === empWeekOff) {
                    status = 'WO';
                    colorClass = 'grid-wo';
                    variance = 0;
                } else if (leaves.length > 0) {
                    status = 'L';
                    colorClass = 'grid-l';
                    variance = 0;
                } else if (sessions.length > 0) {
                    const s = sessions[0];
                    if (dateKey === todayStr && !s.checkOut) {
                        status = 'Pending';
                        colorClass = 'grid-pending';
                        variance = 0;
                    } else {
                        status = 'P';
                        colorClass = 'grid-p';
                        const actualMins = (s.totalWorkDuration || 0) / 60000;
                        variance = ((actualMins - expectedMins) / 60).toFixed(1);
                    }
                } else if (dateKey > todayStr) {
                    status = '-';
                    colorClass = 'grid-empty';
                    variance = 0;
                } else {
                    // Past date, no session, no leave, no week-off => ABSENT
                    status = 'A';
                    colorClass = 'grid-a';
                    variance = (-expectedMins / 60).toFixed(1);
                }

                empData.daily[dateKey] = { status, variance, colorClass };
            }
            grid.push(empData);
        }

        res.json({ success: true, headers: dateHeaders, grid });
    } catch (err) {
        console.error('Grid Report Error:', err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- DIAGNOSTICS & SUMMARY APIS ---

/**
 * Internal Helper: Get Today's Report Summary (Aggregate Sales/Collection)
 */
async function internalGetReportSummary(date) {
    const snapshot = await db.employees().get();
    let totals = { upiPinelab: 0, cardPinelab: 0, upiPaytm: 0, cardPaytm: 0, cash: 0, retailCredit: 0 };

    snapshot.forEach(doc => {
        const emp = doc.data();
        const processGroup = (arr, modeField, amountField) => {
            if (arr && Array.isArray(arr)) {
                arr.forEach(item => {
                    if (item && item.timestamp && item.timestamp.split('T')[0] === date) {
                        const mode = (item[modeField] || '').toLowerCase();
                        const amount = parseFloat(item[amountField]) || 0;
                        if (mode.includes('upi pinelab')) totals.upiPinelab += amount;
                        else if (mode.includes('card pinelab')) totals.cardPinelab += amount;
                        else if (mode.includes('upi paytm')) totals.upiPaytm += amount;
                        else if (mode.includes('card paytm')) totals.cardPaytm += amount;
                        else if (mode.includes('cash')) totals.cash += amount;
                    }
                });
            }
        };
        processGroup(emp.extra, 'modeOfPay', 'extraAmount');
        processGroup(emp.bill_paid, 'modeOfPayment', 'amount');
        if (emp.retail_credit && Array.isArray(emp.retail_credit)) {
            emp.retail_credit.forEach(item => {
                if (item.timestamp && item.timestamp.split('T')[0] === date) {
                    totals.retailCredit += (parseFloat(item.amount) || 0);
                }
            });
        }
    });
    return totals;
}

app.get('/api/todays-report-summary', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'Date is required.' });
        const totals = await internalGetReportSummary(date);
        res.json(totals);
    } catch (error) {
        console.error('Error in /api/todays-report-summary:', error);
        res.status(500).json({ success: false });
    }
});

/**
 * Internal Helper: Get Data Activity Summary (Audit Counts)
 */
async function internalGetActivitySummary(employeeId, date, shiftStartTime, shiftEndTime) {
    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) throw new Error('Employee not found');
    const emp = doc.data();

    let stats = { edited: 0, deleted: 0, inputed: 0 };

    const isInRange = (ts) => {
        if (!ts) return false;
        const itemTime = new Date(ts);
        if (shiftStartTime) {
            const start = new Date(shiftStartTime);
            if (itemTime < start) return false;
        }
        if (shiftEndTime) {
            const end = new Date(shiftEndTime);
            if (itemTime > end) return false;
        }
        if (!shiftStartTime && !shiftEndTime) {
            return ts.split('T')[0] === date;
        }
        return true;
    };

    const check = (arr) => {
        if (arr && Array.isArray(arr)) {
            arr.forEach(item => {
                if (item && item.timestamp && isInRange(item.timestamp)) stats.inputed++;
            });
        }
    };

    check(emp.extra); check(emp.delivery); check(emp.bill_paid); check(emp.issue); check(emp.retail_credit);

    if (emp.history && Array.isArray(emp.history)) {
        emp.history.forEach(log => {
            if (log.timestamp && isInRange(log.timestamp)) {
                if (log.action === 'edit') stats.edited++;
                if (log.action === 'delete') stats.deleted++;
            }
        });
    }
    return stats;
}

app.get('/api/data-activity-summary', async (req, res) => {
    try {
        const { employeeId, date, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId || !date) return res.status(400).json({ success: false });

        const stats = await internalGetActivitySummary(employeeId, date, shiftStartTime, shiftEndTime);
        res.json({ success: true, ...stats });
    } catch (error) { 
        console.error('Error in /api/data-activity-summary:', error);
        res.status(500).json({ success: false }); 
    }
});

// --- END OF CORE ROUTING ---
// Get current settings
app.get('/api/settings', async (req, res) => {
    const doc = await db.settings().doc('config').get();
    const settings = doc.exists ? doc.data() : {};
    const publicSettings = { ...settings };
    delete publicSettings.adminPassword;
    res.json({ success: true, data: publicSettings });
});

// Update settings
app.post('/api/settings', verifyAdmin, async (req, res) => {
    const newSettings = req.body;
    delete newSettings.adminPassword;
    await db.settings().doc('config').set(newSettings, { merge: true });
    res.json({ success: true, message: 'Settings updated successfully.' });
});

// Change admin password
app.post('/api/settings/change-password', verifyAdmin, async (req, res) => {
    const { currentPassword, newEmail, newPhone } = req.body;
    const doc = await db.settings().doc('config').get();

    // Check current password (must be the enforced one)
    if (currentPassword !== 'admin12nammamart') {
        return res.status(401).json({ success: false, message: 'Verification failed. Incorrect current password.' });
    }

    const updates = {};
    if (newEmail !== undefined) updates.adminEmail = newEmail;
    if (newPhone !== undefined) updates.adminPhone = newPhone;

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No updates provided.' });
    }

    await db.settings().doc('config').set(updates, { merge: true });
    res.json({ success: true, message: 'Admin profile updated successfully.' });
});

// Request Admin Password Reset OTP
app.post('/api/request-reset-otp', async (req, res) => {
    const doc = await db.settings().doc('config').get();
    const settings = doc.exists ? doc.data() : {};
    const adminEmail = settings.adminEmail;

    if (!adminEmail) {
        return res.status(400).json({
            success: false,
            message: 'Admin recovery email is not configured. Please contact the developer directly for a secure reset.'
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // STORE OTP IN FIRESTORE (Persists across Vercel instances)
    await db.settings().doc('reset_otp_store').set({
        otp,
        expiresAt: Date.now() + 10 * 60 * 1000,
        adminEmail
    });

    const mailOptions = {
        from: emailConfig.from,
        to: adminEmail,
        subject: '🔐 Namma Mart - Admin Password Reset OTP',
        text: `Your Identity Verification OTP is: ${otp}\n\nThis code is valid for 10 minutes. If you did not request this, please secure your account immediately.`
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);
        res.json({ success: true, message: 'OTP sent to your registered email.' });
    } catch (err) {
        console.error('Failed to send reset OTP:', err);
        res.status(500).json({ success: false, message: 'Failed to send recovery email. Please try again later.' });
    }
});

// Complete Admin Password Reset with OTP
app.post('/api/reset-admin-password', async (req, res) => {
    const { otp, newPassword, confirmPassword } = req.body;

    if (!otp || !newPassword || !confirmPassword) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (newPassword !== confirmPassword) {
        return res.status(400).json({ success: false, message: 'Passwords do not match.' });
    }

    if (newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    // VERIFY OTP FROM FIRESTORE
    const otpDoc = await db.settings().doc('reset_otp_store').get();
    if (!otpDoc.exists) {
        return res.status(401).json({ success: false, message: 'No active reset request found. Please request a new code.' });
    }

    const storedData = otpDoc.data();
    if (!storedData.otp || storedData.otp !== otp.trim()) {
        return res.status(401).json({ success: false, message: 'Invalid or incorrect OTP.' });
    }

    if (Date.now() > storedData.expiresAt) {
        return res.status(401).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    try {
        // Update Firestore
        await db.settings().doc('config').update({ adminPassword: newPassword });

        // Clear OTP from Firestore
        await db.settings().doc('reset_otp_store').delete();

        res.json({ success: true, message: 'Password reset successful! You can now login with your new password.' });
    } catch (err) {
        console.error('Failed to reset admin password:', err);
        res.status(500).json({ success: false, message: 'Database error. Please contact developer.' });
    }
});

// Get system status (uptime, storage)
app.get('/api/system/status', (req, res) => {
    const fs = require('fs');
    const uptimeSeconds = process.uptime();
    res.json({
        success: true,
        data: {
            uptimeSeconds: Math.floor(uptimeSeconds),
            memory: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2) + ' MB'
        }
    });
});

// Download system health report (Now triggers Cloud Sync)
app.get('/api/system/backup', apiLimiter, verifyAdmin, async (req, res) => {
    // Security: Only allow Admin Session OR Vercel Cron Trigger
    const isCron = req.headers['x-vercel-cron'] === '1';
    const isAdmin = req.session && req.session.admin;

    if (!isCron && !isAdmin) {
        console.warn('⚠️ Unauthorized backup attempt blocked.');
        return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    if (isCron) console.log('⏰ Triggering automated Cloud Backup...');

    const result = await syncToBackupRepo();
    res.json(result);
});

// Reset settings to defaults
app.post('/api/settings/reset', verifyAdmin, (req, res) => {
    // Reset functionality moved to Firestore settings init if needed
    res.json({ success: true, message: 'Settings reset functionality is currently disabled for security.' });
});
// --- FACE ATTENDANCE NATIVE RECONSTRUCTION V3 ---


/**
 * Endpoint: Register Face Descriptor
 * Saves high-precision face model data directly to the employee record.
 */
app.post('/api/employees/:id/face', async (req, res) => {
    const { id } = req.params;
    const { descriptor } = req.body;

    if (!descriptor) return res.status(400).json({ success: false, message: 'No face descriptor provided.' });

    const doc = await db.employees().doc(id).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Employee not found.' });
    const employee = doc.data();

    await doc.ref.update({ faceDescriptor: descriptor });
    res.json({ success: true, message: 'Face registered successfully!' });
});

/**
 * Endpoint: Get Employee Current State
 */
app.get('/api/attendance/state/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const dateStr = new Date().toISOString().split('T')[0];

        // 1. Check if employee is active
        const empDoc = await db.employees().doc(employeeId).get();
        if (!empDoc.exists) return res.status(404).json({ success: false, message: 'Employee not found.' });
        if (empDoc.data().isActive === false) {
            return res.status(403).json({ success: false, message: 'You are not allowed by admin', code: 'USER_DEACTIVATED' });
        }

        // 2. Fetch today's sessions and sort in-memory (Avoiding Composite Index requirement)
        const snapshot = await db.daily_sessions()
            .where('employeeId', '==', employeeId)
            .where('date', '==', dateStr)
            .get();

        const sessions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Sort by checkIn descending to get the latest session
        sessions.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

        const lastSession = sessions.length > 0 ? sessions[0] : null;
        let currentState = 'IDLE';
        let sessionId = null;

        if (lastSession && !lastSession.checkOut) {
            currentState = lastSession.onBreak ? 'ON_BREAK' : 'WORKING';
            sessionId = lastSession.id;
        }

        res.json({ success: true, currentState, sessionId });
    } catch (err) {
        console.error('Error in /api/attendance/state:', err);
        res.status(500).json({ success: false, message: 'Server error fetching state' });
    }
});

/**
 * Endpoint: Attendance Scan (Kiosk Mode)
 */
const processingScans = new Set();

app.post('/api/attendance/scan', async (req, res) => {
    const employeeId = req.body.employeeId;
    
    // Server-side lock to completely prevent rapid double-click race conditions
    if (processingScans.has(employeeId)) {
        return res.status(429).json({ success: false, message: 'Processing your previous scan, please wait a moment.' });
    }
    processingScans.add(employeeId);

    try {
        const { actionType } = req.body;
        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Identity not recognized.' });
        const emp = doc.data();
        if (emp.isActive === false) {
            return res.status(403).json({ success: false, message: 'You are not allowed by admin', code: 'USER_DEACTIVATED' });
        }


        const processAction = async (empId, empName, action) => {
            const now = new Date();
            const dateStr = now.toISOString().split('T')[0];
            const timestamp = now.toISOString();

            // Fetch sessions and sort in-memory (Avoiding Composite Index requirement)
            const snapshot = await db.daily_sessions()
                .where('employeeId', '==', empId)
                .where('date', '==', dateStr)
                .get();

            const sessions = snapshot.docs.map(doc => ({ ref: doc.ref, ...doc.data() }));
            sessions.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn));

            let session = sessions.length > 0 ? sessions[0] : null;

            let currentState = 'IDLE';
            if (session && !session.checkOut) currentState = session.onBreak ? 'ON_BREAK' : 'WORKING';

            if (action === 'in') {
                if (currentState !== 'IDLE') return { success: false, message: 'Already checked in.' };

                // --- DYNAMIC SHIFT DETECTION ---
                const empStart = emp['start-time'];
                const empEnd = emp['end-time'];

                if (!empStart || !empEnd) {
                    await logAttendance(empId, empName, 'BLOCKED_NO_SHIFT', timestamp);
                    return { 
                        success: false, 
                        message: 'Access Denied: Shift timings not configured. Please contact the administrator.', 
                        code: 'SHIFT_NOT_SET' 
                    };
                }

                let earlyExtraMinutes = 0;
                let lateMinutes = 0;
                let approvalStatus = 'approved';
                let requiresApproval = null;
                if (empStart) {
                    const [h, m] = empStart.split(':').map(Number);
                    const shiftStart = new Date(now);
                    shiftStart.setHours(h, m, 0, 0);

                    if (now < shiftStart) {
                        earlyExtraMinutes = Math.floor((shiftStart - now) / 60000);
                        approvalStatus = 'pending_approval';
                        requiresApproval = 'EARLY_ARRIVAL';
                    } else if (now > shiftStart) {
                        lateMinutes = Math.floor((now - shiftStart) / 60000);
                        // If it's more than 1 minute late, mark for review
                        if (lateMinutes > 0) {
                            approvalStatus = 'pending_approval';
                            requiresApproval = 'LATE_ARRIVAL';
                        }
                    }
                }

                const newSession = {
                    employeeId: empId,
                    employeeName: empName,
                    date: dateStr,
                    checkIn: timestamp,
                    checkOut: null,
                    onBreak: false,
                    breakHistory: [],
                    totalBreakMinutes: 0,
                    status: 'active',
                    earlyExtraMinutes,
                    lateMinutes,
                    overtimeMinutes: 0,
                    approvedExtraMinutes: 0,
                    approvalStatus,
                    requiresApproval,
                    actualWorkMinutes: 0, // Will be updated on checkout
                    comment: req.body.comment || ''
                };
                await db.daily_sessions().add(newSession);
                await logAttendance(empId, empName, requiresApproval || 'CLOCK_IN', timestamp);
                const isLate = requiresApproval === 'LATE_ARRIVAL';
                return {
                    success: true,
                    message: isLate ? `Welcome ${empName}. Tagged as Late Arrival (Pending Approval).` : `Welcome ${empName}!`,
                    action: 'IN',
                    pending: isLate
                };
            }

            if (currentState === 'IDLE') return { success: false, message: 'No active session.' };

            if (action === 'break_start') {
                if (currentState !== 'WORKING') return { success: false, message: 'Not working.' };
                await session.ref.update({ onBreak: true, status: 'on_break', breakHistory: admin.firestore.FieldValue.arrayUnion({ start: timestamp, end: null }) });
                await logAttendance(empId, empName, 'BREAK_START', timestamp);
                return { success: true, message: 'Break started.', action: 'BREAK_START' };
            }

            if (action === 'break_end') {
                if (currentState !== 'ON_BREAK') return { success: false, message: 'Not on break.' };
                const history = [...session.breakHistory];
                const lastBreak = history[history.length - 1];
                if (lastBreak && !lastBreak.end) {
                    lastBreak.end = timestamp;
                    const diff = (new Date(timestamp) - new Date(lastBreak.start)) / 60000;
                    await session.ref.update({ onBreak: false, status: 'active', breakHistory: history, totalBreakMinutes: admin.firestore.FieldValue.increment(Math.floor(diff)) });
                }
                await logAttendance(empId, empName, 'BREAK_END', timestamp);
                return { success: true, message: 'Break ended.', action: 'BREAK_END' };
            }

            if (action === 'out') {
                // --- DYNAMIC SHIFT DETECTION (OVERTIME) ---
                let overtimeMinutes = 0;
                let approvalStatus = session.approvalStatus || 'approved';
                let requiresApproval = session.requiresApproval || null;

                const empEnd = emp['end-time']; // e.g. "22:00"
                if (empEnd) {
                    const [h, m] = empEnd.split(':').map(Number);
                    const shiftEnd = new Date(now);
                    shiftEnd.setHours(h, m, 0, 0);

                    if (now > shiftEnd) {
                        overtimeMinutes = Math.floor((now - shiftEnd) / 60000);
                        approvalStatus = 'pending_approval';
                        requiresApproval = 'OVERTIME';
                    }
                }

                const actualWorkMs = (new Date(timestamp) - new Date(session.checkIn)) - ((session.totalBreakMinutes || 0) * 60000);
                const actualWorkMinutes = Math.floor(actualWorkMs / 60000);

                await session.ref.update({
                    checkOut: timestamp,
                    status: 'completed',
                    onBreak: false,
                    overtimeMinutes,
                    actualWorkMinutes,
                    approvalStatus,
                    requiresApproval
                });

                await logAttendance(empId, empName, requiresApproval ? `CLOCK_OUT_${requiresApproval}` : 'CLOCK_OUT', timestamp);
                return {
                    success: true,
                    message: requiresApproval ? `Goodbye! Punch tagged as ${requiresApproval} (Pending Approval).` : 'Goodbye!',
                    action: 'OUT',
                    pending: !!requiresApproval
                };
            }
            return { success: false, message: 'Invalid action.' };
        };

        if (Array.isArray(actionType)) {
            let result = null;
            for (const action of actionType) {
                result = await processAction(employeeId, emp.name, action);
                if (!result.success) break;
            }
            return res.json(result);
        } else {
            const result = await processAction(employeeId, emp.name, actionType);
            return res.status(result.success ? 200 : 400).json(result);
        }
    } catch (error) {
        console.error('Error in /api/attendance/scan:', error);
        res.status(500).json({ success: false, message: 'Server error processing scan' });
    } finally {
        processingScans.delete(employeeId);
    }
});


/**
 * Endpoint: Fetch Raw Attendance Logs
 */
app.get('/api/attendance/logs/raw', verifyAdmin, async (req, res) => {
    const { filter } = req.query;
    try {
        let query = db.attendance_logs();
        const now = new Date();
        if (filter === 'today') query = query.where('timestamp', '>=', now.toISOString().split('T')[0]);
        const snapshot = await query.orderBy('timestamp', 'desc').limit(500).get();
        const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, logs });
    } catch (e) {
        console.error('Error in /api/attendance/logs/raw:', e);
        res.status(500).json({ success: false });
    }
});

/**
 * Endpoint: Fetch Daily Sessions
 * Returns aggregated shift session data used by the Dashboard UI
 */
/**
 * Endpoint: Dashboard Summary
 * Purpose: Consolidated metrics and live status for the Admin Dashboard
 */
app.get('/api/dashboard/summary', verifyAdmin, async (req, res) => {
    try {
        const dateStr = req.query.date || new Date().toISOString().split('T')[0];

        // Fetch all sessions for specifically chosen date
        const sessionsSnapshot = await db.daily_sessions().where('date', '==', dateStr).get();
        const sessions = sessionsSnapshot.docs.map(doc => doc.data());

        // Count statuses
        const active = sessions.filter(s => s.status === 'active' || !s.checkOut);

        const summary = {
            working: active.filter(s => !s.onBreak).length,
            onBreak: active.filter(s => s.onBreak).length,
            totalCheckins: sessions.length,
            // Latest 10 activities for the live monitor
            liveAttendance: sessions.sort((a, b) => new Date(b.checkIn) - new Date(a.checkIn)).slice(0, 10).map(s => ({
                employeeName: s.employeeName,
                status: s.onBreak ? 'ON_BREAK' : (s.checkOut ? 'COMPLETED' : 'WORKING'),
                checkInTime: s.checkIn ? s.checkIn.split('T')[1].substr(0, 5) : '00:00'
            }))
        };

        res.json({ success: true, summary });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.get('/api/daily-sessions', verifyAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        let query = db.daily_sessions();
        if (date) query = query.where('date', '==', date);
        const snapshot = await query.get();

        const sessions = snapshot.docs.map(doc => {
            const s = doc.data();
            return {
                ...s,
                id: doc.id,
                checkInTime: s.checkIn,
                checkOutTime: s.checkOut,
                isOnBreak: s.onBreak,
                totalBreakDuration: (s.totalBreakMinutes || 0) * 60000 // UI expects MS
            };
        });

        // Sort in-memory to avoid Firestore Composite Index requirements
        sessions.sort((a, b) => new Date(b.checkInTime) - new Date(a.checkInTime));

        res.json({ success: true, sessions });
    } catch (e) { res.status(500).json({ success: false }); }
});

/**
 * Endpoint: Review Attendance Discrepancy
 * Purpose: Admin approves or declines a flagged punch.
 */
app.post('/api/attendance/review', verifyAdmin, async (req, res) => {
    try {
        const { sessionId, action } = req.body; // action: 'APPROVED' or 'DECLINED'
        if (!sessionId || !action) return res.status(400).json({ success: false, message: 'Missing sessionId or action.' });

        const sessionRef = db.daily_sessions().doc(sessionId);
        const doc = await sessionRef.get();

        if (!doc.exists) return res.status(404).json({ success: false, message: 'Session not found.' });

        const session = doc.data();
        const isApproved = action.toLowerCase() === 'approve';
        
        let update = {
            approvalStatus: isApproved ? 'approved' : 'declined',
            reviewedAt: new Date().toISOString(),
            reviewedBy: req.admin.username
        };

        if (isApproved) {
            // Transfer pending minutes to approved fields
            const early = session.earlyExtraMinutes || 0;
            const ot = session.overtimeMinutes || 0;
            update.approvedExtraMinutes = early + ot;
            // If it was late, we can mark late as 'approved' (meaning excused)
            if (session.requiresApproval === 'LATE_ARRIVAL') {
                update.approvedLateMinutes = session.lateMinutes || 0;
            }
        }

        await sessionRef.update(update);

        // Audit Log
        await logAttendance(session.employeeId, session.employeeName, `DISCREPANCY_${action.toUpperCase()}`, new Date().toISOString());

        res.json({ success: true, message: `Discrepancy ${action.toLowerCase()} successfully.` });
    } catch (e) {
        console.error('Review Error:', e);
        res.status(500).json({ success: false, message: 'Server error during review.' });
    }
});

/**
 * Endpoint: Bulk Edit Logs
 */
/**
 * Endpoint: Shift Summary (Text Reports)
 * Returns metadata of end-shift reports
 */
app.get('/api/shift-summary', verifyAdmin, async (req, res) => {
    try {
        const { date } = req.query;
        let query = db.esr_reports();
        if (date && date.trim() !== '') {
            query = query.where('date', '==', date);
        }
        const snapshot = await query.orderBy('date', 'desc').limit(50).get();
        const reports = snapshot.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                employeeId: data.employee_id,
                employeeName: data.employeeName || 'Unknown',
                date: data.date,
                shift_id: data.shift_id
            };
        });
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Get Unverified Shift Bills
 */
app.get('/api/admin/unverified-shifts', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.esr_reports().where('verified', '==', false).get();
        const reports = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ success: true, reports });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Save Bill Verification
 */
app.post('/api/admin/verify-bill', verifyAdmin, async (req, res) => {
    try {
        const { reportId, remarks, type, subType, differences, manualText } = req.body;
        if (!reportId) return res.status(400).json({ success: false, message: 'Missing reportId' });

        await db.esr_reports().doc(reportId).update({
            verified: true,
            verification_data: {
                remarks: remarks || 'No',
                type: type || null,
                subType: subType || null,
                differences: differences || {},
                manualText: manualText || '',
                verifiedAt: new Date().toISOString(),
                verifiedBy: (req.admin && req.admin.id) || (req.user && req.user.id) || 'admin'
            }
        });

        res.json({ success: true, message: 'Bill verification saved.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Delete Bill Verification (Reset to Unverified)
 */
app.delete('/api/admin/verify-bill/:reportId', verifyAdmin, async (req, res) => {
    try {
        const { reportId } = req.params;
        await db.esr_reports().doc(reportId).update({
            verified: false,
            verification_data: admin.firestore.FieldValue.delete()
        });
        res.json({ success: true, message: 'Verification deleted.' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Reconcile Payroll (Auto-calculate differences and attendance for payslip)
 */
app.get('/api/admin/payroll-reconcile', verifyAdmin, async (req, res) => {
    try {
        const { employeeId, month } = req.query; // month: YYYY-MM
        if (!employeeId || !month) return res.status(400).json({ success: false, message: 'Missing employeeId or month' });

        // 1. Fetch all ESR reports for this employee in this month
        let totalDiff = 0;
        
        // Fetch current employee details for matching
        const empDoc = await db.employees().doc(employeeId).get();
        const empData = empDoc.exists ? empDoc.data() : {};
        const empName = empData.name || '';
        const empUsername = empData.username || '';

        const processReport = (doc) => {
            const data = doc.data();
            const reportDate = data.date || '';
            if (!reportDate.includes(month)) return;

            if (data.verified && data.verification_data && data.verification_data.differences) {
                const diffs = data.verification_data.differences;
                Object.values(diffs).forEach(val => {
                    const num = parseFloat(val);
                    if (!isNaN(num)) totalDiff += num;
                });
            }
        };

        // Run multiple queries in parallel to catch all variations without composite indexes
        // This is much safer than scanning the whole collection
        const queries = [
            db.esr_reports().where('employee_id', '==', employeeId).get(),
            db.esr_reports().where('employeeId', '==', employeeId).get()
        ];

        if (empName) {
            queries.push(db.esr_reports().where('employeeName', '==', empName).get());
            queries.push(db.esr_reports().where('employeeName', '==', empName.toLowerCase()).get());
            queries.push(db.esr_reports().where('employeeName', '==', empName.toUpperCase()).get());
        }
        if (empUsername) {
            queries.push(db.esr_reports().where('employee_id', '==', empUsername).get());
            queries.push(db.esr_reports().where('employeeId', '==', empUsername).get());
        }

        const snapshots = await Promise.all(queries);
        
        const processedDocs = new Set();
        snapshots.forEach(snapshot => {
            snapshot.docs.forEach(doc => {
                if (!processedDocs.has(doc.id)) {
                    processReport(doc);
                    processedDocs.add(doc.id);
                }
            });
        });

        // 2. Fetch Attendance for worked days (Daily Sessions)
        // SUPPORT BOTH INTERNAL ID AND USERNAME for robust lookup (useful for dummy data)
        const possibleIds = [employeeId];
        if (empData.username) possibleIds.push(empData.username);
        
        const sessSnapshot = await db.daily_sessions()
            .where('employeeId', 'in', possibleIds)
            .get();
        
        let totalWorkedMinutes = 0;
        const uniqueDates = new Set();
        
        sessSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const sessDate = data.date || '';
            if (sessDate.includes(month) && (data.status === 'completed' || data.checkOut)) {
                 // EXACT duration as calculated from attendance logs (CLOCK_IN to CLOCK_OUT minus breaks)
                 const duration = data.durationMinutes || 0;
                 totalWorkedMinutes += duration;
                 uniqueDates.add(sessDate);
            }
        });

        // 3. Calculate LOP (Loss of Pay) exactly from time logs
        const [year, m] = month.split('-').map(Number);
        const totalDaysInMonth = new Date(year, m, 0).getDate();
        const paidOffsAllowed = 4; // Constant as requested
        
        // DYNAMIC SHIFT DURATION based on employee record
        const startStr = empData['start-time'] || '09:00';
        const endStr = empData['end-time'] || '18:00';
        const [sH, sM] = startStr.split(':').map(Number);
        const [eH, eM] = endStr.split(':').map(Number);
        let shiftMinutes = (eH * 60 + eM) - (sH * 60 + sM);
        if (shiftMinutes < 0) shiftMinutes += 1440; // Over-night shift support
        if (shiftMinutes <= 0) shiftMinutes = 480;   // Hard fallback to 8 hours if data is missing
        
        const requiredMinutes = (totalDaysInMonth - paidOffsAllowed) * shiftMinutes;
        
        // Loss of minutes = Standard required - total worked
        const lostMinutes = Math.max(0, requiredMinutes - totalWorkedMinutes);
        
        const lopRateDay = parseFloat(empData.lopPerDay) || 0;
        const lopRateHour = parseFloat(empData.lopPerHour) || 0;
        
        // Exact calculation: how many full days lost and how many extra hours lost
        const lopDays = Math.floor(lostMinutes / shiftMinutes);
        const lopRemainingMinutes = lostMinutes % shiftMinutes;
        const lopHours = lopRemainingMinutes / 60;

        const lopAmount = (lopDays * lopRateDay) + (lopHours * lopRateHour);

        res.json({
            success: true,
            billingDifference: totalDiff,
            workedDays: (totalWorkedMinutes / shiftMinutes).toFixed(1), // Display relative to THEIR standard day
            attendanceDays: uniqueDates.size, // Number of physical days present
            lopDays: (lostMinutes / shiftMinutes).toFixed(1), // Total lost days equivalent
            lopAmount: lopAmount,
            totalWorkedMinutes,
            employeeId,
            month,
            shiftDurationMinutes: shiftMinutes // Informational
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Get Bill Verification Reports (Studio)
 */
app.get('/api/admin/bill-verification-reports', verifyAdmin, async (req, res) => {
    try {
        const snapshot = await db.esr_reports().where('verified', '==', true).limit(100).get();
        let history = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort in memory to avoid Firestore index requirements
        history.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
        
        res.json({ success: true, history });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Get Shift Text Report (Decrypted)
 */
app.get('/api/esr-reports/:id', verifyAdmin, async (req, res) => {
    try {
        const doc = await db.esr_reports().doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Report not found' });
        
        const data = doc.data();
        const decryptedReport = decrypt(data.report_data);
        
        res.json({ success: true, report: decryptedReport, metadata: data });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

/**
 * Endpoint: Get Shift Snapshot Image
 */
app.get('/api/shift-summary/:id/image', verifyAdmin, async (req, res) => {
    try {
        const doc = await db.esr_jpgs().doc(req.params.id).get();
        if (!doc.exists) return res.status(404).json({ success: false, message: 'Image not found' });
        
        const data = doc.data();
        let base64Data = data.jpg_data_encrypted || data.jpgData;
        if (!base64Data) return res.status(404).json({ success: false, message: 'Image data missing' });

        // Decrypt if it's the newer format
        if (data.jpg_data_encrypted) {
            const decrypted = decrypt(base64Data);
            base64Data = decrypted.split(',')[1] || decrypted;
        } else {
            base64Data = base64Data.split(',')[1] || base64Data;
        }

        const img = Buffer.from(base64Data, 'base64');
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': img.length });
        res.end(img);
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

app.put('/api/attendance/logs/bulk-edit', verifyAdmin, async (req, res) => {
    const { logIds, newAction } = req.body;
    if (!logIds || !Array.isArray(logIds)) return res.status(400).json({ success: false });

    try {
        const batch = firestore.batch();
        logIds.forEach(id => {
            const ref = db.attendance_logs().doc(id);
            batch.update(ref, { action: newAction, type: newAction });
        });
        await batch.commit();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});

/**
 * Endpoint: Bulk Delete Logs
 */
app.delete('/api/attendance/logs', verifyAdmin, async (req, res) => {
    const { logIds } = req.body;
    if (!logIds || !Array.isArray(logIds)) return res.status(400).json({ success: false });

    try {
        const batch = firestore.batch();
        logIds.forEach(id => {
            const ref = db.attendance_logs().doc(id);
            batch.delete(ref);
        });
        await batch.commit();
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});




/**
 * Endpoint: Recalculate Sessions
 */
app.post('/api/attendance/sessions/recalculate', verifyAdmin, async (req, res) => {
    // 1. Clear daily_sessions
    const snapshot = await db.daily_sessions().get();
    const batch = firestore.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();

    // 2. Load all logs chronologically
    const logsSnapshot = await db.attendance_logs().orderBy('timestamp', 'asc').get();
    const activeSessions = {};

    for (const logDoc of logsSnapshot.docs) {
        const log = logDoc.data();
        const empId = log.employeeId, empName = log.employeeName;
        const action = log.action || log.type;

        if (action === 'CLOCK_IN' || action === 'IN') {
            const sid = shortid.generate();
            activeSessions[empId] = { id: sid, employeeId: empId, employeeName: empName, date: log.timestamp.split('T')[0], checkIn: log.timestamp, checkOut: null, onBreak: false, breakHistory: [], totalBreakMinutes: 0, status: 'active' };
        } else if (action === 'BREAK_START' && activeSessions[empId]) {
            const s = activeSessions[empId];
            s.onBreak = true; s.breakHistory.push({ start: log.timestamp, end: null });
        } else if (action === 'BREAK_END' && activeSessions[empId]) {
            const s = activeSessions[empId];
            const last = s.breakHistory[s.breakHistory.length - 1];
            if (last && !last.end) { last.end = log.timestamp; s.totalBreakMinutes += Math.floor((new Date(log.timestamp) - new Date(last.start)) / 60000); }
            s.onBreak = false;
        } else if ((action === 'CLOCK_OUT' || action === 'OUT') && activeSessions[empId]) {
            const s = activeSessions[empId];
            s.checkOut = log.timestamp; s.status = 'completed';
            await db.daily_sessions().add(s);
            delete activeSessions[empId];
        }
    }
    res.json({ success: true });
});

/**
 * Helper: Log Attendance Event
 */
async function logAttendance(employeeId, employeeName, type, timestamp) {
    let statusAfter = 'IDLE';
    if (type === 'CLOCK_IN' || type === 'BREAK_END') statusAfter = 'WORKING';
    if (type === 'BREAK_START') statusAfter = 'ON_BREAK';

    await db.attendance_logs().add({
        employeeId, employeeName, action: type, type, statusAfter, timestamp
    });
}

/**
 * Consolidated Helper: Generate and Save End Shift Report (ESR) to Firestore
 */
async function generateAndSaveESR(employeeId, employeeName, shiftStartTime, endShiftTime, shiftId) {
    const date = endShiftTime.split('T')[0];
    console.log(`[ESR DEBUG] Starting ESR generation for ${employeeName} | Date: ${date} | Shift: ${shiftId}`);
    try {
        // CALL INTERNAL HELPERS DIRECTLY (Avoiding loopback fetch which fails on Vercel)
        const reportSummary = await internalGetReportSummary(date);
        const activitySummary = await internalGetActivitySummary(employeeId, date, shiftStartTime, endShiftTime);

        const reportText = `End Shift Report for ${employeeName}\n\n` +
            `Shift Details:\n` +
            `- Start: ${new Date(shiftStartTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
            `- End: ${new Date(endShiftTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}\n` +
            `- ID: ${shiftId}\n\n` +
            `Summary:\n` +
            `- UPI Pinelab: ₹${reportSummary.upiPinelab || 0}\n` +
            `- Card Pinelab: ₹${reportSummary.cardPinelab || 0}\n` +
            `- UPI Paytm: ₹${reportSummary.upiPaytm || 0}\n` +
            `- Card Paytm: ₹${reportSummary.cardPaytm || 0}\n` +
            `- Cash: ₹${reportSummary.cash || 0}\n` +
            `- Retail Credit: ₹${reportSummary.retailCredit || 0}\n\n` +
            `Activity:\n` +
            `- Added: ${activitySummary.inputed || 0}, Edited: ${activitySummary.edited || 0}, Deleted: ${activitySummary.deleted || 0}\n\n` +
            `Regards, Pinpoint Startups`;

        console.log(`[ESR DEBUG] Report text generated. Saving to Firestore...`);

        // 1. Save Text Report to Firestore (Compact & Encrypted)
        await db.esr_reports().doc(`${employeeId}_${date}_${shiftId}`).set({
            employee_id: employeeId,
            employeeName,
            date,
            shift_id: shiftId,
            report_data: encrypt(reportText.trim()),
            structured_data: {
                upiPinelab: reportSummary.upiPinelab || 0,
                upiPaytm: reportSummary.upiPaytm || 0,
                cardPinelab: reportSummary.cardPinelab || 0,
                cardPaytm: reportSummary.cardPaytm || 0,
                cash: reportSummary.cash || 0,
                retailCredit: reportSummary.retailCredit || 0
            },
            verified: false,
            created_at: new Date().toISOString()
        });

        console.log(`✅ [ESR DEBUG] Cloud Text ESR successfully saved for ${employeeName}`);
    } catch (error) {
        console.error('❌ [ESR DEBUG] ESR Generation failed:', error);
    }
}

// DEBUG: Check reports count
app.get('/api/debug/reports-count', async (req, res) => {
    try {
        const snap = await db.esr_reports().get();
        const docs = snap.docs.map(d => d.data());
        res.json({ count: snap.size, samples: docs });
    } catch(e) { res.json({ error: e.message }); }
});

// Support for Leave/Swap logic remains distinct
app.get('/api/leave-swaps', async (req, res) => {
    try {
        const snapshot = await db.leave_swaps().orderBy('timestamp', 'desc').get();
        const swaps = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(swaps);
    } catch (e) { res.status(500).json([]); }
});

app.post('/api/leave-swaps', async (req, res) => {
    try {
        const { employeeId, original_date, new_date, reason } = req.body;
        const reqData = {
            employeeId,
            original_date: original_date || null,
            new_date,
            reason: reason || '',
            status: 'pending',
            timestamp: new Date().toISOString()
        };
        await db.leave_swaps().add(reqData);
        res.json({ success: true, message: 'Leave Request Issued' });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.put('/api/leave-swaps/:id', async (req, res) => {
    try {
        const { action } = req.body;
        const status = action === 'approve' ? 'approved' : 'rejected';
        await db.leave_swaps().doc(req.params.id).update({ status });
        res.json({ success: true });
    } catch (e) { res.status(500).json({ success: false }); }
});


// Stub Update Endpoints to prevent frontend 404s on Vercel
app.get('/api/check-update', (req, res) => res.json({ updateAvailable: false }));
app.get('/api/update-details', (req, res) => res.json({ details: "System is up to date on Vercel." }));
app.get('/api/update-status', (req, res) => res.json({ updateInProgress: false }));
app.post('/api/update-app', (req, res) => res.status(403).json({ success: false, message: "Cloud updates are managed via GitHub/Vercel." }));
app.get('/api/system/status', (req, res) => res.json({ status: "Online", platform: "Vercel", database: "Firebase Firestore" }));

if (fs.existsSync('key.pem') && fs.existsSync('cert.pem') && !isVercel) {
    const options = {
        key: fs.readFileSync('key.pem'),
        cert: fs.readFileSync('cert.pem')
    };
    https.createServer(options, app).listen(port, "0.0.0.0", () => {
        console.log(`SECURE Server is running on https://localhost:${port}`);
        console.log('To access from other devices on your network securely, use your local IP address.');
        console.log(`Example: https://192.168.1.100:${port}`);

    });
} else if (!isVercel) {
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server is running on http://localhost:${port}`);
        console.log('To access from other devices on your network, use your local IP address.');
        console.log(`Example: http://192.168.1.100:${port}`);

    });
}

// Export for Vercel (Cleanup)
if (isVercel) {
    console.log('📦 Vercel Module Exported');
}
module.exports = app;
