// ── Qué albaranes entran en el cierre de presupuestos, y a nombre de quién ──
//
// Entra el albarán cuyo porte lo PAGA un cliente de Presupuesto: el remitente en
// porte pagado, el destinatario en porte debido. Es la regla del filtro de Envíos
// y del Panel (tipoDeClienteDelEnvio), así que lo que sale en Envíos filtrando
// por «Presupuesto» es lo que sale aquí.
//
// Antes el cierre miraba el tipo de cobro grabado en el albarán, que es el del
// REMITENTE el día del alta, y el nombre de la casilla Cliente. JUAN ALBA, de
// Presupuesto, recibe a porte debido de AGROCIRILO: sus albaranes no salían, y
// los de un remitente de Presupuesto salían aunque los pagara el destinatario
// (28/09/2026).
//
// La fila es la ficha de quien paga, no el texto tecleado: las sedes y los otros
// nombres de la ficha suman en la fila de su cliente.

import { filtroTipoDeCliente, buscadorDeFichaQuePaga, nombreDelPagador } from './filtrosEnvios';
import { normalizarTexto } from './busqueda';
import { porteDelEnvio, quienPagaElPorte } from './shipmentUtils';
import { mesDelPresupuesto } from './reciboDeDeuda';

// No se mira si el porte consta cobrado. El alta de un cliente de Presupuesto lo
// guarda «pagado» y con el repartidor que lo tecleó como cobrador, sin que nadie
// cobre nada (finalizeSubmit en CreateShipmentModal), y la entrega hace lo mismo.
// Descartando los que llevan cobrador, a AGRO VELASCO le faltaban en el cierre
// los albaranes que dieron de alta los repartidores (28/09/2026).

/**
 * Los albaranes sin liquidar que paga un cliente de Presupuesto, de cualquier
 * mes, cada uno con su fila: { envio, clave, clientId, clientName, mes, importe }.
 */
export const albaranesPorCerrar = (envios, clientes) => {
    const esDePresupuesto = filtroTipoDeCliente('Presupuesto', clientes);
    const fichaDe = buscadorDeFichaQuePaga(clientes);
    const lista = [];
    (Array.isArray(envios) ? envios : []).forEach((envio) => {
        if (!envio || envio.budgetLiquidated) return;
        // Los recibos de cobro no son albaranes.
        if (envio.type === 'Recibo' || envio.type === 'Cobro') return;
        if (!esDePresupuesto(envio)) return;
        const importe = porteDelEnvio(envio);
        if (importe <= 0) return; // Sólo los que tienen precio
        const ficha = fichaDe(envio);
        const clientName = String(ficha?.name || nombreDelPagador(envio) || '').trim() || 'Sin cliente';
        const pagaDestinatario = quienPagaElPorte(envio) === 'Destinatario';
        lista.push({
            envio,
            clave: ficha?.id != null ? `ficha:${ficha.id}` : normalizarTexto(clientName),
            // clientId es el enlace del REMITENTE: en un debido no es el de quien paga.
            clientId: ficha?.id ?? (pagaDestinatario ? null : (envio.clientId ?? null)),
            clientName,
            mes: mesDelPresupuesto(envio),
            importe,
        });
    });
    return lista;
};
