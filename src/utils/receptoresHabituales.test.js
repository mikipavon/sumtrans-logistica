import { describe, it, expect } from 'vitest';
import {
    agregarReceptor,
    leerReceptores,
    normalizarNombreReceptor,
    direccionPorNombre,
    direccionDeLaChuleta,
    juntarReceptores,
    TOPE_RECEPTORES,
} from './receptoresHabituales';

describe('leerReceptores', () => {
    it('devuelve vacío si la ficha no sabe nada de nadie', () => {
        expect(leerReceptores(null)).toEqual([]);
        expect(leerReceptores({})).toEqual([]);
    });

    it('entiende el lastReceiver de antes, para no perder lo ya guardado', () => {
        const ficha = { lastReceiver: { name: 'Juan Pérez', dni: '12345678X', at: '2026-09-01T10:00:00.000Z' } };
        expect(leerReceptores(ficha)).toEqual([
            { name: 'Juan Pérez', dni: '12345678X', at: '2026-09-01T10:00:00.000Z' },
        ]);
    });

    it('la lista nueva manda sobre el lastReceiver viejo', () => {
        const ficha = {
            lastReceiver: { name: 'Juan Pérez', dni: '12345678X' },
            receivers: [{ name: 'María López', dni: '87654321Z' }],
        };
        expect(leerReceptores(ficha).map(r => r.name)).toEqual(['María López']);
    });

    it('tira los apuntes sin nombre: un DNI suelto no identifica a nadie', () => {
        const ficha = { receivers: [{ name: '  ', dni: '12345678X' }, { name: 'Ana', dni: '' }] };
        expect(leerReceptores(ficha).map(r => r.name)).toEqual(['Ana']);
    });
});

describe('agregarReceptor', () => {
    it('apunta al primero cuando la dirección no tenía a nadie', () => {
        const lista = agregarReceptor(undefined, { name: 'Juan Pérez', dni: '12345678X', at: 'HOY' });
        expect(lista).toEqual([{ name: 'Juan Pérez', dni: '12345678X', at: 'HOY' }]);
    });

    it('pone al de hoy delante y conserva a los de antes', () => {
        const previos = [{ name: 'Juan Pérez', dni: '12345678X', at: 'AYER' }];
        const lista = agregarReceptor(previos, { name: 'María López', dni: '87654321Z', at: 'HOY' });
        expect(lista.map(r => r.name)).toEqual(['María López', 'Juan Pérez']);
    });

    it('no duplica a quien ya estaba: sube al principio', () => {
        const previos = [
            { name: 'María López', dni: '87654321Z', at: 'AYER' },
            { name: 'Juan Pérez', dni: '12345678X', at: 'ANTEAYER' },
        ];
        const lista = agregarReceptor(previos, { name: 'juan perez', dni: '12345678X', at: 'HOY' });
        expect(lista.map(r => r.name)).toEqual(['juan perez', 'María López']);
        expect(lista).toHaveLength(2);
    });

    it('el mismo nombre con y sin tildes es la misma persona', () => {
        const previos = [{ name: 'Jesús Muñoz', dni: '11111111H', at: 'AYER' }];
        const lista = agregarReceptor(previos, { name: 'JESUS MUNOZ', dni: '11111111H', at: 'HOY' });
        expect(lista).toHaveLength(1);
    });

    it('el DNI de hoy pisa al de antes', () => {
        const previos = [{ name: 'Juan Pérez', dni: '00000000A', at: 'AYER' }];
        const lista = agregarReceptor(previos, { name: 'Juan Pérez', dni: '12345678X', at: 'HOY' });
        expect(lista[0].dni).toBe('12345678X');
    });

    it('una entrega sin DNI no borra el que ya teníamos de esa persona', () => {
        const previos = [{ name: 'Juan Pérez', dni: '12345678X', at: 'AYER' }];
        const lista = agregarReceptor(previos, { name: 'Juan Pérez', dni: '', at: 'HOY' });
        expect(lista[0]).toEqual({ name: 'Juan Pérez', dni: '12345678X', at: 'HOY' });
    });

    it('una entrega sin nombre no apunta nada', () => {
        const previos = [{ name: 'Juan Pérez', dni: '12345678X', at: 'AYER' }];
        expect(agregarReceptor(previos, { name: '   ', dni: '99999999B' })).toEqual(previos);
    });

    it('la lista no crece sin fin: cae el más antiguo', () => {
        let lista = [];
        for (let i = 1; i <= TOPE_RECEPTORES + 2; i++) {
            lista = agregarReceptor(lista, { name: `Persona ${i}`, dni: `${i}`, at: `T${i}` });
        }
        expect(lista).toHaveLength(TOPE_RECEPTORES);
        expect(lista[0].name).toBe(`Persona ${TOPE_RECEPTORES + 2}`);
        expect(lista.map(r => r.name)).not.toContain('Persona 1');
    });
});

