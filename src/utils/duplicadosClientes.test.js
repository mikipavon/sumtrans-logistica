import { describe, it, expect } from 'vitest';
import { buscarFichasParecidas, explicarMotivos, buscarSolicitudesGemelas, loQueAportanLasGemelas, explicarAportacion } from './duplicadosClientes';

const CARTERA = {
    id: 10,
    name: 'Activa La Mejor Compra, S.L.',
    cif: 'B-14.123.456',
    email: 'administracion@activa.com',
    // La señal de "esta ficha entra en el portal" ya no es tener contraseña
    // guardada, sino esta marca. Ver utils/clientAccess.js y la fase 16.
    tieneAccesoPortal: true,
};
const SIN_ACCESO = { id: 11, name: 'Ferretería Luna', cif: 'B99887766', email: 'luna@ferreteria.com' };
const CLIENTES = [CARTERA, SIN_ACCESO];

const pendiente = (extra) => ({ id: 900, status: 'pending', createdFrom: 'web-registro', ...extra });

describe('buscarFichasParecidas', () => {
    it('reconoce el CIF aunque venga con puntos y guiones', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'ACTIVA', cif: 'b14123456' }), CLIENTES);
        expect(r).toHaveLength(1);
        expect(r[0].client.id).toBe(10);
        expect(r[0].motivos).toContain('el mismo CIF');
    });

    it('reconoce el correo aunque el CIF no coincida', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'Otro Nombre', cif: 'B00000000', email: 'administracion@activa.com' }), CLIENTES);
        expect(r).toHaveLength(1);
        expect(r[0].motivos).toEqual(['el mismo correo']);
    });

    it('cruza también el correo de acceso, no sólo el de la ficha', () => {
        const conAcceso = [{ ...CARTERA, accessEmail: 'pedidos@activa.com' }];
        const r = buscarFichasParecidas(pendiente({ name: 'X', email: 'pedidos@activa.com' }), conAcceso);
        expect(r[0].motivos).toEqual(['el mismo correo']);
    });

    it('reconoce el nombre con acentos, mayúsculas y puntuación distintas', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'FERRETERIA LUNA' }), CLIENTES);
        expect(r[0].client.id).toBe(11);
        expect(r[0].motivos).toEqual(['el mismo nombre']);
    });

    it('acumula motivos y pone delante la coincidencia más fuerte', () => {
        const r = buscarFichasParecidas(
            pendiente({ name: 'Activa La Mejor Compra SL', cif: 'B14123456', email: 'administracion@activa.com' }),
            CLIENTES
        );
        expect(r[0].motivos).toEqual(['el mismo CIF', 'el mismo correo', 'el mismo nombre']);
    });

    it('avisa de si la ficha de cartera ya entra en el portal', () => {
        const conAcceso = buscarFichasParecidas(pendiente({ cif: 'B14123456' }), CLIENTES);
        expect(conAcceso[0].yaTieneAcceso).toBe(true);
        const sinAcceso = buscarFichasParecidas(pendiente({ cif: 'B99887766' }), CLIENTES);
        expect(sinAcceso[0].yaTieneAcceso).toBe(false);
    });

    it('no cuenta como duplicado otra solicitud pendiente ni las fichas de prueba', () => {
        const otros = [
            { id: 901, status: 'pending', name: 'Activa La Mejor Compra, S.L.', cif: 'B14123456' },
            { id: 902, isTest: true, name: 'Activa La Mejor Compra, S.L.', cif: 'B14123456' },
        ];
        expect(buscarFichasParecidas(pendiente({ cif: 'B14123456' }), otros)).toEqual([]);
    });

    it('no se señala a sí misma', () => {
        const yaEnLista = [{ id: 900, name: 'ACTIVA', cif: 'B14123456' }];
        expect(buscarFichasParecidas(pendiente({ id: 900, name: 'ACTIVA', cif: 'B14123456' }), yaEnLista)).toEqual([]);
    });

    it('respeta la pista del registro web aunque ya no coincida nada', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'Nombre Nuevo', possibleDuplicateOf: 10 }), CLIENTES);
        expect(r[0].client.id).toBe(10);
        expect(r[0].motivos).toEqual(['el aviso del registro web']);
    });

    it('no inventa coincidencias con fichas vacías', () => {
        expect(buscarFichasParecidas(pendiente({ name: '', cif: '', email: '' }), [{ id: 5, name: '', cif: '', email: '' }])).toEqual([]);
        expect(buscarFichasParecidas(null, CLIENTES)).toEqual([]);
    });
});

