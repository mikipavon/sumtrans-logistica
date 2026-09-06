import { describe, it, expect } from 'vitest';
import {
    coincideCliente,
    coincidePoblacion,
    filtroPoblacion,
    opcionesDeClientes,
    opcionesDePoblaciones,
    SIN_FILTRO,
    coincideTipoDeCliente,
    filtroTipoDeCliente,
    tipoDeClienteDelEnvio,
    BAREMO_1,
    BAREMO_2
} from './filtrosEnvios';

// Los tres albaranes del listado real al buscar "LEKUE", más un debido y una recogida.
const sum140 = {
    id: 'SUM-140',
    client: 'INDUSTRIAL LEKUE S.L.',
    destinationName: 'Agv',
    destinationCity: 'Antequera',
    originCity: 'Lucena'
};
const sum64 = {
    id: 'SUM-64',
    client: 'INDUSTRIAL LEKUE S.L.',
    destinationName: 'INNOVACIONES OLEICOLAS S.L.',
    destinationCity: 'ANTEQUERA',
    originCity: 'Lucena'
};
const sum141 = {
    id: 'SUM-141',
    client: 'PECOMARK S.A.',
    destinationName: 'David Gutiérrez',
    destinationCity: 'Priego de Córdoba',
    originCity: 'Córdoba'
};
const debido = {
    id: 'SUM-150',
    client: 'PROSERVICE',
    porteType: 'Debido',
    originName: 'Industrial Lekue S.L.',
    destinationName: 'Taller Espejo',
    destinationCity: 'Espejo',
    originCity: 'Lucena'
};
const recogida = {
    id: 'REC-279',
    type: 'Recogida',
    client: 'MADERINOX INDUSTRIAS. S.L.',
    originCity: 'Montilla',
    destinationCity: 'Lucena'
};
const envios = [sum140, sum64, sum141, debido, recogida];

describe('filtro por cliente', () => {
    it('sin cliente elegido pasan todos', () => {
        expect(envios.every((e) => coincideCliente(e, SIN_FILTRO))).toBe(true);
        expect(envios.every((e) => coincideCliente(e, ''))).toBe(true);
    });

    it('encuentra por el cliente que paga', () => {
        expect(coincideCliente(sum140, 'INDUSTRIAL LEKUE S.L.')).toBe(true);
        expect(coincideCliente(sum141, 'INDUSTRIAL LEKUE S.L.')).toBe(false);
    });

    it('encuentra por el destinatario, no solo por quien paga', () => {
        expect(coincideCliente(sum64, 'INNOVACIONES OLEICOLAS S.L.')).toBe(true);
    });

    it('encuentra por el remite cuando el porte es debido', () => {
        expect(coincideCliente(debido, 'INDUSTRIAL LEKUE S.L.')).toBe(true);
    });

    it('compara el nombre entero, sin tildes ni mayúsculas', () => {
        expect(coincideCliente(sum141, 'david gutierrez')).toBe(true);
        // "Lekue" a secas no es un cliente: eso es trabajo del buscador.
        expect(coincideCliente(sum140, 'LEKUE')).toBe(false);
    });

    it('las opciones son los nombres de la columna Clientes, sin repetir y ordenados', () => {
        expect(opcionesDeClientes(envios)).toEqual([
            'Agv',
            'David Gutiérrez',
            'INDUSTRIAL LEKUE S.L.',
            'INNOVACIONES OLEICOLAS S.L.',
            'MADERINOX INDUSTRIAS. S.L.',
            'PECOMARK S.A.',
            'PROSERVICE',
            'Taller Espejo'
        ]);
    });
});

