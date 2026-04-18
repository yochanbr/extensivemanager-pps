const fs = require('fs');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const shortid = require('shortid');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const admin = require('firebase-admin');
const crypto = require('crypto-js');

const app = express();
const port = process.env.PORT || 3000;
const isVercel = process.env.VERCEL === '1';

// Export for Vercel (Must be early)
if (isVercel) {
    module.exports = app;
}

// Diagnostic route (no DB dependency)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        time: new Date().toISOString(),
        firebaseInitialized: !!firestore,
        nodeVersion: process.version
    });
});

// Heavy dependencies (Deferred for serverless compatibility)
let puppeteer; 

// Firebase Configuration
const ENCRYPTION_SECRET = process.env.ENCRYPTION_SECRET || 'nammamart_secret_key_change_me';
const FIREBASE_KEY_PATH = './extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json';

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

// Firestore Collection Wrappers
const db = {
    settings: () => firestore.collection('settings'),
    employees: () => firestore.collection('employees'),
    broadcast: () => firestore.collection('settings').doc('state'),
    attendance_logs: () => firestore.collection('attendance_logs'),
    daily_sessions: () => firestore.collection('daily_sessions'),
    esr_reports: () => firestore.collection('esr_reports'),
    esr_jpgs: () => firestore.collection('esr_jpgs'),
    leave_swaps: () => firestore.collection('leave_swaps')
};


// Serve static files from the current directory
app.use(express.static(__dirname));

// Specifically serve models directory (Crucial for Vercel/Face-API)
app.use('/models', express.static(path.join(__dirname, 'models')));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Email configuration (provided)
const emailConfig = {
    from: 'nsoridcodings@gmail.com',
    recipients: ['yochanbr@gmail.com', '', ''],
    transporter: nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'nsoridcodings@gmail.com',
            pass: 'thvp krkn ipml dzzp' // Replace with actual App Password
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

// In-memory OTP store for admin approvals
let adminApprovalOtp = {
    otp: null,
    expiresAt: 0,
    employeeId: null
};

// Test close flag
let testCloseDone = false;

// Handle login requests
app.post('/login', ensureDb, async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ success: false, message: 'Username and password are required.' });
    }

    const trimmedUsername = username.trim();

    // 1. Check Admin Credentials
    const settingsDoc = await db.settings().doc('config').get();
    const adminSettings = settingsDoc.exists ? settingsDoc.data() : { adminPassword: 'admin12nammamart' };
    
    if ((trimmedUsername === 'nammamart' || trimmedUsername === 'admin') && password === adminSettings.adminPassword) {
        return res.json({ success: true, redirectUrl: '/admin' });
    }

    // 2. Check Store State
    const stateDoc = await db.broadcast().get();
    const storeClosed = stateDoc.exists ? stateDoc.data().store_closed : false;

    if (storeClosed) {
        return res.status(403).json({
            success: false,
            message: 'Store is temporarily CLOSED. Contact admin to open the store.',
            code: 'STORE_CLOSED'
        });
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
    let hasActiveShift = false;
    if (employee.counter_selections.length > 0) {
        const lastShift = employee.counter_selections[employee.counter_selections.length - 1];
        if (!lastShift.shiftEndTime && lastShift.shiftStartTime && lastShift.shiftStartTime.startsWith(today)) {
            hasActiveShift = true;
        }
    }

    if (hasActiveShift) {
        res.json({ success: true, redirectUrl: '/employee.html', employeeId: employee.id });
    } else {
        res.json({ success: true, redirectUrl: '/counter_selection.html', employeeId: employee.id });
    }
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve the admin page
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// Serve the scan page
app.get('/scan', (req, res) => {
    res.sendFile(path.join(__dirname, 'scan.html'));
});

// Handle add employee requests
app.post('/api/employees', async (req, res) => {
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
        // Decrypt sensitive fields
        ['phone', 'email', 'address', 'aadhar-number', 'pan-number', 'account-number'].forEach(field => {
            if (data[field]) data[field] = decrypt(data[field]);
        });
        return data;
    });
    res.json(employees);
});

// Delete an employee
app.delete('/api/employees/:id', async (req, res) => {
    const employeeId = req.params.id;
    await db.employees().doc(employeeId).delete();
    res.json({ success: true, message: 'Employee deleted successfully.' });
});

