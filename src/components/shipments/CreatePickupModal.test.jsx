// ── El CP de la recogida se rellena solo al elegir la población ──
//
// El alta de albaranes busca el código postal al elegir la población (primero
// en el listado de Baremos, luego en la lista fija). Al formulario de recogida
// nunca se le copió: elegir del desplegable dejaba el CP vacío y había que
// teclearlo a mano. Estas pruebas fijan el mismo comportamiento en los dos.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// El número lo reserva el servidor; aquí se sustituye la llamada.
const { reservar } = vi.hoisted(() => ({ reservar: vi.fn() }));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: (...args) => reservar(...args) }));
import CreatePickupModal from './CreatePickupModal';

function abrirRecogida({ coverageZones = [] } = {}) {
    return render(
        <CreatePickupModal
            isOpen
            onClose={vi.fn()}
            onSave={vi.fn()}
            clients={[]}
            allPoblaciones={['Montilla', 'Lucena', 'Aguilar de la Frontera']}
            allShipments={[]}
            coverageZones={coverageZones}
        />
    );
}

const campoPoblacion = () => screen.getByPlaceholderText('Población');
// La etiqueta "CP" no va enlazada al input: es el hermano que viene detrás.
const campoCP = () => screen.getByText('CP').nextElementSibling;

describe('CreatePickupModal — población y código postal', () => {
    it('rellena el CP al elegir la población del desplegable', () => {
        abrirRecogida();

        fireEvent.change(campoPoblacion(), { target: { value: 'Mont' } });
        fireEvent.click(screen.getByText('Montilla'));

        expect(campoPoblacion().value).toBe('Montilla');
        expect(campoCP().value).toBe('14550');
    });

    it('prefiere el CP del listado de Baremos al de la lista fija', () => {
        abrirRecogida({ coverageZones: [{ name: 'Montilla', zip: '14551' }] });

        fireEvent.change(campoPoblacion(), { target: { value: 'montilla' } });
        fireEvent.click(screen.getByText('Montilla'));

        expect(campoCP().value).toBe('14551');
    });

    // 14540 es de un solo pueblo en la lista fija. Los CP compartidos (14550 es
    // Montemayor y Montilla) rellenan el primero, igual que en el albarán.
    it('rellena la población al teclear un CP conocido', () => {
        abrirRecogida();

        fireEvent.change(campoCP(), { target: { value: '14540' } });

        expect(campoCP().value).toBe('14540');
        expect(campoPoblacion().value).toBe('La Rambla');
    });

    it('no toca el CP si la población no está en ninguna lista', () => {
        abrirRecogida();

        fireEvent.change(campoCP(), { target: { value: '99999' } });
        fireEvent.change(campoPoblacion(), { target: { value: 'Villarriba' } });

        expect(campoPoblacion().value).toBe('Villarriba');
        expect(campoCP().value).toBe('99999');
    });
});

// ── Numeración y guardado ──
//
// El número de la recogida se calculaba con la lista de este navegador: la
// oficina con el Modo Fantasma echado no veía las recogidas de clientes
// Habituales y dos pantallas a la vez sacaban el mismo REC-; el upsert pisaba la
// otra recogida sin avisar. Ahora lo reserva el servidor. Y el modal se cerraba
// sin esperar al guardado: una recogida que no llegaba a la base de datos
// parecía hecha (04/09/2026, Agrícola Castillero).

import { waitFor } from '@testing-library/react';

function rellenarYEnviar() {
    fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'AGRICOLA CASTILLERO' } });
    fireEvent.change(campoPoblacion(), { target: { value: 'Montilla' } });
    fireEvent.submit(screen.getByText('Crear Recogida').closest('form'));
}

function abrirConGuardado({ onSave, onClose = vi.fn(), isDriver = false, allShipments = [] } = {}) {
    render(
        <CreatePickupModal
            isOpen
            onClose={onClose}
            onSave={onSave}
            clients={[]}
            allPoblaciones={['Montilla']}
            allShipments={allShipments}
            isDriver={isDriver}
        />
    );
    return { onSave, onClose };
}

describe('CreatePickupModal — numeración y guardado', () => {
    beforeEach(() => {
        reservar.mockReset();
        reservar.mockResolvedValue({ primero: 424, reservado: true });
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    it('numera con el número que reserva el servidor, no con el máximo de la lista local', async () => {
        const { onSave, onClose } = abrirConGuardado({
            onSave: vi.fn().mockResolvedValue(true),
            allShipments: [{ id: 'REC-5' }, { id: 'SUM-9' }]
        });

        rellenarYEnviar();

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(reservar).toHaveBeenCalledWith('REC', 1, { enviosLocales: [{ id: 'REC-5' }, { id: 'SUM-9' }] });
        expect(onSave.mock.calls[0][0].id).toBe('REC-424');
        expect(onSave.mock.calls[0][0].type).toBe('Recogida');
    });

    it('si el guardado falla no se cierra, avisa y al reintentar reutiliza el mismo número', async () => {
        const onSave = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
        const { onClose } = abrirConGuardado({ onSave });

        rellenarYEnviar();

        const aviso = await screen.findByRole('alert');
        expect(aviso.textContent).toContain('REC-424');
        expect(aviso.textContent).toContain('NO se ha guardado');
        expect(onClose).not.toHaveBeenCalled();
        // Lo tecleado sigue ahí para no perderlo.
        expect(screen.getByPlaceholderText('Buscar cliente...').value).toBe('AGRICOLA CASTILLERO');

        fireEvent.click(screen.getByText('Volver a intentar'));

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(reservar).toHaveBeenCalledTimes(1);
        expect(onSave).toHaveBeenCalledTimes(2);
        expect(onSave.mock.calls[1][0].id).toBe('REC-424');
    });

    it('a la oficina le dice que la recogida se quedó en la cola y no está en la base de datos', async () => {
        const { onClose } = abrirConGuardado({ onSave: vi.fn().mockResolvedValue('encolado') });

        rellenarYEnviar();

        const aviso = await screen.findByRole('alert');
        expect(aviso.textContent).toContain('pendiente de sincronizar');
        expect(aviso.textContent).toContain('NO está en la base de datos');
        expect(onClose).not.toHaveBeenCalled();
        // Nada que reintentar: ya está en la cola. Sólo queda cerrar.
        expect(screen.queryByText('Volver a intentar')).toBeNull();
        expect(screen.getByText('Cerrar')).toBeTruthy();
    });

    it('al repartidor la cola offline no le corta el trabajo: la recogida se cierra como siempre', async () => {
        const { onClose } = abrirConGuardado({ onSave: vi.fn().mockResolvedValue('encolado'), isDriver: true });

        rellenarYEnviar();

        await waitFor(() => expect(onClose).toHaveBeenCalled());
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('si el guardado revienta (excepción) tampoco se cierra', async () => {
        const { onClose } = abrirConGuardado({ onSave: vi.fn().mockRejectedValue(new Error('sin red')) });

        rellenarYEnviar();

        const aviso = await screen.findByRole('alert');
        expect(aviso.textContent).toContain('sin red');
        expect(onClose).not.toHaveBeenCalled();
    });
});
