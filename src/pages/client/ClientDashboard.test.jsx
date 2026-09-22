// ── El portal enseña lo que el cliente manda Y lo que recibe ──
//
// Antes sólo salían los envíos en los que el cliente era el remitente. Un porte
// debido que mandaba él sí salía (era remitente), pero nada de lo que le llegaba
// de otros. Ahora sale cualquier albarán en el que aparezca, en un lado o en el
// otro, y los recibidos se marcan para que no vea su propio nombre en la
// columna de destinatario sin saber por qué.

import { render, screen, within, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import ClientDashboard from './ClientDashboard';

// Todo esto arrastra medio proyecto (PDF, impresión, Supabase) y aquí no se abre.
vi.mock('../../components/shipments/ShipmentDetailsModal', () => ({ default: () => null }));
vi.mock('../../components/clients/LabelPrintModal', () => ({ default: () => null }));
vi.mock('../../components/clients/ImportExcelShipments', () => ({ default: () => null }));
vi.mock('../../utils/deliveryPdf', () => ({ generateDeliveryPDF: vi.fn(), generateDeliveryNotesPDF: vi.fn() }));
vi.mock('../../utils/printShipment', () => ({ printShipmentTicket: vi.fn() }));
// El manifiesto se calcula de verdad (qué envíos entran) y sólo se ahorra la descarga.
vi.mock('../../utils/manifiestoDeCarga', async (importOriginal) => ({
    ...(await importOriginal()),
    descargarManifiesto: vi.fn(),
}));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: vi.fn() }));
vi.mock('../../utils/ventanaPadre', () => ({ avisarAlPadre: vi.fn(), estamosEmbebidos: () => false }));
// La agenda del servidor (fase 26): por defecto no contesta nada, y cada test
// que la necesite le pone sus filas.
vi.mock('../../utils/agendaDestinatariosServidor', () => ({ cargarAgendaDelServidor: vi.fn(async () => []) }));

import { cargarAgendaDelServidor } from '../../utils/agendaDestinatariosServidor';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { descargarManifiesto } from '../../utils/manifiestoDeCarga';

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
describe('ClientDashboard · columna Porte', () => {
    it('dice Pagado o Debido según el albarán, sin importe', () => {
        pintar();
        expect(screen.getByRole('columnheader', { name: /Porte/ })).toBeInTheDocument();
        expect(within(filaDe('SUM-100')).getByText('Debido')).toBeInTheDocument();
        expect(within(filaDe('SUM-101')).getByText('Pagado')).toBeInTheDocument();
        expect(filaDe('SUM-100').textContent).not.toMatch(/€/);
    });
});

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

describe('ClientDashboard · precio del envío por baremo', () => {
    // El portal calculaba el baremo con una copia propia: la primera fila de
    // Ajustes que casara, y sin baremo valía como Baremo 1. Un envío del cliente
    // a Antequera salía a 4,30 (precio B1) con una fila así (18/9/2026).
    it('a Antequera cobra el precio B2 aunque en Ajustes quede una fila suya sin baremo', async () => {
        cargarAgendaDelServidor.mockResolvedValueOnce([
            { nombre: 'Ferretería Antequera', direccion: 'C/ Infante 3', cp: '29200', poblacion: 'Antequera',
              ficha_id: null, sede_id: null, veces: 2, ultimo_envio: '2026-08-01T10:00:00.000Z' },
        ]);
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 502 });
        const onCreateShipment = vi.fn();
        const BLT_1 = { id: '1774442159060', name: 'BLT_1', category: 'BADI', price: '4.30', priceB2: '6.00' };
        render(
            <ClientDashboard client={ESMEBRA} onLogout={() => {}} allShipments={[enviado]} drivers={[]}
                allClients={[ESMEBRA]} articles={[BLT_1]} tariffs={[]}
                coverageZones={[{ id: 1, name: 'Antequera', zip: '29200' }, { id: 2, name: 'Antequera', zip: '29200', baremo: 2 }]}
                onCreateShipment={onCreateShipment} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()} />
        );
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        const destinatario = screen.getByPlaceholderText('Empieza a escribir para ver sugerencias...');
        fireEvent.focus(destinatario);
        await waitFor(() => expect(screen.getByText('Ferretería Antequera')).toBeTruthy());
        fireEvent.mouseDown(screen.getByText('Ferretería Antequera').closest('button'));

        fireEvent.change(document.querySelector('select[required]'), { target: { value: BLT_1.id } });
        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio.destinationCity).toBe('Antequera');
        expect(envio.articles[0].unitPrice).toBe(6);
        expect(envio.amount).toBe('6.00');
    });
});

