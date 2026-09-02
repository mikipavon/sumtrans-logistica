// ── Qué contraseña se admite, y cómo se le dice a quien la está escribiendo ──
//
// El problema que resuelve esto: había clientes que se registraban por la web,
// recibían su "solicitud recibida", se les aprobaba... y no podían entrar. Su
// contraseña no había llegado a crear ninguna cuenta —Supabase la rechazaba por
// corta o por estar en las listas de contraseñas filtradas— y eso sólo quedaba
// apuntado en el registro del servidor. Nadie se enteraba hasta que el cliente
// llamaba diciendo que no entraba.
//
// La regla es sencilla: si una contraseña no vale, hay que decirlo EN EL
// MOMENTO de escribirla, junto a la casilla, y no dejar seguir.
//
// ⚠️ Estas mismas reglas están repetidas en
// supabase/functions/registro-cliente/index.ts, porque una función de Deno no
// puede importar de aquí. Si se cambian en un sitio, hay que cambiarlas en el
// otro. La comprobación del servidor es la que manda: la del navegador se puede
// saltar, y ese endpoint es público.

export const MINIMO_CARACTERES = 8;

// Para enseñarlas debajo de la casilla ANTES de que escriba nada, que es lo que
// evita la mitad de los rechazos.
export const CONDICIONES = [
    `Al menos ${MINIMO_CARACTERES} caracteres`,
    'Alguna letra y algún número',
    'Que no sea una palabra suelta ni una serie de números (1234, 0000…)',
];

/**
 * Devuelve el motivo por el que la contraseña NO vale, o null si vale.
 *
 * Es lo que se enseña en rojo junto a la casilla, así que cada motivo dice qué
 * hay que hacer, no sólo qué está mal.
 */
export function loQueLeFaltaALaContrasena(password) {
    const p = String(password || '');

    if (p.length < MINIMO_CARACTERES) {
        return `La contraseña debe tener al menos ${MINIMO_CARACTERES} caracteres.`;
    }
    if (!/[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(p)) {
        return 'La contraseña debe llevar alguna letra.';
    }
    if (!/[0-9]/.test(p)) {
        return 'La contraseña debe llevar algún número.';
    }
    if (/^(.)\1+$/.test(p)) {
        return 'La contraseña no puede ser el mismo carácter repetido.';
    }
    if (/^[0-9]+$/.test(p)) {
        return 'La contraseña no puede ser sólo números: añade alguna letra.';
    }

    return null;
}

/** Atajo para habilitar o deshabilitar el botón de enviar. */
export const contrasenaValida = (password) => loQueLeFaltaALaContrasena(password) === null;

/**
 * Traduce al castellano lo que responde Supabase Auth, que contesta en inglés.
 *
 * Hay una comprobación que sólo puede hacer el servidor: la de las listas de
 * contraseñas filtradas. Una contraseña puede cumplir todas las reglas de arriba
 * y aun así ser rechazada por conocida (`Password2024` lo es). Por eso el aviso
 * del servidor también tiene que llegar entendible hasta la pantalla.
 */
export function explicarFalloDeAuth(mensaje) {
    const m = String(mensaje || '').toLowerCase();

    if (m.includes('weak') || m.includes('pwned') || m.includes('easy to guess')) {
        return 'Esa contraseña es demasiado conocida: aparece en listas de contraseñas filtradas en internet. Elige otra que no sea una palabra suelta ni una serie de números.';
    }
    if (m.includes('at least') || m.includes('length')) {
        return `La contraseña es demasiado corta: necesita al menos ${MINIMO_CARACTERES} caracteres.`;
    }
    if (m.includes('same as the old') || m.includes('should be different')) {
        return 'Esa es la contraseña que ya tenías. Escribe una distinta.';
    }
    if (m.includes('expired') || m.includes('invalid') || m.includes('token')) {
        return 'El enlace ha caducado o ya se ha usado. Pide otro desde la pantalla de entrada.';
    }
    return 'No se ha podido cambiar la contraseña. Prueba con otra distinta.';
}
