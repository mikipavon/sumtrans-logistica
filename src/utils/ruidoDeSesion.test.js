import { describe, it, expect } from 'vitest';
import { esRuidoDeSesion } from './ruidoDeSesion';

describe('esRuidoDeSesion', () => {
    it('reconoce el error exacto que vio el repartidor en el móvil', () => {
        const error = new DOMException(
            "Lock broken by another request with the 'steal' option.",
            'AbortError'
        );
        expect(esRuidoDeSesion(error)).toBe(true);
    });

    it('reconoce el aviso de que otro se llevó el cerrojo', () => {
        const error = new Error('Lock "lock:sb-abc-auth-token" was released because another request stole it');
        expect(esRuidoDeSesion(error)).toBe(true);
    });

    it('reconoce el fallo de espera del cerrojo por su nombre', () => {
        const error = new Error('cualquier cosa');
        error.name = 'NavigatorLockAcquireTimeoutError';
        expect(esRuidoDeSesion(error)).toBe(true);
    });

    it('reconoce el fallo de espera del cerrojo por la marca de Supabase', () => {
        const error = new Error('cualquier cosa');
        error.isAcquireTimeout = true;
        expect(esRuidoDeSesion(error)).toBe(true);
    });

    it('reconoce el mensaje aunque llegue como texto suelto', () => {
        expect(esRuidoDeSesion("AbortError: Lock broken by another request with the 'steal' option.")).toBe(true);
    });

    // Lo importante: que no se trague fallos de verdad. Si esto se relaja, la app
    // vuelve a quedarse muerta en silencio sin que nadie se entere.
    it('NO se traga un fallo de programación de verdad', () => {
        expect(esRuidoDeSesion(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    });

    it('NO se traga un fallo de red', () => {
        expect(esRuidoDeSesion(new TypeError('Failed to fetch'))).toBe(false);
    });

    it('NO se traga un aborto normal de petición', () => {
        expect(esRuidoDeSesion(new DOMException('The user aborted a request.', 'AbortError'))).toBe(false);
    });

    it('aguanta que no llegue nada', () => {
        expect(esRuidoDeSesion(null)).toBe(false);
        expect(esRuidoDeSesion(undefined)).toBe(false);
        expect(esRuidoDeSesion('')).toBe(false);
        expect(esRuidoDeSesion({})).toBe(false);
    });
});
