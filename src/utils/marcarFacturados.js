// ── Poner el FACT a lo exportado a Factusol, sin perder el hilo ──
//
// La exportación descargaba el Excel y luego marcaba albarán por albarán, en
// memoria: 2.227 marcados en 13 minutos, una recarga de la página y el resto se
// quedó en el Excel sin etiqueta (SUM-3015, 01/10/2026).
//
// Ahora la lista de lo que falta por marcar se apunta en el navegador ANTES de
// descargar el Excel y se va tachando según se guarda. Si la página se recarga
// o se cierra, al volver a entrar la app sigue por donde iba.
//
// Cada albarán se lee de la base de datos justo antes de marcarlo, así que no
// se pisa nada que otro aparato haya cambiado, y da igual que la app lo tenga
// cargado o no (sólo carga 90 días).

import { fetchAllRows } from './fetchAllRows';

export const CLAVE_TRABAJO_FACT = 'sum_fact_pendiente';

// Albaranes que se leen y se guardan a la vez. Uno a uno eran 13 minutos.
const TANDA = 20;

export const leerTrabajoFact = () => {
    try {
        const trabajo = JSON.parse(localStorage.getItem(CLAVE_TRABAJO_FACT) || 'null');
        if (!trabajo || !Array.isArray(trabajo.pendientes) || !trabajo.momento) return null;
        if (trabajo.pendientes.length === 0) return null;
        return trabajo;
    } catch {
        return null;
    }
};

const guardarTrabajoFact = (trabajo) => {
    try {
        if (!trabajo || trabajo.pendientes.length === 0) localStorage.removeItem(CLAVE_TRABAJO_FACT);
        else localStorage.setItem(CLAVE_TRABAJO_FACT, JSON.stringify(trabajo));
    } catch (e) {
        console.warn('[FACT] No se ha podido apuntar el avance en el navegador:', e);
    }
};

export const descartarTrabajoFact = () => guardarTrabajoFact(null);

/**
 * Apunta un trabajo nuevo. Si ya había uno a medias se le suman los albaranes
 * (conservan la fecha del primero): nunca se pierde lo que quedaba por marcar.
 */
export const apuntarTrabajoFact = (ids, momento = new Date().toISOString()) => {
    const nuevos = [...new Set((ids || []).filter(Boolean))];
    const anterior = leerTrabajoFact();
    const pendientes = [...new Set([...(anterior?.pendientes || []), ...nuevos])];
    const yaHechos = anterior ? anterior.total - anterior.pendientes.length : 0;
    const trabajo = {
        momento: anterior?.momento || momento,
        pendientes,
        total: yaHechos + pendientes.length,
    };
    guardarTrabajoFact(trabajo);
    return leerTrabajoFact();
};

/**
 * Marca lo que quede del trabajo apuntado. Una pasada: lo que no se pueda
 * guardar (sin conexión, sesión caducada, albarán borrado) se queda apuntado
 * para reintentar.
 *
 * `alAvanzar({ hechos, total })` tras cada tanda; `alMarcar(ids, momento)` con
 * los que se acaban de guardar, para que la pantalla les ponga la etiqueta.
 * Devuelve { hechos, total, faltan: [ids] }.
 */
