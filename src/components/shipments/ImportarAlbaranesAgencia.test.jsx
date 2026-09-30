// ── Importar albaranes de agencia por foto: porte y población ──
//
// Caso real del 21/09/2026 (TXT, expedición 2600503090): la IA leyó
// "CORDOBA" como población (es la delegación de destino) con el CP 14920, que
// es Aguilar de la Frontera, y la pantalla exigía elegir pagado/debido cuando
// el porte de una agencia lo paga siempre la agencia. Estas pruebas fijan que:
//   - la población se cuadra con el CP nada más leer y se avisa del cambio;
//   - el porte no se pregunta y el envío nace Pagado.

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const { leerHojaConIA, leerListadoConIA, onCreateShipment } = vi.hoisted(() => ({ leerHojaConIA: vi.fn(), leerListadoConIA: vi.fn(), onCreateShipment: vi.fn() }));

vi.mock('../../utils/iaAlbaran', () => ({
    leerHojaConIA: (...args) => leerHojaConIA(...args),
    leerListadoConIA: (...args) => leerListadoConIA(...args),
    consultarSaldoIA: vi.fn().mockResolvedValue({}),
}));
// Nada de canvas ni Tesseract en jsdom: una hoja por fichero y ya.
vi.mock('../../utils/ocrAlbaran', () => ({
    hojasDeFichero: async () => [{ width: 10, height: 10 }],
    leerHoja: vi.fn(),
    miniaturaDeLienzo: () => null,
    cerrarLector: () => {},
}));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: async () => ({ primero: 700 }) }));
vi.mock('./PanelConsumoIA', () => ({ default: () => null }));

// Import dinámico tras vaciar el registro, como en CreatePickupModal.test.jsx:
// los ficheros de test comparten el registro de módulos.
let ImportarAlbaranesAgencia;
beforeAll(async () => {
    vi.resetModules();
    ImportarAlbaranesAgencia = (await import('./ImportarAlbaranesAgencia')).default;
});

const agencia = { id: 'txt', name: 'TXT', isAgency: true, address: 'Pol. Las Quemadas', zip: '14014', city: 'Córdoba', billingType: 'Clientes Habituales' };
const articulos = [{ id: 'a1', name: 'BLT_1', category: 'BADI', price: 5 }];

// Lo que devolvió Gemini con la foto real: todo bien menos la población.
const lecturaReal = {
    expedicion: '2600503090', remitente: 'S.VDA.E.FAJEDA-FAIBO, S.L.', destinatario: 'Silvia reina palma',
    direccion: 'Calle camino ancho 73', poblacion: 'CORDOBA', cp: '14920', telefono: '697665803',
    bultos: 1, kilos: 15, reembolso: 0, devolverFirmado: false,
};

function abrirImportacion({ clients = [] } = {}) {
    return render(
        <ImportarAlbaranesAgencia
            client={agencia}
            clients={clients}
            onCreateShipment={onCreateShipment}
            allShipments={[]}
            articles={articulos}
            tariffs={[]}
            coverageZones={[{ name: 'Aguilar de la Frontera', zip: '14920', baremo: 1 }, { name: 'Córdoba', zip: '14014', baremo: 1 }]}
            onClose={() => {}}
            isAdmin
        />
    );
}

async function subirFotoYRevisar() {
    const input = document.getElementById('agencia-file-input');
    fireEvent.change(input, { target: { files: [new File(['foto'], 'albaran.jpg', { type: 'image/jpeg' })] } });
    await screen.findByText(/Leída: Silvia reina palma · Aguilar de la Frontera/);
    fireEvent.click(await screen.findByRole('button', { name: /Revisar 1 albarán/ }));
}

beforeEach(() => {
    leerHojaConIA.mockReset();
    leerListadoConIA.mockReset();
    onCreateShipment.mockReset();
    leerHojaConIA.mockResolvedValue({ campos: { ...lecturaReal }, coste: 0.0003 });
    onCreateShipment.mockResolvedValue(undefined);
});

