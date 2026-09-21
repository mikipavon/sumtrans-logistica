import { describe, it, expect } from 'vitest';
import { baremoDelPunto, precioUnitarioParaCliente } from './importacionEnvios';

describe('baremoDelPunto de las importaciones', () => {
    it('Antequera es Baremo 2 aunque en Ajustes quede una fila suya sin baremo o en B1 (18/9/2026)', () => {
        const sinBaremo = [{ name: 'Antequera', zip: '29200' }, { name: 'Antequera', zip: '29200', baremo: 2 }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: sinBaremo })).toBe(2);
        expect(baremoDelPunto('ANTEQUERA', '', { coverageZones: [{ name: 'Antequera', zip: '' }] })).toBe(2);
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: [] })).toBe(2);
    });

    it('un pueblo de Córdoba sigue en Baremo 1 y sin datos también', () => {
        expect(baremoDelPunto('', '14900', { coverageZones: [] })).toBe(1);
        expect(baremoDelPunto('', '', {})).toBe(1);
    });
});

describe('precioUnitarioParaCliente de las importaciones', () => {
    const FRIGO = { id: 'frigo', name: 'FRIGORÍFICO', price: '19', priceB2: '21' };
    it('ACTIVA (21/9/2026): la tarifa especial de B1 no vale en Baremo 2; ahí va el B2 del catálogo', () => {
        const activa = { customRates: { frigo: '15' } };
        expect(precioUnitarioParaCliente(FRIGO, activa, 1)).toBe(15);
        expect(precioUnitarioParaCliente(FRIGO, activa, 2)).toBe(21);
        expect(precioUnitarioParaCliente(FRIGO, { customRates: { frigo: '15' }, customRatesB2: { frigo: '17' } }, 2)).toBe(17);
        expect(precioUnitarioParaCliente(FRIGO, null, 2)).toBe(21);
    });
});
