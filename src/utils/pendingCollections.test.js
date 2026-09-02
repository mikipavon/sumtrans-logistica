import { describe, it, expect } from 'vitest';
import { isPendingCollection, needsDriverAfterCollecting, parseCurrency, importeSinValorar, lineasDeCobro, cobrosPendientesDe } from './pendingCollections';

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

// ── Una sola regla para el móvil y para la oficina ───────────────────────────
//
// Lo que pasaba: el repartidor calculaba su pestaña Cobros con una copia de la
// regla y la oficina calculaba Cobros Pendientes con otra, y no coincidían. La
// oficina no podía fiarse de que su lista fuera la suma de las pestañas de todos
// los repartidores, que es justo para lo que sirve: para pasar un cobro de uno a
// otro cuando cambia el transportista de una zona.
describe('lineasDeCobro · la regla única', () => {
    it('la ficha actual del cliente manda sobre lo grabado en el albarán', () => {
        // Grabado como facturación, pero el cliente hoy es de contado: se cobra.
        const grabadoViejo = { ...albaranBase, billingType: 'Facturación' };
        expect(lineasDeCobro(grabadoViejo, clientes)).toHaveLength(1);

        // Grabado como contado, pero el cliente hoy va a factura: no se cobra.
        const ahoraFactura = { ...albaranBase, client: 'Gran Cuenta SL', billingType: 'Clientes Habituales' };
        expect(lineasDeCobro(ahoraFactura, clientes)).toHaveLength(0);
    });

    it('un Recibo de oficina conserva su tipo de cobro aunque la ficha sea de facturación', () => {
        const recibo = { ...albaranBase, type: 'Recibo', client: 'Gran Cuenta SL', billingType: 'Clientes Habituales' };
        expect(lineasDeCobro(recibo, clientes)).toHaveLength(1);
    });

    it('una recogida sin valorar todavía no es un cobro; un porte por Tarifa sí', () => {
        expect(lineasDeCobro({ ...albaranBase, amount: 'Por valorar' }, clientes)).toHaveLength(0);

        const porTarifa = lineasDeCobro({ ...albaranBase, amount: 'Tarifa' }, clientes);
        expect(porTarifa).toHaveLength(1);
        expect(porTarifa[0].amountDisplay).toBe('Tarifa');
        expect(porTarifa[0].amount).toBe(0);
    });

    it('un porte debido sólo se debe cuando está entregado, y lo cobra el asignado', () => {
        const debido = { ...albaranBase, porteType: 'Debido', destinationName: 'Talleres Pepe', assignedDriverId: 7, createdById: 3 };
        expect(lineasDeCobro({ ...debido, status: 'En reparto' }, clientes)).toHaveLength(0);

        const entregado = lineasDeCobro({ ...debido, status: 'Entregado' }, clientes);
        expect(entregado).toHaveLength(1);
        expect(entregado[0].type).toBe('Portes (Debido)');
        expect(entregado[0].responsibleDriverId).toBe(7);
    });

    it('un porte pagado en origen se debe desde que nace, y lo cobra quien lo creó', () => {
        const linea = lineasDeCobro({ ...albaranBase, createdById: 3, assignedDriverId: 7 }, clientes);
        expect(linea).toHaveLength(1);
        expect(linea[0].type).toBe('Portes (Pagado)');
        expect(linea[0].responsibleDriverId).toBe(3);
    });

    it('el traspaso de la oficina manda sobre la regla', () => {
        const traspasado = { ...albaranBase, createdById: 3, pendingCollectionDriverId: 8 };
        expect(lineasDeCobro(traspasado, clientes)[0].responsibleDriverId).toBe(8);
    });

    it('un reembolso se cobra en mano aunque el porte del destinatario vaya a factura', () => {
        const conReembolso = {
            ...albaranBase,
            porteType: 'Debido',
            destinationName: 'Gran Cuenta SL',
            status: 'Entregado',
            assignedDriverId: 7,
            hasCod: true,
            codAmount: '40',
            codPaid: false
        };
        const lineas = lineasDeCobro(conReembolso, clientes);
        expect(lineas.map(l => l.type)).toEqual(['Reembolso']);
        expect(lineas[0].amount).toBe(40);
    });

    it('un albarán anulado no debe nada', () => {
        expect(lineasDeCobro({ ...albaranBase, status: 'Anulado' }, clientes)).toHaveLength(0);
    });
});

describe('cobrosPendientesDe · la parte de cada repartidor', () => {
    const asignado = { ...albaranBase, id: 'A', porteType: 'Debido', destinationName: 'Talleres Pepe', status: 'Entregado', assignedDriverId: 7 };
    const creado = { ...albaranBase, id: 'B', createdById: 7, assignedDriverId: 8 };
    const traspasado = { ...albaranBase, id: 'C', createdById: 8, assignedDriverId: 8, pendingCollectionDriverId: 7 };
    const ajeno = { ...albaranBase, id: 'D', createdById: 8 };
    const todos = [asignado, creado, traspasado, ajeno];

    it('reúne lo asignado, lo creado y lo traspasado a ese repartidor', () => {
        const suyos = cobrosPendientesDe(todos, 7, clientes);
        expect(suyos.map(l => l.shipment.id)).toEqual(['A', 'B', 'C']);
    });

    it('lo traspasado deja de ser del que lo tenía', () => {
        expect(cobrosPendientesDe(todos, 8, clientes).map(l => l.shipment.id)).toEqual(['D']);
    });

    it('la lista de la oficina es la suma de las pestañas de los repartidores', () => {
        const oficina = todos.flatMap(s => lineasDeCobro(s, clientes).map(l => s.id + '-' + l.parte + '-' + l.responsibleDriverId));
        const moviles = [7, 8].flatMap(id => cobrosPendientesDe(todos, id, clientes).map(l => l.shipment.id + '-' + l.parte + '-' + l.responsibleDriverId));
        expect(moviles.sort()).toEqual(oficina.sort());
    });

    it('sin repartidor no hay nada que cobrar', () => {
        expect(cobrosPendientesDe(todos, null, clientes)).toEqual([]);
        expect(cobrosPendientesDe(todos, '', clientes)).toEqual([]);
    });
});