describe('ImportarAlbaranesAgencia', () => {
    it('la población leída se cuadra con el CP y se avisa del cambio en la revisión', async () => {
        abrirImportacion();
        await subirFotoYRevisar();

        expect(screen.getByDisplayValue('Aguilar de la Frontera')).toBeInTheDocument();
        expect(screen.queryByDisplayValue('CORDOBA')).not.toBeInTheDocument();
        expect(screen.getByText('Población cambiada por el CP 14920: se leyó «CORDOBA» y se ha puesto Aguilar de la Frontera')).toBeInTheDocument();
        // Aguilar está en las zonas de cobertura: no es "fuera del baremo".
        expect(screen.queryByText(/fuera del baremo/)).not.toBeInTheDocument();
    });

    it('no pregunta el porte: es de la agencia y el envío nace Pagado', async () => {
        abrirImportacion();
        await subirFotoYRevisar();

        expect(screen.queryByText(/Elige si el porte/)).not.toBeInTheDocument();
        expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
        expect(screen.getByText('Pagado (lo paga la agencia)')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Crear 1 envíos/ }));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        const envio = onCreateShipment.mock.calls[0][0];
        expect(envio).toMatchObject({
            // La serie sale del tipo de cobro de la ficha (Clientes Habituales → HAB).
            id: 'HAB-700',
            client: 'TXT',
            originName: 'S.VDA.E.FAJEDA-FAIBO, S.L.',
            destinationName: 'Silvia reina palma',
            destinationCity: 'Aguilar de la Frontera',
            destinationZip: '14920',
            destination: '14920 Aguilar de la Frontera, ES',
            porteType: 'Pagado',
            clientReference: '2600503090',
            weightKg: 15,
        });
    });

    it('si el nombre leído ya es el del CP no se toca ni se avisa', async () => {
        leerHojaConIA.mockResolvedValue({ campos: { ...lecturaReal, poblacion: 'AGUILAR DE LA FRONTERA' }, coste: 0 });
        abrirImportacion();
        const input = document.getElementById('agencia-file-input');
        fireEvent.change(input, { target: { files: [new File(['foto'], 'albaran.jpg', { type: 'image/jpeg' })] } });
        await screen.findByText(/Leída: Silvia reina palma · AGUILAR DE LA FRONTERA/);
        fireEvent.click(await screen.findByRole('button', { name: /Revisar 1 albarán/ }));

        expect(screen.getByDisplayValue('AGUILAR DE LA FRONTERA')).toBeInTheDocument();
        expect(screen.queryByText(/Población cambiada/)).not.toBeInTheDocument();
    });

    // 30/09/2026: la IA leyó «S» de destinatario y la oficina quería poner una
    // ficha que ya existe; la casilla era texto suelto y no buscaba nada.
    it('el destinatario busca en las fichas y al elegir una rellena sus datos', async () => {
        const fichas = [
            { id: 'c1', name: 'TALLERES CARCABUEY S.L.', address: 'Ctra A-339 km 17', city: 'Carcabuey', zip: '14810', phone: '957000111', coordinates: '37.44,-4.27' },
            { id: 'c2', name: 'OTRO CLIENTE', address: 'x', city: 'Cabra', zip: '14940' },
            { id: 'c3', name: 'TALLERES PENDIENTE', status: 'pending' },
        ];
        abrirImportacion({ clients: fichas });
        await subirFotoYRevisar();

        const destinatario = screen.getByRole('textbox', { name: 'Destinatario' });
        fireEvent.focus(destinatario);
        fireEvent.change(destinatario, { target: { value: 'tallere' } });
        expect(screen.queryByText('OTRO CLIENTE')).not.toBeInTheDocument();
        expect(screen.queryByText('TALLERES PENDIENTE')).not.toBeInTheDocument();
        fireEvent.mouseDown(screen.getByText('TALLERES CARCABUEY S.L.'));

        expect(screen.getByDisplayValue('TALLERES CARCABUEY S.L.')).toBeInTheDocument();
        expect(screen.getByDisplayValue('Carcabuey')).toBeInTheDocument();
        expect(screen.queryByText(/Población cambiada/)).not.toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: /Crear 1 envíos/ }));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(1));
        expect(onCreateShipment.mock.calls[0][0]).toMatchObject({
            destinationName: 'TALLERES CARCABUEY S.L.',
            destinationAddress: 'Ctra A-339 km 17',
            destinationCity: 'Carcabuey',
            destinationZip: '14810',
            destinationPhone: '957000111',
            destinationCoordinates: '37.44,-4.27',
            // El remitente y quien paga no cambian.
            originName: 'S.VDA.E.FAJEDA-FAIBO, S.L.',
            client: 'TXT',
        });
    });
});

