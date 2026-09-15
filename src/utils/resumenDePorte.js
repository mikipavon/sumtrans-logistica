import { estilosDeHoja, scriptDeAjuste } from './hojaDeImpresion';
import { fechaSinHora } from './fechaSinHora';
import { parseAmount } from './accountLogic';

/**
 * El ticket "Resumen de Porte": los portes cobrados en mano en el día, que el
 * repartidor imprime desde su pestaña Cuenta para cuadrar la caja.
 *
 * Desde septiembre de 2026 la oficina saca el mismo ticket desde el desglose
 * de caja de la ficha del conductor, para cualquier día. Antes el administrador
 * tenía otro papel distinto (la liquidación en PDF) y no cuadraba a ojo con el
 * del repartidor; ahora los dos salen de esta plantilla.
 *
 * Si ese día hay facturas simplificadas (cobros con IVA), salen en una segunda
 * hoja aparte, con su base, su IVA y su total: son dinero de otra caja y no se
 * mezclan con los cobros de porte en el mismo papel.
 *
 * Cada línea de `items` es una entrada de `allPorteDetail` tal como la devuelve
 * calculateDailyAccount (date, sender, receiver, payer, sourceTitle, amount), y
 * cada una de `facturasSimplificadas` una de `allSimplifiedInvoiceDetail`
 * (id, client, base, iva, amount).
 */

// Razón social del cliente, que es como sale en el resumen de porte.
const nombreLegal = (clients, clientName) => {
    if (!clients || !clientName) return clientName || '';
    const clientObj = clients.find(c => (c.name || '').toLowerCase() === String(clientName).toLowerCase());
    return clientObj ? (clientObj.legalName || clientObj.name || clientName) : clientName;
};

// Una fila por porte; el que paga va subrayado y en negrita.
export const filaDelPorte = (item, { clients } = {}) => {
    const senderLegal = nombreLegal(clients, item.sender);
    const receiverLegal = nombreLegal(clients, item.receiver);
    const displaySender = item.payer === 'sender' ? `<u><b>${senderLegal}</b></u>` : senderLegal;
    const displayReceiver = item.payer === 'receiver' ? `<u><b>${receiverLegal}</b></u>` : receiverLegal;
    return `
            <tr>
                <td>${fechaSinHora(item.date)} ${displaySender} - ${displayReceiver}</td>
                <td>${item.sourceTitle || ''}</td>
                <td style="text-align:right">€${parseAmount(item.amount).toFixed(2)}</td>
            </tr>
        `;
};

const cabecera = (titulo, subtitulo, { driver, fecha }) => {
    const nombre = driver?.name || 'Conductor';
    const codigo = driver?.id != null ? ` (DRV-${driver.id})` : '';
    return `
                    <div class="header">
                        <h1 class="title">${titulo}</h1>
                        <p class="subtitle">${subtitulo}</p>
                    </div>

                    <div class="info">
                        <strong>Conductor:</strong> ${nombre}${codigo}<br/>
                        <strong>Fecha:</strong> ${fecha.toLocaleDateString()}
                    </div>
`;
};

const pie = () => `
                    <div class="footer">
                        Generado: ${new Date().toLocaleString()}
                    </div>
`;

// La hoja de los cobros de porte.
export const hojaDeCobros = (items, { driver, fecha, clients, total } = {}) => {
    const lista = items || [];
    const porteRows = lista.map(item => filaDelPorte(item, { clients })).join('');
    // El total es el de la Cuenta (collectedPorte) si lo pasan; si no, la suma de las filas.
    const totalPorte = total != null ? parseAmount(total) : lista.reduce((suma, item) => suma + parseAmount(item.amount), 0);
    return `
                  <div class="hoja"><div class="contenido">
${cabecera('Resumen de Porte', 'Solo Clientes Habituales', { driver, fecha })}
                    <table>
                        <thead>
                            <tr><th>Cliente</th><th>Concepto</th><th>Importe</th></tr>
                        </thead>
                        <tbody>
                            ${porteRows || '<tr><td colspan="3" style="text-align:center">Sin cobros de porte hoy</td></tr>'}
                        </tbody>
                    </table>

                    <div class="total">
                        TOTAL PORTE: €${totalPorte.toFixed(2)}
                    </div>
${pie()}
                  </div></div>
`;
};

