import { describe, it, expect } from 'vitest';
import { isPendingCollection, needsDriverAfterCollecting } from './pendingCollections';

const clientes = [
    { name: 'Talleres Pepe', billingType: 'Clientes Habituales' },
    { name: 'Gran Cuenta SL', billingType: 'Facturación' }
];

// Albarán recién creado: remitente cliente habitual, porte pagado, "cobrar más
// tarde" (paymentStatus Pending) y todavía sin repartidor.
const albaranBase = {
    id: 'ALB-1',
    client: 'Talleres Pepe',
    destinationName: 'Destino Cualquiera',
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    paymentStatus: 'Pending',
    status: 'Pendiente de asignar',
    assignedDriverId: null,
    amount: '15.00'
};

describe('isPendingCollection', () => {
    it('un porte pagado de cliente habitual sin cobrar está en cobros pendientes', () => {
        expect(isPendingCollection(albaranBase, clientes)).toBe(true);
    });

    it('deja de estarlo en cuanto se marca como cobrado', () => {
        expect(isPendingCollection({ ...albaranBase, paymentStatus: 'Paid' }, clientes)).toBe(false);
    });

    it('un cliente de facturación no genera cobro pendiente', () => {
        const facturado = { ...albaranBase, client: 'Gran Cuenta SL', billingType: null };
        expect(isPendingCollection(facturado, clientes)).toBe(false);
    });

    it('un reembolso entregado y sin liquidar sigue pendiente', () => {
        const conReembolso = {
            ...albaranBase,
            paymentStatus: 'Paid',
            status: 'Entregado',
            hasCod: true,
            codAmount: '40',
            codPaid: false
        };
        expect(isPendingCollection(conReembolso, clientes)).toBe(true);
    });
});

describe('needsDriverAfterCollecting', () => {
    it('avisa cuando se cobra un albarán que aún no lleva nadie', () => {
        const antes = albaranBase;
        const despues = { ...albaranBase, paymentStatus: 'Paid', portePaid: true };
        expect(needsDriverAfterCollecting(antes, despues, clientes)).toBe(true);
    });

    it('no avisa si el albarán ya tiene repartidor asignado', () => {
        const antes = { ...albaranBase, assignedDriverId: 7, status: 'En reparto' };
        const despues = { ...antes, paymentStatus: 'Paid', portePaid: true };
        expect(needsDriverAfterCollecting(antes, despues, clientes)).toBe(false);
    });

    it('no avisa si el albarán ya está entregado', () => {
        const antes = { ...albaranBase, status: 'Entregado' };
        const despues = { ...antes, paymentStatus: 'Paid', portePaid: true };
        expect(needsDriverAfterCollecting(antes, despues, clientes)).toBe(false);
    });

    it('no avisa al guardar la ficha sin tocar el cobro', () => {
        const despues = { ...albaranBase, destinationAddress: 'Calle Nueva 3' };
        expect(needsDriverAfterCollecting(albaranBase, despues, clientes)).toBe(false);
    });

    it('no avisa si sigue habiendo un reembolso pendiente (la fila no desaparece)', () => {
        const antes = { ...albaranBase, status: 'Entregado', hasCod: true, codAmount: '40', codPaid: false };
        const despues = { ...antes, paymentStatus: 'Paid', portePaid: true };
        expect(needsDriverAfterCollecting(antes, despues, clientes)).toBe(false);
    });
});
