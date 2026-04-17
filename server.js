const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const shortid = require('shortid');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
// Heavy dependencies wrapped for serverless compatibility
let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    console.warn('Puppeteer not available in this environment');
}

let Database;
try {
    Database = require('better-sqlite3');
} catch (e) {
    console.warn('better-sqlite3 not available in this environment');
}

// Detect Vercel environment
const isVercel = process.env.VERCEL === '1';
const dbPath = isVercel ? path.join('/tmp', 'db.json') : path.join(__dirname, 'db.json');
const esrDbPath = isVercel ? path.join('/tmp', 'esrjpg.db') : path.join(__dirname, 'esrjpg.db');

const adapter = new FileSync(dbPath);
const db = low(adapter);

// Set up the database defaults
db.defaults({ 
    store_closed: false, 
    employees: [], 
    nextShiftId: 1, 
    broadcast: { message: "", timestamp: 0 },
    settings: {
        accentColor: "#F95A2C",
        theme: "light",
        sidebarCollapsed: false,
        adminPassword: "admin12nammamart" 
    }
}).write();

// Set up SQLite database for ESR Reports - with fallback for Node.js v24 compatibility
let esrDb;
try {
    if (!Database) throw new Error('better-sqlite3 module not loaded');
    esrDb = new Database(esrDbPath);
} catch (dbError) {
    console.warn('Warning: better-sqlite3 failed to load (Node.js version incompatibility). Using fallback mode.');
    console.warn('ESR Reports functionality will be limited. The server will continue to run.');
    // Create a mock database object that won't crash the server
    esrDb = {
        prepare: () => ({
            run: () => { },
            all: () => [],
            get: () => null
        }),
        exec: () => { }
    };
}
esrDb.exec(`
    CREATE TABLE IF NOT EXISTS esr_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        report_data TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(employee_id, date, shift_id)
    );
`);
// Ensure table exists without dropping it every time
esrDb.exec(`
    CREATE TABLE IF NOT EXISTS esr_jpgs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT NOT NULL,
        date TEXT NOT NULL,
        shift_id TEXT NOT NULL,
        jpg_data BLOB NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);
// Add shift_id column if not exists (for existing databases)
try {
    esrDb.exec(`ALTER TABLE esr_reports ADD COLUMN shift_id TEXT;`);
} catch (error) {
    // Ignore if column already exists
}

const app = express();
const port = 3000;

// Serve static files from the current directory
app.use(express.static(__dirname));
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

// Admin approval OTP functionality removed - employees can login directly

// Test close flag
let testCloseDone = false;

// Handle login requests
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !username.trim()) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }
    if (!password || !password.trim()) {
        return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    const trimmedUsername = username.trim();

    // Check admin credentials from database
    const adminSettings = db.get('settings').value() || { adminPassword: 'admin12nammamart' };
    if ((trimmedUsername === 'nammamart' || trimmedUsername === 'admin') && password === adminSettings.adminPassword) {
        return res.json({ success: true, redirectUrl: '/admin' });
    }

    const storeClosed = db.get('store_closed').value();
    console.log(`Login attempt - Username: "${trimmedUsername}", Store closed: ${storeClosed}`);

    if (storeClosed) {
        console.log(`Login failed for "${trimmedUsername}": Store is closed`);
        return res.status(403).json({
            success: false,
            message: 'Store is temporarily CLOSED. Contact admin to open the store.',
            code: 'STORE_CLOSED'
        });
    }

    const employee = db.get('employees').find({ username: trimmedUsername }).value();

    if (!employee) {
        console.log(`Login failed for "${trimmedUsername}": User not found`);
        return res.status(401).json({
            success: false,
            message: `No account found with username "${trimmedUsername}". Use your Employee-ID as username.`,
            code: 'USER_NOT_FOUND'
        });
    }

    if (employee.isActive === false) {
        console.log(`Login failed for "${trimmedUsername}": User deactivated`);
        return res.status(403).json({
            success: false,
            message: 'You are not allowed by admin',
            code: 'USER_DEACTIVATED'
        });
    }

    const validPassword = bcrypt.compareSync(password, employee.password);

    if (!validPassword) {
        console.log(`Login failed for "${trimmedUsername}": Incorrect password`);
        return res.status(401).json({
            success: false,
            message: 'Incorrect password. Please try again.',
            code: 'INVALID_PASSWORD'
        });
    }

    console.log(`Login successful for user "${trimmedUsername}"`);

    if (!employee.counter_selections) {
        employee.counter_selections = [];
        db.get('employees').find({ id: employee.id }).assign({ counter_selections: [] }).write();
    }

    const today = new Date().toISOString().split('T')[0];
    
    let hasActiveShift = false;
    if (employee.counter_selections.length > 0) {
        const lastShift = employee.counter_selections[employee.counter_selections.length - 1];
        if (!lastShift.shiftEndTime && lastShift.shiftStartTime && lastShift.shiftStartTime.startsWith(today)) {
            hasActiveShift = true;
        }
    }

    // Self-healing legacy check: if root shiftEnded flag is somehow true from legacy sessions, force close the anomaly.
    if (employee.shiftEnded) {
        hasActiveShift = false;
        if (employee.counter_selections.length > 0) {
            const lastShift = employee.counter_selections[employee.counter_selections.length - 1];
            if (!lastShift.shiftEndTime) {
                lastShift.shiftEndTime = new Date().toISOString(); // Patch database leak
            }
        }
        db.get('employees').find({ id: employee.id }).assign({ 
            shiftEnded: false,
            startShiftTime: new Date().toISOString(),
            counter_selections: employee.counter_selections
        }).write();
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

// Handle add employee requests
app.post('/api/employees', (req, res) => {
    const employeeData = req.body;

    // Set username to employee-id
    employeeData.username = employeeData['employee-id'];
    delete employeeData['employee-id'];

    // Encrypt the password
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(employeeData.password, salt);
    employeeData.password = hashedPassword;

    // Generate a unique ID for the employee
    employeeData.id = shortid.generate();

    // Initialize shiftEnded to false for new employees
    employeeData.shiftEnded = false;

    // Initialize counter_selections as empty array
    employeeData.counter_selections = [];

    // Save the employee to the database
    db.get('employees').push(employeeData).write();

    res.json({ success: true, message: 'Employee added successfully.' });
});

// Get all employees
app.get('/api/employees', (req, res) => {
    const employees = db.get('employees').value();
    res.json(employees);
});

// Delete an employee
app.delete('/api/employees/:id', (req, res) => {
    const employeeId = req.params.id;
    db.get('employees').remove({ id: employeeId }).write();
    res.json({ success: true, message: 'Employee deleted successfully.' });
});

// Post a new broadcast message
app.post('/api/broadcast', (req, res) => {
    const { message } = req.body;
    const timestamp = Date.now();
    // Update db.json
    db.set('broadcast', { message: message || "", timestamp }).write();
    res.json({ success: true, message: 'Broadcast updated successfully.', timestamp });
});

// Get current broadcast message
app.get('/api/broadcast', (req, res) => {
    const broadcast = db.get('broadcast').value() || { message: "", timestamp: 0 };
    res.json({ success: true, broadcast });
});

// Get store status
app.get('/api/store-status', (req, res) => {
    const closed = db.get('store_closed').value();
    res.json({ success: true, store_closed: !!closed });
});

// Toggle store status
app.post('/api/store-status', (req, res) => {
    const { store_closed } = req.body;
    db.set('store_closed', !!store_closed).write();
    res.json({ success: true, store_closed: !!store_closed });
});

// Get a single employee by ID
app.get('/api/employees/:id', (req, res) => {
    const employeeId = req.params.id;
    const employee = db.get('employees').find({ id: employeeId }).value();
    if (employee) {
        res.json(employee);
    } else {
        res.status(404).json({ success: false, message: 'Employee not found.' });
    }
});

// Update an employee
app.put('/api/employees/:id', (req, res) => {
    const employeeId = req.params.id;
    const employeeData = req.body;

    // If the password is being updated, re-encrypt it
    if (employeeData.password && employeeData.password.trim() !== '') {
        const salt = bcrypt.genSaltSync(10);
        const hashedPassword = bcrypt.hashSync(employeeData.password, salt);
        employeeData.password = hashedPassword;
    } else {
        // Remove password from payload so we don't overwrite the existing hash with empty string
        delete employeeData.password;
    }

    db.get('employees').find({ id: employeeId }).assign(employeeData).write();

    res.json({ success: true, message: 'Employee updated successfully.' });
});

// Register or update an employee's face descriptor
app.post('/api/employees/:id/face', (req, res) => {
    const employeeId = req.params.id;
    const { descriptor } = req.body;
    
    if (!descriptor || !Array.isArray(descriptor)) {
        return res.status(400).json({ success: false, message: 'Invalid face descriptor data provided.' });
    }

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    db.get('employees').find({ id: employeeId }).assign({ faceDescriptor: descriptor }).write();
    res.json({ success: true, message: 'Face descriptor recorded successfully.' });
});

// Handle counter selection data submission (FIXED SHIFT START)
app.post('/api/counter-selection', (req, res) => {
    const { employeeId, counter, pineLabValue, timestamp } = req.body;

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Ensure counter_selections exists
    let selections = employee.counter_selections || [];

    // Generate shift ID (3 digits + 3 letters from name in caps)
    const shiftNumber = db.get('nextShiftId').value();
    const namePart = employee.name.replace(/\s/g, '').substr(0, 3).toUpperCase();
    const shiftId = shiftNumber.toString().padStart(3, '0') + namePart;
    db.set('nextShiftId', shiftNumber + 1).write();

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

    // Push safely
    selections.push(newShift);

    // Save back properly (THIS is the part your original code broke)
    db.get('employees')
        .find({ id: employeeId })
        .assign({ counter_selections: selections, shiftEnded: false })
        .write();

    return res.json({ success: true, message: 'Shift started successfully.' });
});

// Handle extra data submission
app.post('/api/extra', (req, res) => {
    const extraData = req.body;
    const employeeId = extraData.employeeId; // Assume employeeId is sent from client

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Initialize extra array if not exists
    if (!employee.extra) {
        employee.extra = [];
    }

    // Add the extra data
    employee.extra.push({
        id: shortid.generate(),
        itemName: extraData.itemName,
        billNumber: extraData.billNumber,
        extraAmount: extraData.extraAmount,
        modeOfPay: extraData.modeOfPay,
        timestamp: new Date().toISOString()
    });

    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Extra data saved successfully.' });
});

// Get extra data for an employee
app.get('/api/extra', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
            let data = employee.extra || [];
            // Filter out invalid items
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
app.post('/api/delivery', (req, res) => {
    const deliveryData = req.body;
    const employeeId = deliveryData.employeeId;

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (!employee.delivery) {
        employee.delivery = [];
    }

    employee.delivery.push({
        id: shortid.generate(),
        billNumber: deliveryData.billNumber,
        amount: deliveryData.amount,
        extraAmount: deliveryData.extraAmount,
        totalAmount: deliveryData.totalAmount,
        modeOfPay: deliveryData.modeOfPay,
        delivered: false,
        timestamp: new Date().toISOString()
    });

    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Delivery data saved successfully.' });
});

// Get delivery data for an employee
app.get('/api/delivery', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
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
app.post('/api/bill_paid', (req, res) => {
    const billPaidData = req.body;
    const employeeId = billPaidData.employeeId;

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (!employee.bill_paid) {
        employee.bill_paid = [];
    }

    employee.bill_paid.push({
        id: shortid.generate(),
        vendorSupplier: billPaidData.vendorSupplier,
        amountPaid: billPaidData.amountPaid,
        timestamp: new Date().toISOString()
    });

    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Bill paid data saved successfully.' });
});

// Get bill_paid data for an employee
app.get('/api/bill_paid', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
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
app.post('/api/issue', (req, res) => {
    const issueData = req.body;
    const employeeId = issueData.employeeId;

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (!employee.issue) {
        employee.issue = [];
    }

    employee.issue.push({
        id: shortid.generate(),
        billNumber: issueData.billNumber,
        issueDescription: issueData.issueDescription,
        timestamp: new Date().toISOString()
    });

    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Issue data saved successfully.' });
});

// Get issue data for an employee
app.get('/api/issue', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
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
app.post('/api/retail_credit', (req, res) => {
    const retailCreditData = req.body;
    const employeeId = retailCreditData.employeeId;

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (!employee.retail_credit) {
        employee.retail_credit = [];
    }

    employee.retail_credit.push({
        id: shortid.generate(),
        phoneNumber: retailCreditData.phoneNumber,
        amount: retailCreditData.amount,
        modeOfPay: retailCreditData.modeOfPay,
        timestamp: new Date().toISOString()
    });

    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Retail credit data saved successfully.' });
});

// Get retail_credit data for an employee
app.get('/api/retail_credit', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
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
app.get('/api/history', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee) return res.status(404).json({ message: 'Employee not found' });

        let history = [];
        
        // Helper to map record arrays directly into the history timeline
        const addHistory = (arr, type) => {
            if (arr && Array.isArray(arr)) {
                arr.forEach(item => {
                    if (item && item.timestamp) {
                        history.push({
                            ...item,
                            type: type,
                            action: item.action || 'add' // default to 'add' for legacy records
                        });
                    }
                });
            }
        };

        addHistory(employee.extra, 'extra');
        addHistory(employee.delivery, 'delivery');
        addHistory(employee.bill_paid, 'bill_paid');
        addHistory(employee.issue, 'issue');
        addHistory(employee.retail_credit, 'retail_credit');

        // Include any explicit audit logs if they exist
        if (employee.audit_history && Array.isArray(employee.audit_history)) {
            employee.audit_history.forEach(log => history.push(log));
        }

        // Apply new range filters to history
        if (date) {
            history = history.filter(item => item.timestamp && item.timestamp.split('T')[0] === date);
        } else if (month) {
            history = history.filter(item => item.timestamp && item.timestamp.startsWith(month));
        } else if (startDate && endDate) {
            history = history.filter(item => {
                if (!item.timestamp) return false;
                const ts = item.timestamp.split('T')[0];
                return ts >= startDate && ts <= endDate;
            });
        }

        // Filter by shift bounds if provided
        if (shiftStartTime) {
            const start = new Date(shiftStartTime);
            if (!isNaN(start.getTime())) {
                history = history.filter(item => {
                    const ts = new Date(item.timestamp);
                    return ts >= start;
                });
                if (shiftEndTime) {
                    const end = new Date(shiftEndTime);
                    if (!isNaN(end.getTime())) {
                        history = history.filter(item => {
                            const ts = new Date(item.timestamp);
                            return ts <= end;
                        });
                    }
                }
            }
        }

        // Sort globally by timestamp, newest first
        history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(history);
    } catch (error) {
        console.error('Error in /api/history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Formalize shift termination
app.post('/api/end-shift', (req, res) => {
    try {
        const { employeeId } = req.body;
        if (!employeeId) return res.status(400).json({ success: false, message: 'Missing employeeId' });
        
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        
        if (employee.counter_selections && employee.counter_selections.length > 0) {
            const activeShift = employee.counter_selections[employee.counter_selections.length - 1];
            if (!activeShift.shiftEndTime) {
                activeShift.shiftEndTime = new Date().toISOString();
                employee.shiftEnded = true;
                db.get('employees').find({ id: employeeId }).assign(employee).write();
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
app.put('/api/:type/:id', (req, res) => {
    try {
        const { type, id } = req.params;
        const validTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid record type' });
        
        const data = req.body;
        const employeeId = data.employeeId;
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee || !employee[type]) return res.status(404).json({ message: 'Record array not found' });

        const index = employee[type].findIndex(item => item && item.id === id);
        if (index === -1) return res.status(404).json({ message: 'Record not found' });

        const original = employee[type][index];
        const updated = { ...original, ...data, timestamp: original.timestamp, id: original.id };
        employee[type][index] = updated;

        if(!employee.audit_history) employee.audit_history = [];
        employee.audit_history.push({
            id: shortid.generate(),
            action: 'edit',
            type: type,
            reason: data.editReason || 'User edited record via UI',
            timestamp: new Date().toISOString(),
            originalRecord: original,
            newRecord: Object.keys(data).reduce((acc, k) => { if(original[k] !== data[k] && typeof original[k] !== 'undefined') acc[k] = data[k]; return acc; }, {})
        });

        db.get('employees').find({ id: employeeId }).assign(employee).write();
        res.json({ success: true });
    } catch(err) {
        console.error('PUT Error:', err);
        res.status(500).json({ message: 'System error' });
    }
});

// Generalized Delete Record Route
app.delete('/api/:type/:id', (req, res) => {
    try {
        const { type, id } = req.params;
        const { employeeId, reason } = req.query;
        const validTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
        
        if (!validTypes.includes(type)) return res.status(400).json({ message: 'Invalid record type' });
        if (!employeeId) return res.status(400).json({ message: 'Missing employeeId' });

        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee || !employee[type]) return res.status(404).json({ message: 'Record array not found' });

        const index = employee[type].findIndex(item => item && item.id === id);
        if (index === -1) return res.status(404).json({ message: 'Record not found' });

        const original = employee[type][index];
        employee[type].splice(index, 1);

        if(!employee.audit_history) employee.audit_history = [];
        employee.audit_history.push({
            id: shortid.generate(),
            action: 'delete',
            type: type,
            reason: reason || 'User deleted record via UI',
            timestamp: new Date().toISOString(),
            originalRecord: original
        });

        db.get('employees').find({ id: employeeId }).assign(employee).write();
        res.json({ success: true });
    } catch(err) {
        console.error('DELETE Error:', err);
        res.status(500).json({ message: 'System error' });
    }
});

// Restore deleted item
app.post('/api/restore/:historyId', (req, res) => {
    try {
        const { historyId } = req.params;
        const employees = db.get('employees').value();
        for (let i = 0; i < employees.length; i++) {
            let emp = employees[i];
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const log = emp.audit_history[histIndex];
                    if (log.action === 'delete') {
                        if(!emp[log.type]) emp[log.type] = [];
                        emp[log.type].push(log.originalRecord);
                        emp.audit_history.splice(histIndex, 1);
                        db.get('employees').find({ id: emp.id }).assign(emp).write();
                        return res.json({ success: true });
                    }
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch(err) { res.status(500).json({ message: 'Error restoring' }); }
});

// Revert edit item
app.post('/api/revert-edit/:historyId', (req, res) => {
    try {
        const { historyId } = req.params;
        const employees = db.get('employees').value();
        for (let i = 0; i < employees.length; i++) {
            let emp = employees[i];
            if (emp.audit_history) {
                const histIndex = emp.audit_history.findIndex(h => h.id === historyId);
                if (histIndex !== -1) {
                    const log = emp.audit_history[histIndex];
                    if (log.action === 'edit') {
                        const mainIndex = emp[log.type].findIndex(r => r && r.id === log.originalRecord.id);
                        if (mainIndex !== -1) {
                            emp[log.type][mainIndex] = log.originalRecord;
                        } else {
                            if(!emp[log.type]) emp[log.type] = [];
                            emp[log.type].push(log.originalRecord);
                        }
                        emp.audit_history.splice(histIndex, 1);
                        db.get('employees').find({ id: emp.id }).assign(emp).write();
                        return res.json({ success: true });
                    }
                }
            }
        }
        res.status(404).json({ message: 'Audit log not found' });
    } catch(err) { res.status(500).json({ message: 'Error reverting' }); }
});

// Get counter_data for an employee
app.get('/api/counter_data', (req, res) => {
    try {
        const { employeeId, date, month, startDate, endDate, shiftStartTime, shiftEndTime } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
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

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    if (!employee.email) {
        return res.status(400).json({ success: false, message: 'Employee email not found.' });
    }

    // Generate 5-digit OTP
    const otp = Math.floor(10000 + Math.random() * 90000).toString();
    employeeEndShiftOtp.otp = otp;
    employeeEndShiftOtp.expiresAt = Date.now() + 5 * 60 * 1000; // valid for 5 minutes
    employeeEndShiftOtp.employeeId = employeeId;

    // Prepare email
    const mailOptions = {
        from: emailConfig.from,
        to: employee.email,
        subject: 'Namma Mart - Employee End Shift OTP',
        text: `Your End Shift OTP is: ${otp}. It is valid for 5 minutes.`
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);

        const responseBody = { success: true, message: 'OTP sent to your email.' };
        return res.json(responseBody);
    } catch (err) {
        console.error('Error sending employee OTP email:', err);
        // Clear OTP on failure
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
app.post('/api/verify-employee-otp', async (req, res) => {
    const { otp, employeeId } = req.body;
    if (isEmpty(otp) || isEmpty(employeeId)) {
        return res.status(400).json({ success: false, message: 'OTP and Employee ID are required.' });
    }

    if (!employeeEndShiftOtp.otp || Date.now() > employeeEndShiftOtp.expiresAt || employeeEndShiftOtp.employeeId !== employeeId) {
        employeeEndShiftOtp.otp = null;
        employeeEndShiftOtp.expiresAt = 0;
        employeeEndShiftOtp.employeeId = null;
        return res.status(400).json({ success: false, message: 'OTP expired or not requested.' });
    }

    if (String(otp).trim() !== String(employeeEndShiftOtp.otp)) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    employeeEndShiftOtp.otp = null;
    employeeEndShiftOtp.expiresAt = 0;
    employeeEndShiftOtp.employeeId = null;

    // Record endShiftTime and set shiftEnded true
    const endShiftTime = new Date().toISOString();
    const employeeForShiftEnd = db.get('employees').find({ id: employeeId }).value();
    let lastShiftIndex = -1;
    if (employeeForShiftEnd && employeeForShiftEnd.counter_selections) {
        const today = new Date().toISOString().split('T')[0];
        lastShiftIndex = employeeForShiftEnd.counter_selections.reduce((lastIndex, selection, currentIndex) => {
            if (selection.shiftStartTime && selection.shiftStartTime.startsWith(today)) {
                return currentIndex;
            }
            return lastIndex;
        }, -1);

        if (lastShiftIndex !== -1) {
            employeeForShiftEnd.counter_selections[lastShiftIndex].shiftEndTime = endShiftTime;
        }
    }
    db.get('employees').find({ id: employeeId }).assign({ shiftEnded: true, counter_selections: employeeForShiftEnd.counter_selections }).write();

    // Fetch employee data for report
    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found after verification.' });
    }

    const employeeName = employee.name || 'Employee';

    // Generate and save ESR Text Report
    const date = endShiftTime.split('T')[0];
    let reportText = '';
    try {
        // Get shift details
        const shiftStartTime = employeeForShiftEnd.counter_selections[lastShiftIndex].shiftStartTime;
        const shiftEndTimeFormatted = endShiftTime;
        const shiftId = employeeForShiftEnd.counter_selections[lastShiftIndex].shiftId;

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
    const startShiftTime = employee.startShiftTime || 'N/A';

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
        to: employee.email,
        subject: 'Namma Mart - Shift End Report',
        text: emailText
    };

    try {
        await emailConfig.transporter.sendMail(mailOptions);
        console.log(`Shift end report email with attachment sent to ${employee.email}`);
    } catch (err) {
        console.error('Error sending shift end report email:', err);
        // Not failing the API call, just logging
    }

    return res.json({ success: true, message: 'OTP verified. Shift ended and email sent.' });
});

/**
 * End employee shift with password verification
 */
app.post('/api/end-employee-shift', async (req, res) => {
    const { password, employeeId } = req.body;
    if (!password || !employeeId) {
        return res.status(400).json({ success: false, message: 'Password and Employee ID are required.' });
    }

    const employeeRecord = db.get('employees').find({ id: employeeId }).value();
    if (!employeeRecord) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Verify employee password
    if (!bcrypt.compareSync(password, employeeRecord.password)) {
        return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    // Record endShiftTime and set shiftEnded true
    const endShiftTime = new Date().toISOString();
    const employeeForShiftEnd = db.get('employees').find({ id: employeeId }).value();
    let lastShiftIndex = -1;
    if (employeeForShiftEnd && employeeForShiftEnd.counter_selections) {
        const today = new Date().toISOString().split('T')[0];
        lastShiftIndex = employeeForShiftEnd.counter_selections.reduce((lastIndex, selection, currentIndex) => {
            if (selection.shiftStartTime && selection.shiftStartTime.startsWith(today)) {
                return currentIndex;
            }
            return lastIndex;
        }, -1);

        if (lastShiftIndex !== -1) {
            employeeForShiftEnd.counter_selections[lastShiftIndex].shiftEndTime = endShiftTime;
        }
    }
    db.get('employees').find({ id: employeeId }).assign({ shiftEnded: true, counter_selections: employeeForShiftEnd.counter_selections }).write();

    // Use the employee data fetched earlier for report
    const employeeName = employeeRecord.name || 'Employee';

    // Generate and save ESR Text Report
    const date = endShiftTime.split('T')[0];
    let reportText = '';
    try {
        // Get shift details
        const shiftStartTime = employeeForShiftEnd.counter_selections[lastShiftIndex].shiftStartTime;
        const shiftEndTimeFormatted = endShiftTime;
        const shiftId = employeeForShiftEnd.counter_selections[lastShiftIndex].shiftId;

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
app.post('/api/verify-admin-approval-otp', (req, res) => {
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

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ success: false, message: 'Employee not found.' });
    }

    // Set shiftEnded to false and record startShiftTime to current time
    db.get('employees').find({ id: employeeId }).assign({ shiftEnded: false, startShiftTime: new Date().toISOString() }).write();

    return res.json({ success: true, message: 'OTP verified. New shift started.', redirectUrl: '/counter_selection.html', employeeId });
});

// Confirm the OTP and then close the store (end shift)
app.post('/api/confirm-endshift-otp', (req, res) => {
    const { otp } = req.body;
    if (!otp) {
        return res.status(400).json({ success: false, message: 'OTP is required.' });
    }

    if (!endShiftOtp.otp || Date.now() > endShiftOtp.expiresAt) {
        // Clear stale OTP
        endShiftOtp.otp = null;
        endShiftOtp.expiresAt = 0;
        return res.status(400).json({ success: false, message: 'OTP expired or not requested.' });
    }

    if (String(otp).trim() !== String(endShiftOtp.otp)) {
        return res.status(401).json({ success: false, message: 'Invalid OTP.' });
    }

    // OTP valid — close the store
    endShiftOtp.otp = null;
    endShiftOtp.expiresAt = 0;
    db.set('store_closed', true).write();
    return res.json({ success: true, message: 'Shift ended, store closed.' });
});

/**
 * Confirm admin password and close the store (end shift)
 */
app.post('/api/confirm-endshift-password', (req, res) => {
    const { password } = req.body;
    if (!password) {
        return res.status(400).json({ success: false, message: 'Password is required.' });
    }

    if (password !== 'admin12nammamart') {
        return res.status(401).json({ success: false, message: 'Invalid password.' });
    }

    // Password valid — close the store
    db.set('store_closed', true).write();
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

const { isEmpty } = require('lodash');

// Verify admin password for start shift and record startShiftTime
app.post('/api/start-shift', (req, res) => {
    const { password } = req.body;
    if (password === 'admin12nammamart') {
        const startShiftTime = new Date().toISOString();
        db.set('store_closed', false).write();
        db.set('startShiftTime', startShiftTime).write();
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
app.get('/api/store-status', (req, res) => {
    const storeClosed = db.get('store_closed').value();
    res.json({ storeClosed });
});

// Toggle store status (open/close) - requires admin password
app.post('/api/toggle-store', (req, res) => {
    const { password, action } = req.body;

    // Validate password
    if (password !== 'admin12nammamart') {
        return res.status(401).json({ success: false, message: 'Invalid admin password.' });
    }

    if (action === 'open') {
        db.set('store_closed', false).write();
        return res.json({ success: true, message: 'Store is now OPEN.', storeClosed: false });
    } else if (action === 'close') {
        db.set('store_closed', true).write();
        return res.json({ success: true, message: 'Store is now CLOSED.', storeClosed: true });
    } else {
        return res.status(400).json({ success: false, message: 'Invalid action. Use "open" or "close".' });
    }
});



// Update data entry
app.put('/api/:type/:id', (req, res) => {
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

    const employee = db.get('employees').find({ id: employeeId }).value();
    if (!employee) {
        return res.status(404).json({ message: 'Employee not found' });
    }

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
    db.get('employees').find({ id: employeeId }).assign(employee).write();

    res.json({ success: true, message: 'Data updated successfully.' });
});

// Delete data entry
// Permanently delete a history entry by id (specific route placed before generic delete)
app.delete('/api/permanently-delete-history/:id', (req, res) => {
    const { id } = req.params;

    const employees = db.get('employees').value();
    let found = false;

    for (let emp of employees) {
        if (emp.history && Array.isArray(emp.history)) {
            const index = emp.history.findIndex(h => h.id === id);
            if (index !== -1) {
                emp.history.splice(index, 1);
                found = true;
                break;
            }
        }
    }

    if (found) {
        db.write();
        res.json({ success: true, message: 'History entry deleted permanently.' });
    } else {
        res.status(404).json({ success: false, message: 'History entry not found.' });
    }
});

app.delete('/api/:type/:id', (req, res) => {
    let { type, id } = req.params;
    if (type === 'counter_data') {
        type = 'counter_selections';
    }
    const { employeeId } = req.query;
    // Reason can be passed as query or body (DELETE bodies are allowed by some clients)
    const reason = (req.query.reason) || (req.body && req.body.reason) || '';

    if (!reason || String(reason).trim() === '') {
        return res.status(400).json({ message: 'A reason is required to delete an entry.' });
    }

    const employee = db.get('employees').find({ id: employeeId });
    if (!employee.value()) {
        return res.status(404).json({ message: 'Employee not found' });
    }

    const dataArray = employee.get(type).value();
    if (!dataArray) {
        return res.status(404).json({ message: 'Data type not found' });
    }

    const index = dataArray.findIndex(item => item && item.id === id);
    if (index === -1) {
        return res.status(404).json({ message: 'Data entry not found' });
    }

    // Store original data in history before deletion (include provided reason)
    if (!employee.value().history) {
        employee.value().history = [];
    }
    const originalData = { ...dataArray[index] };
    employee.value().history.push({
        id: shortid.generate(),
        timestamp: new Date().toISOString(),
        action: 'delete',
        type: type,
        itemId: id,
        reason: String(reason),
        originalData: originalData,
        modifiedData: null
    });

    dataArray.splice(index, 1);
    db.write();

    res.json({ success: true, message: 'Data deleted successfully.' });
});

// Get history data for an employee
app.get('/api/history', (req, res) => {
    try {
        const { employeeId, date, type } = req.query;
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (employee) {
            let data = employee.history || [];
            if (date) {
                // date is in YYYY-MM-DD format
                data = data.filter(item => {
                    if (!item.timestamp) return false;
                    const parsed = new Date(item.timestamp);
                    if (isNaN(parsed.getTime())) return false;
                    return parsed.toISOString().split('T')[0] === date;
                });
            }
            if (type) {
                data = data.filter(item => item.type === type);
            }
            res.json(data);
        } else {
            res.status(404).json({ message: 'Employee not found' });
        }
    } catch (error) {
        console.error('Error in /api/history:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Restore data entry
app.post('/api/restore/:id', (req, res) => {
    const { id } = req.params;

    // Find the history entry
    let historyEntry;
    const employees = db.get('employees').value();
    for (let emp of employees) {
        if (emp.history) {
            historyEntry = emp.history.find(h => h.id === id);
            if (historyEntry) {
                // Restore the data to the appropriate array
                if (!emp[historyEntry.type]) {
                    emp[historyEntry.type] = [];
                }
                emp[historyEntry.type].push(historyEntry.originalData);
                // Remove the history entry
                emp.history = emp.history.filter(h => h.id !== id);
                db.write();
                return res.json({ success: true, message: 'Data restored successfully.' });
            }
        }
    }

    res.status(404).json({ message: 'History entry not found' });
});

// Revert edit entry
app.post('/api/revert-edit/:id', (req, res) => {
    const { id } = req.params;

    // Find the history entry
    let historyEntry;
    const employees = db.get('employees').value();
    for (let emp of employees) {
        if (emp.history) {
            historyEntry = emp.history.find(h => h.id === id);
            if (historyEntry) {
                // Find the current data entry and revert it
                const dataArray = emp[historyEntry.type];
                if (dataArray) {
                    const index = dataArray.findIndex(item => item.id === historyEntry.itemId);
                    if (index !== -1) {
                        // Revert to original data
                        dataArray[index] = { ...historyEntry.originalData };
                        // Remove the history entry
                        emp.history = emp.history.filter(h => h.id !== id);
                        db.write();
                        return res.json({ success: true, message: 'Edit reverted successfully.' });
                    }
                }
            }
        }
    }

    res.status(404).json({ message: 'History entry not found' });
});

app.get('/api/todays-report-summary', (req, res) => {
    try {
        const { employeeId, date, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId || !date) {
            return res.status(400).json({ success: false, message: 'employeeId and date are required.' });
        }
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }
        const extraData = employee.extra || [];
        const retailCreditData = employee.retail_credit || [];

        // Filter extra data by date (YYYY-MM-DD)
        let filteredExtraData = extraData.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp);
            if (isNaN(itemDate.getTime())) return false;
            return itemDate.toISOString().split('T')[0] === date;
        });

        // Filter retail_credit data by date
        let filteredRetailCreditData = retailCreditData.filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp);
            if (isNaN(itemDate.getTime())) return false;
            return itemDate.toISOString().split('T')[0] === date;
        });

        // Further filter by shift times if provided
        if (shiftStartTime) {
            const start = new Date(shiftStartTime);
            if (!isNaN(start.getTime())) {
                filteredExtraData = filteredExtraData.filter(item => {
                    const ts = new Date(item.timestamp);
                    return ts >= start;
                });
                filteredRetailCreditData = filteredRetailCreditData.filter(item => {
                    const ts = new Date(item.timestamp);
                    return ts >= start;
                });
                if (shiftEndTime) {
                    const end = new Date(shiftEndTime);
                    if (!isNaN(end.getTime())) {
                        filteredExtraData = filteredExtraData.filter(item => {
                            const ts = new Date(item.timestamp);
                            return ts <= end;
                        });
                        filteredRetailCreditData = filteredRetailCreditData.filter(item => {
                            const ts = new Date(item.timestamp);
                            return ts <= end;
                        });
                    }
                }
            }
        }

        // Aggregate totals by payment type from extra data
        let upiPinelab = 0;
        let cardPinelab = 0;
        let upiPaytm = 0;
        let cardPaytm = 0;
        let cash = 0;
        let retailCredit = 0;

        filteredExtraData.forEach(item => {
            const mode = (item.modeOfPay || '').toLowerCase();
            const amount = parseFloat(item.extraAmount) || 0;
            if (mode === 'upi pinelab') {
                upiPinelab += amount;
            } else if (mode === 'card pinelab') {
                cardPinelab += amount;
            } else if (mode === 'upi paytm') {
                upiPaytm += amount;
            } else if (mode === 'card paytm') {
                cardPaytm += amount;
            } else if (mode === 'cash') {
                cash += amount;
            }
        });

        // Aggregate total retail credit from retail_credit data
        filteredRetailCreditData.forEach(item => {
            const amount = parseFloat(item.amount) || 0;
            retailCredit += amount;
        });

        res.json({
            upiPinelab,
            cardPinelab,
            upiPaytm,
            cardPaytm,
            cash,
            retailCredit
        });
    } catch (error) {
        console.error('Error in /api/todays-report-summary:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Get data activity summary (deleted, edited, inputed counts)
app.get('/api/data-activity-summary', (req, res) => {
    try {
        const { employeeId, date, shiftStartTime, shiftEndTime } = req.query;
        if (!employeeId || !date) {
            return res.status(400).json({ success: false, message: 'employeeId and date are required.' });
        }
        const employee = db.get('employees').find({ id: employeeId }).value();
        if (!employee) {
            return res.status(404).json({ success: false, message: 'Employee not found.' });
        }

        // Filter history by date and shift
        let filteredHistory = (employee.history || []).filter(item => {
            if (!item.timestamp) return false;
            const itemDate = new Date(item.timestamp);
            if (isNaN(itemDate.getTime())) return false;
            const matchesDate = itemDate.toISOString().split('T')[0] === date;
            if (!matchesDate) return false;

            if (shiftStartTime) {
                const start = new Date(shiftStartTime);
                if (!isNaN(start.getTime())) {
                    if (itemDate < start) return false;
                    if (shiftEndTime) {
                        const end = new Date(shiftEndTime);
                        if (!isNaN(end.getTime()) && itemDate > end) return false;
                    }
                }
            }
            return true;
        });

        // Count deleted and edited from history
        const deleted = filteredHistory.filter(item => item.action === 'delete').length;
        const edited = filteredHistory.filter(item => item.action === 'edit').length;

        // Count inputed (added) data: count entries in data arrays filtered by date and shift
        const dataTypes = ['extra', 'delivery', 'bill_paid', 'issue', 'retail_credit'];
        let inputed = 0;
        dataTypes.forEach(type => {
            const data = employee[type] || [];
            const filteredData = data.filter(item => {
                if (!item.timestamp) return false;
                const itemDate = new Date(item.timestamp);
                if (isNaN(itemDate.getTime())) return false;
                const matchesDate = itemDate.toISOString().split('T')[0] === date;
                if (!matchesDate) return false;

                if (shiftStartTime) {
                    const start = new Date(shiftStartTime);
                    if (!isNaN(start.getTime())) {
                        if (itemDate < start) return false;
                        if (shiftEndTime) {
                            const end = new Date(shiftEndTime);
                            if (!isNaN(end.getTime()) && itemDate > end) return false;
                        }
                    }
                }
                return true;
            });
            inputed += filteredData.length;
        });

        res.json({
            deleted,
            edited,
            inputed
        });
    } catch (error) {
        console.error('Error in /api/data-activity-summary:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
});

// Update app endpoint
app.post('/api/update-app', (req, res) => {
    const { exec, spawn } = require('child_process');
    const path = require('path');
    const fs = require('fs');

    updateInProgress = true;
    updateStartTime = new Date();

    // Function to get current branch
    const getCurrentBranch = () => {
        return new Promise((resolve, reject) => {
            exec('git branch --show-current', (error, stdout) => {
                if (error) {
                    exec('git rev-parse --abbrev-ref HEAD', (error2, stdout2) => {
                        if (error2) {
                            resolve('main');
                        } else {
                            resolve(stdout2.trim());
                        }
                    });
                } else {
                    resolve(stdout.trim());
                }
            });
        });
    };

    // Function to restart server
    const restartServer = () => {
        return new Promise((resolve, reject) => {
            console.log('Checking for running server processes...');

            // On Windows, use taskkill instead of pgrep/kill
            const isWindows = process.platform === 'win32';
            if (isWindows) {
                exec('tasklist /FI "IMAGENAME eq node.exe" /FO CSV', (error, stdout) => {
                    if (!error && stdout.includes('node.exe')) {
                        console.log('Stopping existing server processes...');
                        exec('taskkill /F /IM node.exe /FI "WINDOWTITLE eq Namma Mart*"', () => {
                            setTimeout(() => {
                                console.log('Starting server...');
                                const serverProcess = spawn('node', ['server.js'], {
                                    detached: true,
                                    stdio: 'ignore'
                                });
                                serverProcess.unref();
                                console.log('Server started in background');
                                resolve();
                            }, 2000);
                        });
                    } else {
                        console.log('Starting server...');
                        const serverProcess = spawn('node', ['server.js'], {
                            detached: true,
                            stdio: 'ignore'
                        });
                        serverProcess.unref();
                        console.log('Server started in background');
                        resolve();
                    }
                });
            } else {
                // Unix-like systems
                exec('pgrep -f "node.*server.js"', (error, stdout) => {
                    if (!error && stdout.trim()) {
                        const pids = stdout.trim().split('\n');
                        console.log('Stopping existing server processes:', pids.join(', '));
                        exec(`kill ${pids.join(' ')}`, () => {
                            setTimeout(() => {
                                console.log('Starting server...');
                                const serverProcess = spawn('node', ['server.js'], {
                                    detached: true,
                                    stdio: 'ignore'
                                });
                                serverProcess.unref();
                                console.log('Server started in background');
                                resolve();
                            }, 2000);
                        });
                    } else {
                        console.log('Starting server...');
                        const serverProcess = spawn('node', ['server.js'], {
                            detached: true,
                            stdio: 'ignore'
                        });
                        serverProcess.unref();
                        console.log('Server started in background');
                        resolve();
                    }
                });
            }
        });
    };

    // Check if it's a Git repository
    if (fs.existsSync(path.join(__dirname, '.git'))) {
        console.log('Git repository detected. Checking for updates...');

        getCurrentBranch().then(branch => {
            console.log('Current branch:', branch);

            // Fetch latest changes
            console.log('Fetching latest changes...');
            exec('git fetch origin', (error) => {
                if (error) {
                    updateInProgress = false;
                    updateStartTime = null;
                    console.error('Error: Failed to fetch from remote repository.');
                    return res.status(500).json({ success: false, message: 'Update failed: Failed to fetch from remote repository.' });
                }

                // Check if there are updates
                exec('git rev-parse HEAD', (error, localStdout) => {
                    if (error) {
                        updateInProgress = false;
                        updateStartTime = null;
                        return res.status(500).json({ success: false, message: 'Update failed: Could not get local commit.' });
                    }

                    const local = localStdout.trim();
                    exec(`git rev-parse origin/${branch}`, (error, remoteStdout) => {
                        let remote = remoteStdout ? remoteStdout.trim() : null;
                        if (error || !remote) {
                            // Try main or master
                            exec('git rev-parse origin/main', (error2, remoteStdout2) => {
                                if (error2) {
                                    exec('git rev-parse origin/master', (error3, remoteStdout3) => {
                                        remote = error3 ? null : remoteStdout3.trim();
                                        checkForUpdates(local, remote, branch);
                                    });
                                } else {
                                    remote = remoteStdout2.trim();
                                    checkForUpdates(local, remote, branch);
                                }
                            });
                        } else {
                            checkForUpdates(local, remote, branch);
                        }
                    });
                });
            });
        });
    } else {
        updateInProgress = false;
        updateStartTime = null;
        console.log('This directory is not a Git repository.');
        return res.status(500).json({ success: false, message: 'Update failed: Not a Git repository. Please initialize Git and add remote origin.' });
    }

    function checkForUpdates(local, remote, branch) {
        if (!remote || local === remote) {
            updateInProgress = false;
            updateStartTime = null;
            console.log('No updates available. Application is up to date.');
            return res.json({ success: true, message: 'No updates available. Application is up to date.' });
        }

        console.log('Updates found. Pulling latest changes...');
        exec(`git pull origin ${branch}`, (error, pullStdout) => {
            if (error) {
                updateInProgress = false;
                updateStartTime = null;
                console.error('Error: Failed to pull updates from remote repository.');
                return res.status(500).json({ success: false, message: 'Update failed: Failed to pull updates from remote repository.' });
            }

            console.log('Update successful.');

            // Check if package.json exists and run npm install
            if (fs.existsSync(path.join(__dirname, 'package.json'))) {
                console.log('Installing/updating dependencies...');
                exec('npm install', (npmError) => {
                    if (npmError) {
                        console.log('Warning: Failed to install dependencies. Please run \'npm install\' manually.');
                    }

                    // Restart the server
                    restartServer().then(() => {
                        updateInProgress = false;
                        updateStartTime = null;
                        console.log('Update completed successfully!');
                        res.json({ success: true, message: 'Update completed successfully! Application has been updated and restarted.' });
                    }).catch(() => {
                        updateInProgress = false;
                        updateStartTime = null;
                        res.json({ success: true, message: 'Update completed successfully! Please restart the server manually.' });
                    });
                });
            } else {
                // Restart the server
                restartServer().then(() => {
                    updateInProgress = false;
                    updateStartTime = null;
                    console.log('Update completed successfully!');
                    res.json({ success: true, message: 'Update completed successfully! Application has been updated and restarted.' });
                }).catch(() => {
                    updateInProgress = false;
                    updateStartTime = null;
                    res.json({ success: true, message: 'Update completed successfully! Please restart the server manually.' });
                });
            }
        });
    }
});

// Get update status endpoint
app.get('/api/update-status', (req, res) => {
    res.json({ updateInProgress, updateStartTime });
});

// Check for updates endpoint
app.get('/api/check-update', (req, res) => {
    const { exec } = require('child_process');
    exec('git status -uno', (error, stdout, stderr) => {
        if (error) {
            // console.error(`Error checking for updates silently ignored`);
            return res.json({ updateAvailable: false });
        }
        const hasUpdates = stdout.includes('Your branch is behind') || stdout.includes('have diverged');
        res.json({ updateAvailable: hasUpdates });
    });
});

// Get update details endpoint
app.get('/api/update-details', (req, res) => {
    const { exec } = require('child_process');
    exec('git log --oneline -10', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error getting update details: ${error}`);
            return res.json({ details: 'Unable to fetch update details.', error: error.message });
        }
        const details = stdout.split('\n').filter(line => line.trim()).join('\n');
        res.json({ details });
    });
});



