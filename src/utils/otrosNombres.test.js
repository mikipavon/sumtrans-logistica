import { describe, it, expect } from 'vitest';
import { leerOtrosNombres, nombresDeLaMadre, conOtroNombre } from './otrosNombres';
import { buscarFichaPorNombre, normalizarNombreCliente } from './altaClientes';
import { direccionPorNombre } from './receptoresHabituales';
import { buscarFichasParecidas } from './duplicadosClientes';

const agrocor = {
    id: 7,
    name: 'AGROCOR TORRECILLA',
    legalName: 'COMERCIAL AGROCOR S.A.',
    otrosNombres: ['AGROCOR', ' Comercial Agrocor ', ''],
    branches: [{ id: 'branch_1', name: 'AGROCOR ALMACEN', address: 'Pol. 2' }],
    status: 'approved',
};

describe('leerOtrosNombres y nombresDeLaMadre', () => {
    it('devuelve la lista limpia, sin vacíos, y sin la lista no devuelve nada', () => {
        expect(leerOtrosNombres(agrocor)).toEqual(['AGROCOR', 'Comercial Agrocor']);
        expect(leerOtrosNombres({ otrosNombres: 'AGROCOR' })).toEqual([]);
        expect(leerOtrosNombres(null)).toEqual([]);
    });

    it('la madre responde al nombre, la razón social y los otros nombres; las sedes no van aquí', () => {
        expect(nombresDeLaMadre(agrocor)).toEqual(['AGROCOR TORRECILLA', 'COMERCIAL AGROCOR S.A.', 'AGROCOR', 'Comercial Agrocor']);
        expect(nombresDeLaMadre({ name: 'X' })).toEqual(['X']);
    });
});

describe('conOtroNombre', () => {
    it('añade el nombre al final, tal cual se escribió', () => {
        expect(conOtroNombre(agrocor, ' Agrocor Cordoba ', normalizarNombreCliente))
            .toEqual(['AGROCOR', 'Comercial Agrocor', 'Agrocor Cordoba']);
    });

    it('no repite uno que ya responde: otro nombre, el comercial, la razón social o una sede', () => {
        const antes = ['AGROCOR', 'Comercial Agrocor'];
        expect(conOtroNombre(agrocor, 'agrocor', normalizarNombreCliente)).toEqual(antes);
        expect(conOtroNombre(agrocor, 'Agrocor Torrecilla', normalizarNombreCliente)).toEqual(antes);
        expect(conOtroNombre(agrocor, 'comercial agrocor s.a.', normalizarNombreCliente)).toEqual(antes);
        expect(conOtroNombre(agrocor, 'AGROCOR ALMACÉN', normalizarNombreCliente)).toEqual(antes);
        expect(conOtroNombre(agrocor, '   ', normalizarNombreCliente)).toEqual(antes);
    });
});

// Lo que importa de verdad: que todo el que compara nombres vea los otros nombres.
describe('quien busca por nombre encuentra la ficha por sus otros nombres', () => {
    const otra = { id: 8, name: 'TALLERES PEREZ', status: 'approved' };

    it('el alta (buscarFichaPorNombre) la da como madre, sin sede', () => {
        expect(buscarFichaPorNombre('agrocor', [otra, agrocor])).toEqual({ client: agrocor, branch: null });
        expect(buscarFichaPorNombre('Comercial Agrocor', [otra, agrocor])).toEqual({ client: agrocor, branch: null });
        // Las sedes siguen siendo sedes.
        expect(buscarFichaPorNombre('AGROCOR ALMACEN', [agrocor])).toEqual({ client: agrocor, branch: agrocor.branches[0] });
        expect(buscarFichaPorNombre('AGROCOR SUR', [agrocor])).toBeNull();
    });

    it('la chuleta del reparto (direccionPorNombre) también', () => {
        expect(direccionPorNombre('AGROCOR', [otra, agrocor])).toEqual({ client: agrocor, branch: null });
        expect(direccionPorNombre('AGROCOR SUR', [agrocor])).toBeNull();
    });

    it('Validar Clientes avisa de «el mismo nombre» si la solicitud se llama como uno de ellos', () => {
        const pendiente = { id: 99, name: 'Agrocor', status: 'pending', createdFrom: 'Reparto (Driver)' };
        const [aviso] = buscarFichasParecidas(pendiente, [otra, agrocor]);
        expect(aviso.client).toBe(agrocor);
        expect(aviso.motivos).toEqual(['el mismo nombre']);
        expect(aviso.soloPorParecido).toBe(false);
    });
});
