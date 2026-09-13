import { describe, it, expect } from 'vitest';
import {
    construirAgendaDestinatarios,
    filtrarAgendaDestinatarios,
    normalizarNombreDestinatario,
    agendaDesdeServidor,
    juntarAgendas
} from './agendaDestinatarios';

const envio = (destinationName, extras = {}) => ({
    id: `SUM-${Math.random()}`,
    destinationName,
    destinationAddress: 'C/ Mayor 1',
    destinationZip: '14900',
    destinationCity: 'Lucena',
    createdAt: '2026-08-01T10:00:00.000Z',
    ...extras
});

describe('normalizarNombreDestinatario', () => {
    it('quita acentos, mayúsculas y puntuación', () => {
        expect(normalizarNombreDestinatario('Ferretería Córdoba, S.L.')).toBe('ferreteria cordoba s l');
    });

    it('conserva los números, que distinguen empresas', () => {
        expect(normalizarNombreDestinatario('Talleres 2000')).toBe('talleres 2000');
        expect(normalizarNombreDestinatario('Talleres 2000'))
            .not.toBe(normalizarNombreDestinatario('Talleres 3000'));
    });
});

describe('construirAgendaDestinatarios', () => {
    it('saca los destinatarios de los envíos, sin tocar la tabla de clientes', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Ferretería Luna'),
            envio('Panadería Sur')
        ]);

        expect(agenda.map(c => c.name)).toEqual(['Ferretería Luna', 'Panadería Sur']);
        expect(agenda[0]).toMatchObject({ address: 'C/ Mayor 1', zip: '14900', city: 'Lucena' });
    });

    it('agrupa al mismo destinatario aunque esté escrito distinto', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Ferretería Luna'),
            envio('FERRETERIA LUNA'),
            envio('ferreteria  luna')
        ]);

        expect(agenda).toHaveLength(1);
        expect(agenda[0].veces).toBe(3);
    });

    it('ordena por habituales: primero al que más se manda', () => {
        const agenda = construirAgendaDestinatarios([
            envio('De vez en cuando'),
            envio('Habitual'),
            envio('Habitual'),
            envio('Habitual')
        ]);

        expect(agenda.map(c => c.name)).toEqual(['Habitual', 'De vez en cuando']);
    });

    it('a igualdad de envíos, primero el más reciente', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Antiguo', { createdAt: '2026-01-05T10:00:00.000Z' }),
            envio('Reciente', { createdAt: '2026-08-15T10:00:00.000Z' })
        ]);

        expect(agenda.map(c => c.name)).toEqual(['Reciente', 'Antiguo']);
    });

    it('se queda con la dirección del envío más reciente: el destinatario se muda', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Ferretería Luna', {
                createdAt: '2026-01-10T10:00:00.000Z',
                destinationAddress: 'C/ Vieja 3',
                destinationCity: 'Cabra'
            }),
            envio('Ferretería Luna', {
                createdAt: '2026-08-10T10:00:00.000Z',
                destinationAddress: 'Pol. Ind. Nave 7',
                destinationCity: 'Lucena'
            })
        ]);

        expect(agenda[0]).toMatchObject({ address: 'Pol. Ind. Nave 7', city: 'Lucena' });
    });

    it('un envío nuevo sin CP no borra el CP que ya se conocía', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Ferretería Luna', { createdAt: '2026-01-10T10:00:00.000Z', destinationZip: '14940' }),
            envio('Ferretería Luna', { createdAt: '2026-08-10T10:00:00.000Z', destinationZip: '' })
        ]);

        expect(agenda[0].zip).toBe('14940');
    });

    it('ignora envíos sin destinatario en vez de crear una entrada en blanco', () => {
        const agenda = construirAgendaDestinatarios([
            envio(''),
            envio('   '),
            envio(null),
            envio('Real')
        ]);

        expect(agenda.map(c => c.name)).toEqual(['Real']);
    });

    it('aguanta que no haya envíos', () => {
        expect(construirAgendaDestinatarios([])).toEqual([]);
        expect(construirAgendaDestinatarios(null)).toEqual([]);
    });

    it('usa la dirección larga cuando el envío no trae la de destino desglosada', () => {
        const agenda = construirAgendaDestinatarios([
            envio('Sin desglose', { destinationAddress: '', destination: '14900 Lucena, ES' })
        ]);

        expect(agenda[0].address).toBe('14900 Lucena, ES');
    });
});

