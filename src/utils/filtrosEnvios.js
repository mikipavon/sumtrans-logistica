// Filtros por cliente y por población del listado de envíos.
//
// El buscador ya encuentra "lekue", pero para ver TODO lo de un cliente o todo lo
// que va a un pueblo la oficina tenía que teclear el nombre exacto y fiarse de
// que no se colara nada parecido. Estos filtros ofrecen sólo los nombres que
// existen de verdad en el listado y comparan el nombre entero, no un trozo.

import { normalizarTexto } from './busqueda';
import { normalizarPueblo } from './townMatch';
import { ciudadDeEnvio } from './shipmentUtils';
import { baremoDelPunto } from './precioArticulo';

export const SIN_FILTRO = 'all';
// Valores del filtro de población que no son un pueblo sino todo un baremo.
export const BAREMO_1 = 'baremo:1';
export const BAREMO_2 = 'baremo:2';

/**
 * Los nombres que salen en la columna Clientes: quien paga y quien recibe. Se
 * añade el remite del porte debido para que elegir a un cliente enseñe también
 * los albaranes en los que aparece como remitente aunque no pague.
 */
export const nombresDeEnvio = (envio) => [
    envio?.client,
    envio?.destinationName,
    envio?.originName
].filter(Boolean);

/**
 * El pueblo donde para el conductor: el de entrega, o el del remite si es una
 * recogida. Mirar también el origen no vale: casi todo sale del mismo almacén y
 * al filtrar por ese pueblo salía el listado entero.
 */
export const poblacionesDeEnvio = (envio) => [ciudadDeEnvio(envio)].filter(Boolean);

/** El mismo punto que `ciudadDeEnvio`, con su C.P., para saber en qué baremo cae. */
const puntoDeParada = (envio) => {
    const city = ciudadDeEnvio(envio);
    const esOrigen = envio?.type === 'Recogida' ? !!envio?.originCity : !envio?.destinationCity;
    const zip = esOrigen ? envio?.originZip : envio?.destinationZip;
    return { city: city || '', zip: zip || '' };
};

/**
 * Lista única de opciones para un desplegable. Dos escrituras del mismo nombre
 * ("PRIEGO DE CORDOBA" y "Priego de Córdoba") cuentan como una sola y se enseña
 * la primera que aparece, ordenadas como las lee una persona.
 */
export const opcionesUnicas = (envios, extraer, normalizar) => {
    const vistas = new Map();
    (Array.isArray(envios) ? envios : []).forEach((envio) => {
        extraer(envio).forEach((valor) => {
            const texto = String(valor).trim();
            const clave = normalizar(texto);
            if (clave && !vistas.has(clave)) vistas.set(clave, texto);
        });
    });
    return Array.from(vistas.values())
        .sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
};

export const opcionesDeClientes = (envios) =>
    // Sólo lo que se ve en la columna: el remite del porte debido no aparece en ella.
    opcionesUnicas(envios, (e) => [e?.client, e?.destinationName].filter(Boolean), normalizarTexto);

export const opcionesDePoblaciones = (envios) =>
    opcionesUnicas(envios, poblacionesDeEnvio, normalizarPueblo);

const esTodo = (valor) => !valor || valor === SIN_FILTRO;

/** El cliente elegido es el que paga, el que recibe o el que remite. */
export const coincideCliente = (envio, cliente) => {
    if (esTodo(cliente)) return true;
    const buscado = normalizarTexto(cliente);
    return nombresDeEnvio(envio).some((nombre) => normalizarTexto(nombre) === buscado);
};

const baremoElegido = (poblacion) =>
    poblacion === BAREMO_1 ? 1 : poblacion === BAREMO_2 ? 2 : null;

/**
 * Criba de población para un listado entero.
 *
 * Un pueblo: el envío se entrega (o se recoge) allí. Un baremo: el pueblo
 * donde se para cae en ese baremo, decidido con la misma regla que pone el
 * precio en el alta (tarifas por zona, lista de Ajustes, listado maestro y
 * C.P.). Se pasan `tariffs` y `coverageZones` para que el filtro y el precio
 * no puedan discrepar. Un envío sin población no está en ningún baremo.
 *
 * La decisión por pueblo se recuerda dentro de la criba: el listado repite el
 * mismo pueblo cientos de veces y la regla recorre listas enteras cada vez.
 */
export const filtroPoblacion = (poblacion, opciones = {}) => {
    if (esTodo(poblacion)) return () => true;

    const baremo = baremoElegido(poblacion);
    if (baremo) {
        const decididos = new Map();
        return (envio) => {
            const { city, zip } = puntoDeParada(envio);
            if (!city && !zip) return false;
            const clave = `${normalizarPueblo(city)}|${zip.trim()}`;
            if (!decididos.has(clave)) decididos.set(clave, Number(baremoDelPunto(city, zip, opciones).baremo));
            return decididos.get(clave) === baremo;
        };
    }

    const buscada = normalizarPueblo(poblacion);
    return (envio) => poblacionesDeEnvio(envio).some((nombre) => normalizarPueblo(nombre) === buscada);
};

/** La población elegida es donde se entrega (o se recoge) el envío, o su baremo. */
export const coincidePoblacion = (envio, poblacion, opciones = {}) =>
    filtroPoblacion(poblacion, opciones)(envio);
