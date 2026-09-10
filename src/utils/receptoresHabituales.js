/**
 * Quién recibe en cada dirección: la chuleta del modal de entrega.
 *
 * ── Para qué ──────────────────────────────────────────────────────────────────
 * En un negocio no siempre recibe la misma persona: está el del almacén, la de
 * administración y el encargado. Antes se guardaba sólo el último (`lastReceiver`),
 * así que la chuleta se peleaba consigo misma: cada entrega borraba al anterior y
 * al repartidor le sugería justo a quien hoy no está. Ahora se guarda una lista
 * corta, la más reciente primero, y el repartidor elige.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────────
 * No rellena nada solo. La prueba de entrega dice quién ha recibido HOY, y un
 * nombre que nadie ha mirado es peor que uno en blanco: la lista sólo se escribe
 * en los campos cuando el repartidor toca una de las fichas.
 *
 * ── El DNI viaja pegado al nombre ─────────────────────────────────────────────
 * Nombre y documento salen y entran juntos SIEMPRE. Si al elegir a una persona se
 * conservara el DNI que hubiera escrito antes, la entrega se firmaría con el
 * nombre de uno y el documento de otro, que es peor que no tener ninguno.
 */

// Marcas de acento sueltas que deja normalize('NFD').
const TILDES = new RegExp('[̀-ͯ]', 'g');

/** Nombres de persona para comparar: sin tildes, sin puntuación, sin dobles espacios. */
export const normalizarNombreReceptor = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(TILDES, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Cuántas personas se recuerdan por dirección. Seis cubre la recepción de un
 * negocio con turnos; más allá se convierte en una lista que hay que leer, y
 * leerla cuesta más que teclear el nombre.
 */
export const TOPE_RECEPTORES = 6;

/**
 * La lista de una ficha o de una sede, ya limpia y sin los que no tienen nombre.
 * Entiende también el `lastReceiver` de antes (una sola persona), para que las
 * fichas guardadas hasta ahora no pierdan lo que ya sabían.
 */
export const leerReceptores = (ficha) => {
    if (!ficha) return [];
    const guardados = Array.isArray(ficha.receivers)
        ? ficha.receivers
        : (ficha.lastReceiver ? [ficha.lastReceiver] : []);

    return guardados
        .map((r) => ({
            name: String(r?.name || '').trim(),
            dni: String(r?.dni || '').trim(),
            at: r?.at || null,
        }))
        .filter((r) => r.name);
};

/**
 * Apunta a quien ha recibido hoy y devuelve la lista nueva, el más reciente
 * primero. Si ya estaba, sube al principio en vez de duplicarse: el mismo nombre
 * escrito con o sin tildes es la misma persona.
 *
 * El DNI se pisa con el de hoy, pero sólo si hoy se ha apuntado alguno: una
 * entrega en la que el repartidor no pidió el documento no puede borrar el que ya
 * teníamos de esa persona.
 */
export const agregarReceptor = (lista, receptor) => {
    const previos = leerReceptores({ receivers: Array.isArray(lista) ? lista : [] });
    const nombre = String(receptor?.name || '').trim();
    if (!nombre) return previos;

    const clave = normalizarNombreReceptor(nombre);
    const yaEstaba = previos.find((r) => normalizarNombreReceptor(r.name) === clave);
    const dni = String(receptor?.dni || '').trim() || (yaEstaba?.dni || '');

    const deHoy = { name: nombre, dni, at: receptor?.at || new Date().toISOString() };

    return [deHoy, ...previos.filter((r) => normalizarNombreReceptor(r.name) !== clave)]
        .slice(0, TOPE_RECEPTORES);
};
