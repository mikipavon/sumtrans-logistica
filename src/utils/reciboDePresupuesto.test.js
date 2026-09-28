import { describe, it, expect } from 'vitest';
import { esReciboDePresupuesto, periodoDelReciboDePresupuesto, construirRecibo } from './reciboDeDeuda';

// El recibo de JUAN ALBA tal como lo guarda el cierre de presupuestos.
const delCierre = {
    id: 'RC-123456',
    type: 'Recibo',
    client: 'JUAN ALBA',
    destination: 'Cobro de Presupuesto',
    observations: 'Cobro mensual presupuestos acumulados (Septiembre de 2026). Incluye 3 envíos.',
    amount: '24.00',
};

describe('esReciboDePresupuesto', () => {
    it('reconoce el recibo del cierre de presupuestos', () => {
        expect(esReciboDePresupuesto(delCierre)).toBe(true);
    });

    it('lo reconoce aunque la oficina le haya retocado el destino o las observaciones', () => {
        expect(esReciboDePresupuesto({ ...delCierre, destination: 'JUAN ALBA, en la nave' })).toBe(true);
        expect(esReciboDePresupuesto({ ...delCierre, observations: 'Paga el lunes' })).toBe(true);
    });

    it('el recibo de Añadir deuda no es de presupuesto', () => {
        const deuda = construirRecibo({
            cliente: { id: 9, name: 'Jisanauto' }, importe: 7, concepto: 'Albarán en papel de agosto',
            fecha: '2026-09-28', driverId: 7,
        });
        expect(esReciboDePresupuesto(deuda)).toBe(false);
    });

    it('un albarán normal no lo es, aunque hable de presupuesto', () => {
        expect(esReciboDePresupuesto({ type: 'Entrega', destination: 'Cobro de Presupuesto' })).toBe(false);
        expect(esReciboDePresupuesto(null)).toBe(false);
    });
});

describe('periodoDelReciboDePresupuesto', () => {
    it('saca el mes de las observaciones', () => {
        expect(periodoDelReciboDePresupuesto(delCierre)).toBe('Septiembre de 2026');
    });

    it('saca el periodo de un cierre que arrastra meses', () => {
        expect(periodoDelReciboDePresupuesto({
            observations: 'Cobro mensual presupuestos acumulados (Agosto y septiembre de 2026). Incluye 5 envíos.',
        })).toBe('Agosto y septiembre de 2026');
    });

    it('vacío si las observaciones no lo traen', () => {
        expect(periodoDelReciboDePresupuesto({ observations: 'Paga el lunes (mañana)' })).toBe('');
        expect(periodoDelReciboDePresupuesto({})).toBe('');
    });
});