describe('filtro por población', () => {
    it('sin población elegida pasan todos', () => {
        expect(envios.every((e) => coincidePoblacion(e, SIN_FILTRO))).toBe(true);
    });

    it('encuentra por el destino aunque esté escrito distinto', () => {
        expect(coincidePoblacion(sum140, 'Antequera')).toBe(true);
        expect(coincidePoblacion(sum64, 'Antequera')).toBe(true);
        expect(coincidePoblacion(sum141, 'PRIEGO DE CORDOBA')).toBe(true);
    });

    it('encuentra la recogida por el pueblo del remite', () => {
        expect(coincidePoblacion(recogida, 'Montilla')).toBe(true);
    });

    it('no confunde Córdoba con Priego de Córdoba', () => {
        expect(coincidePoblacion(sum141, 'Córdoba')).toBe(false);
        expect(coincidePoblacion(sum141, 'Priego')).toBe(false);
        expect(coincidePoblacion(sum141, 'Priego de Córdoba')).toBe(true);
    });

    it('no enseña lo que sale del pueblo del almacén: solo cuenta donde se para', () => {
        expect(coincidePoblacion(sum140, 'Lucena')).toBe(false);
        expect(coincidePoblacion(debido, 'Lucena')).toBe(false);
        expect(coincidePoblacion(recogida, 'Lucena')).toBe(false);
    });

    it('las opciones son los pueblos de entrega y de recogida, una vez por pueblo', () => {
        expect(opcionesDePoblaciones(envios)).toEqual([
            'Antequera',
            'Espejo',
            'Montilla',
            'Priego de Córdoba'
        ]);
    });

    it('con un envío sin poblaciones no revienta', () => {
        expect(coincidePoblacion({ id: 'X' }, 'Lucena')).toBe(false);
        expect(opcionesDePoblaciones([{ id: 'X' }, null])).toEqual([]);
    });
});

describe('filtro por baremo (conjunto de poblaciones)', () => {
    // Casariche (41580) es Baremo 2 en el listado maestro; Cabra (14940), Baremo 1.
    const aCasariche = { id: 'SUM-200', client: 'PECOMARK S.A.', destinationCity: 'Casariche', destinationZip: '41580', originCity: 'Lucena', originZip: '14900' };
    const aCabra = { id: 'SUM-201', client: 'PECOMARK S.A.', destinationCity: 'Cabra', destinationZip: '14940', originCity: 'Lucena', originZip: '14900' };
    const recogidaEnCasariche = { id: 'REC-300', type: 'Recogida', client: 'PECOMARK S.A.', originCity: 'CASARICHE', originZip: '', destinationCity: 'Lucena', destinationZip: '14900' };
    const sinPueblo = { id: 'SUM-202', client: 'PECOMARK S.A.' };

    it('Baremo 2 enseña lo que se entrega en pueblos de Baremo 2, y Baremo 1 el resto', () => {
        expect(coincidePoblacion(aCasariche, BAREMO_2)).toBe(true);
        expect(coincidePoblacion(aCasariche, BAREMO_1)).toBe(false);
        expect(coincidePoblacion(aCabra, BAREMO_1)).toBe(true);
        expect(coincidePoblacion(aCabra, BAREMO_2)).toBe(false);
    });

    it('una recogida cuenta por el pueblo donde se recoge, aunque vuelva al almacén', () => {
        expect(coincidePoblacion(recogidaEnCasariche, BAREMO_2)).toBe(true);
        expect(coincidePoblacion(recogidaEnCasariche, BAREMO_1)).toBe(false);
    });

    it('manda la lista de Ajustes, igual que al poner el precio', () => {
        const coverageZones = [{ name: 'Casariche', zip: '41580', baremo: 1 }];
        expect(coincidePoblacion(aCasariche, BAREMO_1, { coverageZones })).toBe(true);
        expect(coincidePoblacion(aCasariche, BAREMO_2, { coverageZones })).toBe(false);
    });

    it('un envío sin población no está en ningún baremo', () => {
        expect(coincidePoblacion(sinPueblo, BAREMO_1)).toBe(false);
        expect(coincidePoblacion(sinPueblo, BAREMO_2)).toBe(false);
    });

    it('la criba de un listado entero da lo mismo que envío a envío', () => {
        const lista = [aCasariche, aCabra, recogidaEnCasariche, sinPueblo, aCasariche];
        expect(lista.filter(filtroPoblacion(BAREMO_2)).map((e) => e.id)).toEqual(['SUM-200', 'REC-300', 'SUM-200']);
        expect(lista.filter(filtroPoblacion(BAREMO_1)).map((e) => e.id)).toEqual(['SUM-201']);
        expect(lista.filter(filtroPoblacion(SIN_FILTRO))).toHaveLength(5);
    });
});

