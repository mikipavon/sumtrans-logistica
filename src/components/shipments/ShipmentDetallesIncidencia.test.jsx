// ── Que la incidencia no se borre de la ficha al resolverla ──
//
// El bloque rojo de la incidencia sólo se pintaba mientras estuviera abierta. En
// cuanto se resolvía —a mano, o sola al entregar el envío— el motivo y la foto
// desaparecían de la ficha aunque siguieran guardados en el albarán, y desde la
// aplicación no había forma de volver a mirarlos.
//
// De paso: no tener foto y tener una foto atascada en el móvil se veían igual
// (no se veía nada), así que la oficina no sabía si esperar o no.
//
// Fichero aparte de ShipmentDetailsModal.test.jsx a propósito: aquél está siendo
// tocado por otro trabajo en curso.

import { render, screen, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ShipmentDetailsModal from './ShipmentDetailsModal';

// La ficha arrastra impresión, PDF y Supabase; aquí sólo se mira la incidencia.
vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/printSimplifiedInvoice', () => ({ printSimplifiedInvoice: vi.fn() }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn() }));
vi.mock('../../utils/storage', () => ({ uploadProof: vi.fn() }));
vi.mock('../../utils/imageCompression', () => ({ compressImage: vi.fn() }));
vi.mock('../CameraCaptureModal', () => ({ default: () => null }));

const albaran = (extra) => ({
    id: 'SUM-966',
    client: 'PROSERVICE',
    status: 'Pendiente de asignar',
    destination: 'Cabra',
    date: '10 sept 2026',
    amount: 5.4,
    incidentReason: 'Local cerrado',
    ...extra,
});

const montar = (extra) => render(
    <ShipmentDetailsModal
        isOpen
        shipment={albaran(extra)}
        onClose={() => {}}
        onUpdate={() => {}}
        drivers={[]}
        clients={[]}
        allPoblaciones={[]}
    />
);

const bloque = (titulo) => screen.getByText(titulo).closest('div');

describe('Ficha del albarán — el bloque de la incidencia', () => {
    it('sigue enseñando motivo, sitio y foto cuando ya está resuelta', () => {
        montar({
            incidentStatus: 'resolved',
            incidentPhoto: 'https://ejemplo/foto.jpg',
            incidentCoordinates: '37.479831, -4.441164',
        });

        const b = bloque('INCIDENCIA RESUELTA');
        expect(within(b).getByText(/Local cerrado/)).toBeInTheDocument();
        expect(within(b).getByText('37.479831, -4.441164')).toBeInTheDocument();
        expect(within(b).getByAltText('Foto de la incidencia')).toBeInTheDocument();
    });

    it('el sitio enlaza al mapa, no es sólo texto', () => {
        montar({ incidentStatus: 'active', incidentCoordinates: '37.479831, -4.441164' });

        const enlace = screen.getByText('37.479831, -4.441164').closest('a');
        expect(enlace.getAttribute('href')).toContain('google.com/maps');
    });

    it('distingue "no hizo foto" de "la foto no ha llegado"', () => {
        const { unmount } = montar({ incidentStatus: 'active' });
        expect(screen.getByText(/no adjuntó foto/)).toBeInTheDocument();
        unmount();

        montar({ incidentStatus: 'active', proofUploadPending: true });
        expect(screen.getByText(/aún no ha subido del móvil/)).toBeInTheDocument();
    });

    it('no sale nada en un albarán que nunca tuvo incidencia', () => {
        montar({ incidentStatus: 'none', incidentReason: '' });

        expect(screen.queryByText(/INCIDENCIA REPORTADA/)).toBeNull();
        expect(screen.queryByText(/INCIDENCIA RESUELTA/)).toBeNull();
    });
});
