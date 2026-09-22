import { ALL_BAREMO_PUEBLOS } from '../data/baremos';

// ── Precio de un artículo dentro de un albarán ──
//
// Esta cuenta vivía copiada en el alta (CreateShipmentModal), y la ficha del
// albarán (ShipmentDetailsModal) tenía la suya propia SIN baremos: al pulsar
// Editar volvía a poner cada artículo a su precio base o a la tarifa especial
// del que paga, y nada más. Un albarán a un pueblo de Baremo 2 (Casariche:
// BLT_5 a 21,50 €) se abarataba al precio de Baremo 1 (18,00 €) nada más abrir
// la edición, y con "Guardar Cambios" el importe malo pisaba al bueno aunque
// no se hubiera tocado nada. Aquí está la cuenta una sola vez y las dos
// pantallas llaman a lo mismo, así que ya no pueden separarse.
//
// Las importaciones (utils/importacionEnvios.js) y el portal del cliente
// (ClientDashboard) llaman aquí desde el 18/9/2026; antes llevaban copias que
// daban Baremo 1 a un pueblo B2 con una fila sin baremo en Ajustes.

// Igual que se normalizan los pueblos en el alta: sin acentos, sin "de Córdoba",
// "de la Frontera" ni "de los Caballeros", sin signos y con un solo espacio.
export function normalizarPoblacion(texto) {
    if (!texto) return '';
    return String(texto)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+de\s+cordoba$/, '')
        .replace(/\s+de\s+la\s+frontera$/, '')
        .replace(/\s+de\s+los\s+caballeros$/, '')
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, ' ');
}

