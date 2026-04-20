const fs = require('fs');
const serviceAccount = JSON.parse(fs.readFileSync('./firebase-key.json', 'utf8'));
const key = serviceAccount.private_key;

console.log('Length:', key.length);
console.log('Hex representation (start):', Buffer.from(key.substring(0, 100)).toString('hex'));
console.log('Hex representation (end):', Buffer.from(key.substring(key.length - 100)).toString('hex'));

// Check for trailing newlines or spaces
console.log('Key ends with newline?', key.endsWith('\n'));
console.log('Key ends with \\n?', key.endsWith('\\n'));

const cleanKey = key.trim();
console.log('Cleaned length:', cleanKey.length);
