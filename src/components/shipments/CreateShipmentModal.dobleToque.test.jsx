// ── Dos toques en «Generar Albarán» sólo guardan un albarán ──
//
// 15/09/2026: el repartidor hizo una recogida y salieron SUM-1314 y SUM-1315,
// gemelos. Entre el toque y el guardado pasan la subida de la foto y la reserva
// del número en el servidor; el botón seguía vivo en ese rato y un segundo
// toque arrancaba otro guardado entero, con OTRO número reservado. Lo mismo con
// «Cobrado» en el aviso de cobro.

import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// El número lo reserva el servidor; aquí se sustituye la llamada.
const { reservar } = vi.hoisted(() => ({ reservar: vi.fn() }));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: (...args) => reservar(...args) }));

// Import dinámico tras vaciar el registro, igual que en CreatePickupModal.test.jsx:
// los ficheros comparten entorno Y registro de módulos (ver vitest.config.js).
let CreateShipmentModal;
beforeAll(async () => {
    vi.resetModules();
    CreateShipmentModal = (await import('./CreateShipmentModal')).default;
});

beforeEach(() => {
    reservar.mockReset();
    try { localStorage.clear(); } catch (_) {}
    vi.spyOn(window, 'alert').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); });

function abrirAlta({ onSave }) {
    return render(
        <CreateShipmentModal
            isOpen
            onClose={vi.fn()}
            onSave={onSave}
            clients={[]}
            allPoblaciones={[]}
            tariffs={[]}
            articles={[]}
            defaultCodFee={0}
            familyOrder={[]}
            coverageZones={[]}
            allShipments={[]}
        />
    );
}

const marcarPorte = (tipo) => fireEvent.click(document.querySelector(`input[name="porteType"][value="${tipo}"]`));
const escribirObservacion = () => fireEvent.change(screen.getByPlaceholderText('Instrucciones adicionales...'), { target: { value: '2 bultos' } });
const botonGuardar = () => screen.getByRole('button', { name: /Generar Albarán|Guardando/ });
// El formulario lleva campos obligatorios (cliente, dirección...) que jsdom
// comprueba antes de dejar pulsar el botón; se manda el submit directamente,
// como hace CreatePickupModal.test.jsx. El freno vive en el manejador, así que
// es exactamente lo que hay que probar.
const enviar = () => fireEvent.submit(botonGuardar().closest('form'));

describe('CreateShipmentModal — doble pulsación al guardar', () => {
    it('dos toques seguidos en «Generar Albarán» guardan un solo albarán y reservan un solo número', async () => {
        // La reserva del número tarda: es el rato en el que cabe el segundo toque.
        let soltar;
        reservar.mockImplementation(() => new Promise(res => { soltar = () => res({ primero: 1314, reservado: true }); }));
        const onSave = vi.fn().mockResolvedValue(true);
        abrirAlta({ onSave });
        // Porte Debido: no salta el aviso de cobro y el formulario va directo a guardar.
        marcarPorte('Debido');
        escribirObservacion();

        enviar();
        enviar();

        await waitFor(() => expect(reservar).toHaveBeenCalledTimes(1));
        expect(botonGuardar()).toBeDisabled();

        await act(async () => { soltar(); });

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        expect(onSave.mock.calls[0][0].id).toBe('HAB-1314');
        expect(reservar).toHaveBeenCalledTimes(1);

        // Guardado: el botón vuelve a estar vivo para el siguiente albarán.
        await waitFor(() => expect(botonGuardar()).not.toBeDisabled());
    });

    it('dos toques en «Cobrado» del aviso de cobro también guardan uno solo', async () => {
        reservar.mockResolvedValue({ primero: 1315, reservado: true });
        const onSave = vi.fn(() => new Promise(res => setTimeout(() => res(true), 40)));
        abrirAlta({ onSave });
        // Porte Pagado por un cliente sin ficha: salta el aviso de cobro.
        marcarPorte('Pagado');
        escribirObservacion();

        enviar();
        const cobrado = await screen.findByRole('button', { name: /Cobrado/ });

        fireEvent.click(cobrado);
        fireEvent.click(cobrado);

        await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
        await new Promise(r => setTimeout(r, 80));
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(reservar).toHaveBeenCalledTimes(1);
    });
});
