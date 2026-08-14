/**
 * Convertir una dirección en coordenadas sin acabar en la otra punta del país.
 *
 * "La Rambla" es un pueblo de Córdoba, pero también la calle más conocida de
 * Barcelona, y el buscador devolvía la calle: la parada de La Rambla se plantaba a
 * 878 km y el mapa del día pasaba de un puñado de kilómetros a 1.818. Lo mismo le
 * puede pasar a Cabra (hay otra en Tarragona), a Baena, a Montilla o a cualquier
 * pueblo cuyo nombre sea además una calle de una capital.
 *
 * Aquí se hacen dos cosas que antes no se hacían:
 *
 *  1. La consulta lleva la PROVINCIA. Sale del código postal de la parada —que casi
 *     siempre viene en la población, "14540 La Rambla"— y, si no lo trae, del nombre
 *     del pueblo (src/data/geografia_espana.js).
 *
 *  2. El resultado se comprueba antes de darlo por bueno: si el código postal que
 *     devuelve el buscador no es de la provincia que se pedía, no vale y se prueba la
 *     siguiente consulta. Es preferible una parada sin punto en el mapa que una
 *     parada en Barcelona: sin punto solo falta un marcador, en Barcelona se falsean
 *     los kilómetros y las horas de TODA la ruta.
 */

import { normalizarPueblo } from './townMatch';
import { GEOGRAFIA_ESPANA } from '../data/geografia_espana';

/** Nominatim pide como mucho una consulta por segundo. */
const MS_ENTRE_CONSULTAS = 1200;

/** Cuántos candidatos se piden: con uno solo, si el primero no vale no hay recambio. */
const CANDIDATOS_POR_CONSULTA = 5;

// ── Provincias, por prefijo de código postal y por nombre de pueblo ───────────

const construirIndices = () => {
    const porPrefijo = new Map();   // "14" -> "Córdoba"
    const porPueblo = new Map();    // "la rambla" -> Set{"Córdoba"}
    const conteos = new Map();      // provincia -> Map(prefijo -> veces)

    GEOGRAFIA_ESPANA.forEach(region => {
        (region.provincias || []).forEach(provincia => {
            const nombre = provincia.nombre;
            if (!conteos.has(nombre)) conteos.set(nombre, new Map());
            (provincia.poblaciones || []).forEach(({ nombre: pueblo, cp }) => {
                const prefijo = String(cp || '').padStart(5, '0').slice(0, 2);
                const veces = conteos.get(nombre);
                veces.set(prefijo, (veces.get(prefijo) || 0) + 1);

                const clave = normalizarPueblo(pueblo);
                if (!clave) return;
                if (!porPueblo.has(clave)) porPueblo.set(clave, new Set());
                porPueblo.get(clave).add(nombre);
            });
        });
    });

    // El prefijo de cada provincia es el que más se repite: en la lista hay algún
    // pueblo colocado en la provincia vecina, y con un solo caso mandaría el error.
    conteos.forEach((veces, provincia) => {
        let mejor = null;
        let mejorVeces = 0;
        veces.forEach((n, prefijo) => { if (n > mejorVeces) { mejorVeces = n; mejor = prefijo; } });
        if (mejor && !porPrefijo.has(mejor)) porPrefijo.set(mejor, provincia);
    });

    return { porPrefijo, porPueblo };
};

const { porPrefijo: PROVINCIA_POR_PREFIJO, porPueblo: PROVINCIAS_POR_PUEBLO } = construirIndices();

/** El código postal que haya en el texto, si es uno español de verdad (01–52). */
export const extraerCodigoPostal = (texto) => {
    const encontrados = String(texto || '').match(/\d{5}/g) || [];
    for (const cp of encontrados) {
        const prefijo = Number(cp.slice(0, 2));
        if (prefijo >= 1 && prefijo <= 52) return cp;
    }
    return null;
};

export const provinciaDeCodigoPostal = (cp) => {
    if (!cp) return null;
    return PROVINCIA_POR_PREFIJO.get(String(cp).slice(0, 2)) || null;
};

/**
 * La provincia de un pueblo por su nombre. Si el nombre está en más de una provincia
 * (hay varios "Villanueva"), no se elige: mejor buscar sin provincia y comprobar el
 * resultado que meter la parada en la provincia equivocada.
 */
export const provinciaDePueblo = (pueblo) => {
    const provincias = PROVINCIAS_POR_PUEBLO.get(normalizarPueblo(pueblo));
    if (!provincias || provincias.size !== 1) return null;
    return [...provincias][0];
};

// ── Las consultas ────────────────────────────────────────────────────────────

const limpiar = (texto) => String(texto || '')
    .replace(/\s+/g, ' ')
    .replace(/^[,\s]+|[,\s]+$/g, '')
    .trim();

