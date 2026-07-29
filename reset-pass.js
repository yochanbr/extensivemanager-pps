const admin = require('firebase-admin');
const fs = require('fs');

async function resetAdminPassword() {
    try {
        const keyPath = './extensivemanager-pps-firebase-adminsdk-fbsvc-70b482e9c3.json';
        if (!fs.existsSync(keyPath)) {
            console.error('Firebase key not found');
            process.exit(1);
        }

        const serviceAccount = require(keyPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        const db = admin.firestore();
        await db.collection('settings').doc('config').update({
            adminPassword: 'admin12nammamart'
        });

        console.log('Successfully reset adminPassword in Firestore to default: admin12nammamart');
        process.exit(0);
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
}

resetAdminPassword();
