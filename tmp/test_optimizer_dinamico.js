const fs = require('fs');

const RUTAS_MAESTRAS = [
  { id: 'ruta-rute-iznajar', nombre: 'Ruta Rute-Iznájar (Sur)', poblaciones: ['Rute', 'Iznájar', 'Cuevas de San Marcos', 'Encinas Reales'] },
  { id: 'ruta-priego', nombre: 'Ruta Priego-Almedinilla', poblaciones: ['Priego de Córdoba', 'Almedinilla', 'Carcabuey'] }
];

const locations = [
    { name: "Iznamotor", coords: [37.2695053, -4.3116882] },
    { name: "Motos Rubio", coords: [37.2659922, -4.3103494] },
    { name: "Jesús Sancho", coords: [37.2619338, -4.3115658] },
    { name: "Motos Molina", coords: [37.2571384, -4.3024633] }
];

const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

let output = "";

const runSort = (startLat, startLon, label) => {
    output += `\n--- TEST: ${label} ---\n`;
    output += `Posición Driver: [${startLat}, ${startLon}]\n`;

    const sorted = [...locations].sort((a, b) => {
        const distA = getDistance(startLat, startLon, a.coords[0], a.coords[1]);
        const distB = getDistance(startLat, startLon, b.coords[0], b.coords[1]);
        return distA - distB;
    });

    sorted.forEach((s, i) => {
        const dist = getDistance(startLat, startLon, s.coords[0], s.coords[1]).toFixed(2);
        output += `${i+1}. ${s.name.padEnd(15)} | Distancia: ${dist} km\n`;
    });
};

runSort(37.473007, -4.450209, "DESDE EL NORTE (LUCENA)");
runSort(37.250000, -4.300000, "DESDE EL SUR (RUTE)");

fs.writeFileSync('tmp/test_results.txt', output);
console.log("Test finalizado. Resultados en tmp/test_results.txt");
