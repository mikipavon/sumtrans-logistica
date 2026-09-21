import { describe, it, expect } from 'vitest';
import { cobraPorKilos, precioPorKilos, tramoDePeso } from './precioPorKilos';

// Tramos como los de XPO: SUM-70 y SUM-71 (860 kg) iban al tramo ≤900kg a 58,51 €.
const XPO = {
    tariffType: 'Por Kilos',
    weightTariff: [
        { maxKg: 900, price: '58.51' },
        { maxKg: 30, price: '9.50' },
        { maxKg: 100, price: '18' },
    ],
};

describe('precioPorKilos con tabla de tramos', () => {
    it('cobra el primer tramo que cubre el peso, aunque la tabla venga desordenada', () => {
        expect(precioPorKilos(860, XPO)).toBe(58.51);
        expect(precioPorKilos(47, XPO)).toBe(18);
        expect(precioPorKilos(30, XPO)).toBe(9.5);
        expect(precioPorKilos('5', XPO)).toBe(9.5);
    });

    it('más peso que el último tramo cobra el último', () => {
        expect(precioPorKilos(1200, XPO)).toBe(58.51);
    });

    it('sin kilos, o sin tabla, el porte por peso es 0', () => {
        expect(precioPorKilos(null, XPO)).toBe(0);
        expect(precioPorKilos(0, XPO)).toBe(0);
        expect(precioPorKilos(50, { tariffType: 'Por Kilos' })).toBe(0);
    });
});

describe('precioPorKilos con fórmula', () => {
    const TXT = { tariffType: 'Por Kilos', weightCalculationMode: 'formula', weightFormula: { baseKg: '10', basePrice: '6', extraKgPrice: '0.25' } };

    it('hasta la base cobra el precio base y a partir de ahí suma cada kilo de más', () => {
        expect(precioPorKilos(8, TXT)).toBe(6);
        expect(precioPorKilos(47, TXT)).toBeCloseTo(6 + 37 * 0.25);
    });
});

describe('tramoDePeso', () => {
    it('pone la etiqueta del tramo como el alta', () => {
        expect(tramoDePeso(860, XPO)).toBe('Tramo ≤900kg');
        expect(tramoDePeso(1200, XPO)).toBe('Tramo >900kg (máximo)');
        expect(tramoDePeso(null, XPO)).toBe('');
    });
});

describe('cobraPorKilos', () => {
    it('sólo con el Tipo de tarifa "Por Kilos" en la ficha', () => {
        expect(cobraPorKilos(XPO)).toBe(true);
        expect(cobraPorKilos({ tariffType: 'Estándar' })).toBe(false);
        expect(cobraPorKilos(null)).toBe(false);
    });
});
