// ── Un cobro marcado a mano por la oficina tiene que salir en la Cuenta ──
//
// SUM-1204, 15 de septiembre de 2026: albarán de dos bultos con una sola
// etiqueta. Antonio entregó los dos y cobró los 12 €, pero la app lo mandó a
// incidencia por entrega parcial. La oficina lo cerró a mano desde la ficha:
// Entregado, conductor Antonio y el check "Porte Cobrado". El check no grababa
// ni fecha ni cobrador, y la Cuenta de Antonio no encontraba el porte en ningún día.

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

const ANTONIO = { id: 7, name: 'ANTONIO MONTES', isActive: true };

const sum1204 = {
    id: 'SUM-1204',
    client: 'IBERMANGUERAS CORDOBESAS SL',
    destinationName: 'TALLERES EL LLANO',
    porteType: 'Debido',
    destinationBillingType: 'Clientes Habituales',
    status: 'Entregado',
    assignedDriverId: 7,
    date: '14/09/2026',
    amount: '€12.00',
    customAmount: 12,
    codAmount: 0,
    hasCod: false,
    portePaid: false,
    packages: '2x BLT_1',
    articles: [],
};

const abrirYMarcarPorteCobrado = async (shipment) => {
    const onUpdate = vi.fn();
    render(
        <ShipmentDetailsModal
            isOpen={true} onClose={() => {}} shipment={shipment} onUpdate={onUpdate}
            drivers={[ANTONIO]} allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
    const casilla = screen.getByRole('checkbox', { name: /Porte Cobrado/ });
    if (!casilla.checked) fireEvent.click(casilla);
    fireEvent.click(screen.getByText('Guardar Cambios'));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    return onUpdate.mock.calls[0][1];
};

describe('ShipmentDetailsModal: marcar Porte Cobrado desde administración', () => {
    it('sella la fecha del cobro y al conductor asignado como cobrador', async () => {
        const guardado = await abrirYMarcarPorteCobrado(sum1204);
        expect(guardado.portePaid).toBe(true);
        expect(guardado.porteCollectedById).toBe(7);
        expect(new Date(guardado.portePaidAt).toDateString()).toBe(new Date().toDateString());
    });

    it('y con eso los 12 € salen en la Cuenta de Antonio del día', async () => {
        const guardado = await abrirYMarcarPorteCobrado(sum1204);
        const cuenta = calculateDailyAccount({
            allShipments: [{ ...sum1204, ...guardado }],
            driverId: 7,
            clients: [],
            collectedCollections: [],
        });
        expect(cuenta.collectedPorte).toBe(12);
    });

    it('un retoque de la oficina no vuelve a fechar hoy un cobro de otro día', async () => {
        const yaCobrado = { ...sum1204, portePaid: true, portePaidAt: '2026-09-10T09:00:00.000Z', porteCollectedById: 3 };
        const guardado = await abrirYMarcarPorteCobrado(yaCobrado);
        expect(guardado.portePaidAt).toBe('2026-09-10T09:00:00.000Z');
        expect(guardado.porteCollectedById).toBe(3);
    });
});
