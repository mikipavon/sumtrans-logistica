import { describe, it, expect } from 'vitest';
import { calculateDailyAccount, parseAmount, isToday, isCashClient } from './accountLogic';

describe('accountLogic utilities', () => {
    describe('parseAmount', () => {
        it('should handle numbers correctly', () => {
            expect(parseAmount(10.5)).toBe(10.5);
        });
        it('should handle European comma format', () => {
            expect(parseAmount('10,50')).toBe(10.5);
            expect(parseAmount('1.250,75')).toBe(1250.75);
        });
        it('should handle currency symbols', () => {
            expect(parseAmount('€10.50')).toBe(10.5);
        });
        it('should return 0 for invalid values', () => {
            expect(parseAmount(null)).toBe(0);
            expect(parseAmount(undefined)).toBe(0);
            expect(parseAmount('abc')).toBe(0);
        });
    });

    describe('isToday', () => {
        it('should return true for today', () => {
            const today = new Date().toISOString();
            expect(isToday(today)).toBe(true);
        });
        it('should return false for yesterday', () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            expect(isToday(yesterday.toISOString())).toBe(false);
        });
    });

    describe('isCashClient', () => {
        const mockClients = [
            { name: 'Client A', billingType: 'Clientes Habituales' },
            { name: 'Client B', billingType: 'Facturación Mensual' },
            { name: 'Client C', billingType: 'Escritura Libre' }
        ];

        it('should return true for cash clients', () => {
            expect(isCashClient('Client A', mockClients)).toBe(true);
            expect(isCashClient('Client C', mockClients)).toBe(true);
        });
        it('should return false for invoice clients', () => {
            expect(isCashClient('Client B', mockClients)).toBe(false);
        });
        it('should return true for unknown clients (conservative safety)', () => {
            expect(isCashClient('Unknown', mockClients)).toBe(true);
        });
    });
});

