import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { usePorTandas } from './usePorTandas';

const lista = (n) => Array.from({ length: n }, (_, i) => i);

describe('usePorTandas', () => {
    it('da la primera tanda y cuántas quedan', () => {
        const { result } = renderHook(() => usePorTandas(lista(320), 'a', 150));

        expect(result.current.visibles).toHaveLength(150);
        expect(result.current.total).toBe(320);
        expect(result.current.quedan).toBe(170);
        expect(result.current.siguiente).toBe(150);
    });

    it('«Ver más» suma una tanda y la última trae sólo las que faltan', () => {
        const { result } = renderHook(() => usePorTandas(lista(320), 'a', 150));

        act(() => result.current.verMas());
        expect(result.current.visibles).toHaveLength(300);
        expect(result.current.siguiente).toBe(20);

        act(() => result.current.verMas());
        expect(result.current.visibles).toHaveLength(320);
        expect(result.current.quedan).toBe(0);
    });

    it('otro filtro vuelve a la primera tanda', () => {
        const { result, rerender } = renderHook(({ clave }) => usePorTandas(lista(320), clave, 150), { initialProps: { clave: 'a' } });

        act(() => result.current.verMas());
        expect(result.current.visibles).toHaveLength(300);

        rerender({ clave: 'b' });
        expect(result.current.visibles).toHaveLength(150);
    });

    it('si llegan albaranes nuevos con el mismo filtro no recorta lo que ya se veía', () => {
        const { result, rerender } = renderHook(({ n }) => usePorTandas(lista(n), 'a', 150), { initialProps: { n: 320 } });

        act(() => result.current.verMas());
        rerender({ n: 330 });
        expect(result.current.visibles).toHaveLength(300);
    });
});
