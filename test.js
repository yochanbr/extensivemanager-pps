const express = require('express'); const app = express(); app.use((req, res) => { console.log(req.path, req.path.startsWith('/api/')); res.send('ok'); }); app.listen(3001);