// Post a new broadcast message
app.post('/api/broadcast', async (req, res) => {
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

// Get store status (Cloud Native)
app.get('/api/store-status', async (req, res) => {
    try {
        const doc = await db.broadcast().get();
        const storeClosed = doc.exists ? doc.data().store_closed : false;
        res.json({ success: true, closed: !!storeClosed });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Toggle store status (Cloud Native)
app.post('/api/store-status', async (req, res) => {
    try {
        const { store_closed } = req.body;
        await db.broadcast().update({ store_closed: !!store_closed });
        res.json({ success: true, store_closed: !!store_closed });
    } catch (e) { res.status(500).json({ success: false }); }
});

// Get a single employee by ID
app.get('/api/employees/:id', async (req, res) => {
    try {
        const employeeId = req.params.id;
        const doc = await db.employees().doc(employeeId).get();
        if (doc.exists) {
            res.json(doc.data());
        } else {
            res.status(404).json({ success: false, message: 'Employee not found.' });
        }
    } catch (e) { res.status(500).json({ success: false }); }
});

// Update an employee's details
app.put('/api/employees/:id', async (req, res) => {
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

    // Generate shift ID safely from settings/state
    const stateDoc = await db.broadcast().get();
    const shiftNumber = stateDoc.exists ? (stateDoc.data().nextShiftId || 1) : 1;
    
    const namePart = (employee.name || "EMP").replace(/\s/g, '').substr(0, 3).toUpperCase();
    const shiftId = shiftNumber.toString().padStart(3, '0') + namePart;
    
    // Increment global shift ID
    await db.broadcast().update({ nextShiftId: admin.firestore.FieldValue.increment(1) });

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
                activeShift.shiftEndTime = new Date().toISOString();
                await doc.ref.update({ 
                    counter_selections: selections,
                    shiftEnded: true 
                });
                return res.json({ success: true, message: 'Shift strictly terminated.' });
            }
        }
        res.json({ success: true, message: 'No active shift to terminate.' });
    } catch(err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Internal server error' });
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
            newRecord: Object.keys(data).reduce((acc, k) => { if(original[k] !== data[k] && typeof original[k] !== 'undefined') acc[k] = data[k]; return acc; }, {})
        });

        await doc.ref.update({ [type]: records, audit_history });
        res.json({ success: true });
    } catch(err) {
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
    } catch(err) {
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
    } catch(err) { console.error(err); res.status(500).json({ message: 'Error restoring' }); }
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
    } catch(err) { console.error(err); res.status(500).json({ message: 'Error reverting' }); }
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

// Verify admin password for end shift
// Verify admin password and send OTP to configured email for end-shift
app.post('/api/verify-admin-password', async (req, res) => {
    const { password } = req.body;
    if (password !== 'admin12nammamart') {
        return res.json({ success: false });
    }

    // Generate 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();
    endShiftOtp.otp = otp;
    endShiftOtp.expiresAt = Date.now() + 5 * 60 * 1000; // valid for 5 minutes

    // Prepare email
    const mailOptions = {
        from: emailConfig.from,
        to: emailConfig.recipients.filter(Boolean).join(','),
        subject: 'Namma Mart - End Shift OTP',
        text: `Your End Shift OTP is: ${otp}. It is valid for 5 minutes.`
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);

        const responseBody = { success: true, message: 'OTP sent to configured email.' };
        return res.json(responseBody);
    } catch (err) {
        console.error('Error sending OTP email:', err);
        // Clear OTP on failure
        endShiftOtp.otp = null;
        endShiftOtp.expiresAt = 0;
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
    }
});

// Send OTP to employee's email for end-shift
app.post('/api/send-employee-otp', async (req, res) => {
    const { employeeId } = req.body;
    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'Employee ID is required.' });
    }

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employee = doc.data();
    const employeeEmail = decrypt(employee.email);

    if (!employeeEmail) {
        return res.status(400).json({ success: false, message: 'Employee email not found.' });
    }

    const otp = Math.floor(10000 + Math.random() * 90000).toString();
    employeeEndShiftOtp.otp = otp;
    employeeEndShiftOtp.expiresAt = Date.now() + 5 * 60 * 1000;
    employeeEndShiftOtp.employeeId = employeeId;

    const mailOptions = {
        from: emailConfig.from,
        to: employeeEmail,
        subject: 'Namma Mart - Employee End Shift OTP',
        text: `Your End Shift OTP is: ${otp}. It is valid for 5 minutes.`
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);
        return res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
        console.error('Error sending employee OTP email:', err);
        employeeEndShiftOtp.otp = null;
        employeeEndShiftOtp.expiresAt = 0;
        employeeEndShiftOtp.employeeId = null;
        return res.status(500).json({ success: false, message: 'Failed to send OTP email.' });
    }
});

