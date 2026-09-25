// ── Los cobros pendientes que son de la misma persona ──
//
// En la pestaña Cobros del repartidor cada albarán es una tarjeta, y el que
// paga se escribe en cada albarán como quiso quien lo tecleó: "Cristóbal
// Merino" en dos y "MERINO NUÑEZ, CRISTOBAL" en el tercero. Ordenadas por
// nombre quedaban separadas y el repartidor, delante del cliente, tenía que
// buscar tarjeta a tarjeta cuáles eran suyas.
//
// Aquí se juntan las líneas de cobro cuyo pagador es el mismo nombre o uno
// parecido, con la misma regla que usa la oficina para avisar de fichas
// duplicadas (nombresSeParecen, en duplicadosClientes.js): mismas palabras en
// otro orden, a una le sobran apellidos, una errata. Sólo sirve para enseñarlas
// juntas y para ofrecer cobrarlas de una vez: no cambia nada del albarán.
//
// Los nombres de relleno de una línea sin pagador —"Remitente", "Destinatario
// (Debido)", "Destinatario (Reembolso)"— no son nadie: dos albaranes sin
// destinatario no son del mismo cliente por llevar el mismo hueco.
import { nombresSeParecen } from './duplicadosClientes';

const limpio = (valor) => String(valor ?? '').trim();

const esRelleno = (nombre) => /^(remitente|destinatario)\b/i.test(nombre);

/** ¿Estos dos nombres son la misma persona, escrita de dos maneras? */
export const esElMismoPagador = (unNombre, otroNombre) => {
    const uno = limpio(unNombre);
    const otro = limpio(otroNombre);
    if (!uno || !otro || esRelleno(uno) || esRelleno(otro)) return false;
    if (uno.toLowerCase() === otro.toLowerCase()) return true;
    return nombresSeParecen(uno, otro);
};

/**
 * Junta las líneas por pagador, en el orden en que llegan: cada grupo nace con
 * la primera línea que no encaja en ninguno anterior, así que si `lineas`
 * viene ordenada por nombre los grupos salen también por nombre.
 *
 * @param {Array} lineas  las tarjetas de cobro; se lee el pagador con `nombreDe`
 * @param {(linea) => string} [nombreDe]  por defecto `linea.payerName`
 * @returns {Array<{ nombre: string, nombres: string[], lineas: Array }>}
 *   `nombre` es el del primer albarán del grupo (el que encabeza la lista);
 *   `nombres`, todas las formas en que se ha escrito.
 */
export function agruparPorPagador(lineas = [], nombreDe = (linea) => linea?.payerName) {
    const grupos = [];
    for (const linea of lineas) {
        const nombre = limpio(nombreDe(linea));
        const grupo = nombre && !esRelleno(nombre)
            ? grupos.find(g => g.nombres.some(n => esElMismoPagador(n, nombre)))
            : null;
        if (grupo) {
            grupo.lineas.push(linea);
            if (!grupo.nombres.some(n => n.toLowerCase() === nombre.toLowerCase())) grupo.nombres.push(nombre);
        } else {
            grupos.push({ nombre: nombre || 'Sin nombre', nombres: nombre ? [nombre] : [], lineas: [linea] });
        }
    }
    return grupos;
}

/**
 * Las otras líneas que son del mismo pagador que `linea`, en el orden de
 * `lineas` y sin ella misma. Vacío si está sola. Las líneas se reconocen por
 * su `key`, que es único por albarán y parte (porte / reembolso).
 */
export function hermanosDe(linea, lineas = [], nombreDe) {
    if (!linea) return [];
    const grupo = agruparPorPagador(lineas, nombreDe).find(g => g.lineas.some(l => l.key === linea.key));
    if (!grupo) return [];
    return grupo.lineas.filter(l => l.key !== linea.key);
}
