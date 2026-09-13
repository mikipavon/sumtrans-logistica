// ── El portal enseña lo que el cliente manda Y lo que recibe ──
//
// Antes sólo salían los envíos en los que el cliente era el remitente. Un porte
// debido que mandaba él sí salía (era remitente), pero nada de lo que le llegaba
// de otros. Ahora sale cualquier albarán en el que aparezca, en un lado o en el
// otro, y los recibidos se marcan para que no vea su propio nombre en la
// columna de destinatario sin saber por qué.

import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
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
// La agenda del servidor (fase 26): por defecto no contesta nada, y cada test
// que la necesite le pone sus filas.
vi.mock('../../utils/agendaDestinatariosServidor', () => ({ cargarAgendaDelServidor: vi.fn(async () => []) }));

import { cargarAgendaDelServidor } from '../../utils/agendaDestinatariosServidor';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';

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

// ── El reembolso sólo sale verde cuando el dinero ya está en manos del cliente ──
//
// Antes se ponía verde en cuanto el repartidor cobraba al destinatario, y el
// cliente veía "Entregado" + verde sin saber si a él ya le habían pagado. La
// prueba de pago es el justificante firmado que escanea la oficina.
describe('ClientDashboard · etiqueta del reembolso', () => {
    const conReembolso = (extra) => ({
        id: 'SUM-200', client: 'ESMEBRA', originName: 'ESMEBRA', destinationName: 'FERRETERIA PEPE',
        porteType: 'Pagado', status: 'Entregado', createdAt: '2026-09-03T10:00:00.000Z',
        hasCod: true, codAmount: 80, ...extra,
    });
    const pintarCon = (envio) => render(
        <ClientDashboard client={ESMEBRA} onLogout={() => {}} allShipments={[envio]} drivers={[]}
            allClients={[ESMEBRA]} articles={[]} tariffs={[]} coverageZones={[]}
            onCreateShipment={vi.fn()} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()} />
    );

    it('sin cobrar al destinatario: PDTE en ámbar', () => {
        pintarCon(conReembolso({ codPaid: false }));
        const marca = screen.getByText('PDTE');
        expect(marca.closest('span[title]').className).toContain('amber');
    });

    it('cobrado pero sin justificante escaneado: COBRADO, y NO verde', () => {
        pintarCon(conReembolso({ codPaid: true }));
        const marca = screen.getByText('COBRADO');
        expect(marca.closest('span[title]').className).not.toContain('emerald');
        expect(screen.queryByText('REEMBOLSO PAGADO')).toBeNull();
    });

    it('con el justificante escaneado: REEMBOLSO PAGADO en verde', () => {
        pintarCon(conReembolso({ codPaid: true, codReceiptPhoto: 'https://x/justificante.jpg' }));
        const marca = screen.getByText('REEMBOLSO PAGADO');
        expect(marca.closest('span[title]').className).toContain('emerald');
    });
});

