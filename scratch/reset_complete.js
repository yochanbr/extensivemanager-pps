const admin = require('firebase-admin');
const serviceAccount = require('../extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function resetFirebase() {
  console.log('🚮 Starting COMPLETE Firebase Reset...');

  const collectionsToWipe = ['attendance_logs', 'daily_sessions', 'esr_reports'];

  for (const colName of collectionsToWipe) {
    console.log(`🗑️ Wiping collection: ${colName}...`);
    const snapshot = await db.collection(colName).limit(500).get();
    if (snapshot.size > 0) {
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      console.log(`✅ Deleted ${snapshot.size} docs from ${colName}`);
    } else {
      console.log(`ℹ️ ${colName} is already empty.`);
    }
  }

  console.log('🧹 Cleaning employee records (resetting history but keeping accounts)...');
  const empSnapshot = await db.collection('employees').get();
  const empBatch = db.batch();
  
  empSnapshot.docs.forEach(doc => {
    console.log(`  - Resetting data for: ${doc.data().name || doc.id}`);
    empBatch.update(doc.ref, {
      counter_selections: [],
      extra: [],
      delivery: [],
      bill_paid: [],
      issue: [],
      retail_credit: [],
      shiftEnded: false,
      lastVerification: null
    });
  });

  await empBatch.commit();
  console.log('✅ All employee records cleaned.');

  console.log('✨ Firebase Reset Complete! Your system is now fresh.');
  process.exit(0);
}

resetFirebase().catch(err => {
  console.error('❌ Error during reset:', err);
  process.exit(1);
});
