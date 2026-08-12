import { describe, it, expect } from 'vitest';
import {
    getAgencies,
    getPayerName,
    findAgencyByName,
    resolveOwnerAgencyId,
    getOwnerLabel,
    getClientsOwnedBy,
    buildOwnershipReport,
} from './agencyOwnership';

const TSB = { id: 1, name: 'TSB', isAgency: true };
const XPO = { id: 2, name: 'XPO TRANSPORT SOLUTIONS', isAgency: true, branches: [{ id: 'b1', name: 'XPO Sevilla' }] };
const BAR_PEPE = { id: 10, name: 'Bar Pepe' };                        // cliente propio
const FERRETERIA = { id: 11, name: 'Ferretería Luna', ownerAgencyId: 1 }; // ficha de TSB
const CLIENTS = [TSB, XPO, BAR_PEPE, FERRETERIA];

describe('getAgencies', () => {
    it('devuelve sólo las fichas marcadas como agencia', () => {
        expect(getAgencies(CLIENTS).map(a => a.name)).toEqual(['TSB', 'XPO TRANSPORT SOLUTIONS']);
    });

    it('aguanta una lista vacía o nula', () => {
        expect(getAgencies(null)).toEqual([]);
    });
});

describe('getPayerName', () => {
    it('en porte Pagado paga el remitente', () => {
        expect(getPayerName({ porteType: 'Pagado', client: 'TSB', destinationName: 'Bar Pepe' })).toBe('TSB');
    });

    it('en porte Debido paga el destinatario', () => {
        expect(getPayerName({ porteType: 'Debido', client: 'TSB', destinationName: 'Bar Pepe' })).toBe('Bar Pepe');
    });
});

describe('findAgencyByName', () => {
    it('encuentra la agencia ignorando acentos, mayúsculas y espacios de más', () => {
        expect(findAgencyByName('  xpo   transport solutions ', CLIENTS)).toBe(XPO);
    });

    it('encuentra la agencia por el nombre de una sede', () => {
        expect(findAgencyByName('XPO Sevilla', CLIENTS)).toBe(XPO);
    });

    it('devuelve null si quien paga no es agencia', () => {
        expect(findAgencyByName('Bar Pepe', CLIENTS)).toBeNull();
        expect(findAgencyByName('', CLIENTS)).toBeNull();
    });
});

describe('resolveOwnerAgencyId', () => {
    it('asigna la ficha a la agencia cuando ella paga el porte', () => {
        const envio = { porteType: 'Pagado', client: 'TSB', destinationName: 'Nuevo Destinatario' };
        expect(resolveOwnerAgencyId(envio, CLIENTS)).toBe(1);
    });

    it('deja la ficha en la cartera propia cuando el porte es debido', () => {
        const envio = { porteType: 'Debido', client: 'TSB', destinationName: 'Nuevo Destinatario' };
        expect(resolveOwnerAgencyId(envio, CLIENTS)).toBeNull();
    });

    it('deja la ficha en la cartera propia en trabajo normal de SUM', () => {
        const envio = { porteType: 'Pagado', client: 'Bar Pepe', destinationName: 'Otro' };
        expect(resolveOwnerAgencyId(envio, CLIENTS)).toBeNull();
    });
});

describe('getOwnerLabel', () => {
    it('marca las fichas propias', () => {
        expect(getOwnerLabel(BAR_PEPE, CLIENTS)).toBe('MÍO');
    });

    it('marca las fichas de agencia con su nombre', () => {
        expect(getOwnerLabel(FERRETERIA, CLIENTS)).toBe('TSB');
    });

    it('avisa si la agencia ya no existe en vez de romperse', () => {
        expect(getOwnerLabel({ id: 99, ownerAgencyId: 777 }, CLIENTS)).toBe('AGENCIA BORRADA');
    });
});

describe('getClientsOwnedBy', () => {
    it('devuelve la cartera de la agencia sin incluir su propia ficha', () => {
        const propia = { id: 12, name: 'Otra de TSB', ownerAgencyId: 1 };
        const conAutoreferencia = [...CLIENTS, propia, { ...TSB, ownerAgencyId: 1 }];
        const result = getClientsOwnedBy(1, conAutoreferencia);
        expect(result.map(c => c.name).sort()).toEqual(['Ferretería Luna', 'Otra de TSB']);
    });

    it('no toca la cartera propia', () => {
        expect(getClientsOwnedBy(2, CLIENTS)).toEqual([]);
    });
});

describe('buildOwnershipReport', () => {
    const nuevo = { id: 20, name: 'Panadería Sur' };
    const mixto = { id: 21, name: 'Talleres Gómez' };
    const compartido = { id: 22, name: 'Hotel Centro' };
    const clientes = [TSB, XPO, BAR_PEPE, nuevo, mixto, compartido];

    const envios = [
        // Panadería Sur: siempre la trae TSB → se propone mover
        { porteType: 'Pagado', client: 'TSB', destinationName: 'Panadería Sur' },
        { porteType: 'Pagado', client: 'TSB', destinationName: 'Panadería Sur' },
        // Talleres Gómez: una de TSB pero también trabajo propio → se queda
        { porteType: 'Pagado', client: 'TSB', destinationName: 'Talleres Gómez' },
        { porteType: 'Pagado', client: 'Bar Pepe', destinationName: 'Talleres Gómez' },
        // Hotel Centro: lo traen dos agencias → se queda, decide el usuario
        { porteType: 'Pagado', client: 'TSB', destinationName: 'Hotel Centro' },
        { porteType: 'Pagado', client: 'XPO Sevilla', destinationName: 'Hotel Centro' },
    ];

    it('propone mover sólo las fichas exclusivas de una agencia', () => {
        const { proposals } = buildOwnershipReport(clientes, envios);
        expect(proposals).toHaveLength(1);
        expect(proposals[0].client.name).toBe('Panadería Sur');
        expect(proposals[0].agencyId).toBe(1);
        expect(proposals[0].shipmentCount).toBe(2);
    });

    it('deja fuera las fichas con albaranes propios y las compartidas', () => {
        const { skipped } = buildOwnershipReport(clientes, envios);
        expect(skipped.map(s => s.client.name).sort()).toEqual(['Hotel Centro', 'Talleres Gómez']);
    });

    it('nunca propone mover la ficha de la propia agencia', () => {
        const { proposals } = buildOwnershipReport(clientes, envios);
        expect(proposals.some(p => p.client.isAgency)).toBe(false);
    });

    it('no vuelve a proponer fichas que ya tienen dueño', () => {
        const yaAsignada = [...clientes, { id: 23, name: 'Panadería Sur', ownerAgencyId: 1 }];
        const { proposals } = buildOwnershipReport(yaAsignada, envios);
        expect(proposals.every(p => !p.client.ownerAgencyId)).toBe(true);
    });

    it('no propone nada si no hay agencias marcadas', () => {
        const sinAgencias = [BAR_PEPE, nuevo];
        expect(buildOwnershipReport(sinAgencias, envios)).toEqual({ proposals: [], skipped: [], agencies: [] });
    });
});