// La hoja de las facturas simplificadas, con base e IVA desglosados.
export const hojaDeFacturasSimplificadas = (facturas, { driver, fecha, total } = {}) => {
    const lista = facturas || [];
    const filas = lista.map(item => `
            <tr>
                <td>${item.id || ''} ${item.client || ''}</td>
                <td style="text-align:right">€${parseAmount(item.base).toFixed(2)}</td>
                <td style="text-align:right">€${parseAmount(item.iva).toFixed(2)}</td>
                <td style="text-align:right"><b>€${parseAmount(item.amount).toFixed(2)}</b></td>
            </tr>
        `).join('');
    const totalBase = lista.reduce((suma, item) => suma + parseAmount(item.base), 0);
    const totalIva = lista.reduce((suma, item) => suma + parseAmount(item.iva), 0);
    const totalFinal = total != null ? parseAmount(total) : lista.reduce((suma, item) => suma + parseAmount(item.amount), 0);
    return `
                  <div class="hoja"><div class="contenido">
${cabecera('Facturas Simplificadas', 'Cobros con IVA', { driver, fecha })}
                    <table>
                        <thead>
                            <tr><th>Ref. / Cliente</th><th style="text-align:right">Base</th><th style="text-align:right">IVA 21%</th><th style="text-align:right">Total</th></tr>
                        </thead>
                        <tbody>
                            ${filas}
                        </tbody>
                    </table>

                    <div class="subtotales">
                        <div><span>Base imponible:</span><span>€${totalBase.toFixed(2)}</span></div>
                        <div><span>IVA 21%:</span><span>€${totalIva.toFixed(2)}</span></div>
                    </div>
                    <div class="total">
                        TOTAL FACTURAS: €${totalFinal.toFixed(2)}
                    </div>
${pie()}
                  </div></div>
`;
};

/**
 * El documento entero de la ventana de impresión: la hoja de cobros y, si hay
 * facturas simplificadas, una segunda hoja con ellas.
 * `driver` es la ficha del conductor (name, id), `fecha` el día del resumen,
 * `total` el collectedPorte de la Cuenta y `totalFacturas` su
 * collectedSimplifiedInvoices (si no vienen, se suman las filas).
 */
export const documentoDeResumenPorte = (items, { driver, fecha = new Date(), clients, total, facturasSimplificadas, totalFacturas } = {}) => {
    const hojas = [hojaDeCobros(items, { driver, fecha, clients, total })];
    if (facturasSimplificadas && facturasSimplificadas.length > 0) {
        hojas.push(hojaDeFacturasSimplificadas(facturasSimplificadas, { driver, fecha, total: totalFacturas }));
    }
    return `
                <html>
                <head>
                    <meta charset="UTF-8" />
                    <meta name="viewport" content="width=device-width, initial-scale=1" />
                    <title>Resumen Porte del Día</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; margin: 0 auto; }
${estilosDeHoja({ ancho: '105mm', relleno: '5mm', selector: '.hoja' })}
                        /* Cada hoja en su página: el salto va delante de la segunda en
                           adelante, así la última no arrastra una página en blanco. */
                        .hoja + .hoja { page-break-before: always; break-before: page; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 10px; }
                        .title { font-size: 14px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 10px; color: #666; }
                        .info { font-size: 11px; margin-bottom: 6px; }
                        table { width: 100%; font-size: 10px; border-collapse: collapse; }
                        th { text-align: left; border-bottom: 1px solid #ccc; padding: 2px 0; }
                        td { padding: 1px 0; border-bottom: 1px dashed #eee; line-height: 1.15; }
                        .subtotales { font-size: 10px; margin-top: 6px; }
                        .subtotales div { display: flex; justify-content: space-between; }
                        .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 6px; border-top: 2px solid #333; padding-top: 6px; }
                        .footer { margin-top: 8px; font-size: 8px; text-align: center; color: #888; }
                        @media print {
                            body { width: 105mm; }
                            @page { margin: 0; }
                            button, #no-print-actions { display: none !important; }
                        }
                    </style>
                </head>
                <body>
${hojas.join('\n')}
                    <div id="no-print-actions" style="margin-top: 30px; text-align: center;">
                        <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%;">
                            VOLVER A LA APP
                        </button>
                    </div>

                    <script>
${scriptDeAjuste({ hoja: '.hoja', contenido: '.contenido' })}
                        window.onload = function() {
                            setTimeout(() => {
                                ajustarAlFolio();
                                window.print();
                            }, 500);
                        }
                        window.onafterprint = function() {
                            setTimeout(() => window.close(), 300);
                        };
                    <\/script>
                </body>
                </html>
        `;
};

/**
 * Abre la ventana de impresión con el resumen de porte (y la hoja de facturas
 * simplificadas si las hay). Devuelve false si el navegador bloqueó la ventana.
 */
export const abrirResumenPorte = (items, opciones = {}) => {
    const ventana = window.open('', '_blank');
    if (!ventana) return false;
    ventana.document.write(documentoDeResumenPorte(items, opciones));
    ventana.document.close();
    return true;
};
