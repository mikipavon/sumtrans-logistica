// ── Qué esconde el Modo Fantasma con el candado echado ──
//
// Con el candado echado, la oficina no ve los albaranes de Clientes Habituales
// ni de Presupuesto. Se decide por la ficha actual de QUIEN PAGA el porte (el
// cliente puede haber cambiado de tipo), y sólo si no hay ficha, por lo que
// quedó grabado en el albarán.
//
// Antes se buscaba la ficha por el nombre exacto (sin quitar tildes, sin los
// otros nombres de la ficha, sin el enlace por id), mientras que la exportación
// a Factusol la buscaba con fichaDelPagador. Un albarán HAB cuyo cliente pasó a
// Facturación y venía con el nombre escrito de otra forma seguía escondido con
// el candado echado, y por tanto fuera del Excel (01/10/2026). Ahora los dos
// miran la misma ficha.

import { fichaDelPagador, quienPagaElPorte } from './shipmentUtils';

const normalizar = (valor) => String(valor || '').toLowerCase().trim();

const esDeLosEscondidos = (billingType) => {
    const tipo = normalizar(billingType);
    return tipo.includes('habitual') || tipo.includes('presupuesto');
};

/** El tipo de cobro por el que se decide: el de la ficha del pagador o, sin ficha, el del albarán. */
export const tipoDeCobroDelPagador = (shipment, clients) => {
    const ficha = fichaDelPagador(shipment, clients);
    if (ficha) return ficha.billingType || '';
    if (quienPagaElPorte(shipment) === 'Destinatario') {
        return shipment.destinationBillingType || shipment.billingType || '';
    }
    return shipment.billingType || '';
};

/** Si este albarán se ve con el candado echado. */
export const envioVisibleConCandado = (shipment, clients) =>
    !esDeLosEscondidos(tipoDeCobroDelPagador(shipment, clients));

/** Los albaranes que ve la oficina con el candado echado. */
export const enviosConCandado = (shipments, clients) =>
    (shipments || []).filter(s => s && envioVisibleConCandado(s, clients));
