import jsPDF from 'jspdf';
import 'jspdf-autotable';

/**
 * Genera un informe de cierre de caja en PDF.
 * @param {Object} driver - Objeto con datos del conductor (name, etc)
 * @param {Date} date - Fecha del informe (por ej. new Date())
 * @param {Object} accountResult - Resultado de calculateDailyAccount()
 */
export const generateCashReportPDF = (driver, date, accountResult) => {
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

    // Preparar filas para la tabla general (juntar Portes y Reembolsos)
    let summaryRows = [];

    // Portes pagados hoy (Cobros de Porte)
    if (accountResult.collectedPortes && accountResult.collectedPortes.length > 0) {
        accountResult.collectedPortes.forEach(p => {
            summaryRows.push([
                p.id || '-',
                'Porte Debido',
                p.client || p.description || '-',
                `€${p.amount}`
            ]);
        });
    }

    // Reembolsos pagados hoy
    if (accountResult.collectedReimbursements && accountResult.collectedReimbursements.length > 0) {
        accountResult.collectedReimbursements.forEach(r => {
            summaryRows.push([
                r.id || '-',
                'Reembolso',
                r.client || r.description || '-',
                `€${r.reimbursementAmount}`
            ]);
        });
    }

    // Total Recaudado Hoy
    const totalCollected = (accountResult.dailyTotal || 0).toFixed(2);

    // Si no hay datos, mostrar mensaje
    if (summaryRows.length === 0) {
        doc.setFontSize(11);
        doc.setFont('helvetica', 'italic');
        doc.text('No se registraron cobros (portes/reembolsos) en esta fecha.', 14, 45);
    } else {
        // Tabla de Desglose
        doc.autoTable({
            startY: 40,
            head: [['Nº Doc / Albarán', 'Concepto', 'Cliente / Notas', 'Importe']],
            body: summaryRows,
            theme: 'striped',
            headStyles: { fillColor: [47, 84, 150] }, // Azul oscuro (estilo Factusol aprox)
            styles: { fontSize: 10 },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 35 },
                2: { cellWidth: 'auto' },
                3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
            }
        });
    }

    // Calcular la posición Y final de la tabla para colocar los subtotales
    const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 55;

    // Resumen de Totales
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    
    // Subtotales Opcionales (para que el chófer vea de dónde sale la suma)
    let yPos = finalY;
    if (accountResult.collectedPortes && accountResult.collectedPortes.length > 0) {
        const totalPortes = accountResult.collectedPortes.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0).toFixed(2);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Subtotal Portes: €${totalPortes}`, pageWidth - 14, yPos, { align: 'right' });
        yPos += 7;
    }
    
    if (accountResult.collectedReimbursements && accountResult.collectedReimbursements.length > 0) {
        const totalReemb = accountResult.collectedReimbursements.reduce((acc, r) => acc + (parseFloat(r.reimbursementAmount) || 0), 0).toFixed(2);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'normal');
        doc.text(`Subtotal Reembolsos: €${totalReemb}`, pageWidth - 14, yPos, { align: 'right' });
        yPos += 7;
    }

    yPos += 3;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.line(pageWidth - 80, yPos - 5, pageWidth - 14, yPos - 5);
    
    // TOTAL A ENTREGAR
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL A ENTREGAR EN CAJA: €${totalCollected}`, pageWidth - 14, yPos, { align: 'right' });

    // Líneas de firmas (al fondo de la página o después del total)
    const signatureY = yPos + 40;
    if (signatureY > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage();
        yPos = 20; // reset
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

    // Descargar el PDF
    doc.save(`Cierre_Caja_${driver?.name?.replace(/\s+/g, '_')}_${dateStr.replace(/\//g, '-')}.pdf`);
};
