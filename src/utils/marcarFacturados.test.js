// ── El FACT no pierde el hilo ──
//
// SUM-3015 salió en el Excel de Factusol y se quedó sin etiqueta: la página se
// recargó cuando iban 2.227 marcados y lo que faltaba sólo estaba en memoria
// (01/10/2026). La lista se apunta en el navegador y se va tachando.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CLAVE_TRABAJO_FACT, leerTrabajoFact, apuntarTrabajoFact, continuarTrabajoFact, descartarTrabajoFact } from './marcarFacturados';

// Una base de datos de mentira con lo justo: leer por lista de ids y guardar
// una fila. `fallan` son los albaranes cuyo guardado no llega.
const baseDeDatos = (filas, { fallan = [] } = {}) => {
    const guardados = [];
    const supabase = {
        from: () => ({
            select: () => ({
                in: async (_col, ids) => ({ data: ids.filter(id => filas[id]).map(id => ({ id, data: filas[id] })), error: null }),
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