// Get ESR JPGs for an employee
app.get('/api/esr-jpgs', (req, res) => {
    const { employeeId, date } = req.query;

    if (!employeeId) {
        return res.status(400).json({ success: false, message: 'employeeId is required.' });
    }

    try {
        let stmt;
        let rows;
        if (date) {
            stmt = esrDb.prepare('SELECT id, date, shift_id, jpg_data FROM esr_jpgs WHERE employee_id = ? AND date = ? ORDER BY date DESC');
            rows = stmt.all(employeeId, date);
        } else {
            stmt = esrDb.prepare('SELECT id, date, shift_id, jpg_data FROM esr_jpgs WHERE employee_id = ? ORDER BY date DESC');
            rows = stmt.all(employeeId);
        }

        // Convert BLOB to base64 for JSON response
        const jpgs = rows.map(row => ({
            id: row.id,
            date: row.date,
            shift_id: row.shift_id,
            jpgData: row.jpg_data.toString('base64')
        }));

        res.json({ success: true, jpgs });
    } catch (error) {
        console.error('Error retrieving ESR JPGs:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve ESR JPGs.' });
    }
});

// Save ESR JPG
app.post('/api/save-esr-jpg', (req, res) => {
    const { employeeId, date, shiftId, jpgData } = req.body;

    if (!employeeId || !date || !shiftId || !jpgData) {
        return res.status(400).json({ success: false, message: 'employeeId, date, shiftId, and jpgData are required.' });
    }

    try {
        // Assume jpgData is base64 encoded
        const buffer = Buffer.from(jpgData, 'base64');
        const stmt = esrDb.prepare('INSERT INTO esr_jpgs (employee_id, date, shift_id, jpg_data) VALUES (?, ?, ?, ?)');
        stmt.run(employeeId, date, shiftId, buffer);
        res.json({ success: true, message: 'ESR JPG saved successfully.' });
    } catch (error) {
        console.error('Error saving ESR JPG:', error);
        res.status(500).json({ success: false, message: 'Failed to save ESR JPG.' });
    }
});
// --- ADVANCED SETTINGS APIS ---