/**
 * Verify employee OTP for end-shift
 * Additionally, record employee endShiftTime and set shiftEnded to true
 */
// Verify employee OTP for end-shift
app.post('/api/verify-employee-otp', async (req, res) => {
    const { otp, employeeId } = req.body;
    if (!otp || !employeeId) {
        return res.status(400).json({ success: false, message: 'OTP and Employee ID are required.' });
    }

    if (!employeeEndShiftOtp.otp || Date.now() > employeeEndShiftOtp.expiresAt || employeeEndShiftOtp.employeeId !== employeeId) {
        employeeEndShiftOtp.otp = null;
        return res.status(400).json({ success: false, message: 'OTP expired or not requested.' });
    }

    if (String(otp).trim() !== String(employeeEndShiftOtp.otp)) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    employeeEndShiftOtp.otp = null;

    const endShiftTime = new Date().toISOString();
    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Employee not found.' });
    let employee = doc.data();

    let lastShiftIndex = -1;
    if (employee.counter_selections) {
        const today = new Date().toISOString().split('T')[0];
        lastShiftIndex = employee.counter_selections.reduce((lastIndex, selection, currentIndex) => {
            if (selection.shiftStartTime && selection.shiftStartTime.startsWith(today)) return currentIndex;
            return lastIndex;
        }, -1);

        if (lastShiftIndex !== -1) {
            employee.counter_selections[lastShiftIndex].shiftEndTime = endShiftTime;
        }
    }
    await doc.ref.update({ shiftEnded: true, counter_selections: employee.counter_selections || [] });

    const employeeName = employee.name || 'Employee';
    const date = endShiftTime.split('T')[0];
    let reportText = '';
    
    try {
        const shift = employee.counter_selections[lastShiftIndex];
        const shiftStartTime = shift.shiftStartTime;
        const shiftId = shift.shiftId;

        // Use helper functions or logic instead of internal fetch if possible
        // For now, I'll keep the internal fetch to avoid massive refactoring of summary logic
        const reportSummaryResponse = await fetch(`http://localhost:${port}/api/todays-report-summary?employeeId=${employeeId}&date=${date}&shiftStartTime=${shiftStartTime}&shiftEndTime=${endShiftTime}`);
        const reportSummary = await reportSummaryResponse.json();
        const activitySummaryResponse = await fetch(`http://localhost:${port}/api/data-activity-summary?employeeId=${employeeId}&date=${date}&shiftStartTime=${shiftStartTime}&shiftEndTime=${endShiftTime}`);
        const activitySummary = await activitySummaryResponse.json();

        reportText = `End Shift Report for ${employeeName}\n\nShift Details:\n- Start: ${new Date(shiftStartTime).toLocaleString()}\n- End: ${new Date(endShiftTime).toLocaleString()}\n- ID: ${shiftId}\n\nSummary:\n- UPI Pinelab: ₹${reportSummary.upiPinelab || 0}\n- Cash: ₹${reportSummary.cash || 0}\n- Retail Credit: ₹${reportSummary.retailCredit || 0}\n\nActivity:\n- Added: ${activitySummary.inputed || 0}, Edited: ${activitySummary.edited || 0}, Deleted: ${activitySummary.deleted || 0}`;

        // Save Text Report to Firestore (Encrypted)
        await db.esr_reports().doc(`${employeeId}_${date}_${shiftId}`).set({
            employee_id: employeeId,
            date,
            shift_id: shiftId,
            report_data: encrypt(reportText.trim()),
            created_at: new Date().toISOString()
        });

        // Generate and save ESR JPG to Firestore
        try {
            if (!puppeteer) {
                try { puppeteer = require('puppeteer'); } catch (e) { console.warn('Puppeteer load failed'); }
            }
            if (puppeteer) {
                const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
                const page = await browser.newPage();
                await page.goto(`http://localhost:${port}/end_shift_report.html?employeeId=${employeeId}&date=${date}&shiftId=${shiftId}`, { waitUntil: 'networkidle2' });
                const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 90 });
                await browser.close();

                await db.esr_jpgs().doc(`${employeeId}_${date}_${shiftId}`).set({
                    employee_id: employeeId,
                    date,
                    shift_id: shiftId,
                    jpg_data_encrypted: encrypt(screenshotBuffer.toString('base64')),
                    created_at: new Date().toISOString()
                });
            }
        } catch (jpgError) { console.error('ESR JPG error:', jpgError); }
    } catch (error) { console.error('ESR Report error:', error); }

    const mailOptions = {
        from: emailConfig.from,
        to: decrypt(employee.email),
        subject: 'Namma Mart - Shift End Report',
        text: `Hello ${employeeName},\n\nYour shift has ended.\n\n${reportText}\n\nRegards,\nNamma Mart`
    };
    try { await emailConfig.transporter.sendMail(mailOptions); } catch (e) { console.error('Mail error:', e); }

    return res.json({ success: true, message: 'OTP verified. Shift ended and report generated.' });
});

