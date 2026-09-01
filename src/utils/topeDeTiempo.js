/**
 * Tope de tiempo para las llamadas al servidor.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────────
 * Las promesas de Supabase no se rinden solas. El 1 de septiembre de 2026 la base de
 * datos se quedó sin memoria y dejó de contestar: no devolvía error, simplemente no
 * respondía. La promesa del login no se resolvió NUNCA, así que el botón se quedó en
 * "Comprobando..." para siempre. El repartidor sólo veía que no entraba, y en la
 * oficina se estuvo media hora pensando que era su contraseña.
 *
 * Con tope, a los pocos segundos se le puede decir a la persona lo que pasa de verdad.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────────────
 * No cancela la petición: eso no se puede desde aquí. Sólo deja de esperarla. Si el
 * servidor contesta más tarde, la respuesta se tira. Lo que se gana no es ahorrarle
 * trabajo al servidor, es poder avisar a quien está mirando la pantalla.
 */

export const MENSAJE_SIN_RESPUESTA =
    'El servidor no responde. No es tu contraseña: inténtalo dentro de unos minutos.';

/**
 * El fallo de "no contesta nadie", marcado para poder distinguirlo de un error
 * normal. Quien lo reciba NO debe reintentar por otro camino: si el servidor no
 * responde, el camino alternativo tampoco va a responder.
 */
export const errorDeConexion = (mensaje = MENSAJE_SIN_RESPUESTA) =>
    Object.assign(new Error(mensaje), { esFalloDeConexion: true });

/**
 * Espera a `promesa` como mucho `segundos`. Si tarda más, falla con `errorDeConexion`.
 * Los fallos propios de la promesa pasan tal cual, sin disfrazarse de fallo de red.
 */
export const conTopeDeTiempo = (promesa, segundos) => {
    let temporizador;
    return Promise.race([
        promesa,
        new Promise((_, rechazar) => {
            temporizador = setTimeout(() => rechazar(errorDeConexion()), segundos * 1000);
        })
    ]).finally(() => clearTimeout(temporizador));
};