// Get current settings
app.get('/api/settings', (req, res) => {
    const settings = db.get('settings').value();
    // Don't leak the password in simple GET
    const publicSettings = { ...settings };
    delete publicSettings.adminPassword;
    res.json({ success: true, data: publicSettings });
});

// Update settings
app.post('/api/settings', (req, res) => {
    const newSettings = req.body;
    // Prevent updating password via this endpoint for safety
    delete newSettings.adminPassword;
    
    db.get('settings').assign(newSettings).write();
    res.json({ success: true, message: 'Settings updated successfully.' });
});

// Change admin password
app.post('/api/settings/change-password', (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const settings = db.get('settings').value();

    if (currentPassword !== settings.adminPassword) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ success: false, message: 'New password must be at least 6 characters.' });
    }

    db.get('settings').assign({ adminPassword: newPassword }).write();
    res.json({ success: true, message: 'Admin password updated successfully.' });
});

// Get system status (uptime, storage)
app.get('/api/system/status', (req, res) => {
    const fs = require('fs');
    const uptimeSeconds = process.uptime();
    
    // Calculate storage usage
    let dbSize = 0;
    let esrDbSize = 0;
    try {
        dbSize = fs.statSync('db.json').size;
        if (fs.existsSync('esrjpg.db')) {
            esrDbSize = fs.statSync('esrjpg.db').size;
        }
    } catch (e) {
        console.error('Error reading file sizes:', e);
    }

    res.json({
        success: true,
        data: {
            uptimeSeconds: Math.floor(uptimeSeconds),
            databaseSize: (dbSize / (1024 * 1024)).toFixed(2) + ' MB',
            snapshotsSize: (esrDbSize / (1024 * 1024)).toFixed(2) + ' MB',
            memory: (process.memoryUsage().heapUsed / (1024 * 1024)).toFixed(2) + ' MB'
        }
    });
});

