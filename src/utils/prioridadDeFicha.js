// ══════════════════════════════════════════════════════════════════════════
// PRIORIDAD DE SERVICIO DE UNA FICHA: la decide la base de datos a la que pertenece
// ══════════════════════════════════════════════════════════════════════════
// Los clientes propios de SUM van Urgente: son quienes pagan el servicio y a
// quienes se les promete la entrega. Los destinatarios de una agencia (TSB,
// TXT, XPO) van Estándar: la mercancía es de la agencia y se reparte cuando
// cae de camino.
//
// Antes todo nacía Urgente. Las fichas de agencia se crean solas al entregar
// (sin prioridad grabada) y el optimizador de ruta y el listado leían "sin
// prioridad" como Urgente, así que todos los envíos de agencia iban por
// delante de los clientes de SUM. Ver utils/agencyOwnership.js para la
// pertenencia.

export const URGENTE = 'urgent';
export const ESTANDAR = 'normal';

// Colores que sugiere el formulario para cada prioridad. Se cambian de la
// mano de la prioridad sólo si el color puesto es uno de estos dos (o no hay
// ninguno): un color elegido a mano por la oficina no se pisa.
export const COLOR_POR_PRIORIDAD = {
    [URGENTE]: '#ef4444',
    [ESTANDAR]: '#64748b',
};

/** Prioridad que le toca a una ficha por la base de datos en la que está. */
export function prioridadPorPertenencia(ownerAgencyId) {
    return ownerAgencyId ? ESTANDAR : URGENTE;
}

/**
 * Prioridad efectiva de una ficha: la grabada, y si no tiene ninguna, la que
 * le toca por pertenencia. Es lo que miran el optimizador y el listado.
 */
export function prioridadDeCliente(cliente) {
    if (!cliente) return URGENTE;
    if (cliente.priority === URGENTE || cliente.priority === ESTANDAR) return cliente.priority;
    return prioridadPorPertenencia(cliente.ownerAgencyId);
}

export function esUrgente(cliente) {
    return prioridadDeCliente(cliente) === URGENTE;
}

/**
 * Lo que cambia en el formulario al poner una prioridad: la prioridad y, si
 * el color era el sugerido de la otra, el color nuevo.
 */
export function cambiosAlPonerPrioridad(formData, prioridad) {
    const colorActual = formData?.color;
    const esColorSugerido = !colorActual || Object.values(COLOR_POR_PRIORIDAD).includes(colorActual);
    return esColorSugerido
        ? { priority: prioridad, color: COLOR_POR_PRIORIDAD[prioridad] }
        : { priority: prioridad };
}

/**
 * Lo que cambia en el formulario al mover la ficha de base de datos: la
 * pertenencia y la prioridad que le corresponde a la base nueva.
 */
export function cambiosAlCambiarDeBase(formData, ownerAgencyId) {
    return {
        ownerAgencyId: ownerAgencyId || null,
        ...cambiosAlPonerPrioridad(formData, prioridadPorPertenencia(ownerAgencyId)),
    };
}
