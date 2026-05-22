const RUTAS_MAESTRAS = [
  {
    id: 'ruta-rute-iznajar',
    nombre: 'Ruta Rute-Iznájar (Sur)',
    poblaciones: ['Rute', 'Iznájar', 'Cuevas de San Marcos', 'Encinas Reales']
  },
  {
    id: 'ruta-priego',
    nombre: 'Ruta Priego-Almedinilla',
    poblaciones: ['Priego de Córdoba', 'Almedinilla', 'Carcabuey']
  }
];

const driver = {
    id: 'drv-test',
    name: 'Conductor Test',
    morningRouteId: 'ruta-rute-iznajar',
    afternoonRouteId: 'ruta-priego'
};

const myLat = 37.473007; // Lucena
const myLon = -4.450209;

const localRoute = [
    { id: 1, destinationName: "Motos Rubio", destinationCity: "Iznájar", deliveryCoordinates: "37.2659922, -4.3103494" },
    { id: 2, destinationName: "Jesús Sancho López", destinationCity: "Iznájar", deliveryCoordinates: "37.2619338, -4.3115658" },
    { id: 3, destinationName: "Motos Molina", destinationCity: "Iznájar", deliveryCoordinates: "37.2571384, -4.3024633" },
    { id: 4, destinationName: "Iznamotor", destinationCity: "Iznájar", deliveryCoordinates: "37.2695053, -4.3116882" },
    { id: 5, destinationName: "Expert Priego", destinationCity: "Priego de Córdoba", deliveryCoordinates: "37.4386085, -4.1938807" },
    { id: 6, destinationName: "Talleres Lopera", destinationCity: "Priego de Córdoba", deliveryCoordinates: "37.4488641, -4.1908995" },
    { id: 7, destinationName: "NEUMÁFE", destinationCity: "Priego de Córdoba", deliveryCoordinates: "37.4380993, -4.1833724" },
    { id: 8, destinationName: "Muebles Mesa", destinationCity: "Almedinilla", deliveryCoordinates: "37.4362158, -4.1103861" }
];

const normalize = (val) => String(val || '').trim().toLowerCase();

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

const morningRoute = RUTAS_MAESTRAS.find(r => r.id === driver.morningRouteId);
const afternoonRoute = RUTAS_MAESTRAS.find(r => r.id === driver.afternoonRouteId);

const getShiftInfo = (s) => {
    const city = normalize(s.destinationCity);
    if (morningRoute?.poblaciones.some(p => normalize(p) === city)) {
        return { block: 1, townIndex: morningRoute.poblaciones.findIndex(p => normalize(p) === city) };
    }
    if (afternoonRoute?.poblaciones.some(p => normalize(p) === city)) {
        return { block: 2, townIndex: afternoonRoute.poblaciones.findIndex(p => normalize(p) === city) };
    }
    return { block: 3, townIndex: 999 };
};

console.log("--- TEST OPTIMIZADOR SUMTRANS ---");
console.log(`Conductor: ${driver.name}`);
console.log(`Mañana: ${morningRoute?.nombre}`);
console.log(`Tarde: ${afternoonRoute?.nombre}\n`);

const enrichedRoute = localRoute.map(s => {
    const shiftInfo = getShiftInfo(s);
    return {
        ...s,
        _block: shiftInfo.block,
        _townIndex: shiftInfo.townIndex
    };
});

const sorted = enrichedRoute.sort((a, b) => {
    if (a._block !== b._block) return a._block - b._block;
    if (a._townIndex !== b._townIndex) return a._townIndex - b._townIndex;

    const [latA, lonA] = a.deliveryCoordinates.split(',').map(Number);
    const [latB, lonB] = b.deliveryCoordinates.split(',').map(Number);
    const distA = getDistance(myLat, myLon, latA, lonA);
    const distB = getDistance(myLat, myLon, latB, lonB);
    
    return distA - distB;
});

sorted.forEach((s, i) => {
    const blockLabel = s._block === 1 ? "☀️ MAÑANA" : s._block === 2 ? "🌙 TARDE" : "❓ EXTRA";
    console.log(`${i+1}. [${blockLabel}] ${s.destinationName.padEnd(20)} | ${s.destinationCity.padEnd(18)}`);
});
