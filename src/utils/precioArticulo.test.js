import { describe, it, expect } from 'vitest';
import { normalizarPoblacion, pueblosQueCasan, baremoDelPunto, baremoDelEnvio, precioUnitarioArticulo, repreciarArticulos, conMinimoFueraDeBaremo, PRECIO_MINIMO_FUERA_DE_BAREMO } from './precioArticulo';

const BLT_5 = { id: 'blt5', name: 'BLT_5', price: '18.00', priceB2: '21.50' };

describe('pueblosQueCasan', () => {
    it('devuelve las filas del pueblo por nombre y, si ninguna casa, por C.P.; nunca las que no tienen baremo válido', () => {
        const lista = [{ name: 'Antequera', zip: '29200' }, { name: 'Antequera', zip: '29200', baremo: 2 }, { name: 'Otro', zip: '29200', baremo: '1' }];
        expect(pueblosQueCasan('antequera', '29200', lista)).toEqual([lista[1]]);
        expect(pueblosQueCasan('', '29200', lista)).toEqual([lista[1], lista[2]]);
        expect(pueblosQueCasan('Nadie', '', lista)).toEqual([]);
        expect(pueblosQueCasan('Aguilar', '', [{ name: 'Aguilar de la Frontera', zip: '14900', baremo: 1 }])).toHaveLength(1);
    });
});

describe('normalizarPoblacion', () => {
    it('quita acentos, apellidos del pueblo y signos', () => {
        expect(normalizarPoblacion('  Aguilar de la Frontera ')).toBe('aguilar');
        expect(normalizarPoblacion('Córdoba')).toBe('cordoba');
        expect(normalizarPoblacion('Puente-Genil')).toBe('puentegenil');
        expect(normalizarPoblacion(null)).toBe('');
    });
});

describe('baremoDelPunto', () => {
    it('Casariche está en el listado maestro como Baremo 2, por nombre o por C.P.', () => {
        expect(baremoDelPunto('Casariche', '41580')).toMatchObject({ baremo: 2, tariffId: null });
        expect(baremoDelPunto('', '41580').baremo).toBe(2);
        expect(baremoDelPunto('CASARICHE', '').baremo).toBe(2);
    });

    it('un pueblo de Córdoba del listado es Baremo 1, aunque se escriba sin apellido', () => {
        expect(baremoDelPunto('Cabra', '14940').baremo).toBe(1);
        expect(baremoDelPunto('Aguilar', '14900').baremo).toBe(1);
    });

    it('sin pueblo ni C.P. es Baremo 1; sin coincidencia manda el C.P.: 14xxx es 1 y el resto 2', () => {
        expect(baremoDelPunto('', '')).toMatchObject({ baremo: 1, tariffId: null });
        expect(baremoDelPunto('Pueblo Inventado', '14999').baremo).toBe(1);
        expect(baremoDelPunto('Pueblo Inventado', '29999').baremo).toBe(2);
        expect(baremoDelPunto('Pueblo Inventado', '').baremo).toBe(2);
    });

    it('la lista personalizada de Ajustes gana al listado maestro', () => {
        const coverageZones = [{ name: 'Casariche', zip: '41580', baremo: 1 }];
        expect(baremoDelPunto('Casariche', '41580', { coverageZones }).baremo).toBe(1);
    });

    it('Antequera (3/9/2026): una fila repetida sin baremo válido o en Baremo 1 no tapa a la de Baremo 2', () => {
        // Fila vieja sin baremo (no se ve en Ajustes) antes de la buena
        const sinBaremo = [{ id: 1, name: 'Antequera', zip: '29200' }, { id: 2, name: 'Antequera', zip: '29200', baremo: 2 }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: sinBaremo }).baremo).toBe(2);
        // El mismo pueblo en las dos columnas: gana Baremo 2
        const repetida = [{ id: 1, name: 'ANTEQUERA', zip: '', baremo: 1 }, { id: 2, name: 'Antequera', zip: '29200', baremo: 2 }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: repetida }).baremo).toBe(2);
        expect(baremoDelPunto('Antequera', '', { coverageZones: repetida }).baremo).toBe(2);
        // Sólo hay filas con el baremo mal guardado: se ignoran y decide el listado maestro
        const malGuardada = [{ name: 'Antequera', zip: '29200', baremo: 'B2' }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: malGuardada })).toMatchObject({ baremo: 2, source: 'Listado Maestro (Sistema): Antequera 29200' });
    });

    it('el nombre manda sobre el C.P.: Jauja (B2) comparte el 14911 con Llanos de Don Juan y Navas del Selpillar (B1)', () => {
        expect(baremoDelPunto('Jauja', '14911').baremo).toBe(2);
        expect(baremoDelPunto('Llanos de Don Juan', '14911').baremo).toBe(1);
        // Sólo con el C.P. no se sabe cuál de los tres es: en la duda gana Baremo 2
        expect(baremoDelPunto('', '14911').baremo).toBe(2);
        // Otra fila de Ajustes en Baremo 1 con el C.P. de Antequera no la convierte en B1
        const otraConSuCp = [{ name: 'Pueblo Raro', zip: '29200', baremo: 1 }, { name: 'Antequera', zip: '29200', baremo: 2 }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones: otraConSuCp }).baremo).toBe(2);
        expect(baremoDelPunto('Pueblo Raro', '29200', { coverageZones: otraConSuCp }).baremo).toBe(1);
    });

    it('la etiqueta dice qué fila decidió, para poder encontrarla en Ajustes', () => {
        const coverageZones = [{ name: 'Antequera', zip: '29200', baremo: 2 }];
        expect(baremoDelPunto('Antequera', '29200', { coverageZones }).source).toBe('Lista Personalizada (Ajustes): Antequera 29200');
    });

    it('una tarifa por zona con baremo explícito manda; sin baremo sólo aporta la zona', () => {
        const conBaremo = [{ id: 'z3', match: 'Cabra', baremo: 2 }];
        expect(baremoDelPunto('Cabra', '14940', { tariffs: conBaremo })).toMatchObject({ baremo: 2, tariffId: 'z3' });

        const sinBaremo = [{ id: 'z2', zipPrefix: '415' }];
        expect(baremoDelPunto('Casariche', '41580', { tariffs: sinBaremo })).toMatchObject({ baremo: 2, tariffId: 'z2' });
        expect(baremoDelPunto('Cabra', '14940', { tariffs: [{ id: 'z1', match: 'Cabra' }] })).toMatchObject({ baremo: 1, tariffId: 'z1' });
    });
});

