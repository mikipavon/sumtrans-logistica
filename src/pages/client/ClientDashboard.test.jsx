// ── El portal enseña lo que el cliente manda Y lo que recibe ──
//
// Antes sólo salían los envíos en los que el cliente era el remitente. Un porte
// debido que mandaba él sí salía (era remitente), pero nada de lo que le llegaba
// de otros. Ahora sale cualquier albarán en el que aparezca, en un lado o en el
// otro, y los recibidos se marcan para que no vea su propio nombre en la
// columna de destinatario sin saber por qué.

import { render, screen, within, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ClientDashboard from './ClientDashboard';

// Todo esto arrastra medio proyecto (PDF, impresión, Supabase) y aquí no se abre.
vi.mock('../../components/shipments/ShipmentDetailsModal', () => ({ default: () => null }));
vi.mock('../../components/clients/LabelPrintModal', () => ({ default: () => null }));
vi.mock('../../components/clients/ImportExcelShipments', () => ({ default: () => null }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn(), generateDeliveryNotesPDF: vi.fn() }));
vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: vi.fn() }));
vi.mock('../../utils/ventanaPadre', () => ({ avisarAlPadre: vi.fn(), estamosEmbebidos: () => false }));

const ESMEBRA = { id: 42, name: 'ESMEBRA', address: 'C/ Real 1', zip: '14940', city: 'Cabra' };

const enviado = {
    id: 'SUM-100',
    client: 'ESMEBRA',
    originName: 'ESMEBRA',
    destinationName: 'FERRETERIA PEPE',
    destinationCity: 'Lucena',
    porteType: 'Debido',            // lo paga el de enfrente y aun así es suyo
    status: 'Pendiente de asignar',
    createdAt: '2026-09-01T10:00:00.000Z',
};

const recibido = {
    id: 'SUM-101',
    client: 'ALMACENES RUIZ',
    originName: 'ALMACENES RUIZ',
    destinationName: 'Esmebra',      // tecleado a mano por la oficina, sin clientId
    destinationCity: 'Cabra',
    porteType: 'Pagado',
    status: 'Pendiente de asignar',
    createdAt: '2026-09-02T10:00:00.000Z',
};

const ajeno = {
    id: 'SUM-102',
    client: 'OTRO',
    destinationName: 'OTRO MAS',
    status: 'Entregado',
    createdAt: '2026-09-02T11:00:00.000Z',
};

const pintar = () => render(
    <ClientDashboard
        client={ESMEBRA}
        onLogout={() => {}}
        allShipments={[enviado, recibido, ajeno]}
        drivers={[]}
        allClients={[ESMEBRA]}
        articles={[]}
        tariffs={[]}
        coverageZones={[]}
        onCreateShipment={vi.fn()}
        onUpdateClient={vi.fn()}
        onDeleteShipment={vi.fn()}
    />
);

const filaDe = (id) => screen.getByText(id).closest('tr');

describe('ClientDashboard · lo que ve el cliente', () => {
    it('salen el que manda (porte debido) y el que recibe, y no el ajeno', () => {
        pintar();
        expect(screen.getByText('SUM-100')).toBeTruthy();
        expect(screen.getByText('SUM-101')).toBeTruthy();
        expect(screen.queryByText('SUM-102')).toBeNull();
    });

    it('en el recibido se marca RECIBIDO y se enseña quién se lo manda', () => {
        pintar();
        const fila = within(filaDe('SUM-101'));
        expect(fila.getByText('RECIBIDO')).toBeTruthy();
        expect(fila.getByText('ALMACENES RUIZ')).toBeTruthy();
        expect(fila.queryByText('Esmebra')).toBeNull();
    });

    it('en el enviado no hay marca y se enseña el destinatario', () => {
        pintar();
        const fila = within(filaDe('SUM-100'));
        expect(fila.queryByText('RECIBIDO')).toBeNull();
        expect(fila.getByText('FERRETERIA PEPE')).toBeTruthy();
    });

    it('sólo puede borrar lo que ha mandado él, no lo que le llega', () => {
        pintar();
        expect(within(filaDe('SUM-100')).getByTitle('Borrar Envío')).toBeTruthy();
        expect(within(filaDe('SUM-101')).queryByTitle('Borrar Envío')).toBeNull();
    });
});

// ── Buscador por nombre en el portal ──
//
// Con decenas de envíos, el filtro de fechas no basta para dar con uno: el
// cliente busca por el nombre de quien lo recibe o se lo manda, por su propia
// referencia o por el número de albarán. Sin tildes, como en la oficina.
describe('ClientDashboard · buscador', () => {
    const buscar = (texto) => fireEvent.change(
        screen.getByRole('textbox', { name: /buscar envíos/i }), { target: { value: texto } }
    );

    it('encuentra por el destinatario, sin tildes', () => {
        pintar();
        buscar('ferretería pepe');
        expect(screen.getByText('SUM-100')).toBeTruthy();
        expect(screen.queryByText('SUM-101')).toBeNull();
    });

    it('encuentra por quien se lo manda', () => {
        pintar();
        buscar('ruiz');
        expect(screen.getByText('SUM-101')).toBeTruthy();
        expect(screen.queryByText('SUM-100')).toBeNull();
    });

    it('encuentra por el número de albarán', () => {
        pintar();
        buscar('sum-101');
        expect(screen.getByText('SUM-101')).toBeTruthy();
        expect(screen.queryByText('SUM-100')).toBeNull();
    });

    it('Limpiar filtros vacía también el buscador', () => {
        pintar();
        buscar('nada de nada');
        expect(screen.queryByText('SUM-100')).toBeNull();
        fireEvent.click(screen.getByText('Limpiar filtros'));
        expect(screen.getByText('SUM-100')).toBeTruthy();
        expect(screen.getByText('SUM-101')).toBeTruthy();
    });
});
