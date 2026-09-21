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

const { leerHojaConIA, onCreateShipment } = vi.hoisted(() => ({ leerHojaConIA: vi.fn(), onCreateShipment: vi.fn() }));

vi.mock('../../utils/iaAlbaran', () => ({
    leerHojaConIA: (...args) => leerHojaConIA(...args),
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

function abrirImportacion() {
    return render(
        <ImportarAlbaranesAgencia
            client={agencia}
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
});
