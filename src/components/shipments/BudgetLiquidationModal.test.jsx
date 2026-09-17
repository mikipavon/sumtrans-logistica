// ── Una deuda de presupuesto apuntada a mano entra en el cierre del mes ──
//
// ISPAVICAR es de Presupuesto. El 16/09/2026 se le apuntó a mano una deuda por
// albaranes en papel y nació como Recibo: se la pedía al repartidor y el cierre
// de presupuestos se la saltaba. Ahora se guarda como albarán de Presupuesto con
// fechaContable, y el cierre la suma con el resto en el mes de esa fecha.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import BudgetLiquidationModal from './BudgetLiquidationModal';
import { construirAlbaranAtrasado, mesDelPresupuesto } from '../../utils/reciboDeDeuda';

const clients = [{ id: 31, name: 'ISPAVICAR', billingType: 'Presupuesto' }];

// Un albarán normal de agosto, tal como lo guarda el alta.
const albaranDeAgosto = {
    id: 'HAB-900', type: 'Entrega', client: 'ISPAVICAR', billingType: 'Presupuesto',
    porteType: 'Pagado', amount: '€20.00', customAmount: 20, status: 'Entregado',
    createdAt: '2026-08-10T09:00:00.000Z', date: '10 ago 2026',
};

const deudaDeAgosto = {
    ...construirAlbaranAtrasado({
        id: 'HAB-901', cliente: clients[0], importe: 35, concepto: 'Albaranes en papel', fecha: '2026-08-25',
    }),
    // handleAddShipment le pone la hora del alta: septiembre.
    createdAt: '2026-09-16T10:00:00.000Z',
};

const montar = (shipments) => render(
    <BudgetLiquidationModal
        isOpen
        onClose={vi.fn()}
        shipments={shipments}
        clients={clients}
        drivers={[]}
        onCreateShipment={vi.fn()}
        onUpdateMultipleShipments={vi.fn()}
    />
);

const elegirMes = (mes) => {
    const input = document.querySelector('input[type="month"]');
    fireEvent.change(input, { target: { value: mes } });
};

describe('BudgetLiquidationModal · deudas apuntadas a mano', () => {
    it('la deuda cuenta en el mes de su fecha, no en el del día en que se tecleó', () => {
        expect(mesDelPresupuesto(deudaDeAgosto)).toBe('2026-08');
        expect(mesDelPresupuesto(albaranDeAgosto)).toBe('2026-08');
    });

    it('en agosto se suma a los albaranes del mismo cliente, en una sola fila', () => {
        montar([albaranDeAgosto, deudaDeAgosto]);
        elegirMes('2026-08');
        expect(screen.getAllByText('ISPAVICAR')).toHaveLength(1);
        expect(screen.getByText('2 envíos acumulados')).toBeInTheDocument();
        expect(screen.getByText('€55.00')).toBeInTheDocument();
    });

    it('en septiembre no sale', () => {
        montar([albaranDeAgosto, deudaDeAgosto]);
        elegirMes('2026-09');
        expect(screen.queryByText('ISPAVICAR')).toBeNull();
    });
});