// ── Población fuera de los baremos (22/09/2026) ──
//
// Un destino que no sale en el Baremo 1 ni en el 2 se cobra como mínimo a 12 €.
// Al cliente que paga en mano (no es de Facturación) se le avisa bajo la
// localidad de que pregunte el precio en la oficina; al de Facturación no.
describe('ClientDashboard · población fuera de baremo', () => {
    const BLT_1 = { id: '1774442159060', name: 'BLT_1', category: 'BADI', price: '4.30', priceB2: '6.00' };
    const AVISO = 'Población fuera de nuestras tarifas';

    const pintarAlta = (cliente) => {
        const onCreateShipment = vi.fn();
        render(
            <ClientDashboard client={cliente} onLogout={() => {}} allShipments={[enviado]} drivers={[]}
                allClients={[cliente]} articles={[BLT_1]} tariffs={[]} coverageZones={[]}
                onCreateShipment={onCreateShipment} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()} />
        );
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        return onCreateShipment;
    };

    const tecleaDestino = (poblacion, cp) => {
        fireEvent.change(screen.getByPlaceholderText('Escribe para buscar...'), { target: { value: poblacion } });
        const cpInput = screen.getByText('Código Postal Destino').parentElement.querySelector('input');
        fireEvent.change(cpInput, { target: { value: cp } });
    };

    it('cliente que paga en mano: ve el aviso de preguntar en la oficina y el envío sale a 12 €', async () => {
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 503 });
        const onCreateShipment = pintarAlta({ ...ESMEBRA, billingType: 'Clientes Habituales' });

        expect(screen.queryByText(AVISO)).toBeNull();
        tecleaDestino('Pueblo Inventado', '29999');
        expect(screen.getByText(AVISO)).toBeTruthy();
        expect(screen.getByRole('alert').textContent).toContain('957 245 221');

        fireEvent.change(document.querySelector('select[required]'), { target: { value: BLT_1.id } });
        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio.articles[0].unitPrice).toBe(6); // el B2 del catálogo, que se queda por debajo del mínimo
        expect(envio.amount).toBe('12.00');
    });

    it('cliente de Facturación: mismo mínimo de 12 € pero sin aviso', async () => {
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 504 });
        const onCreateShipment = pintarAlta({ ...ESMEBRA, billingType: 'Facturación' });

        tecleaDestino('Pueblo Inventado', '29999');
        expect(screen.queryByText(AVISO)).toBeNull();

        fireEvent.change(document.querySelector('select[required]'), { target: { value: BLT_1.id } });
        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        expect(onCreateShipment.mock.calls[0][0].amount).toBe('12.00');
    });

    it('un pueblo de los baremos no avisa ni sube el precio', async () => {
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 505 });
        const onCreateShipment = pintarAlta({ ...ESMEBRA, billingType: 'Clientes Habituales' });

        tecleaDestino('Lucena', '14900');
        expect(screen.queryByText(AVISO)).toBeNull();

        fireEvent.change(document.querySelector('select[required]'), { target: { value: BLT_1.id } });
        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        expect(onCreateShipment.mock.calls[0][0].amount).toBe('4.30');
    });
});

