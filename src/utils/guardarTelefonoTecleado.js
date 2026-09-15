import { resolveOwnerAgencyId } from './agencyOwnership';
import { esFijoEspanol } from './telefonosDelEnvio';
import { nombreDestinatarioEnRuta } from './shipmentUtils';

/**
 * Qué se hace con el número que alguien teclea en la ventana de "Enviar
 * Justificante" cuando la parada no tenía móvil: es oro, y si no se guarda el
 * siguiente albarán del mismo cliente vuelve a salir sin teléfono y hay que
 * pedirlo otra vez.
 *
 * La regla es la misma para el repartidor y para la oficina (Envíos); vivía
 * dentro del panel del repartidor. Quien llama decide CUÁNDO (el repartidor en
 * Android tiene que guardar antes de irse a WhatsApp; la oficina abre el chat
 * en otra pestaña y guarda detrás). Y de quién es el número lo dice quien lo
 * teclea, en la ventana: remitente, destinatario, o de nadie (un contacto
 * puntual, que no se guarda).
 */

const normalizeClientName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ");
};

/**
 * La ficha que responde a un nombre, con su sede si el nombre es el de una sede.
 * @returns {{client, branch}|null}
 */
export const fichaDelContacto = (nombre, clients = []) => {
    const buscado = normalizeClientName(nombre);
    if (!buscado) return null;
    let encontrada = null;
    for (const c of clients || []) {
        if (!c) continue;
        const sede = (c.branches || []).find(b => normalizeClientName(b?.name) === buscado);
        if (sede) return { client: c, branch: sede };
        if (!encontrada && (normalizeClientName(c.name) === buscado || normalizeClientName(c.legalName) === buscado)) {
            encontrada = { client: c, branch: null };
        }
    }
    return encontrada;
};

/**
 * En qué hueco de la ficha cabe el número tecleado, o null si no se toca.
 *
 * Solo 'phone' y 'mobile' se leen en el formulario de cliente y en el
 * autorrelleno del albarán, así que escribir en cualquier otro campo es tirar
 * el dato. Con los dos huecos ocupados, un móvil nuevo pisa al móvil de la
 * ficha: quien lo teclea ha dicho expresamente que es de este cliente, y la
 * ventana le avisó de que iba a sustituirlo (ver destinoDelTelefonoNuevo).
 */
export const huecoParaElTelefono = (ficha, telefono) => {
    const fichaPhone = String(ficha?.phone || '').trim();
    const fichaMobile = String(ficha?.mobile || '').trim();
    if (!fichaPhone) return { phone: telefono };
    if (fichaPhone === telefono || fichaMobile === telefono) return null;
    if (!fichaMobile) return { mobile: telefono };
    // Un fijo tecleado no sustituye a un móvil: a un fijo el justificante no llega,
    // y perder el móvil bueno por él sería un paso atrás.
    if (esFijoEspanol(telefono) && !esFijoEspanol(fichaMobile)) return null;
    return { mobile: telefono };
};

/**
 * Guarda el número tecleado en la ficha de la punta elegida (o crea la ficha si
 * no existe) y en el albarán si esa punta venía sin teléfono.
 *
 * @param papel  'Remitente' o 'Destinatario': de quién es el número. Sin él, la
 *               parada (remitente en una recogida, destinatario en una entrega).
 * @param firma  { createdBy, creatorId, isTest } para la ficha nueva.
 */
export const guardarTelefonoTecleado = async ({
    shipment,
    clients = [],
    telefono,
    papel = null,
    onUpdateClient,
    onAddClient,
    onUpdateShipment,
    firma = {},
}) => {
    if (!shipment || !telefono) return;
    const esRecogida = shipment.type === 'Recogida';
    const isPickup = papel ? papel === 'Remitente' : esRecogida;
    const targetName = isPickup
        ? (shipment.originName || (esRecogida ? shipment.client : ''))
        : nombreDestinatarioEnRuta(shipment, clients);
    const targetPhone = isPickup ? shipment.originPhone : shipment.destinationPhone;

    // 1) La ficha del cliente. Va primero: es el dato que hay que conservar.
    if (normalizeClientName(targetName)) {
        try {
            const encontrada = fichaDelContacto(targetName, clients);
            if (encontrada) {
                const cambios = huecoParaElTelefono(encontrada.branch || encontrada.client, telefono);
                if (cambios && onUpdateClient) {
                    await onUpdateClient(encontrada.client.id, cambios, encontrada.branch ? encontrada.branch.id : null);
                }
            } else if (onAddClient) {
                // No hay ficha: se crea pendiente de validar para que el número no se
                // quede huérfano en el albarán.
                await onAddClient({
                    name: targetName,
                    address: (isPickup ? shipment.originAddress : (shipment.destinationAddress || shipment.address)) || '',
                    city: (isPickup ? shipment.originCity : shipment.destinationCity) || '',
                    zip: (isPickup ? shipment.originZip : shipment.destinationZip) || '',
                    phone: telefono,
                    coordinates: (isPickup ? shipment.originCoordinates : shipment.destinationCoordinates) || '',
                    type: isPickup ? 'Remitente' : 'Destinatario',
                    billingType: 'Clientes Habituales',
                    status: 'pending',
                    // Si el porte lo paga una agencia, el cliente es suyo (ver agencyOwnership.js)
                    ownerAgencyId: resolveOwnerAgencyId(shipment, clients),
                    createdFrom: 'WhatsApp Justificante',
                    createdBy: firma.createdBy,
                    creatorId: firma.creatorId ?? null,
                    isTest: !!firma.isTest,
                });
            }
        } catch (err) {
            console.error("[WhatsApp] Error guardando el teléfono en la ficha:", err);
        }
    }

    // 2) El albarán, solo si venía sin teléfono. Si lo que tiene es un fijo no se
    // pisa: para llamar es el bueno, y el móvil ya ha quedado en la ficha, que es
    // de donde se cogerá la próxima vez. Vía onUpdateShipment para que use las
    // columnas reales de la tabla y se encole sin cobertura. En su propio try para
    // que un fallo de la ficha no se lo lleve por delante.
    if (!String(targetPhone || '').trim() && onUpdateShipment) {
        try {
            await onUpdateShipment(shipment.id, isPickup
                ? { originPhone: telefono }
                : { destinationPhone: telefono });
        } catch (err) {
            console.error("[WhatsApp] Error guardando el teléfono en el albarán:", err);
        }
    }
};
