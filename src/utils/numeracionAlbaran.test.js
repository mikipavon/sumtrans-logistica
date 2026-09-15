import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';

const rpc = vi.fn();
const insert = vi.fn(); // recibe las filas; devuelve { data, error } como PostgREST
const leer = vi.fn();   // la fila que ya hay con ese id: { data, error } de maybeSingle
vi.mock('../lib/supabase', () => ({
    supabase: {
        rpc: (...args) => rpc(...args),
        from: () => ({
            insert: (filas) => ({ select: () => insert(filas) }),
            select: () => ({ eq: (columna, valor) => ({ maybeSingle: () => leer(columna, valor) }) })
        })
    }
}));

// Import dinámico tras vaciar el registro: los ficheros de test comparten
// entorno (ver vitest.config.js) y CreateShipmentModal.test.jsx, que va antes,
// ya ha cargado este módulo con el supabase de verdad. Con el import estático
// el mock de arriba no llegaba y los tests tiraban contra la base de datos.
let maximoDeLaSerie, reservarNumerosAlbaran, darDeAltaSinPisar, CODIGO_ID_REPETIDO;
beforeAll(async () => {
    vi.resetModules();
    ({ maximoDeLaSerie, reservarNumerosAlbaran, darDeAltaSinPisar, CODIGO_ID_REPETIDO } = await import('./numeracionAlbaran'));
});

beforeEach(() => {
    rpc.mockReset();
    insert.mockReset();
    leer.mockReset();
    leer.mockResolvedValue({ data: null, error: null });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('maximoDeLaSerie', () => {
    const envios = [
        { id: 'SUM-1200' },
        { id: 'SUM-1198' },
        { id: 'HAB-4500' },
        { id: 'PU-77' }
    ];

    it('no mezcla series: HAB no sube el máximo de SUM', () => {
        expect(maximoDeLaSerie(envios, 'SUM')).toBe(1200);
        expect(maximoDeLaSerie(envios, 'HAB')).toBe(4500);
    });

    it('ignora los ids con año incrustado, que no son de la serie correlativa', () => {
        expect(maximoDeLaSerie([...envios, { id: 'SUM-2026254' }], 'SUM')).toBe(1200);
    });

    it('devuelve 0 cuando la serie aún no tiene envíos', () => {
        expect(maximoDeLaSerie(envios, 'XXX')).toBe(0);
        expect(maximoDeLaSerie([], 'SUM')).toBe(0);
        expect(maximoDeLaSerie(null, 'SUM')).toBe(0);
    });
});

describe('reservarNumerosAlbaran', () => {
    it('usa el número del servidor aunque el cliente sólo vea envíos suyos', async () => {
        // El caso que motiva todo esto: el portal tiene cargados sus SUM-1200,
        // pero la serie real va por 1450. Localmente habría emitido 1201.
        rpc.mockResolvedValue({ data: 1451, error: null });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-1200' }]
        });

        expect(primero).toBe(1451);
        expect(reservado).toBe(true);
        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { p_prefijo: 'SUM', p_cantidad: 1 });
    });

    it('pide de golpe todos los números de una importación', async () => {
        rpc.mockResolvedValue({ data: 300, error: null });

        const { primero } = await reservarNumerosAlbaran('HAB', 40, { enviosLocales: [] });

        expect(primero).toBe(300);
        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { p_prefijo: 'HAB', p_cantidad: 40 });
    });

    it('si el servidor falla, numera con lo local en vez de dejar al cliente sin crear', async () => {
        rpc.mockResolvedValue({ data: null, error: { message: 'function does not exist', code: '42883' } });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-1200' }, { id: 'HAB-9999' }]
        });

        expect(primero).toBe(1201);
        expect(reservado).toBe(false);
    });

    it('aguanta que la llamada reviente (sin cobertura), no sólo que devuelva error', async () => {
        rpc.mockRejectedValue(new TypeError('Load failed'));

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-7' }]
        });

        expect(primero).toBe(8);
        expect(reservado).toBe(false);
    });

    it('no da por bueno un número imposible', async () => {
        rpc.mockResolvedValue({ data: 0, error: null });

        const { primero, reservado } = await reservarNumerosAlbaran('SUM', 1, {
            enviosLocales: [{ id: 'SUM-30' }]
        });

        expect(primero).toBe(31);
        expect(reservado).toBe(false);
    });

    it('normaliza la serie en minúsculas antes de pedirla', async () => {
        rpc.mockResolvedValue({ data: 5, error: null });

        await reservarNumerosAlbaran('sum', 1, { enviosLocales: [] });

        expect(rpc).toHaveBeenCalledWith('reservar_numeros_albaran', { p_prefijo: 'SUM', p_cantidad: 1 });
    });
});

