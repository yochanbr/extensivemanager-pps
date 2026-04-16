const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const adapter = new FileSync('db.json');
const db = low(adapter);

let logs = db.get('attendance_logs').value() || [];
const now = new Date();
const todayStr = now.toISOString().split('T')[0];
logs = logs.filter(l => l.timestamp && String(l.timestamp).startsWith(todayStr));
logs.sort((a, b) => {
    const tA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tB - tA;
});
console.log('SUCCESS, LENGTH:', logs.length);
