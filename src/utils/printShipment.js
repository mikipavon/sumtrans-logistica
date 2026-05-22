export const printShipmentTicket = (shipment) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const isRecogida = shipment.type === 'Recogida';
    const date = shipment.date || new Date().toLocaleDateString('es-ES');
    
    // Formatting amounts
    const parseAmount = (val) => {
        if (!val) return '0.00';
        if (typeof val === 'number') return val.toFixed(2);
        const str = val.toString().replace(/[^0-9,.-]+/g, "");
        const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
        const num = parseFloat(normalized);
        return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    const amountStr = String(shipment.amount).toLowerCase() === 'tarifa' ? 'TARIFA' : `${parseAmount(shipment.amount)} €`;

    printWindow.document.write(`
        <html>
            <head>
                <title>Albarán ${shipment.id}</title>
                <style>
                    body { 
                        font-family: 'Courier New', Courier, monospace; 
                        padding: 10px; 
                        max-width: 80mm; 
                        margin: 0 auto; 
                        color: #000;
                        line-height: 1.2;
                    }
                    .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 10px; }
                    .logo { font-size: 16px; font-weight: bold; margin: 0; }
                    .doc-type { font-size: 12px; text-transform: uppercase; font-weight: bold; margin-top: 4px; border: 1px solid #000; display: inline-block; padding: 2px 5px; }
                    
                    .info-row { display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 2px; }
                    .label { font-weight: bold; }
                    
                    .section { margin-top: 10px; border-top: 1px solid #eee; padding-top: 5px; }
                    .section-title { font-size: 10px; font-weight: bold; text-decoration: underline; margin-bottom: 3px; }
                    .address-data { font-size: 11px; margin-bottom: 8px; }
                    
                    .items-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
                    .items-table th { text-align: left; border-bottom: 1px solid #000; }
                    .items-table td { padding: 3px 0; }
                    
                    .total-box { margin-top: 10px; border-top: 1px double #000; padding-top: 5px; text-align: right; font-weight: bold; font-size: 13px; }
                    
                    .signature-box { margin-top: 40px; border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; height: 50px; }
                    .footer { margin-top: 20px; font-size: 9px; text-align: center; color: #555; border-top: 1px dashed #ccc; padding-top: 5px; }
                    
                    @media print {
                        body { width: 80mm; }
                        @page { margin: 0; }
                        button, #no-print-actions { display: none !important; }
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">SUMTRANS LOGISTICA</div>
                    <div class="doc-type">${isRecogida ? 'JUSTIFICANTE RECOGIDA' : 'ALBARÁN DE ENTREGA'}</div>
                </div>
                
                <div class="info-row">
                    <span class="label">REF:</span>
                    <span>${shipment.id}</span>
                </div>
                <div class="info-row">
                    <span class="label">FECHA:</span>
                    <span>${date}</span>
                </div>

                <div class="section">
                    <div class="section-title">REMITENTE</div>
                    <div class="address-data">
                        <strong>${shipment.originName || shipment.client}</strong><br/>
                        ${shipment.originAddress || shipment.origin || shipment.address || '—'}<br/>
                        ${shipment.originPhone || '—'}
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">DESTINATARIO (ENTREGA)</div>
                    <div class="address-data">
                        <strong>${shipment.destinationName || shipment.client}</strong><br/>
                        ${shipment.destinationAddress || shipment.destination || shipment.address || '—'}<br/>
                        ${shipment.destinationPhone || '—'}
                    </div>
                </div>

                <table class="items-table">
                    <thead>
                        <tr>
                            <th>CONCEPTO</th>
                            <th style="text-align: right">${shipment.hasCod ? 'IMP.' : ''}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shipment.articles && shipment.articles.length > 0 ? 
                            shipment.articles.map(art => `
                            <tr>
                                <td>${art.quantity}x ${art.name}</td>
                                <td style="text-align: right"></td>
                            </tr>
                            `).join('') :
                            `
                            <tr>
                                <td>SERV. TRANSPORTE (${shipment.packages || 1} Bultos)</td>
                                <td style="text-align: right"></td>
                            </tr>
                            `
                        }
                        ${shipment.hasCod ? `
                        <tr>
                            <td>REEMBOLSO (C.O.D.)</td>
                            <td style="text-align: right">${parseAmount(shipment.codAmount)} €</td>
                        </tr>` : ''}
                    </tbody>
                </table>

                ${shipment.hasCod ? `
                <div class="total-box">
                    TOTAL REEMBOLSO: ${parseAmount(shipment.codAmount)} €
                </div>` : ''}

                ${shipment.observations ? `
                <div class="section">
                    <div class="section-title">OBSERVACIONES</div>
                    <div style="font-size: 10px; font-style: italic;">${shipment.observations}</div>
                </div>` : ''}

                <div class="signature-box">
                    FIRMA Y SELLO DEL CLIENTE
                </div>
                
                <div class="footer">
                    <!-- Código QR de Referencia para Escaneo Rápido -->
                    <div style="margin-bottom: 15px; text-align: center;">
                        <img 
                            src="https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${shipment.id}&scale=3" 
                            alt="QR Code"
                            style="width: 100px; height: 100px; display: block; margin: 0 auto 5px auto;"
                        />
                        <div style="font-weight: bold; font-size: 10px; letter-spacing: 2px;">${shipment.id}</div>
                    </div>
                    Este documento justifica el estado del envío.<br/>
                    Gracias por su confianza.
                </div>

                <div id="no-print-actions" style="margin-top: 30px; text-align: center;">
                    <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%;">
                        VOLVER A LA APP
                    </button>
                </div>

                <script>
                    window.onload = function() { 
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                    window.onafterprint = function() {
                        setTimeout(() => window.close(), 300);
                    };
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();
};
