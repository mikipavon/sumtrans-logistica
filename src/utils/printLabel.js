/**
 * printLabel.js — Sistema de impresión de etiquetas A6 / A4 con posiciones.
 *
 * MODO A6 (etiquetadora):
 *   - @page { size: 105mm 148mm }  → una etiqueta por página A6
 *   - Una página por bulto
 *
 * MODO A4 (folio normal):
 *   - @page { size: A4 }  → folio 210×297mm
 *   - Se divide en 4 cuadrantes A6 (2 cols × 2 filas) usando position:absolute
 *   - Las etiquetas se distribuyen desde startPosition en posiciones consecutivas
 *   - Cuando se llena el folio (posición 4), se genera un nuevo folio
 *
 * POSICIONES A4:
 *   [1][2]
 *   [3][4]
 *   1 = arriba-izquierda (top:0,    left:0)
 *   2 = arriba-derecha   (top:0,    left:105mm)
 *   3 = abajo-izquierda  (top:148mm,left:0)
 *   4 = abajo-derecha    (top:148mm,left:105mm)
 */

const LS_POS_KEY  = 'sum_label_a4_pos';
const LS_DATE_KEY = 'sum_label_a4_date';

/** Lee la última posición guardada. Devuelve la SIGUIENTE a usar (1-4). */
export function getNextA4Position() {
    const lastPos  = parseInt(localStorage.getItem(LS_POS_KEY)  || '0', 10);
    const lastDate = localStorage.getItem(LS_DATE_KEY) || '';
    const today    = new Date().toDateString();
    if (lastDate !== today || !lastPos) return 1;  // día nuevo → folio nuevo
    if (lastPos >= 4)                   return 1;  // folio completo → folio nuevo
    return lastPos + 1;
}

/** Guarda la última posición utilizada. */
export function saveA4Position(pos) {
    localStorage.setItem(LS_POS_KEY,  String(pos));
    localStorage.setItem(LS_DATE_KEY, new Date().toDateString());
}

/** Devuelve cuántas etiquetas hay que imprimir para un envío. */
export function getLabelCount(shipment) {
    let count = parseInt(shipment.packages) || 1;
    if (shipment.articles && shipment.articles.length > 0) {
        const badi = shipment.articles.find(a =>
            a.category === 'BADI' ||
            String(a.name).includes('BLT_') ||
            String(a.name).toLowerCase().includes('bulto')
        );
        if (badi) {
            const parsed = parseInt(String(badi.name).replace(/\D/g, ''));
            if (!isNaN(parsed) && parsed > 0) count = parsed * (badi.quantity || 1);
        }
    }
    return Math.max(1, count);
}

// ─── HTML de una etiqueta individual ────────────────────────────────────────

