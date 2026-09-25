import { telefonoParaWhatsApp } from './mensajeJustificante';
import { esFijoEspanol } from './telefonosDelEnvio';

/**
 * Lo que dice una Factura Simplificada, calculado UNA vez para las tres formas en
 * que sale: el ticket que se imprime, el PDF que se manda y el texto del WhatsApp.
 * Si cada una hiciera sus cuentas, tarde o temprano dirían importes distintos.
 */

export const EMPRESA = 'SUMTRANS LOGISTICA S.L.';
export const CIF = 'B56131717';
export const CORREO_FACTURAS = 'info@sumtransportes.com';

const parseAmt = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/[^0-9,.-]+/g, '');
    const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
};

/**
 * @returns {{
 *   ref: string, fecha: string, base: number, iva: number, total: number,
 *   lineas: {texto: string, importe: number|null}[],
 *   cliente: {nombre: string, direccion: string, poblacion: string, cp: string, telefono: string},
 *   movilWhatsApp: string
 * }}
 */
export const datosDeFacturaSimplificada = (shipmentData = {}) => {
    const fecha = shipmentData.date || new Date().toLocaleDateString('es-ES');
    const ref = shipmentData.id || 'NUEVO';

    // Quien llama sabe unas veces la base y otras lo ya cobrado con IVA (el
    // simplifiedInvoiceAmount guardado). Con totalConIva se saca la base de ahí:
    // pasarlo como amount le volvía a sumar el 21% (HAB-595: 43,56 € cobrados
    // salían como base y la factura decía 52,71 €).
    let base, iva, total;
    if (shipmentData.totalConIva !== undefined && shipmentData.totalConIva !== null) {
        total = +parseAmt(shipmentData.totalConIva).toFixed(2);
        base = +(total / 1.21).toFixed(2);
        iva = +(total - base).toFixed(2);
    } else {
        base = parseAmt(shipmentData.amount);
        iva = +(base * 0.21).toFixed(2);
        total = +(base + iva).toFixed(2);
    }

    // Los artículos llevan el precio de catálogo, que no tiene por qué ser lo que
    // se cobró (un porte pactado de 36 € con un BLT_1 de 7 €). Si las líneas no
    // suman la base, se nombran sin importe y el importe va en una línea de
    // transporte: una factura cuyas líneas no cuadran con la base no vale.
    const articulos = (shipmentData.articles || []).filter(Boolean);
    const importeDeLinea = (art) => (Number(art.quantity) || 1) * parseAmt(art.price);
    const textoDeLinea = (art) => `${art.quantity || 1}x ${art.name || 'Servicio'}`;
    const lineasCuadran = articulos.length > 0 &&
        Math.abs(articulos.reduce((s, art) => s + importeDeLinea(art), 0) - base) < 0.01;
    const lineas = lineasCuadran
        ? articulos.map(art => ({ texto: textoDeLinea(art), importe: importeDeLinea(art) }))
        : [
            ...articulos.map(art => ({ texto: textoDeLinea(art), importe: null })),
            { texto: 'SERV. TRANSPORTE', importe: base },
        ];

    const telefono = shipmentData.destinationPhone || '';

    return {
        ref,
        fecha,
        base,
        iva,
        total,
        lineas,
        cliente: {
            nombre: shipmentData.destinationName || shipmentData.client || '—',
            direccion: shipmentData.destinationAddress || '—',
            poblacion: shipmentData.destinationCity || '',
            cp: shipmentData.destinationZip || '',
            telefono,
        },
        // La factura es del destinatario, así que el WhatsApp va a su número. Un
        // fijo no tiene WhatsApp: el hueco sale vacío para teclear el móvil.
        movilWhatsApp: esFijoEspanol(telefono) ? '' : telefonoParaWhatsApp(telefono),
    };
};

/**
 * El texto del WhatsApp. Con `enlacePdf` añade el enlace para descargar la factura:
 * un wa.me sólo puede llevar texto, así que el PDF viaja como enlace.
 */
export const mensajeDeFacturaSimplificada = (datos, enlacePdf = null) =>
    `📄 *FACTURA SIMPLIFICADA*\n` +
    `${EMPRESA}\n` +
    `CIF: ${CIF}\n` +
    `Ref: ${datos.ref}\n` +
    `Fecha: ${datos.fecha}\n\n` +
    `Cliente: ${datos.cliente.nombre}\n\n` +
    `Base Imponible: ${datos.base.toFixed(2)}€\n` +
    `IVA 21%: ${datos.iva.toFixed(2)}€\n` +
    `━━━━━━━━━━━━\n` +
    `*TOTAL: ${datos.total.toFixed(2)}€*\n\n` +
    (enlacePdf ? `📎 Descargar factura (PDF):\n${enlacePdf}\n\n` : '') +
    `Para solicitar factura completa:\n📧 ${CORREO_FACTURAS}`;
