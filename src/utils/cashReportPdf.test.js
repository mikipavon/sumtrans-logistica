import { describe, it, expect } from 'vitest';
import { filasDelCierre, crearDocumentoDeCierre } from './cashReportPdf';
import { calculateDailyAccount } from './accountLogic';

// El cierre de caja se monta con lo que devuelve calculateDailyAccount, no con
// una copia a mano: si el cálculo cambia de nombre a sus listas, esto avisa.
const dia = '2026-09-10';
const envios = [
    {
        id: 'HAB-266', assignedDriverId: 7, status: 'Entregado', client: 'Raúl martin',
        destinationName: 'Raúl martin', originName: 'Ferretería Sur', porteType: 'Debido',
        amount: '12.00', portePaid: true, portePaidAt: `${dia}T11:00:00Z`,
        codAmount: '20.00', codPaid: true, codPaidAt: `${dia}T11:00:00Z`,
        deliveredAt: `${dia}T11:00:00Z`, date: '10/9/2026'
    },
    {
        id: 'SUM-442', assignedDriverId: 7, status: 'Entregado', client: 'Chumilla',
        destinationName: 'Chumilla', originName: 'Almacén Norte', porteType: 'Pagado',
        amount: '9.00', portePaid: false,
        codAmount: '143.97', codPaid: true, codPaidAt: `${dia}T16:00:00Z`,
        deliveredAt: `${dia}T16:00:00Z`, date: '10/9/2026'
    },
];
const clientes = [
    { name: 'Raúl martin', billingType: 'Clientes Habituales' },
    { name: 'Chumilla', billingType: 'Clientes Habituales' },
];

describe('filasDelCierre', () => {
    it('saca una fila por porte y por reembolso del día, con su importe', () => {
        const cuenta = calculateDailyAccount({
            allShipments: envios, driverId: 7, clients: clientes,
            collectedCollections: [], targetDate: new Date(2026, 8, 10)
        });
        const filas = filasDelCierre(cuenta);
        const reembolsos = filas.filter(f => f[1] === 'Reembolso');
        expect(reembolsos.map(f => f[0]).sort()).toEqual(['HAB-266', 'SUM-442']);
        expect(reembolsos.find(f => f[0] === 'SUM-442')[3]).toBe('€143.97');
        expect(filas.some(f => f[0] === 'HAB-266' && f[1].startsWith('Porte') && f[3] === '€12.00')).toBe(true);
    });

    it('no se inventa filas cuando el resultado viene vacío', () => {
        expect(filasDelCierre({})).toEqual([]);
        expect(filasDelCierre(undefined)).toEqual([]);
    });
});

describe('crearDocumentoDeCierre', () => {
    it('monta el PDF con la tabla del desglose y la fecha pedida', () => {
        const cuenta = calculateDailyAccount({
            allShipments: envios, driverId: 7, clients: clientes,
            collectedCollections: [], targetDate: new Date(2026, 8, 10)
        });
        const { doc, dateStr } = crearDocumentoDeCierre({ name: 'Juan Carlos' }, new Date(2026, 8, 10), cuenta);
        expect(dateStr).toBe('10/09/2026');
        // Con filas, autoTable deja constancia de la tabla; sin ellas no hay tabla.
        expect(doc.lastAutoTable).toBeTruthy();
        expect(doc.lastAutoTable.finalY).toBeGreaterThan(40);
        expect(doc.internal.getNumberOfPages()).toBe(1);
    });

    it('sin cobros sale un documento de una hoja, sin tabla', () => {
        const { doc } = crearDocumentoDeCierre({ name: 'Juan Carlos' }, new Date(2026, 8, 10), { dailyTotal: 0 });
        expect(doc.lastAutoTable).toBeFalsy();
        expect(doc.internal.getNumberOfPages()).toBe(1);
    });
});
