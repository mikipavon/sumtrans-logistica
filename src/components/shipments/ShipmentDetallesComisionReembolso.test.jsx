// ── Al editar, la comisión del reembolso es de quien paga el porte ──
//
// 28/09/2026: un envío de VYPSA (reembolso a porcentaje, mínimo 4 €) a porte
// debido le cobró esa comisión a su destinatario. Al corregir el albarán, la
// comisión se rehace con la ficha de quien paga; el resto del precio no se toca.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const VYPSA = { id: 1, name: 'VYPSA', codFeeMode: 'porcentaje', codFeePercent: '3', codFeeMin: '4' };
const FERRETERIA = { id: 2, name: 'FERRETERIA LOPEZ' };

// Porte de 10 € más los 4 € de comisión de VYPSA, cobrados al destinatario.
const albaran = {
    id: 'HAB-700',
    client: 'VYPSA',
    destinationName: 'FERRETERIA LOPEZ',
    porteType: 'Debido',
    status: 'En reparto',
    date: '28 sept 2026',
    originCity: 'Cabra',
    originZip: '14940',
    destinationCity: 'Lucena',
    destinationZip: '14900',
    amount: '€14.00',
    customAmount: 14,
    hasCod: true,
    codAmount: 50,
    codCommission: 4,
    packages: '1 caja',
    articles: [],
};

const abrirEnEdicion = (extra = {}, onUpdate = vi.fn()) => {
    render(
        <ShipmentDetailsModal
            showAdminControls
            isOpen={true} onClose={() => {}} shipment={{ ...albaran, ...extra }} onUpdate={onUpdate}
            allPoblaciones={[]} clients={[VYPSA, FERRETERIA]} articles={[]} tariffs={null} coverageZones={[]}
            defaultCodFee="3.00"
        />
    );
    fireEvent.click(screen.getByTitle('Editar'));
    return onUpdate;
};

const guardar = async (onUpdate) => {
    fireEvent.click(screen.getByText('Guardar Cambios'));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    return onUpdate.mock.calls[0][1];
};
const numero = (v) => parseFloat(String(v).replace(/[^0-9.-]/g, ''));
const tipoDePorte = () => screen.getByDisplayValue(/^(Pagado|Debido) \(/);

describe('ShipmentDetailsModal: la comisión del reembolso al editar', () => {
    it('entrar a editar y guardar no toca la comisión que tenía', async () => {
        const guardado = await guardar(abrirEnEdicion());
        expect(numero(guardado.codCommission)).toBe(4);
        expect(numero(guardado.amount)).toBe(14);
    });

    it('volver a teclear el reembolso de un debido pone la general y conserva el porte', async () => {
        const onUpdate = abrirEnEdicion();
        const casilla = screen.getByPlaceholderText('REEMBOLSO 0.00');
        fireEvent.change(casilla, { target: { value: '60' } });

        const guardado = await guardar(onUpdate);
        expect(numero(guardado.codCommission)).toBe(3);
        expect(numero(guardado.amount)).toBe(13);
    });

    it('pasar de Pagado a Debido rehace la comisión con la general', async () => {
        const onUpdate = abrirEnEdicion({ porteType: 'Pagado' });
        fireEvent.change(tipoDePorte(), { target: { value: 'Debido' } });

        const guardado = await guardar(onUpdate);
        expect(numero(guardado.codCommission)).toBe(3);
        expect(numero(guardado.amount)).toBe(13);
    });

    it('pasar de Debido a Pagado le pone a VYPSA su tarifa', async () => {
        const onUpdate = abrirEnEdicion({ amount: '€13.00', customAmount: 13, codCommission: 3, codAmount: 400 });
        fireEvent.change(tipoDePorte(), { target: { value: 'Pagado' } });

        const guardado = await guardar(onUpdate);
        expect(numero(guardado.codCommission)).toBe(12);
        expect(numero(guardado.amount)).toBe(22);
    });
});
