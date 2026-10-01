// ── El Modo Fantasma y la exportación miran la misma ficha ──
//
// Un albarán HAB cuyo cliente pasó a Facturación, con el nombre escrito de otra
// forma en el albarán, seguía escondido con el candado echado y no salía en el
// Excel de Factusol (01/10/2026).

import { describe, it, expect } from 'vitest';
import { enviosConCandado, tipoDeCobroDelPagador } from './modoFantasma';

const cartera = [
    { id: 1, name: 'Agro Velasco S.L.', legalName: 'Agroquímicos Velasco S.L.', billingType: 'Facturación', branches: [{ id: 's1', name: 'Agro Velasco · nave' }] },
    { id: 2, name: 'Bar Pepe', billingType: 'Clientes Habituales' },
    { id: 3, name: 'Obras del Sur', billingType: 'Presupuesto' },
];

describe('Modo Fantasma con el candado echado', () => {
    it('decide por la ficha actual del que paga, no por el tipo grabado en el albarán', () => {
        const nacioHab = { id: 'HAB-1', client: 'Agro Velasco S.L.', billingType: 'Clientes Habituales', porteType: 'Pagado' };
        const nacioFact = { id: 'SUM-1', client: 'Bar Pepe', billingType: 'Facturación', porteType: 'Pagado' };

        expect(enviosConCandado([nacioHab, nacioFact], cartera).map(s => s.id)).toEqual(['HAB-1']);
    });

    it('encuentra la ficha aunque el nombre venga con tildes, mayúsculas, el fiscal o el de una sede', () => {
        const envios = [
            { id: 'a', client: 'AGRO VELASCO S.L.', billingType: 'Clientes Habituales' },
            { id: 'b', client: 'agroquimicos velasco s.l.', billingType: 'Clientes Habituales' },
            { id: 'c', client: 'Agro Velasco · nave', billingType: 'Clientes Habituales' },
        ];
        expect(enviosConCandado(envios, cartera).map(s => s.id)).toEqual(['a', 'b', 'c']);
    });

    it('con el enlace por id manda la ficha enlazada, diga lo que diga el nombre', () => {
        const envios = [
            { id: 'portal', client: 'Lo que tecleó el cliente', clientId: 1, billingType: 'Clientes Habituales' },
            { id: 'debido', client: 'Remitente Cualquiera', destinationName: 'otro', destinatarioId: '1', porteType: 'Debido', destinationBillingType: 'Clientes Habituales' },
        ];
        expect(enviosConCandado(envios, cartera).map(s => s.id)).toEqual(['portal', 'debido']);
    });

    it('a porte debido mira al destinatario, que es quien paga', () => {
        const paga = { id: 'd1', client: 'Agro Velasco S.L.', destinationName: 'Bar Pepe', porteType: 'Debido' };
        const cobra = { id: 'd2', client: 'Bar Pepe', destinationName: 'Agro Velasco S.L.', porteType: 'Debido' };

        expect(enviosConCandado([paga, cobra], cartera).map(s => s.id)).toEqual(['d2']);
    });

    it('sin ficha se queda con lo grabado en el albarán', () => {
        const envios = [
            { id: 'x', client: 'Desconocido', billingType: 'Clientes Habituales' },
            { id: 'y', client: 'Desconocido', billingType: 'Facturación' },
            { id: 'z', client: 'Desconocido', destinationName: 'Nadie', porteType: 'Debido', destinationBillingType: 'Presupuesto', billingType: 'Facturación' },
            { id: 'w', client: 'Desconocido' },
        ];
        expect(enviosConCandado(envios, cartera).map(s => s.id)).toEqual(['y', 'w']);
        expect(tipoDeCobroDelPagador(envios[2], cartera)).toBe('Presupuesto');
    });
});