// ── La agenda de destinatarios apunta a nuestras fichas (fase 26) ──
//
// Ibermangueras manda a Agro Velasco, que ya está en cartera. Antes el portal
// sólo sabía el texto que se tecleó en envíos anteriores; ahora el servidor le
// da la agenda entera con el id de la ficha, y el envío nuevo nace enlazado.
describe('ClientDashboard · agenda con fichas', () => {

    const abrirCrear = () => fireEvent.click(screen.getByText('Crear Nuevo Envío'));
    const campoDestinatario = () => screen.getByPlaceholderText('Empieza a escribir para ver sugerencias...');

    it('las sugerencias salen de la agenda del servidor, con la marca de los que están en cartera', async () => {
        cargarAgendaDelServidor.mockResolvedValueOnce([
            { nombre: 'Agro Velasco S.L.', direccion: 'Pol. Ind. 4', cp: '14900', poblacion: 'Lucena',
              ficha_id: 101, sede_id: null, veces: 12, ultimo_envio: '2026-08-01T10:00:00.000Z' },
            { nombre: 'Tecleado A Mano', direccion: 'C/ Sin Ficha 1', cp: '', poblacion: 'Cabra',
              ficha_id: null, sede_id: null, veces: 1, ultimo_envio: '2026-07-01T10:00:00.000Z' },
        ]);
        pintar();
        abrirCrear();
        fireEvent.focus(campoDestinatario());

        await waitFor(() => expect(screen.getByText('Agro Velasco S.L.')).toBeTruthy());
        // Se pide la agenda de ESTA ficha: es lo que hace que funcione también
        // desde la vista de administración (fase 27).
        expect(cargarAgendaDelServidor).toHaveBeenCalledWith(42);
        expect(screen.getByText('Tecleado A Mano')).toBeTruthy();
        // Y también el de la sesión (de los envíos cargados), que el servidor no conocía.
        expect(screen.getByText('FERRETERIA PEPE')).toBeTruthy();

        const enCartera = screen.getAllByText('En cartera');
        expect(enCartera).toHaveLength(1);
        expect(enCartera[0].closest('button').textContent).toContain('Agro Velasco S.L.');
    });

    it('al elegir uno en cartera, el envío nace apuntando a la ficha', async () => {
        cargarAgendaDelServidor.mockResolvedValueOnce([
            { nombre: 'Agro Velasco S.L.', direccion: 'Pol. Ind. 4', cp: '14900', poblacion: 'Lucena',
              ficha_id: 101, sede_id: 'sede-2', veces: 12, ultimo_envio: '2026-08-01T10:00:00.000Z' },
        ]);
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 500 });
        const onCreateShipment = vi.fn();
        render(
            <ClientDashboard client={ESMEBRA} onLogout={() => {}} allShipments={[enviado]} drivers={[]}
                allClients={[ESMEBRA]} articles={[]} tariffs={[]} coverageZones={[]}
                onCreateShipment={onCreateShipment} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()} />
        );
        abrirCrear();
        fireEvent.focus(campoDestinatario());
        await waitFor(() => expect(screen.getByText('Agro Velasco S.L.')).toBeTruthy());

        fireEvent.mouseDown(screen.getByText('Agro Velasco S.L.').closest('button'));
        expect(campoDestinatario().value).toBe('Agro Velasco S.L.');

        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        expect(onCreateShipment.mock.calls[0][0]).toMatchObject({
            destinationName: 'Agro Velasco S.L.',
            destinationAddress: 'Pol. Ind. 4',
            destinationZip: '14900',
            destinationCity: 'Lucena',
            destinatarioId: 101,
            destinatarioSedeId: 'sede-2',
            destinatarioEmparejadoPor: 'agenda',
        });
    });

    it('si retoca el nombre después de elegir, el enlace se suelta', async () => {
        cargarAgendaDelServidor.mockResolvedValueOnce([
            { nombre: 'Agro Velasco S.L.', direccion: 'Pol. Ind. 4', cp: '14900', poblacion: 'Lucena',
              ficha_id: 101, sede_id: null, veces: 12, ultimo_envio: '2026-08-01T10:00:00.000Z' },
        ]);
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 501 });
        const onCreateShipment = vi.fn();
        render(
            <ClientDashboard client={ESMEBRA} onLogout={() => {}} allShipments={[enviado]} drivers={[]}
                allClients={[ESMEBRA]} articles={[]} tariffs={[]} coverageZones={[]}
                onCreateShipment={onCreateShipment} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()} />
        );
        abrirCrear();
        fireEvent.focus(campoDestinatario());
        await waitFor(() => expect(screen.getByText('Agro Velasco S.L.')).toBeTruthy());
        fireEvent.mouseDown(screen.getByText('Agro Velasco S.L.').closest('button'));
        fireEvent.change(campoDestinatario(), { target: { value: 'Otra Empresa' } });

        fireEvent.click(document.querySelector('input[name="porteType"][value="Debido"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio.destinationName).toBe('Otra Empresa');
        expect(envio).not.toHaveProperty('destinatarioId');
    });

    it('si el servidor falla, queda la agenda de los envíos cargados', async () => {
        cargarAgendaDelServidor.mockRejectedValueOnce(new Error('sin red'));
        const aviso = vi.spyOn(console, 'warn').mockImplementation(() => {});
        pintar();
        abrirCrear();
        fireEvent.focus(campoDestinatario());
        await waitFor(() => expect(aviso).toHaveBeenCalled());
        expect(screen.getByText('FERRETERIA PEPE')).toBeTruthy();
        aviso.mockRestore();
    });
});
