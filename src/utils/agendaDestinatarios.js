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
 * ── Dos fuentes, la misma forma ───────────────────────────────────────────────────
 * Desde la fase 26 la agenda buena la calcula el servidor
 * (`agenda_destinatarios_del_cliente_conectado`, ver agendaDestinatariosServidor.js):
 * mira TODOS los envíos del cliente, sin el límite de 90 días, y cuando el envío
 * estaba enlazado con una ficha nuestra devuelve el id de la ficha y su nombre y
 * dirección ACTUALES. Con ese id el envío nuevo nace apuntando a la ficha y no
 * se crea otra en la entrega, aunque el nombre esté escrito de otra manera.
 *
 * La construcción local con los envíos cargados se queda como respaldo (si el
 * servidor no contesta) y para lo que el cliente acaba de crear en esta sesión.
 * Las dos producen entradas con la misma forma:
 *
 *   { clave, name, address, zip, city, veces, ultimoEnvio,
 *     destinatarioId, destinatarioSedeId }        // los dos últimos a null si no hay enlace
 *
 * ── Lo que no cubre ───────────────────────────────────────────────────────────────
 * El primer envío a una empresa a la que el cliente nunca ha mandado nada se sigue
 * tecleando a mano; ahí queda el emparejamiento por nombre del servidor (fase 22).
 */

import { nombresSeParecen, clavesDelNombre } from './duplicadosClientes';

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

const hayId = (valor) => valor !== null && valor !== undefined && String(valor).trim() !== '';

// Primero los de siempre (más envíos), a igualdad el más reciente, y por nombre.
const ordenDeAgenda = (a, b) =>
    b.veces - a.veces ||
    b.ultimoEnvio - a.ultimoEnvio ||
    a.name.localeCompare(b.name, 'es');

/**
 * Agrupa los envíos por destinatario y devuelve la agenda ordenada: primero los
 * de siempre (más envíos), y a igualdad, el más reciente.
 *
 * Si alguno de los envíos del grupo venía enlazado con una ficha nuestra
 * (destinatarioId, fase 21), la entrada se lleva ese enlace —el del envío más
 * reciente que lo tenga— para que el envío nuevo apunte a la misma ficha.
 *
 * @param {Array} envios  Envíos del cliente (sin filtrar por fechas: la agenda no
 *                        debe encogerse porque esté puesto un filtro en pantalla).
 * @returns {Array<{clave, name, address, zip, city, veces, ultimoEnvio, destinatarioId, destinatarioSedeId}>}
 */
