import Shipment from '../models/Shipment';

// ── ¿Este albarán sigue pendiente de cobro? ──────────────────────────────────
// Vive fuera del componente porque se usa en dos sitios: para construir la lista
// y para detectar, al guardar la ficha, que un albarán ACABA de salir de ella.
export const normalizeName = (val) => String(val || '').trim().toLowerCase();

// Helper for safe currency parsing
export const parseCurrency = (value) => {
    if (typeof value === 'number') return value;
    return parseFloat(String(value || '0').replace(/[^0-9.-]+/g, ""));
};

export const buildShipmentModel = (s, clients) => {
    const sName = normalizeName(s.client);
    const dName = normalizeName(s.destinationName);

    // Buscar en la lista de clientes para obtener datos frescos de facturación
    const senderClient = clients?.find(c => normalizeName(c.name) === sName || normalizeName(c.legalName) === sName);
    const destClient = clients?.find(c => normalizeName(c.name) === dName || normalizeName(c.legalName) === dName);

    // Prioridad: dato guardado en el albarán > ficha actual del cliente
    // (la ficha del cliente puede cambiar pero el albarán refleja el estado real al entregar)
    return new Shipment({
        ...s,
        billingType: s.billingType || senderClient?.billingType || 'Clientes Habituales',
        destinationBillingType: s.destinationBillingType || destClient?.billingType || null
    });
};

export const isPendingCollection = (s, clients) => {
    // EXCLUDE: Pagados y entregados completamente
    if (s.status === 'Entregado' && s.paymentStatus === 'Paid' && s.portePaid !== false && !s.hasCod) return false;
    if (s.status === 'Anulado') return false;

    const model = buildShipmentModel(s, clients);

    // CASO 2 y 5: Remitente cliente habitual + porte PAGADO → siempre en cobros pendientes
    const senderDebt = model.generatesPendingDebtOnCreation() && s.paymentStatus !== 'Paid';

    // CASO 3 y 6: Porte DEBIDO + cliente habitual destinatario → solo si está ENTREGADO
    // Usamos el modelo (que ya tiene el billingType correcto del albarán) en lugar de destClient directo
    const receiverOwesPorte = s.porteType === 'Debido'
        && s.status === 'Entregado'
        && !model.isInvoiceBilling(model.destinationBillingType)
        && s.paymentStatus !== 'Paid';

    // Reembolso pendiente (siempre al entregarse si no se marcó como cobrado)
    const codPending = s.hasCod && parseCurrency(s.codAmount) > 0 && !s.codPaid && s.status === 'Entregado';

    // Boolean() porque codPending puede quedar en undefined si el albarán no lleva
    // reembolso, y así la función siempre responde sí o no.
    return Boolean(senderDebt || receiverOwesPorte || codPending);
};


// Un albarán deja de ser cobro pendiente (deja de verse aquí) pero sigue sin
// repartidor y sin entregar: es justo el caso en el que se perdía de vista.
export const needsDriverAfterCollecting = (before, after, clients) => {
    if (!before || !after) return false;
    if (!isPendingCollection(before, clients)) return false;
    if (isPendingCollection(after, clients)) return false;
    if (after.assignedDriverId) return false;
    return after.status !== 'Entregado' && after.status !== 'Anulado';
};

