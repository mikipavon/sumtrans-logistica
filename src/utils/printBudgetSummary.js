import { quienPagaElPorte } from './shipmentUtils';

const parseAmount = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/[^0-9,.-]+/g, "");
    const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
};

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
        return { id: s.id, date, origin, dest, desc, amount: parseAmount(s.amount), pagaDestinatario: quienPagaElPorte(s) === 'Destinatario' };
    });

    const total = clientData.totalAmount != null ? clientData.totalAmount : rows.reduce((sum, r) => sum + r.amount, 0);

    const statusHtml = status ? `
        <div class="status-box ${status.isCollected ? 'status-paid' : 'status-pending'}">
            ${status.isCollected ? '✓ COBRADO' : '⏳ PENDIENTE DE COBRO'} — Asignado a ${status.driverName || 'sin asignar'}
            ${status.liquidatedAt ? ` · Cerrado el ${new Date(status.liquidatedAt).toLocaleDateString('es-ES')}` : ''}
        </div>
    ` : '';

    return `
        <html>
        <head>
            <title>Detalle de envíos - ${enHtml(clientData.clientName)} - ${periodo}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, sans-serif; color: #1e293b; padding: 20mm; max-width: 210mm; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 3px solid #1e293b; padding-bottom: 12px; margin-bottom: 20px; }
                .header h1 { font-size: 18px; text-transform: uppercase; }
                .header p { font-size: 13px; color: #64748b; }
                .client-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
                .client-box .name { font-size: 15px; font-weight: bold; }
                .paga { font-weight: bold; font-style: italic; }
                .status-box { font-size: 12px; font-weight: bold; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
                .status-paid { background: #d1fae5; color: #065f46; }
                .status-pending { background: #fef3c7; color: #92400e; }
                table { width: 100%; border-collapse: collapse; font-size: 11px; }
                th { text-align: left; background: #1e293b; color: white; padding: 8px 10px; text-transform: uppercase; font-size: 10px; }
                td { padding: 7px 10px; border-bottom: 1px solid #e2e8f0; }
                tr:nth-child(even) td { background: #f8fafc; }
                .amount-col { text-align: right; font-variant-numeric: tabular-nums; }
                .total-row { margin-top: 16px; display: flex; justify-content: flex-end; align-items: center; gap: 12px; border-top: 2px solid #1e293b; padding-top: 12px; }
                .total-label { font-size: 13px; font-weight: bold; text-transform: uppercase; color: #64748b; }
                .total-value { font-size: 22px; font-weight: bold; }
                .footer { margin-top: 30px; font-size: 10px; color: #94a3b8; text-align: center; border-top: 1px dashed #e2e8f0; padding-top: 10px; }
                @media print {
                    body { padding: 10mm; }
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

            <div id="no-print-actions" style="text-align:center; margin-top:24px;">
                <button onclick="window.print()" style="padding:10px 24px; background:#4f46e5; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Imprimir</button>
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
