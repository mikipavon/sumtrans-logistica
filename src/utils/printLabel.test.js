import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    etiquetasDeLosEnvios,
    getLabelCountTotal,
    repartirEnFolios,
    printLabelA6,
    printLabelA4,
    printLabel75x52,
} from './printLabel';

// Un cliente pidió imprimir de una vez las etiquetas de todos los envíos del
// día (24/09/2026): las tres funciones aceptan un envío o una lista, y sacan
// todos los bultos seguidos en la misma ventana de impresión.

const CLIENTE = { id: 42, name: 'ESMEBRA' };
const tres  = { id: 'SUM-520', packages: 3, destinationName: 'FERRETERIA PEPE', destinationCity: 'Mijas' };
const uno   = { id: 'SUM-518', packages: 1, destinationName: 'CAMPOS BEGINES' };
// Como lo guarda la oficina: el texto de los artículos y la lista con el BLT_7.
const siete = { id: 'SUM-521', packages: '1x BLT_7', articles: [{ name: 'BLT_7', quantity: 1 }] };

describe('etiquetas de varios envíos', () => {
    it('saca los bultos de cada envío seguidos, cada uno con su número y su total', () => {
        expect(etiquetasDeLosEnvios([tres, uno]).map(e => [e.shipment.id, e.bulto, e.total])).toEqual([
            ['SUM-520', 1, 3], ['SUM-520', 2, 3], ['SUM-520', 3, 3],
            ['SUM-518', 1, 1],
        ]);
    });

    it('suma los bultos, contando los BLT_n como n', () => {
        expect(getLabelCountTotal([siete, uno])).toBe(8);
        expect(getLabelCountTotal(tres)).toBe(3);
    });

    it('un envío suelto sigue valiendo, y los huecos de la lista no cuentan', () => {
        expect(etiquetasDeLosEnvios(uno)).toHaveLength(1);
        expect(etiquetasDeLosEnvios([null, uno, undefined])).toHaveLength(1);
        expect(getLabelCountTotal([])).toBe(0);
    });
});

describe('repartirEnFolios', () => {
    it('rellena los cuadrantes seguidos desde la posición de inicio y pasa de folio al llenar el 4', () => {
        expect(repartirEnFolios(5, 3)).toEqual({
            folios: [[null, null, 0, 1], [2, 3, 4, null]],
            lastUsed: 3,
        });
    });

    it('un folio justo acaba en la 4', () => {
        expect(repartirEnFolios(4, 1)).toEqual({ folios: [[0, 1, 2, 3]], lastUsed: 4 });
    });

    it('sin etiquetas no hay folios ni posición', () => {
        expect(repartirEnFolios(0, 2)).toEqual({ folios: [], lastUsed: 0 });
    });
});

describe('la ventana de impresión con varios envíos', () => {
    let escrito;
    beforeEach(() => {
        escrito = '';
        vi.spyOn(window, 'open').mockReturnValue({
            document: { open() {}, write(html) { escrito += html; }, close() {} },
        });
    });
    afterEach(() => { vi.restoreAllMocks(); });

    const paginas = (clase) => (escrito.match(new RegExp(`<div class="${clase}">`, 'g')) || []).length;

    it('A6: una página por bulto de todos los envíos, y el título dice cuántos son', () => {
        printLabelA6([tres, uno], CLIENTE);
        expect(escrito).toContain('<title>Etiquetas de 2 envíos</title>');
        expect(paginas('page')).toBe(4);
        expect(escrito).toContain('SUM-520-3');
        expect(escrito).toContain('Bulto 3 de 3');
        expect(escrito).toContain('SUM-518-1');
        expect(escrito).toContain('Bulto 1 de 1');
    });

    it('A4: los bultos de todos los envíos van seguidos por cuadrantes y devuelve la última posición', () => {
        // 4 etiquetas desde la posición 2: ocupan 2, 3 y 4 del primer folio y la 1 del segundo
        const ultima = printLabelA4([tres, uno], CLIENTE, 2);
        expect(ultima).toBe(1);
        expect(paginas('a4-page')).toBe(2);
        expect(escrito.indexOf('SUM-520-1')).toBeLessThan(escrito.indexOf('SUM-518-1'));
    });

    it('rollo 75×52 igual, y con un solo envío el título sigue siendo su albarán', () => {
        printLabel75x52(tres, CLIENTE);
        expect(escrito).toContain('<title>Etiqueta SUM-520</title>');
        expect(paginas('page')).toBe(3);
    });
});
