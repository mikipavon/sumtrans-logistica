const fs = require('fs');
const code = fs.readFileSync('src/App.jsx', 'utf8');
const startGPS = code.indexOf('{/* ⏱️⏱️⏱️ GPS & ALERTAS ⏱️⏱️⏱️ */}');
const endGPS = code.indexOf('<div className=\g-slate-50 border border-slate-200 p-6 rounded-xl\>');
console.log('startGPS', startGPS);
console.log('endGPS', endGPS);