describe('baremoDelEnvio', () => {
    it('basta con que origen o destino sea Baremo 2', () => {
        expect(baremoDelEnvio({ originCity: 'Córdoba', originZip: '14005', destinationCity: 'Casariche', destinationZip: '41580' }).baremo).toBe(2);
        expect(baremoDelEnvio({ originCity: 'Casariche', originZip: '41580', destinationCity: 'Córdoba', destinationZip: '14005' }).baremo).toBe(2);
        expect(baremoDelEnvio({ originCity: 'Córdoba', originZip: '14005', destinationCity: 'Cabra', destinationZip: '14940' }).baremo).toBe(1);
    });

    it('la zona es la del destino', () => {
        const tariffs = [{ id: 'zOrigen', match: 'Córdoba' }, { id: 'zDestino', match: 'Cabra' }];
        expect(baremoDelEnvio({ originCity: 'Córdoba', destinationCity: 'Cabra' }, { tariffs }).tariffId).toBe('zDestino');
    });
});

// ── Población fuera de los baremos (22/09/2026) ──
//
// Si el pueblo no sale en el Baremo 1 ni en el 2, el baremo que se le pone es
// un supuesto (14xxx → B1, el resto → B2) y el precio del catálogo no vale: el
// porte no baja de 12 € y al cliente que paga en mano se le manda a preguntar
// a la oficina.
describe('fuera de baremo', () => {
    it('lo decide el C.P.: fuera sólo si no está en ninguna lista y el C.P. es de fuera de Córdoba', () => {
        expect(baremoDelPunto('Pueblo Inventado', '29999').fueraDeBaremo).toBe(true);
        // Un pueblo de la provincia que no esté en las listas es Baremo 1 y no avisa.
        expect(baremoDelPunto('Pueblo Inventado', '14999')).toMatchObject({ baremo: 1, fueraDeBaremo: false });
        // Sin C.P. no hay con qué decidirlo.
        expect(baremoDelPunto('Pueblo Inventado', '').fueraDeBaremo).toBe(false);
    });

    it('un pueblo del listado maestro o de Ajustes no lo está', () => {
        expect(baremoDelPunto('Casariche', '41580').fueraDeBaremo).toBe(false);
        expect(baremoDelPunto('Cabra', '').fueraDeBaremo).toBe(false);
        const coverageZones = [{ name: 'Mi Pueblo', zip: '29999', baremo: 2 }];
        expect(baremoDelPunto('Mi Pueblo', '29999', { coverageZones }).fueraDeBaremo).toBe(false);
    });

    it('una zona con tarifa cuenta como tarifada aunque no traiga baremo', () => {
        const tariffs = [{ id: 'z1', match: 'Mi Zona' }];
        expect(baremoDelPunto('Mi Zona', '29999', { tariffs }).fueraDeBaremo).toBe(false);
    });

    it('sin pueblo ni C.P. todavía no hay nada que decidir', () => {
        expect(baremoDelPunto('', '').fueraDeBaremo).toBe(false);
    });

    it('el envío está fuera si lo está el origen o el destino', () => {
        expect(baremoDelEnvio({ originCity: 'Cabra', originZip: '14940', destinationCity: 'Pueblo Inventado', destinationZip: '29999' }).fueraDeBaremo).toBe(true);
        expect(baremoDelEnvio({ originCity: 'Pueblo Inventado', originZip: '29999', destinationCity: 'Cabra', destinationZip: '14940' }).fueraDeBaremo).toBe(true);
        expect(baremoDelEnvio({ originCity: 'Cabra', originZip: '14940', destinationCity: 'Casariche', destinationZip: '41580' }).fueraDeBaremo).toBe(false);
    });

    it('el porte no baja de 12 € fuera de baremo, y dentro no se toca', () => {
        expect(PRECIO_MINIMO_FUERA_DE_BAREMO).toBe(12);
        expect(conMinimoFueraDeBaremo(4.3, true)).toBe(12);
        expect(conMinimoFueraDeBaremo(0, true)).toBe(12);
        expect(conMinimoFueraDeBaremo(21.5, true)).toBe(21.5);
        expect(conMinimoFueraDeBaremo(4.3, false)).toBe(4.3);
        expect(conMinimoFueraDeBaremo(0, false)).toBe(0);
    });
});

