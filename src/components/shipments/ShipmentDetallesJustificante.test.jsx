// ── La oficina corrige el justificante de entrega ──
//
// SUM-2513, 28 de septiembre de 2026: entregado por Francis, recibe "Almazara"
// sin DNI y con una foto de entrega. El bloque del justificante sólo enseñaba:
// si el repartidor apuntaba mal el documento o hacía la foto que no era, la
// oficina no tenía dónde arreglarlo. Ahora, al editar desde administración, se
// corrigen el nombre y el DNI y se quitan las fotos. La firma no se toca.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';
import { generateDeliveryPDF } from '../../utils/deliveryPdf';

vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const FOTO = 'https://x.supabase.co/storage/v1/object/public/delivery_photos/SUM-2513_foto.jpg';
const FOTO_DOC = 'https://x.supabase.co/storage/v1/object/public/delivery_photos/SUM-2513_doc.jpg';
const FIRMA = 'https://x.supabase.co/storage/v1/object/public/signatures/SUM-2513_firma.png';

const sum2513 = {
    id: 'SUM-2513',
    client: 'ACEITES DEL SUR',
    destinationName: 'ALMAZARA DE LA SUBBETICA',
    porteType: 'Debido',
    status: 'Entregado',
    assignedDriverId: 4,
    date: '28/9/2026',
    amount: '€12.00',
    customAmount: 12,
    codAmount: 0,
    hasCod: false,
    portePaid: true,
    portePaidAt: '2026-09-28T12:00:00.000Z',
    porteCollectedById: 4,
    packages: '1x BLT_1',
    articles: [],
    receiverName: 'Almazara',
    receiverId: '',
    deliverySignature: FIRMA,
    deliveryPhoto: FOTO,
    deliveryCoordinates: '37.47,-4.45',
};

const abrir = ({ shipment = sum2513, ...extra } = {}) => {
    const onUpdate = vi.fn();
    render(
        <ShipmentDetailsModal
            showAdminControls
            isOpen={true} onClose={() => {}} shipment={shipment} onUpdate={onUpdate}
            drivers={[{ id: 4, name: 'FRANCIS', isActive: true }]}
            allPoblaciones={[]} clients={[]} articles={[]} tariffs={null} coverageZones={[]}
            {...extra}
        />
    );
    return onUpdate;
};
const editar = () => fireEvent.click(screen.getByTitle('Editar'));
const guardar = async (onUpdate) => {
    fireEvent.click(screen.getByText('Guardar Cambios'));
    await vi.waitFor(() => expect(onUpdate).toHaveBeenCalled());
    return onUpdate.mock.calls[0][1];
};
const casillaNombre = () => screen.queryByLabelText('Nombre de quien recibe');
const casillaDni = () => screen.queryByLabelText('DNI de quien recibe');

beforeEach(() => vi.mocked(generateDeliveryPDF).mockClear());

