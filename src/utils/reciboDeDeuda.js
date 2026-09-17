import { tipoDeFacturacion } from './filtrosEnvios';

// ── Una deuda que no nace de ningún albarán de la app ───────────────────────
//
// Albaranes en papel del mes pasado, un porte que se olvidó grabar, un cliente
// que quedó a deber: la oficina necesita apuntarle una deuda a un cliente
// concreto para que le salga al repartidor en su pestaña Cobros y a ella en
// Cobros Pendientes. La app ya tenía la pieza: el Recibo que crea el cierre
// mensual de presupuestos (BudgetLiquidationModal) es un albarán ficticio que
// sólo existe para cobrarse. Aquí se construye uno igual, a mano.
//
// Lleva billingType 'Clientes Habituales' a propósito: lineasDeCobro no deja
// que la ficha lo pise en un Recibo, así que la deuda se pide en mano aunque el
// cliente sea de facturación. Y va asignado al repartidor elegido porque la
// política RLS sólo deja al repartidor tocar los albaranes con su
// assignedDriverId: sin eso no podría marcarlo cobrado desde el móvil. Un Recibo
// nunca sale en la ruta del repartidor (DriverDashboard lo filtra), así que
// asignárselo no le mete ninguna parada.

// La fecha del albarán se guarda como texto en español, igual que en el modelo
// (ver Shipment.date): '7 sept 2026'.
export const fechaDeAlbaran = (yyyyMmDd) => {
    const [y, m, d] = String(yyyyMmDd || '').split('-').map(Number);
    const fecha = y && m && d ? new Date(y, m - 1, d) : new Date();
    return fecha.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Hoy en formato YYYY-MM-DD local, para el campo de fecha.
export const hoyParaElCampo = () => {
    const ahora = new Date();
    return new Date(ahora.getTime() - ahora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Cuántas fotos del papel firmado caben en una deuda. Van en los dos huecos de
// foto de entrega que ya enseña la ficha del albarán (deliveryPhoto y
// deliveryPhoto2, "Foto de Entrega" y "Documentación firmada"): así la oficina
// las ve en la ficha del Recibo sin ninguna pantalla nueva.
export const MAX_FOTOS_DE_DEUDA = 2;

// El bucket donde van: el mismo que las fotos de entrega y los justificantes de
// reembolso que ya sube la oficina.
export const BUCKET_FOTOS_DE_DEUDA = 'delivery_photos';

// Los campos de foto de un Recibo a partir de las URL ya subidas.
export const fotosDeRecibo = (fotos = []) => {
    const urls = (Array.isArray(fotos) ? fotos : []).filter(Boolean).slice(0, MAX_FOTOS_DE_DEUDA);
    return { deliveryPhoto: urls[0] || null, deliveryPhoto2: urls[1] || null };
};

// ── Dos cosas distintas: un albarán atrasado o un recibo al transportista ────
//
// La oficina tiene dos clases de papeles:
//   - Albaranes en papel que nunca entraron en la app. Son albaranes de verdad
//     del cliente y se acumulan en su cuenta como cualquier otro, según su tipo
//     de cobro: los de Presupuesto al cierre del mes, los de Facturación a su
//     factura y los de Clientes Habituales a Cobros Pendientes, sin repartidor
//     hasta que se le pase a alguno.
//   - Recibos: dinero que un transportista tiene que cobrar ya. Ese es el
//     Recibo de construirRecibo, más abajo.
//
// Antes todo nacía Recibo. Con ISPAVICAR (Presupuesto) el 16/09/2026 la deuda
// se le pedía al repartidor y el cierre de presupuestos se la saltaba.
//
// El albarán atrasado sale ya entregado y sin repartidor, así que no aparece en
// ninguna ruta. Lleva el número de su serie, igual que en el alta: HAB para
// Clientes Habituales y Presupuesto, SUM para Facturación. Y lleva
// fechaContable: handleAddShipment la usa como fecha de alta (createdAt), que es
// por la que Envíos, la exportación y el cierre de presupuestos lo colocan en su
// mes. Sin eso, un albarán de agosto tecleado en septiembre contaría en septiembre.

// El tipo de cobro del que paga. Un nombre sin ficha es Clientes Habituales, como
// en el resto de la app (y al guardarlo se le crea una ficha así).
export const tipoDeCobroDelCliente = (cliente) => {
    if (!cliente || cliente.sinFicha) return 'Clientes Habituales';
    return tipoDeFacturacion(cliente.billingType || cliente.tipoFacturacion || 'Clientes Habituales');
};

// La serie de numeración de un albarán según el tipo de cobro (la regla del alta).
export const serieDelAlbaran = (tipo) => (tipoDeFacturacion(tipo) === 'Facturación' ? 'SUM' : 'HAB');

// Qué pasa con un albarán atrasado de este tipo de cliente, dicho para la oficina.
export const destinoDelAlbaran = (tipo) => {
    const t = tipoDeFacturacion(tipo);
    if (t === 'Presupuesto') return 'se suma a sus albaranes del mes y se cobra al hacer el cierre de presupuestos';
    if (t === 'Facturación') return 'va a su factura del mes, como sus demás albaranes; no se cobra en mano';
    return 'queda en Cobros Pendientes sin repartidor, para pasárselo a quien lo cobre';
};

export const construirAlbaranAtrasado = ({ id, cliente, importe, concepto, fecha, fotos = [], articulos = [] }) => {
    const total = Math.round(Number(importe) * 100) / 100;
    const tipo = tipoDeCobroDelCliente(cliente);
    return {
        ...fotosDeRecibo(fotos),
        articles: Array.isArray(articulos) ? articulos : [],
        id: id || `${serieDelAlbaran(tipo)}-${Date.now().toString().slice(-6)}`,
        type: 'Entrega',
        client: cliente.name,
        // Sin clientId a propósito: el cierre de presupuestos agrupa por clientId
        // y, si no hay, por nombre; los albaranes del alta no lo llevan, y con él
        // éste saldría en una fila aparte del resto de albaranes del cliente.
        clientId: null,
        originName: cliente.name,
        destinationName: cliente.name,
        destination: concepto,
        date: fechaDeAlbaran(fecha),
        fechaContable: fecha || hoyParaElCampo(),
        amount: `€${total.toFixed(2)}`,
        customAmount: total,
        billingType: tipo,
        porteType: 'Pagado',
        paymentStatus: 'Pending',
        portePaid: false,
        hasCod: false,
        codAmount: 0,
        assignedDriverId: null,
        status: 'Entregado',
        observations: concepto,
    };
};

// La fecha de alta (ISO) de un albarán con fechaContable: ese día a mediodía,
// hora local, para que ningún cambio de zona horaria lo pase al día de al lado.
export const createdAtDeFechaContable = (fecha) => {
    const [y, m, d] = String(fecha || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

// El mes (YYYY-MM) en que cuenta un albarán para el cierre de presupuestos.
// Manda la fechaContable de una deuda apuntada a mano; si no, la de siempre:
// createdAt, o la fecha escrita dd/mm/yyyy si no hay createdAt.
export const mesDelPresupuesto = (s) => {
    if (s?.fechaContable && /^\d{4}-\d{2}/.test(s.fechaContable)) return s.fechaContable.slice(0, 7);
    const sDate = s?.createdAt ? new Date(s.createdAt) : new Date();
    if (!s?.createdAt && s?.date && typeof s.date === 'string' && s.date.includes('/')) {
        const parts = s.date.split('/');
        if (parts.length === 3) sDate.setFullYear(parts[2], parts[1] - 1, parts[0]);
    }
    return sDate.toISOString().substring(0, 7);
};

// El Recibo tal como se guarda. `fotos` son las URL ya subidas del papel firmado
// y `articulos` las líneas del desglose (ver utils/articulosDeDeuda.js), que
// pueden no cuadrar con el importe: el importe es lo que se debe; los artículos,
// el detalle.
export const construirRecibo = ({ cliente, importe, concepto, fecha, driverId, fotos = [], articulos = [] }) => {
    const total = Math.round(Number(importe) * 100) / 100;
    return {
        ...fotosDeRecibo(fotos),
        articles: Array.isArray(articulos) ? articulos : [],
        id: `RC-${Date.now().toString().slice(-6)}`,
        type: 'Recibo',
        client: cliente.name,
        clientId: cliente.id,
        originName: cliente.name,
        destinationName: cliente.name,
        destination: concepto,
        date: fechaDeAlbaran(fecha),
        amount: total.toFixed(2),
        customAmount: total,
        billingType: 'Clientes Habituales',
        porteType: 'Pagado',
        paymentStatus: 'Pending',
        portePaid: false,
        hasCod: false,
        codAmount: 0,
        assignedDriverId: driverId ? Number(driverId) : null,
        status: 'Pendiente de asignar',
        observations: concepto,
    };
};
