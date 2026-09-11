import { describe, it, expect } from 'vitest';
import {
    diasDeVacaciones,
    explicacionDeLosDias,
    esFechaDeAlta,
    DIAS_VACACIONES_AL_ANO,
} from './vacacionesDelAno';

describe('DIAS_VACACIONES_AL_ANO', () => {
    it('son cuatro semanas: 20 días laborables', () => {
        expect(DIAS_VACACIONES_AL_ANO).toBe(20);
    });
});

describe('esFechaDeAlta', () => {
    it('acepta el formato en que se guarda', () => {
        expect(esFechaDeAlta('2026-03-12')).toBe(true);
    });

    it('rechaza lo que no lo es', () => {
        expect(esFechaDeAlta('')).toBe(false);
        expect(esFechaDeAlta(null)).toBe(false);
        expect(esFechaDeAlta('12/03/2026')).toBe(false);
        expect(esFechaDeAlta('2026')).toBe(false);
        expect(esFechaDeAlta('2026-13-40')).toBe(false);
    });
});

describe('diasDeVacaciones', () => {
    it('el que lleva años en la casa tiene las cuatro semanas', () => {
        const r = diasDeVacaciones('2019-06-01', 2026);
        expect(r.dias).toBe(20);
        expect(r.prorrateado).toBe(false);
    });

    it('el que entró el 1 de enero de ese mismo año también', () => {
        expect(diasDeVacaciones('2026-01-01', 2026).dias).toBe(20);
    });

    it('medio año son dos semanas', () => {
        // Del 1 de julio al 31 de diciembre: 184 de 365 días.
        expect(diasDeVacaciones('2026-07-01', 2026).dias).toBe(10);
    });

    it('un trimestre es una semana', () => {
        // Del 1 de octubre al 31 de diciembre: 92 de 365 días -> 5,04
        expect(diasDeVacaciones('2026-10-01', 2026).dias).toBe(5);
    });

    it('entrando a mediados de marzo le tocan 16', () => {
        // Del 12 de marzo al 31 de diciembre: 295 de 365 -> 16,2
        expect(diasDeVacaciones('2026-03-12', 2026).dias).toBe(16);
    });

    it('el que entra a final de diciembre no genera días', () => {
        expect(diasDeVacaciones('2026-12-31', 2026).dias).toBe(0);
    });

    it('en el año anterior a su alta no le tocaba nada', () => {
        expect(diasDeVacaciones('2026-03-12', 2025).dias).toBe(0);
    });

    it('el año bisiesto se cuenta con sus 366 días', () => {
        const r = diasDeVacaciones('2028-01-01', 2028);
        expect(r.diasDelAno).toBe(366);
        expect(r.dias).toBe(20);
    });

    it('sin fecha de alta en la ficha se dan los 20 de siempre', () => {
        expect(diasDeVacaciones(null, 2026)).toEqual({ dias: 20, prorrateado: false, diasDeAlta: null, diasDelAno: null });
        expect(diasDeVacaciones('', 2026).dias).toBe(20);
        expect(diasDeVacaciones('no es una fecha', 2026).dias).toBe(20);
    });

    it('sin año tampoco se recorta nada', () => {
        expect(diasDeVacaciones('2026-07-01', undefined).dias).toBe(20);
    });

    it('el reparto cuadra con una semana por trimestre', () => {
        const trimestres = [
            ['2026-01-01', 20],
            ['2026-04-01', 15],
            ['2026-07-01', 10],
            ['2026-10-01', 5],
        ];
        trimestres.forEach(([alta, esperado]) => {
            expect(diasDeVacaciones(alta, 2026).dias).toBe(esperado);
        });
    });
});

describe('explicacionDeLosDias', () => {
    it('sin prorrateo dice de dónde salen los días', () => {
        expect(explicacionDeLosDias('2019-06-01', 2026)).toBe('4 semanas al año');
        expect(explicacionDeLosDias(null, 2026)).toBe('4 semanas al año');
    });

    it('con prorrateo dice desde cuándo', () => {
        expect(explicacionDeLosDias('2026-03-12', 2026)).toBe('parte proporcional desde el 12/03/2026');
    });
});
