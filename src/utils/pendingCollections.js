import Shipment from '../models/Shipment';

// ── ¿Este albarán sigue pendiente de cobro? ──────────────────────────────────
// Vive fuera del componente porque se usa en dos sitios: para construir la lista
// y para detectar, al guardar la ficha, que un albarán ACABA de salir de ella.
export const normalizeName = (val) => String(val || '').trim().toLowerCase();

// Helper for safe currency parsing
// Devuelve SIEMPRE un número. Un importe que no encierra ninguna cifra ("Por
// valorar" de las recogidas, "Tarifa" de los portes por tarifa) vale 0 aquí: en
// JavaScript un solo NaN convierte en NaN cualquier suma que lo toque, y así el
// total de cobros pendientes se quedaba en €NaN por una recogida sin precio.
// Para saber si el importe era texto está importeSinValorar(), justo debajo.
export const parseCurrency = (value) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const num = parseFloat(String(value || '0').replace(/[^0-9.-]+/g, ""));
    return Number.isFinite(num) ? num : 0;
};

// ¿El importe es un texto sin cifras, es decir, un albarán todavía sin precio?
// Se usa para enseñar ese texto tal cual en la columna de importe en vez de un
// €0.00, que haría parecer que no se debe nada cuando lo que pasa es que aún no
// se sabe cuánto. Un importe vacío o ausente NO cuenta como sin valorar: sigue
// valiendo 0, como siempre.
export const importeSinValorar = (value) => {
    if (typeof value === 'number') return !Number.isFinite(value);
    return !Number.isFinite(parseFloat(String(value || '0').replace(/[^0-9.-]+/g, "")));
};

// ── Las líneas de cobro de un albarán: LA regla, la misma en todas partes ────
//
// Antes había dos copias de esta regla que no coincidían: la pestaña Cobros del
// móvil del repartidor y la pantalla Cobros Pendientes de la oficina. El móvil
// miraba primero la ficha del cliente y la oficina primero lo grabado en el
// albarán; el móvil escondía los portes sin importe ("Por valorar") y la oficina
// los enseñaba; el móvil descartaba un estado 'Cancelado' que no existe. Así una
// deuda podía salirle al repartidor y no a la oficina, o al revés, y la oficina
// no podía fiarse de que su lista fuera la suma de las pestañas de todos.
//
// Devuelve una línea por cada dinero que todavía hay que cobrar en mano:
//   { parte: 'porte' | 'reembolso', type: 'Portes (Pagado)' | 'Portes (Debido)' | 'Reembolso',
//     amount (número, 0 si es 'Tarifa'), amountDisplay (número o 'Tarifa'),
//     responsibleDriverId, payerName }
// Un albarán sin líneas no es un cobro pendiente.
//
// El tipo de cobro sale de la ficha ACTUAL del cliente y, si no hay ficha, de lo
// grabado en el albarán. Un Recibo (cierre de presupuestos, cobros manuales de
// oficina) es la excepción: trae su billingType puesto a propósito, normalmente
// 'Clientes Habituales' para forzar el cobro en mano aunque el cliente real sea de
// facturación, y la ficha no puede pisarlo.
export const lineasDeCobro = (s, clients) => {
    if (!s || s.status === 'Anulado') return [];

    const esRecibo = s.type === 'Recibo';
    const senderClient = esRecibo ? null : clients?.find(c => normalizeName(c.name) === normalizeName(s.client) || normalizeName(c.legalName) === normalizeName(s.client));
    const destClient = esRecibo ? null : clients?.find(c => normalizeName(c.name) === normalizeName(s.destinationName) || normalizeName(c.legalName) === normalizeName(s.destinationName));

    const model = new Shipment({
        ...s,
        billingType: esRecibo ? (s.billingType || 'Clientes Habituales') : (senderClient?.billingType || s.billingType || 'Clientes Habituales'),
        destinationBillingType: esRecibo ? null : (destClient?.billingType || s.destinationBillingType || null)
    });

    const lineas = [];
    const esDebido = s.porteType === 'Debido';
    const porDefectoPorte = esDebido ? (s.assignedDriverId || s.createdById) : (s.createdById || s.assignedDriverId);
    const porDefectoReembolso = s.assignedDriverId || s.createdById;

    // Porte. Un customAmount válido manda sobre el importe del albarán (importación
    // por Excel, liquidación de presupuestos). 'Tarifa' cuenta como deuda aunque
    // todavía no tenga cifra; 'Por valorar' (una recogida sin precio) no: todavía
    // no hay nada que cobrar y sólo abultaría la lista.
    const customAmount = parseCurrency(s.customAmount);
    const importePorte = customAmount || parseCurrency(s.amount);
    const esTarifa = !customAmount && String(s.amount || '').trim().toLowerCase() === 'tarifa';
    const hayPorte = importePorte > 0 || esTarifa;
    const porteSinCobrar = !s.portePaid && s.paymentStatus !== 'Paid';
    const pagadorEnMano = esDebido
        ? !model.isInvoiceBilling(model.destinationBillingType)
        : model.isCashBilling(model.billingType);
    // Un porte pagado en origen se debe desde que nace; uno debido, sólo al entregar.
    const tocaCobrarlo = !esDebido || s.status === 'Entregado';

    if (hayPorte && porteSinCobrar && pagadorEnMano && tocaCobrarlo) {
        lineas.push({
            parte: 'porte',
            type: esDebido ? 'Portes (Debido)' : 'Portes (Pagado)',
            amount: importePorte,
            amountDisplay: esTarifa ? 'Tarifa' : importePorte,
            responsibleDriverId: cobradorDesignado(s, porDefectoPorte),
            payerName: esDebido
                ? (s.destinationName || 'Destinatario (Debido)')
                : (s.originName || s.client || 'Remitente')
        });
    }

    // Reembolso: siempre en mano y siempre al entregar. Cuenta mientras no esté
    // marcado como cobrado, diga lo que diga paymentStatus: es dinero del
    // remitente que lleva el repartidor y no puede perderse de vista.
    const importeReembolso = parseCurrency(s.codAmount);
    if (s.hasCod && importeReembolso > 0 && !s.codPaid && s.status === 'Entregado') {
        lineas.push({
            parte: 'reembolso',
            type: 'Reembolso',
            amount: importeReembolso,
            amountDisplay: importeReembolso,
            responsibleDriverId: cobradorDesignado(s, porDefectoReembolso),
            payerName: s.destinationName || 'Destinatario (Reembolso)'
        });
    }

    return lineas;
};