describe('filtrarAgendaDestinatarios', () => {
    const agenda = construirAgendaDestinatarios([
        envio('Ferretería Córdoba'),
        envio('Panadería Sur'),
        envio('Almacenes Luna')
    ]);

    it('sin nada escrito enseña los habituales', () => {
        expect(filtrarAgendaDestinatarios(agenda, '')).toHaveLength(3);
    });

    it('busca sin importar acentos ni mayúsculas', () => {
        expect(filtrarAgendaDestinatarios(agenda, 'CORDOBA').map(c => c.name)).toEqual(['Ferretería Córdoba']);
        expect(filtrarAgendaDestinatarios(agenda, 'panaderia').map(c => c.name)).toEqual(['Panadería Sur']);
    });

    it('busca por cualquier trozo del nombre, no sólo por el principio', () => {
        expect(filtrarAgendaDestinatarios(agenda, 'luna').map(c => c.name)).toEqual(['Almacenes Luna']);
    });

    it('no devuelve más sugerencias de las que caben', () => {
        const muchos = construirAgendaDestinatarios(
            Array.from({ length: 30 }, (_, i) => envio(`Cliente ${i}`))
        );
        expect(filtrarAgendaDestinatarios(muchos, '')).toHaveLength(8);
        expect(filtrarAgendaDestinatarios(muchos, '', 3)).toHaveLength(3);
    });

    it('devuelve lista vacía si no encaja nada', () => {
        expect(filtrarAgendaDestinatarios(agenda, 'zzzz')).toEqual([]);
    });
});

// ── El enlace con nuestra ficha viaja con la entrada de la agenda (fase 26) ──
//
// Si un envío anterior a ese destinatario estaba enlazado con una ficha nuestra,
// el envío nuevo tiene que nacer apuntando a la misma ficha, aunque el nombre
// esté escrito de otra manera. Sin esto, la entrega crea otra ficha.
describe('construirAgendaDestinatarios · el enlace con la ficha', () => {
    it('sin enlace en ningún envío, la entrada va sin ficha', () => {
        const [entrada] = construirAgendaDestinatarios([envio('Ferretería Luna')]);
        expect(entrada.destinatarioId).toBeNull();
        expect(entrada.destinatarioSedeId).toBeNull();
    });

    it('se lleva el enlace del envío que lo tenga', () => {
        const [entrada] = construirAgendaDestinatarios([
            envio('Ferretería Luna'),
            envio('Ferretería Luna', { destinatarioId: 101, destinatarioSedeId: 'sede-2' })
        ]);
        expect(entrada.destinatarioId).toBe(101);
        expect(entrada.destinatarioSedeId).toBe('sede-2');
    });

    it('un envío nuevo sin enlace (recién creado, aún sin emparejar) no borra el que había', () => {
        const [entrada] = construirAgendaDestinatarios([
            envio('Ferretería Luna', { destinatarioId: 101, createdAt: '2026-08-01T10:00:00.000Z' }),
            envio('Ferretería Luna', { createdAt: '2026-09-01T10:00:00.000Z' })
        ]);
        expect(entrada.destinatarioId).toBe(101);
    });

    it('entre dos enlaces distintos manda el del envío más reciente', () => {
        const [entrada] = construirAgendaDestinatarios([
            envio('Ferretería Luna', { destinatarioId: 101, createdAt: '2026-09-01T10:00:00.000Z' }),
            envio('Ferretería Luna', { destinatarioId: 202, createdAt: '2026-08-01T10:00:00.000Z' })
        ]);
        expect(entrada.destinatarioId).toBe(101);
    });
});