describe('ShipmentDetailsModal: corregir el justificante desde administración', () => {
    it('sin pulsar el lápiz sólo se enseña', () => {
        abrir();
        expect(screen.getByText('Almazara')).toBeInTheDocument();
        expect(casillaNombre()).toBeNull();
        expect(screen.queryByText('Quitar foto')).toBeNull();
    });

    it('apuntar el DNI que faltaba lo guarda y deja constancia de que se tocó', async () => {
        const onUpdate = abrir();
        editar();
        fireEvent.change(casillaDni(), { target: { value: ' 30123456X ' } });
        const guardado = await guardar(onUpdate);

        expect(guardado.receiverId).toBe('30123456X');
        expect(guardado.receiverName).toBe('Almazara');
        expect(guardado.proofEditedBy).toBe('Administrador');
        expect(guardado.proofEditedAt).toBeTruthy();
        // Ni la entrega, ni el cobro, ni la firma, ni la foto se mueven.
        expect(guardado.status).toBe('Entregado');
        expect(guardado.portePaidAt).toBe('2026-09-28T12:00:00.000Z');
        expect(guardado.deliverySignature).toBe(FIRMA);
        expect(guardado.deliveryPhoto).toBe(FOTO);
        expect(await screen.findByText(/30123456X/)).toBeInTheDocument();
    });

    it('corregir el nombre lo guarda', async () => {
        const onUpdate = abrir();
        editar();
        fireEvent.change(casillaNombre(), { target: { value: 'Rafael Luque' } });
        const guardado = await guardar(onUpdate);
        expect(guardado.receiverName).toBe('Rafael Luque');
    });

    it('quitar la foto de entrega la quita del albarán y guarda dónde estaba', async () => {
        const onUpdate = abrir();
        editar();
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Entrega' }));
        expect(screen.getByText('Se quita al guardar')).toBeInTheDocument();
        expect(onUpdate).not.toHaveBeenCalled();

        const guardado = await guardar(onUpdate);
        expect(guardado.deliveryPhoto).toBeNull();
        expect(guardado.proofRemovedPhotos).toEqual([
            { campo: 'deliveryPhoto', url: FOTO, at: guardado.proofEditedAt },
        ]);
        expect(guardado.deliverySignature).toBe(FIRMA);
        expect(screen.queryByAltText('Entrega')).toBeNull();
    });

    it('la foto quitada se puede deshacer antes de guardar', async () => {
        const onUpdate = abrir();
        editar();
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Entrega' }));
        fireEvent.click(screen.getByRole('button', { name: 'Volver a poner Entrega' }));
        const guardado = await guardar(onUpdate);

        expect(guardado.deliveryPhoto).toBe(FOTO);
        expect(guardado.proofRemovedPhotos).toBeUndefined();
        expect(guardado.proofEditedAt).toBeUndefined();
    });

    it('la foto del documento firmado también se quita, sin tocar la de entrega', async () => {
        const onUpdate = abrir({ shipment: { ...sum2513, needsSignatureReturn: true, deliveryPhoto2: FOTO_DOC } });
        editar();
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Doc. Firmado' }));
        const guardado = await guardar(onUpdate);

        expect(guardado.deliveryPhoto2).toBeNull();
        expect(guardado.deliveryPhoto).toBe(FOTO);
        expect(guardado.proofRemovedPhotos.map(f => f.campo)).toEqual(['deliveryPhoto2']);
    });

    it('cancelar no guarda nada y deja el justificante como estaba', () => {
        const onUpdate = abrir();
        editar();
        fireEvent.change(casillaNombre(), { target: { value: 'Otro' } });
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Entrega' }));
        fireEvent.click(screen.getByText('Cancelar'));

        expect(onUpdate).not.toHaveBeenCalled();
        expect(screen.getByText('Almazara')).toBeInTheDocument();
        expect(screen.getByAltText('Entrega')).toBeInTheDocument();
    });

    it('guardar otra cosa de la ficha no marca el justificante como tocado', async () => {
        const onUpdate = abrir();
        editar();
        const guardado = await guardar(onUpdate);
        expect(guardado.proofEditedAt).toBeUndefined();
        expect(guardado.receiverName).toBe('Almazara');
        expect(guardado.deliveryPhoto).toBe(FOTO);
    });

    it('después de corregir, cancelar otra edición no resucita el dato viejo y el PDF sale con el nuevo', async () => {
        const onUpdate = abrir();
        editar();
        fireEvent.change(casillaDni(), { target: { value: '30123456X' } });
        fireEvent.click(screen.getByRole('button', { name: 'Quitar Entrega' }));
        await guardar(onUpdate);
        await screen.findByText(/30123456X/);

        // La ficha sigue abierta con el `shipment` de antes de guardar.
        editar();
        fireEvent.click(screen.getByText('Cancelar'));
        expect(screen.getByText(/30123456X/)).toBeInTheDocument();
        expect(screen.queryByAltText('Entrega')).toBeNull();

        fireEvent.click(screen.getByText('Descargar POD'));
        await vi.waitFor(() => expect(generateDeliveryPDF).toHaveBeenCalled());
        const delPdf = vi.mocked(generateDeliveryPDF).mock.calls[0][0];
        expect(delPdf.receiverId).toBe('30123456X');
        expect(delPdf.deliveryPhoto).toBeNull();
    });

    it('el repartidor, al editar, no puede tocar el justificante', () => {
        abrir({ showAdminControls: false });
        editar();
        expect(casillaNombre()).toBeNull();
        expect(screen.queryByText('Quitar foto')).toBeNull();
        expect(screen.getByText('Almazara')).toBeInTheDocument();
    });

    it('en sólo lectura tampoco', () => {
        abrir({ isReadOnly: true });
        expect(screen.queryByTitle('Editar')).toBeNull();
        expect(casillaNombre()).toBeNull();
        expect(screen.queryByText('Quitar foto')).toBeNull();
    });

    it('revertir la entrega sigue borrando el justificante entero, sin apuntarlo como corrección', async () => {
        const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(true);
        try {
            const onUpdate = abrir();
            editar();
            fireEvent.change(screen.getByDisplayValue('Entregado'), { target: { value: 'En reparto' } });
            const guardado = await guardar(onUpdate);

            expect(guardado.deliveryPhoto).toBeNull();
            expect(guardado.receiverName).toBeNull();
            expect(guardado.proofEditedAt).toBeUndefined();
            expect(guardado.proofRemovedPhotos).toBeUndefined();
        } finally {
            confirmar.mockRestore();
        }
    });
});
