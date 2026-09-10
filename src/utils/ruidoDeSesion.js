/**
 * Ruido del cerrojo de sesión de Supabase.
 *
 * ── Por qué ───────────────────────────────────────────────────────────────────────
 * Supabase renueva la sesión sola cada pocos segundos. Para no pisarse a sí misma
 * echa un cerrojo del navegador (Web Locks). Si la app está abierta dos veces en el
 * mismo móvil — desde el icono del escritorio y desde una pestaña de Chrome, por
 * ejemplo — una le arranca el cerrojo a la otra y la que lo pierde suelta un error.
 *
 * Ese error es inofensivo: la sesión sigue valiendo y la app funciona igual. Pero lo
 * suelta un temporizador de fondo que nadie vigila, así que aterriza en el manejador
 * global de `main.jsx`, que hasta ahora borraba la pantalla y pintaba el aviso rojo
 * de "Error Crítico". Al repartidor se le quedaba la app muerta a mitad de ruta por
 * algo que no era ningún fallo.
 *
 * Aquí se reconoce ese ruido para poder ignorarlo: ni pantalla roja, ni apunte en
 * `error_logs` (se repite cada medio minuto y lo inundaría).
 */

/** Trozos de texto que sólo aparecen en los fallos del cerrojo de sesión. */
const SENALES = [
    "with the 'steal' option",
    'lock was released because another request stole it',
    'navigatorlockacquiretimeouterror',
    'acquiring an exclusive navigator lockmanager lock',
    'lock:sb-'
];

/**
 * ¿Este fallo es sólo el forcejeo por el cerrojo de sesión?
 *
 * @param {any} motivo El error (o su mensaje) que ha llegado sin recoger.
 * @returns {boolean} true si se puede ignorar sin más.
 */
export const esRuidoDeSesion = (motivo) => {
    if (!motivo) return false;

    if (motivo.isAcquireTimeout === true) return true;
    if (motivo.name === 'NavigatorLockAcquireTimeoutError') return true;

    const texto = `${motivo.name || ''} ${motivo.message || ''} ${typeof motivo === 'string' ? motivo : ''}`.toLowerCase();
    if (!texto.trim()) return false;

    return SENALES.some((senal) => texto.includes(senal));
};