// ── Modificar o borrar: sólo lo suyo y sólo hasta que pasamos el escáner ──
//
// El cliente puede cambiar o quitar un envío mientras siga pendiente y ningún
// conductor le haya escaneado un bulto. A partir de ahí es nuestro: se le
// enseña un candado que dice por qué, y sólo la oficina lo toca. La regla de
// verdad está en la base de datos (fase 31); aquí se comprueba que la pantalla
// la refleja y que modificar no reserva otro número ni crea otro albarán.
describe('ClientDashboard · modificar y borrar hasta el escáner', () => {
    const pendiente = (extra = {}) => ({
        ...enviado, id: 'SUM-300', destinationAddress: 'C/ Vieja 1', destinationZip: '14900',
        porteType: 'Pagado', observations: 'antes', ...extra,
    });
    const pintarCon = (envio, props = {}) => render(
        <ClientDashboard client={ESMEBRA} onLogout={() => {}} allShipments={[envio]} drivers={[]}
            allClients={[ESMEBRA]} articles={[]} tariffs={[]} coverageZones={[]}
            onCreateShipment={vi.fn()} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()}
            onUpdateShipment={vi.fn(async () => true)} {...props} />
    );
    const campoDestinatario = () => screen.getByPlaceholderText('Empieza a escribir para ver sugerencias...');
    const campoObservaciones = () => screen.getByPlaceholderText('Instrucciones, horario de entrega...');

    it('pendiente y sin escanear: puede modificar y borrar', () => {
        pintarCon(pendiente());
        const fila = within(filaDe('SUM-300'));
        expect(fila.getByTitle('Modificar Envío')).toBeTruthy();
        expect(fila.getByTitle('Borrar Envío')).toBeTruthy();
    });

    it('con un bulto escaneado se cierran los dos botones y el candado dice por qué', () => {
        pintarCon(pendiente({ scannedPackages: [1] }));
        const fila = within(filaDe('SUM-300'));
        expect(fila.queryByTitle('Modificar Envío')).toBeNull();
        expect(fila.queryByTitle('Borrar Envío')).toBeNull();
        expect(fila.getByTitle(/Ya hemos recogido este envío/)).toBeTruthy();
    });

    it('en reparto no hay botones ni candado, como siempre', () => {
        pintarCon(pendiente({ status: 'En reparto' }));
        const fila = within(filaDe('SUM-300'));
        expect(fila.queryByTitle('Modificar Envío')).toBeNull();
        expect(fila.queryByTitle('Borrar Envío')).toBeNull();
        expect(fila.queryByTitle(/sólo puede modificarlo/)).toBeNull();
    });

    it('al modificar se guarda con el mismo número, sin reservar otro ni crear albarán', async () => {
        const onUpdateShipment = vi.fn(async () => true);
        const onCreateShipment = vi.fn();
        reservarNumerosAlbaran.mockClear();
        pintarCon(pendiente(), { onUpdateShipment, onCreateShipment });

        fireEvent.click(within(filaDe('SUM-300')).getByTitle('Modificar Envío'));
        expect(screen.getByText('Modificar Envío SUM-300')).toBeTruthy();
        expect(campoDestinatario().value).toBe('FERRETERIA PEPE');
        expect(campoObservaciones().value).toBe('antes');
        expect(document.querySelector('input[name="porteType"][value="Pagado"]').checked).toBe(true);

        fireEvent.change(campoObservaciones(), { target: { value: 'Llamar antes de ir' } });
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onUpdateShipment).toHaveBeenCalled());
        const [id, cambios] = onUpdateShipment.mock.calls[0];
        expect(id).toBe('SUM-300');
        expect(cambios).toMatchObject({ observations: 'Llamar antes de ir', destinationName: 'FERRETERIA PEPE', porteType: 'Pagado' });
        // Lo que no es del formulario no viaja: ni número, ni fecha, ni estado.
        expect(cambios).not.toHaveProperty('id');
        expect(cambios).not.toHaveProperty('status');
        expect(cambios).not.toHaveProperty('createdAt');
        // Y el destinatario no se ha tocado, así que el enlace se queda como estaba.
        expect(cambios).not.toHaveProperty('destinatarioId');
        expect(onCreateShipment).not.toHaveBeenCalled();
        expect(reservarNumerosAlbaran).not.toHaveBeenCalled();
        // Vuelve a la lista.
        await waitFor(() => expect(screen.queryByText('Modificar Envío SUM-300')).toBeNull());
    });

    it('si cambia el nombre del destinatario a mano, se suelta el enlace para que el servidor vuelva a emparejar', async () => {
        const onUpdateShipment = vi.fn(async () => true);
        pintarCon(pendiente({ destinatarioId: 101, destinatarioEmparejadoPor: 'agenda' }), { onUpdateShipment });
        fireEvent.click(within(filaDe('SUM-300')).getByTitle('Modificar Envío'));
        fireEvent.change(campoDestinatario(), { target: { value: 'OTRA FERRETERIA' } });
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onUpdateShipment).toHaveBeenCalled());
        expect(onUpdateShipment.mock.calls[0][1]).toMatchObject({
            destinationName: 'OTRA FERRETERIA', destinatarioId: null, destinatarioSedeId: null, destinatarioEmparejadoPor: null,
        });
    });

    it('si la base de datos ya no lo deja, se queda en el formulario con lo escrito', async () => {
        const onUpdateShipment = vi.fn(async () => false);
        pintarCon(pendiente(), { onUpdateShipment });
        fireEvent.click(within(filaDe('SUM-300')).getByTitle('Modificar Envío'));
        fireEvent.change(campoObservaciones(), { target: { value: 'esto se queda' } });
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onUpdateShipment).toHaveBeenCalled());
        expect(screen.getByText('Modificar Envío SUM-300')).toBeTruthy();
        expect(campoObservaciones().value).toBe('esto se queda');
    });

    it('Cancelar vuelve a la lista sin guardar nada, y la pestaña de crear sale limpia', () => {
        const onUpdateShipment = vi.fn(async () => true);
        pintarCon(pendiente(), { onUpdateShipment });
        fireEvent.click(within(filaDe('SUM-300')).getByTitle('Modificar Envío'));
        fireEvent.click(screen.getByText('Cancelar'));
        expect(onUpdateShipment).not.toHaveBeenCalled();
        expect(screen.getByText('SUM-300')).toBeTruthy();

        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        expect(screen.getByText('Datos del Nuevo Envío')).toBeTruthy();
        expect(campoDestinatario().value).toBe('');
    });
});