// Un importe tecleado: admite coma decimal. Vacío, nulo o no numérico → null,
// que aquí significa "no hay precio fijado" y se pasa al siguiente escalón.
const importe = (valor) => {
    if (valor === undefined || valor === null || valor === '') return null;
    const n = parseFloat(String(valor).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
};

const baremoValido = (p) => p && [1, 2].includes(Number(p.baremo));

/**
 * Filas de una lista de pueblos (Ajustes o listado maestro) que casan con un
 * punto del envío.
 *
 * Manda el nombre exacto: sólo si ningún nombre casa se mira el C.P. Varios
 * pueblos comparten C.P. (Jauja, Baremo 2, lleva el 14911 igual que Llanos de
 * Don Juan y Navas del Selpillar, Baremo 1), y buscando "nombre o C.P." de una
 * vez salía el primero de la lista, no el pueblo escrito.
 *
 * Las filas sin baremo válido (ni 1 ni 2) se ignoran. En Ajustes no salen en
 * ninguna columna, así que nadie las ve ni las puede borrar, y hasta el
 * 3/9/2026 valían como Baremo 1: una fila vieja de Antequera sin baremo tapaba
 * a la de Antequera B2 y el alta ponía el envío a Baremo 1.
 */
export function pueblosQueCasan(city, zip, lista) {
    const normCity = normalizarPoblacion(city);
    const cleanZip = String(zip || '').trim();
    const validas = (lista || []).filter(baremoValido);
    const porNombre = normCity ? validas.filter(p => normalizarPoblacion(p.name) === normCity) : [];
    if (porNombre.length) return porNombre;
    return cleanZip ? validas.filter(p => String(p.zip || '').trim() === cleanZip) : [];
}

/**
 * Baremo (1 ó 2) de un punto del envío.
 *
 * Orden de búsqueda, el mismo que tenía el alta:
 *   1. Tarifas por zona (`tariffs`): si la zona trae baremo explícito, manda.
 *      Si no lo trae, se apunta la zona (para los precios por zona del
 *      artículo) y se sigue buscando en las listas.
 *   2. Lista personalizada de Ajustes (`coverageZones`).
 *   3. Listado maestro de pueblos (data/baremos.js).
 *   4. Sin coincidencia: C.P. de Córdoba (14xxx) es Baremo 1; cualquier otro
 *      pueblo es Baremo 2. Sin pueblo ni C.P. → Baremo 1.
 *
 * En las listas (2 y 3) casan las filas de `pueblosQueCasan`. Si hay varias y
 * no se ponen de acuerdo (el mismo pueblo repetido en las dos columnas de
 * Ajustes) gana Baremo 2, que es lo mismo que hace "AUTO-CORREGIR BAREMOS".
 * La etiqueta (`source`) dice qué fila decidió, para poder encontrarla.
 *
 * `fueraDeBaremo` avisa de que el punto ha caído al escalón 4: la población no
 * está en ninguna tarifa ni en ninguna lista, así que el baremo es un supuesto
 * y el precio del catálogo no vale (ver `conMinimoFueraDeBaremo`). Sin pueblo
 * ni C.P. todavía no hay nada que decidir y no cuenta como fuera.
 */
export function baremoDelPunto(city, zip, { tariffs = null, coverageZones = [] } = {}) {
    const cleanCity = String(city || '').trim().toLowerCase();
    const cleanZip = String(zip || '').trim();
    if (!cleanCity && !cleanZip) return { baremo: 1, tariffId: null, source: 'General', fueraDeBaremo: false };

    const normCity = normalizarPoblacion(cleanCity);
    let tariffId = null;
    let baremo = 1;
    let source = 'General';
    let fueraDeBaremo = false;

    if (tariffs) {
        const porNombre = tariffs.find(t => t.match && normCity && normalizarPoblacion(t.match) === normCity);
        const porCp = tariffs.find(t => t.zipPrefix && cleanZip && cleanZip.startsWith(String(t.zipPrefix).trim()));
        const zona = porNombre || porCp;
        if (zona) {
            tariffId = zona.id;
            if (zona.baremo) {
                baremo = Number(zona.baremo);
                source = 'Tarifa Especial';
            }
        }
    }

    if (!tariffId || baremo === 1) {
        const decide = (filas) => filas.find(p => Number(p.baremo) === 2) || filas[0] || null;
        const etiqueta = (p) => `${p.name || ''} ${p.zip || ''}`.trim();
        const personalizada = decide(pueblosQueCasan(cleanCity, cleanZip, coverageZones));
        const maestra = decide(pueblosQueCasan(cleanCity, cleanZip, ALL_BAREMO_PUEBLOS));
        if (personalizada) {
            baremo = Number(personalizada.baremo);
            source = `Lista Personalizada (Ajustes): ${etiqueta(personalizada)}`;
        } else if (maestra) {
            baremo = Number(maestra.baremo);
            source = `Listado Maestro (Sistema): ${etiqueta(maestra)}`;
        } else {
            // Una zona con tarifa (aunque no traiga baremo) tiene sus precios
            // por zona en los artículos: ese pueblo sí está tarifado.
            fueraDeBaremo = !tariffId;
            if (cleanZip.startsWith('14')) {
                baremo = 1;
                source = 'C.P. Córdoba (14xxx)';
            } else {
                baremo = 2;
                source = 'Fuera de Córdoba (B2)';
            }
        }
    }

    return { baremo, tariffId, source, fueraDeBaremo };
}

/**
 * Baremo del envío entero: si el origen O el destino son Baremo 2, todo el
 * envío va a Baremo 2. La zona (`tariffId`) es la del destino, que es donde se
 * definen los precios por zona de los artículos. Basta con que un punto esté
 * fuera de baremo para que lo esté el envío.
 */
export function baremoDelEnvio({ originCity, originZip, destinationCity, destinationZip } = {}, opciones = {}) {
    const origen = baremoDelPunto(originCity, originZip, opciones);
    const destino = baremoDelPunto(destinationCity, destinationZip, opciones);
    const baremo = (Number(origen.baremo) === 2 || Number(destino.baremo) === 2) ? 2 : 1;
    let source = origen.baremo === 2 ? origen.source : destino.source;
    if (origen.baremo === 2 && destino.baremo === 2) source = `${origen.source} + ${destino.source}`;
    const fueraDeBaremo = !!(origen.fueraDeBaremo || destino.fueraDeBaremo);
    return { baremo, tariffId: destino.tariffId, source, fueraDeBaremo };
}

// ── Población fuera de los baremos ──
//
// Decidido por Miguel el 22/09/2026: un envío cuya población no sale en el
// Baremo 1 ni en el 2 se cobra como mínimo a 12 €, y al cliente que no es de
// Facturación se le avisa de que pregunte el precio en la oficina (el portal
// enseña el aviso; ver ClientDashboard). El mínimo es del porte (artículos o
// kilos), antes de sumar la comisión del reembolso.
export const PRECIO_MINIMO_FUERA_DE_BAREMO = 12;

export function conMinimoFueraDeBaremo(importeDelPorte, fueraDeBaremo) {
    const n = Number(importeDelPorte) || 0;
    if (!fueraDeBaremo) return n;
    return Math.max(n, PRECIO_MINIMO_FUERA_DE_BAREMO);
}

/**
 * Precio unitario de un artículo para un envío.
 *
 * De más concreto a más general, igual que en el alta:
 *   - Cliente "Por Kilos": el porte sale del peso, el artículo va a 0.
 *   - Tarifa especial del que paga para ESE baremo: la columna B2 de su ficha
 *     en Baremo 2, la columna normal en Baremo 1. Cada columna vale sólo en su
 *     baremo: hasta el 21/9/2026 la normal valía también en B2 cuando la B2
 *     estaba vacía, y ACTIVA pagaba el frigorífico a 15 (su especial B1) en
 *     los envíos a Antequera en vez de los 21 del catálogo. Quien quiera el
 *     mismo precio en los dos baremos lo escribe en las dos columnas.
 *   - Precio por zona del artículo, si el destino cae en una zona con tarifa.
 *   - Baremo 2: precio B2 del artículo.
 *   - Precio base del artículo.
 */
export function precioUnitarioArticulo(articulo, { baremo = 1, tariffId = null, cliente = null, porKilos = false } = {}) {
    if (!articulo) return 0;
    if (porKilos) return 0;

    const id = articulo.id;
    const especial = baremo === 2
        ? importe(cliente?.customRatesB2?.[id])
        : importe(cliente?.customRates?.[id]);
    if (especial !== null) return especial;

    const porZona = (tariffId && articulo.zonePrices && articulo.zonePrices[tariffId])
        ? importe(articulo.zonePrices[tariffId])
        : null;
    if (porZona !== null) return porZona;

    const baseB2 = importe(articulo.priceB2);
    if (baremo === 2 && baseB2 !== null) return baseB2;

    return importe(articulo.price) ?? 0;
}

/**
 * Vuelve a poner precio a los artículos ya añadidos (cambió el que paga, el
 * pueblo o el baremo). Devuelve la lista nueva y si algún precio ha cambiado,
 * para no tocar el estado ni el importe del albarán cuando todo sigue igual.
 */
export function repreciarArticulos(articulos, contexto) {
    let cambiaron = false;
    const resultado = (articulos || []).map(item => {
        const unitPrice = precioUnitarioArticulo(item, contexto);
        const cantidad = Number(item.quantity) || 1;
        const totalPrice = unitPrice * cantidad;
        const mismoUnitario = item.unitPrice === undefined || importe(item.unitPrice) === unitPrice;
        if (!mismoUnitario || importe(item.totalPrice) !== totalPrice) cambiaron = true;
        return { ...item, unitPrice, totalPrice };
    });
    return { articulos: resultado, cambiaron };
}
