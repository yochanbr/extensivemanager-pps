const Database = require('better-sqlite3');
const db = new Database('esrjpg.db');

const sizes = db.prepare('SELECT id, LENGTH(jpg_data) as size FROM esr_jpgs').all();
console.log('Image Sizes (bytes):');
sizes.forEach(s => console.log(`ID ${s.id}: ${s.size} bytes`));

const overLimit = sizes.filter(s => s.size > 800000); // 800KB buffer for Firestore 1MB limit
if (overLimit.length > 0) {
    console.log(`⚠️ Warning: ${overLimit.length} images are over 800KB!`);
} else {
    console.log('✅ All images are under 800KB and safe for Firestore.');
}
