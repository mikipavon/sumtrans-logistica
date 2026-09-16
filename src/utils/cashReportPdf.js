import jsPDF from 'jspdf';
// jspdf-autotable 5 ya no cuelga doc.autoTable() al importarlo: se llama
// autoTable(doc, ...). Con la forma vieja el PDF reventaba en cuanto tenía
// alguna fila que pintar (nunca se notó porque nunca las tuvo).
import autoTable from 'jspdf-autotable';
import { parseAmount } from './accountLogic';

const euros = (v) => `€${parseAmount(v).toFixed(2)}`;

/**
 * Las filas de la tabla del cierre, a partir del resultado de calculateDailyAccount().
 *
 * Se leen las listas de detalle (allPorteDetail, allReimbursementsDetail,
 * allSimplifiedInvoiceDetail), que son las mismas que enseña la pestaña Cuenta
 * del repartidor y el desglose de la ficha del conductor. Antes el PDF leía dos
 * campos (collectedPortes, collectedReimbursements) que el cálculo nunca
 * devolvió, así que salía siempre "No se registraron cobros" con el total
 * debajo: un cierre sin desglose que no servía para cuadrar la caja.
 */
export const filasDelCierre = (accountResult = {}) => {
    const filas = [];
    (accountResult.allPorteDetail || []).forEach(p => {
        filas.push([
            p.id || '-',
            p.type === 'Efectivo' ? 'Porte (efectivo)' : `Porte${p.sourceTitle ? ` · ${p.sourceTitle}` : ''}`,
            p.client || p.description || '-',
            euros(p.amount)
        ]);
    });
    (accountResult.allReimbursementsDetail || []).forEach(r => {
        filas.push([
            r.id || '-',
            'Reembolso',
            r.client || r.description || '-',
            euros(r.amount)
        ]);
    });
    (accountResult.allSimplifiedInvoiceDetail || []).forEach(f => {
        filas.push([
            f.id || '-',
            'Factura simplificada',
            f.client || '-',
            euros(f.amount)
        ]);
    });
    return filas;
};

/**
 * Monta el documento del cierre de caja (sin descargarlo), para poder
 * comprobarlo en los tests.
 * @param {Object} driver - Objeto con datos del conductor (name, etc)
 * @param {Date} date - Fecha del informe (por ej. new Date())
 * @param {Object} accountResult - Resultado de calculateDailyAccount()
 */
export const crearDocumentoDeCierre = (driver, date, accountResult = {}) => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Formatear la fecha
    const dateStr = date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Header
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('Liquidación Diaria de Conductor', pageWidth / 2, 20, { align: 'center' });

    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Conductor: ${driver?.name || 'Desconocido'}`, 14, 30);
    doc.text(`Fecha: ${dateStr}`, pageWidth - 14, 30, { align: 'right' });

    doc.setLineWidth(0.5);
    doc.line(14, 33, pageWidth - 14, 33);

    const summaryRows = filasDelCierre(accountResult);

    // Total Recaudado
    const totalCollected = (accountResult.dailyTotal || 0).toFixed(2);

    // Si no hay datos, mostrar mensaje
    if (summaryRows.length === 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'italic');
        doc.text('No se registraron cobros (portes/reembolsos) en esta fecha.', 14, 45);
    } else {
        // Tabla de Desglose
        autoTable(doc, {
            startY: 40,
            head: [['Nº Doc / Albarán', 'Concepto', 'Cliente / Notas', 'Importe']],
            body: summaryRows,
            theme: 'striped',
            headStyles: { fillColor: [47, 84, 150] }, // Azul oscuro (estilo Factusol aprox)
            styles: { fontSize: 10 },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 40 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
            }
        });
    }

    // Calcular la posición Y final de la tabla para colocar los subtotales
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 55;

    // Subtotales, para que se vea de dónde sale la suma
    let yPos = finalY;
    const subtotal = (etiqueta, importe) => {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`${etiqueta}: ${euros(importe)}`, pageWidth - 14, yPos, { align: 'right' });
        yPos += 7;
    };
    if ((accountResult.allPorteDetail || []).length > 0) subtotal('Subtotal Portes', accountResult.collectedPorte);
    if ((accountResult.allReimbursementsDetail || []).length > 0) subtotal('Subtotal Reembolsos', accountResult.collectedReembolsos);
    if ((accountResult.allSimplifiedInvoiceDetail || []).length > 0) subtotal('Subtotal Facturas simplificadas', accountResult.collectedSimplifiedInvoices);

    yPos += 3;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - 80, yPos - 5, pageWidth - 14, yPos - 5);

    // TOTAL A ENTREGAR
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL A ENTREGAR EN CAJA: €${totalCollected}`, pageWidth - 14, yPos, { align: 'right' });

    // Líneas de firmas: si no caben debajo del total, van en una hoja nueva
    let signatureY = yPos + 40;
    if (signatureY > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        signatureY = 40;
    }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    const signatureLeftPos = 30;
    const signatureRightPos = pageWidth - 80;

    doc.line(signatureLeftPos, signatureY, signatureLeftPos + 50, signatureY);
    doc.text('Firma del Conductor', signatureLeftPos + 25, signatureY + 5, { align: 'center' });

    doc.line(signatureRightPos, signatureY, signatureRightPos + 50, signatureY);
    doc.text('Conforme Caja / Admin', signatureRightPos + 25, signatureY + 5, { align: 'center' });

    // Pie de página
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.text('Documento generado automáticamente por SUMTRANS App - Liquidación de cuenta diaria', pageWidth / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' });

    return { doc, dateStr };
};

/**
 * Genera y descarga el informe de cierre de caja en PDF.
 */
export const generateCashReportPDF = (driver, date, accountResult) => {
    const { doc, dateStr } = crearDocumentoDeCierre(driver, date, accountResult);
    doc.save(`Cierre_Caja_${(driver?.name || 'Conductor').replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`);
};

