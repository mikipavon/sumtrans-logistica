// ── Borrar desde Editar ──
//
// Una recogida no factura: el repartidor la borra él mismo desde la ficha, en
// modo edición, sin llamar a la oficina (Miguel, 24/09/2026). La ficha no decide
// quién puede borrar: sólo pinta "Borrar" cuando le llega `onDelete`, y se
// cierra si esa función dice que de verdad se borró.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const recogida = {
    id: 'REC-1',
    type: 'Recogida',
    status: 'En reparto',
    client: 'AGRICOLA CASTILLERO',
    originName: 'AGRICOLA CASTILLERO',
    originCity: 'Montilla',
    originZip: '14550',
    originAddress: 'Ctra. Vieja 1',
    destinationName: 'FERRETERIA LUCENA',
    destinationCity: 'Lucena',
    destinationZip: '14900',
    date: '24 sept 2026',
    amount: '€0.00',
    packages: '1',
    articles: [],
};

const abrir = ({ onDelete = null, onClose = vi.fn() } = {}) => {
    render(
        <ShipmentDetailsModal
            isOpen={true}
            onClose={onClose}
            shipment={recogida}
            onUpdate={vi.fn()}
            allPoblaciones={[]}
            clients={[]}
            articles={[]}
            tariffs={null}
            coverageZones={[]}
            onDelete={onDelete}
        />
    );
    return { onClose };
};

const botonBorrar = () => screen.queryByRole('button', { name: 'Borrar' });

describe('ShipmentDetailsModal: borrar desde Editar', () => {
    it('sin pulsar Editar no hay Borrar, y al editar aparece junto a Cancelar', () => {
        abrir({ onDelete: vi.fn() });
        expect(botonBorrar()).toBeNull();
        fireEvent.click(screen.getByTitle('Editar'));
        expect(botonBorrar()).toBeInTheDocument();
        expect(screen.getByText('Cancelar')).toBeInTheDocument();
        expect(screen.getByText('Guardar Cambios')).toBeInTheDocument();
    });

    it('pide borrar ese envío y cierra la ficha cuando se ha borrado', async () => {
        const onDelete = vi.fn().mockResolvedValue(true);
        const { onClose } = abrir({ onDelete });
        fireEvent.click(screen.getByTitle('Editar'));
        fireEvent.click(botonBorrar());
        await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
        expect(onDelete).toHaveBeenCalledWith('REC-1');
    });

    it('si no se llegó a borrar (el conductor se echó atrás o falló), la ficha sigue abierta', async () => {
        const onDelete = vi.fn().mockResolvedValue(false);
        const { onClose } = abrir({ onDelete });
        fireEvent.click(screen.getByTitle('Editar'));
        fireEvent.click(botonBorrar());
        await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
        expect(onClose).not.toHaveBeenCalled();
        expect(botonBorrar()).toBeInTheDocument();
    });

    it('sin función de borrar, editar no enseña Borrar', () => {
        abrir();
        fireEvent.click(screen.getByTitle('Editar'));
        expect(botonBorrar()).toBeNull();
        expect(screen.getByText('Guardar Cambios')).toBeInTheDocument();
    });
});
