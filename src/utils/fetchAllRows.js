/**
 * Trae TODAS las filas de una consulta de Supabase, no las primeras mil.
 *
 * ── El problema ───────────────────────────────────────────────────────────────────
 * PostgREST (la capa REST de Supabase) devuelve como mucho 1.000 filas por consulta.
 * No es un error: la respuesta llega con `error: null` y mil filas, y la aplicación
 * sigue como si eso fuera todo lo que hay. Con el volumen de envíos de un año, eso
 * significa históricos incompletos y cuentas que no cuadran, sin nada en la consola
 * que lo delate.
 *
 * ── Cómo se usa ───────────────────────────────────────────────────────────────────
 * Se le pasa una FUNCIÓN que construye la consulta, no la consulta ya hecha: los
 * query builders de Supabase son de un solo uso (en cuanto se esperan, se disparan),
 * así que hace falta poder fabricar uno nuevo por página.
 *
 *   const { data, error } = await fetchAllRows(
 *     () => supabase.from('shipments').select('id, data').order('id')
 *   );
 *
 * Devuelve la misma forma `{ data, error }` que Supabase, para que encaje donde ya
 * se estaba usando la consulta directa.
 *
 * ── Importante: ordena siempre ────────────────────────────────────────────────────
 * Sin un `.order()` estable, el servidor no garantiza el mismo orden entre páginas y
 * se pueden repetir o perder filas al paginar. La consulta que se pase DEBE llevar
 * un orden determinista (por ejemplo `.order('id')`).
 */

export const TAMANO_PAGINA = 1000;

// Tope de seguridad: si algo va mal y cada página viene llena para siempre, es
// preferible cortar y avisar que dejar al navegador pidiendo páginas sin fin.
const MAX_PAGINAS = 500;

export const fetchAllRows = async (construirConsulta, { pageSize = TAMANO_PAGINA, label = '' } = {}) => {
    const filas = [];

    const pedirPagina = (pagina) => {
        const desde = pagina * pageSize;
        return construirConsulta().range(desde, desde + pageSize - 1);
    };

    let pagina = 0;
    while (pagina < MAX_PAGINAS) {
        // La primera página se pide sola: no sabemos aún si hace falta una segunda,
        // y la mayoría de tablas caben en una sola (no queremos disparar peticiones
        // de más para las pequeñas). En cuanto una página sale llena, ya sabemos que
        // hay volumen, así que a partir de ahí se piden varias páginas A LA VEZ en
        // vez de esperar cada una por turnos — esto es lo que hacía lento el login
        // y las recargas cuando `shipments` o `clients` superan las 1000 filas.
        const tamanoLote = pagina === 0 ? 1 : Math.min(4, MAX_PAGINAS - pagina);
        const paginasLote = Array.from({ length: tamanoLote }, (_, i) => pagina + i);
        const resultados = await Promise.all(paginasLote.map(pedirPagina));

        let terminado = false;
        for (const { data, error } of resultados) {
            if (error) return { data: null, error };

            const lote = data || [];
            filas.push(...lote);
            pagina++;

            // Página incompleta = no hay más que pedir. Se descartan los resultados
            // de páginas posteriores ya pedidas en este mismo lote (si las hubiera).
            if (lote.length < pageSize) { terminado = true; break; }
        }
        if (terminado) return { data: filas, error: null };
    }

    console.warn(`[fetchAllRows] ${label || 'consulta'}: alcanzado el tope de ${MAX_PAGINAS} páginas (${filas.length} filas). Puede faltar información.`);
    return { data: filas, error: null };
};