export const construirAgendaDestinatarios = (envios = []) => {
    const porNombre = new Map();
    const momentoDelEnlace = new Map();

    for (const envio of envios || []) {
        const nombre = String(envio?.destinationName || '').trim();
        const clave = normalizarNombreDestinatario(nombre);
        if (!clave) continue;

        const momento = momentoDelEnvio(envio);
        const direccion = primerValor(envio?.destinationAddress, envio?.destination);
        const cp = primerValor(envio?.destinationZip);
        const poblacion = primerValor(envio?.destinationCity);

        let ficha = porNombre.get(clave);
        if (!ficha) {
            ficha = {
                clave,
                name: nombre,
                address: direccion,
                zip: cp,
                city: poblacion,
                veces: 1,
                ultimoEnvio: momento,
                destinatarioId: null,
                destinatarioSedeId: null
            };
            porNombre.set(clave, ficha);
        } else {
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

        // El enlace del envío más reciente que lo traiga. Un envío sin enlace no
        // borra el que ya teníamos: es el caso normal de un envío recién creado a
        // mano que el servidor aún no ha emparejado.
        if (hayId(envio?.destinatarioId)
            && (!momentoDelEnlace.has(clave) || momento >= momentoDelEnlace.get(clave))) {
            momentoDelEnlace.set(clave, momento);
            ficha.destinatarioId = envio.destinatarioId;
            ficha.destinatarioSedeId = hayId(envio.destinatarioSedeId) ? envio.destinatarioSedeId : null;
        }
    }

    return [...porNombre.values()].sort(ordenDeAgenda);
};

/**
 * La agenda tal y como la devuelve el servidor (fase 26), en la misma forma que
 * la local. Las filas vienen como
 *   { nombre, direccion, cp, poblacion, ficha_id, sede_id, veces, ultimo_envio }
 *
 * Si dos filas acaban con el mismo nombre (una enlazada a la ficha y otra con el
 * texto suelto de antes de enlazarse) se juntan en una: manda la que tiene ficha,
 * y las veces se suman para que no pierda su sitio entre los habituales.
 */
export const agendaDesdeServidor = (filas = []) => {
    const porNombre = new Map();

    for (const fila of filas || []) {
        const nombre = String(fila?.nombre || '').trim();
        const clave = normalizarNombreDestinatario(nombre);
        if (!clave) continue;

        const entrada = {
            clave,
            name: nombre,
            address: primerValor(fila?.direccion),
            zip: primerValor(fila?.cp),
            city: primerValor(fila?.poblacion),
            veces: Number(fila?.veces) || 0,
            ultimoEnvio: momentoDelEnvio({ createdAt: fila?.ultimo_envio }),
            destinatarioId: hayId(fila?.ficha_id) ? fila.ficha_id : null,
            destinatarioSedeId: hayId(fila?.sede_id) ? fila.sede_id : null
        };

        const previa = porNombre.get(clave);
        if (!previa) {
            porNombre.set(clave, entrada);
            continue;
        }

        const manda = (hayId(entrada.destinatarioId) && !hayId(previa.destinatarioId))
            || (hayId(entrada.destinatarioId) === hayId(previa.destinatarioId)
                && entrada.ultimoEnvio > previa.ultimoEnvio)
            ? entrada : previa;
        const otra = manda === entrada ? previa : entrada;

        porNombre.set(clave, {
            ...manda,
            address: manda.address || otra.address,
            zip: manda.zip || otra.zip,
            city: manda.city || otra.city,
            veces: entrada.veces + previa.veces,
            ultimoEnvio: Math.max(entrada.ultimoEnvio, previa.ultimoEnvio)
        });
    }

    return [...porNombre.values()].sort(ordenDeAgenda);
};

// ¿Están en sitios distintos A CIENCIA CIERTA? Sólo veta cuando los dos lados
// lo dicen: primero por CP, y si falta alguno, por población (vale que una
// esté contenida en la otra: "Puente Genil" y "Puente Genil (Córdoba)"). Si no
// se sabe, no se sabe: no bloquea.
const enSitiosDistintos = (una, otra) => {
    const cpA = String(una.zip || '').trim();
    const cpB = String(otra.zip || '').trim();
    if (cpA && cpB) return cpA !== cpB;

    const puebloA = clavesDelNombre(una.city);
    const puebloB = clavesDelNombre(otra.city);
    if (puebloA.size === 0 || puebloB.size === 0) return false;
    const [chico, grande] = puebloA.size <= puebloB.size ? [puebloA, puebloB] : [puebloB, puebloA];
    return ![...chico].every(p => grande.has(p));
};

/**
 * Pliega en cada ficha las entradas sueltas que son la misma empresa escrita de
 * otra manera: "AGRO. IND. VELASCO, S.L." tecleado en unos envíos y "AGRO
 * INDUSTRIAS VELASCO" (la ficha) en otros salían como dos destinatarios, y el
 * cliente elegía uno u otro según el día; eligiendo el suelto, el envío nacía
 * sin enlace y la entrega volvía a crear la ficha.
 *
 * El parecido es el mismo que usa Validar Clientes (nombresSeParecen), pero aquí
 * se aplica sólo DENTRO de la agenda de un cliente: las candidatas son las
 * fichas a las que ese cliente ya envía, no toda la cartera. Que el mismo
 * cliente mande a dos empresas de nombre casi igual en el mismo pueblo es lo
 * bastante raro para que compense. Y una población o un CP distintos a las
 * claras lo impiden.
 *
 * La entrada resultante es la de la ficha (su nombre, su dirección, su id); la
 * suelta sólo le suma las veces, y le presta la dirección si a la ficha le
 * faltaba.
 */
export const plegarParecidos = (agenda = []) => {
    const lista = (agenda || []).filter(Boolean);
    const fichas = lista.filter(c => hayId(c.destinatarioId)).map(c => ({ ...c }));
    if (fichas.length === 0) return lista;

    const sueltas = [];
    for (const suelta of lista) {
        if (hayId(suelta.destinatarioId)) continue;

        const ficha = fichas.find(f => !enSitiosDistintos(f, suelta)
            && nombresSeParecen(f.name, suelta.name,
                new Set([...clavesDelNombre(f.city), ...clavesDelNombre(suelta.city)])));

        if (!ficha) {
            sueltas.push(suelta);
            continue;
        }

        ficha.veces += suelta.veces;
        ficha.ultimoEnvio = Math.max(ficha.ultimoEnvio, suelta.ultimoEnvio);
        if (!ficha.address) ficha.address = suelta.address;
        if (!ficha.zip) ficha.zip = suelta.zip;
        if (!ficha.city) ficha.city = suelta.city;
    }

    return [...fichas, ...sueltas].sort(ordenDeAgenda);
};

/**
 * Junta la agenda del servidor con la local: la del servidor manda, y de la local
 * sólo entra lo que el servidor no conoce (lo recién creado en esta sesión). Si la
 * del servidor está vacía —no ha contestado aún, o ha fallado— queda la local.
 *
 * Y al final se pliegan los parecidos (plegarParecidos), venga cada uno de donde
 * venga.
 */
export const juntarAgendas = (servidor = [], local = []) => {
    const conocidas = new Set((servidor || []).map(c => c.clave));
    const nuevas = (local || []).filter(c => c && c.clave && !conocidas.has(c.clave));
    return plegarParecidos([...(servidor || []), ...nuevas]);
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