// ── La agenda que calcula el servidor llega en la misma forma que la local ──
describe('agendaDesdeServidor', () => {
    const fila = (nombre, extras = {}) => ({
        nombre, direccion: 'Pol. Ind. 4', cp: '14900', poblacion: 'Lucena',
        ficha_id: null, sede_id: null, veces: 2, ultimo_envio: '2026-08-01T10:00:00.000Z', ...extras
    });

    it('traduce las filas del servidor a entradas de agenda', () => {
        const agenda = agendaDesdeServidor([fila('Agro Velasco S.L.', { ficha_id: 101, sede_id: 'sede-2', veces: 5 })]);
        expect(agenda).toHaveLength(1);
        expect(agenda[0]).toMatchObject({
            name: 'Agro Velasco S.L.', address: 'Pol. Ind. 4', zip: '14900', city: 'Lucena',
            veces: 5, destinatarioId: 101, destinatarioSedeId: 'sede-2'
        });
        expect(agenda[0].clave).toBe('agro velasco s l');
    });

    it('ordena como la local: primero los habituales', () => {
        const agenda = agendaDesdeServidor([fila('Poco', { veces: 1 }), fila('Mucho', { veces: 9 })]);
        expect(agenda.map(c => c.name)).toEqual(['Mucho', 'Poco']);
    });

    it('dos filas con el mismo nombre se juntan: manda la que tiene ficha y las veces se suman', () => {
        const agenda = agendaDesdeServidor([
            fila('AGRO VELASCO', { veces: 3, direccion: '', cp: '', poblacion: '' }),
            fila('Agro Velasco', { ficha_id: 101, veces: 2 })
        ]);
        expect(agenda).toHaveLength(1);
        expect(agenda[0]).toMatchObject({ name: 'Agro Velasco', destinatarioId: 101, veces: 5, address: 'Pol. Ind. 4' });
    });

    it('aguanta filas vacías, sin nombre o sin nada', () => {
        expect(agendaDesdeServidor(null)).toEqual([]);
        expect(agendaDesdeServidor([fila(''), null, fila('   ')])).toEqual([]);
    });
});

// ── Servidor y local, juntas: el servidor manda y la local sólo aporta lo nuevo ──
describe('juntarAgendas', () => {
    const entrada = (name, extras = {}) => ({
        clave: normalizarNombreDestinatario(name), name, address: '', zip: '', city: '',
        veces: 1, ultimoEnvio: 0, destinatarioId: null, destinatarioSedeId: null, ...extras
    });

    it('lo que el servidor conoce sale del servidor (con su ficha), no de la local', () => {
        const agenda = juntarAgendas(
            [entrada('Agro Velasco', { destinatarioId: 101, veces: 8 })],
            [entrada('AGRO VELASCO', { veces: 1 })]
        );
        expect(agenda).toHaveLength(1);
        expect(agenda[0]).toMatchObject({ name: 'Agro Velasco', destinatarioId: 101, veces: 8 });
    });

    it('lo recién creado en la sesión, que el servidor aún no conoce, entra de la local', () => {
        const agenda = juntarAgendas([entrada('Agro Velasco', { veces: 8 })], [entrada('Nuevo de hoy')]);
        expect(agenda.map(c => c.name)).toEqual(['Agro Velasco', 'Nuevo de hoy']);
    });

    it('sin servidor (aún no ha contestado o ha fallado) queda la local tal cual', () => {
        expect(juntarAgendas(null, [entrada('Ferretería Luna')]).map(c => c.name)).toEqual(['Ferretería Luna']);
        expect(juntarAgendas([], [])).toEqual([]);
    });
});
