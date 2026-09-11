import { describe, it, expect } from 'vitest';
import {
    faltaElParte,
    laTablaLlevaParte,
    tieneParteEscaneado,
    agruparEnTramos,
    tramosSinParte,
    textoDelTramo,
    TIPO_BAJA,
} from './partesDeBaja';

const baja = (date, extra = {}) => ({ id: date, type: TIPO_BAJA, date, medical_note_received: false, ...extra });

describe('faltaElParte', () => {
    it('una baja recién marcada está pendiente', () => {
        expect(faltaElParte(baja('2026-09-07'))).toBe(true);
    });

    it('deja de estarlo cuando la oficina marca el parte', () => {
        expect(faltaElParte(baja('2026-09-07', { medical_note_received: true }))).toBe(false);
    });

    it('las vacaciones y los días libres no llevan parte', () => {
        expect(faltaElParte({ id: 1, type: 'Vacaciones', date: '2026-09-07' })).toBe(false);
        expect(faltaElParte({ id: 2, type: 'Día Libre', date: '2026-09-07' })).toBe(false);
        expect(faltaElParte({ id: 3, type: 'Asuntos Propios', date: '2026-09-07' })).toBe(false);
    });

    it('sin ausencia no falta nada', () => {
        expect(faltaElParte(null)).toBe(false);
    });
});

describe('tieneParteEscaneado', () => {
    it('con el papel subido', () => {
        expect(tieneParteEscaneado(baja('2026-09-07', { medical_note_received: true, medical_note_path: '1/parte.pdf' }))).toBe(true);
    });

    it('marcado a mano pero sin escanear', () => {
        expect(tieneParteEscaneado(baja('2026-09-07', { medical_note_received: true }))).toBe(false);
    });

    it('las vacaciones no llevan parte aunque traigan ruta', () => {
        expect(tieneParteEscaneado({ id: 1, type: 'Vacaciones', date: '2026-09-07', medical_note_path: 'x.pdf' })).toBe(false);
    });
});

describe('laTablaLlevaParte', () => {
    it('con la migración 24 pasada, las filas traen la columna', () => {
        expect(laTablaLlevaParte([baja('2026-09-07')])).toBe(true);
    });

    it('marcado como recibido también cuenta: lo que importa es que la columna exista', () => {
        expect(laTablaLlevaParte([baja('2026-09-07', { medical_note_received: true })])).toBe(true);
    });

    it('sin la migración no hay columna y el control se queda apagado', () => {
        expect(laTablaLlevaParte([{ id: 1, type: TIPO_BAJA, date: '2026-09-07' }])).toBe(false);
    });

    it('con la tabla vacía no hay nada que avisar', () => {
        expect(laTablaLlevaParte([])).toBe(false);
        expect(laTablaLlevaParte(null)).toBe(false);
    });
});

describe('agruparEnTramos', () => {
    it('días seguidos son un solo parte', () => {
        const tramos = agruparEnTramos([baja('2026-09-07'), baja('2026-09-08'), baja('2026-09-09')]);
        expect(tramos).toHaveLength(1);
        expect(tramos[0].desde).toBe('2026-09-07');
        expect(tramos[0].hasta).toBe('2026-09-09');
        expect(tramos[0].dias).toHaveLength(3);
    });

    it('el fin de semana sin marcar no parte la baja en dos', () => {
        // viernes 11 y lunes 14 de septiembre de 2026
        const tramos = agruparEnTramos([baja('2026-09-11'), baja('2026-09-14')]);
        expect(tramos).toHaveLength(1);
        expect(tramos[0].hasta).toBe('2026-09-14');
    });

    it('dos semanas seguidas de lunes a viernes son UN parte', () => {
        const dias = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11',
                      '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'];
        const tramos = agruparEnTramos(dias.map(d => baja(d)));
        expect(tramos).toHaveLength(1);
        expect(tramos[0].dias).toHaveLength(10);
    });

    it('un día laborable de por medio sí separa dos bajas', () => {
        // martes 8 y jueves 10: el miércoles vino a trabajar
        const tramos = agruparEnTramos([baja('2026-09-08'), baja('2026-09-10')]);
        expect(tramos).toHaveLength(2);
    });

    it('llegan desordenadas y salen en orden', () => {
        const tramos = agruparEnTramos([baja('2026-09-09'), baja('2026-09-07'), baja('2026-09-08')]);
        expect(tramos).toHaveLength(1);
        expect(tramos[0].desde).toBe('2026-09-07');
    });

    it('un tramo se lleva los ids de todos sus días, que es lo que se marca de golpe', () => {
        const tramos = agruparEnTramos([
            { id: 'a', type: TIPO_BAJA, date: '2026-09-07' },
            { id: 'b', type: TIPO_BAJA, date: '2026-09-08' },
        ]);
        expect(tramos[0].ids).toEqual(['a', 'b']);
    });

    it('sin ausencias no hay tramos', () => {
        expect(agruparEnTramos([])).toEqual([]);
        expect(agruparEnTramos(null)).toEqual([]);
    });
});

describe('tramosSinParte', () => {
    it('deja fuera las vacaciones y las bajas ya justificadas', () => {
        const tramos = tramosSinParte([
            { id: 1, type: 'Vacaciones', date: '2026-08-03' },
            baja('2026-09-07', { medical_note_received: true }),
            baja('2026-09-21'),
            baja('2026-09-22'),
        ]);
        expect(tramos).toHaveLength(1);
        expect(tramos[0].desde).toBe('2026-09-21');
        expect(tramos[0].hasta).toBe('2026-09-22');
    });

    it('si el parte llega a medias, sólo quedan pendientes los días que faltan', () => {
        const tramos = tramosSinParte([
            baja('2026-09-07', { medical_note_received: true }),
            baja('2026-09-08', { medical_note_received: true }),
            baja('2026-09-09'),
        ]);
        expect(tramos).toHaveLength(1);
        expect(tramos[0].dias).toEqual(['2026-09-09']);
    });
});

describe('textoDelTramo', () => {
    it('un solo día', () => {
        expect(textoDelTramo({ desde: '2026-09-12', hasta: '2026-09-12' })).toBe('12 de septiembre');
    });

    it('varios días del mismo mes', () => {
        expect(textoDelTramo({ desde: '2026-09-07', hasta: '2026-09-18' })).toBe('del 7 al 18 de septiembre');
    });

    it('a caballo entre dos meses', () => {
        expect(textoDelTramo({ desde: '2026-09-28', hasta: '2026-10-09' })).toBe('del 28 de septiembre al 9 de octubre');
    });
});
