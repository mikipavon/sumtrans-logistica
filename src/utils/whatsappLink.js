/**
 * En el móvil del repartidor conviven DOS WhatsApp: el personal y el de la empresa
 * (WhatsApp Business). Un enlace wa.me normal no elige: lo resuelve el sistema, y
 * el justificante acaba saliendo desde el número personal. Cada móvil tiene su vía:
 *
 * · ANDROID (VIA_INTENT) — identifica cada app por su paquete, así que se puede pedir
 *   una concreta. Un enlace intent:// con package=com.whatsapp.w4b va directo a
 *   WhatsApp Business y, si NO está instalado, el navegador se va solo al
 *   S.browser_fallback_url, que es el wa.me de siempre y abre el WhatsApp normal.
 *   Primero el de trabajo y, si no lo hay, el personal, sin preguntar nada.
 *
 * · IPHONE (VIA_COMPARTIR) — las dos apps registran el mismo esquema whatsapp:// y
 *   iOS no deja apuntar a una: no hay enlace que valga. Lo que sí distingue las dos
 *   es la bandeja de compartir de Apple, donde salen como iconos separados. Se paga
 *   un precio: la bandeja lleva el texto, pero NO el número, así que el repartidor
 *   elige el contacto a mano.
 *
 * · RESTO (VIA_ENLACE) — ordenador y navegadores antiguos: el wa.me de siempre.
 */

export const PAQUETE_WHATSAPP_BUSINESS = 'com.whatsapp.w4b';

/** Milisegundos que esperamos antes de reintentar con el WhatsApp normal. */
export const ESPERA_RESERVA_MS = 2500;

export const VIA_INTENT = 'intent';
export const VIA_COMPARTIR = 'compartir';
export const VIA_ENLACE = 'enlace';

const esAndroid = (userAgent) => /android/i.test(String(userAgent || ''));

const esIOS = (navegador) => {
    const userAgent = String(navegador?.userAgent || '');
    if (/iphone|ipad|ipod/i.test(userAgent)) return true;
    // Un iPad con iPadOS 13+ se presenta como un Mac de escritorio. Lo delata que
    // tenga pantalla táctil, que un Mac de verdad no tiene.
    return /macintosh/i.test(userAgent) && Number(navegador?.maxTouchPoints || 0) > 1;
};

/** Por dónde va a salir el justificante en este móvil. */
export const viaDeEnvio = (navegador) => {
    if (esAndroid(navegador?.userAgent)) return VIA_INTENT;
    if (esIOS(navegador) && typeof navegador?.share === 'function') return VIA_COMPARTIR;
    return VIA_ENLACE;
};

/**
 * La bandeja de compartir de iOS exige que la abra el dedo del usuario: si entre el
 * toque y la llamada hay una espera larga (guardar en Supabase, por ejemplo), iOS la
 * rechaza. Quien llame tiene que preguntar esto ANTES de ponerse a esperar nada.
 */
export const necesitaGestoDelUsuario = (ventana = typeof window !== 'undefined' ? window : null) =>
    viaDeEnvio(ventana?.navigator) === VIA_COMPARTIR;

/**
 * Los dos enlaces del envío: el que se intenta primero y el de reserva.
 *
 * @returns {{url: string, alternativa: string, esIntent: boolean}}
 *   url          — a dónde navegar (intent:// de Business en Android, wa.me fuera).
 *   alternativa  — el wa.me de siempre, que abre el WhatsApp que haya.
 *   esIntent     — si `url` es el intent:// y por tanto puede necesitar la reserva.
 */
export const construirEnlaceWhatsApp = ({ telefono = '', mensaje = '', userAgent = '' } = {}) => {
    const numero = String(telefono || '').replace(/\D/g, '');
    const texto = encodeURIComponent(String(mensaje || ''));
    const alternativa = `https://wa.me/${numero}?text=${texto}`;

    if (!esAndroid(userAgent)) return { url: alternativa, alternativa, esIntent: false };

    // El '#' abre la parte Intent del enlace, así que el texto tiene que ir
    // codificado sí o sí (encodeURIComponent ya convierte '#' en %23).
    const consulta = numero ? `phone=${numero}&text=${texto}` : `text=${texto}`;
    const url = `intent://send?${consulta}#Intent;scheme=whatsapp;` +
        `package=${PAQUETE_WHATSAPP_BUSINESS};` +
        `S.browser_fallback_url=${encodeURIComponent(alternativa)};end`;

    return { url, alternativa, esIntent: true };
};

/**
 * Manda el justificante por el WhatsApp de trabajo.
 *
 * `ventana` y `documento` se inyectan para poder probarlo; en la app se usan
 * window y document.
 *
 * @returns {{via: string, url: string|null, alternativa: string}}
 */
export const abrirWhatsApp = ({
    telefono = '',
    mensaje = '',
    ventana = typeof window !== 'undefined' ? window : null,
    documento = typeof document !== 'undefined' ? document : null,
    esperaMs = ESPERA_RESERVA_MS,
} = {}) => {
    if (!ventana?.location) return null;

    const navegador = ventana.navigator;
    const via = viaDeEnvio(navegador);
    const { url, alternativa } = construirEnlaceWhatsApp({
        telefono,
        mensaje,
        userAgent: navegador?.userAgent,
    });

    // iPhone: bandeja de compartir. Ojo, esto NO descarga la página; se queda viva
    // por detrás, así que quien llame puede seguir guardando cosas después.
    if (via === VIA_COMPARTIR) {
        navegador.share({ text: String(mensaje || '') }).catch((error) => {
            // Que el repartidor cierre la bandeja no es un fallo: se quiso echar atrás.
            if (error?.name === 'AbortError') return;
            // Cualquier otra cosa (lo típico: iOS no se cree que lo haya pedido el
            // dedo del usuario) sí lo es, y ahí tiramos del enlace de siempre.
            ventana.location.assign(alternativa);
        });
        return { via, url: null, alternativa };
    }

    ventana.location.assign(url);

    // Red de seguridad para los navegadores de Android que no entienden intent://
    // (ahí no hay fallback y la página se quedaría quieta, sin abrir nada).
    // Solo reintentamos si nadie ha salido de la pestaña: si WhatsApp llegó a
    // abrirse, la página se ocultó y no queremos abrir un segundo chat encima.
    if (via === VIA_INTENT) {
        let salioDeLaPagina = false;
        const anotarSalida = () => {
            if (documento?.visibilityState === 'hidden') salioDeLaPagina = true;
        };
        documento?.addEventListener?.('visibilitychange', anotarSalida);

        const reintentar = () => {
            documento?.removeEventListener?.('visibilitychange', anotarSalida);
            if (salioDeLaPagina || documento?.visibilityState === 'hidden') return;
            ventana.location.assign(alternativa);
        };

        if (typeof ventana.setTimeout === 'function') ventana.setTimeout(reintentar, esperaMs);
    }

    return { via, url, alternativa };
};
