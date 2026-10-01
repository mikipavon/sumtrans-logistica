// ── El FACT no pierde el hilo ──
//
// SUM-3015 salió en el Excel de Factusol y se quedó sin etiqueta: la página se
// recargó cuando iban 2.227 marcados y lo que faltaba sólo estaba en memoria
// (01/10/2026). La lista se apunta en el navegador y se va tachando.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CLAVE_TRABAJO_FACT, leerTrabajoFact, apuntarTrabajoFact, continuarTrabajoFact, descartarTrabajoFact, facturacionesRecientes, deshacerFacturacion } from './marcarFacturados';

// Una base de datos de mentira con lo justo: leer por lista de ids, leer por
// fecha de facturación (paginado) y guardar una fila. `fallan` son los
// albaranes cuyo guardado no llega.
const baseDeDatos = (filas, { fallan = [] } = {}) => {
    const guardados = [];
    const supabase = {
        from: () => ({
            select: () => ({
                in: async (_col, ids) => ({ data: ids.filter(id => filas[id]).map(id => ({ id, data: filas[id] })), error: null }),
                eq: (_col, momento) => ({
                    order: () => ({
                        range: async (desde, hasta) => ({
                            data: Object.keys(filas).sort().filter(id => filas[id].exportedAt === momento).slice(desde, hasta + 1).map(id => ({ id, data: filas[id] })),
                            error: null,
                        }),
                    }),
                }),
            }),
            update: (cambio) => ({
                eq: (_col, id) => ({
                    select: async () => {
                        if (fallan.includes(id)) return { data: null, error: { message: 'sin conexión' } };
                        filas[id] = cambio.data;
                        guardados.push(id);
                        return { data: [{ id }], error: null };
                    },
                }),
            }),
        }),
    };
    return { supabase, guardados };
};

const albaranes = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`SUM-${3000 + i}`, { client: 'DISFER', amount: 7 }]));
const MOMENTO = '2026-10-01T15:00:00.000Z';

describe('El FACT de lo exportado a Factusol', () => {
    beforeEach(() => localStorage.clear());

    it('apunta la lista antes de marcar nada', () => {
        const trabajo = apuntarTrabajoFact(['SUM-3015', 'SUM-3013', 'SUM-3015'], MOMENTO);

        expect(trabajo.pendientes).toEqual(['SUM-3015', 'SUM-3013']);
        expect(trabajo.total).toBe(2);
        expect(JSON.parse(localStorage.getItem(CLAVE_TRABAJO_FACT)).momento).toBe(MOMENTO);
    });

    it('marca todos sin tocar el resto del albarán, y al acabar no deja nada apuntado', async () => {
        const filas = albaranes(45);
        const { supabase } = baseDeDatos(filas);
        apuntarTrabajoFact(Object.keys(filas), MOMENTO);
        const avances = [];

        const fin = await continuarTrabajoFact(supabase, { alAvanzar: a => avances.push(a.hechos) });

        expect(fin).toEqual({ hechos: 45, total: 45, faltan: [] });
        expect(filas['SUM-3015']).toEqual({ client: 'DISFER', amount: 7, exportedAt: MOMENTO });
        expect(avances).toEqual([0, 20, 40, 45]);
        expect(leerTrabajoFact()).toBeNull();
    });

    it('tras una recarga a medias sigue sólo con los que faltaban', async () => {
        const filas = albaranes(45);
        apuntarTrabajoFact(Object.keys(filas), MOMENTO);

        // La página se recarga al acabar la segunda tanda: las dos están tachadas.
        let avisos = 0;
        const primera = baseDeDatos(filas);
        await expect(continuarTrabajoFact(primera.supabase, {
            alAvanzar: () => { if (++avisos === 3) throw new Error('recarga'); },
        })).rejects.toThrow('recarga');
        expect(leerTrabajoFact().pendientes).toHaveLength(5);

        const segunda = baseDeDatos(filas);
        const avances = [];
        const fin = await continuarTrabajoFact(segunda.supabase, { alAvanzar: a => avances.push(a.hechos) });

        expect(segunda.guardados).toHaveLength(5);
        expect(avances[0]).toBe(40); // la barra arranca donde se quedó
        expect(fin).toEqual({ hechos: 45, total: 45, faltan: [] });
        expect(Object.values(filas).every(f => f.exportedAt === MOMENTO)).toBe(true);
    });

    it('lo que no se puede guardar se queda apuntado para reintentar', async () => {
        const filas = albaranes(3);
        apuntarTrabajoFact(Object.keys(filas), MOMENTO);

        const fin = await continuarTrabajoFact(baseDeDatos(filas, { fallan: ['SUM-3001'] }).supabase);
        expect(fin).toEqual({ hechos: 2, total: 3, faltan: ['SUM-3001'] });
        expect(leerTrabajoFact().pendientes).toEqual(['SUM-3001']);

        const otra = await continuarTrabajoFact(baseDeDatos(filas).supabase);
        expect(otra.faltan).toEqual([]);
        expect(filas['SUM-3001'].exportedAt).toBe(MOMENTO);
    });

    it('un albarán que ya no existe se queda como pendiente, no se da por marcado', async () => {
        const filas = albaranes(2);
        apuntarTrabajoFact([...Object.keys(filas), 'SUM-9999'], MOMENTO);

        const fin = await continuarTrabajoFact(baseDeDatos(filas).supabase);

        expect(fin.faltan).toEqual(['SUM-9999']);
        descartarTrabajoFact();
        expect(leerTrabajoFact()).toBeNull();
    });

    it('avisa a la pantalla de los que acaba de marcar', async () => {
        const filas = albaranes(2);
        apuntarTrabajoFact(Object.keys(filas), MOMENTO);
        const alMarcar = vi.fn();

        await continuarTrabajoFact(baseDeDatos(filas).supabase, { alMarcar });

        expect(alMarcar).toHaveBeenCalledWith(['SUM-3000', 'SUM-3001'], MOMENTO);
    });
});

