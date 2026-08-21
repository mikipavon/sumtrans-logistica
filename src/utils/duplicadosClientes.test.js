import { describe, it, expect } from 'vitest';
import { buscarFichasParecidas, explicarMotivos } from './duplicadosClientes';

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