/**
 * End employee shift with password verification
 */
app.post('/api/end-employee-shift', async (req, res) => {
    const { password, employeeId } = req.body;
    if (!password || !employeeId) {
        return res.status(400).json({ success: false, message: 'Password and Employee ID are required.' });
    }

    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }
    const employeeRecord = doc.data();

    // Verify employee password
    const decryptedPass = decrypt(employeeRecord.password);
    if (!bcrypt.compareSync(password, decryptedPass)) {
        return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    // Record endShiftTime and set shiftEnded true
    const endShiftTime = new Date().toISOString();
    let counter_selections = employeeRecord.counter_selections || [];
    let lastShiftIndex = -1;
    const today = new Date().toISOString().split('T')[0];
    
    lastShiftIndex = counter_selections.reduce((lastIndex, selection, currentIndex) => {
        if (selection.shiftStartTime && selection.shiftStartTime.startsWith(today)) {
            return currentIndex;
        }
        return lastIndex;
    }, -1);

    if (lastShiftIndex !== -1) {
        counter_selections[lastShiftIndex].shiftEndTime = endShiftTime;
    }

    await doc.ref.update({ 
        shiftEnded: true, 
        counter_selections 
    });

    const employeeForShiftEnd = { ...employeeRecord, counter_selections };
    // Use the employee name fetched earlier for report
    const employeeName = employeeRecord.name || 'Employee';

    // Generate and save ESR Text Report
    const date = endShiftTime.split('T')[0];
    let reportText = '';
    try {
        // Get shift details
        const shiftStartTime = counter_selections[lastShiftIndex].shiftStartTime;
        const shiftEndTimeFormatted = endShiftTime;
        const shiftId = counter_selections[lastShiftIndex].shiftId;

        // Fetch today's report summary
        const reportSummaryResponse = await fetch(`http://localhost:${port}/api/todays-report-summary?employeeId=${employeeId}&date=${date}&shiftStartTime=${shiftStartTime}&shiftEndTime=${shiftEndTimeFormatted}`);
        const reportSummary = await reportSummaryResponse.json();

        // Fetch data activity summary
        const activitySummaryResponse = await fetch(`http://localhost:${port}/api/data-activity-summary?employeeId=${employeeId}&date=${date}&shiftStartTime=${shiftStartTime}&shiftEndTime=${shiftEndTimeFormatted}`);
        const activitySummary = await activitySummaryResponse.json();

        // Generate text report
        reportText = `
End Shift Report for ${employeeName}

Shift Details:
- Shift Start Time: ${new Date(shiftStartTime).toLocaleString()}
- Shift End Time: ${new Date(shiftEndTimeFormatted).toLocaleString()}
- Shift ID: ${shiftId}

Today's Report Summary:
- UPI Pinelab: ₹${reportSummary.upiPinelab || 0}
- Card Pinelab: ₹${reportSummary.cardPinelab || 0}
- UPI Paytm: ₹${reportSummary.upiPaytm || 0}
- Card Paytm: ₹${reportSummary.cardPaytm || 0}
- Cash: ₹${reportSummary.cash || 0}
- Retail Credit: ₹${reportSummary.retailCredit || 0}

Data Activity Summary:
- Entries Added: ${activitySummary.inputed || 0}
- Entries Edited: ${activitySummary.edited || 0}
- Entries Deleted: ${activitySummary.deleted || 0}

Thank you for your work today.
Regards,
Namma Mart
        `;

        // Save the text report
        const stmt = esrDb.prepare('INSERT OR REPLACE INTO esr_reports (employee_id, date, shift_id, report_data) VALUES (?, ?, ?, ?)');
        stmt.run(employeeId, date, shiftId, reportText.trim());
        console.log(`ESR Text Report generated and saved for employee ${employeeId} on ${date} with shift ID ${shiftId}`);

        // Generate and save ESR JPG
        try {
            if (!puppeteer) {
                try { puppeteer = require('puppeteer'); } catch (e) { console.warn('Puppeteer load failed'); }
            }
            const browser = await puppeteer.launch({ headless: true });
            const page = await browser.newPage();
            await page.setViewport({ width: 1200, height: 800 });
            const reportUrl = `http://localhost:${port}/end_shift_report.html?employeeId=${employeeId}&date=${date}&shiftId=${shiftId}`;
            await page.goto(reportUrl, { waitUntil: 'networkidle2' });
            const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'jpeg', quality: 90 });
            await browser.close();

            // Save the JPG to database
            const jpgStmt = esrDb.prepare('INSERT OR REPLACE INTO esr_jpgs (employee_id, date, shift_id, jpg_data) VALUES (?, ?, ?, ?)');
            jpgStmt.run(employeeId, date, shiftId, screenshotBuffer);
            console.log(`ESR JPG generated and saved for employee ${employeeId} on ${date} with shift ID ${shiftId}`);
        } catch (jpgError) {
            console.error('Error generating ESR JPG:', jpgError);
        }
    } catch (error) {
        console.error('Error generating ESR Text Report:', error);
    }

    // Compose email content for shift end report
    const startShiftTime = employeeRecord.startShiftTime || 'N/A';

    const emailText = `
Hello ${employeeName},

Your shift has ended successfully.

Shift Start Time: ${startShiftTime}
Shift End Time: ${endShiftTime}

${reportText}

Regards,
Namma Mart
    `;

    // Send email with nodemailer
    const mailOptions = {
        from: emailConfig.from,
        to: employeeRecord.email,
        subject: 'Namma Mart - Shift End Report',
        text: emailText
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);
        console.log(`Shift end report email with attachment sent to ${employeeRecord.email}`);
    } catch (err) {
        console.error('Error sending shift end report email:', err);
        // Not failing the API call, just logging
    }

    return res.json({ success: true, message: 'Shift ended and email sent.' });
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

