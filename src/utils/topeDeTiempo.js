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

export const MENSAJE_DEMASIADOS_INTENTOS =
    'Demasiados intentos seguidos. Espera un minuto y vuelve a probar: no es tu contraseña.';

/**
 * ¿Este fallo es del servidor, o es que la contraseña está mal?
 *
 * El tope de arriba sólo cubre al servidor que NO contesta. El 2 de septiembre pasó lo
 * contrario: mientras la base de datos se reiniciaba, Cloudflare contestaba al instante
 * con su página de error (521). Supabase devolvía eso como un fallo del login, la app lo
 * daba por contraseña mala y al repartidor le salía "Usuario o contraseña incorrectos"
 * con la contraseña bien puesta — justo el enredo que se quiso quitar el día anterior.
 *
 * La regla, mirando el código de respuesta:
 *   • 429            → ha contestado, pero para decir "vas muy deprisa". No es la contraseña.
 *   • 500 o más      → el servidor se ha caído por dentro.
 *   • 400, 401, 406… → ha contestado y ha dicho que no. ESO sí es cosa de las credenciales.
 *   • 0 o ninguno    → no ha llegado a haber respuesta: la petición se perdió, o lo que
 *                      volvió no era ni JSON (la página HTML de Cloudflare cae aquí).
 *
 * `estadoHttp` va aparte porque las consultas a tablas dejan el código en la respuesta
 * (`{ error, status }`) y no dentro del error; las de Auth sí lo traen dentro.
 *
 * Devuelve un error ya marcado como fallo de conexión (listo para lanzar), o `null` si
 * el servidor ha hecho su trabajo y la respuesta hay que creérsela.
 */
export const errorDeServidorSiLoEs = (error, estadoHttp) => {
    if (!error) return null;
    if (error.esFalloDeConexion) return error;

    const estado = Number(estadoHttp ?? error.status);

    if (estado === 429) return errorDeConexion(MENSAJE_DEMASIADOS_INTENTOS);
    if (estado >= 500) return errorDeConexion();
    if (estado > 0) return null;

    return errorDeConexion();
};
