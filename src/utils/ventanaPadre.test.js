// ── Cuándo NO vale la sesión guardada en el navegador ──
//
// El 10/09/2026 un cliente vio los albaranes de otra empresa: la web padre
// mandó unas credenciales, en localStorage estaba la sesión del cliente
// anterior y ganó la guardada. hayAutoLoginPendiente es lo que corta eso, así
// que su respuesta decide qué portal se pinta.

import { describe, it, expect, afterEach } from 'vitest';
import { hayAutoLoginPendiente, esOrigenPadrePermitido } from './ventanaPadre';

// jsdom no deja cambiar window.parent asignándolo: hay que redefinir la
// propiedad. Estar embebidos es justo eso, que parent no sea uno mismo.
const fingirEmbebido = () => {
    Object.defineProperty(window, 'parent', { value: { postMessage() {} }, configurable: true });
};

const fingirVentanaSuelta = () => {
    Object.defineProperty(window, 'parent', { value: window, configurable: true });
};

afterEach(() => {
    // Los ficheros comparten entorno (ver vitest.config.js): esto se devuelve
    // como estaba o el siguiente se cree embebido.
    fingirVentanaSuelta();
    window.history.replaceState({}, '', '/');
});

describe('hayAutoLoginPendiente', () => {
    it('dentro de un iframe sí: quien entra lo dice la web, no lo guardado', () => {
        fingirEmbebido();
        expect(hayAutoLoginPendiente()).toBe(true);
    });

    it('con las credenciales en la URL también, aunque no haya iframe', () => {
        fingirVentanaSuelta();
        window.history.replaceState({}, '', '/?autoLogin=true&username=x&password=y');
        expect(hayAutoLoginPendiente()).toBe(true);
    });

    it('en una ventana normal no: ahí la sesión guardada es la de quien está delante', () => {
        fingirVentanaSuelta();
        expect(hayAutoLoginPendiente()).toBe(false);
    });

    it('un ?tab= suelto no es un auto-login', () => {
        // El portal se abre así a mano para probar. Si esto contara, al
        // repartidor y a la oficina se les cerraría la sesión al recargar.
        fingirVentanaSuelta();
        window.history.replaceState({}, '', '/?tab=client');
        expect(hayAutoLoginPendiente()).toBe(false);
    });
});

describe('esOrigenPadrePermitido', () => {
    it('deja hablar a sumtransportes.com y a nadie más', () => {
        expect(esOrigenPadrePermitido('https://www.sumtransportes.com')).toBe(true);
        expect(esOrigenPadrePermitido('https://sumtransportes.com')).toBe(true);
        expect(esOrigenPadrePermitido('https://sumtransportes.com.otra.cosa')).toBe(false);
        expect(esOrigenPadrePermitido('http://www.sumtransportes.com')).toBe(false);
    });
});