// Confirm the OTP and then close the store (end shift)
app.post('/api/confirm-endshift-otp', async (req, res) => {
    const { otp } = req.body;
    if (!otp) {
        return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    if (!endShiftOtp.otp || Date.now() > endShiftOtp.expiresAt) {
        endShiftOtp.otp = null;
        endShiftOtp.expiresAt = 0;
        return res.status(400).json({ success: false, message: 'OTP expired or not requested.' });
    }

    if (String(otp).trim() !== String(endShiftOtp.otp)) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    endShiftOtp.otp = null;
    endShiftOtp.expiresAt = 0;
    await db.broadcast().update({ store_closed: true });
    return res.json({ success: true, message: 'Shift ended, store closed.' });
});

/**
 * Confirm admin password and close the store (end shift)
 */
// Confirm admin password and close the store (end shift)
app.post('/api/confirm-endshift-password', async (req, res) => {
    const { password } = req.body;
    const settingsDoc = await db.settings().doc('config').get();
    const adminPassword = settingsDoc.exists ? settingsDoc.data().adminPassword : 'admin12nammamart';

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    await db.broadcast().update({ store_closed: true });
    return res.json({ success: true, message: 'Shift ended, store closed.' });
});

// Localhost-only debug endpoint to view current OTP (for development/testing only)
app.get('/api/debug-current-otp', (req, res) => {
    const ip = (req.ip || '').toString();
    const isLocal = ip === '::1' || ip === '127.0.0.1' || ip.startsWith('::ffff:127.0.0.1') || req.hostname === 'localhost';
    if (!isLocal) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    if (!endShiftOtp.otp) {
        return res.json({ success: false, message: 'No OTP currently set.' });
    }

    return res.json({ success: true, otp: endShiftOtp.otp, expiresAt: endShiftOtp.expiresAt });
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
            store_closed: false,
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

// Get store status
app.get('/api/store-status', async (req, res) => {
    const doc = await db.broadcast().get();
    const storeClosed = doc.exists ? doc.data().store_closed : false;
    res.json({ storeClosed });
});

// Toggle store status (open/close) - requires admin password
// Toggle store status (open/close) - requires admin password
app.post('/api/toggle-store', async (req, res) => {
    const { password, action } = req.body;
    const settingsDoc = await db.settings().doc('config').get();
    const adminPassword = settingsDoc.exists ? settingsDoc.data().adminPassword : 'admin12nammamart';

    if (password !== adminPassword) {
        return res.status(401).json({ success: false, message: 'Invalid admin password.' });
    }

    const isClosed = (action === 'close');
    await db.broadcast().update({ store_closed: isClosed });
    return res.json({ success: true, message: `Store is now ${isClosed ? 'CLOSED' : 'OPEN'}.`, storeClosed: isClosed });
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

// --- DIAGNOSTICS & SUMMARY APIS (Migrated) ---

/**
 * Endpoint: Get Today's Report Summary (Aggregate Sales/Collection)
 */
app.get('/api/todays-report-summary', async (req, res) => {
    try {
        const { date } = req.query;
        if (!date) return res.status(400).json({ success: false, message: 'Date is required.' });

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
        res.json(totals);
    } catch (error) {
        console.error('Error in /api/todays-report-summary:', error);
        res.status(500).json({ success: false });
    }
});

/**
 * Endpoint: Get Data Activity Summary (Audit Counts)
 */
app.get('/api/data-activity-summary', async (req, res) => {
    try {
        const { employeeId, date } = req.query;
        if (!employeeId || !date) return res.status(400).json({ success: false });

        const doc = await db.employees().doc(employeeId).get();
        if (!doc.exists) return res.status(404).json({ success: false });
        const emp = doc.data();

        let stats = { edited: 0, deleted: 0, inputed: 0 };
        const check = (arr) => {
            if (arr && Array.isArray(arr)) {
                arr.forEach(item => {
                    if (item && item.timestamp && item.timestamp.split('T')[0] === date) stats.inputed++;
                });
            }
        };
        check(emp.extra); check(emp.delivery); check(emp.bill_paid); check(emp.issue); check(emp.retail_credit);

        if (emp.history && Array.isArray(emp.history)) {
            emp.history.forEach(log => {
                if (log.timestamp && log.timestamp.split('T')[0] === date) {
                    if (log.action === 'edit') stats.edited++;
                    if (log.action === 'delete') stats.deleted++;
                }
            });
        }
        res.json({ success: true, stats });
    } catch (error) { res.status(500).json({ success: false }); }
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
app.post('/api/settings', async (req, res) => {
    const newSettings = req.body;
    delete newSettings.adminPassword;
    await db.settings().doc('config').set(newSettings, { merge: true });
    res.json({ success: true, message: 'Settings updated successfully.' });
});

// Change admin password
app.post('/api/settings/change-password', async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const doc = await db.settings().doc('config').get();
    const settings = doc.exists ? doc.data() : { adminPassword: 'admin12nammamart' };

    if (currentPassword !== settings.adminPassword) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    await db.settings().doc('config').update({ adminPassword: newPassword });
    res.json({ success: true, message: 'Admin password updated successfully.' });
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

// Download system health report (Cloud migration notice)
app.get('/api/system/backup', (req, res) => {
    res.json({ success: true, message: "Local DB removed. System is fully running on Firebase Cloud." });
});

// Reset settings to defaults
app.post('/api/settings/reset', (req, res) => {
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
    const { employeeId } = req.params;
    const dateStr = new Date().toISOString().split('T')[0];
    
    const snapshot = await db.daily_sessions()
        .where('employeeId', '==', employeeId)
        .where('date', '==', dateStr)
        .orderBy('checkIn', 'desc')
        .limit(1)
        .get();
        
    const lastSession = !snapshot.empty ? snapshot.docs[0].data() : null;
    let currentState = 'IDLE';
    let sessionId = null;

    if (lastSession) {
        if (!lastSession.checkOut) {
            currentState = lastSession.onBreak ? 'ON_BREAK' : 'WORKING';
            sessionId = snapshot.docs[0].id;
        }
    }

    res.json({ success: true, currentState, sessionId });
});

/**
 * Endpoint: Attendance Scan (Kiosk Mode)
 */
app.post('/api/attendance/scan', async (req, res) => {
    const { employeeId, actionType } = req.body;
    const doc = await db.employees().doc(employeeId).get();
    if (!doc.exists) return res.status(404).json({ success: false, message: 'Identity not recognized.' });
    const emp = doc.data();
    if (emp.isActive === false) return res.status(403).json({ success: false, message: 'Access denied.' });

    const processAction = async (empId, empName, action) => {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timestamp = now.toISOString();

        const snapshot = await db.daily_sessions()
            .where('employeeId', '==', empId)
            .where('date', '==', dateStr)
            .orderBy('checkIn', 'desc')
            .limit(1)
            .get();
        
        let sessionDoc = !snapshot.empty ? snapshot.docs[0] : null;
        let session = sessionDoc ? sessionDoc.data() : null;

        let currentState = 'IDLE';
        if (session && !session.checkOut) currentState = session.onBreak ? 'ON_BREAK' : 'WORKING';

        if (action === 'in') {
            if (currentState !== 'IDLE') return { success: false, message: 'Already checked in.' };
            const newSession = {
                employeeId: empId, employeeName: empName, date: dateStr, checkIn: timestamp,
                checkOut: null, onBreak: false, breakHistory: [], totalBreakMinutes: 0, status: 'active'
            };
            await db.daily_sessions().add(newSession);
            await logAttendance(empId, empName, 'CLOCK_IN', timestamp);
            return { success: true, message: `Welcome ${empName}!`, action: 'IN' };
        }

        if (currentState === 'IDLE') return { success: false, message: 'No active session.' };

        if (action === 'break_start') {
            if (currentState !== 'WORKING') return { success: false, message: 'Not working.' };
            await sessionDoc.ref.update({ onBreak: true, status: 'on_break', breakHistory: admin.firestore.FieldValue.arrayUnion({ start: timestamp, end: null }) });
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
                await sessionDoc.ref.update({ onBreak: false, status: 'active', breakHistory: history, totalBreakMinutes: admin.firestore.FieldValue.increment(Math.floor(diff)) });
            }
            await logAttendance(empId, empName, 'BREAK_END', timestamp);
            return { success: true, message: 'Break ended.', action: 'BREAK_END' };
        }

        if (action === 'out') {
            await sessionDoc.ref.update({ checkOut: timestamp, status: 'completed', onBreak: false });
            await logAttendance(empId, empName, 'CLOCK_OUT', timestamp);
            return { success: true, message: 'Goodbye!', action: 'OUT' };
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
});


/**
 * Endpoint: Fetch Raw Attendance Logs
 */
app.get('/api/attendance/logs/raw', async (req, res) => {
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
app.get('/api/daily-sessions', async (req, res) => {
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
 * Endpoint: Bulk Edit Logs
 */
app.put('/api/attendance/logs/bulk-edit', async (req, res) => {
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
app.delete('/api/attendance/logs', async (req, res) => {
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
app.post('/api/attendance/sessions/recalculate', async (req, res) => {
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
            const last = s.breakHistory[s.breakHistory.length-1];
            if (last && !last.end) { last.end = log.timestamp; s.totalBreakMinutes += Math.floor((new Date(log.timestamp)-new Date(last.start))/60000); }
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

// Scheduled auto open/close functionality
async function checkScheduledOpenClose() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    if (h === 23 && m >= 30) await db.broadcast().update({ store_closed: true });
    else if (h === 5 && m >= 30) await db.broadcast().update({ store_closed: false });
}

// Run scheduled check every minute
setInterval(checkScheduledOpenClose, 60 * 1000);

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
        checkScheduledOpenClose();
    });
} else if (!isVercel) {
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server is running on http://localhost:${port}`);
        console.log('To access from other devices on your network, use your local IP address.');
        console.log(`Example: http://192.168.1.100:${port}`);
        checkScheduledOpenClose();
    });
}

// Export for Vercel (Cleanup)
if (isVercel) {
    console.log('📦 Vercel Module Exported');
}
