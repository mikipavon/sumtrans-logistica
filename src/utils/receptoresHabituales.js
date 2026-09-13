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
 *
 * ── La lista se lee por donde se guarda ───────────────────────────────────────
 * Guardar y volver a enseñar tienen que buscar la ficha IGUAL. Mientras no fue
 * así, el repartidor apuntaba el DNI una entrega tras otra y no le salía nunca:
 * se guardaba bien (la búsqueda del guardado también mira la razón social) y se
 * leía mal (la de la chuleta sólo miraba el nombre comercial). Con validar un
 * cliente basta para que se separen: la oficina le pone el nombre bueno a la
 * ficha y el que lleva escrito el albarán se queda de razón social.
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

/**
 * Nombres de empresa para comparar. Mismo criterio que `normalizeClientName` en
 * App.jsx y en DriverDashboard.jsx, que `normalizarNombreCliente` en el alta de
 * fichas y que `nombre_normalizado` en la base de datos: sin tildes, sin
 * mayúsculas y sin espacios de más, pero CON la puntuación. La de las personas
 * (arriba) sí se la come, y aquí no vale: "Gómez, S.L." y "Gómez SL" son la
 * misma empresa, pero por ese camino también lo serían dos que no lo son.
 */
const normalizarNombreDireccion = (valor) => String(valor || '')
    .normalize('NFD')
    .replace(TILDES, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

/**
 * La ficha —o la sede— que responde a un nombre de parada, buscando por nombre
 * comercial, razón social y nombres de sede.
 *
 * Es el respaldo de `fichaDelDestinatario`: ese enlace lo hace la base de datos
 * al escribir el albarán y es el bueno, porque aguanta que la oficina renombre
 * la ficha después. Pero un albarán que se tecleó con un nombre que entonces no
 * casaba con ninguna ficha se queda sin enlace, y ahí hay que mirar el texto.
 *
 * Los tres nombres son los mismos con los que empareja el servidor (migración
 * 22) y con los que el alta busca si una ficha ya existe: si aquí se mirara
 * sólo el comercial, lo que se guarda en una ficha no se volvería a encontrar.
 *
 * Devuelve { client, branch } —branch a null si responde la ficha madre— o null.
 */
export const direccionPorNombre = (nombre, clients = []) => {
    const buscado = normalizarNombreDireccion(nombre);
    if (!buscado) return null;

    for (const client of (Array.isArray(clients) ? clients : [])) {
        if (!client) continue;
        if (normalizarNombreDireccion(client.name) === buscado
            || normalizarNombreDireccion(client.legalName) === buscado) {
            return { client, branch: null };
        }
        const branch = (Array.isArray(client.branches) ? client.branches : [])
            .find((b) => normalizarNombreDireccion(b?.name) === buscado);
        if (branch) return { client, branch };
    }
    return null;
};

/**
 * De quién es la chuleta: la sede si el albarán va a una sede, y si no la ficha.
 *
 * La sede tiene la suya y no hereda la de la casa madre: quien firma en un
 * almacén no es quien firma en otro.
 */
export const direccionDeLaChuleta = (direccion) => direccion?.branch || direccion?.client || null;

/**
 * Junta en una sola lista la de dos fichas de la misma empresa, sin repetir a
 * nadie y respetando el tope. Se usa cuando dos fichas se convierten en una
 * —dos altas del mismo destinatario, una solicitud que se aprueba sobre la
 * ficha de siempre—: la que se queda hereda a los que recibieron en la otra.
 *
 * `preferente` manda en el orden y en el DNI, que para eso es la que se queda.
 */
export const juntarReceptores = (preferente, secundaria) => {
    const cola = leerReceptores({ receivers: Array.isArray(secundaria) ? secundaria : [] });
    const cabeza = leerReceptores({ receivers: Array.isArray(preferente) ? preferente : [] });

    // De atrás hacia delante: `agregarReceptor` pone cada uno el primero, así que
    // así la lista sale en el mismo orden en el que entró.
    return [...cabeza, ...cola]
        .reverse()
        .reduce((lista, receptor) => agregarReceptor(lista, receptor), []);
};