// Download database backup
app.get('/api/system/backup', (req, res) => {
    res.download(path.join(__dirname, 'db.json'), 'NammaMart_Backup_' + new Date().toISOString().split('T')[0] + '.json');
});

// Reset settings to defaults
app.post('/api/settings/reset', (req, res) => {
    const defaults = {
        accentColor: "#F95A2C",
        theme: "light",
        adminPassword: "admin12nammamart",
        sidebarCollapsed: false
        // Identity fields removed from here as well per user request
    };
    db.set('settings', defaults).write();
    res.json({ success: true, message: 'Settings reset to factory defaults.' });
});
// --- FACE ATTENDANCE NATIVE RECONSTRUCTION V3 ---

// Ensure core attendance tables exist
if (!db.has('daily_sessions').value()) db.set('daily_sessions', []).write();
if (!db.has('attendance_logs').value()) db.set('attendance_logs', []).write();

/**
 * Endpoint: Register Face Descriptor
 * Saves high-precision face model data directly to the employee record.
 */
app.post('/api/employees/:id/face', (req, res) => {
    const { id } = req.params;
    const { descriptor } = req.body;

    if (!descriptor) return res.status(400).json({ success: false, message: 'No face descriptor provided.' });

    const employee = db.get('employees').find({ id }).value();
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found.' });

    db.get('employees').find({ id }).assign({ faceDescriptor: descriptor }).write();
    res.json({ success: true, message: 'Face registered successfully!' });
});

