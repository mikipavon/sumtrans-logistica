import { describe, it, expect } from 'vitest';
import { agenciasDeLaFicha, estaOcultaPorAgencia } from './agenciasDeLaFicha';

const TSB = { id: 1, name: 'TSB', isAgency: true };
const XPO = { id: 2, name: 'XPO Logistics', isAgency: true };
const OTRA = { id: 3, name: 'TRANSPORTES PEPE', isAgency: true };

const mando = (...nombres) => ({
    sentido: 'recibe',
    todos: nombres.map(nombre => ({ clave: nombre.toLowerCase(), nombre })),
});

describe('agenciasDeLaFicha', () => {
    it('la bolsa de la ficha dice de qué agencia es', () => {
        expect(agenciasDeLaFicha({ id: 10, ownerAgencyId: 1 }, [TSB, XPO])).toEqual(['tsb']);
        expect(agenciasDeLaFicha({ id: 11, ownerAgencyId: '2' }, [TSB, XPO])).toEqual(['xpo']);
    });

    it('la bolsa manda sobre la mercancía', () => {
        expect(agenciasDeLaFicha({ id: 10, ownerAgencyId: 1 }, [TSB], mando('PROSERVICE'))).toEqual(['tsb']);
    });

    it('una bolsa que no es ninguna de las tres, o que ya no existe, no cuenta', () => {
        expect(agenciasDeLaFicha({ id: 10, ownerAgencyId: 3 }, [TSB, OTRA])).toEqual([]);
        expect(agenciasDeLaFicha({ id: 10, ownerAgencyId: 99 }, [TSB])).toEqual([]);
    });

    it('sin bolsa, se saca de quién le mandó la mercancía', () => {
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('TSB'))).toEqual(['tsb']);
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('T.S.B.'))).toEqual(['tsb']);
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('Almacén TXT Córdoba'))).toEqual(['txt']);
    });

    it('si también le mandó un cliente nuestro, la ficha es nuestra', () => {
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('TSB', 'PROSERVICE'))).toEqual([]);
    });

    it('con mercancía de dos agencias lleva las dos', () => {
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('TSB', 'XPO Logistics', 'TSB Córdoba'))).toEqual(['tsb', 'xpo']);
    });

    it('EXPODISEÑO no es XPO', () => {
        expect(agenciasDeLaFicha({ id: 10 }, [], mando('EXPODISEÑO'))).toEqual([]);
    });

    it('a un remitente no se le mira a quién mandó', () => {
        const aQuien = { sentido: 'manda', todos: [{ clave: 'tsb', nombre: 'TSB' }] };
        expect(agenciasDeLaFicha({ id: 10, type: 'Remitente' }, [], aQuien)).toEqual([]);
    });

    it('sin bolsa y sin albarán cargado no se sabe, así que se ve', () => {
        expect(agenciasDeLaFicha({ id: 10 }, [TSB], null)).toEqual([]);
        expect(agenciasDeLaFicha(null, [TSB], null)).toEqual([]);
    });
});

describe('estaOcultaPorAgencia', () => {
    it('se oculta cuando su agencia está quitada', () => {
        expect(estaOcultaPorAgencia(['tsb'], ['tsb', 'xpo'])).toBe(true);
        expect(estaOcultaPorAgencia(['tsb'], ['xpo'])).toBe(false);
    });

    it('la de dos agencias sólo se oculta con las dos quitadas', () => {
        expect(estaOcultaPorAgencia(['tsb', 'xpo'], ['tsb'])).toBe(false);
        expect(estaOcultaPorAgencia(['tsb', 'xpo'], ['xpo', 'tsb'])).toBe(true);
    });

    it('la que no es de ninguna agencia no se oculta nunca', () => {
        expect(estaOcultaPorAgencia([], ['tsb', 'txt', 'xpo'])).toBe(false);
        expect(estaOcultaPorAgencia(undefined, ['tsb'])).toBe(false);
    });
});
