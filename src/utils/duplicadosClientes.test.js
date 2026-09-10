import { describe, it, expect } from 'vitest';
import { buscarFichasParecidas, explicarMotivos, buscarSolicitudesGemelas, buscarSolicitudesParecidas, nombresSeParecen, loQueAportanLasGemelas, explicarAportacion } from './duplicadosClientes';

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

describe('nombresSeParecen', () => {
    const seParecen = [
        ['Transportes Garcia', 'Transportes Garcia S.L.', 'la forma jurídica de más'],
        ['Cafe Central', 'CAFE CENTRAL S.L', 'la forma jurídica sin el punto final'],
        ['Distribuciones Sur', 'DISTRIBUCIONES SUR, S.L.U.', 'la forma jurídica con coma'],
        ['Muebles Lopez', 'Muebles Lopez (Sevilla)', 'la población entre paréntesis'],
        ['Bar Manolo', 'Bar Manolo 2', 'el número del segundo local'],
        ['Autoservicio El Arco', 'Autoservicios El Arco', 'el plural'],
        ['Talleres Ruiz', 'Taller Ruiz', 'el singular'],
        ['Panaderia La Espiga', 'La Espiga Panaderia', 'las palabras en otro orden'],
        ['Hnos. Perez', 'Hermanos Perez', 'la abreviatura'],
        ['Ferreteria Gomez', 'Ferreteria Gomes', 'una errata en el apellido'],
        ['Ferreteria Gomez', 'Ferreteria Gomez e Hijos', 'la coletilla del final'],
    ];

    seParecen.forEach(([uno, otro, porque]) => {
        it(`ve el parecido de «${uno}» y «${otro}» — ${porque}`, () => {
            expect(nombresSeParecen(uno, otro)).toBe(true);
            expect(nombresSeParecen(otro, uno)).toBe(true);
        });
    });

    const noSeParecen = [
        ['Transportes Garcia', 'Transportes Lopez', 'sólo comparten el ramo'],
        ['Talleres Ruiz', 'Talleres Diaz', 'el apellido es otro'],
        ['Transportes Sur', 'Transportes', 'lo único en común es a qué se dedican'],
        ['Bar Pepe', 'Bar', 'la corta no dice quién es'],
        ['Muebles Lopez', 'Comercial Ruiz', 'no tienen nada que ver'],
        ['Ruiz', 'Diaz', 'palabras cortas: una letra ya es otro apellido'],
    ];

    noSeParecen.forEach(([uno, otro, porque]) => {
        it(`no empareja «${uno}» con «${otro}» — ${porque}`, () => {
            expect(nombresSeParecen(uno, otro)).toBe(false);
            expect(nombresSeParecen(otro, uno)).toBe(false);
        });
    });

    it('no da por parecido lo que está vacío', () => {
        expect(nombresSeParecen('', 'Muebles Lopez')).toBe(false);
        expect(nombresSeParecen('S.L.', 'Muebles Lopez')).toBe(false);
    });
});

describe('el parecido de nombre en el aviso de cartera', () => {
    it('avisa de la ficha de cartera a la que sólo se parece el nombre', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'Ferretería Luna S.L.' }), CLIENTES);
        expect(r).toHaveLength(1);
        expect(r[0].client.id).toBe(11);
        expect(r[0].motivos).toEqual(['un nombre casi igual']);
    });

    it('lo marca como sólo un parecido, para no ofrecer el acceso a ciegas', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'Ferretería Luna S.L.' }), CLIENTES);
        expect(r[0].soloPorParecido).toBe(true);
    });

    it('deja de ser sólo un parecido cuando además coincide el correo', () => {
        const r = buscarFichasParecidas(
            pendiente({ name: 'Ferretería Luna S.L.', email: 'luna@ferreteria.com' }),
            CLIENTES,
        );
        expect(r[0].motivos).toEqual(['el mismo correo', 'un nombre casi igual']);
        expect(r[0].soloPorParecido).toBe(false);
    });

    it('sigue diciendo "el mismo nombre" cuando es el mismo de verdad', () => {
        const r = buscarFichasParecidas(pendiente({ name: 'FERRETERIA LUNA' }), CLIENTES);
        expect(r[0].motivos).toEqual(['el mismo nombre']);
        expect(r[0].soloPorParecido).toBe(false);
    });

    it('pone las seguras por delante de las que sólo se parecen', () => {
        const r = buscarFichasParecidas(
            pendiente({ name: 'Ferretería Luna S.L.', cif: 'B14123456' }),
            CLIENTES,
        );
        expect(r.map(p => p.client.id)).toEqual([10, 11]);
    });
});

describe('buscarSolicitudesParecidas', () => {
    const unaDeAlbaran = (id, name) => ({ id, name, status: 'pending', createdFrom: 'albaran' });

    it('ve las dos solicitudes de la misma empresa escritas distinto', () => {
        const a = unaDeAlbaran(1, 'Transportes Garcia');
        const b = unaDeAlbaran(2, 'TRANSPORTES GARCIA S.L.');
        expect(buscarSolicitudesParecidas(a, [a, b]).map(p => p.id)).toEqual([2]);
    });

    it('no repite lo que ya sale como gemela, que es la que se puede unir', () => {
        const a = unaDeAlbaran(1, 'Rafa Martínez');
        const b = unaDeAlbaran(2, 'RAFA MARTINEZ');
        expect(buscarSolicitudesGemelas(a, [a, b]).map(p => p.id)).toEqual([2]);
        expect(buscarSolicitudesParecidas(a, [a, b])).toEqual([]);
    });

    it('no empareja a dos empresas distintas del mismo ramo', () => {
        const a = unaDeAlbaran(1, 'Talleres Ruiz');
        const b = unaDeAlbaran(2, 'Talleres Diaz');
        expect(buscarSolicitudesParecidas(a, [a, b])).toEqual([]);
    });

    it('no se señala a sí misma ni a las de prueba', () => {
        const a = unaDeAlbaran(1, 'Bar Manolo');
        const prueba = { ...unaDeAlbaran(2, 'Bar Manolo 2'), isTest: true };
        expect(buscarSolicitudesParecidas(a, [a, prueba])).toEqual([]);
    });

    it('el parecido de nombre NUNCA convierte a una solicitud en gemela', () => {
        // Es la garantía de que esto sólo avisa: unir borra la otra ficha, y
        // para borrar hace falta algo más que un nombre parecido.
        const a = unaDeAlbaran(1, 'Bar Manolo');
        const b = unaDeAlbaran(2, 'Bar Manolo 2');
        expect(buscarSolicitudesGemelas(a, [a, b])).toEqual([]);
        expect(buscarSolicitudesParecidas(a, [a, b]).map(p => p.id)).toEqual([2]);
    });
});
