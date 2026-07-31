/**
 * Registro de errores de producción.
 *
 * ── Por qué ───────────────────────────────────────────────────────────────────────
 * Cuando a un repartidor se le queda la app en blanco a mitad de ruta, en la oficina
 * no queda absolutamente nada: ni el error, ni en qué pantalla estaba, ni con qué
 * móvil. Solo la llamada de teléfono. Esto deja constancia en la tabla `error_logs`
 * para poder mirarlo después.
 *
 * ── Reglas de la casa ─────────────────────────────────────────────────────────────
 * 1. Nunca estorbar. Si el registro falla, se traga el fallo: un error registrando
 *    errores no puede tumbar la app ni disparar otro registro en cadena.
 * 2. Nunca inundar. Un error dentro de un bucle de render se dispara cientos de veces
 *    por segundo; se deduplica y se pone un tope por sesión.
 * 3. Nunca guardar de más. Aquí no entran datos de clientes: mensaje, pila, pantalla
 *    y quién lo sufrió, y nada más.
 */

import { supabase } from '../lib/supabase';

/** Tope de errores distintos que una sesión puede llegar a registrar. */
export const MAX_POR_SESION = 25;

/** Un mismo error no se vuelve a registrar dentro de esta ventana. */
export const VENTANA_REPETIDOS_MS = 60_000;

// Quién está usando la app. Lo rellena App.jsx en cuanto sabe el rol.
let contexto = { role: null, driverId: null, driverName: null };

// Huella del error -> momento en que se registró por última vez.
const vistos = new Map();
let registrados = 0;

export const establecerContextoDeError = (nuevo = {}) => {
    contexto = { ...contexto, ...nuevo };
};

/** Solo para los tests: devuelve el módulo a su estado inicial. */
export const _reiniciarRegistro = () => {
    vistos.clear();
    registrados = 0;
    contexto = { role: null, driverId: null, driverName: null };
};

/**
 * Los mensajes de error llevan dentro rutas de ficheros con hash, ids y horas, así
 * que dos apariciones del mismo fallo nunca son idénticas carácter a carácter. La
 * huella se queda con lo estable: el mensaje y la primera línea de la pila.
 */
export const huellaDeError = (mensaje, pila) => {
    const primeraLinea = String(pila || '').split('\n')[1] || '';
    return `${String(mensaje || '').slice(0, 200)}::${primeraLinea.trim().slice(0, 200)}`;
};

/**
 * ¿Toca registrar este error, o es ruido repetido?
 * Función aparte y pura-ish para poder probar el antiinundación sin tocar la red.
 */
export const debeRegistrarse = (huella, ahora = Date.now()) => {
    if (registrados >= MAX_POR_SESION) return false;

    const ultimaVez = vistos.get(huella);
    if (ultimaVez !== undefined && ahora - ultimaVez < VENTANA_REPETIDOS_MS) return false;

    vistos.set(huella, ahora);
    registrados++;
    return true;
};

/**
 * Deja constancia de un error. No lanza nunca y no hay que esperarla.
 *
 * @param {Error|string} error   El error, o su mensaje.
 * @param {object} datos         `origen` (de dónde viene) y `componentStack` si lo hay.
 */
export const registrarError = async (error, datos = {}) => {
    try {
        const mensaje = error?.message || String(error || 'Error sin mensaje');
        const pila = error?.stack || '';

        if (!debeRegistrarse(huellaDeError(mensaje, pila))) return;

        // Sin conexión no se intenta: el error ya se ha visto en pantalla y no merece
        // la pena guardarlo en cola: lo que importa es que no se pierdan los envíos.
        if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

        await supabase.from('error_logs').insert({
            mensaje: mensaje.slice(0, 2000),
            pila: pila.slice(0, 8000),
            component_stack: String(datos.componentStack || '').slice(0, 4000) || null,
            origen: datos.origen || 'desconocido',
            pantalla: typeof window !== 'undefined' ? window.location.pathname : null,
            rol: contexto.role,
            driver_id: contexto.driverId != null ? String(contexto.driverId) : null,
            driver_name: contexto.driverName,
            user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent).slice(0, 500) : null,
            app_version: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'
        });
    } catch (e) {
        // A propósito: si no se puede registrar el error, no pasa nada más.
        console.warn('[errorLog] No se pudo registrar el error:', e?.message || e);
    }
};

/**
 * Engancha los errores que no atrapa ningún ErrorBoundary: los de fuera de React
 * (callbacks, temporizadores) y las promesas sin catch.
 *
 * Respeta los manejadores que ya hubiera puestos, en vez de sustituirlos: en
 * `main.jsx` son los que pintan la pantalla roja de error crítico.
 */
export const engancharErroresGlobales = () => {
    if (typeof window === 'undefined') return;

    const onErrorPrevio = window.onerror;
    window.onerror = (mensaje, fuente, linea, columna, error) => {
        registrarError(error || mensaje, { origen: `window.onerror (${fuente}:${linea}:${columna})` });
        return onErrorPrevio ? onErrorPrevio(mensaje, fuente, linea, columna, error) : false;
    };

    const onRechazoPrevio = window.onunhandledrejection;
    window.onunhandledrejection = (evento) => {
        registrarError(evento?.reason, { origen: 'promesa sin catch' });
        if (onRechazoPrevio) onRechazoPrevio(evento);
    };
};
