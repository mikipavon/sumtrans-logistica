import { describe, it, expect } from 'vitest';
import { observacionesParaEditar, llevaMarcaDeCobroPendiente } from './shipmentUtils';

// Simula el onChange del cuadro de Observaciones de ShipmentDetailsModal.
const teclear = (guardado, texto) => {
    const visible = observacionesParaEditar(guardado);
    const nuevo = visible + texto;
    return llevaMarcaDeCobroPendiente(guardado) ? `[COBRO PENDIENTE] ${nuevo}` : nuevo;
};

describe('observacionesParaEditar', () => {
    it('deja escribir espacios al final', () => {
        let guardado = '';
        for (const letra of 'dejar en porteria') guardado = teclear(guardado, letra);
        expect(guardado).toBe('dejar en porteria');
    });

    it('con la marca de cobro pendiente tampoco se come los espacios ni la duplica', () => {
        let guardado = '[COBRO PENDIENTE] ';
        for (const letra of 'llamar antes') guardado = teclear(guardado, letra);
        expect(guardado).toBe('[COBRO PENDIENTE] llamar antes');
        expect(observacionesParaEditar(guardado)).toBe('llamar antes');
    });

    it('vacío o nulo da cadena vacía', () => {
        expect(observacionesParaEditar(null)).toBe('');
        expect(observacionesParaEditar(undefined)).toBe('');
    });
});
