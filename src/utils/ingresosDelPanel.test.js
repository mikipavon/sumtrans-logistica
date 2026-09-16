import { describe, it, expect } from 'vitest';
import {
    importeDelEnvio,
    clasificadorDeIngresos,
    categoriasMarcadas,
    tituloDeIngresos,
    ingresosPorCliente,
    sumaDeIngresos,
    TODAS_LAS_CATEGORIAS
} from './ingresosDelPanel';

const clientes = [
    { id: 1, name: 'Muebles Pérez', billingType: 'Facturación' },
    { id: 2, name: 'Bar Manolo', billingType: 'Clientes Habituales' },
    { id: 3, name: 'Reformas Sur', billingType: 'Presupuesto' },
    { id: 4, name: 'Vecino Nuevo', billingType: 'Clientes Habituales' }
];

const envios = [
    // Cliente de facturación que envía a un destinatario "habitual": es facturación.
    { id: 'a', client: 'Muebles Pérez', destinationName: 'Vecino Nuevo', porteType: 'Pagado', amount: '€100.00' },
    { id: 'b', client: 'MUEBLES PEREZ ', destinationName: 'Bar Manolo', porteType: 'Pagado', amount: '€50.00', customAmount: 60 },
    // Porte debido: paga el destinatario.
    { id: 'c', client: 'Muebles Pérez', destinationName: 'Bar Manolo', porteType: 'Debido', amount: '€20.00' },
    { id: 'd', client: 'Reformas Sur', destinationName: 'Vecino Nuevo', porteType: 'Pagado', amount: '€86.00' },
    { id: 'e', client: 'Bar Manolo', destinationName: 'Muebles Pérez', porteType: 'Pagado', amount: 'Tarifa' }
];

const clasificar = clasificadorDeIngresos(clientes);

describe('importeDelEnvio', () => {
    it('lee el símbolo, la coma y deja la palabra Tarifa en cero', () => {
        expect(importeDelEnvio({ amount: '€7.50' })).toBe(7.5);
        expect(importeDelEnvio({ amount: '7,50' })).toBe(7.5);
        expect(importeDelEnvio({ amount: 'Tarifa' })).toBe(0);
        expect(importeDelEnvio({ amount: '€5.00', customAmount: 9 })).toBe(9);
    });
});

describe('clasificadorDeIngresos', () => {
    it('clasifica por quien paga, no por cualquiera de las dos partes', () => {
        expect(envios.map(clasificar)).toEqual(['facturacion', 'facturacion', 'habituales', 'presupuestos', 'habituales']);
    });
});

describe('categoriasMarcadas y tituloDeIngresos', () => {
    it('Total General manda sobre las demás casillas', () => {
        const claves = categoriasMarcadas({ total: true, facturacion: true, habituales: false, presupuestos: false });
        expect(claves).toEqual(TODAS_LAS_CATEGORIAS);
        expect(tituloDeIngresos(claves)).toBe('Ingresos (Total)');
    });

    it('sin Total suma sólo lo marcado y lo dice en el título', () => {
        expect(tituloDeIngresos(categoriasMarcadas({ facturacion: true }))).toBe('Ingresos (Facturación)');
        expect(tituloDeIngresos(categoriasMarcadas({ habituales: true, presupuestos: true })))
            .toBe('Ingresos (Clientes Habituales + Presupuestos)');
        expect(tituloDeIngresos(categoriasMarcadas({}))).toBe('Ingresos (ninguna línea)');
    });
});

describe('ingresosPorCliente', () => {
    it('agrupa por pagador sin mirar mayúsculas ni tildes y ordena por importe', () => {
        const filas = ingresosPorCliente(envios, clasificar, ['facturacion']);
        expect(filas).toEqual([
            { cliente: 'Muebles Pérez', categorias: ['facturacion'], envios: 2, importe: 160 }
        ]);
        expect(sumaDeIngresos(filas)).toBe(160);
    });

    it('con todas las líneas el total cuadra con la suma de cada una', () => {
        const total = sumaDeIngresos(ingresosPorCliente(envios, clasificar, TODAS_LAS_CATEGORIAS));
        const porLinea = TODAS_LAS_CATEGORIAS
            .map((c) => sumaDeIngresos(ingresosPorCliente(envios, clasificar, [c])))
            .reduce((a, b) => a + b, 0);
        expect(total).toBe(266);
        expect(porLinea).toBe(266);
    });

    it('el porte debido se apunta al destinatario, que es quien paga', () => {
        const filas = ingresosPorCliente(envios, clasificar, TODAS_LAS_CATEGORIAS);
        const manolo = filas.find((f) => f.cliente === 'Bar Manolo');
        expect(manolo).toMatchObject({ envios: 2, importe: 20, categorias: ['habituales'] });
        expect(filas.map((f) => f.cliente)).toEqual(['Muebles Pérez', 'Reformas Sur', 'Bar Manolo']);
    });

    it('sin categorías no devuelve nada', () => {
        expect(ingresosPorCliente(envios, clasificar, [])).toEqual([]);
    });
});