describe('direccionPorNombre', () => {
    const cartera = [
        {
            id: 1,
            name: 'ELYTEL TELECOMUNICACIONES SL',
            legalName: 'Elytel',
            receivers: [{ name: 'Marisa', dni: '111A' }],
            branches: [{ id: 'b1', name: 'Elytel Almacén', receivers: [{ name: 'Paco', dni: '222B' }] }],
        },
        { id: 2, name: 'Otra Empresa', receivers: [{ name: 'Nadie', dni: '333C' }] },
    ];

    it('encuentra la ficha por su nombre comercial', () => {
        expect(direccionPorNombre('elytel telecomunicaciones sl', cartera).client.id).toBe(1);
    });

    // Lo que le pasaba a Juan Carlos: el albarán lleva escrito el nombre de
    // siempre, y al validar la ficha ese nombre se quedó de razón social.
    it('encuentra la ficha por su razón social, como hace el guardado', () => {
        const direccion = direccionPorNombre('ELYTEL', cartera);
        expect(direccion.client.id).toBe(1);
        expect(direccion.branch).toBeNull();
        expect(leerReceptores(direccionDeLaChuleta(direccion))).toHaveLength(1);
    });

    it('una sede responde por su nombre y con su propia lista', () => {
        const direccion = direccionPorNombre('elytel almacen', cartera);
        expect(direccion.client.id).toBe(1);
        expect(direccionDeLaChuleta(direccion).name).toBe('Elytel Almacén');
        expect(leerReceptores(direccionDeLaChuleta(direccion))[0].name).toBe('Paco');
    });

    it('sin nombre, o con un nombre que no es de nadie, no devuelve ficha', () => {
        expect(direccionPorNombre('   ', cartera)).toBeNull();
        expect(direccionPorNombre('Ferretería Que No Existe', cartera)).toBeNull();
        expect(direccionDeLaChuleta(null)).toBeNull();
        expect(leerReceptores(direccionDeLaChuleta(null))).toEqual([]);
    });
});

describe('juntarReceptores', () => {
    it('la ficha que se queda hereda a los de la otra, sin repetir a nadie', () => {
        const juntos = juntarReceptores(
            [{ name: 'Marisa', dni: '111A', at: 'HOY' }],
            [{ name: 'Paco', dni: '222B', at: 'AYER' }, { name: 'marisa', dni: '', at: 'ANTEAYER' }],
        );
        expect(juntos.map(r => r.name)).toEqual(['Marisa', 'Paco']);
    });

    it('el DNI de la que se queda manda, pero hereda el que a ella le falta', () => {
        const juntos = juntarReceptores(
            [{ name: 'Marisa', dni: '' }],
            [{ name: 'Marisa', dni: '111A' }],
        );
        expect(juntos[0].dni).toBe('111A');
    });

    it('no se pasa del tope al juntar dos listas largas', () => {
        const unos = Array.from({ length: 5 }, (_, i) => ({ name: `A${i}`, dni: `${i}` }));
        const otros = Array.from({ length: 5 }, (_, i) => ({ name: `B${i}`, dni: `${i}` }));
        expect(juntarReceptores(unos, otros)).toHaveLength(TOPE_RECEPTORES);
    });
});

describe('normalizarNombreReceptor', () => {
    it('iguala tildes, mayúsculas, puntos y espacios de más', () => {
        expect(normalizarNombreReceptor('  José  M.  ÁLVAREZ ')).toBe(normalizarNombreReceptor('jose m alvarez'));
    });

    it('la ñ no se convierte en n a medias: Muñoz y Munoz son el mismo', () => {
        expect(normalizarNombreReceptor('Muñoz')).toBe(normalizarNombreReceptor('Munoz'));
    });
});
