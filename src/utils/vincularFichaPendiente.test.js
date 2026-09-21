import { describe, it, expect } from 'vitest';
import { planDeVinculo, enviosQueSeVinculan, enlaceDelEnvio, explicarElVinculo } from './vincularFichaPendiente';

// La ficha que creó el conductor al entregar: el nombre tal cual venía en el
// albarán, la calle y el GPS.
const pendiente = {
    id: 388,
    name: 'FERRETERIA EL REPUESTO, S.L.',
    address: 'GRANADILLOS DE MEDINA, 22',
    city: 'CASTRO DEL RIO',
    zip: '14840',
    coordinates: '37.690619, -4.478713',
    status: 'pending',
    createdFrom: 'Reparto (Driver)',
    receivers: [{ name: 'Joaquín', dni: '12345678A', at: '2026-09-16' }],
};

// La de siempre, con el nombre de la oficina.
const ficha = {
    id: 26,
    name: 'FERRETERIA EL REPUESTO JOAQUIN SALIDO',
    clientNumber: 'P-26',
    address: 'C/ Granadillos de Medina 22',
    city: 'Castro del Río',
    zip: '14840',
    phone: '957370000',
    tariffType: 'General',
};

describe('planDeVinculo', () => {
    it('con otro nombre, cuelga una sede con el nombre del albarán y lo que trajo la entrega', () => {
        const plan = planDeVinculo(pendiente, ficha, 1000);

        expect(plan.posible).toBe(true);
        expect(plan.sedeNueva).toBe(true);
        expect(plan.sedeId).toBe('branch_1000');
        // A la madre sólo se le escriben las sedes: nombre, tarifa y número no se tocan.
        expect(Object.keys(plan.cambios)).toEqual(['branches']);
        expect(plan.cambios.branches).toHaveLength(1);
        expect(plan.cambios.branches[0]).toMatchObject({
            id: 'branch_1000',
            name: 'FERRETERIA EL REPUESTO, S.L.',
            address: 'GRANADILLOS DE MEDINA, 22',
            city: 'CASTRO DEL RIO',
            zip: '14840',
            coordinates: '37.690619, -4.478713',
            receivers: [{ name: 'Joaquín', dni: '12345678A', at: '2026-09-16' }],
        });
        expect(plan.hereda).toEqual(['coordinates', 'address', 'city', 'zip', 'receivers']);
    });

    it('la sede nueva toma de la madre la dirección que la pendiente no trae', () => {
        const escueta = { id: 1, name: 'EL REPUESTO SL', coordinates: '37.6, -4.4' };
        const plan = planDeVinculo(escueta, ficha, 1);

        expect(plan.cambios.branches[0]).toMatchObject({
            address: 'C/ Granadillos de Medina 22',
            city: 'Castro del Río',
            zip: '14840',
            coordinates: '37.6, -4.4',
        });
        expect(plan.cambios.branches[0].receivers).toBeUndefined();
    });

    it('conserva las sedes que ya tenía la ficha', () => {
        const conSede = { ...ficha, branches: [{ id: 'branch_1', name: 'ALMACEN', address: 'Pol. 3' }] };
        const plan = planDeVinculo(pendiente, conSede, 2);

        expect(plan.cambios.branches.map(s => s.name)).toEqual(['ALMACEN', 'FERRETERIA EL REPUESTO, S.L.']);
    });

    it('si ya se llama igual que la madre (sin tildes ni mayúsculas), sólo rellena huecos', () => {
        const igual = { ...pendiente, name: 'ferretería el repuesto joaquin salido' };
        const sinGps = { ...ficha, coordinates: '', address: '' };
        const plan = planDeVinculo(igual, sinGps);

        expect(plan.sedeNueva).toBe(false);
        expect(plan.sedeId).toBeNull();
        expect(plan.cambios).toEqual({
            coordinates: '37.690619, -4.478713',
            address: 'GRANADILLOS DE MEDINA, 22',
            receivers: [{ name: 'Joaquín', dni: '12345678A', at: '2026-09-16' }],
            lastReceiver: null,
        });
        // Lo que la madre ya tenía no se pisa.
        expect(plan.cambios.phone).toBeUndefined();
        expect(plan.cambios.zip).toBeUndefined();
    });

    it('si coincide con la razón social también es la madre', () => {
        const plan = planDeVinculo({ id: 2, name: 'El Repuesto S.L.', phone: '600111222' }, { ...ficha, legalName: 'EL REPUESTO S.L.', phone: '' });

        expect(plan.sedeNueva).toBe(false);
        expect(plan.cambios).toEqual({ phone: '600111222' });
    });

    it('si coincide con una sede que ya existe, rellena esa sede y ata los albaranes a ella', () => {
        const conSede = { ...ficha, branches: [{ id: 'branch_7', name: 'FERRETERIA EL REPUESTO, S.L.', address: 'Otra calle', coordinates: '' }] };
        const plan = planDeVinculo(pendiente, conSede);

        expect(plan.sedeNueva).toBe(false);
        expect(plan.sedeId).toBe('branch_7');
        expect(plan.cambios.branches).toHaveLength(1);
        // La calle que ya tenía la sede no se pisa; lo que le faltaba, sí.
        expect(plan.cambios.branches[0]).toMatchObject({ id: 'branch_7', address: 'Otra calle', coordinates: '37.690619, -4.478713', city: 'CASTRO DEL RIO', zip: '14840' });
        expect(plan.hereda).toEqual(['coordinates', 'city', 'zip', 'receivers']);
    });

    it('quien recibió en la pendiente va delante de los que ya conocía la ficha', () => {
        const igual = { ...pendiente, name: ficha.name };
        const conReceptores = { ...ficha, receivers: [{ name: 'Manuel', dni: '', at: '2026-01-01' }] };
        const plan = planDeVinculo(igual, conReceptores);

        expect(plan.cambios.receivers.map(r => r.name)).toEqual(['Joaquín', 'Manuel']);
    });

    it('no vincula una ficha consigo misma ni sin nombre', () => {
        expect(planDeVinculo(ficha, ficha).posible).toBe(false);
        expect(planDeVinculo({ id: 3, name: '  ' }, ficha).posible).toBe(false);
        expect(planDeVinculo(null, ficha).posible).toBe(false);
    });
});