/**
 * Endpoint: Get Employee Current State
 * Used by the scanner UI to determine available actions.
 */
app.get('/api/attendance/state/:employeeId', (req, res) => {
    const { employeeId } = req.params;
    const dateStr = new Date().toISOString().split('T')[0];
    
    // Find the LATEST session for today (since there can be multiple)
    const sessions = db.get('daily_sessions')
        .filter(s => s.employeeId === employeeId && s.date === dateStr)
        .value() || [];
        
    const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;

    let currentState = 'IDLE';
    let sessionId = null;

    if (lastSession) {
        if (!lastSession.checkOut) {
            currentState = lastSession.onBreak ? 'ON_BREAK' : 'WORKING';
            sessionId = lastSession.id;
        } else {
            currentState = 'IDLE'; // They checked out, ready for a completely new session
        }
    }

    res.json({ success: true, currentState, sessionId });
});

/**
 * Endpoint: Attendance Scan (Kiosk Mode)
 * Ensures absolutely strict state transitions and supports Auto-Fix bulk arrays.
 */
app.post('/api/attendance/scan', (req, res) => {
    const { employeeId, actionType } = req.body;
    const emp = db.get('employees').find({ id: employeeId }).value();

    if (!emp) return res.status(404).json({ success: false, message: 'Identity not recognized.' });
    if (emp.isActive === false) return res.status(403).json({ success: false, message: 'Access denied by administrator.' });

    const processAction = (empId, empName, action) => {
        const now = new Date();
        const dateStr = now.toISOString().split('T')[0];
        const timestamp = now.toISOString();

        // Get the latest session to determine state
        const sessions = db.get('daily_sessions').filter(s => s.employeeId === empId && s.date === dateStr).value() || [];
        let session = sessions.length > 0 ? sessions[sessions.length - 1] : null;

        let currentState = 'IDLE';
        if (session && !session.checkOut) {
            currentState = session.onBreak ? 'ON_BREAK' : 'WORKING';
        }

        // 1. Initial/New Clock In
        if (action === 'in') {
            if (currentState !== 'IDLE') {
                return { success: false, code: 'STATE_MISMATCH', currentState, expected: 'IDLE', message: 'You are already checked in.' };
            }
            session = {
                id: shortid.generate(),
                employeeId: empId,
                employeeName: empName,
                date: dateStr,
                checkIn: timestamp,
                checkOut: null,
                onBreak: false,
                breakHistory: [],
                totalBreakMinutes: 0,
                status: 'active'
            };
            db.get('daily_sessions').push(session).write();
            logAttendance(empId, empName, 'CLOCK_IN', timestamp);
            return { success: true, message: `Welcome, ${empName}! Session started.`, action: 'IN' };
        }

        if (currentState === 'IDLE') {
            return { success: false, code: 'STATE_MISMATCH', currentState, expected: 'WORKING', message: 'No active session found. Please Clock In first.' };
        }

        // 2. Break Management
        if (action === 'break_start') {
            if (currentState !== 'WORKING') {
                return { success: false, code: 'STATE_MISMATCH', currentState, expected: 'WORKING', message: 'You must be actively working to start a break.' };
            }
            session.onBreak = true;
            session.status = 'on_break';
            session.breakHistory.push({ start: timestamp, end: null });
            db.get('daily_sessions').find({ id: session.id }).assign(session).write();
            logAttendance(empId, empName, 'BREAK_START', timestamp);
            return { success: true, message: 'Break started. Enjoy your rest!', action: 'BREAK_START' };
        }

        if (action === 'break_end') {
            if (currentState !== 'ON_BREAK') {
                return { success: false, code: 'STATE_MISMATCH', currentState, expected: 'ON_BREAK', message: 'You are not currently on a break.' };
            }
            session.onBreak = false;
            session.status = 'active';
            const lastBreak = session.breakHistory[session.breakHistory.length - 1];
            if (lastBreak && !lastBreak.end) {
                lastBreak.end = timestamp;
                const diff = new Date(timestamp) - new Date(lastBreak.start);
                session.totalBreakMinutes += Math.floor(diff / 60000);
            }
            db.get('daily_sessions').find({ id: session.id }).assign(session).write();
            logAttendance(empId, empName, 'BREAK_END', timestamp);
            return { success: true, message: 'Break ended. Welcome back!', action: 'BREAK_END' };
        }

        // 3. Clock Out
        if (action === 'out') {
            session.checkOut = timestamp;
            session.status = 'completed';
            if (session.onBreak) {
                const lastBreak = session.breakHistory[session.breakHistory.length - 1];
                if (lastBreak && !lastBreak.end) lastBreak.end = timestamp;
                session.onBreak = false;
            }
            db.get('daily_sessions').find({ id: session.id }).assign(session).write();
            logAttendance(empId, empName, 'CLOCK_OUT', timestamp);
            return { success: true, message: `Goodbye, ${empName}! Shift completed.`, action: 'OUT' };
        }

        return { success: false, message: 'Invalid scan operation.' };
    };

    // Auto-fix support: actionType can be an array of actions to execute sequentially
    if (Array.isArray(actionType)) {
        let lastResult = null;
        for (const action of actionType) {
            lastResult = processAction(employeeId, emp.name, action);
            if (!lastResult.success) break; // Abort if any action in chain fails
        }
        if (lastResult.success) {
             return res.json({ success: true, message: 'Auto-fix cascade successful.', sequences: actionType });
        } else {
             return res.status(400).json(lastResult);
        }
    } else {
        // Single normal action
        const result = processAction(employeeId, emp.name, actionType);
        if (result.success) return res.json(result);
        else return res.status(400).json(result);
    }
});


