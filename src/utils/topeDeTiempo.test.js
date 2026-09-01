import { describe, it, expect } from 'vitest';
import { conTopeDeTiempo, errorDeConexion, MENSAJE_SIN_RESPUESTA } from './topeDeTiempo';

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
