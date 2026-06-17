import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ── Colores corporativos SUM ──
const NAVY  = [0, 45, 114];      // #002D72
const RED   = [231, 24, 25];     // #E71819
const WHITE = [255, 255, 255];
const LGRAY = [248, 249, 251];
const MGRAY = [203, 213, 225];
const DGRAY = [71, 85, 105];
const BLACK = [15, 23, 42];

/**
 * Convierte URL de imagen a Base64 para incrustar en PDF.
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
    console.error('Error fetching image for PDF:', error);
    return null;
  }
};

/**
 * Genera el Justificante de Entrega (POD) en PDF — Diseño corporativo SUM.
 */
const createDeliveryPDFDoc = async (shipment) => {
  if (!shipment) return null;

  const doc = new jsPDF();
  const pW = doc.internal.pageSize.getWidth();
  const pH = doc.internal.pageSize.getHeight();
  const M  = 14;

  // ── CABECERA: banner corporativo ──
  const BANNER_URL = 'https://www.sumtransportes.com/banner-email.png';
  const bannerB64 = await getBase64FromUrl(BANNER_URL);
  const bannerH = 44; // altura en mm

  if (bannerB64) {
    // Usar el banner como cabecera completa
    doc.addImage(bannerB64, 'PNG', 0, 0, pW, bannerH);

    // Overlay semitransparente a la derecha para el título POD
    doc.setFillColor(0, 30, 80);
    doc.setGState(new doc.GState({ opacity: 0.55 }));
    doc.rect(pW / 2, 0, pW / 2, bannerH, 'F');
    doc.setGState(new doc.GState({ opacity: 1 }));

    // Título POD sobre el banner
    doc.setTextColor(...WHITE);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('JUSTIFICANTE DE ENTREGA', pW - M, 19, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 215, 240);
    doc.text('Proof of Delivery (POD)', pW - M, 27, { align: 'right' });
  } else {
    // Fallback: cabecera navy con texto
    doc.setFillColor(...NAVY);
    doc.rect(0, 0, pW, bannerH, 'F');

    doc.setTextColor(...WHITE);
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.text('SUMTRANS LOGÍSTICA', M, 17);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(180, 200, 235);
    doc.text('SOLUCIONES DE TRANSPORTE Y MENSAJERÍA', M, 24);
    doc.setFontSize(7.5);
    doc.setTextColor(150, 180, 220);
    doc.text('CIF: B-56131717  ·  Tel: 957 245 221  ·  info@sumtransportes.com', M, 31);
    doc.text('Pol. El Junquillo Nº 83  ·  Cabra (Córdoba)  ·  CP 14940', M, 38);

    doc.setTextColor(...WHITE);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('JUSTIFICANTE DE ENTREGA', pW - M, 19, { align: 'right' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(200, 215, 240);
    doc.text('Proof of Delivery (POD)', pW - M, 27, { align: 'right' });
  }

  // Franja roja decorativa
  doc.setFillColor(...RED);
  doc.rect(0, bannerH, pW, 3, 'F');


  // ── BANDA INFO ALBARÁN ──
  const infoY = bannerH + 8;
  doc.setFillColor(...LGRAY);
  doc.rect(0, infoY, pW, 18, 'F');
  doc.setDrawColor(...MGRAY);
  doc.setLineWidth(0.3);
  doc.rect(0, infoY, pW, 18, 'S');

  const date = shipment.paidAt || shipment.updatedAt || new Date().toISOString();
  const dateStr = new Date(date).toLocaleString('es-ES');
  const porteValue = shipment.customAmount !== undefined && shipment.customAmount !== null
    ? shipment.customAmount : shipment.amount;

  doc.setTextColor(...NAVY);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Ref. Albarán: ' + shipment.id, M, infoY + 7);

  const totalBultosPDF = Array.isArray(shipment.articles) && shipment.articles.length > 0
    ? shipment.articles.reduce((s, a) => s + (parseInt(a.quantity) || 1), 0)
    : (shipment.packages || 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...DGRAY);
  doc.text('Bultos: ' + totalBultosPDF, M, infoY + 14);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.text(
    'Porte (' + (shipment.porteType || 'Pagado') + '): ' + parseFloat(porteValue || 0).toFixed(2) + ' \u20ac',
    M + 30, infoY + 14
  );

  if (shipment.hasCod && shipment.codAmount) {
    doc.setTextColor(...RED);
    doc.text('REEMBOLSO: ' + parseFloat(shipment.codAmount).toFixed(2) + ' \u20ac', M + 105, infoY + 14);
  }

  doc.setTextColor(...DGRAY);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text('Fecha entrega: ' + dateStr, pW - M, infoY + 7, { align: 'right' });

  // ── REMITENTE / DESTINATARIO ──
  autoTable(doc, {
    startY: infoY + 22,
    head: [['REMITENTE (ORIGEN)', 'DESTINATARIO (ENTREGA)']],
    body: [[
      (shipment.originName || shipment.client || '-') + '\n' +
      (shipment.originAddress || shipment.origin || '-') + '\n' +
      (shipment.originPhone || '-'),
      (shipment.destinationName || shipment.receiverName || '-') + '\n' +
      (shipment.destinationAddress || shipment.address || '-') + '\n' +
      (shipment.destinationPhone || '-')
    ]],
    theme: 'plain',
    headStyles: {
      fillColor: NAVY,
      textColor: WHITE,
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: { top: 5, bottom: 5, left: 6, right: 6 },
    },
    bodyStyles: {
      fontSize: 9.5,
      cellPadding: { top: 7, bottom: 7, left: 6, right: 6 },
      textColor: BLACK,
      lineColor: MGRAY,
      lineWidth: 0.3,
    },
    columnStyles: {
      0: { cellWidth: (pW / 2) - M },
      1: { cellWidth: (pW / 2) - M },
    },
  });

  let curY = doc.lastAutoTable.finalY + 10;

  // ── DATOS DE RECEPCIÓN ──
  doc.setFillColor(...NAVY);
  doc.rect(M, curY, pW - 2 * M, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('DATOS DE RECEPCIÓN', M + 4, curY + 5.5);

  curY += 12;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...DGRAY);
  doc.setFontSize(8.5);
  const col2 = M + (pW - 2 * M) / 2;
  doc.text('Nombre receptor:', M, curY);
  doc.text('DNI / ID:', col2, curY);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  doc.setFontSize(9.5);
  doc.text(shipment.receiverName || 'No especificado', M, curY + 6);
  doc.text(shipment.receiverId || 'No proporcionado', col2, curY + 6);

  if (shipment.deliveryCoordinates) {
    doc.setFontSize(7.5);
    doc.setTextColor(...DGRAY);
    doc.text('GPS: ' + shipment.deliveryCoordinates, M, curY + 14);
    curY += 5;
  }

  curY += 20;

  // ── FIRMA Y FOTO ──
  const boxH = 60;
  const boxW = (pW - 2 * M - 8) / 2;

  // Cabecero firma
  doc.setFillColor(...NAVY);
  doc.rect(M, curY, boxW, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('FIRMA DEL RECEPTOR', M + 4, curY + 5.5);

  doc.setDrawColor(...MGRAY);
  doc.setLineWidth(0.3);
  doc.setFillColor(252, 252, 252);
  doc.rect(M, curY + 8, boxW, boxH, 'FD');

  // Cabecero foto
  const photoX = M + boxW + 8;
  doc.setFillColor(...NAVY);
  doc.rect(photoX, curY, boxW, 8, 'F');
  doc.setTextColor(...WHITE);
  doc.text('FOTO ENTREGA / SELLO', photoX + 4, curY + 5.5);

  doc.setDrawColor(...MGRAY);
  doc.setFillColor(252, 252, 252);
  doc.rect(photoX, curY + 8, boxW, boxH, 'FD');

  // Imágenes
  if (shipment.deliverySignature) {
    const sigB64 = await getBase64FromUrl(shipment.deliverySignature);
    if (sigB64) doc.addImage(sigB64, 'JPEG', M + 3, curY + 11, boxW - 6, boxH - 6);
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...MGRAY);
    doc.text('SIN FIRMA REGISTRADA', M + boxW / 2, curY + 8 + boxH / 2, { align: 'center' });
  }

  const photoToDisplay = shipment.deliveryPhoto || shipment.merchandisePhoto;
  if (photoToDisplay) {
    const photoB64 = await getBase64FromUrl(photoToDisplay);
    if (photoB64) doc.addImage(photoB64, 'JPEG', photoX + 3, curY + 11, boxW - 6, boxH - 6);
  } else {
    doc.setFontSize(8);
    doc.setTextColor(...MGRAY);
    doc.text('SIN FOTO REGISTRADA', photoX + boxW / 2, curY + 8 + boxH / 2, { align: 'center' });
  }

  curY += boxH + 16;

  // ── OBSERVACIONES ──
  if (shipment.observations) {
    doc.setFillColor(...LGRAY);
    doc.setDrawColor(...MGRAY);
    doc.setLineWidth(0.3);
    doc.rect(M, curY, pW - 2 * M, 7, 'FD');
    doc.setTextColor(...NAVY);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'bold');
    doc.text('OBSERVACIONES', M + 3, curY + 5);
    curY += 10;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...DGRAY);
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(shipment.observations, pW - 2 * M);
    doc.text(lines, M, curY);
  }

  // ── FOOTER ──
  doc.setFillColor(...NAVY);
  doc.rect(0, pH - 14, pW, 14, 'F');
  doc.setFillColor(...RED);
  doc.rect(0, pH - 14, pW, 2, 'F');
  doc.setTextColor(...WHITE);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.text(
    'Documento generado automáticamente · SUMTRANS LOGÍSTICA S.L. · CIF B-56131717 · www.sumtransportes.com',
    pW / 2, pH - 8, { align: 'center' }
  );
  doc.text(
    'Pol. El Junquillo Nº 83, Cabra (Córdoba) 14940  ·  Tel: 957 245 221  ·  info@sumtransportes.com',
    pW / 2, pH - 4, { align: 'center' }
  );

  return doc;
};

export const generateDeliveryPDF = async (shipment) => {
  const doc = await createDeliveryPDFDoc(shipment);
  if (!doc) return;
  const fileName = ('POD_' + shipment.id + '_' + (shipment.destinationName || 'Envio') + '.pdf').replace(/\s+/g, '_');
  doc.save(fileName);
};

export const generateDeliveryPDFBlob = async (shipment) => {
  const doc = await createDeliveryPDFDoc(shipment);
  if (!doc) return null;
  return doc.output('blob');
};
