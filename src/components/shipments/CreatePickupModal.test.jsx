// ── El CP de la recogida se rellena solo al elegir la población ──
//
// El alta de albaranes busca el código postal al elegir la población (primero
// en el listado de Baremos, luego en la lista fija). Al formulario de recogida
// nunca se le copió: elegir del desplegable dejaba el CP vacío y había que
// teclearlo a mano. Estas pruebas fijan el mismo comportamiento en los dos.

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';

// El número lo reserva el servidor; aquí se sustituye la llamada.
const { reservar } = vi.hoisted(() => ({ reservar: vi.fn() }));
vi.mock('../../utils/numeracionAlbaran', () => ({ reservarNumerosAlbaran: (...args) => reservar(...args) }));

// Import dinámico tras vaciar el registro, igual que en numeracionAlbaran.test.js:
// los ficheros comparten entorno Y registro de módulos (ver vitest.config.js).
// Con el import estático, el componente se quedaba con la copia de
// numeracionAlbaran que hubiera cargado otro fichero antes, sin el mock de
// arriba: la recogida se numeraba con la implementación de verdad (REC-1 en vez
// de REC-424) y estos tests pasaban o fallaban según en qué orden le tocara
// ejecutar los ficheros a vitest, que lo decide con lo que tardaron la vez
// anterior.
let CreatePickupModal;
beforeAll(async () => {
    vi.resetModules();
    CreatePickupModal = (await import('./CreatePickupModal')).default;
});

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

// ── La recogida no captura el GPS de origen ──
//
// El modal capturaba la posición del navegador al abrirse para todo el mundo.
// Desde la oficina eso ponía las coordenadas de la oficina a la recogida y, de
// ahí, a la ficha del cliente nuevo (o al hueco de uno existente sin GPS). El
// botón que lo avisaba está oculto, así que nadie lo veía.

describe('CreatePickupModal — captura de GPS al abrir', () => {
    let getCurrentPosition;
    let geolocationOriginal;

    beforeEach(() => {
        getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 37.586, longitude: -4.638 } }));
        // Se toca SÓLO navigator.geolocation. Sustituir el navigator entero dejaba
        // fuera userAgent (vive en el prototipo, así que el spread no se lo lleva)
        // y no se deshacía al acabar: como los ficheros comparten entorno (ver
        // vitest.config.js), el siguiente que cargara leaflet —que lee userAgent
        // nada más importarse— reventaba entero.
        geolocationOriginal = Object.getOwnPropertyDescriptor(navigator, 'geolocation');
        Object.defineProperty(navigator, 'geolocation', { value: { getCurrentPosition }, configurable: true });
        reservar.mockReset();
        reservar.mockResolvedValue({ primero: 425, reservado: true });
    });

    afterEach(() => {
        if (geolocationOriginal) Object.defineProperty(navigator, 'geolocation', geolocationOriginal);
        else delete navigator.geolocation;
    });

    it('la oficina no captura el GPS: la recogida sale sin coordenadas de origen', async () => {
        const onSave = vi.fn().mockResolvedValue(true);
        abrirConGuardado({ onSave, isDriver: false });

        expect(getCurrentPosition).not.toHaveBeenCalled();

        rellenarYEnviar();
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].originCoordinates).toBe('');
    });

    // El repartidor tampoco: apunta la recogida desde donde esté. La ubicación
    // del remitente se coge al llegar y hacer el albarán.
    it('el conductor tampoco lo captura: la ubicación se coge al hacer el albarán', async () => {
        const onSave = vi.fn().mockResolvedValue(true);
        abrirConGuardado({ onSave, isDriver: true });

        expect(getCurrentPosition).not.toHaveBeenCalled();

        rellenarYEnviar();
        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].originCoordinates).toBe('');
    });
});

// ── Teléfono del remitente ──
//
// La recogida no tenía hueco para el teléfono: la oficina lo metía en
// Observaciones y el botón de llamar del repartidor (que lee originPhone) se
// quedaba sin número. Ahora hay campo propio, se guarda en originPhone y al
// elegir una ficha se rellena con su móvil (o su fijo si no tiene móvil).

describe('CreatePickupModal — teléfono del remitente', () => {
    beforeEach(() => {
        reservar.mockReset();
        reservar.mockResolvedValue({ primero: 500, reservado: true });
    });

    const campoTelefono = () => screen.getByPlaceholderText('Teléfono de contacto...');

    it('el teléfono tecleado se guarda en originPhone, sin espacios por los lados', async () => {
        const onSave = vi.fn().mockResolvedValue(true);
        abrirConGuardado({ onSave });

        fireEvent.change(campoTelefono(), { target: { value: ' 619389746 ' } });
        rellenarYEnviar();

        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].originPhone).toBe('619389746');
    });

    it('sin teléfono la recogida sale con originPhone vacío, no undefined', async () => {
        const onSave = vi.fn().mockResolvedValue(true);
        abrirConGuardado({ onSave });

        rellenarYEnviar();

        await waitFor(() => expect(onSave).toHaveBeenCalled());
        expect(onSave.mock.calls[0][0].originPhone).toBe('');
    });

    it('al elegir una ficha se rellena con su móvil antes que con su fijo', () => {
        render(
            <CreatePickupModal
                isOpen
                onClose={vi.fn()}
                onSave={vi.fn()}
                clients={[{ id: 1, name: 'JOSE ROLDAN MERINO', city: 'Nueva Carteya', phone: '957000000', mobile: '619389746' }]}
                allPoblaciones={['Nueva Carteya']}
                allShipments={[]}
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'JOSE' } });
        fireEvent.click(screen.getByText('JOSE ROLDAN MERINO'));

        expect(campoTelefono().value).toBe('619389746');
    });

    it('al elegir una sede se lleva el teléfono de la sede, y si no tiene, el de la ficha madre', () => {
        render(
            <CreatePickupModal
                isOpen
                onClose={vi.fn()}
                onSave={vi.fn()}
                clients={[{
                    id: 7, name: 'AGROCOR', phone: '957111111',
                    branches: [
                        { id: 1, name: 'AGROCOR MONTILLA', city: 'Montilla', mobile: '600111222' },
                        { id: 2, name: 'AGROCOR TORRECILLA', city: 'Montilla' }
                    ]
                }]}
                allPoblaciones={['Montilla']}
                allShipments={[]}
            />
        );

        fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'AGROCOR' } });
        fireEvent.click(screen.getByText('AGROCOR MONTILLA'));
        expect(campoTelefono().value).toBe('600111222');

        fireEvent.change(screen.getByPlaceholderText('Buscar cliente...'), { target: { value: 'AGROCOR' } });
        fireEvent.click(screen.getByText('AGROCOR TORRECILLA'));
        expect(campoTelefono().value).toBe('957111111');
    });
});
