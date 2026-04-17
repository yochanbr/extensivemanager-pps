const fs = require('fs');

try {
    const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
    const rawKey = serviceAccount.private_key;
    const match = rawKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
    if (match) {
        const base64Body = match[1].replace(/\s/g, '');
        const buffer = Buffer.from(base64Body, 'base64');
        console.log('Base64 Length:', base64Body.length);
        console.log('Decoded Buffer Length:', buffer.length);
        console.log('Is valid base64?', buffer.toString('base64') === base64Body);
    }
} catch (e) {
    console.error(e);
}
