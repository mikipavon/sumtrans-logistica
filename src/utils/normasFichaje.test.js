import { describe, it, expect } from 'vitest';
import {
    normalizarNormasFichaje,
    esDiaLaborable,
    distanciaMetros,
    motivoSinJornada,
    puedeFicharAutomaticamente,
    MOTIVOS_BLOQUEO,
    NORMAS_FICHAJE_POR_DEFECTO,
} from './normasFichaje';

const NAVE = { lat: 37.3891, lng: -5.9845 };
const EN_LA_NAVE = { lat: 37.3893, lng: -5.9843 };     // ~30 m
const EN_CASA = { lat: 37.4200, lng: -5.9700 };        // ~3,6 km

describe('normalizarNormasFichaje', () => {
    it('sin nada devuelve lo de fábrica: de lunes a viernes, automático, sin geocerca', () => {
        expect(normalizarNormasFichaje(null)).toEqual({
            diasLaborables: [1, 2, 3, 4, 5],
            fichajeAutomatico: true,
            geocerca: { activa: false, lat: null, lng: null, radioMetros: 500 },
        });
    });

    it('acepta el texto JSON tal y como llega de la nube', () => {
        const n = normalizarNormasFichaje(JSON.stringify({ diasLaborables: [1, 2, 3, 4, 5, 6], fichajeAutomatico: false }));
        expect(n.diasLaborables).toEqual([1, 2, 3, 4, 5, 6]);
        expect(n.fichajeAutomatico).toBe(false);
    });

    it('una lista de días vacía o rota vuelve a lunes-viernes', () => {
        expect(normalizarNormasFichaje({ diasLaborables: [] }).diasLaborables).toEqual([1, 2, 3, 4, 5]);
        expect(normalizarNormasFichaje({ diasLaborables: ['x', 9] }).diasLaborables).toEqual([1, 2, 3, 4, 5]);
        expect(normalizarNormasFichaje({ diasLaborables: ['3', 3, 1] }).diasLaborables).toEqual([1, 3]);
    });

    it('la geocerca no se activa sin coordenadas válidas', () => {
        expect(normalizarNormasFichaje({ geocerca: { activa: true } }).geocerca.activa).toBe(false);
        expect(normalizarNormasFichaje({ geocerca: { activa: true, lat: 999, lng: 0 } }).geocerca.activa).toBe(false);
        const ok = normalizarNormasFichaje({ geocerca: { activa: true, lat: '37.38', lng: '-5.98', radioMetros: '250.4' } }).geocerca;
        expect(ok).toEqual({ activa: true, lat: 37.38, lng: -5.98, radioMetros: 250 });
    });

    it('un radio inválido vuelve a los 500 m', () => {
        expect(normalizarNormasFichaje({ geocerca: { radioMetros: -5 } }).geocerca.radioMetros).toBe(500);
    });
});

describe('esDiaLaborable', () => {
    it('el sábado 5 de septiembre de 2026 no es laborable de fábrica', () => {
        expect(esDiaLaborable('2026-09-05')).toBe(false);
        expect(esDiaLaborable('2026-09-06')).toBe(false);
        expect(esDiaLaborable('2026-09-07')).toBe(true);
    });

    it('si la oficina añade el sábado, cuenta', () => {
        expect(esDiaLaborable('2026-09-05', { diasLaborables: [1, 2, 3, 4, 5, 6] })).toBe(true);
    });
});

describe('distanciaMetros', () => {
    it('mide bien distancias cortas y largas', () => {
        expect(distanciaMetros(NAVE, EN_LA_NAVE)).toBeLessThan(50);
        const casa = distanciaMetros(NAVE, EN_CASA);
        expect(casa).toBeGreaterThan(3000);
        expect(casa).toBeLessThan(4500);
    });
});

describe('motivoSinJornada', () => {
    it('entre semana sin festivo ni ausencia hay jornada', () => {
        expect(motivoSinJornada({ fechaISO: '2026-09-07' })).toBeNull();
    });

    it('sábado: día no laborable', () => {
        expect(motivoSinJornada({ fechaISO: '2026-09-05' })).toBe(MOTIVOS_BLOQUEO.DIA_NO_LABORABLE);
    });

    it('festivo de empresa y ausencia del conductor', () => {
        expect(motivoSinJornada({ fechaISO: '2026-10-12', festivos: [{ date: '2026-10-12', reason: 'Fiesta Nacional' }] })).toBe(MOTIVOS_BLOQUEO.FESTIVO);
        expect(motivoSinJornada({ fechaISO: '2026-09-07', ausencia: { type: 'Vacaciones' } })).toBe(MOTIVOS_BLOQUEO.AUSENCIA);
    });
});

describe('puedeFicharAutomaticamente', () => {
    it('un día normal, con lo de fábrica, ficha sin pedir GPS', () => {
        expect(puedeFicharAutomaticamente({ fechaISO: '2026-09-07', normas: null })).toEqual({ ok: true, motivo: null });
    });

    it('un sábado desde el sofá NO ficha', () => {
        expect(puedeFicharAutomaticamente({ fechaISO: '2026-09-05', normas: NORMAS_FICHAJE_POR_DEFECTO }).motivo).toBe(MOTIVOS_BLOQUEO.DIA_NO_LABORABLE);
    });

    it('con el automático apagado nunca ficha solo', () => {
        expect(puedeFicharAutomaticamente({ fechaISO: '2026-09-07', normas: { fichajeAutomatico: false } }).motivo).toBe(MOTIVOS_BLOQUEO.AUTOMATICO_DESACTIVADO);
    });

    describe('con geocerca de 500 m alrededor de la nave', () => {
        const normas = { geocerca: { activa: true, ...NAVE, radioMetros: 500 } };

        it('en la nave ficha', () => {
            const r = puedeFicharAutomaticamente({ fechaISO: '2026-09-07', normas, posicion: EN_LA_NAVE });
            expect(r.ok).toBe(true);
            expect(r.distanciaMetros).toBeLessThan(50);
        });

        it('desde casa no ficha y dice a cuánto está', () => {
            const r = puedeFicharAutomaticamente({ fechaISO: '2026-09-07', normas, posicion: EN_CASA });
            expect(r.ok).toBe(false);
            expect(r.motivo).toBe(MOTIVOS_BLOQUEO.FUERA_DE_NAVE);
            expect(r.distanciaMetros).toBeGreaterThan(3000);
        });

        it('sin GPS no se ficha solo', () => {
            expect(puedeFicharAutomaticamente({ fechaISO: '2026-09-07', normas, posicion: null }).motivo).toBe(MOTIVOS_BLOQUEO.SIN_GPS);
        });
    });
});