// El 01/10/2026 salieron tres Excel seguidos: 3.143 albaranes a las 17:00, 376
// repetidos a las 17:52 y uno suelto a las 18:09. Cada grupo se deshace aparte.
describe('Deshacer una facturación reciente', () => {
    const ANTES = '2026-10-01T15:00:00.000Z';
    const DESPUES = '2026-10-01T15:52:00.000Z';
    const SUELTO = '2026-10-01T16:09:00.000Z';
    const AHORA = new Date('2026-10-01T17:00:00.000Z').getTime();

    it('lista las facturaciones de los últimos dos días, la más reciente primero', () => {
        const cargados = [
            { id: 'SUM-3015', exportedAt: DESPUES },
            { id: 'SUM-3013', exportedAt: ANTES },
            { id: 'SUM-3010' },
            { id: 'SUM-3009', exportedAt: DESPUES },
            { id: 'SUM-3154', exportedAt: SUELTO },
            { id: 'SUM-2000', exportedAt: '2026-09-28T10:00:00.000Z' }, // hace tres días: fuera
        ];
        expect(facturacionesRecientes(cargados, { ahora: AHORA })).toEqual([
            { momento: SUELTO, ids: ['SUM-3154'] },
            { momento: DESPUES, ids: ['SUM-3015', 'SUM-3009'] },
            { momento: ANTES, ids: ['SUM-3013'] },
        ]);
        expect(facturacionesRecientes([{ id: 'SUM-1' }])).toEqual([]);
        expect(facturacionesRecientes(undefined)).toEqual([]);
    });

    it('quita el FACT a los de esa fecha leyendo de la base de datos, y deja en paz al resto', async () => {
        const filas = albaranes(30);
        Object.values(filas).forEach((f, i) => { f.exportedAt = i < 25 ? DESPUES : ANTES; });
        const { supabase, guardados } = baseDeDatos(filas);
        const avances = [];
        const alDesmarcar = vi.fn();

        const fin = await deshacerFacturacion(supabase, DESPUES, { alAvanzar: a => avances.push(a.hechos), alDesmarcar });

        expect(fin).toEqual({ hechos: 25, total: 25, faltan: [] });
        expect(guardados).toHaveLength(25);
        expect(filas['SUM-3000']).toEqual({ client: 'DISFER', amount: 7, exportedAt: null });
        expect(filas['SUM-3029'].exportedAt).toBe(ANTES);
        expect(avances).toEqual([0, 20, 25]);
        expect(alDesmarcar.mock.calls.flatMap(c => c[0])).toHaveLength(25);
    });

    it('lo que no se puede guardar se devuelve para reintentar', async () => {
        const filas = albaranes(3);
        Object.values(filas).forEach(f => { f.exportedAt = DESPUES; });

        const fin = await deshacerFacturacion(baseDeDatos(filas, { fallan: ['SUM-3001'] }).supabase, DESPUES);

        expect(fin).toEqual({ hechos: 2, total: 3, faltan: ['SUM-3001'] });
        expect(filas['SUM-3001'].exportedAt).toBe(DESPUES);
    });
});
