import { describe, it, expect } from 'vitest';
import {
    construirAgendaDestinatarios,
    filtrarAgendaDestinatarios,
    normalizarNombreDestinatario
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
