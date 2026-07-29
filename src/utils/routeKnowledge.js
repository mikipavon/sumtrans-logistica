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

/** Nº total de clientes memorizados entre todos los pueblos. */
export const contarClientes = (datos) =>
    Object.entries(datos || {})
        .filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object')
        .reduce((suma, [, pueblo]) => suma + Object.keys(pueblo).length, 0);

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
 * Fusiona lo que este dispositivo quiere guardar con lo que hay ahora mismo en la
 * nube. route_knowledge es un único JSON compartido por todos los repartidores: sin
 * esta fusión, el segundo en sincronizar borraría lo que acabase de subir el primero.
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
