import { estilosDeHoja, scriptDeAjuste } from './hojaDeImpresion';
import { fechaSinHora } from './fechaSinHora';

/**
 * El justificante de reembolso: el papel que firma el remitente cuando el
 * repartidor le entrega el dinero que cobró su cliente.
 *
 * Lo imprime el repartidor desde su pestaña Cuenta y, desde septiembre de 2026,
 * también la oficina desde la ficha del conductor, para cualquier día: si un
 * remitente reclama meses después el justificante de un reembolso, la oficina
 * lo saca sin tener que pedirle el móvil al repartidor.
 *
 * Cada línea de `items` es una entrada de `allReimbursementsDetail` tal como la
 * devuelve calculateDailyAccount (client, sender, date, amount, type, original).
 */

// Nombre comercial + CIF: el que firma conoce el negocio por su rótulo, no por
// la razón social.
const nombreComercial = (clients, clientName) => {
    if (!clients || !clientName) return { name: clientName || '', cif: '' };
    const clientObj = clients.find(c => (c.name || '').toLowerCase() === String(clientName).toLowerCase());
    if (clientObj) {
        return {
            name: clientObj.name || clientObj.legalName || clientName,
            cif: clientObj.cif ? ` (CIF: ${clientObj.cif})` : ''
        };
    }
    return { name: clientName, cif: '' };
};

// El remitente es quien recibe el dinero y firma, así que se busca en el envío
// si el cobro no lo trae. Los cobros viejos guardaron el literal 'N/A', que
// aquí vale como vacío.
const nombreDelRemitente = (item, clients, allShipments) => {
    const raw = item?.sender && item.sender !== 'N/A' ? item.sender : null;
    const shipmentId = item?.original?.shipmentId || item?.id;
    const ship = raw ? null : (allShipments || []).find(s => s.id === shipmentId);
    const name = raw || ship?.originName || ship?.client || '';
    if (!name) return '__________________________';
    const legal = nombreComercial(clients, name);
    return `${legal.name}${legal.cif}`;
};

// Una hoja de justificante, con QR para el escáner de la oficina. Es la misma
// tanto si se imprime suelto como en "Imprimir Todos".
export const hojaDelJustificante = (collection, { clients, allShipments } = {}) => {
    const legalInfo = nombreComercial(clients, collection.client);
    const shipmentId = collection.original?.shipmentId || collection.id?.replace('-reembolso', '') || collection.id || 'N/A';
    // La fecha del albarán, sin hora. Antes salía el reloj del móvil, así que
    // una reimpresión le ponía al papel una fecha distinta a la del envío.
    const fechaDelEnvio = fechaSinHora(collection.date || collection.original?.date);
    const importe = collection.amount || collection.amountDisplay?.replace('€', '').trim();
    return `
                  <div class="hoja"><div class="contenido">
                    <div class="header">
                        <div class="header-text">
                            <h1 class="title">SUMTRANS LOGISTICA</h1>
                            <p class="subtitle">Justificante de Reembolso</p>
                        </div>
                        <div class="qr-box">
                            <div class="qrcode" data-qr="COD:${shipmentId}"></div>
                            <p>${shipmentId}</p>
                        </div>
                    </div>

                    <div class="details">
                        <div class="row">
                            <span class="label">Fecha del envío:</span>
                            <span>${fechaDelEnvio}</span>
                        </div>
                         <div class="row">
                            <span class="label">ID Envío:</span>
                            <span>${shipmentId}</span>
                        </div>
                        <div class="row">
                            <span class="label">Cliente:</span>
                            <span>${legalInfo.name}${legalInfo.cif}</span>
                        </div>
                        <div class="row">
                            <span class="label">Recibe (Remitente):</span>
                            <span>${nombreDelRemitente(collection, clients, allShipments)}</span>
                        </div>
                         <div class="row">
                            <span class="label">Concepto:</span>
                            <span>${collection.type || 'Reembolso'}</span>
                        </div>

                        <div class="amount">
                            TOTAL: €${importe}
                        </div>
                    </div>

                    <div class="signature-box">
                        Firma y Sello del Cliente (Remitente)
                    </div>

                    <div class="footer">
                        Este documento justifica la entrega del importe recaudado al remitente.
                    </div>
                  </div></div>`;
};

