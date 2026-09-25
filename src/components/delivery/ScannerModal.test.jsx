// ── Un bulto se escanea una vez ──
//
// La cámara lee la pegatina en cada fotograma. El escáner sólo recordaba el
// último código y lo volvía a aceptar en cuanto lo perdía medio segundo, así
// que al repartidor le entraba el mismo bulto veinte veces seguidas, con su
// vibración y su subida a la nube cada vez. Aquí se comprueba que el segundo
// paso por la misma pegatina no llega al dashboard, que sale el aviso de
// repetido, y que el bulto nuevo suena.

import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// La cámara de verdad no arranca en jsdom: el doble guarda el callback que
// html5-qrcode llamaría con cada lectura, y las pruebas lo disparan a mano.
let leerCodigo = null;
const arrancar = vi.fn(async (_camara, _config, alLeer) => { leerCodigo = alLeer; });

vi.mock('html5-qrcode', () => {
    class Html5Qrcode {
        static getCameras() { return Promise.resolve([{ id: 'trasera', label: 'Trasera' }]); }
        start(...args) { return arrancar(...args); }
        stop() { return Promise.resolve(); }
    }
    return {
        Html5Qrcode,
        Html5QrcodeSupportedFormats: new Proxy({}, { get: (_, nombre) => nombre }),
    };
});

vi.mock('../../utils/pitidoEscaner', () => ({
    prepararPitido: vi.fn(),
    pitidoDeBulto: vi.fn(),
    pitidoDeRepetido: vi.fn(),
}));

// Los ficheros de test comparten el registro de módulos (isolate: false en
// vitest.config.js). Se vacía y se carga aquí a mano para que entren los dobles
// de arriba aunque otra prueba haya cargado antes el escáner de verdad.
let ScannerModal;
let pitidos;

beforeAll(async () => {
    vi.resetModules();
    ScannerModal = (await import('./ScannerModal')).default;
    pitidos = await import('../../utils/pitidoEscaner');
});

beforeEach(() => {
    leerCodigo = null;
    arrancar.mockClear();
    pitidos.pitidoDeBulto.mockClear();
    pitidos.pitidoDeRepetido.mockClear();
    try { localStorage.removeItem('drv_default_camera'); } catch { /* jsdom sin storage */ }
});

const abrirEscaner = async (onScan) => {
    render(<ScannerModal isOpen={true} onClose={() => {}} onScan={onScan} />);
    // El escáner arranca la cámara 400 ms después de abrirse.
    await waitFor(() => expect(leerCodigo).not.toBeNull(), { timeout: 2000 });
};

const escanear = async (codigo) => {
    await act(async () => { await leerCodigo(codigo); });
};

describe('ScannerModal', () => {
    it('la misma pegatina leída varias veces sólo llega una vez al dashboard', async () => {
        const onScan = vi.fn(async () => {});
        await abrirEscaner(onScan);

        await escanear('SUM-100-1');
        await escanear('SUM-100-1');
        await escanear('SUM-100-1');

        expect(onScan).toHaveBeenCalledTimes(1);
        expect(onScan).toHaveBeenCalledWith('SUM-100-1');
        expect(screen.getByText('Escaneados (1)')).toBeInTheDocument();
    });

    it('el repetido avisa con su texto y su tono grave, sin volver a sonar el de bulto nuevo', async () => {
        await abrirEscaner(vi.fn(async () => {}));

        await escanear('SUM-100-1');
        expect(pitidos.pitidoDeBulto).toHaveBeenCalledTimes(1);
        expect(pitidos.pitidoDeRepetido).not.toHaveBeenCalled();

        // El "¡Bulto registrado!" tapa el aviso durante dos segundos; aquí se
        // mira el estado por el tono, que es lo que oye el repartidor.
        await escanear('SUM-100-1');
        await escanear('SUM-100-1');
        expect(pitidos.pitidoDeBulto).toHaveBeenCalledTimes(1);
        // Con la cámara clavada en la pegatina el aviso no se repite en cada fotograma.
        expect(pitidos.pitidoDeRepetido).toHaveBeenCalledTimes(1);
    });

    it('el aviso de repetido se ve cuando ya no está el de registrado', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        try {
            await abrirEscaner(vi.fn(async () => {}));
            await escanear('SUM-100-1');
            expect(screen.getByText('¡Bulto Registrado!')).toBeInTheDocument();

            // Pasan los dos segundos del "registrado".
            await act(async () => { await vi.advanceTimersByTimeAsync(2100); });
            expect(screen.queryByText('¡Bulto Registrado!')).not.toBeInTheDocument();

            await escanear('SUM-100-1');
            expect(screen.getByText('Este bulto ya está escaneado')).toBeInTheDocument();
            expect(screen.queryByText('¡Bulto Registrado!')).not.toBeInTheDocument();
        } finally {
            vi.useRealTimers();
        }
    });

    it('otra pegatina distinta sí entra', async () => {
        const onScan = vi.fn(async () => {});
        await abrirEscaner(onScan);

        await escanear('SUM-100-1');
        await escanear('SUM-100-2');
        await escanear('SUM-100-1');

        expect(onScan).toHaveBeenCalledTimes(2);
        expect(onScan).toHaveBeenNthCalledWith(1, 'SUM-100-1');
        expect(onScan).toHaveBeenNthCalledWith(2, 'SUM-100-2');
        expect(pitidos.pitidoDeBulto).toHaveBeenCalledTimes(2);
        expect(screen.getByText('Escaneados (2)')).toBeInTheDocument();
    });

    it('si el dashboard no pudo registrarlo, se puede volver a escanear', async () => {
        const onScan = vi.fn()
            .mockRejectedValueOnce(new Error('sin red'))
            .mockResolvedValue(undefined);
        await abrirEscaner(onScan);

        await escanear('SUM-100-1');
        await escanear('SUM-100-1');

        expect(onScan).toHaveBeenCalledTimes(2);
    });
});
