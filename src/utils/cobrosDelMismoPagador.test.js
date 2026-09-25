import { describe, it, expect } from 'vitest';
import { esElMismoPagador, agruparPorPagador, hermanosDe } from './cobrosDelMismoPagador';

// Las tarjetas tal como las construye la pestaña Cobros del repartidor: una por
// albarán y parte, con el pagador ya resuelto.
const linea = (key, payerName, extra = {}) => ({ key, payerName, type: 'porte', ...extra });

// El caso real del 24/09/2026: tres portes debidos del mismo destinatario, uno
// tecleado con los dos apellidos y en otro orden.
const CRISTOBAL = [
    linea('1-porte', 'Cristóbal Merino'),
    linea('2-porte', 'Cristóbal Merino'),
    linea('3-porte', 'Enrique Luque Luque'),
    linea('4-porte', 'Fontarosa'),
    linea('5-porte', 'MERINO NUÑEZ, CRISTOBAL'),
];

describe('esElMismoPagador', () => {
    it('reconoce el mismo nombre con acentos, mayúsculas y apellidos de más', () => {
        expect(esElMismoPagador('Cristóbal Merino', 'CRISTOBAL MERINO')).toBe(true);
        expect(esElMismoPagador('Cristóbal Merino', 'MERINO NUÑEZ, CRISTOBAL')).toBe(true);
        expect(esElMismoPagador('Talleres Ruiz', 'Taller Ruiz S.L.')).toBe(true);
    });

    it('no junta a dos personas distintas', () => {
        expect(esElMismoPagador('Cristóbal Merino', 'Fontarosa')).toBe(false);
        expect(esElMismoPagador('Enrique Luque', 'Antonio Luque')).toBe(false);
    });

    it('los huecos sin pagador no son nadie', () => {
        expect(esElMismoPagador('Destinatario (Debido)', 'Destinatario (Debido)')).toBe(false);
        expect(esElMismoPagador('Remitente', 'Remitente')).toBe(false);
        expect(esElMismoPagador('', '')).toBe(false);
    });
});

describe('agruparPorPagador', () => {
    it('junta las tres tarjetas de Cristóbal aunque una esté escrita distinta', () => {
        const grupos = agruparPorPagador(CRISTOBAL);
        expect(grupos.map(g => g.lineas.map(l => l.key))).toEqual([
            ['1-porte', '2-porte', '5-porte'],
            ['3-porte'],
            ['4-porte'],
        ]);
        expect(grupos[0].nombre).toBe('Cristóbal Merino');
        expect(grupos[0].nombres).toEqual(['Cristóbal Merino', 'MERINO NUÑEZ, CRISTOBAL']);
    });

    it('el porte y el reembolso del mismo destinatario caen en el mismo grupo', () => {
        const grupos = agruparPorPagador([
            linea('9-porte', 'Bar Manolo'),
            linea('9-reembolso', 'BAR MANOLO', { type: 'reembolso' }),
        ]);
        expect(grupos).toHaveLength(1);
        expect(grupos[0].lineas).toHaveLength(2);
    });

    it('cada albarán sin destinatario va solo', () => {
        const grupos = agruparPorPagador([
            linea('a-porte', 'Destinatario (Debido)'),
            linea('b-porte', 'Destinatario (Debido)'),
            linea('c-porte', ''),
        ]);
        expect(grupos).toHaveLength(3);
        expect(grupos[2].nombre).toBe('Sin nombre');
    });

    it('sin líneas no hay grupos', () => {
        expect(agruparPorPagador([])).toEqual([]);
        expect(agruparPorPagador()).toEqual([]);
    });
});

describe('hermanosDe', () => {
    it('devuelve las otras tarjetas del mismo pagador, sin la pulsada', () => {
        const hermanos = hermanosDe(CRISTOBAL[4], CRISTOBAL);
        expect(hermanos.map(l => l.key)).toEqual(['1-porte', '2-porte']);
    });

    it('una tarjeta sola no tiene hermanos', () => {
        expect(hermanosDe(CRISTOBAL[3], CRISTOBAL)).toEqual([]);
        expect(hermanosDe(null, CRISTOBAL)).toEqual([]);
        expect(hermanosDe(linea('x-porte', 'Nadie'), CRISTOBAL)).toEqual([]);
    });
});
