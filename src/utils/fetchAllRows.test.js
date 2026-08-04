import { describe, it, expect, vi } from 'vitest';
import { fetchAllRows, TAMANO_PAGINA } from './fetchAllRows';

/**
 * Simula una tabla de Supabase: devuelve el trozo que corresponda al `.range()`
 * pedido, igual que haría PostgREST.
 */
const tablaFalsa = (totalFilas, { pageSize = TAMANO_PAGINA } = {}) => {
    const todas = Array.from({ length: totalFilas }, (_, i) => ({ id: `S${i}` }));
    const rangos = [];

    const construirConsulta = () => ({
        range: (desde, hasta) => {
            rangos.push([desde, hasta]);
            // PostgREST nunca devuelve más de `pageSize` filas aunque le pidas más.
            const trozo = todas.slice(desde, Math.min(hasta + 1, desde + pageSize));
            return Promise.resolve({ data: trozo, error: null });
        }
    });

    return { construirConsulta, rangos, todas };
};

describe('fetchAllRows', () => {
    it('trae todas las filas cuando hay más de una página', async () => {
        const { construirConsulta } = tablaFalsa(2500);
        const { data, error } = await fetchAllRows(construirConsulta);

        expect(error).toBeNull();
        expect(data).toHaveLength(2500);
        expect(data[0].id).toBe('S0');
        expect(data[2499].id).toBe('S2499');
    });

    it('pide todas las páginas necesarias sin saltarse filas', async () => {
        const { construirConsulta, rangos } = tablaFalsa(2500);
        await fetchAllRows(construirConsulta);

        // Las páginas necesarias (0-999, 1000-1999, 2000-2999) se piden sí o sí.
        // Puede haber alguna página de más pedida por adelantado en paralelo cerca
        // del final (se descarta al no hacer falta), pero nunca huecos ni repetidas.
        expect(rangos).toContainEqual([0, 999]);
        expect(rangos).toContainEqual([1000, 1999]);
        expect(rangos).toContainEqual([2000, 2999]);
        const unicas = new Set(rangos.map(r => r.join('-')));
        expect(unicas.size).toBe(rangos.length);
    });

    it('pide varias páginas EN PARALELO cuando la tabla es grande, no de una en una', async () => {
        const total = 5000; // 5 páginas de 1000
        const todas = Array.from({ length: total }, (_, i) => ({ id: `S${i}` }));
        let enVuelo = 0;
        let maxEnVuelo = 0;
        const construirConsulta = () => ({
            range: async (desde, hasta) => {
                enVuelo++;
                maxEnVuelo = Math.max(maxEnVuelo, enVuelo);
                await new Promise(r => setTimeout(r, 5)); // simula latencia de red
                enVuelo--;
                return { data: todas.slice(desde, Math.min(hasta + 1, desde + TAMANO_PAGINA)), error: null };
            }
        });

        const { data } = await fetchAllRows(construirConsulta);

        expect(data).toHaveLength(total);
        expect(maxEnVuelo).toBeGreaterThan(1);
    });

    it('para en cuanto una página viene incompleta', async () => {
        const { construirConsulta, rangos } = tablaFalsa(300);
        const { data } = await fetchAllRows(construirConsulta);

        expect(data).toHaveLength(300);
        expect(rangos).toHaveLength(1);
    });

    it('no pide una segunda página cuando la tabla está vacía', async () => {
        const { construirConsulta, rangos } = tablaFalsa(0);
        const { data } = await fetchAllRows(construirConsulta);

        expect(data).toEqual([]);
        expect(rangos).toHaveLength(1);
    });

    it('pide una página de más cuando el total es múltiplo exacto del tamaño', async () => {
        // Con 2000 filas la segunda página viene llena: no hay forma de saber que se
        // acabó sin preguntar (al menos) una vez más.
        const { construirConsulta, rangos } = tablaFalsa(2000);
        const { data } = await fetchAllRows(construirConsulta);

        expect(data).toHaveLength(2000);
        expect(rangos.length).toBeGreaterThanOrEqual(3);
    });

    it('propaga el error de Supabase y no devuelve datos a medias', async () => {
        const fallo = { message: 'boom' };
        let llamadas = 0;
        const construirConsulta = () => ({
            range: () => {
                llamadas++;
                if (llamadas === 2) return Promise.resolve({ data: null, error: fallo });
                return Promise.resolve({ data: Array.from({ length: TAMANO_PAGINA }, (_, i) => ({ id: i })), error: null });
            }
        });

        const { data, error } = await fetchAllRows(construirConsulta);
        expect(error).toBe(fallo);
        expect(data).toBeNull();
    });

    it('respeta un tamaño de página distinto', async () => {
        const { construirConsulta, rangos } = tablaFalsa(250, { pageSize: 100 });
        const { data } = await fetchAllRows(construirConsulta, { pageSize: 100 });

        expect(data).toHaveLength(250);
        expect(data[0].id).toBe('S0');
        expect(data[249].id).toBe('S249');
        expect(rangos).toContainEqual([0, 99]);
        expect(rangos).toContainEqual([100, 199]);
        expect(rangos).toContainEqual([200, 299]);
    });

    it('corta y avisa si la consulta nunca deja de devolver páginas llenas', async () => {
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const construirConsulta = () => ({
            range: () => Promise.resolve({
                data: Array.from({ length: 10 }, (_, i) => ({ id: i })),
                error: null
            })
        });

        const { data, error } = await fetchAllRows(construirConsulta, { pageSize: 10, label: 'bucle' });

        expect(error).toBeNull();
        expect(data).toHaveLength(5000); // 500 páginas x 10
        expect(aviso).toHaveBeenCalled();
        aviso.mockRestore();
    });
});
