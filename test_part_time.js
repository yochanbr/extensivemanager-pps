const admin = require('firebase-admin');
const path = require('path');
const serviceAccount = require(path.join(__dirname, 'firebase-key.json'));

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function runTests() {
    console.log("Starting Part-Time Backend Logic Test...\n");

    const employeeId = "TEST-PART-TIME-001";
    const month = "2026-07"; // Current month context from chat

    try {
        // 1. Create a dummy part-time employee
        console.log("1. Creating dummy part-time employee...");
        await db.collection('employees').doc(employeeId).set({
            name: "Part Time Tester",
            username: employeeId,
            'full-time': 'no',
            basicSalary: "24000", // $100/hr based on 240 hours
            lopPerDay: "800", // Shouldn't be used for part-time, but let's test isolation
            lopPerHour: "100"
        });
        console.log("   - Created successfully.");

        // 2. Create a dummy session (Worked 4 hours on 2026-07-28)
        console.log("2. Creating dummy attendance session (4 hours)...");
        const dateStr = "2026-07-28";
        await db.collection('daily_sessions').doc(`${employeeId}_${dateStr}`).set({
            employeeId: employeeId,
            employeeName: "Part Time Tester",
            date: dateStr,
            status: "completed",
            checkIn: "2026-07-28T09:00:00.000Z",
            checkOut: "2026-07-28T13:00:00.000Z",
            actualWorkMinutes: 240, // 4 hours
            totalBreakMinutes: 0
        });
        console.log("   - Created successfully.");

        // 3. Test Payroll Reconcile Logic
        console.log("\n3. Simulating Payroll Reconciliation...");
        const empDoc = await db.collection('employees').doc(employeeId).get();
        const empData = empDoc.data();
        
        const sessSnapshot = await db.collection('daily_sessions')
            .where('employeeId', '==', employeeId)
            .get();

        let totalWorkedMinutes = 0;
        sessSnapshot.docs.forEach(doc => {
            if (doc.data().date.includes(month)) {
                totalWorkedMinutes += doc.data().actualWorkMinutes || 0;
            }
        });

        const isPartTime = (empData['full-time'] === 'no' || empData.fullTime === 'no');
        
        let lopDays = 0;
        let lopAmount = 0;

        if (isPartTime) {
            const basicSal = parseFloat(empData.basicSalary || empData['basic-salary'] || empData.basic) || 0;
            const hourlyRate = basicSal / 240; // 24000 / 240 = 100
            const workedHours = totalWorkedMinutes / 60; // 4 hours
            const earnedSalary = hourlyRate * workedHours; // 100 * 4 = 400

            lopAmount = Math.max(0, basicSal - earnedSalary); // 24000 - 400 = 23600
            lopDays = Math.max(0, 30 - (workedHours / 8)); // 30 - 0.5 = 29.5
        }

        console.log(`   - Is Part Time? ${isPartTime}`);
        console.log(`   - Total Worked Hours: ${totalWorkedMinutes / 60}`);
        console.log(`   - Basic Salary: ${empData.basicSalary}`);
        console.log(`   - Calculated LOP Amount (Should be Basic - Earned): ${lopAmount}`);
        console.log(`   - Calculated Net Salary (Basic - LOP): ${empData.basicSalary - lopAmount}`);
        
        if (empData.basicSalary - lopAmount === 400) {
            console.log("   ✅ PAYROLL LOGIC TEST PASSED (Net Salary is exactly Earned Amount).");
        } else {
            console.log("   ❌ PAYROLL LOGIC TEST FAILED.");
        }

        // 4. Test Attendance Matrix Logic
        console.log("\n4. Simulating Attendance Grid Logic...");
        let expectedMins = isPartTime ? 0 : 480;
        const variance = ((totalWorkedMinutes - expectedMins) / 60).toFixed(1);
        
        console.log(`   - Expected Minutes: ${expectedMins}`);
        console.log(`   - Variance (Should be exactly worked hours for PT): +${variance}`);
        if (expectedMins === 0 && parseFloat(variance) === 4.0) {
             console.log("   ✅ ATTENDANCE LOGIC TEST PASSED.");
        } else {
             console.log("   ❌ ATTENDANCE LOGIC TEST FAILED.");
        }

    } catch (err) {
        console.error("Test Error:", err);
    } finally {
        // Cleanup
        console.log("\nCleaning up test data...");
        await db.collection('employees').doc(employeeId).delete();
        await db.collection('daily_sessions').doc(`${employeeId}_2026-07-28`).delete();
        console.log("Cleanup complete.");
        process.exit();
    }
}

runTests();