describe('explicarMotivos', () => {
    it('encadena los motivos en castellano', () => {
        expect(explicarMotivos(['el mismo CIF'])).toBe('el mismo CIF');
        expect(explicarMotivos(['el mismo CIF', 'el mismo correo'])).toBe('el mismo CIF y el mismo correo');
        expect(explicarMotivos(['el mismo CIF', 'el mismo correo', 'el mismo nombre']))
            .toBe('el mismo CIF, el mismo correo y el mismo nombre');
        expect(explicarMotivos([])).toBe('');
    });
});

describe('buscarSolicitudesGemelas', () => {
    // El caso real de la pantalla: el modal del albarán creó la ficha sin GPS y
    // handleAddShipment la volvió a crear con él. Dos tarjetas, ninguna entera.
    const pendientes = [
        { id: 1, name: 'BasicRoca', city: 'Cordoba', status: 'pending', createdFrom: 'Albarán Automático', createdBy: 'Conductor' },
        { id: 2, name: 'BasicRoca', city: 'Cordoba', address: ', 14000 Cordoba', coordinates: '37.547904, -4.663849', status: 'pending', createdFrom: 'Albarán', createdBy: 'Cond.FRANCISCO JAVIER PAVON MAIZ' },
        { id: 3, name: 'Rafa Martínez', status: 'pending' },
        { id: 4, name: 'Rafa Martinez', phone: '957000000', status: 'pending' },
        { id: 5, name: 'Zuricar', status: 'pending' },
    ];

    it('junta las dos altas de la misma empresa', () => {
        const gemelas = buscarSolicitudesGemelas(pendientes[0], pendientes);
        expect(gemelas.map(g => g.id)).toEqual([2]);
    });

    it('las reconoce aunque una lleve acento y la otra no', () => {
        const gemelas = buscarSolicitudesGemelas(pendientes[2], pendientes);
        expect(gemelas.map(g => g.id)).toEqual([4]);
    });

    it('no empareja a una solicitud sin pareja, ni consigo misma', () => {
        expect(buscarSolicitudesGemelas(pendientes[4], pendientes)).toEqual([]);
    });

    it('empareja por CIF y por correo cuando el nombre está escrito distinto', () => {
        const lista = [
            { id: 10, name: 'Transportes Espejo', cif: 'B-12345678' },
            { id: 11, name: 'TTES ESPEJO SL', cif: 'B12345678' },
            { id: 12, name: 'Otra cosa', email: 'jefe@espejo.es' },
            { id: 13, name: 'Y otra más', email: 'JEFE@ESPEJO.ES' },
        ];
        expect(buscarSolicitudesGemelas(lista[0], lista).map(g => g.id)).toEqual([11]);
        expect(buscarSolicitudesGemelas(lista[2], lista).map(g => g.id)).toEqual([13]);
    });
});

describe('loQueAportanLasGemelas', () => {
    it('dice qué le falta a la que se queda y traen las otras', () => {
        const principal = { id: 1, name: 'BasicRoca', city: 'Cordoba' };
        const gemelas = [{ id: 2, name: 'BasicRoca', address: ', 14000 Cordoba', coordinates: '37.5, -4.6', city: 'OTRA' }];
        const aportado = loQueAportanLasGemelas(principal, gemelas);
        expect(aportado).toEqual({ address: ', 14000 Cordoba', coordinates: '37.5, -4.6' });
        // La población de la principal no se toca: es la que está mirando quien valida.
        expect(aportado.city).toBeUndefined();
    });

    it('con la primera gemela que traiga el dato basta', () => {
        const aportado = loQueAportanLasGemelas({ id: 1 }, [{ phone: '957111111' }, { phone: '957222222' }]);
        expect(aportado.phone).toBe('957111111');
    });

    it('lo cuenta en castellano', () => {
        expect(explicarAportacion({ coordinates: 'x', phone: 'y' })).toBe('las coordenadas y el teléfono');
        expect(explicarAportacion({})).toBe('');
    });
});
