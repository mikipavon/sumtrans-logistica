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

    for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const desde = pagina * pageSize;
        const { data, error } = await construirConsulta().range(desde, desde + pageSize - 1);

        if (error) return { data: null, error };

        const lote = data || [];
        filas.push(...lote);

        // Página incompleta = no hay más que pedir.
        if (lote.length < pageSize) return { data: filas, error: null };
    }

    console.warn(`[fetchAllRows] ${label || 'consulta'}: alcanzado el tope de ${MAX_PAGINAS} páginas (${filas.length} filas). Puede faltar información.`);
    return { data: filas, error: null };
};
