// Test para verificar la lógica de ocultación de enrutamiento basada en fechas programadas
function testDriverDashboardFilter() {
    const currentDriverId = 1;

    // Simulated Date generator for local comparisons
    const now = new Date();
    
    // Future and past strings formatted identically to HTML datetime-local (YYYY-MM-DDTHH:mm)
    const futureHourDate = new Date(now.getTime() + 60 * 60 * 1000);
    const futureHourStr = new Date(futureHourDate.getTime() - futureHourDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const pastHourDate = new Date(now.getTime() - 60 * 60 * 1000);
    const pastHourStr = new Date(pastHourDate.getTime() - pastHourDate.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowPureStr = new Date(tomorrowDate.getTime() - tomorrowDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    const yesterdayDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const yesterdayPureStr = new Date(yesterdayDate.getTime() - yesterdayDate.getTimezoneOffset() * 60000).toISOString().slice(0, 10);

    
    const allShipments = [
        { id: '1-NOW', assignedDriverId: 1, status: 'Pendiente de asignar', scheduledDate: null },
        { id: '2-TOMORROW-DATE', assignedDriverId: 1, status: 'Pendiente', scheduledDate: tomorrowPureStr },
        { id: '3-YESTERDAY-DATE', assignedDriverId: 1, status: 'En reparto', scheduledDate: yesterdayPureStr },
        { id: '4-FUTURE-1H', assignedDriverId: 1, status: 'Pendiente', scheduledDate: futureHourStr },
        { id: '5-PAST-1H', assignedDriverId: 1, status: 'Pendiente', scheduledDate: pastHourStr }
    ];

    console.log("⌚ Hora local simulada de ahora mismo:", new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    console.log("\n📦 Envíos en base de datos asignados a este conductor:");
    allShipments.forEach(s => console.log(` - ID: ${s.id} | Programado: ${s.scheduledDate || 'INMEDIATO'}`));

    // --- LÓGICA COPIADA EXACTA DE DriverDashboard.jsx ---
    const localCurrentStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const assigned = allShipments.filter(s => {
        if (!s || Number(s.assignedDriverId) !== Number(currentDriverId)) return false;
        if (s.status === 'Entregado' || s.status === 'Entrega aplazada') return false;
        
        if (s.scheduledDate) {
            if (s.scheduledDate.length === 10) {
                // It's a pure date "YYYY-MM-DD"
                const todayStr = localCurrentStr.split('T')[0];
                if (s.scheduledDate > todayStr) return false;
            } else {
                // It's a datetime "YYYY-MM-DDTHH:mm"
                if (s.scheduledDate > localCurrentStr) return false;
            }
        }
        return true;
    });

    console.log("\n✅ ENTRADA EN EL MÓVIL DEL TRANSPORTISTA (Los que pasaron el filtro y verá ahora mismo):");
    assigned.forEach(s => console.log(` -> APARECE: ${s.id}`));
    
    console.log("\n❌ OCULTOS POR EXCESO DE TIEMPO (Los tiene asignados pero están retenidos hasta su momento):");
    const oculta = allShipments.filter(s => !assigned.find(a => a.id === s.id));
    oculta.forEach(s => console.log(` -> RETENIDO: ${s.id}`));
}

testDriverDashboardFilter();
