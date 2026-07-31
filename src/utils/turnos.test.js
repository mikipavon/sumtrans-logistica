import { describe, it, expect } from 'vitest';
import { turnoQueSeRepartaAhora, turnoQueSeAsignaAhora, turnoContrario } from './turnos';

const aLas = (h, m = 0) => new Date(2026, 6, 30, h, m, 0);

describe('turnoQueSeRepartaAhora', () => {
    it('a la una el conductor sigue haciendo la ronda de la mañana', () => {
        expect(turnoQueSeRepartaAhora(aLas(13, 0))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(13, 59))).toBe('manana');
    });

    it('a partir de las 14:00 ya reparte la de la tarde', () => {
        expect(turnoQueSeRepartaAhora(aLas(14, 0))).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(19, 30))).toBe('tarde');
    });

    it('de madrugada y a primera hora, mañana', () => {
        expect(turnoQueSeRepartaAhora(aLas(6, 15))).toBe('manana');
    });
});

describe('turnoQueSeAsignaAhora', () => {
    // Va por delante del reloj: a la una se está pasando el reparto de la tarde.
    it('por la mañana y hasta las 16:30 se asigna para la tarde', () => {
        expect(turnoQueSeAsignaAhora(aLas(7, 0))).toBe('tarde');
        expect(turnoQueSeAsignaAhora(aLas(14, 0))).toBe('tarde');
        expect(turnoQueSeAsignaAhora(aLas(16, 30))).toBe('tarde');
    });

    it('a partir de las 16:30 se asigna para la mañana siguiente', () => {
        expect(turnoQueSeAsignaAhora(aLas(16, 31))).toBe('manana');
        expect(turnoQueSeAsignaAhora(aLas(19, 0))).toBe('manana');
    });

    it('no coincide con el turno que se reparte: son preguntas distintas', () => {
        const alaUna = aLas(13, 0);
        expect(turnoQueSeRepartaAhora(alaUna)).toBe('manana');
        expect(turnoQueSeAsignaAhora(alaUna)).toBe('tarde');
    });
});

describe('turnoContrario', () => {
    it('da la vuelta al turno', () => {
        expect(turnoContrario('manana')).toBe('tarde');
        expect(turnoContrario('tarde')).toBe('manana');
    });
});