describe('calculateDailyAccount logic - Los 7 Casos de Negocio', () => {
    const mockDriverId = 1;
    const today = new Date().toISOString();
    const mockClients = [
        { name: 'Invoice Client', billingType: 'Facturación' },
        { name: 'Cash Client', billingType: 'Clientes Habituales' }
    ];

    it('CASO 1: Facturación + Pagado -> Nada en caja', () => {
        const shipments = [{ 
            id: 'C1', porteType: 'Pagado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '50.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.dailyTotal).toBe(0);
    });

    it('CASO 2: Clientes Habituales + Pagado (Sin pagar) -> Nada en caja', () => {
        const shipments = [{ 
            id: 'C2', porteType: 'Pagado', portePaid: false, client: 'Cash Client', 
            assignedDriverId: 1, amount: '30.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.dailyTotal).toBe(0);
    });

    it('CASO 3: Debido + Clientes Habituales -> Porte en caja', () => {
        const shipments = [{ 
            id: 'C3', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Cash Client', 
            assignedDriverId: 1, paidAt: today, amount: '25.00' 
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(25);
    });

    it('CASO 4: Facturación + Pagado + Reembolso -> Solo Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C4', porteType: 'Pagado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '40.00', hasCod: true, codAmount: '100.00', codPaid: true, status: 'Entregado'
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(100);
    });

    it('CASO 5: Clientes Habituales + Pagado + Reembolso -> Solo Reembolso en caja (si porte sigue pendiente)', () => {
        const shipments = [{ 
            id: 'C5', porteType: 'Pagado', portePaid: false, client: 'Cash Client', 
            assignedDriverId: 1, amount: '35.00', hasCod: true, codAmount: '80.00', codPaid: true, status: 'Entregado', paidAt: today
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(80);
    });

    it('CASO 6: Debido + Clientes Habituales + Reembolso -> Porte y Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C6', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Cash Client', 
            assignedDriverId: 1, paidAt: today, amount: '45.00', hasCod: true, codAmount: '120.00', codPaid: true
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(45);
        expect(result.collectedReembolsos).toBe(120);
    });

    it('CASO 7: Debido + Facturación + Reembolso -> Solo Reembolso en caja', () => {
        const shipments = [{ 
            id: 'C7', porteType: 'Debido', status: 'Entregado', portePaid: true, client: 'Invoice Client', 
            assignedDriverId: 1, paidAt: today, amount: '50.00', hasCod: true, codAmount: '90.00', codPaid: true
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(90);
    });

    it('el detalle de reembolsos lleva la fecha DEL ALBARÁN, que es la que imprime el justificante', () => {
        // Un reembolso de un albarán de días atrás, cobrado hoy: es justo el caso en
        // el que el justificante sacaba la fecha del reloj del móvil y le ponía hoy.
        const shipments = [{
            id: 'R1', client: 'Cash Client', assignedDriverId: 1, amount: '30.00',
            hasCod: true, codAmount: '148.19', codPaid: true, status: 'Entregado',
            paidAt: today, date: '7/9/2026'
        }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: [] });
        expect(result.allReimbursementsDetail).toHaveLength(1);
        expect(result.allReimbursementsDetail[0].date).toBe('7/9/2026');
    });

    it('un reembolso cobrado a mano trae la fecha del albarán, no la del día en que se marcó cobrado', () => {
        const shipments = [{ id: 'R2', client: 'Cash Client', assignedDriverId: 1, date: '3/9/2026', codPaid: true }];
        // c.date es de hoy: es lo que hace que el cobro entre en la cuenta de hoy.
        const collected = [{ id: 'M9', type: 'Reembolso', amount: '50.00', date: today, client: 'Cash Client', shipmentId: 'R2', driverId: 1 }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: collected });
        expect(result.allReimbursementsDetail[0].date).toBe('3/9/2026');
    });

    it('un porte cobrado a mano se lista con la fecha de su albarán, no con la del día del cobro', () => {
        const shipments = [{ id: 'P9', client: 'Cash Client', assignedDriverId: 1, date: '3/9/2026', portePaid: true, amount: '40.00' }];
        const collected = [{ id: 'M8', type: 'Porte', amount: '40.00', date: today, client: 'Cash Client', shipmentId: 'P9', driverId: 1 }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: mockClients, collectedCollections: collected });
        expect(result.allPorteDetail[0].date).toBe('3/9/2026');
    });

    it('should include manual collections', () => {
        const collected = [{ id: 'M1', type: 'Porte', amount: '20.00', date: today, client: 'Manual' }];
        const result = calculateDailyAccount({ allShipments: [], driverId: mockDriverId, clients: [], collectedCollections: collected });
        expect(result.collectedPorte).toBe(20);
    });

    it('should filter out other drivers collections', () => {
        const shipments = [{ id: 'S1', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: 2, paidAt: today, amount: '10.00' }];
        const result = calculateDailyAccount({ allShipments: shipments, driverId: mockDriverId, clients: [], collectedCollections: [] });
        expect(result.dailyTotal).toBe(0);
    });

    it('should filter out old collections', () => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const shipments = [
            { id: 'S1', porteType: 'Pagado', portePaid: true, assignedDriverId: 1, paidAt: yesterday.toISOString(), amount: '10.00' }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.dailyTotal).toBe(0);
    });

    it('should calculate Case 5 (Porte Pagado + Reembolso) correctly', () => {
        const shipments = [
            { 
                id: 'CASE5', 
                porteType: 'Pagado', 
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '12.00', 
                client: 'Miki Test',
                hasCod: true,
                codAmount: '100.00',
                codPaid: true,
                status: 'Entregado'
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.collectedPorte).toBe(12);
        expect(result.collectedReembolsos).toBe(100);
        expect(result.dailyTotal).toBe(112);
    });

    it('should calculate Case 6 (Porte Debido + Contado) correctly', () => {
        const shipments = [
            { 
                id: 'CASE6', 
                porteType: 'Debido', 
                status: 'Entregado',
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '25.00', 
                client: 'Cash Client',
                destinationName: 'Destinatario Final'
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: [],
            collectedCollections: []
        });
        expect(result.collectedPorte).toBe(25);
        expect(result.dailyTotal).toBe(25);
    });

    it('should calculate Case 7 (Porte Debido Facturación + Reembolso Contado) correctly', () => {
        const mockClients = [{ name: 'Invoice Client', billingType: 'Facturación' }];
        const shipments = [
            { 
                id: 'CASE7', 
                porteType: 'Debido', 
                status: 'Entregado',
                portePaid: true, 
                assignedDriverId: 1, 
                paidAt: today, 
                amount: '50.00', 
                client: 'Invoice Client', // The payer
                hasCod: true,
                codAmount: '150.00',
                codPaid: true
            }
        ];
        const result = calculateDailyAccount({
            allShipments: shipments,
            driverId: mockDriverId,
            clients: mockClients,
            collectedCollections: []
        });
        // Porte (50) should be 0 because client is 'Facturación'
        expect(result.collectedPorte).toBe(0);
        // COD (150) should still be collected
        expect(result.collectedReembolsos).toBe(150);
        expect(result.dailyTotal).toBe(150);
    });
});

describe('Cobros cuyo envío no está en la lista cargada', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();

    // `allShipments` solo trae los envíos activos y los finalizados de los últimos 90
    // días. Antes, no encontrar el envío se interpretaba como "lo borró el admin" y el
    // cobro se descontaba de la caja: dinero que el conductor lleva encima y que
    // desaparecía de la cuenta del día sin ningún aviso.
    it('cuenta el cobro aunque su envío no esté cargado', () => {
        const cobros = [
            { id: 'COL-1', type: 'Porte', amount: '25.00', shipmentId: 'FUERA-DE-VENTANA', date: hoy },
            { id: 'COL-2', type: 'Reembolso', amount: '100.00', shipmentId: 'FUERA-DE-VENTANA-2', date: hoy }
        ];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(25);
        expect(result.collectedReembolsos).toBe(100);
        expect(result.dailyTotal).toBe(125);
    });

    it('marca esos cobros para que la oficina vea que no se pueden contrastar', () => {
        const cobros = [{ id: 'COL-1', type: 'Porte', amount: '25.00', shipmentId: 'NO-CARGADO', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.allPorteDetail[0].shipmentMissing).toBe(true);
    });

    it('no marca los cobros cuyo envío sí está cargado', () => {
        const envio = { id: 'S1', porteType: 'Debido', status: 'Pendiente', portePaid: true, assignedDriverId: driverId, amount: '25.00' };
        const cobros = [{ id: 'COL-1', type: 'Porte', amount: '25.00', shipmentId: 'S1', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [envio], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.allPorteDetail[0].shipmentMissing).toBe(false);
    });

    // El descarte sigue existiendo, pero solo con constancia real del borrado.
    it('descarta el cobro cuando consta que el envío fue borrado', () => {
        const cobros = [
            { id: 'COL-1', type: 'Porte', amount: '25.00', shipmentId: 'BORRADO', date: hoy },
            { id: 'COL-2', type: 'Reembolso', amount: '100.00', shipmentId: 'BORRADO', date: hoy }
        ];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros,
            deletedShipmentIds: ['BORRADO']
        });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(0);
        expect(result.dailyTotal).toBe(0);
    });

    it('acepta deletedShipmentIds como Set', () => {
        const cobros = [{ id: 'COL-1', type: 'Porte', amount: '25.00', shipmentId: 'BORRADO', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros,
            deletedShipmentIds: new Set(['BORRADO'])
        });
        expect(result.collectedPorte).toBe(0);
    });

    it('un cobro sin shipmentId nunca se descarta', () => {
        const cobros = [{ id: 'COL-SUELTO', type: 'Porte', amount: '40.00', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros,
            deletedShipmentIds: ['BORRADO']
        });
        expect(result.collectedPorte).toBe(40);
    });
});

// ── El suplente que cubre la ruta de otro ─────────────────────────────────────
// El albarán sigue asignado al conductor habitual —el que hoy no ha venido— pero lo
// entrega y lo cobra el suplente. El dinero es de quien lo lleva en el bolsillo.

describe('cobros de un conductor que cubre la ruta de otro', () => {
    const HABITUAL = 1;   // el dueño de la ruta, hoy ausente
    const SUPLENTE = 9;   // el que la cubre
    const hoy = new Date().toISOString();
    const clientes = [{ name: 'Cash Client', billingType: 'Clientes Habituales' }];

    const albaran = (extra = {}) => ({
        id: 'S1', porteType: 'Debido', status: 'Entregado', portePaid: true,
        client: 'Cash Client', destinationName: 'Cash Client',
        assignedDriverId: HABITUAL, paidAt: hoy, amount: '7.00', ...extra,
    });

    const cuentaDe = (envios, driverId) => calculateDailyAccount({
        allShipments: envios, driverId, clients: clientes, collectedCollections: [],
    });

    it('el porte es de quien lo cobra, no de quien tenía asignado el albarán', () => {
        const envios = [albaran({ porteCollectedById: SUPLENTE })];
        expect(cuentaDe(envios, SUPLENTE).collectedPorte).toBe(7);
        expect(cuentaDe(envios, HABITUAL).collectedPorte).toBe(0);
    });

    // Lo que pasaba antes de guardar porteCollectedById en la entrega: el dinero se le
    // apuntaba al conductor que no lo tenía.
    it('sin ese campo, los 7 € se le apuntan al conductor equivocado', () => {
        const envios = [albaran()];
        expect(cuentaDe(envios, SUPLENTE).collectedPorte).toBe(0);
        expect(cuentaDe(envios, HABITUAL).collectedPorte).toBe(7);
    });

    it('lo mismo con el reembolso', () => {
        const envios = [albaran({
            porteCollectedById: SUPLENTE,
            hasCod: true, codAmount: '50.00', codPaid: true, codCollectedById: SUPLENTE,
        })];
        expect(cuentaDe(envios, SUPLENTE).collectedReembolsos).toBe(50);
        expect(cuentaDe(envios, HABITUAL).collectedReembolsos).toBe(0);
    });
});

describe('la oficina deshace un cobro marcado por error', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();

    // Un compañero pulsa "Marcar Cobrado" sin querer. La oficina edita el albarán
    // y lo pone en Pendiente de Cobro: portePaid vuelve a false. La entrada que
    // apuntó el móvil en la lista de cobros del día no se borra sola, y la Cuenta
    // seguía sumándola aunque el albarán dijera que no se había cobrado.
    it('el porte desaparece de la Cuenta cuando el albarán vuelve a Pendiente de Cobro', () => {
        const albaran = { id: 'HAB-71', porteType: 'Pagado', portePaid: false, paymentStatus: 'Pending', createdById: driverId, amount: '30.00' };
        const cobros = [{ id: 'COL-1', type: 'Porte', amount: '30.00', shipmentId: 'HAB-71', date: hoy, client: 'Antiguo' }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(0);
        expect(result.allPorteDetail).toHaveLength(0);
        expect(result.dailyTotal).toBe(0);
    });

    it('lo mismo con un reembolso desmarcado', () => {
        const albaran = { id: 'HAB-72', status: 'Entregado', hasCod: true, codAmount: '50.00', codPaid: false, assignedDriverId: driverId };
        const cobros = [{ id: 'COL-2', type: 'Reembolso', amount: '50.00', shipmentId: 'HAB-72', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedReembolsos).toBe(0);
        expect(result.allReimbursementsDetail).toHaveLength(0);
    });

    it('si el albarán sigue cobrado, la entrada cuenta como siempre', () => {
        const albaran = { id: 'HAB-73', porteType: 'Pagado', portePaid: true, createdById: driverId, amount: '30.00', paidAt: hoy };
        const cobros = [{ id: 'COL-3', type: 'Porte', amount: '30.00', shipmentId: 'HAB-73', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(30);
        expect(result.allPorteDetail).toHaveLength(1);
    });

    // Si el albarán corregido no está cargado no se puede saber, y el dinero no
    // puede desaparecer de la caja sin constancia.
    it('sin el albarán cargado, la entrada se mantiene', () => {
        const cobros = [{ id: 'COL-4', type: 'Porte', amount: '30.00', shipmentId: 'NO-CARGADO', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(30);
    });

    // La entrada guarda el pagador tal como estaba al cobrar; si la oficina
    // corrige el destinatario después, la Cuenta enseña el nombre nuevo.
    it('la Cuenta enseña el destinatario actual del albarán, no el que había al cobrar', () => {
        const albaran = { id: 'HAB-74', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: driverId, amount: '12.00', destinationName: 'Nombre Corregido' };
        const cobros = [{ id: 'COL-5', type: 'Porte', amount: '12.00', shipmentId: 'HAB-74', date: hoy, client: 'Nombre Equivocado' }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.allPorteDetail[0].client).toBe('Nombre Corregido');
    });
});

// ── Reembolsos de ayer que la oficina retoca hoy ──────────────────────────────
// La Cuenta de Kisko de hoy enseñaba dos reembolsos cobrados ayer: la oficina
// había tocado esos albaranes hoy (updatedAt de hoy) y el reembolso se fechaba
// por updatedAt cuando faltaba paidAt.

describe('reembolsos cobrados otro día no entran en la Cuenta de hoy', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();
    const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })();

    const reembolso = (extra = {}) => ({
        id: 'HAB-19', porteType: 'Pagado', status: 'Entregado', hasCod: true, codAmount: '132.80', codPaid: true,
        assignedDriverId: driverId, client: 'Remitente', destinationName: 'José Ángel', ...extra,
    });

    const cuenta = (envio) => calculateDailyAccount({
        allShipments: [envio], driverId, clients: [], collectedCollections: []
    });

    it('cobrado ayer y retocado hoy por la oficina: no sale', () => {
        const result = cuenta(reembolso({ paidAt: ayer, updatedAt: hoy }));
        expect(result.collectedReembolsos).toBe(0);
        expect(result.allReimbursementsDetail).toHaveLength(0);
    });

    it('entregado ayer sin hora de cobro y retocado hoy: no sale', () => {
        const result = cuenta(reembolso({ deliveredAt: ayer, updatedAt: hoy }));
        expect(result.collectedReembolsos).toBe(0);
    });

    it('albarán antiguo sin hora de cobro ni de entrega, retocado hoy: no sale', () => {
        const result = cuenta(reembolso({ updatedAt: hoy, date: ayer }));
        expect(result.collectedReembolsos).toBe(0);
    });

    it('cobrado hoy: sale', () => {
        const result = cuenta(reembolso({ paidAt: hoy, updatedAt: hoy }));
        expect(result.collectedReembolsos).toBe(132.8);
    });

    it('entregado hoy sin hora de cobro guardada: sale', () => {
        const result = cuenta(reembolso({ deliveredAt: hoy, updatedAt: hoy }));
        expect(result.collectedReembolsos).toBe(132.8);
    });
});

// ── Portes Debido de ayer que la oficina retoca hoy ──────────────────────────
// Mismo fallo que los reembolsos: el porte Debido se fechaba por updatedAt.

describe('portes Debido cobrados otro día no entran en la Cuenta de hoy', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();
    const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })();

    const porte = (extra = {}) => ({
        id: 'HAB-60', porteType: 'Debido', status: 'Entregado', portePaid: true, amount: '7.00',
        assignedDriverId: driverId, client: 'Remitente', destinationName: 'Diego Rey', ...extra,
    });

    const cuenta = (envio) => calculateDailyAccount({
        allShipments: [envio], driverId, clients: [], collectedCollections: []
    });

    it('cobrado ayer y retocado hoy por la oficina: no sale', () => {
        const result = cuenta(porte({ paidAt: ayer, deliveredAt: ayer, updatedAt: hoy }));
        expect(result.collectedPorte).toBe(0);
        expect(result.allPorteDetail).toHaveLength(0);
    });

    it('entregado ayer sin hora de cobro y retocado hoy: no sale', () => {
        const result = cuenta(porte({ deliveredAt: ayer, updatedAt: hoy }));
        expect(result.collectedPorte).toBe(0);
    });

    it('cobrado hoy: sale', () => {
        const result = cuenta(porte({ paidAt: hoy, updatedAt: hoy }));
        expect(result.collectedPorte).toBe(7);
    });

    it('entregado hoy sin hora de cobro guardada: sale', () => {
        const result = cuenta(porte({ deliveredAt: hoy, updatedAt: hoy }));
        expect(result.collectedPorte).toBe(7);
    });
});

// ── Cobrar el porte no arrastra el reembolso (ni al revés) ───────────────────
//
// Caso real del 10/09/2026: el reembolso de Carmen lo cobró Juan Carlos hace días;
// hoy un compañero cobra el porte que quedaba pendiente de ESE MISMO albarán. Como
// `paidAt` era una sola fecha para los dos conceptos, el cobro del porte la pisaba
// con la de hoy y la Cuenta le resucitaba a Juan Carlos el reembolso de otro día
// (HAB-122: 382,80 € y HAB-145: 729,50 €, dinero que no llevaba encima).

describe('cada concepto se fecha por su propio cobro', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();
    const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString(); })();

    const cuenta = (envio) => calculateDailyAccount({
        allShipments: [envio], driverId, clients: [], collectedCollections: []
    });

    const carmen = (extra = {}) => ({
        id: 'HAB-122', porteType: 'Debido', status: 'Entregado', amount: '7.00',
        hasCod: true, codAmount: '382.80', codPaid: true, codCollectedById: driverId,
        assignedDriverId: driverId, client: 'Remitente', destinationName: 'Carmen',
        deliveredAt: ayer, ...extra,
    });

    it('el reembolso se cobró ayer y hoy se cobra el porte: el reembolso NO vuelve a la caja de hoy', () => {
        const result = cuenta(carmen({
            codPaidAt: ayer,
            portePaid: true, portePaidAt: hoy, porteCollectedById: driverId,
            paidAt: hoy, // lo pisó el cobro del porte, y antes esto bastaba para resucitarlo
            updatedAt: hoy,
        }));
        expect(result.collectedReembolsos).toBe(0);
        expect(result.allReimbursementsDetail).toHaveLength(0);
        // El porte, que sí se ha cobrado hoy, entra igual.
        expect(result.collectedPorte).toBe(7);
    });

    it('al revés: el porte se cobró ayer y hoy se cobra el reembolso', () => {
        const result = cuenta(carmen({
            portePaid: true, portePaidAt: ayer, porteCollectedById: driverId,
            codPaidAt: hoy,
            paidAt: hoy,
            updatedAt: hoy,
        }));
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(382.8);
    });

    it('los dos cobrados hoy: entran los dos', () => {
        const result = cuenta(carmen({
            portePaid: true, portePaidAt: hoy, porteCollectedById: driverId,
            codPaidAt: hoy, paidAt: hoy, deliveredAt: hoy,
        }));
        expect(result.collectedPorte).toBe(7);
        expect(result.collectedReembolsos).toBe(382.8);
    });

    it('albarán de antes del cambio (sin fechas por concepto): se sigue apañando con paidAt', () => {
        const conFecha = cuenta(carmen({ paidAt: hoy }));
        expect(conFecha.collectedReembolsos).toBe(382.8);

        const deAyer = cuenta(carmen({ paidAt: ayer, updatedAt: hoy }));
        expect(deAyer.collectedReembolsos).toBe(0);
    });

    it('un Porte Pagado cobrado en origen ayer no vuelve porque hoy se cobre el reembolso', () => {
        const result = cuenta({
            id: 'HAB-145', porteType: 'Pagado', status: 'Entregado', amount: '9.00',
            client: 'Remitente', destinationName: 'Carmen',
            portePaid: true, portePaidAt: ayer, porteCollectedById: driverId,
            hasCod: true, codAmount: '729.50', codPaid: true, codCollectedById: driverId,
            codPaidAt: hoy, paidAt: hoy,
            assignedDriverId: driverId, date: '9/9/2026', updatedAt: hoy,
        });
        expect(result.collectedPorte).toBe(0);
        expect(result.collectedReembolsos).toBe(729.5);
    });
});