/**
 * Las consultas a probar, de la más precisa a la más aproximada.
 *
 * La segunda es la que salva las direcciones que no están en el mapa (polígonos,
 * naves, "junto a la gasolinera"): si la calle no aparece, al menos el pueblo sí, y
 * el punto cae en el pueblo bueno en vez de no caer en ninguno.
 */
export const consultasDeGeocodificacion = ({ direccion, ciudad, provincia } = {}) => {
    const dir = limpiar(direccion);
    const pueblo = limpiar(ciudad);
    const salida = [];
    const añadir = (...trozos) => {
        const consulta = trozos.map(limpiar).filter(Boolean).join(', ');
        if (consulta && !salida.includes(consulta)) salida.push(consulta);
    };

    if (provincia) {
        añadir(dir, provincia, 'España');
        añadir(pueblo, provincia, 'España');
    } else {
        añadir(dir, 'España');
        añadir(pueblo, 'España');
    }
    return salida;
};

/**
 * ¿El sitio que ha devuelto el buscador es de donde se pedía?
 *
 * Manda el código postal, que es el dato duro. La provincia solo se mira cuando la
 * respuesta no trae código postal, porque los nombres de los campos cambian según
 * la comunidad y una comparación estricta rechazaría resultados buenos.
 */
export const resultadoValido = (resultado, { cp = null, provincia = null } = {}) => {
    if (!resultado) return false;
    const lat = parseFloat(resultado.lat);
    const lon = parseFloat(resultado.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;

    const señas = resultado.address || {};
    const esperado = cp ? String(cp).slice(0, 2) : null;
    const obtenido = señas.postcode ? String(señas.postcode).replace(/\D/g, '').slice(0, 2) : null;
    if (esperado && obtenido) return esperado === obtenido;

    if (provincia) {
        const candidatas = [señas.province, señas.state_district, señas.county, señas.state, señas.city]
            .filter(Boolean)
            .map(normalizarPueblo);
        if (candidatas.length > 0 && !candidatas.includes(normalizarPueblo(provincia))) return false;
    }
    return true;
};

// ── La llamada ───────────────────────────────────────────────────────────────

let ultimaConsulta = 0;

/** Una consulta a Nominatim, respetando su límite de una por segundo. */
const buscarEnNominatim = async (consulta) => {
    const espera = MS_ENTRE_CONSULTAS - (Date.now() - ultimaConsulta);
    if (espera > 0) await new Promise(r => setTimeout(r, espera));
    ultimaConsulta = Date.now();

    const url = 'https://nominatim.openstreetmap.org/search'
        + `?q=${encodeURIComponent(consulta)}`
        + `&format=json&limit=${CANDIDATOS_POR_CONSULTA}&countrycodes=es&addressdetails=1`;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SumtransLogistica/1.0' } });
        clearTimeout(t);
        const datos = await res.json();
        return Array.isArray(datos) ? datos : [];
    } catch {
        return [];
    }
};

/**
 * Lo ya buscado no se vuelve a buscar: el mapa se abre y se cierra muchas veces al
 * día con las mismas paradas, y cada consulta cuesta más de un segundo.
 */
const CACHE = new Map();

/**
 * @param {string} direccion  "Calle Severo Ochoa, 14550 Montilla"
 * @param {string} [ciudad]   la población suelta, si el que llama la tiene aparte
 * @returns {Promise<[number, number]|null>} [lat, lon], o null si no hay nada fiable
 */
export const geocodificarDireccion = async (direccion, ciudad = null, { buscar = buscarEnNominatim } = {}) => {
    const texto = limpiar(direccion);
    const pueblo = limpiar(ciudad) || texto.split(',').map(limpiar).filter(Boolean).pop() || '';
    if (!texto && !pueblo) return null;

    const clave = `${texto}|${pueblo}`.toLowerCase();
    if (CACHE.has(clave)) return CACHE.get(clave);

    const cp = extraerCodigoPostal(texto) || extraerCodigoPostal(pueblo);
    const provincia = provinciaDeCodigoPostal(cp) || provinciaDePueblo(pueblo);

    let salida = null;
    for (const consulta of consultasDeGeocodificacion({ direccion: texto, ciudad: pueblo, provincia })) {
        const resultados = await buscar(consulta);
        const bueno = (resultados || []).find(r => resultadoValido(r, { cp, provincia }));
        if (bueno) { salida = [parseFloat(bueno.lat), parseFloat(bueno.lon)]; break; }
    }

    CACHE.set(clave, salida);
    return salida;
};

/** Para los tests: la caché es de módulo y vive lo que viva la pestaña. */
export const vaciarCacheDeGeocodificacion = () => CACHE.clear();
