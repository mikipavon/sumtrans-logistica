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

    it('en septiembre no sale si se desmarca sumar los meses anteriores', () => {
        montar([albaranDeAgosto, deudaDeAgosto]);
        elegirMes('2026-09');
        fireEvent.click(screen.getByRole('checkbox', { name: /meses anteriores/ }));
        expect(screen.queryByText('ISPAVICAR')).toBeNull();
    });
});

// ── Septiembre de 2026, primer mes con la app: se cierra junto con agosto ──
const albaranDeSeptiembre = {
    id: 'HAB-950', type: 'Entrega', client: 'ISPAVICAR', billingType: 'Presupuesto',
    porteType: 'Pagado', amount: '€10.00', customAmount: 10, status: 'Entregado',
    createdAt: '2026-09-12T09:00:00.000Z', date: '12 sept 2026',
};

describe('BudgetLiquidationModal · meses anteriores sin cerrar', () => {
    it('el cierre de septiembre suma lo de agosto, en una fila, y dice qué meses lleva', () => {
        montar([albaranDeAgosto, deudaDeAgosto, albaranDeSeptiembre]);
        elegirMes('2026-09');
        expect(screen.getByRole('checkbox', { name: /meses anteriores/ })).toBeChecked();
        expect(screen.getByText(/\(2 albaranes\)/)).toBeInTheDocument();
        expect(screen.getAllByText('ISPAVICAR')).toHaveLength(1);
        expect(screen.getByText('3 envíos acumulados')).toBeInTheDocument();
        expect(screen.getByText('€65.00')).toBeInTheDocument();
        expect(screen.getByText('Agosto y septiembre de 2026')).toBeInTheDocument();
    });

    it('desmarcado, septiembre sólo cobra lo suyo', () => {
        montar([albaranDeAgosto, deudaDeAgosto, albaranDeSeptiembre]);
        elegirMes('2026-09');
        fireEvent.click(screen.getByRole('checkbox', { name: /meses anteriores/ }));
        expect(screen.getByText('1 envíos acumulados')).toBeInTheDocument();
        expect(screen.getByText('€10.00')).toBeInTheDocument();
        expect(screen.queryByText('Agosto y septiembre de 2026')).toBeNull();
    });

    it('sin nada anterior pendiente no sale la casilla', () => {
        montar([albaranDeSeptiembre]);
        elegirMes('2026-09');
        expect(screen.queryByRole('checkbox', { name: /meses anteriores/ })).toBeNull();
        expect(screen.getByText('€10.00')).toBeInTheDocument();
    });

    it('los meses posteriores nunca entran', () => {
        montar([albaranDeAgosto, albaranDeSeptiembre]);
        elegirMes('2026-08');
        expect(screen.getByText('€20.00')).toBeInTheDocument();
        expect(screen.getByText('1 envíos acumulados')).toBeInTheDocument();
    });

    it('al cerrar, el recibo dice el periodo y se marcan los tres albaranes', async () => {
        const onCreateShipment = vi.fn().mockResolvedValue(true);
        const onUpdateMultipleShipments = vi.fn().mockResolvedValue(true);
        vi.spyOn(window, 'confirm').mockReturnValue(true);
        vi.spyOn(window, 'alert').mockImplementation(() => {});
        render(
            <BudgetLiquidationModal
                isOpen onClose={vi.fn()} clients={clients}
                drivers={[{ id: 7, name: 'Paco' }]}
                shipments={[albaranDeAgosto, deudaDeAgosto, albaranDeSeptiembre]}
                onCreateShipment={onCreateShipment}
                onUpdateMultipleShipments={onUpdateMultipleShipments}
            />
        );
        elegirMes('2026-09');
        fireEvent.change(screen.getByRole('combobox'), { target: { value: '7' } });
        fireEvent.click(screen.getByText('Cerrar Mes'));
        await vi.waitFor(() => expect(onUpdateMultipleShipments).toHaveBeenCalled());
        expect(window.confirm.mock.calls[0][0]).toContain('Agosto y septiembre de 2026');
        const recibo = onCreateShipment.mock.calls[0][0];
        expect(recibo).toMatchObject({ type: 'Recibo', customAmount: 65 });
        expect(recibo.observations).toContain('Agosto y septiembre de 2026');
        expect(onUpdateMultipleShipments.mock.calls[0][0].map(u => u.id).sort()).toEqual(['HAB-900', 'HAB-901', 'HAB-950']);
        window.confirm.mockRestore();
        window.alert.mockRestore();
    });

    it('en Ya Liquidados el cierre conjunto sale entero en septiembre y no en agosto', () => {
        const recibo = { id: 'RC-1', type: 'Recibo', client: 'ISPAVICAR', customAmount: 65, amount: '65.00', assignedDriverId: 7 };
        const cerrado = (s) => ({ ...s, budgetLiquidated: true, linkedReceiptId: 'RC-1' });
        montar([cerrado(albaranDeAgosto), cerrado(deudaDeAgosto), cerrado(albaranDeSeptiembre), recibo]);
        fireEvent.click(screen.getByText(/Ya Liquidados/));
        elegirMes('2026-09');
        expect(screen.getByText(/3 envíos · RC-1/)).toBeInTheDocument();
        expect(screen.getByText('Agosto y septiembre de 2026')).toBeInTheDocument();
        elegirMes('2026-08');
        expect(screen.queryByText(/RC-1/)).toBeNull();
    });
});
