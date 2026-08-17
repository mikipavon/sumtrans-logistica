import { describe, it, expect, beforeEach, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...args) => rpc(...args) } }));

import { maximoDeLaSerie, reservarNumerosAlbaran } from './numeracionAlbaran';

beforeEach(() => {
    rpc.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('maximoDeLaSerie', () => {
    const envios = [
        { id: 'SUM-1200' },
        { id: 'SUM-1198' },
        { id: 'HAB-4500' },
        { id: 'PU-77' }
    ];

    it('no mezcla series: HAB no sube el máximo de SUM', () => {
        expect(maximoDeLaSerie(envios, 'SUM')).toBe(1200);
        expect(maximoDeLaSerie(envios, 'HAB')).toBe(4500);
    });

    it('ignora los ids con año incrustado, que no son de la serie correlativa', () => {
        expect(maximoDeLaSerie([...envios, { id: 'SUM-2026254' }], 'SUM')).toBe(1200);
    });

    it('devuelve 0 cuando la serie aún no tiene envíos', () => {
        expect(maximoDeLaSerie(envios, 'XXX')).toBe(0);
        expect(maximoDeLaSerie([], 'SUM')).toBe(0);
        expect(maximoDeLaSerie(null, 'SUM')).toBe(0);
    });
});

describe('reservarNumerosAlbaran', () => {
    it('usa el número del servidor aunque el cliente sólo vea envíos suyos', async () => {
        // El caso que motiva todo esto: el portal tiene cargados sus SUM-1200,
        // pero la serie real va por 1450. Localmente habría emitido 1201.
        rpc.mockResolvedValue({ data: 1451, error: null });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-1200' }]
        });

        expect(primero).toBe(1451);
        expect(reservado).toBe(true);
        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { prefijo: 'SUM', cantidad: 1 });
    });

    it('pide de golpe todos los números de una importación', async () => {
        rpc.mockResolvedValue({ data: 300, error: null });

        const { primero } = await reservarNumerosAlbaran('HAB', 40, { enviosLocales: [] });

        expect(primero).toBe(300);
        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { prefijo: 'HAB', cantidad: 40 });
    });

    it('si el servidor falla, numera con lo local en vez de dejar al cliente sin crear', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist', code: '42883' } });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-1200' }, { id: 'HAB-9999' }]
        });

        expect(primero).toBe(1201);
        expect(reservado).toBe(false);
    });

    it('aguanta que la llamada reviente (sin cobertura), no sólo que devuelva error', async () => {
        rpc.mockRejectedValue(new TypeError('Load failed'));

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-7' }]
        });

        expect(primero).toBe(8);
        expect(reservado).toBe(false);
    });

    it('no da por bueno un número imposible', async () => {
        rpc.mockResolvedValue({ data: 0, error: null });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-30' }]
        });

        expect(primero).toBe(31);
        expect(reservado).toBe(false);
    });

    it('normaliza la serie en minúsculas antes de pedirla', async () => {
        rpc.mockResolvedValue({ data: 5, error: null });

        await reservarNumerosAlbaran('sum', 1, { enviosLocales: [] });

        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { prefijo: 'SUM', cantidad: 1 });
    });
});
