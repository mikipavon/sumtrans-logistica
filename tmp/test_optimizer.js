
const localRoute = [
    { id: 1, destinationName: "Talleres Atalaya", destinationAddress: "Polígono Industrial Mantón de Manila, Parcela 15", destinationCity: "Cabra", destinationZip: "14940" },
    { id: 2, destinationName: "Maderas Alcántara", destinationAddress: "Calle San Marcos, 1", destinationCity: "Cabra", destinationZip: "14940" },
    { id: 3, destinationName: "Autos Cabra", destinationAddress: "Avenida de la Constitución, 10", destinationCity: "Cabra", destinationZip: "14940" },
    { id: 4, destinationName: "Recambios Cabra", destinationAddress: "Calle Juan Valera, 20", destinationCity: "Cabra", destinationZip: "14940" },
    { id: 5, destinationName: "Talleres Hnos. Pérez", destinationAddress: "Polígono Industrial Mantón de Manila, Parcela 40", destinationCity: "Cabra", destinationZip: "14940" },
    { id: 6, destinationName: "Venta El Cruce", destinationAddress: "Ctra. Lucena - Cabra, s/n", destinationCity: "Cabra", destinationZip: "14940" }
];

console.log("--- RUTA SIN OPTIMIZAR ---");
localRoute.forEach(s => console.log(`[${s.id}] ${s.destinationName} - ${s.destinationAddress}`));

const sorted = [...localRoute].sort((a, b) => {
    if (!a || !b) return 0;

    // 1. Priority by City (Main Cluster)
    const cityA = (a.destinationCity || '').trim().toLowerCase();
    const cityB = (b.destinationCity || '').trim().toLowerCase();
    if (cityA !== cityB) return cityA.localeCompare(cityB);

    // 2. Priority by Zip Code (Sub-cluster)
    const zipA = (a.destinationZip || '').trim();
    const zipB = (b.destinationZip || '').trim();
    if (zipA !== zipB) return zipA.localeCompare(zipB);

    // 3. Priority by Street Address (Simulates "passing by the door")
    const addrA = (a.destinationAddress || a.address || '').trim().toLowerCase();
    const addrB = (b.destinationAddress || b.address || '').trim().toLowerCase();
    if (addrA !== addrB) return addrA.localeCompare(addrB);

    // 4. Fallback by client name
    const nameA = (a.destinationName || a.client || '').trim().toLowerCase();
    const nameB = (b.destinationName || b.client || '').trim().toLowerCase();
    return nameA.localeCompare(nameB);
});

console.log("\n--- RUTA OPTIMIZADA (V3 - GEOGRÁFICA) ---");
sorted.forEach((s, idx) => console.log(`${idx + 1}. [${s.id}] ${s.destinationName} - ${s.destinationAddress}`));
