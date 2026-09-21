import { describe, it, expect } from 'vitest';
import { entraEnElCierre, nombreDelPeriodo, mesDelCierre } from './mesesDelCierre';

describe('mesesDelCierre', () => {
    it('con arrastre entran el mes elegido y los anteriores, nunca los posteriores', () => {
        expect(entraEnElCierre('2026-08', '2026-09', true)).toBe(true);
        expect(entraEnElCierre('2026-09', '2026-09', true)).toBe(true);
        expect(entraEnElCierre('2026-10', '2026-09', true)).toBe(false);
        expect(entraEnElCierre('2025-12', '2026-01', true)).toBe(true);
    });

    it('sin arrastre, sólo el mes elegido', () => {
        expect(entraEnElCierre('2026-08', '2026-09', false)).toBe(false);
        expect(entraEnElCierre('2026-09', '2026-09', false)).toBe(true);
        expect(entraEnElCierre('', '2026-09', true)).toBe(false);
    });

    it('nombra el periodo en español', () => {
        expect(nombreDelPeriodo(['2026-09'])).toBe('Septiembre de 2026');
        expect(nombreDelPeriodo(['2026-09', '2026-08', '2026-09'])).toBe('Agosto y septiembre de 2026');
        expect(nombreDelPeriodo(['2026-07', '2026-08', '2026-09'])).toBe('Julio, agosto y septiembre de 2026');
        expect(nombreDelPeriodo(['2027-01', '2026-12'])).toBe('Diciembre de 2026 y enero de 2027');
        expect(nombreDelPeriodo([])).toBe('');
    });

    it('un cierre es del mes de su albarán más reciente', () => {
        expect(mesDelCierre(['2026-08', '2026-09', '2026-08'])).toBe('2026-09');
        expect(mesDelCierre([])).toBe('');
    });
});