// ── Listado de SAN RAFAEL (29/09/2026): una hoja con una línea por expedición ──
describe('ImportarAlbaranesAgencia en modo listado', () => {
    const sanRafael = { id: 'sr', name: 'ALMACENES DE FERRETERIA SAN RAFAEL', address: 'Avda. Apreama, parcela 12', zip: '14013', city: 'Córdoba', billingType: 'Clientes Habituales' };
    const lineas = [
        { expedicion: '187824', remitente: '', destinatario: 'AGRO SERVICIO JESUS TORO S.L.', direccion: 'POLG.LOS BERMEJALES.PARC.10', poblacion: 'ALMEDINILLA', cp: '14812', telefono: '679995451', bultos: 1, kilos: 51, reembolso: 0, devolverFirmado: false },
        { expedicion: '187828', remitente: '', destinatario: 'FERRETERIA LA CADENA S.L.', direccion: 'Calle FUENTE EL ALAMO, Nº 33', poblacion: 'MONTILLA', cp: '14550', telefono: '637852762', bultos: 3, kilos: 40, reembolso: 0, devolverFirmado: false },
    ];

    function abrir(allShipments = []) {
        return render(
            <ImportarAlbaranesAgencia client={sanRafael} onCreateShipment={onCreateShipment} allShipments={allShipments}
                articles={[...articulos, { id: 'a3', name: 'BLT_3', category: 'BADI', price: 9 }]} tariffs={[]}
                coverageZones={[{ name: 'Almedinilla', zip: '14812', baremo: 1 }, { name: 'Montilla', zip: '14550', baremo: 1 }]}
                onClose={() => {}} isAdmin />
        );
    }

    async function subirListado() {
        fireEvent.click(screen.getByRole('button', { name: /Un listado/ }));
        fireEvent.change(document.getElementById('agencia-file-input'), { target: { files: [new File(['foto'], 'listado.jpg', { type: 'image/jpeg' })] } });
        fireEvent.click(await screen.findByRole('button', { name: /Revisar 2 albaranes/ }));
    }

    it('cada línea es un envío, con el cliente como remitente y pagador', async () => {
        leerListadoConIA.mockResolvedValue({ lineas, coste: 0.001 });
        abrir();
        await subirListado();

        expect(leerHojaConIA).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: /Crear 2 envíos/ }));
        await waitFor(() => expect(onCreateShipment).toHaveBeenCalledTimes(2));
        const [a, b] = onCreateShipment.mock.calls.map(c => c[0]);
        expect(a).toMatchObject({ id: 'HAB-700', client: sanRafael.name, originName: sanRafael.name, destinationName: 'AGRO SERVICIO JESUS TORO S.L.', destinationCity: 'ALMEDINILLA', clientReference: '187824', packages: 1, weightKg: 51, porteType: 'Pagado' });
        expect(b).toMatchObject({ id: 'HAB-701', originName: sanRafael.name, destinationName: 'FERRETERIA LA CADENA S.L.', destinationCity: 'MONTILLA', clientReference: '187828', packages: 3 });
    });

    it('avisa si una expedición del listado ya se importó', async () => {
        leerListadoConIA.mockResolvedValue({ lineas, coste: 0 });
        abrir([{ id: 'HAB-650', clientId: 'sr', clientReference: '187824' }]);
        await subirListado();
        expect(screen.getByText('Expedición 187824 ya importada en HAB-650')).toBeInTheDocument();
    });

    it('si la ficha dice que sus fotos son listados, abre ya en modo listado', async () => {
        leerListadoConIA.mockResolvedValue({ lineas, coste: 0 });
        render(
            <ImportarAlbaranesAgencia client={{ ...sanRafael, fotosComoListado: true }} onCreateShipment={onCreateShipment} allShipments={[]}
                articles={articulos} tariffs={[]} coverageZones={[]} onClose={() => {}} isAdmin />
        );
        fireEvent.change(document.getElementById('agencia-file-input'), { target: { files: [new File(['foto'], 'listado.jpg', { type: 'image/jpeg' })] } });
        expect(await screen.findByRole('button', { name: /Revisar 2 albaranes/ })).toBeInTheDocument();
        expect(leerHojaConIA).not.toHaveBeenCalled();
    });

    it('si la IA no puede leer el listado no se cae al lector gratuito', async () => {
        leerListadoConIA.mockRejectedValue(new Error('caído'));
        abrir();
        fireEvent.click(screen.getByRole('button', { name: /Un listado/ }));
        fireEvent.change(document.getElementById('agencia-file-input'), { target: { files: [new File(['foto'], 'listado.jpg', { type: 'image/jpeg' })] } });
        expect(await screen.findByText(/La IA no pudo leer el listado .caído./)).toBeInTheDocument();
    });
});
