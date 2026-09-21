// La prioridad de servicio la decide la base de datos: los clientes de SUM
// van Urgente y los destinatarios de una agencia van Estándar. Antes todo
// nacía Urgente, y como las fichas de agencia se crean solas sin prioridad,
// los envíos de agencia iban por delante de los clientes propios.

import { describe, it, expect } from 'vitest';
import {
    prioridadPorPertenencia, prioridadDeCliente, esUrgente,
    cambiosAlPonerPrioridad, cambiosAlCambiarDeBase,
} from './prioridadDeFicha';

describe('prioridadPorPertenencia', () => {
    it('Mis clientes (SUM) → Urgente', () => {
        expect(prioridadPorPertenencia(null)).toBe('urgent');
        expect(prioridadPorPertenencia(undefined)).toBe('urgent');
    });

    it('la base de una agencia → Estándar', () => {
        expect(prioridadPorPertenencia(42)).toBe('normal');
        expect(prioridadPorPertenencia('42')).toBe('normal');
    });
});

describe('prioridadDeCliente', () => {
    it('una ficha de agencia sin prioridad grabada es Estándar', () => {
        expect(prioridadDeCliente({ name: 'Emilio', ownerAgencyId: 42 })).toBe('normal');
        expect(esUrgente({ name: 'Emilio', ownerAgencyId: 42 })).toBe(false);
    });

    it('una ficha propia sin prioridad grabada sigue siendo Urgente', () => {
        expect(prioridadDeCliente({ name: 'Proservice' })).toBe('urgent');
        expect(esUrgente({ name: 'Proservice' })).toBe(true);
    });

    it('la prioridad grabada a mano manda sobre la pertenencia', () => {
        expect(prioridadDeCliente({ ownerAgencyId: 42, priority: 'urgent' })).toBe('urgent');
        expect(prioridadDeCliente({ ownerAgencyId: null, priority: 'normal' })).toBe('normal');
    });

    it('un valor raro grabado se ignora y decide la pertenencia', () => {
        expect(prioridadDeCliente({ ownerAgencyId: 42, priority: 'alta' })).toBe('normal');
        expect(prioridadDeCliente({ priority: '' })).toBe('urgent');
    });

    it('sin ficha (envío de alguien sin dar de alta) es Urgente', () => {
        expect(prioridadDeCliente(null)).toBe('urgent');
        expect(esUrgente(undefined)).toBe(true);
    });
});

describe('cambiosAlPonerPrioridad', () => {
    it('sugiere el color de la prioridad si el color era el sugerido de la otra', () => {
        expect(cambiosAlPonerPrioridad({ color: '#ef4444' }, 'normal'))
            .toEqual({ priority: 'normal', color: '#64748b' });
        expect(cambiosAlPonerPrioridad({ color: '#64748b' }, 'urgent'))
            .toEqual({ priority: 'urgent', color: '#ef4444' });
    });

    it('sin color puesto, pone el sugerido', () => {
        expect(cambiosAlPonerPrioridad({}, 'normal')).toEqual({ priority: 'normal', color: '#64748b' });
    });

    it('un color elegido a mano no se pisa', () => {
        expect(cambiosAlPonerPrioridad({ color: '#123456' }, 'normal')).toEqual({ priority: 'normal' });
    });
});

describe('cambiosAlCambiarDeBase', () => {
    it('pasar la ficha a una agencia la pone Estándar', () => {
        expect(cambiosAlCambiarDeBase({ priority: 'urgent', color: '#ef4444' }, 42))
            .toEqual({ ownerAgencyId: 42, priority: 'normal', color: '#64748b' });
    });

    it('volver a Mis clientes (SUM) la pone Urgente', () => {
        expect(cambiosAlCambiarDeBase({ priority: 'normal', color: '#64748b' }, null))
            .toEqual({ ownerAgencyId: null, priority: 'urgent', color: '#ef4444' });
        expect(cambiosAlCambiarDeBase({ priority: 'normal' }, '').ownerAgencyId).toBe(null);
    });
});
