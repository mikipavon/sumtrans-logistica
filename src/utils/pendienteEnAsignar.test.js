import { describe, it, expect } from 'vitest';
import { pendienteEnAsignar, conductoresDeSuRuta, diasEnAsignar, textoDeDias } from './pendienteEnAsignar';

const JAVITO = { id: 10, name: 'Javier', alias: 'JAVITO' };
const FRANCIS = { id: 20, name: 'Francisco', alias: 'FRANCIS' };
const PACO = { id: 30, name: 'Paco' };
const drivers = [JAVITO, FRANCIS, PACO];

const routes = [
    { nombre: 'Lucena', conductorId: 10, poblacionesManana: ['Lucena', 'Cabra'], poblacionesTarde: [] },
    { nombre: 'Baena', conductorId: 20, poblacionesManana: ['Baena'], poblacionesTarde: ['Montalbán de Córdoba'] },
    { nombre: 'Córdoba', conductorId: 30, poblacionesManana: ['Córdoba'], poblacionesTarde: [] },
];

const ahora = new Date(2026, 8, 29, 10, 0);

const pendiente = (extra = {}) => ({
    id: 'SUM-2833',
    status: 'Pendiente de asignar',
    type: 'Entrega',
    destinationCity: 'Baena',
    destinationZip: '14850',
    createdAt: new Date(2026, 8, 29, 8, 0).toISOString(),
    ...extra,
});

describe('pendienteEnAsignar', () => {
    it('no dice nada de lo que no está pendiente de asignar', () => {
        expect(pendienteEnAsignar(pendiente({ status: 'En reparto' }), { drivers, routes, ahora })).toBeNull();
    });

    it('Javito recoge algo que va a Baena: lo tiene él y no es de su ruta', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'Cond.JAVITO ', createdById: 10 }), { drivers, routes, ahora });
        expect(r.tipo).toBe('transportista');
        expect(r.conductores).toEqual([{ driver: JAVITO, deSuRuta: false }]);
        expect(r.rutaDe).toEqual(['20']);
    });

    it('lo que Francis tiene de su propia ruta sale como suyo', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'Cond.FRANCIS ', createdById: 20 }), { drivers, routes, ahora });
        expect(r.conductores).toEqual([{ driver: FRANCIS, deSuRuta: true }]);
    });

    it('del portal y sin recoger es del cliente', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'ClienteWeb: DISFER', createdById: 10 }), { drivers, routes, ahora });
        expect(r.tipo).toBe('cliente');
        expect(r.conductores).toEqual([]);
    });

    it('del portal y ya escaneado lo tiene quien escaneó los bultos', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'ClienteWeb: DISFER', createdById: 555, pickedUpById: 20 }), { drivers, routes, ahora });
        expect(r.tipo).toBe('transportista');
        expect(r.conductores).toEqual([{ driver: FRANCIS, deSuRuta: true }]);
    });

    it('creado por uno y escaneado por otro: lo ven los dos', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'Cond.JAVITO ', createdById: 10, pickedUpById: 20 }), { drivers, routes, ahora });
        expect(r.conductores.map(c => c.driver.id)).toEqual([10, 20]);
    });

    it('devuelto por un conductor: sólo lo tiene él, como en el móvil', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'Cond.JAVITO ', createdById: 10, returnedToAssignById: 30 }), { drivers, routes, ahora });
        expect(r.conductores).toEqual([{ driver: PACO, deSuRuta: false }]);
    });

    it('lo tecleado en la oficina no está en el Asignar de nadie', () => {
        const r = pendienteEnAsignar(pendiente({ createdBy: 'Administrador', createdById: null }), { drivers, routes, ahora });
        expect(r.tipo).toBe('oficina');
    });
});

describe('conductoresDeSuRuta', () => {
    it('Montalbán de Córdoba no es Córdoba capital', () => {
        expect(conductoresDeSuRuta(pendiente({ destinationCity: 'MONTALBAN DE CORDOBA' }), routes)).toEqual(['20']);
        expect(conductoresDeSuRuta(pendiente({ destinationCity: 'Córdoba' }), routes)).toEqual(['30']);
    });

    it('una recogida se mira por el origen', () => {
        expect(conductoresDeSuRuta(pendiente({ type: 'Recogida', originCity: 'Cabra', destinationCity: 'Baena' }), routes)).toEqual(['10']);
    });

    it('un pueblo sin ruta no es de nadie', () => {
        expect(conductoresDeSuRuta(pendiente({ destinationCity: 'Estepa', destinationZip: '41560' }), routes)).toEqual([]);
    });
});

describe('diasEnAsignar', () => {
    it('cuenta días de calendario desde el alta o el escaneo, lo último', () => {
        expect(diasEnAsignar(pendiente(), ahora)).toBe(0);
        expect(diasEnAsignar(pendiente({ createdAt: new Date(2026, 8, 27, 23, 0).toISOString() }), ahora)).toBe(2);
        expect(diasEnAsignar(pendiente({
            createdAt: new Date(2026, 8, 25, 9, 0).toISOString(),
            pickedUpAt: new Date(2026, 8, 28, 18, 0).toISOString(),
        }), ahora)).toBe(1);
        expect(textoDeDias(0)).toBe('hoy');
        expect(textoDeDias(1)).toBe('ayer');
        expect(textoDeDias(2)).toBe('hace 2 días');
    });
});
