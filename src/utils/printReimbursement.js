export const printReimbursementReceipt = (shipment, clientInfo) => {
    if (!shipment) return;

    // Helper to format currency
    const parseAmount = (val) => {
        if (!val) return '0.00';
        if (typeof val === 'number') return val.toFixed(2);
        const str = val.toString().replace(/[^0-9,.-]+/g, "");
        const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
        const num = parseFloat(normalized);
        return isNaN(num) ? '0.00' : num.toFixed(2);
    };

    const legalName = clientInfo?.legalName || clientInfo?.name || shipment.client || shipment.originName || '';
    const cif = clientInfo?.cif ? ` (CIF: ${clientInfo.cif})` : '';
    const shipmentId = shipment.id || 'N/A';
    const amount = parseAmount(shipment.codAmount);
    const qrData = `COD:${shipmentId}`;
    
    // Si queremos mostrar quién recibe el dinero (Remitente)
    const receiver = shipment.originName || shipment.client || '__________________________';

    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
        <head>
            <title>Justificante de Reembolso ${shipmentId}</title>
            <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
            <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body { font-family: Arial, sans-serif; background: #f0f0f0; }
                .page {
                    width: 105mm; height: 148mm; /* A6 Size */
                    background: white;
                    margin: 0 auto;
                    padding: 4mm;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 0 5px rgba(0,0,0,0.1);
                }
                .receipt-card {
                    flex: 1;
                    border: 2px dashed #ccc;
                    padding: 8mm;
                    display: flex; flex-direction: column;
                    justify-content: space-between;
                }
                .card-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
                .card-header h2 { font-size: 18px; margin: 0; font-weight: bold; }
                .card-header p { font-size: 12px; color: #666; margin: 4px 0 0; }
                .card-details { margin-bottom: 10px; }
                .card-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
                .lbl { font-weight: bold; }
                .mono { font-family: monospace; font-weight: bold; font-size: 14px; }
                .card-amount { font-size: 24px; font-weight: bold; text-align: right; border-top: 1px dashed #aaa; padding-top: 10px; margin-bottom: 12px; }
                .card-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; }
                .card-signature { flex: 1; margin-right: 15px; text-align: center; }
                .sig-line { border-top: 1px solid #000; margin-bottom: 4px; margin-top: 40px; }
                .card-signature span { font-size: 10px; }
                .card-qr { text-align: center; }
                .card-qr p { font-size: 10px; color: #999; margin-top: 4px; }
                .card-footer { font-size: 10px; color: #999; text-align: center; margin-top: 12px; }
                .no-print { text-align: center; padding: 20px; }
                
                @page { margin: 0; }
                @media print {
                    body { background: white; margin: 0; padding: 0; }
                    .page { 
                        margin: 0; 
                        padding: 4mm;
                        box-shadow: none; 
                        width: 105mm; 
                        height: 148mm; 
                    }
                    .no-print { display: none !important; }
                }
            </style>
        </head>
        <body>
            <div class="page">
                <div class="receipt-card">
                    <div class="card-header">
                        <h2>SUMTRANS LOGISTICA</h2>
                        <p>Justificante de Reembolso</p>
                    </div>
                    <div class="card-details">
                        <div class="card-row"><span class="lbl">Fecha:</span><span>${new Date().toLocaleDateString('es-ES')}</span></div>
                        <div class="card-row"><span class="lbl">ID Envío:</span><span class="mono">${shipmentId}</span></div>
                        <div class="card-row"><span class="lbl">Cliente:</span><span>${legalName}${cif}</span></div>
                        <div class="card-row"><span class="lbl">Recibe:</span><span>${receiver}</span></div>
                    </div>
                    <div class="card-amount">TOTAL: €${amount}</div>
                    <div class="card-bottom">
                        <div class="card-signature">
                            <div class="sig-line"></div>
                            <span>Firma y Sello</span>
                        </div>
                        <div class="card-qr" id="qrcode-container"></div>
                    </div>
                    <p class="card-footer">Justifica la entrega del importe recaudado al remitente.</p>
                </div>
            </div>
            
            <div class="no-print">
                <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
                    VOLVER A LA APP
                </button>
            </div>
            <script>
                window.onload = function() {
                    var qr = qrcode(0, 'M');
                    qr.addData('${qrData}');
                    qr.make();
                    document.getElementById('qrcode-container').innerHTML = qr.createImgTag(3, 4) + '<p>${shipmentId}</p>';
                    setTimeout(function() { window.print(); }, 600);
                };
                window.onafterprint = function() { setTimeout(function() { window.close(); }, 300); };
            <\/script>
        </body>
        </html>
    `);
    printWindow.document.close();
};
