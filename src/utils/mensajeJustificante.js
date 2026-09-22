import { quienPagaElPorte, lineasDeDineroDelJustificante, nombreDestinatarioEnRuta, fichaDelDestinatario, nombresDelCliente } from './shipmentUtils';
import { construirEnlaceWhatsApp } from './whatsappLink';

/**
 * El texto del justificante que se manda por WhatsApp. Lo usan el repartidor
 * (desde la tarjeta de la parada) y la oficina (desde el detalle del albarán en
 * Envíos): tiene que decir lo mismo salga de donde salga, y por eso se arma aquí
 * y no en cada pantalla.
 */

const normalizarNombre = (valor) => String(valor || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim().replace(/\s+/g, ' ');

// La ficha que responde a un nombre (comercial, fiscal o de sede). Para el tipo
// de cobro da igual que sea una sede: el billingType es de la ficha madre.
const fichaPorNombre = (nombre, clients = []) => {
    const buscado = normalizarNombre(nombre);
    if (!buscado) return null;
    return (clients || []).find(c => c && nombresDelCliente(c).includes(buscado)) || null;
};

// Tipos de cobro que NO deben ver "SUMTRANS LOGISTICA" en el título: al cliente
// habitual, al contado o con presupuesto se le manda un justificante escueto.
const esTipoDiscreto = (billingType) => {
    const tipo = String(billingType || '').toLowerCase().trim();
    return ['habitual', 'diar', 'libre', 'contado', 'presupuesto'].some(palabra => tipo.includes(palabra));
};

/**
 * @param shipment  el albarán.
 * @param clients   las fichas cargadas (para el nombre en ruta del destinatario y
 *                  el tipo de cobro de cada punta).
 * @param paga      si quien va a recibir el mensaje es quien paga el porte. Con
 *                  null se deduce: se da por hecho que el mensaje va a la parada
 *                  (remitente en una recogida, destinatario en una entrega).
 */
export const mensajeDelJustificante = (shipment, clients = [], { paga = null } = {}) => {
    const envio = shipment || {};
    const isPickup = envio.type === 'Recogida';

    const date = envio.date || new Date().toLocaleDateString('es-ES');
    const origin = envio.originName || envio.client;
    // En una recogida nombreDestinatarioEnRuta es la parada (el remitente): el
    // destinatario es el que apuntó la oficina o, si no lo hay, el almacén.
    const dest = isPickup ? (envio.destinationName || envio.destination || '') : nombreDestinatarioEnRuta(envio, clients);

    const originClient = fichaPorNombre(envio.originName || envio.client, clients);
    const destClient = fichaDelDestinatario(envio, clients)?.client
        || fichaPorNombre(envio.destinationName || envio.client, clients);

    const isSecret = esTipoDiscreto(envio.billingType || originClient?.billingType)
        || esTipoDiscreto(envio.destinationBillingType || destClient?.billingType);

    // "DE ENTREGA" solo cuando el paquete está entregado de verdad: sin entregar
    // el papel afirmaría una entrega que no ha ocurrido.
    const estaEntregado = envio.status === 'Entregado' || !!envio.deliveredAt;
    const titleText = isSecret
        ? (estaEntregado ? `*JUSTIFICANTE DE ENTREGA*` : `*JUSTIFICANTE*`)
        : `*JUSTIFICANTE SUMTRANS LOGISTICA*`;

    // Serie HAB- = clientes al contado: precio cerrado en mano, sin desglose de
    // IVA. Los albaranes antiguos sin prefijo caen en isSecret.
    const idUpper = String(envio.id || '').toUpperCase();
    const isContado = idUpper.startsWith('HAB-') || (!idUpper.startsWith('SUM-') && isSecret);

    // Precio y estado del cobro son datos de quien paga; al otro se le manda el
    // justificante sin importes.
    const papelDeLaParada = isPickup ? 'Remitente' : 'Destinatario';
    const pagaQuienRecibeElMensaje = paga === null
        ? quienPagaElPorte(envio) === papelDeLaParada
        : paga === true;

    // Saltos de línea de verdad: quien codifica para la URL es el enlace.
    const { estadoText, priceText, codText } = lineasDeDineroDelJustificante(envio, {
        paga: pagaQuienRecibeElMensaje,
        isContado,
    });

    return `${titleText}\n\n` +
        `*REF:* ${envio.id}\n` +
        `*Fecha:* ${date}\n` +
        `*Remitente:* ${origin}\n` +
        `*Destinatario:* ${dest}\n` +
        estadoText +
        priceText +
        codText +
        `\n` +
        `Gracias por su confianza.`;
};

/**
 * El número tal y como lo quiere wa.me: sin espacios ni '+', y con el 34 delante
 * si es un número español de 9 cifras.
 */
export const telefonoParaWhatsApp = (telefono) => {
    const limpio = String(telefono || '').replace(/[\s.\-()]/g, '').replace('+', '');
    if (limpio.length === 9 && /^[679]/.test(limpio)) return `34${limpio}`;
    return limpio;
};

/**
 * Compartir el albarán por WhatsApp desde la oficina, una vez elegido el número
 * en la ventana de "Enviar Justificante" (la misma que ve el repartidor).
 *
 * A diferencia del repartidor (que navega fuera de la app y guarda el número
 * tecleado en la ficha), la oficina trabaja en el ordenador con la app abierta:
 * el chat se abre en una pestaña nueva, la pantalla de Envíos se queda donde
 * estaba y no se guarda nada.
 *
 * @param telefono  el móvil elegido o tecleado. Vacío: el chat se abre sin
 *                  destinatario y se elige el contacto a mano en WhatsApp.
 * @param paga      si ese número es el de quien paga el porte (decide si el
 *                  mensaje lleva importes). null = se deduce de la parada.
 * @param ventana   se inyecta para poder probarlo.
 */
export const compartirAlbaranPorWhatsApp = (shipment, clients = [], { telefono = '', paga = null, ventana = typeof window !== 'undefined' ? window : null } = {}) => {
    if (!shipment) return null;
    const numero = telefonoParaWhatsApp(telefono);
    const mensaje = mensajeDelJustificante(shipment, clients, { paga });
    // Siempre el wa.me: en el ordenador es lo único que hay, y en un móvil de la
    // oficina el sistema abre el WhatsApp que tenga.
    const { alternativa: url } = construirEnlaceWhatsApp({ telefono: numero, mensaje });
    ventana?.open?.(url, '_blank', 'noopener,noreferrer');
    return { url, telefono: numero, mensaje };
};