// -- La oficina corrige el precio de un albaran YA cobrado --------------------
// El repartidor cobro 15 EUR de un porte que eran 12 y la oficina lo corrige en
// la ficha. Manda el albaran: la Cuenta tiene que enseñar 12. Antes ganaba el
// importe que el movil apunto al cobrar y se quedaba en 15 para siempre.

describe('la oficina corrige el precio despues del cobro', () => {
    const driverId = 1;
    const hoy = new Date().toISOString();

    it('el porte de la Cuenta pasa a ser el precio nuevo del albaran', () => {
        const albaran = { id: 'HAB-122', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: driverId, amount: '12.00', customAmount: 12, destinationName: 'Mundo fiesta', paidAt: hoy };
        const cobros = [{ id: 'COL-1', type: 'Porte', amount: '15.00', shipmentId: 'HAB-122', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(12);
        expect(result.allPorteDetail).toHaveLength(1);
        expect(result.allPorteDetail[0].amount).toBe('12.00');
        expect(result.dailyTotal).toBe(12);
    });

    it('el reembolso corregido tambien manda, y el total cuadra con sus lineas', () => {
        const albaran = { id: 'SUM-667', status: 'Entregado', hasCod: true, codAmount: '100.00', codPaid: true, assignedDriverId: driverId, codPaidAt: hoy };
        const cobros = [{ id: 'COL-2', type: 'Reembolso', amount: '112.80', shipmentId: 'SUM-667', date: hoy, client: 'ISPAVICARS' }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        const sumaLineas = result.allReimbursementsDetail.reduce((t, l) => t + parseAmount(l.amount), 0);
        expect(result.collectedReembolsos).toBe(100);
        expect(sumaLineas).toBe(100);
    });

    // Sin albaran que consultar no hay precio bueno que valga: se respeta lo que
    // apunto el cobro, que es la unica constancia de ese dinero.
    it('si el albaran no esta cargado, se queda el importe del cobro', () => {
        const cobros = [{ id: 'COL-3', type: 'Porte', amount: '15.00', shipmentId: 'NO-CARGADO', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(15);
        expect(result.allPorteDetail[0].amount).toBe('15.00');
    });

    // "Tarifa" no es un precio: parsearlo da 0 y borraria el cobro de la caja.
    it('un albaran con precio "Tarifa" no borra el importe cobrado', () => {
        const albaran = { id: 'HAB-124', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: driverId, amount: 'Tarifa', paidAt: hoy };
        const cobros = [{ id: 'COL-4', type: 'Porte', amount: '10.00', shipmentId: 'HAB-124', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(10);
        expect(result.allPorteDetail[0].amount).toBe('10.00');
    });

    // HAB-397: la oficina deja el porte a 0 despues de que JAVITO cobrara 7.
    it('un porte corregido a 0 deja la Cuenta a 0, no vuelve al importe cobrado', () => {
        const albaran = { id: 'HAB-397', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: driverId, amount: '0', customAmount: 0, paidAt: hoy };
        const cobros = [{ id: 'COL-5', type: 'Porte', amount: '7.00', shipmentId: 'HAB-397', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(0);
        expect(result.allPorteDetail[0].amount).toBe('0.00');
    });

    it('un albaran con el precio vacio no borra el importe cobrado', () => {
        const albaran = { id: 'HAB-125', porteType: 'Debido', status: 'Entregado', portePaid: true, assignedDriverId: driverId, amount: '', paidAt: hoy };
        const cobros = [{ id: 'COL-6', type: 'Porte', amount: '9.00', shipmentId: 'HAB-125', date: hoy }];
        const result = calculateDailyAccount({
            allShipments: [albaran], driverId, clients: [], collectedCollections: cobros
        });
        expect(result.collectedPorte).toBe(9);
    });
});

// ── Un porte cobrado hoy no puede salir en la caja de ayer ───────────────────
// La fecha del albarán (o de la entrega) entraba como alternativa aunque el cobro
// ya tuviera la suya: ECUGENIL HAB-304 salía en el cierre de ayer y en el de hoy.

describe('un porte cobrado hoy sale solo en la Cuenta de hoy', () => {
    const driverId = 1;
    const hoy = new Date();
    const ayer = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })();
    const clients = [{ name: 'ECUGENIL', billingType: 'Clientes Habituales' }];

    const cuenta = (envio, dia) => calculateDailyAccount({
        allShipments: [envio], driverId, clients, collectedCollections: [], targetDate: dia
    });

    it('Porte Pagado dado de alta ayer y cobrado hoy: no sale ayer', () => {
        const envio = { id: 'HAB-304', porteType: 'Pagado', portePaid: true, amount: '7.00', client: 'ECUGENIL',
            assignedDriverId: driverId, date: ayer.toISOString(), portePaidAt: hoy.toISOString() };
        expect(cuenta(envio, ayer).collectedPorte).toBe(0);
        expect(cuenta(envio, hoy).collectedPorte).toBe(7);
    });

    it('Porte Debido entregado ayer y cobrado hoy: no sale ayer', () => {
        const envio = { id: 'HAB-305', porteType: 'Debido', status: 'Entregado', portePaid: true, amount: '9.00',
            client: 'Remitente', destinationName: 'ECUGENIL', assignedDriverId: driverId,
            deliveredAt: ayer.toISOString(), portePaidAt: hoy.toISOString() };
        expect(cuenta(envio, ayer).collectedPorte).toBe(0);
        expect(cuenta(envio, hoy).collectedPorte).toBe(9);
    });

    it('factura simplificada de un albarán de ayer cobrada hoy: no sale ayer', () => {
        const envio = { id: 'HAB-306', porteType: 'Pagado', hasSimplifiedInvoice: true, simplifiedInvoicePaid: true,
            simplifiedInvoiceAmount: '12.10', client: 'ECUGENIL', assignedDriverId: driverId,
            date: ayer.toISOString(), portePaidAt: hoy.toISOString() };
        expect(cuenta(envio, ayer).collectedSimplifiedInvoices).toBe(0);
        expect(cuenta(envio, hoy).collectedSimplifiedInvoices).toBe(12.1);
    });

    it('albarán antiguo sin fecha de cobro: sigue saliendo el día del albarán', () => {
        const envio = { id: 'HAB-1', porteType: 'Pagado', portePaid: true, amount: '7.00', client: 'ECUGENIL',
            assignedDriverId: driverId, date: ayer.toISOString() };
        expect(cuenta(envio, ayer).collectedPorte).toBe(7);
        expect(cuenta(envio, hoy).collectedPorte).toBe(0);
    });
});
