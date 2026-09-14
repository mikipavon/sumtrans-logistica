import { describe, it, expect } from 'vitest';
import { coincideBusqueda, coincideEnCampos, normalizarTexto } from './busqueda';

// SUM-141 del listado real: paga PECOMARK, recibe David Gutiérrez.
const sum141 = {
    id: 'SUM-141',
    client: 'PECOMARK S.A.',
    destinationName: 'David Gutiérrez',
    origin: 'POL. LAS QUEMADAS. SIM..., 14014 Córdoba',
    destination: ', 14800 Priego de Córdoba',
    destinationCity: 'Priego de Córdoba',
    clientPhone: '957 123 456'
};

// Porte debido: el que paga es el destinatario, el remite va en originName.
const sum140 = {
    id: 'SUM-140',
    client: 'PROSERVICE',
    porteType: 'Debido',
    originName: 'R C. Motor',
    destinationName: 'Taller Espejo',
    origin: 'AVDA. VELAZQUEZ 468',
    destination: ', 14830 Espejo'
};

describe('coincideBusqueda (envíos)', () => {
    it('encuentra por el cliente que paga', () => {
        expect(coincideBusqueda(sum141, 'pecomark')).toBe(true);
    });

    it('encuentra por el destinatario, no solo por quien paga', () => {
        expect(coincideBusqueda(sum141, 'David Gutiérrez')).toBe(true);
    });

    it('encuentra aunque se escriba sin tildes', () => {
        expect(coincideBusqueda(sum141, 'gutierrez')).toBe(true);
        expect(coincideBusqueda(sum141, 'priego de cordoba')).toBe(true);
    });

    it('encuentra por el remite cuando el porte es debido', () => {
        expect(coincideBusqueda(sum140, 'r c. motor')).toBe(true);
        expect(coincideBusqueda(sum140, 'proservice')).toBe(true);
    });

    it('encuentra por ID y por teléfono', () => {
        expect(coincideBusqueda(sum141, 'sum-141')).toBe(true);
        expect(coincideBusqueda(sum141, '957 123')).toBe(true);
    });

    it('admite varias palabras de campos distintos', () => {
        expect(coincideBusqueda(sum141, 'pecomark priego')).toBe(true);
        expect(coincideBusqueda(sum141, 'pecomark espejo')).toBe(false);
    });

    // SUM-610 y SUM-985 del listado real: buscar "el llano" (la farmacia de
    // Aguilar) sacaba también los de HIJOS DE MANUEL PINO, porque "el" cabía en
    // el "DEL" de "C/ LLANO DEL CALVARIO".
    it('una palabra corta no vale por el trozo de otra palabra', () => {
        const sum610 = {
            id: 'SUM-610',
            client: 'TSB',
            destinationName: 'HIJOS DE MANUEL PINO',
            destination: 'C/ LLANO DEL CALVARIO, 6, Montalbán de Córdoba',
            destinationCity: 'Montalbán de Córdoba'
        };
        const sum812 = {
            id: 'SUM-812',
            client: 'TSB',
            destinationName: 'Farmacia ortopedia El Llano',
            destinationCity: 'Aguilar de la Frontera'
        };
        expect(coincideBusqueda(sum610, 'el llano')).toBe(false);
        expect(coincideBusqueda(sum812, 'el llano')).toBe(true);
        expect(coincideBusqueda(sum610, 'llano')).toBe(true);
        expect(coincideBusqueda(sum610, 'manuel pino')).toBe(true);
        expect(coincideBusqueda(sum812, 'de la frontera')).toBe(true);
    });

    it('lo tecleado seguido vale aunque empiece a mitad de palabra', () => {
        expect(coincideBusqueda({ id: 'SUM-141', clientNif: 'B56131717' }, '56131717')).toBe(true);
        expect(coincideBusqueda({ id: 'SUM-141', clientPhone: '957123456' }, '123456')).toBe(true);
        expect(coincideBusqueda({ id: 'SUM-141' }, '141')).toBe(true);
    });

    it('no mezcla el final de un campo con el principio del siguiente', () => {
        expect(coincideBusqueda(sum141, 'S.A.David')).toBe(false);
    });

    it('sin término devuelve todos', () => {
        expect(coincideBusqueda(sum141, '')).toBe(true);
        expect(coincideBusqueda(sum141, '   ')).toBe(true);
    });

    it('no revienta con campos vacíos', () => {
        expect(coincideBusqueda({}, 'pecomark')).toBe(false);
        expect(coincideBusqueda(null, 'pecomark')).toBe(false);
    });
});

describe('coincideEnCampos (pueblos y CP del gestor de rutas)', () => {
    const pueblo = { name: 'Priego de Córdoba', zip: '14800' };

    it('encuentra el pueblo sin tildes', () => {
        expect(coincideEnCampos([pueblo.name, pueblo.zip], 'cordoba')).toBe(true);
    });

    it('encuentra por código postal', () => {
        expect(coincideEnCampos([pueblo.name, pueblo.zip], '14800')).toBe(true);
    });

    it('descarta lo que no coincide', () => {
        expect(coincideEnCampos([pueblo.name, pueblo.zip], 'espejo')).toBe(false);
    });

    it('acepta un solo valor sin array', () => {
        expect(coincideEnCampos('Castro del Río', 'castro del rio')).toBe(true);
    });

    it('sin término devuelve todo', () => {
        expect(coincideEnCampos([pueblo.name, pueblo.zip], '  ')).toBe(true);
    });
});

describe('normalizarTexto', () => {
    it('quita tildes, mayúsculas y espacios de sobra', () => {
        expect(normalizarTexto('  Castro  DEL Río ')).toBe('castro del rio');
        expect(normalizarTexto(null)).toBe('');
    });
});
