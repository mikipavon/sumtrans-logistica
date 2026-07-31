import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
    supabase: { from: () => ({ insert: vi.fn().mockResolvedValue({ error: null }) }) }
}));

import {
    huellaDeError,
    debeRegistrarse,
    registrarError,
    establecerContextoDeError,
    _reiniciarRegistro,
    MAX_POR_SESION,
    VENTANA_REPETIDOS_MS
} from './errorLog';

beforeEach(() => {
    _reiniciarRegistro();
});

describe('huellaDeError', () => {
    // Dos apariciones del mismo fallo nunca son idénticas: llevan dentro rutas con
    // hash, ids y horas. La huella se queda con lo que sí se repite.
    it('el mismo error en dos momentos da la misma huella', () => {
        const pila = 'Error: x\n    at entregar (app-a1b2.js:10:5)\n    at otro (app-a1b2.js:99:1)';
        const otraPila = 'Error: x\n    at entregar (app-a1b2.js:10:5)\n    at distinto (app-a1b2.js:400:2)';
        expect(huellaDeError('x', pila)).toBe(huellaDeError('x', otraPila));
    });

    it('errores distintos dan huellas distintas', () => {
        expect(huellaDeError('a', 'Error\n at uno')).not.toBe(huellaDeError('b', 'Error\n at uno'));
    });

    it('aguanta un error sin pila', () => {
        expect(() => huellaDeError('solo mensaje', undefined)).not.toThrow();
    });
});

describe('debeRegistrarse', () => {
    it('deja pasar la primera vez', () => {
        expect(debeRegistrarse('h', 1000)).toBe(true);
    });

    // Este es el caso que importa: un error dentro de un bucle de render se dispara
    // cientos de veces por segundo y llenaría la tabla en un minuto.
    it('corta las repeticiones seguidas del mismo error', () => {
        expect(debeRegistrarse('h', 1000)).toBe(true);
        expect(debeRegistrarse('h', 1001)).toBe(false);
        expect(debeRegistrarse('h', 5000)).toBe(false);
    });

    it('vuelve a dejarlo pasar cuando ya ha pasado la ventana', () => {
        expect(debeRegistrarse('h', 1000)).toBe(true);
        expect(debeRegistrarse('h', 1000 + VENTANA_REPETIDOS_MS + 1)).toBe(true);
    });

    it('no confunde errores distintos entre sí', () => {
        expect(debeRegistrarse('a', 1000)).toBe(true);
        expect(debeRegistrarse('b', 1000)).toBe(true);
    });

    it('pone un tope por sesión aunque los errores sean todos distintos', () => {
        for (let i = 0; i < MAX_POR_SESION; i++) {
            expect(debeRegistrarse(`error-${i}`, 1000)).toBe(true);
        }
        expect(debeRegistrarse('uno-mas', 1000)).toBe(false);
    });
});

describe('registrarError', () => {
    it('no lanza nunca, pase lo que pase', async () => {
        await expect(registrarError(new Error('boom'), { origen: 'test' })).resolves.toBeUndefined();
        await expect(registrarError(null)).resolves.toBeUndefined();
        await expect(registrarError('un string')).resolves.toBeUndefined();
        await expect(registrarError(undefined)).resolves.toBeUndefined();
    });

    it('no intenta nada sin conexión', async () => {
        const original = Object.getOwnPropertyDescriptor(navigator, 'onLine');
        Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });

        await expect(registrarError(new Error('sin red'))).resolves.toBeUndefined();

        if (original) Object.defineProperty(navigator, 'onLine', original);
    });

    it('acepta el contexto de sesión sin romperse', async () => {
        establecerContextoDeError({ role: 'driver', driverId: 7, driverName: 'Francis' });
        await expect(registrarError(new Error('con contexto'))).resolves.toBeUndefined();
    });
});
