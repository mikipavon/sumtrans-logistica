import { estilosDeHoja, scriptDeAjuste } from './hojaDeImpresion';
import { datosDeFacturaSimplificada, mensajeDeFacturaSimplificada, EMPRESA, CIF, CORREO_FACTURAS } from './facturaSimplificada';
import { prepararEnvioConPdf } from './enviarFacturaSimplificada';

/**
 * Genera e imprime una Factura Simplificada en formato ticket (80mm).
 * Incluye desglose de Base + IVA 21% + Total.
 *
 * Va dentro de una hoja con la proporción de un folio (ver hojaDeImpresion) para
 * que salga siempre en una sola página, tenga una línea o veinte.
 *
 * El botón de WhatsApp manda la factura al móvil del destinatario con un enlace
 * al PDF (ver enviarFacturaSimplificada). Si el PDF no se puede subir, sale el
 * mensaje de texto de siempre.
 */
export const printSimplifiedInvoice = (shipmentData) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const datos = datosDeFacturaSimplificada(shipmentData);
    const { ref, fecha: date, base, iva, total, movilWhatsApp: telefonoWhatsApp } = datos;
    const { nombre: clientName, direccion: clientAddress, poblacion: clientCity, cp: clientZip, telefono: clientPhone } = datos.cliente;

    const articlesHtml = datos.lineas.map(l => l.importe === null
        ? `<tr><td colspan="2">${l.texto}</td></tr>`
        : `<tr><td>${l.texto}</td><td style="text-align: right">${l.importe.toFixed(2)} €</td></tr>`
    ).join('');

    // Texto sin PDF: el de reserva si la ventana no tiene quien le suba el PDF.
    const waText = encodeURIComponent(mensajeDeFacturaSimplificada(datos))
        .replace(/'/g, '%27'); // va dentro de una cadena '...' del script de la ventana

    printWindow.document.write(`
        <html>
            <head>
                <meta charset="UTF-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>Factura Simplificada ${ref}</title>
                <style>
                    body {
                        font-family: 'Courier New', Courier, monospace;
                        margin: 0 auto;
                        color: #000;
                        line-height: 1.25;
                    }
${estilosDeHoja()}

                    .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 6px; }
                    .logo { font-size: 13px; font-weight: bold; margin: 0; }
                    .cif { font-size: 10px; margin: 1px 0; }
                    .doc-type { font-size: 11px; text-transform: uppercase; font-weight: bold; margin-top: 3px; border: 2px solid #000; display: inline-block; padding: 2px 8px; letter-spacing: 1px; }

                    .info-row { display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 1px; }
                    .label { font-weight: bold; }

                    .section { margin-top: 5px; border-top: 1px solid #ccc; padding-top: 4px; }
                    .section-title { font-size: 10px; font-weight: bold; text-decoration: underline; margin-bottom: 2px; }
                    .client-data { font-size: 10px; margin-bottom: 2px; }

                    .items-table { width: 100%; border-collapse: collapse; margin-top: 5px; font-size: 10px; }
                    .items-table th { text-align: left; border-bottom: 1px solid #000; padding: 2px 0; }
                    .items-table td { padding: 2px 0; }

                    .totals { margin-top: 6px; border-top: 1px solid #000; padding-top: 4px; font-size: 10px; }
                    .total-row { display: flex; justify-content: space-between; margin-bottom: 1px; }
                    .grand-total { font-size: 13px; font-weight: bold; border-top: 2px double #000; padding-top: 4px; margin-top: 4px; display: flex; justify-content: space-between; }

                    .email-box { margin-top: 8px; border: 1px dashed #000; padding: 5px; text-align: center; font-size: 9px; }
                    .email-box strong { font-size: 10px; }

                    .footer { margin-top: 8px; font-size: 9px; text-align: center; color: #555; border-top: 1px dashed #ccc; padding-top: 4px; }

                    .actions { margin-top: 20px; text-align: center; }
                    .actions button { display: block; width: 100%; padding: 12px; margin-bottom: 8px; border: none; border-radius: 8px; font-weight: bold; font-size: 14px; cursor: pointer; }
                    .btn-whatsapp { background: #25D366; color: white; }
                    .btn-print { background: #3b82f6; color: white; }
                    .btn-close { background: #64748b; color: white; }
                    .wa-box { text-align: left; margin-bottom: 8px; font-family: system-ui, sans-serif; }
                    .wa-box label { display: block; font-size: 12px; font-weight: bold; color: #334155; margin-bottom: 4px; }
                    .wa-box input { width: 100%; box-sizing: border-box; padding: 12px; font-size: 18px; font-weight: bold; border: 2px solid #25D366; border-radius: 8px; }
                    .wa-aviso { color: #c2410c; font-size: 12px; font-weight: bold; margin-top: 4px; min-height: 14px; }
                    .btn-whatsapp:disabled { opacity: .6; cursor: wait; }

                    @media print {
                        body { width: 80mm; }
                        @page { margin: 6mm; }
                        .actions, #no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
              <div id="hoja"><div id="contenido">
                <div class="header">
                    <div class="logo">${EMPRESA}</div>
                    <div class="cif">CIF: ${CIF}</div>
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
                    Solicítela en 📧 <strong>${CORREO_FACTURAS}</strong>
                </div>

                <div class="footer">
                    <div style="margin-bottom: 3px; text-align: center;">
                        <img
                            src="https://bwipjs-api.metafloor.com/?bcid=qrcode&text=FS-${ref}&scale=3"
                            alt="QR"
                            style="width: 58px; height: 58px; display: block; margin: 0 auto 2px auto;"
                        />
                        <div style="font-weight: bold; font-size: 9px; letter-spacing: 1px;">FS-${ref}</div>
                    </div>
                    Gracias por confiar en SUMTRANS.
                </div>
              </div></div>

                <div class="actions" id="no-print">
                    <div class="wa-box">
                        <label for="wa-tel">WhatsApp del destinatario${clientName !== '—' ? ` · ${clientName}` : ''}</label>
                        <input id="wa-tel" type="tel" inputmode="tel" autocomplete="off"
                               placeholder="Sin móvil: escríbelo aquí" value="${telefonoWhatsApp}" />
                        <div id="wa-aviso" class="wa-aviso"></div>
                    </div>
                    <button id="wa-boton" class="btn-whatsapp" onclick="enviarPorWhatsApp()">
                        📲 Enviar por WhatsApp
                    </button>
                    <button class="btn-print" onclick="window.print()">
                        🖨️ Imprimir
                    </button>
                    <button class="btn-close" onclick="window.close()">
                        ← Volver
                    </button>
                </div>

                <script>
${scriptDeAjuste()}
                    // Al número del recuadro; si está vacío no se abre un chat sin
                    // destinatario, se pide el móvil. Con el PDF se encarga la app
                    // (__enviarFactura, lo pone quien abre esta ventana); sin ella,
                    // sólo el texto.
                    function enviarPorWhatsApp() {
                        var campo = document.getElementById('wa-tel');
                        var aviso = document.getElementById('wa-aviso');
                        var num = (campo.value || '').replace(/[^0-9]/g, '');
                        if (num.length === 9 && /^[67]/.test(num)) num = '34' + num;
                        if (num.length < 9) {
                            aviso.textContent = 'Escribe el móvil del destinatario';
                            campo.focus();
                            return;
                        }
                        if (/^(34)?[89][0-9]{8}$/.test(num)) {
                            aviso.textContent = 'Ese es un fijo, no tiene WhatsApp';
                            campo.focus();
                            return;
                        }
                        aviso.textContent = '';
                        if (typeof window.__enviarFactura === 'function') {
                            window.__enviarFactura(num);
                            return;
                        }
                        window.open('https://wa.me/' + num + '?text=${waText}', '_blank');
                    }
                    // Aquí no se imprime solo: el botón de Imprimir puede pulsarse en
                    // cualquier momento, así que la hoja se cuadra al cargar y otra vez
                    // justo antes de imprimir.
                    window.onload = function() {
                        ajustarAlFolio();
                        var campo = document.getElementById('wa-tel');
                        if (campo && !campo.value) campo.focus();
                    };
                    window.onbeforeprint = function() { ajustarAlFolio(); };
                </script>
            </body>
        </html>
    `);
    printWindow.document.close();

    // Después del close: document.write en una ventana nueva puede cambiarle el
    // objeto window, y lo puesto antes se perdería.
    printWindow.__enviarFactura = prepararEnvioConPdf(datos, printWindow);
};
