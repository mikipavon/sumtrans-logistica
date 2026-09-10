// ── Que un servidor caído no se disfrace de contraseña mala ──
//
// El portal del cliente vive dentro de un iframe en sumtransportes.com: la web
// le pasa las credenciales y él intenta entrar solo. Mientras esa pantalla está
// tapada, lo único que el cliente llega a leer es lo que la web enseñe con el
// aviso SUM_CLIENT_LOGIN_FAILED — así que ese aviso tiene que llevar el motivo.
//
// Hasta el 10/09/2026 no lo llevaba, y además el bucle de reintentos se tragaba
// los fallos de conexión: la base de datos sin contestar gastaba los ocho
// intentos y terminaba igual que una contraseña mal escrita. El cliente se
// ponía a cambiar una contraseña que estaba bien.

import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Login from './Login';
import { mensajeDeCredenciales } from '../utils/mensajesDeLogin';
import { errorDeConexion, MENSAJE_SIN_RESPUESTA, MENSAJE_DEMASIADOS_INTENTOS } from '../utils/topeDeTiempo';

// La web padre de verdad no está: se finge estar embebidos para poder mirar
// qué se le manda, que es justo lo que arregla este cambio.
const avisarAlPadre = vi.fn();
vi.mock('../utils/ventanaPadre', () => ({
    avisarAlPadre: (...args) => avisarAlPadre(...args),
    esOrigenPadrePermitido: () => true,
    estamosEmbebidos: () => true,
}));

const INTENTOS = 8;

// Las credenciales entran por la barra de direcciones, que es el canal viejo
// pero el que se puede montar en un test sin un iframe de verdad.
const arrancarConAutoLogin = async (onLogin, onCerrarSesionPrevia) => {
    window.history.replaceState({}, '', '/?autoLogin=true&username=cliente@empresa.com&password=secreta&tab=client');
    render(<Login onLogin={onLogin} onCerrarSesionPrevia={onCerrarSesionPrevia} />);
    // Los 100 ms del arranque + los 300 antes del primer intento.
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
};

// Los 800 ms de espera entre reintentos, con holgura para agotarlos todos.
const agotarLosReintentos = async () => {
    await act(async () => { await vi.advanceTimersByTimeAsync(INTENTOS * 1000); });
};

const avisoDeFallo = () =>
    avisarAlPadre.mock.calls.map(([m]) => m).find(m => m?.type === 'SUM_CLIENT_LOGIN_FAILED');

beforeEach(() => {
    vi.useFakeTimers();
    avisarAlPadre.mockClear();
    localStorage.clear();
});

afterEach(() => {
    vi.useRealTimers();
    // Los ficheros de test comparten entorno (ver vitest.config.js), así que la
    // barra de direcciones que se ha trucado aquí arriba tiene que quedar como
    // estaba: si no, el siguiente fichero arranca con un ?autoLogin= puesto.
    window.history.replaceState({}, '', '/');
});