/**
/**
 * Endpoint: Fetch Raw Attendance Logs
 * High-performance log retrieval for the localized command center.
 */
app.get('/api/attendance/logs/raw', (req, res) => {
    const { filter } = req.query; // 'today', 'week', 'month', 'all'
    let logs = db.get('attendance_logs').value() || [];
    
    const now = new Date();
    
    if (filter === 'today') {
        const todayStr = now.toISOString().split('T')[0];
        logs = logs.filter(l => l.timestamp && String(l.timestamp).startsWith(todayStr));
    } else if (filter === 'week') {
        const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        logs = logs.filter(l => l.timestamp && String(l.timestamp) >= lastWeek);
    } else if (filter === 'month') {
        const lastMonth = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        logs = logs.filter(l => l.timestamp && String(l.timestamp) >= lastMonth);
    }
    
    // Sort by most recent
    logs.sort((a, b) => {
        const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tB - tA;
    });
    res.json({ success: true, logs });
});

/**
 * Endpoint: Fetch Daily Sessions
 * Returns aggregated shift session data used by the Dashboard UI
 */
app.get('/api/daily-sessions', (req, res) => {
    const { date } = req.query;
    let sessions = db.get('daily_sessions').value() || [];
    
    if (date) {
        sessions = sessions.filter(s => s.date === date);
    }
    
    // Map the new backend schema to the structure expected by the legacy Dashboard
    const mappedSessions = sessions.map(s => ({
        ...s,
        checkInTime: s.checkIn,
        checkOutTime: s.checkOut,
        isOnBreak: s.onBreak,
        totalBreakDuration: s.totalBreakMinutes * 60000 // UI expects MS
    }));

    res.json({ success: true, sessions: mappedSessions });
});

