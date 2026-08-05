const parseAmount = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/[^0-9,.-]+/g, "");
    const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
};

const formatMonthLabel = (monthStr) => {
    if (!monthStr) return '';
    const [y, m] = monthStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, 1);
    const label = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
};

/**
 * Imprime/genera un detalle de presupuesto para entregar al cliente: lista de
 * albaranes acumulados en el mes con su importe y el total.
 * @param {Object} clientData - { clientName, shipments, totalAmount }
 * @param {string} month - "YYYY-MM"
 * @param {Object} [status] - { driverName, isCollected, liquidatedAt } — si ya se cerró el mes, se muestra el estado del cobro
 */
export const printBudgetSummary = (clientData, month, status = null) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = (clientData.shipments || []).map(s => {
        const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-ES') : (s.date || '—');
        const dest = s.destinationName || (s.destinationCity ? `${s.destinationCity} (${s.destinationZip || ''})` : (s.destination || '—'));
        const desc = Array.isArray(s.articles) && s.articles.length > 0
            ? s.articles.map(a => a.name || a.description).filter(Boolean).join(', ')
            : (s.observations || 'Portes');
        return { id: s.id, date, dest, desc, amount: parseAmount(s.amount) };
    });

    const total = clientData.totalAmount != null ? clientData.totalAmount : rows.reduce((sum, r) => sum + r.amount, 0);

    const statusHtml = status ? `
        <div class="status-box ${status.isCollected ? 'status-paid' : 'status-pending'}">
            ${status.isCollected ? '✓ COBRADO' : '⏳ PENDIENTE DE COBRO'} — Asignado a ${status.driverName || 'sin asignar'}
            ${status.liquidatedAt ? ` · Cerrado el ${new Date(status.liquidatedAt).toLocaleDateString('es-ES')}` : ''}
        </div>
    ` : '';

    printWindow.document.write(`
        <html>
        <head>
            <title>Detalle Presupuesto - ${clientData.clientName} - ${month}</title>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, sans-serif; color: #1e293b; padding: 20mm; max-width: 210mm; margin: 0 auto; }
                .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e293b; padding-bottom: 12px; margin-bottom: 20px; }
                .logo { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; }
                .doc-title { text-align: right; }
                .doc-title h1 { font-size: 16px; text-transform: uppercase; }
                .doc-title p { font-size: 12px; color: #64748b; margin-top: 2px; }
                .client-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 16px; }
                .client-box .name { font-size: 15px; font-weight: bold; }
                .client-box .meta { font-size: 12px; color: #64748b; margin-top: 2px; }
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
                <div class="logo">SUMTRANS LOGISTICA</div>
                <div class="doc-title">
                    <h1>Detalle de Presupuesto</h1>
                    <p>${formatMonthLabel(month)}</p>
                </div>
            </div>

            <div class="client-box">
                <div class="name">${clientData.clientName}</div>
                <div class="meta">${rows.length} envío${rows.length !== 1 ? 's' : ''} acumulado${rows.length !== 1 ? 's' : ''} sin IVA</div>
            </div>

            ${statusHtml}

            <table>
                <thead>
                    <tr>
                        <th>Nº Albarán</th>
                        <th>Fecha</th>
                        <th>Destino</th>
                        <th>Descripción</th>
                        <th class="amount-col">Importe</th>
                    </tr>
                </thead>
                <tbody>
                    ${rows.map(r => `
                        <tr>
                            <td>${r.id}</td>
                            <td>${r.date}</td>
                            <td>${r.dest}</td>
                            <td>${r.desc}</td>
                            <td class="amount-col">${r.amount.toFixed(2)} €</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>

            <div class="total-row">
                <span class="total-label">Total</span>
                <span class="total-value">${total.toFixed(2)} €</span>
            </div>

            <div class="footer">Documento generado el ${new Date().toLocaleDateString('es-ES')} — Sin IVA (Presupuesto)</div>

            <div id="no-print-actions" style="text-align:center; margin-top:24px;">
                <button onclick="window.print()" style="padding:10px 24px; background:#4f46e5; color:white; border:none; border-radius:6px; font-weight:bold; cursor:pointer;">Imprimir</button>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
};
