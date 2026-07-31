/**
 * Transformaciones sobre el conocimiento de rutas (settings/route_knowledge).
 *
 * Forma del objeto:
 * {
 *   masterByRoute:  { [routeId]:  { [pueblo]: { [cliente]: {avg, count} }, _setBy, _setAt } },
 *   byDriver:       { [driverId]: { [pueblo]: { [cliente]: {avg, count} } } },
 *   trashByDriver:  { [driverId]: { datos, borradoEl } },
 *   actionByDriver: { [driverId]: { accion: 'borrado'|'recuperado', fecha } }
 * }
 *
 * `actionByDriver` es el buzón de órdenes del administrador hacia el móvil del
 * repartidor: el aprendizaje se guarda en localStorage, así que borrarlo o
 * recuperarlo en la nube no basta, el dispositivo tiene que enterarse.
 */

/** Nº de pueblos memorizados (las claves con "_" delante son metadatos). */
export const contarPueblos = (datos) =>
    Object.keys(datos || {}).filter(k => !k.startsWith('_')).length;

/**
 * Los clientes memorizados de un pueblo.
 *
 * Aguanta los dos formatos porque en la nube conviven: el nuevo parte el pueblo por
 * turnos ({manana: {...}, tarde: {...}}) y el viejo lleva los clientes directamente.
 * Contando a lo bruto, un pueblo en formato nuevo salía como "2 clientes".
 */
const clientesDePueblo = (pueblo) => {
    const turnos = ['manana', 'tarde'].filter(t => pueblo[t] && typeof pueblo[t] === 'object');
    if (turnos.length === 0) return Object.keys(pueblo).filter(k => !k.startsWith('_'));
    const nombres = new Set();
    turnos.forEach(t => Object.keys(pueblo[t]).forEach(n => nombres.add(n)));
    return [...nombres];
};

/** Nº total de clientes memorizados entre todos los pueblos. */
export const contarClientes = (datos) =>
    Object.entries(datos || {})
        .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object')
        .reduce((suma, [, pueblo]) => suma + clientesDePueblo(pueblo).length, 0);

/**
 * Manda el aprendizaje de un conductor a la papelera.
 * Guarda una copia intacta para poder devolverla luego.
 */
export const borrarAprendizaje = (conocimiento, driverId, fecha = new Date().toISOString()) => {
    const id = String(driverId);
    const datos = conocimiento?.byDriver?.[id];
    if (!datos) return conocimiento;

    const byDriver = { ...(conocimiento?.byDriver || {}) };
    delete byDriver[id];

    return {
        ...conocimiento,
        byDriver,
        trashByDriver: {
            ...(conocimiento?.trashByDriver || {}),
            [id]: { datos, borradoEl: fecha }
        },
        actionByDriver: {
            ...(conocimiento?.actionByDriver || {}),
            [id]: { accion: 'borrado', fecha }
        }
    };
};

/**
 * Devuelve al conductor el aprendizaje que estaba en la papelera,
 * sustituyendo lo que haya aprendido desde el borrado.
 */
export const recuperarAprendizaje = (conocimiento, driverId, fecha = new Date().toISOString()) => {
    const id = String(driverId);
    const entrada = conocimiento?.trashByDriver?.[id];
    if (!entrada) return conocimiento;

    const trashByDriver = { ...(conocimiento?.trashByDriver || {}) };
    delete trashByDriver[id];

    return {
        ...conocimiento,
        byDriver: {
            ...(conocimiento?.byDriver || {}),
            [id]: entrada.datos || {}
        },
        trashByDriver,
        actionByDriver: {
            ...(conocimiento?.actionByDriver || {}),
            [id]: { accion: 'recuperado', fecha }
        }
    };
};

/** Vacía una entrada de la papelera. Esto ya no tiene vuelta atrás. */
export const eliminarDeLaPapelera = (conocimiento, driverId) => {
    const id = String(driverId);
    if (!conocimiento?.trashByDriver?.[id]) return conocimiento;
    const trashByDriver = { ...conocimiento.trashByDriver };
    delete trashByDriver[id];
    return { ...conocimiento, trashByDriver };
};

