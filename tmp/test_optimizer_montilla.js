const fs = require('fs');

const locations = [
    { name: "Rafael Martínez", coords: [37.5808939, -4.6465091] },
    { name: "INOELEC", coords: [37.5723, -4.650017] },
    { name: "Electricidad Cabello", coords: [37.5871144, -4.6372633] },
    { name: "L. Padillo", coords: [37.5738753, -4.6613804] },
    { name: "Fontanería Márquez", coords: [37.5761824, -4.6470572] },
    { name: "Fontanería Gómez", coords: [37.5820805, -4.6389933] },
    { name: "CIMET", coords: [37.5852469, -4.6336973] },
    { name: "Bujalance", coords: [37.5890824, -4.6336066] }
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

// Historial ficticio: El conductor siempre va a CIMET justo después de INOELEC
const historicalSequences = {
    "inoelec": { "cimet": 10 } // Fuerte relación
};

let output = "";

const runSort = (startLat, startLon, lastClient, label) => {
    output += `\n--- ESCENARIO: ${label} ---\n`;
    output += `Origen: [${startLat}, ${startLon}] | Último: ${lastClient || 'Ninguno'}\n`;

    const sorted = [...locations].sort((a, b) => {
        const nameA = a.name.toLowerCase();
        const nameB = b.name.toLowerCase();
        
        // IA HISTÓRICA
        if (lastClient) {
            const lastClean = lastClient.toLowerCase();
            const seqs = historicalSequences[lastClean] || {};
            const scoreA = seqs[nameA] || 0;
            const scoreB = seqs[nameB] || 0;
            if (scoreA !== scoreB) return scoreB - scoreA;
        }

        // GPS DISTANCIA
        const distA = getDistance(startLat, startLon, a.coords[0], a.coords[1]);
        const distB = getDistance(startLat, startLon, b.coords[0], b.coords[1]);
        return distA - distB;
    });

    sorted.forEach((s, i) => {
        const dist = getDistance(startLat, startLon, s.coords[0], s.coords[1]).toFixed(2);
        output += `${i+1}. ${s.name.padEnd(25)} | Dist: ${dist} km\n`;
    });
};

// 1. Entrada desde el SUR (Lucena / Autovía)
runSort(37.560000, -4.650000, null, "ENTRANDO POR EL SUR (LUCENA)");

// 2. Entrada desde el NORTE (Aguilar)
runSort(37.595000, -4.630000, null, "ENTRANDO POR EL NORTE (AGUILAR)");

// 3. Prueba de IA HISTÓRICA (Estando en INOELEC, ¿iría a CIMET aunque esté lejos?)
runSort(37.5723, -4.650017, "INOELEC", "USANDO MEMORIA HISTÓRICA (INOELEC -> CIMET)");

fs.writeFileSync('tmp/test_montilla_results.txt', output);
console.log("Resultados guardados en tmp/test_montilla_results.txt");
