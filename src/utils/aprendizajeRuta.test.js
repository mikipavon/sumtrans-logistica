import { describe, it, expect } from 'vitest';
import {
    ordenRelativo,
    adaptarConocimiento,
    registrarEntrega,
    memoriaDelPueblo,
    confianzaDeMemoria,
    ordenDeCliente,
    contarPueblosMemorizados,
} from './aprendizajeRuta';

describe('ordenRelativo', () => {
    it('el primero es 0 y el último es 1, den igual las paradas que haya', () => {
        expect(ordenRelativo(1, 3)).toBe(0);
        expect(ordenRelativo(3, 3)).toBe(1);
        expect(ordenRelativo(1, 9)).toBe(0);
        expect(ordenRelativo(9, 9)).toBe(1);
    });

    it('el de en medio cae en medio', () => {
        expect(ordenRelativo(2, 3)).toBe(0.5);
        expect(ordenRelativo(5, 9)).toBe(0.5);
    });

    // Esto es lo que hacía que un pueblo de paso clavara a su cliente en cabeza.
    it('un pueblo con una sola parada no enseña nada', () => {
        expect(ordenRelativo(1, 1)).toBeNull();
        expect(ordenRelativo(1, 0)).toBeNull();
    });
});

describe('registrarEntrega', () => {
    it('guarda el orden relativo, no la posición absoluta', () => {
        const datos = registrarEntrega(null, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 1, total: 4,
        });
        expect(ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'manana'), 'Mamaki')).toBe(0);
    });

    it('separa lo que se aprende de mañana de lo de tarde', () => {
        let datos = registrarEntrega(null, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 1, total: 3,
        });
        datos = registrarEntrega(datos, {
            pueblo: 'Cabra', turno: 'tarde', cliente: 'Mamaki', posicion: 3, total: 3,
        });
        expect(ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'manana'), 'Mamaki')).toBe(0);
        expect(ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'tarde'), 'Mamaki')).toBe(1);
    });

    it('un día con una sola parada no ensucia lo aprendido', () => {
        const antes = registrarEntrega(null, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 3, total: 3,
        });
        const despues = registrarEntrega(antes, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 1, total: 1,
        });
        expect(ordenDeCliente(memoriaDelPueblo(despues, 'Cabra', 'manana'), 'Mamaki')).toBe(1);
    });

    it('la media se mueve poco a poco, no de golpe', () => {
        let datos = null;
        for (let i = 0; i < 5; i++) {
            datos = registrarEntrega(datos, {
                pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 1, total: 5,
            });
        }
        // Un día raro en el que va último no debe tirar la memoria hasta el final.
        datos = registrarEntrega(datos, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 5, total: 5,
        });
        const orden = ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'manana'), 'Mamaki');
        expect(orden).toBeGreaterThan(0);
        expect(orden).toBeLessThan(0.3);
    });

    it('el nombre del pueblo se normaliza al guardar y al leer', () => {
        const datos = registrarEntrega(null, {
            pueblo: 'MONTALBÁN DE CÓRDOBA (14548)', turno: 'manana',
            cliente: 'Mamaki', posicion: 1, total: 3,
        });
        // Se lee con el nombre tal cual está escrito en la ruta: antes no coincidía.
        const memoria = memoriaDelPueblo(datos, 'Montalbán de Córdoba', 'manana');
        expect(ordenDeCliente(memoria, 'Mamaki')).toBe(0);
    });
});

describe('memoriaDelPueblo', () => {
    it('si el turno no tiene historial, vale el del turno contrario', () => {
        const datos = registrarEntrega(null, {
            pueblo: 'Cabra', turno: 'manana', cliente: 'Mamaki', posicion: 1, total: 3,
        });
        expect(ordenDeCliente(memoriaDelPueblo(datos, 'Cabra', 'tarde'), 'Mamaki')).toBe(0);
    });

    it('un pueblo desconocido devuelve memoria vacía', () => {
        expect(memoriaDelPueblo(null, 'Cabra', 'manana')).toEqual({});
        expect(memoriaDelPueblo({ _v: 2 }, 'Sevilla', 'manana')).toEqual({});
    });
});

