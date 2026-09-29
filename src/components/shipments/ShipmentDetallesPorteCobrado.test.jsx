// ── Si el repartidor cobra otro importe, ése es el precio del albarán ──
//
// HAB-642, 25 de septiembre de 2026: porte de 7 € a Talleres Pérez (Montilla).
// Javito lo cobró a 12 €. Su Cuenta decía 12 €, pero la ficha del albarán y el
// listado de la oficina seguían en 7 €: el móvil sólo escribía el número
// (customAmount) y no el texto (amount), que es lo que pintan. Y como la ficha
// copia su casilla de precio al número al guardar, cualquier retoque de la
// oficina habría vuelto a dejar los 7 € también en la Cuenta.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';
import { calculateDailyAccount } from '../../utils/accountLogic';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const JAVITO = { id: 9, name: 'FRANCISCO JAVIER PAVON SANCHEZ', isActive: true };

const hab642 = {
    id: 'HAB-642',
    client: 'Rafael Pérez - TALLERES PEREZ',
    destinationName: 'Rafael Pérez - TALLERES PEREZ',
    destinationCity: 'Montilla',
    destinationZip: '14550',
    porteType: 'Debido',
    destinationBillingType: 'Clientes Habituales',
    status: 'Entregado',
    assignedDriverId: 9,
    date: '24/09/2026',
    deliveredAt: new Date().toISOString(),
    // Como lo dejó el móvil: el texto del alta y el número de lo cobrado
    amount: '€7.00',
    customAmount: 12,
    codAmount: 0,
    hasCod: false,
    portePaid: true,
    isPaid: true,
    porteCollectedById: 9,
    portePaidAt: new Date().toISOString(),
    packages: '1x BLT_1',
    articles: [],
};

const abrir = (onUpdate = vi.fn()) => {
    render(
        <ShipmentDetailsModal
            isOpen={true} onClose={() => {}} shipment={hab642} onUpdate={onUpdate}
            drivers={[JAVITO]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
        />
    );
    return onUpdate;
};

describe('ShipmentDetailsModal: porte cobrado a otro importe', () => {
    it('la ficha enseña lo que se cobró, no el precio del alta', () => {
        abrir();
        expect(screen.getByText('€12.00')).toBeInTheDocument();
        expect(screen.queryByText('€7.00')).not.toBeInTheDocument();
    });

    it('un retoque de la oficina no deshace lo que cobró el repartidor', async () => {
        const onUpdate = abrir();
        fireEvent.click(screen.getByTitle('Editar'));
        fireEvent.click(screen.getByText('Guardar Cambios'));
        await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
        const guardado = onUpdate.mock.calls[0][1];

        expect(guardado.customAmount).toBe(12);
        expect(guardado.amount).toBe('€12.00');

        const cuenta = calculateDailyAccount({
            allShipments: [{ ...hab642, ...guardado }],
            driverId: 9,
            clients: [],
            collectedCollections: [],
        });
        expect(cuenta.collectedPorte).toBe(12);
    });
});