describe('precioUnitarioArticulo', () => {
    it('SUM-258: BLT_5 a Casariche vale el precio B2 del artículo, no el base', () => {
        const { baremo, tariffId } = baremoDelEnvio({ originCity: 'Córdoba', originZip: '14005', destinationCity: 'Casariche', destinationZip: '41580' });
        expect(precioUnitarioArticulo(BLT_5, { baremo, tariffId, cliente: null })).toBe(21.5);
    });

    it('en Baremo 1 vale el precio base', () => {
        expect(precioUnitarioArticulo(BLT_5, { baremo: 1 })).toBe(18);
    });

    it('sin precio B2 el artículo vale lo mismo en los dos baremos', () => {
        expect(precioUnitarioArticulo({ id: 'x', price: '7', priceB2: '' }, { baremo: 2 })).toBe(7);
    });

    it('la tarifa especial del que paga manda sobre el artículo, cada columna sólo en su baremo', () => {
        const cliente = { customRates: { blt5: '15' }, customRatesB2: { blt5: '19,90' } };
        expect(precioUnitarioArticulo(BLT_5, { baremo: 2, cliente })).toBe(19.9);
        expect(precioUnitarioArticulo(BLT_5, { baremo: 1, cliente })).toBe(15);
        // ACTIVA (21/9/2026): especial sólo en la columna normal → en Baremo 2
        // va el B2 del catálogo, no el especial de B1
        expect(precioUnitarioArticulo(BLT_5, { baremo: 2, cliente: { customRates: { blt5: '15' } } })).toBe(21.5);
        // Y al revés: especial sólo en B2 no toca el Baremo 1
        expect(precioUnitarioArticulo(BLT_5, { baremo: 1, cliente: { customRatesB2: { blt5: '19,90' } } })).toBe(18);
        // Un 0 tecleado a mano es un precio, no "sin tarifa"
        expect(precioUnitarioArticulo(BLT_5, { baremo: 1, cliente: { customRates: { blt5: '0' } } })).toBe(0);
        // Vacío o basura no es una tarifa
        expect(precioUnitarioArticulo(BLT_5, { baremo: 2, cliente: { customRates: { blt5: '' }, customRatesB2: { blt5: 'abc' } } })).toBe(21.5);
    });

    it('el precio por zona del artículo va antes que el B2 y después de la tarifa especial', () => {
        const conZona = { ...BLT_5, zonePrices: { z9: '25' } };
        expect(precioUnitarioArticulo(conZona, { baremo: 2, tariffId: 'z9' })).toBe(25);
        expect(precioUnitarioArticulo(conZona, { baremo: 2, tariffId: 'otra' })).toBe(21.5);
        expect(precioUnitarioArticulo(conZona, { baremo: 2, tariffId: 'z9', cliente: { customRatesB2: { blt5: '15' } } })).toBe(15);
    });

    it('cliente por kilos: el artículo va a 0, el porte sale del peso', () => {
        expect(precioUnitarioArticulo(BLT_5, { baremo: 2, porKilos: true, cliente: { customRatesB2: { blt5: '30' } } })).toBe(0);
    });
});

describe('repreciarArticulos', () => {
    const guardado = [{ ...BLT_5, quantity: 1, unitPrice: 21.5, totalPrice: 21.5, uniqueId: 'a1' }];

    it('si nada cambia no avisa de cambios, aunque el artículo venga con las claves de la ficha antigua', () => {
        expect(repreciarArticulos(guardado, { baremo: 2 }).cambiaron).toBe(false);
        const antiguo = [{ ...BLT_5, quantity: 1, pricePerUnit: 21.5, totalPrice: 21.5, uniqueId: 'a1' }];
        expect(repreciarArticulos(antiguo, { baremo: 2 }).cambiaron).toBe(false);
    });

    it('al pasar a Baremo 1 recalcula unitario y total con la cantidad', () => {
        const { articulos, cambiaron } = repreciarArticulos([{ ...guardado[0], quantity: 3, totalPrice: 64.5 }], { baremo: 1 });
        expect(cambiaron).toBe(true);
        expect(articulos[0]).toMatchObject({ unitPrice: 18, totalPrice: 54 });
    });
});