function buildLabelHTML(shipment, client, bultoIndex, totalBultos) {
    const clientLogo   = client.agencyLogoUrl || client.customLogo;
    const mainLogoSrc  = clientLogo || '/logo-sum.svg';
    const hasClientLogo = !!clientLogo;
    const printDate    = new Date().toLocaleDateString('es-ES');
    const qrText       = `${shipment.id}-${bultoIndex}`;
    const qrUrl        = `https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${encodeURIComponent(qrText)}&scale=3&rotate=N`;

    const articleNames = shipment.articles && shipment.articles.length > 0
        ? shipment.articles.map(a => a.name).join(', ')
        : `${totalBultos} Bulto${totalBultos !== 1 ? 's' : ''}`;
    const bultoLabel = totalBultos > 1 ? `${bultoIndex} / ${totalBultos}` : articleNames;

    return `
<div class="lbl">
  <div class="lbl-header">
    <img src="${mainLogoSrc}" class="lbl-logo" alt="Logo" onerror="this.style.display='none'" />
    <div class="lbl-meta">
      ${hasClientLogo ? '<img src="/logo-sum.svg" alt="SUM" class="lbl-sum-logo" />' : ''}
      <strong>${shipment.id}</strong><br/>${printDate}
    </div>
  </div>
  <div class="lbl-origin">
    <p class="lbl-stitle">REMITENTE</p>
    <p class="lbl-name">${shipment.originName || shipment.client || '—'}</p>
    <p class="lbl-addr">${shipment.originAddress || '—'}</p>
    <p class="lbl-addr">${[shipment.originZip, shipment.originCity].filter(Boolean).join(' ') || '—'}</p>
  </div>
  <div class="lbl-dest">
    <p class="lbl-stitle lbl-stitle-inv">✦ DESTINATARIO</p>
    <p class="lbl-dest-name">${shipment.destinationName || '—'}</p>
    <p class="lbl-addr-inv">${shipment.destinationAddress || shipment.destination || '—'}</p>
    <p class="lbl-dest-city">${[shipment.destinationZip, shipment.destinationCity].filter(Boolean).join(' ') || '—'}</p>
  </div>
  <div class="lbl-details">
    <div><p class="lbl-stitle">BULTOS</p><p class="lbl-dval">${bultoLabel}</p></div>
    ${shipment.observations ? `<div><p class="lbl-stitle">NOTAS</p><p class="lbl-dval lbl-obs">${shipment.observations}</p></div>` : ''}
    ${shipment.hasCod ? `<div><p class="lbl-stitle">REEMBOLSO</p><p class="lbl-dval lbl-cod">💰 ${parseFloat(shipment.codAmount || 0).toFixed(2)} €</p></div>` : ''}
  </div>
  <div class="lbl-qr">
    <img src="${qrUrl}" alt="QR" class="lbl-qr-img" />
    <div class="lbl-qr-text">
        <p class="lbl-qr-ref">${qrText}</p>
        <p class="lbl-qr-sub">Bulto ${bultoIndex} de ${totalBultos}</p>
    </div>
  </div>
</div>`;
}

// ─── CSS de la etiqueta (sin @page, sin tamaños de página) ──────────────────

const LABEL_CSS = `
* { box-sizing: border-box; margin: 0; padding: 0; }

/* La etiqueta ocupa exactamente el espacio que se le da desde fuera */
.lbl {
  width:    105mm;
  height:   148mm;
  padding:  3mm 4mm;
  display:  flex;
  flex-direction: column;
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  color: #000;
  overflow: hidden;
}

/* Cabecera: logos + ref */
.lbl-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #000;
  padding-bottom: 2.5mm;
  margin-bottom: 2.5mm;
  flex-shrink: 0;
}
.lbl-logo     { max-width: 45mm; max-height: 16mm; object-fit: contain; }
.lbl-sum-logo { max-height: 10mm; object-fit: contain; display: block; margin-bottom: 1mm; }
.lbl-meta     { text-align: right; font-size: 8pt; line-height: 1.4; }
/* ★ ID del envío — bien visible */
.lbl-meta strong { font-size: 13pt; font-weight: 900; letter-spacing: 0.5px; }

/* Títulos de sección */
.lbl-stitle {
  font-size: 5.5pt;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #777;
  margin-bottom: 0.8mm;
}
.lbl-stitle-inv { color: #aaa; }

/* Remitente — información secundaria, compacta */
.lbl-origin {
  border-bottom: 1px dashed #bbb;
  padding-bottom: 1.5mm;
  margin-bottom: 2mm;
  flex-shrink: 0;
}
.lbl-name { font-size: 8.5pt; font-weight: 700; line-height: 1.2; }
.lbl-addr { font-size: 7.5pt; line-height: 1.3; color: #444; }

/* ★ Destinatario — PROTAGONISTA de la etiqueta */
.lbl-dest {
  background: #000;
  color: #fff;
  padding: 2.5mm 3.5mm;
  border-radius: 1.5mm;
  margin-bottom: 2mm;
  flex-shrink: 0;
}
/* ★★ Nombre destinatario — el más grande */
.lbl-dest-name  { font-size: 16pt; font-weight: 900; line-height: 1.15; }
/* ★★ Dirección destino */
.lbl-addr-inv   { color: #eee; font-size: 10pt; line-height: 1.3; }
/* ★★ Ciudad/CP destino — segunda en importancia */
.lbl-dest-city  { color: #fff; font-size: 12pt; font-weight: 800; line-height: 1.2; margin-top: 1mm; }

/* Detalles (bultos, notas, COD) */
.lbl-details {
  display: flex;
  gap: 4mm;
  flex-wrap: wrap;
  flex: 1;
  align-items: flex-start;
  overflow: hidden;
}
/* ★ Valor de detalles — bultos, COD */
.lbl-dval  { font-size: 10pt; font-weight: 800; }
.lbl-obs   { font-size: 7pt;  font-weight: 400; max-width: 42mm; }
.lbl-cod   { color: #78350f; font-size: 11pt; }

/* QR — más grande para mejor escaneo */
.lbl-qr {
  border-top: 2px solid #000;
  padding-top: 2.5mm;
  margin-top: auto;
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 4mm;
  flex-shrink: 0;
}
.lbl-qr-img { width: 38mm; height: 38mm; object-fit: contain; }
.lbl-qr-text { display: flex; flex-direction: column; gap: 1mm; }
.lbl-qr-ref { font-family: monospace; font-size: 11pt; font-weight: 800; letter-spacing: 2px; }
.lbl-qr-sub { font-size: 8.5pt; color: #555; text-transform: uppercase; font-weight: 700; }

@media print {
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}`;


