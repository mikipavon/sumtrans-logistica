import { describe, it, expect } from 'vitest';
import { observacionesVisibles, llevaMarcaDeCobroPendiente } from './shipmentUtils';

describe('observacionesVisibles', () => {
    it('quita la marca interna del porte debido', () => {
        expect(observacionesVisibles('[COBRO PENDIENTE] ')).toBe('');
        expect(observacionesVisibles('[COBRO PENDIENTE] Llamar antes')).toBe('Llamar antes');
        expect(observacionesVisibles('[cobro pendiente] x')).toBe('x');
    });

    it('deja igual lo que no la lleva', () => {
        expect(observacionesVisibles('Dejar en el bar')).toBe('Dejar en el bar');
        expect(observacionesVisibles(null)).toBe('');
    });

    it('sabe si la lleva, para volver a ponerla al editar', () => {
        expect(llevaMarcaDeCobroPendiente('[COBRO PENDIENTE] ')).toBe(true);
        expect(llevaMarcaDeCobroPendiente('Nada')).toBe(false);
    });
});
