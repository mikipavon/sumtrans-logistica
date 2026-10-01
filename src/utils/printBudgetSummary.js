import { porteDelEnvio, quienPagaElPorte } from './shipmentUtils';

// Los nombres los teclea la oficina o el cliente: un «&» o un «<» no pueden
// romper la hoja.
const enHtml = (texto) => String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

const formatMonthLabel = (monthStr) => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * La hoja que se le da al cliente: sus albaranes del periodo con remitente,
 * destinatario, importe y el total. Es un papel para el cliente, así que no
 * lleva nuestro rótulo ni habla de presupuesto ni de IVA (Miguel, 28/09/2026).
 *
 * En cada fila va en negrita cursiva quien paga el porte, como en la Cuenta del
 * repartidor: el cliente recibe de unos y manda a otros, y así ve de dónde
 * viene cada envío y por qué se le cobra.
 * @param {Object} clientData - { clientName, shipments, totalAmount }
 * @param {string} month - "YYYY-MM"
 * @param {Object} [status] - { driverName, isCollected, liquidatedAt } — si ya se cerró el mes, se muestra el estado del cobro
 */
export const htmlDelDetalleDeEnvios = (clientData, month, status = null) => {
    // Un cierre que arrastra meses anteriores trae su periodo ('Agosto y
    // septiembre de 2026'); si no, el mes elegido.
    const periodo = clientData.periodo || formatMonthLabel(month);

    const rows = (clientData.shipments || []).map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-ES') : (s.date || '—');
        const origin = s.originName || s.client || (s.originCity ? `${s.originCity} (${s.originZip || ''})` : (s.origin || '—'));
        const dest = s.destinationName || (s.destinationCity ? `${s.destinationCity} (${s.destinationZip || ''})` : (s.destination || '—'));
        const desc = Array.isArray(s.articles) && s.articles.length > 0
            ? s.articles.map(a => a.name || a.description).filter(Boolean).join(', ')
            : (s.observations || 'Portes');
        return { id: s.id, date, origin, dest, desc, amount: porteDelEnvio(s), pagaDestinatario: quienPagaElPorte(s) === 'Destinatario' };
    });

    const total = clientData.totalAmount != null ? clientData.totalAmount : rows.reduce((sum, r) => sum + r.amount, 0);

    const statusHtml = status ? `
        <div class="status-box ${status.isCollected ? 'status-paid' : 'status-pending'}">
            ${status.isCollected ? '✓ COBRADO' : '⏳ PENDIENTE DE COBRO'} — Asignado a ${status.driverName || 'sin asignar'}
            ${status.liquidatedAt ? ` · Cerrado el ${new Date(status.liquidatedAt).toLocaleDateString('es-ES')}` : ''}
        </div>
    ` : '';

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Detalle de envíos - ${enHtml(clientData.clientName)} - ${periodo}</title>
            <style>
                /* Un folio con sus márgenes y letra de listado: caben unas
                   setenta líneas por hoja y la cabecera de la tabla se repite
                   en cada una. */
                @page { size: A4; margin: 8mm; }
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, sans-serif; color: #1e293b; padding: 10mm; max-width: 210mm; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 2px solid #1e293b; padding-bottom: 3px; margin-bottom: 5px; }
                .header h1 { font-size: 13px; text-transform: uppercase; }
                .header p { font-size: 11px; color: #64748b; }
                .client-box { margin-bottom: 5px; }
                .client-box .name { font-size: 12px; font-weight: bold; }
                .paga { font-weight: bold; font-style: italic; }
                .status-box { font-size: 9px; font-weight: bold; padding: 4px 8px; border-radius: 4px; margin-bottom: 8px; }
                .status-paid { background: #d1fae5; color: #065f46; }
                .status-pending { background: #fef3c7; color: #92400e; }
                table { width: 100%; border-collapse: collapse; font-size: 8.5px; line-height: 1.15; table-layout: fixed; }
                th { text-align: left; background: #1e293b; color: white; padding: 3px 4px; text-transform: uppercase; font-size: 7.5px; white-space: nowrap; }
                td { padding: 2px 4px; border-bottom: 1px solid #e2e8f0; vertical-align: top; overflow-wrap: anywhere; }
                tr { break-inside: avoid; }
                tr:nth-child(even) td { background: #f8fafc; }
                .col-albaran { width: 10%; }
                .col-fecha { width: 9%; }
                .col-nombre { width: 30%; }
                .col-descripcion { width: 12%; }
                .col-importe { width: 9%; }
                .amount-col { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .total-row { margin-top: 5px; display: flex; justify-content: flex-end; align-items: baseline; gap: 10px; border-top: 2px solid #1e293b; padding-top: 4px; break-inside: avoid; }
                .total-label { font-size: 10px; font-weight: bold; text-transform: uppercase; color: #64748b; }
                .total-value { font-size: 14px; font-weight: bold; }
                .footer { margin-top: 6px; font-size: 8px; color: #94a3b8; text-align: center; }
                @media print {
                    body { padding: 0; max-width: none; }
                    th, tr:nth-child(even) td, .status-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                    button, #no-print-actions { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>Detalle de envíos</h1>
                <p>${periodo}</p>
            </div>

            <div class="client-box">
                <div class="name">${enHtml(clientData.clientName)}</div>
            </div>

            ${statusHtml}

            <table>
                <colgroup>
                    <col class="col-albaran"><col class="col-fecha"><col class="col-nombre"><col class="col-nombre"><col class="col-descripcion"><col class="col-importe">
                </colgroup>
                <thead>
                    <tr>
                        <th>Nº Albarán</th>
                        <th>Fecha</th>
                        <th>Remitente</th>
                        <th>Destinatario</th>
                        <th>Descripción</th>
                        <th class="amount-col">Importe</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>${enHtml(r.id)}</td>
                            <td>${r.date}</td>
                            <td${r.pagaDestinatario ? '' : ' class="paga"'}>${enHtml(r.origin)}</td>
                            <td${r.pagaDestinatario ? ' class="paga"' : ''}>${enHtml(r.dest)}</td>
                            <td>${enHtml(r.desc)}</td>
                            <td class="amount-col">${r.amount.toFixed(2)} €</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="total-row">
                <span class="total-label">Total</span>
                <span class="total-value">${total.toFixed(2)} €</span>
            </div>

            <div class="footer">Documento generado el ${new Date().toLocaleDateString('es-ES')}</div>

            <div id="no-print-actions" style="text-align:center; margin-top:16px;">
                <button onclick="window.print()" style="padding:8px 20px; font-size:12px; background:#4f46e5; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Imprimir</button>
            </div>
        </body>
        </html>
    `;
};

/** Abre la hoja del detalle de envíos en una ventana nueva, lista para imprimir. */
export const printBudgetSummary = (clientData, month, status = null) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(htmlDelDetalleDeEnvios(clientData, month, status));
    printWindow.document.close();
};
