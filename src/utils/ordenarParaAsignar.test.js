import { describe, it, expect } from 'vitest';
import { ordenarParaAsignar } from './shipmentUtils';

const ids = (lista) => ordenarParaAsignar(lista).map(s => s.id);

describe('ordenarParaAsignar', () => {
    it('lo último creado sale arriba, no el número más bajo como texto', () => {
        expect(ids([
            { id: 'SUM-999', createdAt: '2026-09-25T08:00:00Z' },
            { id: 'SUM-1000', createdAt: '2026-09-25T10:00:00Z' },
            { id: 'HAB-5', createdAt: '2026-09-25T09:00:00Z' },
        ])).toEqual(['SUM-1000', 'HAB-5', 'SUM-999']);
    });

    it('un envío del portal creado ayer sube arriba al escanearlo hoy', () => {
        expect(ids([
            { id: 'SUM-20', createdAt: '2026-09-25T09:00:00Z' },
            { id: 'SUM-10', createdAt: '2026-09-24T18:00:00Z', pickedUpAt: '2026-09-25T11:00:00Z' },
        ])).toEqual(['SUM-10', 'SUM-20']);
    });

    it('sin fechas va al final; a igualdad, el número más alto primero', () => {
        expect(ids([
            { id: 'SUM-3' },
            { id: 'SUM-1', createdAt: 'no es fecha' },
            { id: 'SUM-2', createdAt: '2026-09-25T09:00:00Z' },
        ])).toEqual(['SUM-2', 'SUM-3', 'SUM-1']);
    });

    it('no toca la lista original', () => {
        const lista = [{ id: 'SUM-1', createdAt: '2026-09-24T00:00:00Z' }, { id: 'SUM-2', createdAt: '2026-09-25T00:00:00Z' }];
        ordenarParaAsignar(lista);
        expect(lista[0].id).toBe('SUM-1');
        expect(ordenarParaAsignar(undefined)).toEqual([]);
    });
});
