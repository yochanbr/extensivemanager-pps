const crypto = require('crypto');
const fs = require('fs');

const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
let rawKey = serviceAccount.private_key;

// Self-healing attempt: Extract only the base64 part
const match = rawKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
if (match) {
    const base64Body = match[1].replace(/\s/g, ''); // Remove ALL spaces, newlines, etc.
    // Reconstruct with standard formatting
    const fixedKey = `-----BEGIN PRIVATE KEY-----\n${base64Body}\n-----END PRIVATE KEY-----\n`;
    
    try {
        crypto.createPrivateKey(fixedKey);
        console.log('✅ Self-healing SUCCEEDED!');
        // Update the file
        serviceAccount.private_key = fixedKey;
        fs.writeFileSync('./firebase-key.json', JSON.stringify(serviceAccount, null, 2));
    } catch (e) {
        console.error('❌ Self-healing FAILED:', e.message);
    }
} else {
    console.error('❌ Could not find BEGIN/END headers in the key.');
}