// El documento entero de la ventana de impresión: un justificante por hoja.
//
// La hoja se dibuja en 80 mm con márgenes y sin tamaño de papel fijo, así se
// acomoda al A6 de la oficina aunque la impresora reserve los suyos. El lote es
// el suelto repetido, con un salto de página entre uno y otro.
export const documentoDeJustificantes = (items, { titulo = 'Justificantes de Reembolso', clients, allShipments } = {}) => `
            <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>${titulo}</title>
                    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
                    <style>
                        body { font-family: 'Arial', sans-serif; margin: 0 auto; }
${estilosDeHoja({ selector: '.hoja' })}
                        /* Cada justificante en su hoja: el salto va delante del segundo en
                           adelante, así el último no arrastra una página en blanco. */
                        .hoja + .hoja { page-break-before: always; break-before: page; }
                        /* El QR va arriba, lejos de la firma: abajo el cliente firmaba y sellaba
                           encima y el escáner de la oficina ya no lo leía (HAB-76, septiembre 2026). */
                        .header { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #333; padding-bottom: 6px; margin-bottom: 10px; }
                        .header-text { flex: 1; min-width: 0; }
                        .title { font-size: 16px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 12px; color: #666; }
                        .details { margin-bottom: 10px; }
                        .row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 4px; font-size: 12px; }
                        .row span:last-child { text-align: right; word-break: break-word; }
                        .label { font-weight: bold; flex-shrink: 0; }
                        .amount { font-size: 18px; font-weight: bold; text-align: right; margin-top: 8px; border-top: 1px dashed #ccc; padding-top: 8px; }
                        .signature-box { margin-top: 56px; border-top: 1px solid #000; padding-top: 4px; text-align: center; font-size: 10px; }
                        .qr-box { flex-shrink: 0; text-align: center; }
                        .qr-box img { display: block; }
                        .qr-box p { font-size: 8px; color: #999; margin: 2px 0 0 0; }
                        .footer { margin-top: 10px; font-size: 8px; text-align: center; color: #888; }
                        @media print {
                            body { width: 80mm; }
                            @page { margin: 6mm; }
                            button, #no-print-actions { display: none !important; }
                        }
                    </style>
                </head>
                <body>
${items.map(item => hojaDelJustificante(item, { clients, allShipments })).join('\n')}

                    <div id="no-print-actions" style="margin-top: 30px; text-align: center;">
                        <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%;">
                            VOLVER A LA APP
                        </button>
                    </div>

                    <script>
${scriptDeAjuste({ hoja: '.hoja', contenido: '.contenido' })}
                        window.onload = function() {
                            document.querySelectorAll('.qrcode').forEach(function(el) {
                                // 'H' aguanta un 30% del QR estropeado (arruga, tinta) y los
                                // cuadraditos de 4px siguen siendo legibles en un escaneo pequeño.
                                var qr = qrcode(0, 'H');
                                qr.addData(el.getAttribute('data-qr'));
                                qr.make();
                                el.innerHTML = qr.createImgTag(4, 2);
                            });
                            setTimeout(() => {
                                ajustarAlFolio();
                                window.print();
                            }, 500);
                        }
                        window.onafterprint = function() {
                            setTimeout(() => window.close(), 300);
                        };
                    </script>
                </body>
            </html>
        `;

/**
 * Abre la ventana de impresión con los justificantes, uno por hoja.
 * Devuelve false si no había nada que imprimir o el navegador bloqueó la ventana.
 */
export const abrirJustificantes = (items, opciones = {}) => {
    if (!items || items.length === 0) return false;
    const ventana = window.open('', '_blank');
    if (!ventana) return false;
    ventana.document.write(documentoDeJustificantes(items, opciones));
    ventana.document.close();
    return true;
};
