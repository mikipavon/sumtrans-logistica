const fs = require('fs');
const backup = JSON.parse(fs.readFileSync('ultimo_backup_antes_de_produccion.json', 'utf8'));

const francisco = backup.drivers.find(d => d.name && d.name.toUpperCase().includes('FRANCISCO MANUEL'));
console.log('Francisco:', francisco);
