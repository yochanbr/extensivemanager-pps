const admin = require('firebase-admin');
const serviceAccount = require('./extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanDatabase() {
  try {
    console.log('Fetching all employees...');
    const snapshot = await db.collection('employees').get();
    
    if (snapshot.empty) {
      console.log('No employees found.');
      return;
    }

    let count = 0;
    const batch = db.batch();

    snapshot.forEach(doc => {
      const data = doc.data();
      let needsUpdate = false;
      const updateData = {};

      if (data.designation !== undefined) {
        updateData.designation = admin.firestore.FieldValue.delete();
        needsUpdate = true;
      }
      
      if (data.department !== undefined) {
        updateData.department = admin.firestore.FieldValue.delete();
        needsUpdate = true;
      }

      if (needsUpdate) {
        batch.update(doc.ref, updateData);
        count++;
      }
    });

    if (count > 0) {
      console.log(`Removing fields from ${count} employees...`);
      await batch.commit();
      console.log('Success! Database cleaned.');
    } else {
      console.log('No employees had these fields.');
    }
  } catch (err) {
    console.error('Error cleaning database:', err);
  } finally {
    process.exit(0);
  }
}

cleanDatabase();
