import { calculateDailyAccount } from '../src/utils/accountLogic.js';
import Shipment from '../src/models/Shipment.js';

const MOCK_DRIVER_ID = "5";

const MOCK_CLIENTS = [
    { name: 'Cliente Habitual', billingType: 'Habitual (Contado)' },
    { name: 'Empresa Grande', billingType: 'Facturación' }
];

// Set date perfectly so isToday finds it
const todayStr = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

let s = new Shipment({
    id: "123",
    date: todayStr,
    client: 'Cliente Habitual',
    destinationName: 'Empresa Grande', 
    porteType: 'Debido',
    amount: '10.00',
    hasCod: false,
    codAmount: 0,
    status: 'Pendiente de asignar', // Must NOT be 'Entregado' directly unless we set pickedUpById
    portePaid: false,
    paymentStatus: 'Pending',
    assignedDriverId: MOCK_DRIVER_ID,
    pickedUpById: MOCK_DRIVER_ID,
    porteCollectedById: null
});

console.log("=== ESTADO 1: Creado como DEBIDO (Destino Facturación, Paga el Destino) ===");
let result1 = calculateDailyAccount({ allShipments: [s], driverId: MOCK_DRIVER_ID, clients: MOCK_CLIENTS });
console.log("Deuda del Conductor al final del día por este envío:", result1.collectedPorte, "€");

// EL ADMINISTRADOR ENTRA EN EL MODAL Y LO CAMBIA A PAGADO.
s.porteType = 'Pagado';
// Como el porteType ahora es Pagado, la lógica dice: "Paga Habitual en Efectivo".
console.log("\\n=== ESTADO 2: El admin cambia porteType a PAGADO ===");
let result2 = calculateDailyAccount({ allShipments: [s], driverId: MOCK_DRIVER_ID, clients: MOCK_CLIENTS });
console.log("Deuda del Conductor al final del día (¡Peligro, se le reclama el saldo!):", result2.collectedPorte, "€");

// ESTADO 3: EL ADMINISTRADOR LO PASA A PENDIENTE (DEUDA EN OFICINA)
// El modal nuevo intercepta esto y asegura que portePaid=false y paymentStatus='Pending'
s.paymentStatus = 'Pending';
s.portePaid = false; 

console.log("\\n=== ESTADO 3: El admin usa el nuevo control para enviarlo a PENDIENTE (Deuda) ===");
let result3 = calculateDailyAccount({ allShipments: [s], driverId: MOCK_DRIVER_ID, clients: MOCK_CLIENTS });
console.log("Deuda del Conductor al final del día (Caja cuadrada):", result3.collectedPorte, "€");

let debts = [s].filter(ship => ship.paymentStatus === 'Pending' && !ship.portePaid);
console.log("\\n¿Aparecerá este envío en la caja general de 'Pendientes de Cobro'? ->", debts.length === 1 ? 'Sí' : 'No');