// ── Varios artículos con cantidad: sólo con el interruptor de la ficha ──
//
// Los talleres de neumáticos (Velasco, Lucena, ACTIVA) mandan siempre por
// cantidad: "4 de turismo y 2 de 4x4". Con un solo artículo el portal no lo
// podía recoger. La ficha lleva el interruptor `portalVariosArticulos`; con él
// el cliente añade líneas con cantidad (utils/articulosDelPortal.js). Sin él,
// todo sigue como siempre: un artículo, una unidad.

describe('ClientDashboard · varios artículos con cantidad', () => {
    const TURISMO = { id: '7', name: 'TURISMO', category: 'Neumáticos', price: '3.50' };
    const CUATRO_X_CUATRO = { id: '8', name: '4X4', category: 'Neumáticos', price: '5.00' };
    const BLT_5 = { id: '5', name: 'BLT_5', category: 'BADI', price: '4.30' };
    const VELASCO = { ...ESMEBRA, id: 43, name: 'NEUMATICOS VELASCO', allowedArticles: ['7', '8', '5'], portalVariosArticulos: true };
    const pintarCon = (cliente, props = {}) => render(
        <ClientDashboard client={cliente} onLogout={() => {}} allShipments={[]} drivers={[]}
            allClients={[cliente]} articles={[TURISMO, CUATRO_X_CUATRO, BLT_5]} tariffs={[]} coverageZones={[]}
            onCreateShipment={vi.fn()} onUpdateClient={vi.fn()} onDeleteShipment={vi.fn()}
            onUpdateShipment={vi.fn(async () => true)} {...props} />
    );
    const selector = () => document.querySelector('#articulo-portal');
    const campoCantidad = () => document.querySelector('#cantidad-articulo');
    const botonAnadir = () => screen.queryByRole('button', { name: /Añadir/ });
    const anadir = (id, cantidad) => {
        fireEvent.change(selector(), { target: { value: id } });
        fireEvent.change(campoCantidad(), { target: { value: cantidad } });
        fireEvent.click(botonAnadir());
    };
    const lineas = () => Array.from(document.querySelectorAll('ul[aria-label="Artículos del envío"] li'))
        .map(li => li.querySelector('span').textContent.trim());
    const rellenarDestinoYPorte = () => {
        fireEvent.change(screen.getByPlaceholderText('Empieza a escribir para ver sugerencias...'), { target: { value: 'TALLER PACO' } });
        fireEvent.click(document.querySelector('input[name="porteType"][value="Pagado"]'));
    };

    it('sin el interruptor no hay cantidad ni Añadir: un artículo y una unidad, como siempre', async () => {
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 900 });
        const onCreateShipment = vi.fn();
        pintarCon({ ...VELASCO, portalVariosArticulos: false }, { onCreateShipment });
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        expect(campoCantidad()).toBeNull();
        expect(botonAnadir()).toBeNull();
        expect(selector().required).toBe(true);
        fireEvent.change(selector(), { target: { value: '5' } });
        rellenarDestinoYPorte();
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio.articles).toHaveLength(1);
        expect(envio.articles[0]).toMatchObject({ name: 'BLT_5', quantity: 1, unitPrice: 4.3, totalPrice: 4.3 });
        expect(envio.packages).toBe(5);
        expect(envio.amount).toBe('4.30');
    });

    it('con el interruptor: 4 de turismo y 2 de 4x4 son dos líneas, seis bultos y la suma de los dos', async () => {
        reservarNumerosAlbaran.mockResolvedValueOnce({ primero: 901 });
        const onCreateShipment = vi.fn();
        pintarCon(VELASCO, { onCreateShipment });
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        expect(selector().required).toBe(false);
        expect(botonAnadir().disabled).toBe(true);           // sin artículo elegido no hay nada que añadir
        anadir('7', '4');
        anadir('8', '2');
        expect(lineas()).toEqual(['4x TURISMO', '2x 4X4']);
        expect(selector().value).toBe('');                    // tras Añadir se vacía para la siguiente línea
        expect(campoCantidad().value).toBe('1');
        rellenarDestinoYPorte();
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onCreateShipment).toHaveBeenCalled());
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio.articles.map(a => [a.name, a.quantity, a.unitPrice, a.totalPrice])).toEqual([
            ['TURISMO', 4, 3.5, 14], ['4X4', 2, 5, 10],
        ]);
        expect(envio.packages).toBe(6);
        expect(envio.amount).toBe('24.00');
    });

    it('el mismo artículo dos veces se suma en una línea, y la X la quita', () => {
        pintarCon(VELASCO);
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        anadir('7', '4');
        anadir('7', '1');
        anadir('8', '2');
        expect(lineas()).toEqual(['5x TURISMO', '2x 4X4']);
        fireEvent.click(screen.getByTitle('Quitar TURISMO'));
        expect(lineas()).toEqual(['2x 4X4']);
    });

    it('sin ninguna línea no se crea el envío ni se reserva número, y se le dice', async () => {
        const onCreateShipment = vi.fn();
        const alerta = vi.spyOn(window, 'alert').mockImplementation(() => {});
        reservarNumerosAlbaran.mockClear();
        pintarCon(VELASCO, { onCreateShipment });
        fireEvent.click(screen.getByText('Crear Nuevo Envío'));
        rellenarDestinoYPorte();
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(alerta).toHaveBeenCalled());
        expect(alerta.mock.calls[0][0]).toMatch(/FALTA LA MERCANCÍA/);
        expect(onCreateShipment).not.toHaveBeenCalled();
        expect(reservarNumerosAlbaran).not.toHaveBeenCalled();
        expect(screen.getByText(/Elige el artículo, pon la cantidad y pulsa Añadir/).className).toContain('text-red-600');
        alerta.mockRestore();
    });

    it('al modificar un envío con varias líneas salen todas, y se pueden cambiar', async () => {
        const onUpdateShipment = vi.fn(async () => true);
        const envio = {
            id: 'SUM-310', client: 'NEUMATICOS VELASCO', originName: 'NEUMATICOS VELASCO',
            destinationName: 'TALLER PACO', destinationAddress: 'C/ Nueva 2', destinationZip: '14900', destinationCity: 'Lucena',
            porteType: 'Pagado', status: 'Pendiente de asignar', createdAt: '2026-09-21T10:00:00.000Z', packages: 6,
            articles: [{ ...TURISMO, quantity: 4, unitPrice: 3.5, totalPrice: 14 }, { ...CUATRO_X_CUATRO, quantity: 2, unitPrice: 5, totalPrice: 10 }],
        };
        pintarCon(VELASCO, { allShipments: [envio], onUpdateShipment });
        fireEvent.click(within(filaDe('SUM-310')).getByTitle('Modificar Envío'));
        expect(lineas()).toEqual(['4x TURISMO', '2x 4X4']);
        fireEvent.click(screen.getByTitle('Quitar 4X4'));
        anadir('5', '1');
        fireEvent.submit(document.querySelector('form'));

        await waitFor(() => expect(onUpdateShipment).toHaveBeenCalled());
        const [id, cambios] = onUpdateShipment.mock.calls[0];
        expect(id).toBe('SUM-310');
        expect(cambios.articles.map(a => [a.name, a.quantity])).toEqual([['TURISMO', 4], ['BLT_5', 1]]);
        expect(cambios.packages).toBe(9);
        expect(cambios.amount).toBe('18.30');
    });
});

