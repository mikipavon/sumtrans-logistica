import { describe, it, expect, vi } from 'vitest';
import {
    construirEnlaceWhatsApp,
    abrirWhatsApp,
    viaDeEnvio,
    necesitaGestoDelUsuario,
    PAQUETE_WHATSAPP_BUSINESS,
    VIA_INTENT,
    VIA_COMPARTIR,
    VIA_ENLACE,
} from './whatsappLink';

const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-A536B) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36';
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const IPAD = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
const ESCRITORIO = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';

describe('construirEnlaceWhatsApp', () => {
    it('en Android pide primero WhatsApp Business', () => {
        const { url, esIntent } = construirEnlaceWhatsApp({
            telefono: '34600112233', mensaje: 'Hola', userAgent: ANDROID,
        });
        expect(esIntent).toBe(true);
        expect(url.startsWith('intent://send?phone=34600112233&text=Hola#Intent;')).toBe(true);
        expect(url).toContain(`package=${PAQUETE_WHATSAPP_BUSINESS};`);
        expect(url.endsWith(';end')).toBe(true);
    });

    it('deja preparado el wa.me de siempre por si no hay WhatsApp Business', () => {
        const { url, alternativa } = construirEnlaceWhatsApp({
            telefono: '34600112233', mensaje: 'Hola', userAgent: ANDROID,
        });
        expect(alternativa).toBe('https://wa.me/34600112233?text=Hola');
        expect(url).toContain(`S.browser_fallback_url=${encodeURIComponent(alternativa)};`);
    });

    it('en iPhone y en el ordenador manda el wa.me de siempre', () => {
        for (const userAgent of [IPHONE, ESCRITORIO, '']) {
            const { url, alternativa, esIntent } = construirEnlaceWhatsApp({
                telefono: '34600112233', mensaje: 'Hola', userAgent,
            });
            expect(esIntent).toBe(false);
            expect(url).toBe('https://wa.me/34600112233?text=Hola');
            expect(url).toBe(alternativa);
        }
    });

    it('el mensaje va codificado: los saltos de línea llegan como saltos de línea', () => {
        const mensaje = '*JUSTIFICANTE*\nPrecio: 12,00 € + IVA\nRef #SUM-1';
        const { url, alternativa } = construirEnlaceWhatsApp({ telefono: '34600112233', mensaje, userAgent: ANDROID });
        // El '#' del texto no puede cortar la parte Intent del enlace
        expect(url.split('#').length).toBe(2);
        const [envio] = url.split('#');
        expect(decodeURIComponent(envio.split('&text=')[1])).toBe(mensaje);
        expect(envio).not.toContain('%250A');   // nada de doble codificación
        expect(decodeURIComponent(alternativa.split('?text=')[1])).toBe(mensaje);
    });

    it('limpia el teléfono de espacios, guiones y prefijos escritos a mano', () => {
        const { alternativa } = construirEnlaceWhatsApp({ telefono: '+34 600-11 22 33', mensaje: 'x', userAgent: IPHONE });
        expect(alternativa).toBe('https://wa.me/34600112233?text=x');
    });

    it('sin teléfono deja que el usuario elija el contacto', () => {
        const sinMovil = construirEnlaceWhatsApp({ mensaje: 'Hola', userAgent: ANDROID });
        expect(sinMovil.url).toContain('intent://send?text=Hola#Intent;');
        expect(sinMovil.url).not.toContain('phone=');
        expect(sinMovil.alternativa).toBe('https://wa.me/?text=Hola');
    });
});

const ventanaFalsa = (userAgent, navegador = {}) => {
    const visitadas = [];
    const temporizadores = [];
    return {
        visitadas,
        dispararTemporizadores: () => temporizadores.splice(0).forEach(fn => fn()),
        navigator: { userAgent, ...navegador },
        location: { assign: (url) => visitadas.push(url) },
        setTimeout: (fn) => temporizadores.push(fn),
    };
};

/** Un iPhone con bandeja de compartir; `resultado` decide si el usuario comparte o no. */
const iphoneConBandeja = (resultado = Promise.resolve()) => {
    const share = vi.fn(() => resultado);
    return { ventana: ventanaFalsa(IPHONE, { share }), share };
};

const cancelado = () => Object.assign(new Error('cancelado'), { name: 'AbortError' });

const documentoFalso = (visibilityState = 'visible') => {
    const oyentes = [];
    return {
        get visibilityState() { return this._estado; },
        _estado: visibilityState,
        ocultar() { this._estado = 'hidden'; oyentes.forEach(fn => fn()); },
        addEventListener: (_evento, fn) => oyentes.push(fn),
        removeEventListener: (_evento, fn) => {
            const i = oyentes.indexOf(fn);
            if (i >= 0) oyentes.splice(i, 1);
        },
    };
};

