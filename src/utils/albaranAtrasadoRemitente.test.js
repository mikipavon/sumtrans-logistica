import { describe, it, expect } from 'vitest';
import { construirAlbaranAtrasado } from './reciboDeDeuda';

const cliente = { name: 'BAENA SOLAR', billingType: 'Presupuesto' };
const base = { cliente, importe: 7, concepto: 'Albarán en papel', fecha: '2026-08-26' };

describe('construirAlbaranAtrasado: remitente y destinatario del papel', () => {
    it('sin escribirlos, los dos son el cliente (como antes)', () => {
        const a = construirAlbaranAtrasado(base);
        expect(a.originName).toBe('BAENA SOLAR');
        expect(a.destinationName).toBe('BAENA SOLAR');
    });

    it('guarda los que se escriben y el que paga sigue siendo el cliente', () => {
        const a = construirAlbaranAtrasado({ ...base, remitente: 'BAENA SOLAR', destinatario: '  Talleres Pérez, Lucena ' });
        expect(a.originName).toBe('BAENA SOLAR');
        expect(a.destinationName).toBe('Talleres Pérez, Lucena');
        expect(a.client).toBe('BAENA SOLAR');
    });

    it('un campo con sólo espacios cuenta como vacío', () => {
        const a = construirAlbaranAtrasado({ ...base, remitente: '   ' });
        expect(a.originName).toBe('BAENA SOLAR');
    });
});
