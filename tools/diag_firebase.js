const admin = require('firebase-admin');
const fs = require('fs');

try {
    const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
    // Try both raw and replaced
    console.log('Project ID:', serviceAccount.project_id);
    console.log('Key Sample (Start):', serviceAccount.private_key.substring(0, 50));
    console.log('Key Sample (End):', serviceAccount.private_key.substring(serviceAccount.private_key.length - 50));
    
    // Fix common newline issues
    if (serviceAccount.private_key.includes('\\n')) {
        console.log('Detected literal \\n, replacing...');
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
    console.log('✅ Firebase initialized successfully in diagnostic!');
    process.exit(0);
} catch (error) {
    console.error('❌ Diagnostic failed:', error.message);
    if (error.errorInfo) console.error('Error Info:', error.errorInfo);
    process.exit(1);
}