describe('abrirWhatsApp', () => {
    it('en Android navega al enlace de WhatsApp Business', () => {
        const ventana = ventanaFalsa(ANDROID);
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento: documentoFalso() });
        expect(ventana.visitadas[0]).toContain(PAQUETE_WHATSAPP_BUSINESS);
    });

    it('si WhatsApp llegó a abrirse (la página se ocultó) no abre un segundo chat', () => {
        const ventana = ventanaFalsa(ANDROID);
        const documento = documentoFalso();
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento });
        documento.ocultar();
        ventana.dispararTemporizadores();
        expect(ventana.visitadas).toHaveLength(1);
    });

    it('si no pasó nada y seguimos en la página, reintenta con el WhatsApp normal', () => {
        const ventana = ventanaFalsa(ANDROID);
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento: documentoFalso() });
        ventana.dispararTemporizadores();
        expect(ventana.visitadas).toHaveLength(2);
        expect(ventana.visitadas[1]).toBe('https://wa.me/34600112233?text=Hola');
    });

    it('en un iPhone antiguo, sin bandeja de compartir, va al wa.me y no programa reintento', () => {
        const ventana = ventanaFalsa(IPHONE);
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento: documentoFalso() });
        ventana.dispararTemporizadores();
        expect(ventana.visitadas).toEqual(['https://wa.me/34600112233?text=Hola']);
    });
});

describe('viaDeEnvio', () => {
    it('Android va por el intent de WhatsApp Business', () => {
        expect(viaDeEnvio({ userAgent: ANDROID, share: () => {} })).toBe(VIA_INTENT);
    });

    it('el iPhone va por la bandeja de compartir', () => {
        expect(viaDeEnvio({ userAgent: IPHONE, share: () => {} })).toBe(VIA_COMPARTIR);
    });

    it('el iPad se hace pasar por Mac, pero lo delata la pantalla táctil', () => {
        expect(viaDeEnvio({ userAgent: IPAD, maxTouchPoints: 5, share: () => {} })).toBe(VIA_COMPARTIR);
        // Un Mac de verdad no es táctil: ahí manda el enlace, que abre WhatsApp Web.
        expect(viaDeEnvio({ userAgent: IPAD, maxTouchPoints: 0, share: () => {} })).toBe(VIA_ENLACE);
    });

    it('el ordenador y los iPhone sin bandeja se quedan con el enlace', () => {
        expect(viaDeEnvio({ userAgent: ESCRITORIO, share: () => {} })).toBe(VIA_ENLACE);
        expect(viaDeEnvio({ userAgent: IPHONE })).toBe(VIA_ENLACE);
        expect(viaDeEnvio(undefined)).toBe(VIA_ENLACE);
    });

    it('necesitaGestoDelUsuario solo es cierto donde sale la bandeja', () => {
        expect(necesitaGestoDelUsuario(iphoneConBandeja().ventana)).toBe(true);
        expect(necesitaGestoDelUsuario(ventanaFalsa(ANDROID, { share: () => {} }))).toBe(false);
        expect(necesitaGestoDelUsuario(undefined)).toBe(false);
    });
});

describe('abrirWhatsApp en iPhone', () => {
    it('abre la bandeja de compartir con el texto del justificante, sin navegar fuera', () => {
        const { ventana, share } = iphoneConBandeja();
        const mensaje = '*JUSTIFICANTE*\nRef: SUM-1';
        const resultado = abrirWhatsApp({ telefono: '34600112233', mensaje, ventana, documento: documentoFalso() });

        expect(share).toHaveBeenCalledWith({ text: mensaje });
        expect(resultado.via).toBe(VIA_COMPARTIR);
        expect(ventana.visitadas).toEqual([]);   // la página sigue viva: se puede guardar detrás
    });

    it('si el repartidor cierra la bandeja no se abre nada por su cuenta', async () => {
        const { ventana } = iphoneConBandeja(Promise.reject(cancelado()));
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento: documentoFalso() });
        await Promise.resolve();
        await Promise.resolve();
        expect(ventana.visitadas).toEqual([]);
    });

    it('si iOS rechaza la bandeja (gesto caducado), cae al wa.me de siempre', async () => {
        const error = Object.assign(new Error('no permitido'), { name: 'NotAllowedError' });
        const { ventana } = iphoneConBandeja(Promise.reject(error));
        abrirWhatsApp({ telefono: '34600112233', mensaje: 'Hola', ventana, documento: documentoFalso() });
        await Promise.resolve();
        await Promise.resolve();
        expect(ventana.visitadas).toEqual(['https://wa.me/34600112233?text=Hola']);
    });
});
