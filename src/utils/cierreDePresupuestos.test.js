// ── El cierre de presupuestos mira a quien PAGA el porte ──
//
// JUAN ALBA es de Presupuesto y recibe a porte debido de AGROCIRILO, que no lo
// es. En Envíos, filtrando por «Presupuesto», salían sus tres albaranes; en el
// cierre no salía él (28/09/2026).

import { describe, it, expect } from 'vitest';
import { albaranesPorCerrar } from './cierreDePresupuestos';
import { filtroTipoDeCliente } from './filtrosEnvios';

const clientes = [
    { id: 1, name: 'JUAN ALBA', billingType: 'Presupuesto' },
    { id: 2, name: 'AGROCIRILO', billingType: 'Clientes Habituales' },
    { id: 3, name: 'PROSERVICE', billingType: 'Presupuesto', branches: [{ id: 'b1', name: 'PROSERVICE LUCENA' }] },
    { id: 4, name: 'MINIAUTOS', billingType: 'Clientes Habituales' },
];

const albaran = (extra) => ({
    id: 'HAB-1', type: 'Entrega', status: 'Entregado', porteType: 'Pagado',
    amount: '€7.00', customAmount: 7, createdAt: '2026-09-14T09:00:00.000Z',
    ...extra,
});

// Tal como lo guarda el alta: el tipo grabado es el del remitente.
const debidoAJuanAlba = albaran({
    id: 'HAB-264', client: 'AGROCIRILO', originName: 'AGROCIRILO', destinationName: 'JUAN ALBA',
    porteType: 'Debido', billingType: 'Clientes Habituales',
});

describe('albaranesPorCerrar', () => {
    it('un porte debido entra a nombre del destinatario de Presupuesto que lo paga', () => {
        const [fila, ...resto] = albaranesPorCerrar([debidoAJuanAlba], clientes);
        expect(resto).toHaveLength(0);
        expect(fila).toMatchObject({ clientName: 'JUAN ALBA', clientId: 1, mes: '2026-09', importe: 7 });
    });

    it('vale aunque la ficha se pusiera de Presupuesto después de hacer el albarán', () => {
        const antiguo = { ...debidoAJuanAlba, destinationBillingType: 'Clientes Habituales' };
        expect(albaranesPorCerrar([antiguo], clientes)).toHaveLength(1);
    });

    it('un porte debido de un remitente de Presupuesto no entra si el que paga no lo es', () => {
        const debidoAMiniautos = albaran({
            client: 'PROSERVICE', destinationName: 'MINIAUTOS', porteType: 'Debido', billingType: 'Presupuesto',
        });
        expect(albaranesPorCerrar([debidoAMiniautos], clientes)).toHaveLength(0);
    });

    it('lo que sale de una sede suma en la fila de su cliente', () => {
        const deLaSede = albaran({ id: 'HAB-2', client: 'PROSERVICE LUCENA', billingType: 'Presupuesto' });
        const deLaMatriz = albaran({ id: 'HAB-3', client: 'Proservice', billingType: 'Presupuesto' });
        const filas = albaranesPorCerrar([deLaSede, deLaMatriz], clientes);
        expect(filas.map(f => f.clientName)).toEqual(['PROSERVICE', 'PROSERVICE']);
        expect(new Set(filas.map(f => f.clave)).size).toBe(1);
    });

    it('sin ficha vale el tipo grabado en el albarán, y la fila es el nombre escrito', () => {
        const sinFicha = albaran({ client: 'TALLERES NUEVOS', billingType: 'Presupuesto' });
        expect(albaranesPorCerrar([sinFicha], clientes)[0]).toMatchObject({ clientName: 'TALLERES NUEVOS', clientId: null });
    });

    it('no entran los liquidados, los recibos ni los que no tienen precio', () => {
        const fuera = [
            { ...debidoAJuanAlba, budgetLiquidated: true },
            { ...debidoAJuanAlba, type: 'Recibo' },
            { ...debidoAJuanAlba, amount: 'Tarifa', customAmount: null },
        ];
        expect(albaranesPorCerrar(fuera, clientes)).toHaveLength(0);
    });

    // AGRO VELASCO, 28/09/2026: el alta desde el móvil guarda el albarán de un
    // cliente de Presupuesto como pagado y con el repartidor de cobrador.
    it('el albarán que dio de alta un repartidor entra aunque conste pagado y con cobrador', () => {
        const delMovil = albaran({
            id: 'HAB-7', client: 'PROSERVICE', billingType: 'Presupuesto',
            paymentStatus: 'Paid', portePaid: true, porteCollectedById: 5,
        });
        const entregado = { ...debidoAJuanAlba, portePaid: true, porteCollectedById: null };
        expect(albaranesPorCerrar([delMovil, entregado], clientes).map(f => f.envio.id)).toEqual(['HAB-7', 'HAB-264']);
    });

    it('con precio y sin cobrar, lo que sale en Envíos por «Presupuesto» es lo que sale aquí', () => {
        const envios = [
            debidoAJuanAlba,
            albaran({ id: 'HAB-4', client: 'PROSERVICE', destinationName: 'MINIAUTOS', billingType: 'Presupuesto' }),
            albaran({ id: 'HAB-5', client: 'MINIAUTOS', destinationName: 'PROSERVICE', billingType: 'Presupuesto' }),
            albaran({ id: 'HAB-6', client: 'AGROCIRILO', destinationName: 'MINIAUTOS', billingType: 'Clientes Habituales' }),
        ];
        const enEnvios = envios.filter(filtroTipoDeCliente('Presupuesto', clientes)).map(e => e.id);
        expect(albaranesPorCerrar(envios, clientes).map(f => f.envio.id)).toEqual(enEnvios);
        expect(enEnvios).toEqual(['HAB-264', 'HAB-4']);
    });
});
