// ── Cobrar un albarán no puede hacerlo desaparecer sin repartidor ──
//
// Flujo real que lo destapó: albarán de cliente habitual creado con "cobrar más
// tarde" (se va a Cobros Pendientes) y todavía sin asignar a nadie. Al pagar el
// cliente y marcarlo como cobrado desde esta pantalla, la fila se iba —el cobro
// ya no está pendiente— y con ella la única forma de asignar el reparto desde
// aquí. El albarán seguía en Envíos, pero de esta pantalla se esfumaba.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PendingCollections from './PendingCollections';

// La ficha del envío arrastra medio proyecto (Supabase incluido). Aquí sólo
// interesa lo que hace la pantalla cuando la ficha guarda un cobro.
vi.mock('../components/shipments/ShipmentDetailsModal', () => ({
    default: ({ isOpen, onClose, shipment, onUpdate }) => {
        if (!isOpen) return null;
        return (
            <div>
                <button onClick={() => onUpdate(shipment.id, { ...shipment, paymentStatus: 'Paid', portePaid: true })}>
                    marcar-cobrado
                </button>
                <button onClick={onClose}>cerrar-ficha</button>
            </div>
        );
    },
}));

const clients = [{ name: 'Talleres Pepe', billingType: 'Clientes Habituales' }];
const drivers = [{ id: 7, name: 'Juan Ruiz', alias: 'Juanito', isActive: true }];

const albaran = {
    id: 'ALB-1',
    date: '2026-08-19',
    client: 'Talleres Pepe',
    destinationName: 'Ferretería Sur',
    porteType: 'Pagado',
    billingType: 'Clientes Habituales',
    paymentStatus: 'Pending',
    status: 'Pendiente de asignar',
    assignedDriverId: null,
    amount: '15.00'
};

const cobrar = async () => {
    fireEvent.click(screen.getByText('ALB-1'));
    fireEvent.click(screen.getByText('marcar-cobrado'));
    // onUpdate es asíncrono: dejar que termine antes de cerrar la ficha.
    await Promise.resolve();
    fireEvent.click(screen.getByText('cerrar-ficha'));
};

describe('PendingCollections · cobrar sin repartidor', () => {
    it('al cobrarlo pide a quién se le asigna el reparto', async () => {
        render(
            <PendingCollections
                shipments={[albaran]}
                drivers={drivers}
                clients={clients}
                onAssignDriver={vi.fn()}
                onUpdateShipment={vi.fn().mockResolvedValue(true)}
            />
        );

        expect(screen.getByText('ALB-1')).toBeInTheDocument();
        await cobrar();

        expect(screen.getByText('Cobrado, pero nadie lo lleva')).toBeInTheDocument();
    });

    it('elegir repartidor en el aviso asigna el reparto', async () => {
        const onAssignDriver = vi.fn();
        render(
            <PendingCollections
                shipments={[albaran]}
                drivers={drivers}
                clients={clients}
                onAssignDriver={onAssignDriver}
                onUpdateShipment={vi.fn().mockResolvedValue(true)}
            />
        );

        await cobrar();
        fireEvent.change(screen.getByRole('combobox', { name: /repartidor/i }), { target: { value: '7' } });
        fireEvent.click(screen.getByText('Asignar reparto'));

        expect(onAssignDriver).toHaveBeenCalledWith('ALB-1', '7');
        expect(screen.queryByText('Cobrado, pero nadie lo lleva')).not.toBeInTheDocument();
    });

    it('no molesta si el albarán ya tiene repartidor', async () => {
        render(
            <PendingCollections
                shipments={[{ ...albaran, assignedDriverId: 7, status: 'En reparto' }]}
                drivers={drivers}
                clients={clients}
                onAssignDriver={vi.fn()}
                onUpdateShipment={vi.fn().mockResolvedValue(true)}
            />
        );

        await cobrar();

        expect(screen.queryByText('Cobrado, pero nadie lo lleva')).not.toBeInTheDocument();
    });
});

// ── El buscador no puede depender de quién paga ──
//
// Buscar al destinatario ("David Gutiérrez") no devolvía nada porque sólo se
// miraba el cliente que factura. Ahora se busca en las dos partes y sin tildes.
describe('PendingCollections · buscador', () => {
    const conDestinatario = {
        ...albaran,
        id: 'ALB-2',
        client: 'PECOMARK S.A.',
        destinationName: 'David Gutiérrez'
    };
    const otro = { ...albaran, id: 'ALB-3', client: 'PROSERVICE', destinationName: 'Taller Espejo' };
    const pintar = () => render(
        <PendingCollections
            shipments={[conDestinatario, otro]}
            drivers={drivers}
            clients={[...clients, { name: 'PECOMARK S.A.', billingType: 'Clientes Habituales' },
                      { name: 'PROSERVICE', billingType: 'Clientes Habituales' }]}
            onAssignDriver={vi.fn()}
            onUpdateShipment={vi.fn().mockResolvedValue(true)}
        />
    );
    const buscar = (texto) => fireEvent.change(
        screen.getByPlaceholderText(/Buscar por cliente/i), { target: { value: texto } }
    );

    it('encuentra por el destinatario, no sólo por quien paga', () => {
        pintar();
        buscar('david gutierrez');
        expect(screen.getByText('ALB-2')).toBeInTheDocument();
        expect(screen.queryByText('ALB-3')).not.toBeInTheDocument();
    });

    it('sigue encontrando por el cliente que paga', () => {
        pintar();
        buscar('pecomark');
        expect(screen.getByText('ALB-2')).toBeInTheDocument();
        expect(screen.queryByText('ALB-3')).not.toBeInTheDocument();
    });

    it('sin texto los muestra todos', () => {
        pintar();
        expect(screen.getByText('ALB-2')).toBeInTheDocument();
        expect(screen.getByText('ALB-3')).toBeInTheDocument();
    });
});