// ─── Script de espera de imágenes (compartido) ───────────────────────────────

const WAIT_AND_PRINT_SCRIPT = `
<script>
  window.onload = function() {
    var imgs = document.querySelectorAll('img');
    var loaded = 0;
    var total  = imgs.length;
    function tryPrint() { if (loaded >= total) setTimeout(function(){ window.print(); }, 250); }
    if (total === 0) { setTimeout(function(){ window.print(); }, 300); return; }
    imgs.forEach(function(img) {
      if (img.complete) { loaded++; tryPrint(); }
      else {
        img.onload  = function() { loaded++; tryPrint(); };
        img.onerror = function() { loaded++; tryPrint(); };
      }
    });
    setTimeout(function(){ window.print(); }, 4000); // fallback
  };
  window.onafterprint = function() { setTimeout(function(){ window.close(); }, 400); };
<\/script>`;

// ─── MODO A6 ─────────────────────────────────────────────────────────────────

/**
 * Abre una ventana de impresión con una etiqueta A6 por bulto.
 * Requiere que la impresora esté configurada en A6 (o "Sin márgenes" A6).
 */
export function printLabelA6(shipment, client) {
    const total = getLabelCount(shipment);

    // Una etiqueta por página: usamos page-break-after entre ellas
    let labels = '';
    for (let i = 1; i <= total; i++) {
        labels += `<div class="page">${buildLabelHTML(shipment, client, i, total)}</div>`;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Etiqueta ${shipment.id}</title>
  <style>
    ${LABEL_CSS}
    @page { size: 105mm 148mm; margin: 0mm; }
    html, body { width: 105mm; margin: 0; padding: 0; background: #fff; }
    .page {
      width:  105mm;
      height: 148mm;
      overflow: hidden;
      page-break-after: always;
    }
    .page:last-child { page-break-after: auto; }
    /* En modo A6 la etiqueta llena la página completa */
    .lbl { width: 105mm; height: 148mm; }
  </style>
</head>
<body>
  ${labels}
  ${WAIT_AND_PRINT_SCRIPT}
</body>
</html>`;

    openPrintWindow(html);
}

// ─── MODO A4 ─────────────────────────────────────────────────────────────────

/**
 * Imprime en modo folio A4, distribuyendo las etiquetas en cuadrantes A6.
 *
 * startPosition: 1-4 (posición del primer cuadrante del primer folio).
 * Retorna la ÚLTIMA posición utilizada (para guardar en localStorage).
 *
 * Posiciones:
 *   [1=top-left ][2=top-right ]
 *   [3=bot-left ][4=bot-right ]
 */
export function printLabelA4(shipment, client, startPosition = 1) {
    const total = getLabelCount(shipment);

    // Distribuir bultos en folios y posiciones
    // Cada folio tiene slots 1-4; el primer folio empieza en startPosition
    const folios = [];         // array de folios; cada folio es un array [null|{bulto,pos}] x4
    let pos    = startPosition;
    let folio  = Array(4).fill(null); // índices 0-3 = posiciones 1-4

    for (let i = 1; i <= total; i++) {
        folio[pos - 1] = { bulto: i, pos };
        if (pos === 4 || i === total) {
            folios.push([...folio]);
            folio = Array(4).fill(null);
            pos   = 1;
        } else {
            pos++;
        }
    }

    // Última posición usada
    const lastFolio   = folios[folios.length - 1];
    const lastUsed    = lastFolio.reduce((max, slot) => slot ? Math.max(max, slot.pos) : max, 0);

    // Coordenadas absolutas de cada posición (en mm)
    const posCoords = {
        1: { top: 0,   left: 0 },
        2: { top: 0,   left: 105 },
        3: { top: 148, left: 0 },
        4: { top: 148, left: 105 },
    };

    // Construir páginas
    let pages = '';
    folios.forEach((folioSlots) => {
        // Las líneas de corte (cruces punteados) aparecen siempre
        // Las etiquetas se colocan en posición absoluta
        let labels = '';
        for (let p = 1; p <= 4; p++) {
            const slot   = folioSlots[p - 1];
            const coords = posCoords[p];
            if (slot) {
                labels += `
<div class="a4-slot" style="top:${coords.top}mm; left:${coords.left}mm;">
  ${buildLabelHTML(shipment, client, slot.bulto, total)}
</div>`;
            }
            // Slot vacío: se muestra como zona punteada (cortar aquí)
            else {
                labels += `
<div class="a4-slot a4-slot-empty" style="top:${coords.top}mm; left:${coords.left}mm;"></div>`;
            }
        }
        pages += `<div class="a4-page">${labels}</div>`;
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Etiqueta ${shipment.id}</title>
  <style>
    ${LABEL_CSS}
    @page { size: 210mm 297mm; margin: 0mm; }
    html, body { width: 210mm; margin: 0; padding: 0; background: #fff; }

    /* Un folio A4 por página de impresión */
    .a4-page {
      position: relative;
      width:  210mm;
      height: 297mm;
      overflow: hidden;
      page-break-after: always;
    }
    .a4-page:last-child { page-break-after: auto; }

    /* Cada slot es un cuadrante A6 con posicionamiento absoluto */
    .a4-slot {
      position: absolute;
      width:  105mm;
      height: 148mm;
      overflow: hidden;
    }
    .a4-slot .lbl {
      width:  105mm;
      height: 148mm;
    }

    /* Slot vacío: zona punteada indicando dónde cortar */
    .a4-slot-empty {
      background: #fafafa;
    }
    .a4-slot-empty::after {
      content: 'Espacio disponible';
      position: absolute;
      inset: 3mm;
      border: 1.5px dashed #ccc;
      border-radius: 2mm;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 7pt;
      color: #bbb;
      font-family: Helvetica, Arial, sans-serif;
    }

    /* Líneas de corte entre cuadrantes */
    .a4-page::before {
      content: '';
      position: absolute;
      top: 0; bottom: 0;
      left: 105mm;
      border-left: 1px dashed #999;
      z-index: 10;
      pointer-events: none;
    }
    .a4-page::after {
      content: '';
      position: absolute;
      left: 0; right: 0;
      top: 148mm;
      border-top: 1px dashed #999;
      z-index: 10;
      pointer-events: none;
    }
  </style>
</head>
<body>
  ${pages}
  ${WAIT_AND_PRINT_SCRIPT}
</body>
</html>`;

    openPrintWindow(html);
    return lastUsed;
}

// ─── Utilidad interna ─────────────────────────────────────────────────────────

function openPrintWindow(html) {
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) {
        alert('Activa las ventanas emergentes en tu navegador para imprimir.');
        return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
}
