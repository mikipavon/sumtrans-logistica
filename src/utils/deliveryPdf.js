import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';


/**
 * Función auxiliar para convertir una URL de imagen a Base64.
 * Esto evita problemas de CORS al añadir imágenes al PDF.
 */
const getBase64FromUrl = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("Error fetching image for PDF:", error);
    return null;
  }
};

/**
 * Genera un Justificante de Entrega (POD) en PDF con firma y foto.
 * @param {Object} shipment - El objeto del envío completo.
 */
export const generateDeliveryPDF = async (shipment) => {
    if (!shipment) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;

    // --- CABECERA ---
    doc.setFillColor(47, 84, 150); // Azul SUMTRANS
    doc.rect(0, 0, pageWidth, 40, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('SUMTRANS LOGISTICA', margin, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('SOLUCIONES DE TRANSPORTE Y MENSAJERÍA', margin, 28);

    doc.setFontSize(14);
    doc.text('JUSTIFICANTE DE ENTREGA (POD)', pageWidth - margin, 25, { align: 'right' });

    // --- INFORMACIÓN DEL ENVÍO ---
    const date = shipment.paidAt || shipment.updatedAt || new Date().toISOString();
    const dateStr = new Date(date).toLocaleString('es-ES');

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Referencia Albarán: ${shipment.id}`, margin, 55);
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Fecha Entrega: ${dateStr}`, pageWidth - margin, 55, { align: 'right' });
    doc.text(`Bultos: ${shipment.packages || 1}`, margin, 62);

    // Agregar Porte y Reembolso
    doc.setFont('helvetica', 'bold');
    const porteValue = shipment.customAmount !== undefined && shipment.customAmount !== null ? shipment.customAmount : shipment.amount;
    doc.text(`Porte (${shipment.porteType || 'Pagado'}): ${parseFloat(porteValue || 0).toFixed(2)} €`, margin + 40, 62);

    if (shipment.hasCod && shipment.codAmount) {
        doc.setTextColor(220, 38, 38); // Red-600 para destacar reembolso
        doc.text(`Reembolso a cobrar: ${parseFloat(shipment.codAmount).toFixed(2)} €`, margin + 100, 62);
        doc.setTextColor(0, 0, 0); // Restaurar negro
    }
    doc.setFont('helvetica', 'normal');

    // --- BLOQUES ORIGEN Y DESTINO ---
    autoTable(doc, {
        startY: 70,
        head: [['REMITENTE (ORIGEN)', 'DESTINATARIO (ENTREGA)']],
        body: [[
            `${shipment.originName || shipment.client || '-'}\n${shipment.originAddress || shipment.origin || '-'}\n${shipment.originPhone || '-'}`,
            `${shipment.destinationName || shipment.receiverName || '-'}\n${shipment.destinationAddress || shipment.address || '-'}\n${shipment.destinationPhone || '-'}`
        ]],
        theme: 'plain',
        headStyles: { fillColor: [240, 240, 240], textColor: [47, 84, 150], fontStyle: 'bold' },
        styles: { fontSize: 10, cellPadding: 5, overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: (pageWidth / 2) - margin },
            1: { cellWidth: (pageWidth / 2) - margin }
        }
    });


    const currentY = doc.lastAutoTable.finalY + 15;

    // --- DATOS DEL RECEPTOR ---
    doc.setFont('helvetica', 'bold');
    doc.text('DATOS DE RECEPCIÓN:', margin, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Nombre: ${shipment.receiverName || 'No especificado'}`, margin, currentY + 7);
    doc.text(`DNI / ID: ${shipment.receiverId || 'No proporcionado'}`, margin, currentY + 14);

    if (shipment.deliveryCoordinates) {
        doc.setFontSize(8);
        doc.setTextColor(100, 100, 100);
        doc.text(`Ubicación GPS: ${shipment.deliveryCoordinates}`, margin, currentY + 21);
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
    }

    // --- FIRMA Y FOTO ---
    let imageY = currentY + 30;

    // Rectángulos para las fotos
    doc.setDrawColor(200, 200, 200);
    
    // Contenedor Firma
    doc.text('FIRMA DEL RECEPTOR:', margin, imageY - 5);
    doc.rect(margin, imageY, (pageWidth / 2) - 20, 60);
    
    // Contenedor Foto
    doc.text('FOTO DE ENTREGA / SELLO:', (pageWidth / 2) + 10, imageY - 5);
    doc.rect((pageWidth / 2) + 10, imageY, (pageWidth / 2) - 20, 60);

    // Cargar y añadir imágenes (esto es asíncrono)
    if (shipment.deliverySignature) {
        const sigBase64 = await getBase64FromUrl(shipment.deliverySignature);
        if (sigBase64) {
            // Usamos JPEG para evitar problemas de transparencia que resultan en cuadros negros
            doc.addImage(sigBase64, 'JPEG', margin + 5, imageY + 5, (pageWidth / 2) - 30, 50);
        }
    } else {
        doc.setFontSize(8);
        doc.text('SIN FIRMA REGISTRADA', margin + 15, imageY + 30);
    }

    const photoToDisplay = shipment.deliveryPhoto || shipment.merchandisePhoto;
    if (photoToDisplay) {
        const photoBase64 = await getBase64FromUrl(photoToDisplay);
        if (photoBase64) {
            // La foto suele ser rectangular, la ajustamos
            doc.addImage(photoBase64, 'JPEG', (pageWidth / 2) + 15, imageY + 5, (pageWidth / 2) - 30, 50);
        }
    } else {
        doc.setFontSize(8);
        doc.text('SIN FOTO REGISTRADA', (pageWidth / 2) + 25, imageY + 30);
    }

    // --- OBSERVACIONES (Si existen) ---
    if (shipment.observations) {
        const obsY = imageY + 75;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('OBSERVACIONES DE ENTREGA:', margin, obsY);
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        const splitObs = doc.splitTextToSize(shipment.observations, pageWidth - (2 * margin));
        doc.text(splitObs, margin, obsY + 7);
    }

    // --- FOOTER ---
    const footerY = doc.internal.pageSize.getHeight() - 15;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text('Este documento es un comprobante de entrega digital generado por SUMTRANS App.', pageWidth / 2, footerY, { align: 'center' });
    doc.text('SUMTRANS LOGISTICA - Conectando destinos.', pageWidth / 2, footerY + 4, { align: 'center' });

    // --- GUARDAR ARCHIVO ---
    const fileName = `POD_${shipment.id}_${shipment.destinationName || 'Envio'}.pdf`.replace(/\s+/g, '_');
    doc.save(fileName);
};
