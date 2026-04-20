const crypto = require('crypto');
const fs = require('fs');

try {
    const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
    const privateKey = serviceAccount.private_key;
    
    const key = crypto.createPrivateKey(privateKey);
    console.log('✅ Key is valid according to Node crypto module!');
    console.log('Key type:', key.asymmetricKeyType);
} catch (error) {
    console.error('❌ Crypto module failed to parse key:', error.message);
}
