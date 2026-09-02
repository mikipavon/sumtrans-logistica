import { describe, it, expect } from 'vitest';
import {
    conTopeDeTiempo,
    errorDeConexion,
    errorDeServidorSiLoEs,
    MENSAJE_SIN_RESPUESTA,
    MENSAJE_DEMASIADOS_INTENTOS,
} from './topeDeTiempo';

const alCabo = (ms, valor) => new Promise(resolver => setTimeout(() => resolver(valor), ms));

describe('conTopeDeTiempo', () => {
    it('devuelve la respuesta cuando llega a tiempo', async () => {
        await expect(conTopeDeTiempo(alCabo(10, 'entrado'), 0.5)).resolves.toBe('entrado');
    });

    it('se rinde cuando el servidor tarda de más', async () => {
        await expect(conTopeDeTiempo(alCabo(200, 'tarde'), 0.05)).rejects.toMatchObject({
            esFalloDeConexion: true,
            message: MENSAJE_SIN_RESPUESTA,
        });
    });

    it('se rinde con la promesa que no termina nunca — el caso del 1 de septiembre', async () => {
        const nuncaContesta = new Promise(() => {});
        await expect(conTopeDeTiempo(nuncaContesta, 0.05)).rejects.toMatchObject({
            esFalloDeConexion: true,
        });
    });

    it('un fallo de verdad pasa tal cual, sin disfrazarse de fallo de red', async () => {
        const contraseñaMal = Promise.reject(new Error('Invalid login credentials'));
        await expect(conTopeDeTiempo(contraseñaMal, 0.5)).rejects.toMatchObject({
            message: 'Invalid login credentials',
        });
        await expect(conTopeDeTiempo(Promise.reject(new Error('x')), 0.5)).rejects.not.toHaveProperty(
            'esFalloDeConexion'
        );
    });
});

describe('errorDeConexion', () => {
    it('va marcado para que nadie reintente por otro camino', () => {
        expect(errorDeConexion().esFalloDeConexion).toBe(true);
    });

    it('admite un mensaje propio', () => {
        expect(errorDeConexion('otra cosa').message).toBe('otra cosa');
    });
});

describe('errorDeServidorSiLoEs', () => {
    // Lo que devuelve Supabase Auth cuando la contraseña está mal: ha contestado
    // y ha dicho que no. Esto NO se puede tapar con "el servidor no responde".
    it('la contraseña mal sigue siendo la contraseña mal', () => {
        const credenciales = Object.assign(new Error('Invalid login credentials'), {
            name: 'AuthApiError',
            status: 400,
            code: 'invalid_credentials',
        });
        expect(errorDeServidorSiLoEs(credenciales)).toBe(null);
    });

    it('sin error no hay nada que contar', () => {
        expect(errorDeServidorSiLoEs(null)).toBe(null);
        expect(errorDeServidorSiLoEs(undefined)).toBe(null);
    });

    // El caso del 2 de septiembre: Cloudflare contesta al instante con su página de
    // error mientras la base de datos reinicia. Auth no sabe leer ese HTML y devuelve
    // un error sin código; la app lo daba por contraseña mala.
    it('la página de error de Cloudflare (521) es fallo del servidor, no de la contraseña', () => {
        const html = Object.assign(new Error('Unexpected token \'<\''), { name: 'AuthUnknownError' });
        expect(errorDeServidorSiLoEs(html)).toMatchObject({
            esFalloDeConexion: true,
            message: MENSAJE_SIN_RESPUESTA,
        });
        // Y el mismo 521 llegando por una consulta a una tabla, donde el código viene
        // en la respuesta y no dentro del error.
        expect(errorDeServidorSiLoEs({ message: '<!DOCTYPE html>...' }, 521)).toMatchObject({
            esFalloDeConexion: true,
        });
    });

    it('el servidor caído por dentro (5xx) es fallo del servidor', () => {
        expect(errorDeServidorSiLoEs({ message: 'Service Unavailable', status: 503 })).toMatchObject({
            esFalloDeConexion: true,
        });
        expect(errorDeServidorSiLoEs({ message: 'Bad Gateway' }, 502)).toMatchObject({
            esFalloDeConexion: true,
        });
    });

    it('la petición que ni llega (estado 0) es fallo del servidor', () => {
        const sinRed = Object.assign(new Error('Failed to fetch'), {
            name: 'AuthRetryableFetchError',
            status: 0,
        });
        expect(errorDeServidorSiLoEs(sinRed)).toMatchObject({ esFalloDeConexion: true });
        // Igual desde una tabla: postgrest devuelve status 0 cuando el fetch falla.
        expect(errorDeServidorSiLoEs({ message: 'TypeError: Failed to fetch' }, 0)).toMatchObject({
            esFalloDeConexion: true,
        });
    });

    it('"vas muy deprisa" (429) se dice con su propio mensaje', () => {
        expect(errorDeServidorSiLoEs({ message: 'rate limit', status: 429 })).toMatchObject({
            esFalloDeConexion: true,
            message: MENSAJE_DEMASIADOS_INTENTOS,
        });
    });

    // `.single()` sin filas responde 406. El servidor ha hecho su trabajo: no hay ficha.
    it('la ficha que no existe (406) no se disfraza de fallo de red', () => {
        expect(errorDeServidorSiLoEs({ message: 'no rows', code: 'PGRST116' }, 406)).toBe(null);
    });

    it('un fallo ya marcado se devuelve tal cual, sin cambiarle el mensaje', () => {
        const yaMarcado = errorDeConexion('lo que sea');
        expect(errorDeServidorSiLoEs(yaMarcado)).toBe(yaMarcado);
    });
});
