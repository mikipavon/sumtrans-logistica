import { describe, it, expect } from 'vitest';
import {
    turnoQueSeRepartaAhora,
    turnoQueSeAsignaAhora,
    turnoContrario,
    normalizarHorarioReparto,
    HORARIO_REPARTO_POR_DEFECTO,
    minutosDeHora,
    horaDeMinutos,
} from './turnos';

const aLas = (h, m = 0) => new Date(2026, 6, 30, h, m, 0);

describe('turnoQueSeRepartaAhora (horario de fábrica: mañana 18:00-10:00, tarde 10:01-17:59)', () => {
    it('a primera hora y hasta las 10:00 manda el orden de la mañana', () => {
        expect(turnoQueSeRepartaAhora(aLas(6, 15))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(9, 59))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(10, 0))).toBe('manana');
    });

    it('desde las 10:01 y hasta las 17:59 manda el orden de la tarde', () => {
        expect(turnoQueSeRepartaAhora(aLas(10, 1))).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(13, 0))).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(17, 59))).toBe('tarde');
    });

    it('desde las 18:00 ya se prepara la mañana siguiente', () => {
        expect(turnoQueSeRepartaAhora(aLas(18, 0))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(19, 30))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(23, 59))).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(0, 0))).toBe('manana');
    });

    it('obedece al horario que ponga la oficina', () => {
        const horario = { mananaDesde: '20:00', tardeDesde: '14:00' };
        expect(turnoQueSeRepartaAhora(aLas(13, 59), horario)).toBe('manana');
        expect(turnoQueSeRepartaAhora(aLas(14, 0), horario)).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(19, 59), horario)).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(20, 0), horario)).toBe('manana');
    });

    it('acepta el horario tal y como llega de la nube (texto JSON)', () => {
        const guardado = JSON.stringify({ mananaDesde: '20:00', tardeDesde: '14:00' });
        expect(turnoQueSeRepartaAhora(aLas(15, 0), guardado)).toBe('tarde');
    });

    it('con un horario roto vuelve a lo de fábrica en vez de dejar al móvil sin turno', () => {
        expect(turnoQueSeRepartaAhora(aLas(13, 0), { mananaDesde: 'x', tardeDesde: null })).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(13, 0), 'esto no es json')).toBe('tarde');
        expect(turnoQueSeRepartaAhora(aLas(13, 0), null)).toBe('tarde');
    });
});

describe('normalizarHorarioReparto', () => {
    it('sin nada devuelve lo de fábrica', () => {
        expect(normalizarHorarioReparto(undefined)).toEqual(HORARIO_REPARTO_POR_DEFECTO);
        expect(normalizarHorarioReparto('')).toEqual(HORARIO_REPARTO_POR_DEFECTO);
    });

    it('arregla campo a campo: un campo malo no tira el otro', () => {
        expect(normalizarHorarioReparto({ mananaDesde: '21:30', tardeDesde: 'nada' }))
            .toEqual({ mananaDesde: '21:30', tardeDesde: '10:01' });
    });

    it('dos horas iguales no son una ventana: fábrica', () => {
        expect(normalizarHorarioReparto({ mananaDesde: '12:00', tardeDesde: '12:00' }))
            .toEqual(HORARIO_REPARTO_POR_DEFECTO);
    });

    it('deja las horas con dos cifras', () => {
        expect(normalizarHorarioReparto({ mananaDesde: '8:05', tardeDesde: '9:00' }))
            .toEqual({ mananaDesde: '08:05', tardeDesde: '09:00' });
    });
});

describe('minutosDeHora / horaDeMinutos', () => {
    it('van y vuelven', () => {
        expect(minutosDeHora('18:00')).toBe(1080);
        expect(horaDeMinutos(1080)).toBe('18:00');
        expect(minutosDeHora('25:00')).toBeNull();
        expect(minutosDeHora('10:60')).toBeNull();
        expect(minutosDeHora('')).toBeNull();
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
        const alasNueve = aLas(9, 0);
        expect(turnoQueSeRepartaAhora(alasNueve)).toBe('manana');
        expect(turnoQueSeAsignaAhora(alasNueve)).toBe('tarde');
    });
});

describe('turnoContrario', () => {
    it('da la vuelta al turno', () => {
        expect(turnoContrario('manana')).toBe('tarde');
        expect(turnoContrario('tarde')).toBe('manana');
    });
});
