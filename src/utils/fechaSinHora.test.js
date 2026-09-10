import { describe, it, expect } from 'vitest';
import { fechaSinHora } from './fechaSinHora';

describe('fechaSinHora', () => {
    it('una fecha española se enseña tal cual, sin tocarle el día', () => {
        // La trampa: new Date('7/9/2026') devuelve el 9 de julio.
        expect(fechaSinHora('7/9/2026')).toBe('7/9/2026');
        expect(fechaSinHora('12/3/2026')).toBe('12/3/2026');
        expect(fechaSinHora('7 sept 2026')).toBe('7 sept 2026');
    });

    it('le quita la hora a lo que la traiga pegada detrás', () => {
        expect(fechaSinHora('7/9/2026, 18:38:19')).toBe('7/9/2026');
    });

    it('un ISO a secas se pasa a formato español sin correr el día', () => {
        expect(fechaSinHora('2026-09-07')).toBe('7/9/2026');
        expect(fechaSinHora('2026-01-01')).toBe('1/1/2026');
    });

    it('una marca de tiempo ISO se queda sólo con el día', () => {
        expect(fechaSinHora('2026-09-07T16:38:19.000Z')).toBe('7/9/2026');
    });

    it('sin fecha no se inventa ninguna', () => {
        expect(fechaSinHora('')).toBe('');
        expect(fechaSinHora(null)).toBe('');
        expect(fechaSinHora(undefined)).toBe('');
    });
});