export const continuarTrabajoFact = async (supabase, { alAvanzar, alMarcar } = {}) => {
    let trabajo = leerTrabajoFact();
    if (!trabajo) return { hechos: 0, total: 0, faltan: [] };

    const { momento, total } = trabajo;
    const cola = [...trabajo.pendientes];
    const faltan = [];
    const avisar = () => alAvanzar && alAvanzar({ hechos: total - cola.length - faltan.length, total });
    avisar();

    while (cola.length > 0) {
        const tanda = cola.splice(0, TANDA);
        let filas = [];
        try {
            const { data, error } = await supabase.from('shipments').select('id,data').in('id', tanda);
            if (error) throw error;
            filas = data || [];
        } catch (e) {
            console.warn('[FACT] No se ha podido leer la tanda:', e);
        }

        const marcados = (await Promise.all(filas.map(async (fila) => {
            try {
                const { data, error } = await supabase
                    .from('shipments')
                    .update({ data: { ...fila.data, exportedAt: momento } })
                    .eq('id', fila.id)
                    .select('id');
                if (error || !data || data.length === 0) return null;
                return fila.id;
            } catch {
                return null;
            }
        }))).filter(Boolean);

        const hechosAhora = new Set(marcados);
        faltan.push(...tanda.filter(id => !hechosAhora.has(id)));

        // Tachar lo guardado: lo que queda apuntado es lo que falla más lo que
        // todavía no se ha intentado.
        trabajo = { momento, total, pendientes: [...faltan, ...cola] };
        guardarTrabajoFact(trabajo);
        if (alMarcar && marcados.length > 0) alMarcar(marcados, momento);
        avisar();
    }

    return { hechos: total - faltan.length, total, faltan };
};

// ── Deshacer una facturación reciente ──
//
// Todos los albaranes de una misma exportación llevan la misma fecha-hora en
// exportedAt, así que cada "movimiento" es un grupo con su fecha. El 01/10/2026
// salieron tres seguidos (3.143 a las 17:00, 376 repetidos a las 17:52 y uno
// suelto a las 18:09): se enseñan los de los últimos dos días, el más reciente
// arriba, y cada uno se deshace por separado.

export const DIAS_DE_FACTURACIONES = 2;

/** Las facturaciones de los últimos días entre lo cargado: [{ momento, ids }], la más reciente primero. */
export const facturacionesRecientes = (shipments, { dias = DIAS_DE_FACTURACIONES, ahora = Date.now() } = {}) => {
    const desde = ahora - dias * 24 * 60 * 60 * 1000;
    const grupos = new Map();
    for (const s of shipments || []) {
        const momento = s?.exportedAt;
        if (!momento || new Date(momento).getTime() < desde) continue;
        if (!grupos.has(momento)) grupos.set(momento, []);
        grupos.get(momento).push(s.id);
    }
    return [...grupos.entries()]
        .sort((a, b) => (a[0] < b[0] ? 1 : -1))
        .map(([momento, ids]) => ({ momento, ids }));
};

/**
 * Quita el FACT a todo lo facturado en `momento`, leyendo de la base de datos
 * (no de lo cargado) para no dejarse ninguno. `alAvanzar({ hechos, total })`
 * tras cada tanda; `alDesmarcar(ids)` con los que se acaban de limpiar.
 * Devuelve { hechos, total, faltan: [ids] }.
 */
export const deshacerFacturacion = async (supabase, momento, { alAvanzar, alDesmarcar } = {}) => {
    const { data, error } = await fetchAllRows(
        () => supabase.from('shipments').select('id,data').eq('data->>exportedAt', momento).order('id'),
        { label: 'deshacer facturación' }
    );
    if (error) throw error;

    const cola = [...(data || [])];
    const total = cola.length;
    const faltan = [];
    const avisar = () => alAvanzar && alAvanzar({ hechos: total - cola.length - faltan.length, total });
    avisar();

    while (cola.length > 0) {
        const tanda = cola.splice(0, TANDA);
        const limpiados = (await Promise.all(tanda.map(async (fila) => {
            try {
                const { exportedAt: _quitado, ...resto } = fila.data || {};
                const { data: ok, error: e } = await supabase
                    .from('shipments')
                    .update({ data: { ...resto, exportedAt: null } })
                    .eq('id', fila.id)
                    .select('id');
                if (e || !ok || ok.length === 0) return null;
                return fila.id;
            } catch {
                return null;
            }
        }))).filter(Boolean);

        const hechosAhora = new Set(limpiados);
        faltan.push(...tanda.map(f => f.id).filter(id => !hechosAhora.has(id)));
        if (alDesmarcar && limpiados.length > 0) alDesmarcar(limpiados);
        avisar();
    }

    return { hechos: total - faltan.length, total, faltan };
};