// ── Manifiesto de carga ──
//
// La hoja que el cliente le da a firmar al conductor con lo que se lleva. Sin
// fechas puestas es lo de hoy; con fechas, lo que hay en pantalla. Nunca entra
// lo que le llega a él (no se lo lleva nadie de su nave) ni los anulados.
describe('ClientDashboard · manifiesto de carga', () => {
    const boton = () => screen.getByRole('button', { name: /Manifiesto de carga/ });

    afterEach(() => { vi.useRealTimers(); descargarManifiesto.mockClear(); });

    it('sin fechas puestas cuenta sólo lo que ha mandado hoy y lo descarga al pulsar', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 1, 17, 0)); // el día del enviado
        pintar();
        expect(boton().textContent).toContain('(1)');
        fireEvent.click(boton());
        expect(descargarManifiesto).toHaveBeenCalledTimes(1);
        const { client, envios } = descargarManifiesto.mock.calls[0][0];
        expect(client).toBe(ESMEBRA);
        expect(envios.map(s => s.id)).toEqual(['SUM-100']);
    });

    it('un día sin envíos deja el botón cerrado y explica que se pongan fechas', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date(2026, 8, 22, 17, 0));
        pintar();
        expect(boton().textContent).toContain('(0)');
        expect(boton().disabled).toBe(true);
        expect(boton().title).toMatch(/Pon fechas/);
        fireEvent.click(boton());
        expect(descargarManifiesto).not.toHaveBeenCalled();
    });

    it('con fechas puestas entra lo que manda en ese rango, y sigue sin entrar lo que recibe', () => {
        pintar();
        const [desde, hasta] = document.querySelectorAll('input[type="date"]');
        fireEvent.change(desde, { target: { value: '2026-09-01' } });
        fireEvent.change(hasta, { target: { value: '2026-09-02' } });
        expect(screen.getByText('SUM-101')).toBeTruthy(); // el recibido está en pantalla...
        expect(boton().textContent).toContain('(1)');        // ...pero no en el manifiesto
        fireEvent.click(boton());
        expect(descargarManifiesto.mock.calls[0][0].envios.map(s => s.id)).toEqual(['SUM-100']);
    });
});
