// ── La contraseña sugerida tiene que valer para dos cosas a la vez ──
//
// Que se pueda dictar por teléfono sin deletrear, y que Supabase no la rechace.
// Lo segundo es lo que tumbó `123456` y `16321632`: hay un filtro contra las
// listas de contraseñas filtradas, y todo lo que sea "fácil" de verdad está en
// ellas. Lo primero es lo que hace que la oficina no acabe llamando tres veces.

import { describe, it, expect } from 'vitest';
import {
    generarContrasena,
    nombreParaContrasena,
    TAMANO_DEL_VOCABULARIO,
    PALABRAS_POR_CONTRASENA,
    DIGITOS_POR_CONTRASENA,
} from './contrasenaSugerida';

describe('generarContrasena', () => {
    it('sale con el formato dictable: palabras en mayúscula inicial y dígitos al final', () => {
        for (let i = 0; i < 200; i++) {
            expect(generarContrasena()).toMatch(
                new RegExp(`^([A-Z][a-z]+){${PALABRAS_POR_CONTRASENA}}[0-9]{${DIGITOS_POR_CONTRASENA}}$`)
            );
        }
    });

    it('no lleva tildes, ñ ni símbolos: por teléfono y por teclado', () => {
        for (let i = 0; i < 200; i++) {
            // Sólo ASCII imprimible, y dentro de eso sólo letras y dígitos.
            expect(generarContrasena()).toMatch(/^[A-Za-z0-9]+$/);
        }
    });

    it('no repite palabra dentro de la misma contraseña', () => {
        for (let i = 0; i < 200; i++) {
            const palabras = generarContrasena().match(/[A-Z][a-z]+/g);
            expect(palabras).toHaveLength(PALABRAS_POR_CONTRASENA);
            expect(new Set(palabras).size).toBe(PALABRAS_POR_CONTRASENA);
        }
    });

    it('no se repite: dos clientes seguidos no pueden acabar con la misma', () => {
        const vistas = new Set();
        for (let i = 0; i < 3000; i++) vistas.add(generarContrasena());
        expect(vistas.size).toBe(3000);
    });

    it('tiene combinaciones de sobra para que no sea adivinable', () => {
        // Con 250+ palabras: 253 × 252 × 251 × 1000 ≈ 1,6 · 10¹⁰.
        expect(TAMANO_DEL_VOCABULARIO).toBeGreaterThanOrEqual(200);
    });

    it('es lo bastante larga para que Auth no la rechace por corta', () => {
        // Supabase exige 6 como mínimo; la más corta posible aquí pasa de lejos.
        for (let i = 0; i < 200; i++) {
            expect(generarContrasena().length).toBeGreaterThanOrEqual(12);
        }
    });
});

describe('con el nombre comercial del cliente', () => {
    it('lo pone delante, pero deja intacto lo aleatorio', () => {
        for (let i = 0; i < 200; i++) {
            const c = generarContrasena('VWG PROSERVICE, S.L.');
            expect(c.startsWith('Proservice')).toBe(true);
            // Detrás del nombre siguen quedando dos palabras al azar y 4 cifras:
            // el nombre etiqueta, no sustituye. Es público, no esconde nada.
            expect(c.slice('Proservice'.length)).toMatch(
                new RegExp(`^([A-Z][a-z]+){${PALABRAS_POR_CONTRASENA - 1}}[0-9]{${DIGITOS_POR_CONTRASENA}}$`)
            );
        }
    });

    it('sigue sin repetirse entre clientes con el mismo nombre', () => {
        const vistas = new Set();
        for (let i = 0; i < 2000; i++) vistas.add(generarContrasena('PROSERVICE'));
        expect(vistas.size).toBe(2000);
    });

    it('nunca deja tildes ni eñes, que no se dictan ni se teclean bien', () => {
        const c = generarContrasena('MUÑOZ E HIJOS');
        expect(c.startsWith('Munoz')).toBe(true);
        expect(c).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('si del nombre no sale nada, la genera entera al azar', () => {
        // "S.L." es sólo forma jurídica: como etiqueta no distingue a nadie.
        for (const nombre of ['', '   ', 'S.L.', '123', null, undefined]) {
            expect(generarContrasena(nombre)).toMatch(
                new RegExp(`^([A-Z][a-z]+){${PALABRAS_POR_CONTRASENA}}[0-9]{${DIGITOS_POR_CONTRASENA}}$`)
            );
        }
    });
});

describe('nombreParaContrasena', () => {
    it('se salta las formas jurídicas y el relleno', () => {
        expect(nombreParaContrasena('S.L. PROSERVICE')).toBe('Proservice');
        expect(nombreParaContrasena('LA CASA DE LAS FLORES')).toBe('Flores');
    });

    it('se queda con la palabra que identifica, no con las siglas de delante', () => {
        expect(nombreParaContrasena('VWG PROSERVICE, S.L.')).toBe('Proservice');
    });

    it('recorta los nombres largos, que hay que dictarlos', () => {
        expect(nombreParaContrasena('TRANSPORTESYLOGISTICAINTEGRAL').toLowerCase())
            .toHaveLength(12);
    });

    it('devuelve cadena vacía cuando no hay nada aprovechable', () => {
        expect(nombreParaContrasena('')).toBe('');
        expect(nombreParaContrasena('S.L.')).toBe('');
        expect(nombreParaContrasena('2026')).toBe('');
    });
});
