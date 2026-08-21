import { describe, it, expect } from 'vitest';
import { calcularComisionReembolso, textoComisionReembolso, COMISION_PORCENTAJE } from './comisionReembolso';

describe('calcularComisionReembolso', () => {
    it('sin reembolso no cobra nada, aunque el cliente tenga tarifa', () => {
        expect(calcularComisionReembolso({ codFee: '4' }, 0)).toBe(0);
        expect(calcularComisionReembolso({ codFee: '4' }, '')).toBe(0);
        expect(calcularComisionReembolso({ codFeeMode: COMISION_PORCENTAJE, codFeePercent: '3', codFeeMin: '5' }, 0)).toBe(0);
    });

    it('el cliente sin tarifa propia usa el ajuste general', () => {
        expect(calcularComisionReembolso({}, 120, '3.50')).toBe(3.5);
        expect(calcularComisionReembolso(null, 120, 3)).toBe(3);
        expect(calcularComisionReembolso({ codFee: '' }, 120, 3)).toBe(3);
    });

    it('importe fijo: cobra lo mismo dé lo que dé el reembolso', () => {
        const cliente = { codFee: '4.25' };
        expect(calcularComisionReembolso(cliente, 50)).toBe(4.25);
        expect(calcularComisionReembolso(cliente, 5000)).toBe(4.25);
    });

    it('un 0 escrito a mano es gratis, no "sin configurar"', () => {
        expect(calcularComisionReembolso({ codFee: '0' }, 300, 3)).toBe(0);
        expect(calcularComisionReembolso({ codFee: 0 }, 300, 3)).toBe(0);
    });

    it('porcentaje: cobra la parte del reembolso', () => {
        const cliente = { codFeeMode: COMISION_PORCENTAJE, codFeePercent: '3', codFeeMin: '' };
        expect(calcularComisionReembolso(cliente, 200)).toBe(6);
        expect(calcularComisionReembolso(cliente, 1250)).toBe(37.5);
    });

    it('el mínimo manda cuando el reembolso es pequeño', () => {
        const cliente = { codFeeMode: COMISION_PORCENTAJE, codFeePercent: '3', codFeeMin: '2.50' };
        expect(calcularComisionReembolso(cliente, 50)).toBe(2.5);   // 1,50 se queda corto
        expect(calcularComisionReembolso(cliente, 100)).toBe(3);    // justo en el punto de cruce
        expect(calcularComisionReembolso(cliente, 400)).toBe(12);   // ya manda el porcentaje
    });

    it('redondea a céntimos, que es lo que se factura', () => {
        const cliente = { codFeeMode: COMISION_PORCENTAJE, codFeePercent: '2.75', codFeeMin: '0' };
        expect(calcularComisionReembolso(cliente, 133.33)).toBe(3.67);
    });

    it('un cliente a porcentaje ignora el importe fijo que tuviera antes', () => {
        const cliente = { codFee: '9', codFeeMode: COMISION_PORCENTAJE, codFeePercent: '1', codFeeMin: '0' };
        expect(calcularComisionReembolso(cliente, 300)).toBe(3);
    });

    it('porcentaje a medio configurar no inventa cobros', () => {
        expect(calcularComisionReembolso({ codFeeMode: COMISION_PORCENTAJE }, 500, 3)).toBe(0);
    });
});

describe('textoComisionReembolso', () => {
    it('resume cómo cobra cada cliente', () => {
        expect(textoComisionReembolso({ codFee: '4' })).toBe('4,00 € por envío');
        expect(textoComisionReembolso({}, '3.50')).toBe('3,50 € por envío');
        expect(textoComisionReembolso({ codFeeMode: COMISION_PORCENTAJE, codFeePercent: '3', codFeeMin: '2.5' }))
            .toBe('3 % del reembolso, mínimo 2,50 €');
        expect(textoComisionReembolso({ codFeeMode: COMISION_PORCENTAJE, codFeePercent: '3' }))
            .toBe('3 % del reembolso');
    });
});
