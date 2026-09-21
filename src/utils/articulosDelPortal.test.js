// ── Varios artículos con cantidad en el portal: sólo con el interruptor de la ficha ──

import { describe, it, expect } from 'vitest';
import {
    elPortalAdmiteVariosArticulos, cantidadValida, anadirLinea, quitarLinea,
    lineasDelEnvio, bultosDeLosArticulos, valorarLineas,
} from './articulosDelPortal';

const TURISMO = { id: '7', name: 'TURISMO', category: 'Neumáticos', price: '3.50' };
const CUATRO_X_CUATRO = { id: '8', name: '4X4', category: 'Neumáticos', price: '5.00' };
const BLT_5 = { id: '5', name: 'BLT_5', category: 'BADI', price: '4.30' };
const CATALOGO = [TURISMO, CUATRO_X_CUATRO, BLT_5];
const precio = (a) => parseFloat(a.price);

describe('elPortalAdmiteVariosArticulos', () => {
    it('sólo con el interruptor de la ficha', () => {
        expect(elPortalAdmiteVariosArticulos({ name: 'NEUMATICOS VELASCO', portalVariosArticulos: true })).toBe(true);
        expect(elPortalAdmiteVariosArticulos({ name: 'NEUMATICOS VELASCO' })).toBe(false);
        expect(elPortalAdmiteVariosArticulos(null)).toBe(false);
    });
});

describe('cantidadValida', () => {
    it('acepta enteros de 1 para arriba y rechaza el resto', () => {
        expect(cantidadValida('3')).toBe(3);
        expect(cantidadValida(4)).toBe(4);
        expect(cantidadValida('0')).toBeNull();
        expect(cantidadValida('-1')).toBeNull();
        expect(cantidadValida('2.5')).toBeNull();
        expect(cantidadValida('')).toBeNull();
        expect(cantidadValida('abc')).toBeNull();
    });
});

describe('anadirLinea / quitarLinea', () => {
    it('añade líneas y suma si el artículo ya estaba', () => {
        let lineas = anadirLinea([], '7', '4');
        lineas = anadirLinea(lineas, '8', '2');
        expect(lineas).toEqual([{ articleId: '7', quantity: 4 }, { articleId: '8', quantity: 2 }]);
        lineas = anadirLinea(lineas, 7, '1');
        expect(lineas).toEqual([{ articleId: '7', quantity: 5 }, { articleId: '8', quantity: 2 }]);
    });
    it('sin artículo o con cantidad mala no toca la lista', () => {
        const lineas = [{ articleId: '7', quantity: 4 }];
        expect(anadirLinea(lineas, '', '2')).toBe(lineas);
        expect(anadirLinea(lineas, '8', '0')).toBe(lineas);
        expect(anadirLinea(lineas, '8', '')).toBe(lineas);
    });
    it('quita por artículo', () => {
        const lineas = [{ articleId: '7', quantity: 4 }, { articleId: '8', quantity: 2 }];
        expect(quitarLinea(lineas, 7)).toEqual([{ articleId: '8', quantity: 2 }]);
    });
});

describe('lineasDelEnvio', () => {
    it('recupera las líneas de un envío guardado', () => {
        const envio = { articles: [{ ...TURISMO, quantity: 4 }, { ...CUATRO_X_CUATRO, quantity: '2' }, { ...BLT_5 }] };
        expect(lineasDelEnvio(envio)).toEqual([
            { articleId: '7', quantity: 4 }, { articleId: '8', quantity: 2 }, { articleId: '5', quantity: 1 },
        ]);
        expect(lineasDelEnvio({})).toEqual([]);
    });
});

describe('bultosDeLosArticulos', () => {
    it('cada neumático es un bulto; un BLT_5 son cinco por unidad', () => {
        expect(bultosDeLosArticulos([{ ...TURISMO, quantity: 4 }, { ...CUATRO_X_CUATRO, quantity: 2 }])).toBe(6);
        expect(bultosDeLosArticulos([{ ...BLT_5, quantity: 2 }])).toBe(10);
        expect(bultosDeLosArticulos([{ ...BLT_5, quantity: 1 }, { ...TURISMO, quantity: 3 }])).toBe(8);
        expect(bultosDeLosArticulos([])).toBe(1);
    });
});

describe('valorarLineas', () => {
    it('valora cada línea con su precio y suma el total', () => {
        const { articles, total } = valorarLineas(
            [{ articleId: '7', quantity: 4 }, { articleId: '8', quantity: 2 }], CATALOGO, precio
        );
        expect(articles).toHaveLength(2);
        expect(articles[0]).toMatchObject({ name: 'TURISMO', quantity: 4, unitPrice: 3.5, totalPrice: 14 });
        expect(articles[1]).toMatchObject({ name: '4X4', quantity: 2, unitPrice: 5, totalPrice: 10 });
        expect(total).toBe(24);
    });
    it('una línea de un artículo que ya no está en la ficha se salta', () => {
        const { articles, total } = valorarLineas([{ articleId: '99', quantity: 1 }, { articleId: '7', quantity: 1 }], CATALOGO, precio);
        expect(articles.map(a => a.name)).toEqual(['TURISMO']);
        expect(total).toBe(3.5);
    });
});