describe('darDeAltaSinPisar', () => {
    const FILA = { id: 'SUM-518', status: 'Pendiente de asignar', assignedDriverId: null, data: { id: 'SUM-518', client: 'Hijos de Lastre' } };
    // Literal a propósito: este bloque se evalúa al recoger los tests, antes del beforeAll.
    const REPETIDO = { code: '23505', message: 'duplicate key value violates unique constraint "shipments_pkey"' };

    it('el código que se reconoce como número repetido es el 23505 de Postgres', () => {
        expect(CODIGO_ID_REPETIDO).toBe('23505');
    });

    it('si el número está libre entra a la primera y no toca el id', async () => {
        insert.mockResolvedValue({ data: [{ ...FILA }], error: null });

        const r = await darDeAltaSinPisar(FILA);

        expect(r.error).toBeNull();
        expect(r.id).toBe('SUM-518');
        expect(r.renumerado).toBe(false);
        expect(insert).toHaveBeenCalledTimes(1);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('si otro móvil ya ocupó el número, pide otro al servidor y guarda con ése sin pisar al primero', async () => {
        // El caso del 07/09/2026: SUM-518 ya era de otro repartidor.
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-556' }], error: null });
        rpc.mockResolvedValue({ data: 556, error: null });

        const r = await darDeAltaSinPisar(FILA, { enviosLocales: [{ id: 'SUM-518' }] });

        expect(r.error).toBeNull();
        expect(r.id).toBe('SUM-556');
        expect(r.renumerado).toBe(true);
        const segundaFila = insert.mock.calls[1][0][0];
        expect(segundaFila.id).toBe('SUM-556');
        expect(segundaFila.data.id).toBe('SUM-556'); // el JSON interno también
        expect(segundaFila.data.client).toBe('Hijos de Lastre');
    });

    it('sin servidor que reserve, avanza al menos un número por intento', async () => {
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-520' }], error: null });
        rpc.mockRejectedValue(new TypeError('Load failed'));

        const r = await darDeAltaSinPisar(FILA, { enviosLocales: [{ id: 'SUM-500' }] });

        expect(r.id).toBe('SUM-520');
        expect(insert.mock.calls.map(c => c[0][0].id)).toEqual(['SUM-518', 'SUM-519', 'SUM-520']);
    });

    it('un error que no sea de número repetido se devuelve tal cual, sin reintentar', async () => {
        const rls = { code: '42501', message: 'new row violates row-level security policy' };
        insert.mockResolvedValue({ data: null, error: rls });

        const r = await darDeAltaSinPisar(FILA);

        expect(r.error).toBe(rls);
        expect(r.id).toBe('SUM-518');
        expect(insert).toHaveBeenCalledTimes(1);
    });

    it('se rinde tras agotar los intentos y devuelve el último error', async () => {
        insert.mockResolvedValue({ data: null, error: REPETIDO });
        rpc.mockResolvedValue({ data: 600, error: null });

        const r = await darDeAltaSinPisar(FILA, { intentos: 2 });

        expect(r.error).toBe(REPETIDO);
        expect(r.data).toBeNull();
        expect(insert).toHaveBeenCalledTimes(2);
    });

    // ── La fila que choca es la suya ──
    //
    // 15/09/2026: una recogida hecha por el repartidor salió como SUM-1314 y
    // SUM-1315, gemelos. Cuando el alta llega a la base de datos pero la
    // respuesta se pierde por el camino, la app la da por fallida y la encola;
    // al sincronizar, el insert choca con la fila que ya había (la suya) y
    // hasta ahora se pedía otro número y se grababa el gemelo.
    const MIA = { ...FILA, data: { ...FILA.data, createdAt: '2026-09-15T09:12:33.418Z', createdById: 7 } };

    it('si la fila que ya hay es esta misma (mismo alta, mismo creador), la da por guardada sin pedir otro número', async () => {
        insert.mockResolvedValue({ data: null, error: REPETIDO });
        leer.mockResolvedValue({ data: { id: 'SUM-518', status: 'Pendiente de asignar', data: { ...MIA.data } }, error: null });

        const r = await darDeAltaSinPisar(MIA);

        expect(r.error).toBeNull();
        expect(r.id).toBe('SUM-518');
        expect(r.renumerado).toBe(false);
        expect(r.yaEstaba).toBe(true);
        expect(r.data[0].data.client).toBe('Hijos de Lastre');
        expect(insert).toHaveBeenCalledTimes(1);
        expect(rpc).not.toHaveBeenCalled();
        expect(leer).toHaveBeenCalledWith('id', 'SUM-518');
    });

    it('si la fila que hay es de otro alta (otro createdAt), sigue pidiendo otro número', async () => {
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-556' }], error: null });
        leer.mockResolvedValue({ data: { id: 'SUM-518', data: { ...MIA.data, createdAt: '2026-09-15T09:12:34.000Z' } }, error: null });
        rpc.mockResolvedValue({ data: 556, error: null });

        const r = await darDeAltaSinPisar(MIA);

        expect(r.id).toBe('SUM-556');
        expect(r.renumerado).toBe(true);
        expect(r.yaEstaba).toBeUndefined();
    });

    it('mismo createdAt pero otro creador tampoco vale: se renumera', async () => {
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-556' }], error: null });
        leer.mockResolvedValue({ data: { id: 'SUM-518', data: { ...MIA.data, createdById: 9 } }, error: null });
        rpc.mockResolvedValue({ data: 556, error: null });

        const r = await darDeAltaSinPisar(MIA);

        expect(r.id).toBe('SUM-556');
        expect(r.renumerado).toBe(true);
    });

    it('sin createdAt no hay forma de reconocerla: ni se consulta, se renumera como siempre', async () => {
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-556' }], error: null });
        rpc.mockResolvedValue({ data: 556, error: null });

        const r = await darDeAltaSinPisar(FILA);

        expect(r.id).toBe('SUM-556');
        expect(leer).not.toHaveBeenCalled();
    });

    it('si no puede leer la fila (sin permiso o sin red), no se fía y renumera', async () => {
        insert
            .mockResolvedValueOnce({ data: null, error: REPETIDO })
            .mockResolvedValueOnce({ data: [{ id: 'SUM-556' }], error: null });
        leer.mockRejectedValue(new TypeError('Load failed'));
        rpc.mockResolvedValue({ data: 556, error: null });

        const r = await darDeAltaSinPisar(MIA);

        expect(r.error).toBeNull();
        expect(r.id).toBe('SUM-556');
        expect(r.renumerado).toBe(true);
    });
});