/**
 * Endpoint: Bulk Edit Logs
 */
app.put('/api/attendance/logs/bulk-edit', (req, res) => {
    const { logIds, newAction } = req.body;
    if (!logIds || !Array.isArray(logIds)) return res.status(400).json({ success: false });

    const logsColl = db.get('attendance_logs');
    logIds.forEach(id => {
        const trg = logsColl.find({ id });
        if (trg.value()) trg.assign({ action: newAction, type: newAction }).write(); // Update both new and legacy schema keys
    });
    
    res.json({ success: true });
});

/**
 * Endpoint: Bulk Delete Logs
 */
app.delete('/api/attendance/logs', (req, res) => {
    const { logIds } = req.body;
    if (!logIds || !Array.isArray(logIds)) return res.status(400).json({ success: false });

    // Using lodash to remove matching ids
    db.get('attendance_logs').remove(log => logIds.includes(log.id)).write();
    
    res.json({ success: true });
});

/**
 * RECONSTRUCTION ALGORITHM
 * Endpoint: Recalculate Sessions
 * Destroys current day daily_sessions and meticulously rebuilds them chronologically from logs_table to resolve conflicting overrides.
 */
app.post('/api/attendance/sessions/recalculate', (req, res) => {
    // 1. Erase all daily_sessions entirely to purge corrupt data
    db.set('daily_sessions', []).write();
    
    // 2. Load all raw logs chronologically
    const allLogs = db.get('attendance_logs').value() || [];
    allLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Oldest first
    
    const activeSessions = {};

    allLogs.forEach(log => {
        const empId = log.employeeId;
        const empName = log.employeeName;
        const dateStr = log.timestamp.split('T')[0];
        const action = log.action || log.type;

        if (action === 'CLOCK_IN' || action === 'IN') {
            const sid = shortid.generate();
            const session = {
                id: sid, employeeId: empId, employeeName: empName, date: dateStr,
                checkIn: log.timestamp, checkOut: null, onBreak: false,
                breakHistory: [], totalBreakMinutes: 0, status: 'active'
            };
            activeSessions[empId] = session;
            db.get('daily_sessions').push(session).write();
        } 
        else if (action === 'BREAK_START' && activeSessions[empId]) {
            const s = activeSessions[empId];
            s.onBreak = true;
            s.status = 'on_break';
            s.breakHistory.push({ start: log.timestamp, end: null });
            db.get('daily_sessions').find({ id: s.id }).assign(s).write();
        }
        else if (action === 'BREAK_END' && activeSessions[empId]) {
            const s = activeSessions[empId];
            s.onBreak = false;
            s.status = 'active';
            const lastBreak = s.breakHistory[s.breakHistory.length - 1];
            if (lastBreak && !lastBreak.end) {
                lastBreak.end = log.timestamp;
                s.totalBreakMinutes += Math.floor((new Date(log.timestamp) - new Date(lastBreak.start)) / 60000);
            }
            db.get('daily_sessions').find({ id: s.id }).assign(s).write();
        }
        else if (action === 'CLOCK_OUT' || action === 'OUT') {
            if (activeSessions[empId]) {
                const s = activeSessions[empId];
                s.checkOut = log.timestamp;
                s.status = 'completed';
                if (s.onBreak) {
                    const lastBreak = s.breakHistory[s.breakHistory.length - 1];
                    if (lastBreak && !lastBreak.end) lastBreak.end = log.timestamp;
                    s.onBreak = false;
                }
                db.get('daily_sessions').find({ id: s.id }).assign(s).write();
                delete activeSessions[empId]; // Session finalized
            }
        }
    });

    res.json({ success: true, message: 'Sessions completely regenerated' });
});

