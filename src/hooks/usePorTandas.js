import { useMemo, useState } from 'react';

// Filas que se pintan de cada vez en los listados largos.
export const FILAS_POR_TANDA = 150;

/**
 * Pinta una lista larga por tandas, con un «Ver más» para la siguiente.
 *
 * Lo que hacía ir la app con retraso (29/09/2026) era pintar miles de filas:
 * con 4.000 albaranes cada letra del buscador de Envíos tardaba más de un
 * segundo, y filtrarlos sólo 20 ms. Cambiar de pestaña pagaba lo mismo.
 *
 * `claveDeFiltros` es cualquier valor que cambie cuando cambia lo que se busca
 * o el orden: entonces se vuelve a la primera tanda en el mismo pintado (con un
 * useEffect se pintaría un momento la tanda larga antes de recortarla).
 */
export function usePorTandas(lista, claveDeFiltros, porTanda = FILAS_POR_TANDA) {
    const [tanda, setTanda] = useState({ clave: claveDeFiltros, filas: porTanda });
    const filas = tanda.clave === claveDeFiltros ? tanda.filas : porTanda;
    const total = lista.length;
    const visibles = useMemo(() => lista.slice(0, filas), [lista, filas]);

    return {
        visibles,
        total,
        quedan: Math.max(0, total - visibles.length),
        siguiente: Math.min(porTanda, Math.max(0, total - visibles.length)),
        verMas: () => setTanda({ clave: claveDeFiltros, filas: filas + porTanda }),
    };
}