describe('adaptarConocimiento (datos que ya hay en producción)', () => {
    // Formato viejo: pueblo crudo -> cliente -> {avg, count} con posición absoluta.
    const viejo = {
        'cabra': {
            'mamaki': { avg: 1.2, count: 10 },
            'ferreteria': { avg: 2.4, count: 8 },
            'panaderia': { avg: 3.9, count: 6 },
        },
    };

    it('conserva el orden que se había aprendido', () => {
        const memoria = memoriaDelPueblo(adaptarConocimiento(viejo), 'Cabra', 'manana');
        const mamaki = ordenDeCliente(memoria, 'mamaki');
        const ferreteria = ordenDeCliente(memoria, 'ferreteria');
        const panaderia = ordenDeCliente(memoria, 'panaderia');
        expect(mamaki).toBeLessThan(ferreteria);
        expect(ferreteria).toBeLessThan(panaderia);
        expect(mamaki).toBe(0);
        expect(panaderia).toBe(1);
    });

    it('el historial viejo vale para los dos turnos hasta que haya propio', () => {
        const adaptado = adaptarConocimiento(viejo);
        expect(ordenDeCliente(memoriaDelPueblo(adaptado, 'Cabra', 'manana'), 'mamaki')).toBe(0);
        expect(ordenDeCliente(memoriaDelPueblo(adaptado, 'Cabra', 'tarde'), 'mamaki')).toBe(0);
    });

    it('fusiona las claves que se escribían de varias maneras', () => {
        const duplicado = {
            'lucena': { 'mamaki': { avg: 1, count: 10 } },
            'LUCENA (14900)': { 'ferreteria': { avg: 1, count: 4 } },
        };
        const adaptado = adaptarConocimiento(duplicado);
        expect(contarPueblosMemorizados(adaptado)).toBe(1);
        const memoria = memoriaDelPueblo(adaptado, 'Lucena', 'manana');
        expect(ordenDeCliente(memoria, 'mamaki')).not.toBeNull();
        expect(ordenDeCliente(memoria, 'ferreteria')).not.toBeNull();
    });

    it('adaptar algo ya adaptado no lo cambia', () => {
        const una = adaptarConocimiento(viejo);
        expect(adaptarConocimiento(una)).toBe(una);
    });

    it('aguanta basura sin reventar', () => {
        expect(adaptarConocimiento(null)).toEqual({ _v: 2 });
        expect(adaptarConocimiento({ cabra: null })).toEqual({ _v: 2 });
        expect(adaptarConocimiento({ _setBy: '3', _setAt: 'x' })).toEqual({ _v: 2 });
    });
});

describe('confianzaDeMemoria', () => {
    const memoriaFirme = {
        a: { orden: 0, count: 10 },
        b: { orden: 0.5, count: 10 },
        c: { orden: 1, count: 10 },
    };

    it('conocer todas las paradas muchas veces da confianza plena', () => {
        expect(confianzaDeMemoria(memoriaFirme, ['a', 'b', 'c'])).toBe(1);
    });

    it('conocer una de ocho no da para mandar sobre la geografía', () => {
        const nombres = ['a', 'd', 'e', 'f', 'g', 'h', 'i', 'j'];
        expect(confianzaDeMemoria(memoriaFirme, nombres)).toBeLessThan(0.2);
    });

    it('haberlas visto una sola vez tampoco', () => {
        const verde = { a: { orden: 0, count: 1 }, b: { orden: 1, count: 1 } };
        expect(confianzaDeMemoria(verde, ['a', 'b'])).toBeLessThan(0.3);
    });

    it('sin memoria, cero', () => {
        expect(confianzaDeMemoria({}, ['a'])).toBe(0);
        expect(confianzaDeMemoria(memoriaFirme, [])).toBe(0);
    });
});