export const isPendingCollection = (s, clients) => lineasDeCobro(s, clients).length > 0;

// Lo que le toca cobrar a un repartidor: sus líneas, con el albarán al lado.
// Se descartan primero, sin calcular nada, los albaranes en los que no aparece
// (el responsable de una línea siempre es el asignado, el creador o quien recibió
// el traspaso): el móvil recalcula esto en cada pintado y mira todos los albaranes.
export const cobrosPendientesDe = (shipments, driverId, clients) => {
    if (driverId === null || driverId === undefined || driverId === '') return [];
    const id = Number(driverId);
    const suyo = (v) => v !== null && v !== undefined && v !== '' && Number(v) === id;
    const resultado = [];
    (shipments || []).forEach(s => {
        if (!s) return;
        if (!suyo(s.assignedDriverId) && !suyo(s.createdById) && !suyo(s.pendingCollectionDriverId)) return;
        lineasDeCobro(s, clients).forEach(linea => {
            if (suyo(linea.responsibleDriverId)) resultado.push({ shipment: s, ...linea });
        });
    });
    return resultado;
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


// ── A quién le toca cobrar este albarán ─────────────────────────────────────
// Por defecto el cobro lo lleva quien salió con el albarán (o quien lo creó, en
// los portes pagados en origen). Cuando la oficina lo pasa a mano de un
// repartidor a otro desde Cobros Pendientes, ese traspaso manda sobre la regla y
// se guarda en pendingCollectionDriverId.
//
// El traspaso toca SÓLO el cobro: ni el reparto ni el estado del albarán. Antes
// se reasignaba con la misma función que asigna un reparto, que pone el estado en
// 'En reparto', y un albarán ya entregado se salía de Cobros Pendientes y le
// reaparecía al repartidor en la lista de entregas del día.
export const cobradorDesignado = (shipment, porDefecto) => {
    const traspaso = shipment?.pendingCollectionDriverId;
    if (traspaso === null || traspaso === undefined || traspaso === '') return porDefecto;
    return traspaso;
};

// ¿Le toca a este repartidor el cobro de este albarán, se lo hayan traspasado o no?
export const esSuCobro = (shipment, driverId, porDefecto) => {
    const responsable = cobradorDesignado(shipment, porDefecto);
    if (responsable === null || responsable === undefined || responsable === '') return false;
    if (driverId === null || driverId === undefined || driverId === '') return false;
    return Number(responsable) === Number(driverId);
};
