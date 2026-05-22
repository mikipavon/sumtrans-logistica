/**
 * Genera e imprime una Factura Simplificada en formato ticket (80mm).
 * Incluye desglose de Base + IVA 21% + Total.
 */
export const printSimplifiedInvoice = (shipmentData) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const date = shipmentData.date || new Date().toLocaleDateString('es-ES');
    const ref = shipmentData.id || 'NUEVO';

    const parseAmt = (val) => {
        if (!val) return 0;
        if (typeof val === 'number') return val;
        const str = val.toString().replace(/[^0-9,.-]+/g, '');
        const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
        const num = parseFloat(normalized);
        return isNaN(num) ? 0 : num;
    };

    const base = parseAmt(shipmentData.amount);
    const iva = +(base * 0.21).toFixed(2);
    const total = +(base + iva).toFixed(2);

    const articlesHtml = (shipmentData.articles && shipmentData.articles.length > 0)
        ? shipmentData.articles.map(art => `
            <tr>
                <td>${art.quantity || 1}x ${art.name || 'Servicio'}</td>
                <td style="text-align: right">${parseAmt(art.price).toFixed(2)} €</td>
            </tr>
        `).join('')
        : `<tr><td>SERV. TRANSPORTE</td><td style="text-align: right">${base.toFixed(2)} €</td></tr>`;

    const clientName = shipmentData.destinationName || shipmentData.client || '—';
    const clientAddress = shipmentData.destinationAddress || '—';
    const clientCity = shipmentData.destinationCity || '';
    const clientZip = shipmentData.destinationZip || '';
    const clientPhone = shipmentData.destinationPhone || '';

    // WhatsApp share text
    const waText = encodeURIComponent(
        `📄 *FACTURA SIMPLIFICADA*\n` +
        `SUMTRANS LOGISTICA S.L.\n` +
        `CIF: B56131717\n` +
        `Ref: ${ref}\n` +
        `Fecha: ${date}\n\n` +
        `Cliente: ${clientName}\n\n` +
        `Base Imponible: ${base.toFixed(2)}€\n` +
        `IVA 21%: ${iva.toFixed(2)}€\n` +
        `━━━━━━━━━━━━\n` +
        `*TOTAL: ${total.toFixed(2)}€*\n\n` +
        `Para solicitar factura completa:\n📧 info@sumtransportes.com`
    );

    printWindow.document.write(`
        <html>
            <head>
                <title>Factura Simplificada ${ref}</title>
                <style>
                    body { 
                        font-family: 'Courier New', Courier, monospace; 
                        padding: 10px; 
                        max-width: 80mm; 
                        margin: 0 auto; 
                        color: #000;
                        line-height: 1.3;
                    }
                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 8px; margin-bottom: 10px; }
                    .logo { font-size: 14px; font-weight: bold; margin: 0; }
                    .cif { font-size: 10px; margin: 2px 0; }
                    .doc-type { font-size: 11px; text-transform: uppercase; font-weight: bold; margin-top: 4px; border: 2px solid #000; display: inline-block; padding: 3px 8px; letter-spacing: 1px; }
                    
                    .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
                    .label { font-weight: bold; }
                    
                    .section { margin-top: 8px; border-top: 1px solid #ccc; padding-top: 5px; }
                    .section-title { font-size: 10px; font-weight: bold; text-decoration: underline; margin-bottom: 3px; }
                    .client-data { font-size: 11px; margin-bottom: 5px; }
                    
                    .items-table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 11px; }
                    .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 2px 0; }
                    .items-table td { padding: 3px 0; }
                    
                    .totals { margin-top: 10px; border-top: 1px solid #000; padding-top: 5px; font-size: 11px; }
                    .total-row { display: flex; justify-content: space-between; margin-bottom: 2px; }
                    .grand-total { font-size: 14px; font-weight: bold; border-top: 2px double #000; padding-top: 5px; margin-top: 5px; display: flex; justify-content: space-between; }
                    
                    .email-box { margin-top: 15px; border: 1px dashed #000; padding: 8px; text-align: center; font-size: 9px; }
                    .email-box strong { font-size: 10px; }
                    
                    .footer { margin-top: 15px; font-size: 9px; text-align: center; color: #555; border-top: 1px dashed #ccc; padding-top: 5px; }
                    
                    .actions { margin-top: 20px; text-align: center; }
                    .actions button { display: block; width: 100%; padding: 12px; margin-bottom: 8px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; }
                    .btn-whatsapp { background: #25D366; color: white; }
                    .btn-print { background: #3b82f6; color: white; }
                    .btn-close { background: #64748b; color: white; }
                    
                    @media print {
                        body { width: 80mm; }
                        @page { margin: 0; }
                        .actions, #no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">SUMTRANS LOGISTICA S.L.</div>
                    <div class="cif">CIF: B56131717</div>
                    <div class="doc-type">FACTURA SIMPLIFICADA</div>
                </div>
                
                <div class="info-row">
                    <span class="label">REF:</span>
                    <span>FS-${ref}</span>
                </div>
                <div class="info-row">
                    <span class="label">FECHA:</span>
                    <span>${date}</span>
                </div>

                <div class="section">
                    <div class="section-title">DATOS CLIENTE</div>
                    <div class="client-data">
                        <strong>${clientName}</strong><br/>
                        ${clientAddress}${clientCity ? '<br/>' + clientCity : ''}${clientZip ? ' ' + clientZip : ''}<br/>
                        ${clientPhone || ''}
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>CONCEPTO</th>
                            <th style="text-align: right">IMPORTE</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${articlesHtml}
                    </tbody>
                </table>

                <div class="totals">
                    <div class="total-row">
                        <span>Base Imponible:</span>
                        <span>${base.toFixed(2)} €</span>
                    </div>
                    <div class="total-row">
                        <span>IVA 21%:</span>
                        <span>${iva.toFixed(2)} €</span>
                    </div>
                    <div class="grand-total">
                        <span>TOTAL:</span>
                        <span>${total.toFixed(2)} €</span>
                    </div>
                </div>

                <div class="email-box">
                    <strong>¿Necesita factura completa?</strong><br/>
                    Solicítela en:<br/>
                    📧 <strong>info@sumtransportes.com</strong>
                </div>
                
                <div class="footer">
                    <div style="margin-bottom: 10px; text-align: center;">
                        <img 
                            src="https://bwipjs-api.metafloor.com/?bcid=qrcode&text=FS-${ref}&scale=3" 
                            alt="QR"
                            style="width: 80px; height: 80px; display: block; margin: 0 auto 3px auto;"
                        />
                        <div style="font-weight: bold; font-size: 9px; letter-spacing: 1px;">FS-${ref}</div>
                    </div>
                    Gracias por confiar en SUMTRANS.
                </div>

                <div class="actions" id="no-print">
                    <button class="btn-whatsapp" onclick="window.open('https://wa.me/?text=${waText}', '_blank')">
                        📲 Enviar por WhatsApp
                    </button>
                    <button class="btn-print" onclick="window.print()">
                        🖨️ Imprimir
                    </button>
                    <button class="btn-close" onclick="window.close()">
                        ← Volver
                    </button>
                </div>
            </body>
        </html>
    `);
    printWindow.document.close();
};
