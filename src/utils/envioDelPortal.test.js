// ── El cliente toca su envío hasta que pasamos el escáner ──
//
// NEUMATICOS VELASCO intentó borrar el 21/09/2026 un envío que aún no
// habíamos recogido y no pudo: la base de datos no tenía política de borrado
// para el cliente y la app lo quitaba de la lista sin haberlo borrado. La
// regla, ahora en un solo sitio: suyo + pendiente + sin bultos escaneados.

import { describe, it, expect } from 'vitest';
import {
    porQueElClienteNoPuedeTocarlo,
    elClientePuedeTocarlo,
    tieneBultosEscaneados,
} from './envioDelPortal';

const VELASCO = { id: 7, name: 'NEUMATICOS VELASCO' };
const pendiente = {
    id: 'SUM-2041',
    clientId: 7,
    client: 'NEUMATICOS VELASCO',
    originName: 'NEUMATICOS VELASCO',
    destinationName: 'Hijos de Lastre',
    status: 'Pendiente de asignar',
};

describe('tieneBultosEscaneados', () => {
    it('sólo cuenta una lista con algo dentro', () => {
        expect(tieneBultosEscaneados({ scannedPackages: [1] })).toBe(true);
        expect(tieneBultosEscaneados({ scannedPackages: [] })).toBe(false);
        expect(tieneBultosEscaneados({ scannedPackages: null })).toBe(false);
        expect(tieneBultosEscaneados({})).toBe(false);
        expect(tieneBultosEscaneados(null)).toBe(false);
    });
});

describe('porQueElClienteNoPuedeTocarlo', () => {
    it('pendiente y sin escanear: puede', () => {
        expect(porQueElClienteNoPuedeTocarlo(pendiente, VELASCO)).toBeNull();
        expect(elClientePuedeTocarlo(pendiente, VELASCO)).toBe(true);
        expect(elClientePuedeTocarlo({ ...pendiente, scannedPackages: [] }, VELASCO)).toBe(true);
    });

    it('con un bulto escaneado ya es nuestro, aunque siga pendiente', () => {
        const motivo = porQueElClienteNoPuedeTocarlo({ ...pendiente, scannedPackages: [1] }, VELASCO);
        expect(motivo).toMatch(/Ya hemos recogido/);
        expect(elClientePuedeTocarlo({ ...pendiente, scannedPackages: [1] }, VELASCO)).toBe(false);
    });

    it('en reparto sin escanear tampoco: la oficina lo ha puesto en marcha', () => {
        const motivo = porQueElClienteNoPuedeTocarlo({ ...pendiente, status: 'En reparto' }, VELASCO);
        expect(motivo).toMatch(/ya está en marcha/);
    });

    it('lo que le llega de otro no lo puede tocar', () => {
        const recibido = {
            id: 'SUM-2050', client: 'OTRO', originName: 'OTRO',
            destinationName: 'Neumaticos Velasco', status: 'Pendiente de asignar',
        };
        expect(porQueElClienteNoPuedeTocarlo(recibido, VELASCO)).toMatch(/no lo has creado tú/);
    });

    it('sin envío no hay nada que tocar', () => {
        expect(porQueElClienteNoPuedeTocarlo(null, VELASCO)).toMatch(/ya no existe/);
    });
});