/**
 * Helper: Log Attendance Event
 * Mirrors Firebase Document writing locally.
 */
function logAttendance(employeeId, employeeName, type, timestamp) {
    let statusAfter = 'IDLE';
    if (type === 'CLOCK_IN' || type === 'BREAK_END') statusAfter = 'WORKING';
    if (type === 'BREAK_START') statusAfter = 'ON_BREAK';

    db.get('attendance_logs').push({
        id: shortid.generate(),
        employeeId,
        employeeName,
        action: type,
        type: type, // Legacy support
        statusAfter,
        timestamp
    }).write();
}

// Support for Leave/Swap logic remains distinct
if (!db.has('leave_swaps').value()) db.set('leave_swaps', []).write();

app.get('/api/leave-swaps', (req, res) => {
    res.json(db.get('leave_swaps').value() || []);
});

app.post('/api/leave-swaps', (req, res) => {
    const { employeeId, original_date, new_date, reason } = req.body;
    const reqData = {
        id: shortid.generate(),
        employeeId,
        original_date: original_date || null,
        new_date,
        reason,
        status: 'pending',
        timestamp: new Date().toISOString()
    };
    db.get('leave_swaps').push(reqData).write();
    res.json({ success: true, message: 'Leave Request Issued' });
});

app.put('/api/leave-swaps/:id', (req, res) => {
    const { action } = req.body;
    if (action === 'approve') {
        db.get('leave_swaps').find({ id: req.params.id }).assign({ status: 'approved' }).write();
    } else if (action === 'reject') {
        db.get('leave_swaps').find({ id: req.params.id }).assign({ status: 'rejected' }).write();
    }
    res.json({ success: true });
});

// Scheduled auto open/close functionality
function checkScheduledOpenClose(testHour = null, testMinute = null) {
    const now = new Date();
    const currentHour = testHour !== null ? testHour : now.getHours();
    const currentMinute = testMinute !== null ? testMinute : now.getMinutes();

    // Close at 11:30 PM
    if (currentHour === 23 && currentMinute >= 30) {
        db.set('store_closed', true).write();
        console.log('Store automatically closed at 11:30 PM');
    }
    // Open at 5:30 AM
    else if (currentHour === 5 && currentMinute >= 30) {
        db.set('store_closed', false).write();
        console.log('Store automatically opened at 5:30 AM');
    }
}

// Run scheduled check every minute
setInterval(checkScheduledOpenClose, 60 * 1000);

const https = require('https');
const fs = require('fs');
if (fs.existsSync('key.pem') && fs.existsSync('cert.pem')) {
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
} else {
    app.listen(port, "0.0.0.0", () => {
        console.log(`Server is running on http://localhost:${port}`);
        console.log('To access from other devices on your network, use your local IP address.');
        console.log(`Example: http://192.168.1.100:${port}`);
        checkScheduledOpenClose();
    });
}

// Export for Vercel
if (isVercel) {
    module.exports = app;
}
