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
// La importación de Excel (ImportExcelShipments) y el portal del cliente
// (ClientDashboard) todavía llevan su propia copia de estas reglas.

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
 */
export function baremoDelPunto(city, zip, { tariffs = null, coverageZones = [] } = {}) {
    const cleanCity = String(city || '').trim().toLowerCase();
    const cleanZip = String(zip || '').trim();
    if (!cleanCity && !cleanZip) return { baremo: 1, tariffId: null, source: 'General' };

    const normCity = normalizarPoblacion(cleanCity);
    let tariffId = null;
    let baremo = 1;
    let source = 'General';

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
        const enLista = (lista) => (lista || []).find(p =>
            (normCity && normalizarPoblacion(p.name) === normCity) ||
            (cleanZip && String(p.zip || '').trim() === cleanZip)
        );
        const personalizada = enLista(coverageZones);
        const maestra = enLista(ALL_BAREMO_PUEBLOS);
        if (personalizada) {
            baremo = Number(personalizada.baremo || 1);
            source = 'Lista Personalizada (Ajustes)';
        } else if (maestra) {
            baremo = Number(maestra.baremo);
            source = 'Listado Maestro (Sistema)';
        } else if (cleanZip.startsWith('14')) {
            baremo = 1;
            source = 'C.P. Córdoba (14xxx)';
        } else {
            baremo = 2;
            source = 'Fuera de Córdoba (B2)';
        }
    }

    return { baremo, tariffId, source };
}

/**
 * Baremo del envío entero: si el origen O el destino son Baremo 2, todo el
 * envío va a Baremo 2. La zona (`tariffId`) es la del destino, que es donde se
 * definen los precios por zona de los artículos.
 */
export function baremoDelEnvio({ originCity, originZip, destinationCity, destinationZip } = {}, opciones = {}) {
    const origen = baremoDelPunto(originCity, originZip, opciones);
    const destino = baremoDelPunto(destinationCity, destinationZip, opciones);
    const baremo = (Number(origen.baremo) === 2 || Number(destino.baremo) === 2) ? 2 : 1;
    let source = origen.baremo === 2 ? origen.source : destino.source;
    if (origen.baremo === 2 && destino.baremo === 2) source = `${origen.source} + ${destino.source}`;
    return { baremo, tariffId: destino.tariffId, source };
}

/**
 * Precio unitario de un artículo para un envío.
 *
 * De más concreto a más general, igual que en el alta:
 *   - Cliente "Por Kilos": el porte sale del peso, el artículo va a 0.
 *   - Baremo 2 con tarifa especial B2 pactada con el que paga.
 *   - Tarifa especial general del que paga (en B1, o en B2 si no tiene B2 propia).
 *   - Precio por zona del artículo, si el destino cae en una zona con tarifa.
 *   - Baremo 2: precio B2 del artículo.
 *   - Precio base del artículo.
 */
export function precioUnitarioArticulo(articulo, { baremo = 1, tariffId = null, cliente = null, porKilos = false } = {}) {
    if (!articulo) return 0;
    if (porKilos) return 0;

    const id = articulo.id;
    const especialB2 = importe(cliente?.customRatesB2?.[id]);
    if (baremo === 2 && especialB2 !== null) return especialB2;

    const especial = importe(cliente?.customRates?.[id]);
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
