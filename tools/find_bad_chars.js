const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
const match = serviceAccount.private_key.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
const body = match[1];
const invalidChars = body.match(/[^A-Za-z0-9+/=\s\\]/g);
console.log('Invalid Chars:', invalidChars);
