import { describe, it, expect, beforeEach } from 'vitest';
import {
    extraerCodigoPostal,
    provinciaDeCodigoPostal,
    provinciaDePueblo,
    consultasDeGeocodificacion,
    resultadoValido,
    geocodificarDireccion,
    vaciarCacheDeGeocodificacion,
} from './geocodificar';

// Lo que devolvía Nominatim con la consulta de antes ("La Rambla, España").
const LA_RAMBLA_BARCELONA = {
    lat: '41.3817367', lon: '2.1726341',
    address: { road: 'La Rambla', city: 'Barcelona', county: 'Barcelonès', state: 'Catalunya', postcode: '08001' },
};
const LA_RAMBLA_CORDOBA = {
    lat: '37.6061688', lon: '-4.7398851',
    address: { town: 'La Rambla', county: 'Córdoba', state: 'Andalucía', postcode: '14540' },
};

describe('el código postal de la parada', () => {
    it('lo saca de la población, que es donde viene', () => {
        expect(extraerCodigoPostal('14540 La Rambla')).toBe('14540');
        expect(extraerCodigoPostal('Calle Severo Ochoa, 14550 Montilla')).toBe('14550');
    });

    it('no confunde otros números de cinco cifras con un código postal', () => {
        expect(extraerCodigoPostal('Nave 99999')).toBe(null);      // no hay provincia 99
        expect(extraerCodigoPostal('Cabra')).toBe(null);
        expect(extraerCodigoPostal('')).toBe(null);
    });
});

describe('la provincia', () => {
    it('sale del código postal', () => {
        expect(provinciaDeCodigoPostal('14540')).toBe('Córdoba');
        expect(provinciaDeCodigoPostal('08001')).toBe('Barcelona');
        expect(provinciaDeCodigoPostal(null)).toBe(null);
    });

    it('y si no hay código postal, del nombre del pueblo', () => {
        expect(provinciaDePueblo('La Rambla')).toBe('Córdoba');
        expect(provinciaDePueblo('CABRA')).toBe('Córdoba');
        expect(provinciaDePueblo('Iznájar')).toBe('Córdoba');
        expect(provinciaDePueblo('pueblo que no existe')).toBe(null);
    });
});

describe('las consultas', () => {
    it('con provincia, primero la dirección y luego el pueblo a secas', () => {
        expect(consultasDeGeocodificacion({
            direccion: 'Calle Real, La Rambla', ciudad: 'La Rambla', provincia: 'Córdoba',
        })).toEqual([
            'Calle Real, La Rambla, Córdoba, España',
            'La Rambla, Córdoba, España',
        ]);
    });

    it('sin provincia se busca como se buscaba antes', () => {
        expect(consultasDeGeocodificacion({ direccion: 'Sitio raro, Villa X', ciudad: 'Villa X' }))
            .toEqual(['Sitio raro, Villa X, España', 'Villa X, España']);
    });

    it('no repite la misma consulta cuando la dirección es solo el pueblo', () => {
        expect(consultasDeGeocodificacion({ direccion: 'La Rambla', ciudad: 'La Rambla', provincia: 'Córdoba' }))
            .toEqual(['La Rambla, Córdoba, España']);
    });
});

describe('comprobar el resultado antes de darlo por bueno', () => {
    it('rechaza la calle de Barcelona cuando la parada es de Córdoba', () => {
        expect(resultadoValido(LA_RAMBLA_BARCELONA, { cp: '14540', provincia: 'Córdoba' })).toBe(false);
    });

    it('acepta el pueblo de Córdoba', () => {
        expect(resultadoValido(LA_RAMBLA_CORDOBA, { cp: '14540', provincia: 'Córdoba' })).toBe(true);
    });

    it('sin código postal en la respuesta, decide la provincia', () => {
        const sinCp = { lat: '41.38', lon: '2.17', address: { city: 'Barcelona', state: 'Catalunya' } };
        expect(resultadoValido(sinCp, { provincia: 'Córdoba' })).toBe(false);
        expect(resultadoValido(sinCp, { provincia: 'Barcelona' })).toBe(true);
    });

    it('sin nada con lo que comparar, se da por bueno', () => {
        expect(resultadoValido({ lat: '37.4', lon: '-4.4', address: {} }, {})).toBe(true);
    });

    it('un resultado sin coordenadas no vale', () => {
        expect(resultadoValido({ lat: 'x', lon: 'y' }, {})).toBe(false);
        expect(resultadoValido(null, {})).toBe(false);
    });
});

describe('geocodificarDireccion', () => {
    beforeEach(() => vaciarCacheDeGeocodificacion());

    it('la parada de La Rambla ya no se va a Barcelona', async () => {
        const consultas = [];
        const buscar = async (q) => {
            consultas.push(q);
            // El buscador devuelve las dos: la calle de Barcelona primero.
            return [LA_RAMBLA_BARCELONA, LA_RAMBLA_CORDOBA];
        };
        const coords = await geocodificarDireccion(', 14540 La Rambla', '14540 La Rambla', { buscar });
        expect(coords).toEqual([37.6061688, -4.7398851]);
        expect(consultas[0]).toBe('14540 La Rambla, Córdoba, España');
    });

    it('si la calle no está en el mapa, cae al pueblo en vez de quedarse sin punto', async () => {
        const buscar = async (q) => (q.startsWith('Pol. Ind.') ? [] : [LA_RAMBLA_CORDOBA]);
        const coords = await geocodificarDireccion('Pol. Ind. sin nombre, 14540 La Rambla', '14540 La Rambla', { buscar });
        expect(coords).toEqual([37.6061688, -4.7398851]);
    });

    it('antes que un punto en la provincia equivocada, ningún punto', async () => {
        const buscar = async () => [LA_RAMBLA_BARCELONA];
        expect(await geocodificarDireccion('14540 La Rambla', '14540 La Rambla', { buscar })).toBe(null);
    });

    it('no vuelve a preguntar por una dirección ya buscada', async () => {
        let veces = 0;
        const buscar = async () => { veces++; return [LA_RAMBLA_CORDOBA]; };
        await geocodificarDireccion('14540 La Rambla', '14540 La Rambla', { buscar });
        await geocodificarDireccion('14540 La Rambla', '14540 La Rambla', { buscar });
        expect(veces).toBe(1);
    });

    it('sin población, la saca del final de la dirección', async () => {
        const consultas = [];
        const buscar = async (q) => { consultas.push(q); return [LA_RAMBLA_CORDOBA]; };
        await geocodificarDireccion('Calle Real, La Rambla', null, { buscar });
        expect(consultas[0]).toBe('Calle Real, La Rambla, Córdoba, España');
    });

    it('una dirección vacía no llama a nadie', async () => {
        let veces = 0;
        const buscar = async () => { veces++; return []; };
        expect(await geocodificarDireccion('', '', { buscar })).toBe(null);
        expect(veces).toBe(0);
    });
});
