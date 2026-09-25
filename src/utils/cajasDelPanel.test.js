import { describe, it, expect } from 'vitest';
import { cajasPorDia } from './cajasDelPanel';
import { calculateDailyAccount } from './accountLogic';

const clientes = [
    { name: 'TALLERES PEPE', billingType: 'Clientes Habituales' },
    { name: 'GRAN EMPRESA', billingType: 'Facturación' }
];

const envios = [
    // Porte pagado cobrado por Juan (1) el día 22
    { id: 'HAB-1', client: 'TALLERES PEPE', porteType: 'Pagado', portePaid: true, amount: '€10.00', createdById: 1, date: '2026-09-20', portePaidAt: '2026-09-22T09:00:00' },
    // Reembolso cobrado por Ana (2) al entregar el 23, porte de facturación: no va a caja
    { id: 'SUM-2', client: 'GRAN EMPRESA', porteType: 'Pagado', portePaid: true, amount: '€30.00', createdById: 2, date: '2026-09-23', portePaidAt: '2026-09-23T08:00:00',
      codAmount: '100', codPaid: true, codPaidAt: '2026-09-23T12:00:00', status: 'Entregado', assignedDriverId: 2 },
    // Sin cobrar: no cuenta
    { id: 'HAB-3', client: 'TALLERES PEPE', porteType: 'Pagado', portePaid: false, amount: '€50.00', createdById: 1, date: '2026-09-22' },
    // Porte debido que Juan cobró el 24 desde Cobros; el albarán dice 8 € aunque se apuntó a 12
    { id: 'HAB-4', client: 'GRAN EMPRESA', destinationName: 'TALLERES PEPE', porteType: 'Debido', portePaid: true, amount: '€8.00', status: 'Entregado', assignedDriverId: 1,
      date: '2026-08-01', deliveredAt: '2026-08-01T10:00:00', portePaidAt: '2026-09-24T10:00:00' }
];

const repartidores = [
    { id: 1, 'collectedCollections_2026-09-24': [{ id: 'c1', shipmentId: 'HAB-4', type: 'Porte', amount: '12', date: '2026-09-24' }] },
    { id: 2 }
];

const calcular = () => cajasPorDia({
    envios, repartidores, clientes,
    desde: new Date(2026, 8, 21), hasta: new Date(2026, 8, 24)
});

describe('cajasPorDia', () => {
    it('suma las cajas de todos los repartidores, cada cobro en su día', () => {
        const cajas = calcular();
        expect([...cajas.keys()]).toEqual(['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']);
        expect(cajas.get('2026-09-21').total).toBe(0);
        expect(cajas.get('2026-09-22')).toEqual({ porte: 10, reembolsos: 0, facturas: 0, total: 10 });
        expect(cajas.get('2026-09-23')).toEqual({ porte: 0, reembolsos: 100, facturas: 0, total: 100 });
        // Manda el precio del albarán, no el que se apuntó en el cobro
        expect(cajas.get('2026-09-24')).toEqual({ porte: 8, reembolsos: 0, facturas: 0, total: 8 });
    });

    it('da lo mismo que la Cuenta de cada repartidor con todos los envíos', () => {
        const cajas = calcular();
        for (const dia of cajas.keys()) {
            const [y, m, d] = dia.split('-');
            const esperado = repartidores.reduce((suma, r) => suma + calculateDailyAccount({
                allShipments: envios, driverId: r.id, clients: clientes,
                collectedCollections: r[`collectedCollections_${dia}`] || [],
                targetDate: new Date(y, m - 1, d)
            }).dailyTotal, 0);
            expect(cajas.get(dia).total).toBeCloseTo(esperado, 2);
        }
    });

    it('un cobro deshecho por la oficina no suma aunque siga en la lista del día', () => {
        const deshecho = envios.map(s => s.id === 'HAB-4' ? { ...s, portePaid: false } : s);
        const cajas = cajasPorDia({ envios: deshecho, repartidores, clientes, desde: new Date(2026, 8, 24), hasta: new Date(2026, 8, 24) });
        expect(cajas.get('2026-09-24').total).toBe(0);
    });
});