describe('enviosQueSeVinculan', () => {
    const envios = [
        { id: 'SUM-1426', destinationName: 'FERRETERIA EL REPUESTO, S.L.', destinatarioId: 388 },
        { id: 'SUM-1400', destinationName: 'Ferretería el Repuesto, S.L.' },
        { id: 'SUM-1300', destinationName: 'FERRETERIA EL REPUESTO, S.L.', destinatarioId: 26 },
        { id: 'SUM-1200', destinationName: 'OTRA EMPRESA' },
        null,
    ];

    it('coge los que apuntan a la pendiente y los sueltos con el mismo nombre; los ya atados a otra ficha no', () => {
        expect(enviosQueSeVinculan(pendiente, envios).map(e => e.id)).toEqual(['SUM-1426', 'SUM-1400']);
    });

    it('sin pendiente o sin envíos no hay nada', () => {
        expect(enviosQueSeVinculan(null, envios)).toEqual([]);
        expect(enviosQueSeVinculan(pendiente, undefined)).toEqual([]);
    });
});

describe('enlaceDelEnvio', () => {
    it('ata el albarán a la ficha y a la sede del plan, y deja constancia de que fue a mano', () => {
        expect(enlaceDelEnvio(ficha, { sedeId: 'branch_1000' })).toEqual({
            destinatarioId: 26,
            destinatarioSedeId: 'branch_1000',
            destinatarioEmparejadoPor: 'vinculo',
        });
        expect(enlaceDelEnvio(ficha, { sedeId: null }).destinatarioSedeId).toBeNull();
    });
});

describe('explicarElVinculo', () => {
    it('dice qué ficha se queda, que se le añade una sede, cuántos albaranes y que la solicitud se borra', () => {
        const plan = planDeVinculo(pendiente, ficha, 1);
        const texto = explicarElVinculo(pendiente, ficha, plan, 2);

        expect(texto).toContain('«FERRETERIA EL REPUESTO JOAQUIN SALIDO» (nº P-26)');
        expect(texto).toContain('se le añade una sede llamada «FERRETERIA EL REPUESTO, S.L.»');
        expect(texto).toContain('el GPS');
        expect(texto).toContain('2 albaranes pasan a apuntar');
        expect(texto).toContain('La solicitud «FERRETERIA EL REPUESTO, S.L.» se borra');
        expect(texto).toContain('¿Vincular?');
    });

    it('cuando ya se llama igual lo dice, y sin plan no dice nada', () => {
        const igual = { ...pendiente, name: ficha.name };
        const texto = explicarElVinculo(igual, ficha, planDeVinculo(igual, ficha), 0);

        expect(texto).toContain('ya se llama así');
        expect(texto).toContain('Ningún albarán cargado apuntaba');
        expect(explicarElVinculo(igual, ficha, { posible: false })).toBe('');
    });
});