describe('auto-login del portal de clientes', () => {
    it('cuando el servidor no contesta lo dice, en vez de culpar a la contraseña', async () => {
        const onLogin = vi.fn().mockRejectedValue(errorDeConexion());

        await arrancarConAutoLogin(onLogin);
        await agotarLosReintentos();

        const aviso = avisoDeFallo();
        expect(aviso).toBeDefined();
        expect(aviso.motivo).toBe('servidor');
        expect(aviso.mensaje).toBe(MENSAJE_SIN_RESPUESTA);
        // Lo importante no es el texto exacto, es que NO sea el otro.
        expect(aviso.mensaje).not.toBe(mensajeDeCredenciales('client'));
    });

    it('un 429 llega como "demasiados intentos", que tampoco es la contraseña', async () => {
        const onLogin = vi.fn().mockRejectedValue(errorDeConexion(MENSAJE_DEMASIADOS_INTENTOS));

        await arrancarConAutoLogin(onLogin);
        await agotarLosReintentos();

        expect(avisoDeFallo().mensaje).toBe(MENSAJE_DEMASIADOS_INTENTOS);
    });

    it('reintenta mientras el servidor no contesta: la base de datos despertando no echa a nadie', async () => {
        const onLogin = vi.fn()
            .mockRejectedValueOnce(errorDeConexion())
            .mockRejectedValueOnce(errorDeConexion())
            .mockResolvedValue(true);

        await arrancarConAutoLogin(onLogin);
        await agotarLosReintentos();

        expect(onLogin).toHaveBeenCalledTimes(3);
        expect(avisoDeFallo()).toBeUndefined();
    });

    it('si Auth rechaza las credenciales se para en el primer intento', async () => {
        // Repetir ocho veces una contraseña que ya se ha rechazado no cambia la
        // respuesta y se gana un 429, que encima taparía el motivo real.
        const onLogin = vi.fn().mockResolvedValue(false);

        await arrancarConAutoLogin(onLogin);
        await agotarLosReintentos();

        expect(onLogin).toHaveBeenCalledTimes(1);
        const aviso = avisoDeFallo();
        expect(aviso.motivo).toBe('credenciales');
        expect(aviso.mensaje).toBe('Credenciales inválidas');
    });
});

// ── La sesión del cliente anterior no puede sobrevivir al intento ──
//
// El 10/09/2026: la web mandó las credenciales de TIPECAM, en el navegador
// estaba la sesión de AGRO INDUSTRIAS VELASCO y el portal enseñó los albaranes
// de AGRO mientras la web avisaba de que el acceso había fallado.
describe('auto-login y la sesión que ya había', () => {
    it('cierra la sesión anterior antes de probar las credenciales', async () => {
        const orden = [];
        const cerrar = vi.fn(() => { orden.push('cerrar'); });
        const onLogin = vi.fn(() => { orden.push('login'); return Promise.resolve(true); });

        await arrancarConAutoLogin(onLogin, cerrar);

        expect(orden).toEqual(['cerrar', 'login']);
    });

    it('espera a que termine el cierre: no se prueba con la sesión vieja todavía puesta', async () => {
        const orden = [];
        let soltarElCierre;
        const cerrar = vi.fn(() => new Promise(resolver => {
            soltarElCierre = () => { orden.push('cerrada'); resolver(); };
        }));
        const onLogin = vi.fn(() => { orden.push('login'); return Promise.resolve(true); });

        await arrancarConAutoLogin(onLogin, cerrar);

        // El cierre sigue colgado, así que no puede haberse intentado entrar.
        expect(cerrar).toHaveBeenCalled();
        expect(onLogin).not.toHaveBeenCalled();

        await act(async () => { soltarElCierre(); await vi.advanceTimersByTimeAsync(0); });
        expect(orden).toEqual(['cerrada', 'login']);
    });

    it('también se cierra cuando las credenciales van a fallar, que es cuando importa', async () => {
        const cerrar = vi.fn();
        const onLogin = vi.fn().mockResolvedValue(false);

        await arrancarConAutoLogin(onLogin, cerrar);

        expect(cerrar).toHaveBeenCalledTimes(1);
        expect(avisoDeFallo().motivo).toBe('credenciales');
    });

    it('sin quien cierre la sesión no revienta: el portal directo no pasa ese aviso', async () => {
        const onLogin = vi.fn().mockResolvedValue(true);

        await arrancarConAutoLogin(onLogin, undefined);

        expect(onLogin).toHaveBeenCalledTimes(1);
    });
});

describe('mensajeDeCredenciales', () => {
    it('le habla a cada uno como entra', () => {
        expect(mensajeDeCredenciales('driver')).toBe('Usuario o contraseña incorrectos');
        expect(mensajeDeCredenciales('client')).toBe('Credenciales inválidas');
        expect(mensajeDeCredenciales('admin')).toBe('Credenciales inválidas');
    });
});
