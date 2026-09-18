import { describe, it, expect } from 'vitest';
import { baremoDelPunto } from './importacionEnvios';

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
