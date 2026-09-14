import { describe, it, expect } from 'vitest';
import { buscarConductor, detectarMes } from './emparejarNomina';

// Los tres ficheros de agosto de 2026 que se asignaron mal.
const FRANCISCO = 'PAVON MAIZ FRANCISCO JAVIER - NOMINA AGOSTO 2026.pdf';
const MIGUEL = 'PAVON MAIZ MIGUEL ANGEL - NOMINA AGOSTO 2026.pdf';
const VICTOR = 'PAVON MAIZ VICTOR MANUEL - NOMINA AGOSTO 2026.pdf';

const AGUILAR = { id: 'a', name: 'FRANCISCO MANUEL AGUILAR SANCHEZ', alias: 'Francisco' };
const MIGUEL_PAVON = { id: 'm', name: 'Miguel pavon', alias: '' };
const VICTOR_PAVON = { id: 'v', name: 'VICTOR PAVON', alias: 'Victor' };
const CONDUCTORES = [AGUILAR, MIGUEL_PAVON, VICTOR_PAVON];

describe('a quién es la nómina', () => {
    it('un alias de una sola palabra no se lleva la nómina de otro con el mismo nombre de pila', () => {
        expect(buscarConductor(FRANCISCO, CONDUCTORES)).toBeNull();
    });

    it('reconoce al conductor aunque el fichero ponga los apellidos delante', () => {
        expect(buscarConductor(MIGUEL, CONDUCTORES)).toBe(MIGUEL_PAVON);
        expect(buscarConductor(VICTOR, CONDUCTORES)).toBe(VICTOR_PAVON);
    });

    it('se lo da al conductor que es cuando está dado de alta', () => {
        const franciscoJavier = { id: 'f', name: 'Francisco Javier Pavon Maiz', alias: '' };
        expect(buscarConductor(FRANCISCO, [...CONDUCTORES, franciscoJavier])).toBe(franciscoJavier);
    });

    it('en el texto del PDF, las partes del nombre tienen que ir juntas', () => {
        const texto = 'Firma: MIGUEL RODRIGUEZ, administrador. ' + 'x '.repeat(40) + 'Trabajador: GARCIA PAVON, JUAN';
        expect(buscarConductor(texto, CONDUCTORES)).toBeNull();
        expect(buscarConductor('Trabajador: PAVON, MIGUEL', CONDUCTORES)).toBe(MIGUEL_PAVON);
    });

    it('si dos fichas empatan del todo, se deja para asignar a mano', () => {
        const repetido = { id: 'm2', name: 'Miguel Pavon', alias: '' };
        expect(buscarConductor(MIGUEL, [MIGUEL_PAVON, repetido])).toBeNull();
    });

    it('prefiere al que coincide en más partes del nombre', () => {
        const largo = { id: 'ma', name: 'Miguel Angel Pavon', alias: '' };
        expect(buscarConductor(MIGUEL, [MIGUEL_PAVON, largo])).toBe(largo);
    });
});

describe('de qué mes es', () => {
    it('manda el nombre del fichero aunque el PDF hable de otros meses', () => {
        const texto = 'Antigüedad 15 mayo 2019. Base de cotización mayor. Periodo agosto 2026';
        expect(detectarMes(FRANCISCO, texto)).toBe('Nómina Agosto 2026');
    });

    it('"mayor" no es mayo', () => {
        expect(detectarMes('nomina.pdf', 'Cotizacion mayor 2026 periodo septiembre de 2026')).toBe('Nómina Septiembre 2026');
    });

    it('lee "setiembre" y las fechas con barras', () => {
        expect(detectarMes('NOMINA SETIEMBRE 2026.pdf')).toBe('Nómina Septiembre 2026');
        expect(detectarMes('doc.pdf', 'Fecha 31/08/2026')).toBe('Nómina Agosto 2026');
    });

    it('sin mes, no se inventa ninguno', () => {
        expect(detectarMes('documento001.pdf', 'sin fechas')).toBeNull();
    });
});
