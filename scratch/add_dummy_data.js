const admin = require('firebase-admin');
const serviceAccount = require('../extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

const empId = 'UgLo3HEMq';
const empName = 'YOCHAN';
const date = '2026-04-26';
const month = '2026-04';

async function addDummyData() {
  console.log('🚀 Adding dummy data for Yochan...');

  const now = new Date();
  const startTime = new Date(date + 'T09:00:00Z').toISOString();
  const endTime = new Date(date + 'T18:00:00Z').toISOString();

  // 1. Attendance Logs
  console.log('📝 Adding attendance logs...');
  await db.collection('attendance_logs').add({
    employeeId: empId,
    employeeName: empName,
    action: 'CLOCK_IN',
    type: 'CLOCK_IN',
    statusAfter: 'WORKING',
    timestamp: startTime
  });
  await db.collection('attendance_logs').add({
    employeeId: empId,
    employeeName: empName,
    action: 'CLOCK_OUT',
    type: 'CLOCK_OUT',
    statusAfter: 'IDLE',
    timestamp: endTime
  });

  // 2. Daily Sessions
  console.log('📝 Adding daily session...');
  await db.collection('daily_sessions').add({
    employeeId: empId,
    employeeName: empName,
    date: date,
    checkIn: startTime,
    checkOut: endTime,
    status: 'completed',
    durationMinutes: 540,
    created_at: new Date().toISOString()
  });

  // 3. ESR Report (Verified)
  console.log('📝 Adding verified ESR report...');
  const shiftId = 'DUMMY_SHIFT_001';
  await db.collection('esr_reports').doc(`${empId}_${date}_${shiftId}`).set({
    employee_id: empId,
    employeeName: empName,
    date: date,
    shift_id: shiftId,
    verified: true,
    created_at: new Date().toISOString(),
    report_data: 'Dummy Encrypted Report Data',
    structured_data: {
        cash: 1000,
        upiPinelab: 500,
        upiPaytm: 200
    },
    verification_data: {
        verifiedBy: 'system_admin',
        verifiedAt: new Date().toISOString(),
        remarks: 'Dummy correction for testing',
        differences: {
            cash: 500,
            upi_general: -100
        }
    }
  });

  console.log('✅ All dummy data added successfully!');
  process.exit(0);
}

addDummyData().catch(err => {
  console.error('❌ Error adding dummy data:', err);
  process.exit(1);
});