describe('filtro por tipo de cliente (Facturación / Habitual / Presupuesto)', () => {
    const clientes = [
        { id: 1, name: 'INDUSTRIAL LEKUE S.L.', legalName: 'Industrial Lekue Sociedad Limitada', billingType: 'Facturación', clientNumber: '100' },
        { id: 2, name: 'PECOMARK S.A.', billingType: 'Presupuesto', branches: [{ name: 'PECOMARK LUCENA' }] },
        { id: 3, name: 'AGROCOR BAENA', billingType: 'Clientes Habituales' },
        { id: 4, name: 'LEKUE SUCURSAL', billingType: 'Clientes Habituales', clientNumber: '100-A' },
        { id: 5, name: 'TALLER ESPEJO', tipoFacturacion: 'Facturación mensual' }
    ];
    const pagado = (client, extra = {}) => ({ id: 'X', porteType: 'Pagado', client, destinationName: 'Alguien', ...extra });

    it('sin tipo elegido pasan todos', () => {
        expect(coincideTipoDeCliente(pagado('AGROCOR BAENA'), SIN_FILTRO, clientes)).toBe(true);
        expect(coincideTipoDeCliente(pagado('AGROCOR BAENA'), '', clientes)).toBe(true);
    });

    it('mira la ficha de quien paga: el remitente en porte pagado', () => {
        expect(tipoDeClienteDelEnvio(pagado('INDUSTRIAL LEKUE S.L.'), clientes)).toBe('Facturación');
        expect(coincideTipoDeCliente(pagado('INDUSTRIAL LEKUE S.L.'), 'Facturación', clientes)).toBe(true);
        expect(coincideTipoDeCliente(pagado('INDUSTRIAL LEKUE S.L.'), 'Clientes Habituales', clientes)).toBe(false);
    });

    it('en porte debido paga el destinatario, no el remitente', () => {
        const debido = { id: 'D', porteType: 'Debido', client: 'INDUSTRIAL LEKUE S.L.', destinationName: 'AGROCOR BAENA' };
        expect(tipoDeClienteDelEnvio(debido, clientes)).toBe('Clientes Habituales');
    });

    it('encuentra la ficha por razón social o por sucursal, sin tildes ni mayúsculas', () => {
        expect(tipoDeClienteDelEnvio(pagado('industrial lekue sociedad limitada'), clientes)).toBe('Facturación');
        expect(tipoDeClienteDelEnvio(pagado('Pecomark Lucena'), clientes)).toBe('Presupuesto');
    });

    it('una sucursal numerada "100-A" hereda el tipo de la matriz "100"', () => {
        expect(tipoDeClienteDelEnvio(pagado('LEKUE SUCURSAL'), clientes)).toBe('Facturación');
    });

    it('acepta el campo antiguo tipoFacturacion y "Facturación mensual" cuenta como Facturación', () => {
        expect(tipoDeClienteDelEnvio(pagado('TALLER ESPEJO'), clientes)).toBe('Facturación');
    });

    it('sin ficha vale el tipo del albarán, y sin nada es Habitual', () => {
        expect(tipoDeClienteDelEnvio(pagado('DESCONOCIDO', { billingType: 'Presupuesto' }), clientes)).toBe('Presupuesto');
        expect(tipoDeClienteDelEnvio(pagado('DESCONOCIDO'), clientes)).toBe('Clientes Habituales');
        expect(tipoDeClienteDelEnvio(pagado('DESCONOCIDO'), [])).toBe('Clientes Habituales');
    });

    it('la ficha manda sobre lo que traiga el albarán', () => {
        expect(tipoDeClienteDelEnvio(pagado('AGROCOR BAENA', { billingType: 'Facturación' }), clientes)).toBe('Clientes Habituales');
    });

    it('la criba de un listado da lo mismo que comprobar uno a uno', () => {
        const envios = [pagado('INDUSTRIAL LEKUE S.L.'), pagado('AGROCOR BAENA'), pagado('PECOMARK S.A.')];
        expect(envios.filter(filtroTipoDeCliente('Presupuesto', clientes)).map((e) => e.client)).toEqual(['PECOMARK S.A.']);
    });
});
