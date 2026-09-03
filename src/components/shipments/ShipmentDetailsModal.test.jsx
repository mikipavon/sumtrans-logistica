// ── Editar un albarán no puede cambiarle el precio por su cuenta ──
//
// SUM-258, 2 de septiembre de 2026: albarán a Casariche (Baremo 2) dado de alta
// con BLT_5 a 21,50 €. Al pulsar Editar, la ficha volvía a poner el artículo a
// 18,00 € (su precio de Baremo 1, porque la ficha no conocía los baremos) y
// "Guardar Cambios" pisaba el importe bueno aunque no se hubiera tocado nada.
// Ahora la ficha usa la misma cuenta que el alta, y sólo recalcula si durante la
// edición cambia algo que afecte al precio: quién paga o el pueblo.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';

// La ficha arrastra impresión, PDF y Supabase; aquí sólo se mira el precio.
vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const BLT_5 = { id: 'blt5', name: 'BLT_5', price: '18.00', priceB2: '21.50' };

const sum258 = {
    id: 'SUM-258',
    client: 'COMERCIAL BADI S.A.',
    destinationName: 'Suministros Secilla',
    porteType: 'Pagado',
    status: 'En reparto',
    date: '2 sept 2026',
    originCity: 'Córdoba',
    originZip: '14005',
    destinationCity: 'Casariche',
    destinationZip: '41580',
    amount: '€21.50',
    customAmount: 21.5,
    codAmount: 0,
    hasCod: false,
    codCommission: 0,
    packages: '1x BLT_5',
    articles: [{ ...BLT_5, quantity: 1, unitPrice: 21.5, totalPrice: 21.5, uniqueId: 'a1' }],
};

const abrirEnEdicion = () => {
    render(
        <ShipmentDetailsModal
            isOpen={true}
            onClose={() => {}}
            shipment={sum258}
            onUpdate={vi.fn()}
            allPoblaciones={[]}
            clients={[]}
            articles={[BLT_5]}
            tariffs={null}
            coverageZones={[]}
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
};

describe('ShipmentDetailsModal: el precio al editar', () => {
    it('pulsar Editar deja el precio guardado tal cual', () => {
        abrirEnEdicion();
        expect(screen.getByDisplayValue('€21.50')).toBeInTheDocument();
        expect(screen.getByText('21.50€')).toBeInTheDocument();
    });

    it('cambiar el destino a un pueblo de Baremo 1 baja al precio base, y volver a Baremo 2 lo devuelve', () => {
        abrirEnEdicion();
        fireEvent.change(screen.getByDisplayValue('41580'), { target: { value: '14940' } });
        fireEvent.change(screen.getByDisplayValue('Casariche'), { target: { value: 'Cabra' } });
        expect(screen.getByDisplayValue('18.00')).toBeInTheDocument();
        expect(screen.getByText('18.00€')).toBeInTheDocument();

        fireEvent.change(screen.getByDisplayValue('14940'), { target: { value: '41580' } });
        fireEvent.change(screen.getByDisplayValue('Cabra'), { target: { value: 'Casariche' } });
        expect(screen.getByDisplayValue('21.50')).toBeInTheDocument();
    });
});
