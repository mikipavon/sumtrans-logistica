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
