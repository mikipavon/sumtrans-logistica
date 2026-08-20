import { describe, it, expect } from 'vitest';
import { isPendingCollection, needsDriverAfterCollecting, parseCurrency, importeSinValorar } from './pendingCollections';

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

// ── Una recogida sin precio no puede romper el total ──────────────────────────
//
// Las recogidas nacen con amount 'Por valorar' (CreatePickupModal): al recoger
// todavía no se sabe el precio. parseCurrency devolvía NaN con ese texto, y como
// en JavaScript cualquier suma que toque un NaN se vuelve NaN, cinco recogidas
// sin valorar dejaban el TOTAL PENDIENTE de la pantalla en €NaN: no se podía ver
// cuánto se debía de TODOS los demás albaranes, los que sí se facturan.
describe('parseCurrency · importes que no son un número', () => {
    it('un importe de texto vale 0 y no envenena la suma', () => {
        expect(parseCurrency('Por valorar')).toBe(0);
        expect(parseCurrency('Tarifa')).toBe(0);
    });

    it('el total sigue siendo un número aunque haya recogidas sin valorar', () => {
        const total = ['15.00', 'Por valorar', '5', 'Tarifa']
            .reduce((suma, importe) => suma + parseCurrency(importe), 0);
        expect(total).toBe(20);
        expect(Number.isNaN(total)).toBe(false);
    });

    it('sigue leyendo los importes normales, con símbolo y con coma', () => {
        expect(parseCurrency('5.00')).toBe(5);
        expect(parseCurrency('€12.50')).toBe(12.5);
        expect(parseCurrency(7)).toBe(7);
    });

    it('un importe vacío o ausente vale 0, como siempre', () => {
        expect(parseCurrency('')).toBe(0);
        expect(parseCurrency(null)).toBe(0);
        expect(parseCurrency(undefined)).toBe(0);
    });
});

describe('importeSinValorar', () => {
    it('distingue un albarán sin precio de uno que vale cero', () => {
        expect(importeSinValorar('Por valorar')).toBe(true);
        expect(importeSinValorar('Tarifa')).toBe(true);
        // Vacío no es "sin valorar": vale 0 y se enseña como €0.00, como antes.
        expect(importeSinValorar('')).toBe(false);
        expect(importeSinValorar(undefined)).toBe(false);
    });

    it('un importe de verdad nunca está sin valorar', () => {
        expect(importeSinValorar('15.00')).toBe(false);
        expect(importeSinValorar('€12,50')).toBe(false);
        expect(importeSinValorar(0)).toBe(false);
    });
});
