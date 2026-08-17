/**
 * Agenda de destinatarios del portal de clientes.
 *
 * ── De dónde sale ─────────────────────────────────────────────────────────────────
 * De los propios envíos del cliente, no de la tabla `clients`. Cada envío ya lleva
 * dentro el destinatario completo (nombre, dirección, CP, población), así que no
 * hace falta que el cliente pueda leer fichas ajenas: no ve nada que no le hayamos
 * enseñado ya en "Mis Envíos".
 *
 * Antes se intentaba montar desde `allClients`, y la lista salía siempre vacía: con
 * las políticas de la fase 04 un cliente sólo recibe SU PROPIA ficha, que además el
 * filtro descartaba por ser él mismo. El resultado práctico era escribir cada
 * destinatario entero a mano, una y otra vez.
 *
 * ── Lo que no cubre ───────────────────────────────────────────────────────────────
 * Sólo ve los envíos que la app tenga cargados: los activos, y los terminados de
 * los últimos 90 días. Un destinatario al que no se manda nada desde hace más de
 * tres meses desaparece de las sugerencias (el envío sigue en la base, pero no se
 * descarga). Es el mismo límite que ya tiene la tabla de "Mis Envíos".
 */

/** Nombres de empresa para comparar: sin acentos, sin puntuación, sin dobles espacios. */
export const normalizarNombreDestinatario = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// `date` viene en formato español ("17 ago 2026"), que Date no sabe leer. Se usa
// createdAt y, si no hay, el envío cuenta como el más antiguo: sirve igual para
// contar veces, sólo pierde prioridad al decidir qué dirección es la buena.
const momentoDelEnvio = (envio) => {
    const t = new Date(envio?.createdAt || 0).getTime();
    return isNaN(t) ? 0 : t;
};

const primerValor = (...valores) => {
    for (const v of valores) {
        const limpio = String(v || '').trim();
        if (limpio) return limpio;
    }
    return '';
};

/**
 * Agrupa los envíos por destinatario y devuelve la agenda ordenada: primero los
 * de siempre (más envíos), y a igualdad, el más reciente.
 *
 * @param {Array} envios  Envíos del cliente (sin filtrar por fechas: la agenda no
 *                        debe encogerse porque esté puesto un filtro en pantalla).
 * @returns {Array<{clave, name, address, zip, city, veces, ultimoEnvio}>}
 */
export const construirAgendaDestinatarios = (envios = []) => {
    const porNombre = new Map();

    for (const envio of envios || []) {
        const nombre = String(envio?.destinationName || '').trim();
        const clave = normalizarNombreDestinatario(nombre);
        if (!clave) continue;

        const momento = momentoDelEnvio(envio);
        const direccion = primerValor(envio?.destinationAddress, envio?.destination);
        const cp = primerValor(envio?.destinationZip);
        const poblacion = primerValor(envio?.destinationCity);

        const ficha = porNombre.get(clave);
        if (!ficha) {
            porNombre.set(clave, {
                clave,
                name: nombre,
                address: direccion,
                zip: cp,
                city: poblacion,
                veces: 1,
                ultimoEnvio: momento
            });
            continue;
        }

        ficha.veces++;

        // Gana el envío más reciente: si el destinatario se ha mudado, no tiene
        // sentido volver a ofrecer la dirección del año pasado. Pero sólo pisa
        // campo a campo y con valor: un envío nuevo al que le falte el CP no debe
        // borrar el que ya teníamos.
        if (momento >= ficha.ultimoEnvio) {
            ficha.ultimoEnvio = momento;
            ficha.name = nombre;
            if (direccion) ficha.address = direccion;
            if (cp) ficha.zip = cp;
            if (poblacion) ficha.city = poblacion;
        } else {
            if (!ficha.address) ficha.address = direccion;
            if (!ficha.zip) ficha.zip = cp;
            if (!ficha.city) ficha.city = poblacion;
        }
    }

    return [...porNombre.values()].sort((a, b) =>
        b.veces - a.veces ||
        b.ultimoEnvio - a.ultimoEnvio ||
        a.name.localeCompare(b.name, 'es')
    );
};

/**
 * Sugerencias para el campo "Nombre / Empresa Destinatario".
 * Sin nada escrito muestra los habituales; escribiendo, busca por trozos del
 * nombre sin importar acentos ni mayúsculas ("cordoba" encuentra "Córdoba S.L.").
 */
export const filtrarAgendaDestinatarios = (agenda, texto, limite = 8) => {
    const busqueda = normalizarNombreDestinatario(texto);
    const lista = agenda || [];
    if (!busqueda) return lista.slice(0, limite);
    return lista.filter(c => c.clave.includes(busqueda)).slice(0, limite);
};
