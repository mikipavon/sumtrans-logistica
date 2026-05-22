import fs from 'fs';

// --- SIMULACIÓN DE LA LÓGICA DE APP.JSX (Módulo ESM) ---

let clients = [
    { id: 1, name: 'CLIENTE_ANTIGUO_CON_GPS', coordinates: '37.47, -4.45', status: 'pending' },
    { id: 2, name: 'CLIENTE_ANTIGUO_SIN_GPS', coordinates: '', status: 'pending' }
];

let shipments = [];

const handleAddClient = (newClient) => {
    clients.push(newClient);
    return Promise.resolve();
};

const handleUpdateClient = (id, updates) => {
    clients = clients.map(c => c.id === id ? { ...c, ...updates } : c);
    return Promise.resolve();
};

const simulateAddShipment = async (newShipment) => {
    const senderExists = clients.find(c => c.name.toLowerCase() === newShipment.client?.toLowerCase());
    if (!senderExists && newShipment.client) {
        const newClientData = {
            id: Date.now(),
            name: newShipment.client,
            coordinates: newShipment.originCoordinates || '',
            status: 'pending'
        };
        await handleAddClient(newClientData);
    } else if (senderExists && !senderExists.coordinates && newShipment.originCoordinates && senderExists.status === 'pending') {
        await handleUpdateClient(senderExists.id, { coordinates: newShipment.originCoordinates });
    }

    const receiverExists = clients.find(c => c.name.toLowerCase() === newShipment.destinationName?.toLowerCase());
    if (!receiverExists && newShipment.destinationName) {
        const newClientData = {
            id: Date.now() + 1,
            name: newShipment.destinationName,
            coordinates: newShipment.destinationCoordinates || '', 
            status: 'pending'
        };
        await handleAddClient(newClientData);
    } else if (receiverExists && !receiverExists.coordinates && newShipment.destinationCoordinates && receiverExists.status === 'pending') {
        await handleUpdateClient(receiverExists.id, { coordinates: newShipment.destinationCoordinates });
    }
};

const simulateStatusChange = async (shipmentId, newStatus, deliveryCoordinates) => {
    const shipment = shipments.find(s => s.id === shipmentId);
    if (newStatus === 'Entregado' && shipment && shipment.destinationName) {
        const existingClient = clients.find(c => c.name.toLowerCase() === shipment.destinationName.toLowerCase());
        if (existingClient && existingClient.status === 'pending') {
            await handleUpdateClient(existingClient.id, { coordinates: deliveryCoordinates });
        }
    }
};

// --- EJECUCIÓN ---

async function runTests() {
    let log = "=== RESULTADOS DEL TEST FINAL (ESM) DE COORDENADAS ===\n\n";

    // TEST 1: Remitente automático
    log += "1. TEST AUTOMÁTICO REMITENTE (AL CREAR ALBARÁN)...\n";
    await simulateAddShipment({
        client: 'NEGOCIO_NUEVO_REMITENTE',
        originCoordinates: '37.111, -4.111', 
        destinationName: 'CLIENTE_ANTIGUO_CON_GPS'
    });
    let c1 = clients.find(c => c.name === 'NEGOCIO_NUEVO_REMITENTE');
    log += c1 && c1.coordinates === '37.111, -4.111' ? "✅ ÉXITO: Remitente capturado AUTOMÁTICAMENTE.\n" : "❌ FALLO.\n";

    // TEST 2: Destinatario automático en firma
    log += "\n2. TEST AUTOMÁTICO DESTINATARIO (AL FIRMAR ENTREGA)...\n";
    // Primero creamos el albarán (sin GPS en destino porque aún no hemos llegado)
    await simulateAddShipment({
        client: 'CLIENTE_ANTIGUO_CON_GPS',
        destinationName: 'TIENDA_NUEVA_DESTINO',
        destinationCoordinates: ''
    });
    shipments.push({ id: 'ID-100', destinationName: 'TIENDA_NUEVA_DESTINO' });
    
    // Ahora el chófer entrega y firma
    await simulateStatusChange('ID-100', 'Entregado', '37.222, -4.222');
    let c2 = clients.find(c => c.name === 'TIENDA_NUEVA_DESTINO');
    log += c2 && c2.coordinates === '37.222, -4.222' ? "✅ ÉXITO: Destinatario capturado AUTOMÁTICAMENTE en la firma.\n" : "❌ FALLO.\n";

    fs.writeFileSync('tmp/test_coordenadas_results.txt', log);
    process.stdout.write(log);
}

runTests();
