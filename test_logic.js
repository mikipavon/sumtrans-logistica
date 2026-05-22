import fs from 'fs';

function testLogic() {
    const currentDriverId = "1";
    
    // Simular envíos recibidos de Supabase
    const allShipments = [
        { id: 'SUM-001', type: 'Entrega', status: 'Pendiente de asignar', assignedDriverId: "1" },
        { id: 'SUM-002', type: 'Recibo', status: 'Pendiente de asignar', assignedDriverId: "1", amount: 150.50, client: "CLIENTE VIP", porteType: "Pagado" },
        { id: 'SUM-003', type: 'Entrega', status: 'Entregado', assignedDriverId: "1" },
        { id: 'SUM-004', type: 'Recibo', status: 'Entregado', assignedDriverId: "1" }
    ];

    console.log("=== PRUEBA DE LÓGICA DE DRIVER DASHBOARD ===");
    console.log("Total envíos en DB:", allShipments.length);

    // 1. Simular lógica de 'assigned' (Ruta de reparto)
    const assigned = allShipments.filter(s => {
        if (!s || Number(s.assignedDriverId) !== Number(currentDriverId)) return false;
        if (s.status === 'Entregado' || s.status === 'Entrega aplazada') return false;
        if (s.type === 'Recibo') return false; // NUESTRO NUEVO FILTRO
        return true;
    });

    console.log(`\n1. Envíos en la Pestaña 'Ruta' (Debería ser 1: SUM-001):`);
    console.log(`   Resultado: ${assigned.length} envíos. (${assigned.map(s => s.id).join(', ')})`);
    if (assigned.some(s => s.type === 'Recibo')) {
        console.error("   ❌ ERROR: Se ha colado un Recibo en la ruta.");
    } else {
        console.log("   ✅ ÉXITO: Ningún Recibo aparece en la ruta.");
    }

    // 2. Simular lógica de 'deliveredShipments' (Historial de hoy)
    const deliveredShipments = allShipments.filter(s => {
        if (!s || s.status !== 'Entregado') return false;
        if (s.type === 'Recibo') return false; // NUESTRO NUEVO FILTRO
        return true;
    });

    console.log(`\n2. Envíos en 'Historial de Entregas' (Debería ser 1: SUM-003):`);
    console.log(`   Resultado: ${deliveredShipments.length} envíos. (${deliveredShipments.map(s => s.id).join(', ')})`);
    if (deliveredShipments.some(s => s.type === 'Recibo')) {
        console.error("   ❌ ERROR: Se ha colado un Recibo en el historial.");
    } else {
        console.log("   ✅ ÉXITO: Ningún Recibo aparece en el historial.");
    }

    // 3. Simular lógica de 'pendingShipments' para Cobros (Tab de cuentas)
    const pendingShipments = allShipments.filter(s =>
        s &&
        (Number(s.assignedDriverId) === Number(currentDriverId)) &&
        s.status !== 'Cancelado'
    );

    // Filter just to see if the Recibo is there to generate a debt item
    const recibosInCollections = pendingShipments.filter(s => s.type === 'Recibo' && s.status !== 'Entregado');
    
    console.log(`\n3. Envíos en 'Cobros Pendientes' (Debería detectar SUM-002):`);
    console.log(`   Resultado: ${recibosInCollections.length} recibos pendientes para cobrar. (${recibosInCollections.map(s => s.id).join(', ')})`);
    if (recibosInCollections.length > 0) {
        console.log("   ✅ ÉXITO: El Recibo SÍ aparece para que el conductor lo cobre.");
    } else {
        console.error("   ❌ ERROR: El Recibo no aparece en cobros.");
    }
}

testLogic();