/**
 * ── El aprendizaje de cada repartidor va en su propia fila ─────────────────────────
 *
 * Antes todo vivía en un único `settings/route_knowledge`, y dos móviles guardando a
 * la vez se pisaban: el segundo releía, fusionaba y escribía, pero entre su lectura y
 * su escritura cabía perfectamente la escritura del primero, que se perdía. Releer
 * antes de escribir estrecha la ventana, no la cierra.
 *
 * Con una fila por conductor (`route_knowledge_driver_<id>`) el problema desaparece de
 * raíz: nadie más escribe esa fila, así que no hay nada que fusionar ni carrera que
 * perder. En la fila principal solo quedan las cosas del administrador (el maestro por
 * ruta, la papelera y el buzón de órdenes), que se tocan de una en una desde la
 * oficina.
 */
export const claveAprendizaje = (driverId) => `route_knowledge_driver_${String(driverId)}`;

/** ¿Es esta clave de settings la fila de aprendizaje de algún conductor? */
export const esClaveAprendizaje = (key) => String(key || '').startsWith('route_knowledge_driver_');

/** El id de conductor que hay dentro de una clave de aprendizaje. */
export const driverIdDeClave = (key) => String(key || '').replace('route_knowledge_driver_', '');

/**
 * Junta la fila principal con las filas por conductor.
 *
 * Las filas por conductor SIEMPRE mandan sobre lo que hubiera en `byDriver`, incluso
 * cuando vienen vacías: así es como se ve un borrado del administrador. El `byDriver`
 * de la fila principal se queda como respaldo para el aprendizaje que ya estaba en
 * producción y todavía no se ha vuelto a guardar en su fila nueva.
 */
export const ensamblarConocimiento = (base, porConductor = {}) => ({
    ...(base || {}),
    byDriver: {
        ...(base?.byDriver || {}),
        ...(porConductor || {})
    }
});

/**
 * Qué filas por conductor hay que reescribir tras un cambio del administrador.
 *
 * Borrar y recuperar el aprendizaje se hacen sobre el objeto entero, así que hay que
 * traducir ese cambio a las filas concretas que lo materializan. Un conductor que
 * desaparece de `byDriver` se traduce en su fila vaciada, no en su fila intacta.
 */
export const conductoresConCambios = (anterior, nuevo) => {
    const ids = new Set([
        ...Object.keys(anterior?.byDriver || {}),
        ...Object.keys(nuevo?.byDriver || {})
    ]);

    const cambios = {};
    for (const id of ids) {
        const antes = anterior?.byDriver?.[id];
        const despues = nuevo?.byDriver?.[id];
        if (JSON.stringify(antes ?? null) !== JSON.stringify(despues ?? null)) {
            cambios[id] = despues || {};
        }
    }
    return cambios;
};

/**
 * Fusiona lo que este dispositivo quiere guardar con lo que hay ahora mismo en la
 * nube. Se sigue usando para la fila principal, que comparten administrador y
 * repartidores: sin esta fusión, el segundo en sincronizar borraría lo que acabase de
 * subir el primero.
 *
 * OJO: fusionar nunca puede quitar claves, así que las órdenes del administrador
 * (borrar, recuperar) NO deben pasar por aquí — resucitarían lo borrado.
 */
export const fusionarConocimiento = (base, nuevo) => ({
    ...(base || {}),
    ...(nuevo || {}),
    masterByRoute:  { ...(base?.masterByRoute || {}),  ...(nuevo?.masterByRoute || {}) },
    byDriver:       { ...(base?.byDriver || {}),       ...(nuevo?.byDriver || {}) },
    trashByDriver:  { ...(base?.trashByDriver || {}),  ...(nuevo?.trashByDriver || {}) },
    actionByDriver: { ...(base?.actionByDriver || {}), ...(nuevo?.actionByDriver || {}) },
});
