// ── La lista de cobros del día se junta, no se pisa ──
//
// Un porte cobrado desde el ordenador de la oficina (entrando como el
// repartidor) salía en la Cuenta del ordenador y no en la del móvil, y el
// siguiente cobro del móvil lo borraba de la nube (01/10/2026).

import { describe, it, expect } from 'vitest';
import { unirCobros, leFaltanCobros } from './cobrosDelDia';
import { calculateDailyAccount } from './accountLogic';

const delMovil = { id: 'COL-1-HAB-834-porte-w85z', shipmentId: 'HAB-834', type: 'Porte', amount: '7.00', date: '2026-10-01' };
const delOrdenador = { id: 'COL-2-SUM-3217-porte', shipmentId: 'SUM-3217', type: 'Porte', amount: '7.00', date: '2026-10-01' };

describe('unirCobros', () => {
    it('añade los cobros que apuntó otro aparato, detrás de los propios', () => {
        expect(unirCobros([delMovil], [delOrdenador])).toEqual([delMovil, delOrdenador]);
    });

    it('no repite un cobro que está en las dos listas', () => {
        expect(unirCobros([delMovil, delOrdenador], [delOrdenador, delMovil])).toHaveLength(2);
        expect(unirCobros([delMovil], [delOrdenador, { ...delOrdenador }])).toHaveLength(2);
    });

    it('si no hay nada nuevo devuelve la misma lista, no una copia', () => {
        const propios = [delMovil, delOrdenador];
        expect(unirCobros(propios, [delOrdenador])).toBe(propios);
        expect(unirCobros(propios, [])).toBe(propios);
        expect(unirCobros(propios, undefined)).toBe(propios);
    });

    it('aguanta que la nube aún no tenga lista de hoy o traiga entradas sin id', () => {
        expect(unirCobros(undefined, [delOrdenador])).toEqual([delOrdenador]);
        expect(unirCobros(null, null)).toEqual([]);
        expect(unirCobros([delMovil], [null, { amount: '3' }, delOrdenador])).toEqual([delMovil, delOrdenador]);
    });
});

describe('leFaltanCobros', () => {
    it('dice si a una lista le falta algún cobro de la otra', () => {
        expect(leFaltanCobros([delMovil], [delMovil, delOrdenador])).toBe(true);
        expect(leFaltanCobros([delMovil, delOrdenador], [delOrdenador])).toBe(false);
        expect(leFaltanCobros(undefined, [delOrdenador])).toBe(true);
        expect(leFaltanCobros(undefined, [])).toBe(false);
        expect(leFaltanCobros(undefined, undefined)).toBe(false);
    });
});

describe('el móvil y el ordenador ven la misma Cuenta', () => {
    // El porte lo paga un cliente de Facturación que hoy paga en mano: no sale
    // del albarán, sólo de la entrada que se apuntó al cobrarlo.
    const envios = [
        { id: 'HAB-834', client: 'Rafael Perez', porteType: 'Pagado', portePaid: true, amount: 7, status: 'Entregado', billingType: 'Clientes Habituales' },
        { id: 'SUM-3217', client: 'Recambios', destinationName: 'Talleres Luque', porteType: 'Debido', portePaid: true, amount: 7, status: 'Entregado', destinationBillingType: 'Facturación' },
    ];
    const cuenta = (cobros) => calculateDailyAccount({
        allShipments: envios, driverId: 5, clients: [], collectedCollections: cobros, targetDate: new Date(2026, 9, 1)
    });

    it('con sólo su lista al móvil le falta el porte que se cobró desde el ordenador', () => {
        expect(cuenta([delMovil]).collectedPorte).toBe(7);
    });

    it('al juntarla con la de la nube le sale, igual que en el ordenador', () => {
        const enElMovil = unirCobros([delMovil], [delMovil, delOrdenador]);
        const enElOrdenador = unirCobros([delMovil, delOrdenador], [delMovil, delOrdenador]);
        expect(cuenta(enElMovil).collectedPorte).toBe(14);
        expect(cuenta(enElMovil).allPorteDetail.map(l => l.id).sort())
            .toEqual(cuenta(enElOrdenador).allPorteDetail.map(l => l.id).sort());
    });
});
