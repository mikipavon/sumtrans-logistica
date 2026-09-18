// Lee albaranes de agencia (fotos o PDF) con Tesseract dentro del navegador.
// No sale nada de la máquina: el motor y el idioma se descargan una vez desde
// el CDN de tesseract.js y el navegador los guarda en caché.
//
// Devuelve, por cada hoja, el texto plano y las líneas con la posición de cada
// palabra, que es lo que necesita lecturaAlbaranAgencia para separar columnas.

import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { repartirEnColumnas, interpretarAlbaran, inclinacionDeLineas } from './lecturaAlbaranAgencia';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Ancho al que se lleva cada página de PDF antes de leerla.
const ANCHO_MAXIMO = 2200;
// Las fotos se llevan a este lado mayor. Más grande no mejora la lectura y sí
// dispara la memoria y el tiempo; más pequeño, la letra de las casillas se pierde.
// Una foto pequeña (reenviada por WhatsApp, por ejemplo) se amplía hasta aquí.
const LADO_MAXIMO_FOTO = 3200;
const AMPLIACION_MAXIMA = 2.5;
// Por debajo de esta inclinación no compensa volver a leer la hoja.
const INCLINACION_MINIMA = 0.8;
// Lado de la copia pequeña con la que se busca el giro y se mide la inclinación.
const LADO_TANTEO = 1600;
const PAGINAS_MAXIMAS_PDF = 10;

let lectorPromesa = null;
let avisarProgreso = () => {};

async function obtenerLector() {
    if (!lectorPromesa) {
        lectorPromesa = createWorker('spa', 1, {
            logger: (m) => {
                if (m?.status === 'recognizing text') avisarProgreso(m.progress || 0);
            },
        }).catch((err) => {
            lectorPromesa = null;
            throw err;
        });
    }
    return lectorPromesa;
}

/** Libera el motor de OCR (al cerrar la pantalla de importación). */
export async function cerrarLector() {
    if (!lectorPromesa) return;
    const pendiente = lectorPromesa;
    lectorPromesa = null;
    try {
        const w = await pendiente;
        await w.terminate();
    } catch {
        // si nunca llegó a arrancar, no hay nada que cerrar
    }
}

function lienzoDesdeBitmap(bitmap) {
    const escala = Math.min(AMPLIACION_MAXIMA, LADO_MAXIMO_FOTO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas;
}

async function lienzosDePdf(file) {
    const datos = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: datos }).promise;
    const lienzos = [];
    const paginas = Math.min(pdf.numPages, PAGINAS_MAXIMAS_PDF);
    for (let n = 1; n <= paginas; n++) {
        const page = await pdf.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: ANCHO_MAXIMO / base.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        lienzos.push(canvas);
    }
    return lienzos;
}

/** Convierte un fichero (imagen o PDF) en una lista de lienzos, uno por hoja. */
export async function hojasDeFichero(file) {
    const esPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (esPdf) return lienzosDePdf(file);
    // from-image: respeta la orientación EXIF que graba el móvil al hacer la foto.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return [lienzoDesdeBitmap(bitmap)];
}

function rotarLienzo(lienzo, grados) {
    const c = document.createElement('canvas');
    const lateral = grados === 90 || grados === 270;
    c.width = lateral ? lienzo.height : lienzo.width;
    c.height = lateral ? lienzo.width : lienzo.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate((grados * Math.PI) / 180);
    ctx.drawImage(lienzo, -lienzo.width / 2, -lienzo.height / 2);
    return c;
}

function reducirLienzo(lienzo, lado) {
    const escala = Math.min(1, lado / Math.max(lienzo.width, lienzo.height));
    if (escala === 1) return lienzo;
    const c = document.createElement('canvas');
    c.width = Math.round(lienzo.width * escala);
    c.height = Math.round(lienzo.height * escala);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(lienzo, 0, 0, c.width, c.height);
    return c;
}

/** Gira unos pocos grados para enderezar una foto torcida. Las esquinas que quedan al aire van en blanco. */
function enderezarLienzo(lienzo, grados) {
    const rad = (grados * Math.PI) / 180;
    const sen = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const c = document.createElement('canvas');
    c.width = Math.round(lienzo.width * cos + lienzo.height * sen);
    c.height = Math.round(lienzo.width * sen + lienzo.height * cos);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(lienzo, -lienzo.width / 2, -lienzo.height / 2);
    return c;
}

const camposRellenos = (campos) => ['destinatario', 'poblacion', 'cp', 'bultos', 'remitente', 'expedicion', 'porte'].filter(k => campos[k]).length;
// Para dar por bueno un giro basta con el destinatario y su población, si el
// lector está seguro de lo que ha leído. Los bultos no se exigen: van en una
// casilla pequeña que a veces no sale ni con la hoja derecha, y exigirlos hacía
// probar los cuatro giros en cada hoja. La confianza es la que descarta la hoja
// tumbada, que también "encuentra" un CP y un nombre entre la basura (con un TSB
// real: 65 derecha, 30-44 en los otros tres giros).
const CONFIANZA_SUFICIENTE = 55;
const lecturaSuficiente = (r) => Boolean(r.campos.destinatario && (r.campos.poblacion || r.campos.cp) && (r.confianza ?? 0) >= CONFIANZA_SUFICIENTE);
const puntuar = (r) => camposRellenos(r.campos) * 20 + (r.confianza || 0);

/**
 * Lee una hoja y devuelve los campos interpretados más el texto en bruto.
 *
 * 1. Las fotos del móvil llegan muchas veces tumbadas y el lector sólo entiende
 *    texto derecho: si la primera pasada no saca lo esencial, se prueba girando
 *    la hoja y se queda la lectura con más campos.
 * 2. Hecha a pulso, la foto sale además torcida dos o tres grados, y eso basta
 *    para que el nombre del destinatario parezca estar al lado de su rótulo y no
 *    debajo. Se mide la inclinación en la propia lectura y se lee otra vez derecha.
 *
 * Lo que sigue sin salir bien: las casillas pequeñas pegadas a las rayas o al
 * código de barras (bultos y kilos del TSB). El lector las da por dibujo; leer
 * la hoja por mitades o borrar las rayas se probó con fotos reales y no las
 * recuperaba de forma fiable.
 *
 * Devuelve también el lienzo tal y como se ha leído, para que la miniatura
 * enseñe la hoja girada y enderezada.
 * @param {HTMLCanvasElement} lienzo
 * @param {(progreso: number) => void} [onProgreso] 0..1
 */
export async function leerHoja(lienzo, onProgreso) {
    const giros = [0, 90, 270, 180];
    // No se sabe de antemano cuántas pasadas hará falta: se cuenta con tres y la
    // barra nunca vuelve atrás aunque salgan más.
    let pasada = 0;
    let avance = 0;
    const progresoDe = (n) => (p) => {
        avance = Math.max(avance, Math.min(0.95, (n + p) / Math.max(3, n + 1)));
        onProgreso?.(avance);
    };

    // Buscar el giro y medir la inclinación no necesita la hoja a tamaño
    // completo: se hace sobre una copia pequeña, que se lee varias veces más rápido.
    const pequeno = reducirLienzo(lienzo, LADO_TANTEO);
    let tanteo = null;
    for (const giro of giros) {
        const l = giro === 0 ? pequeno : rotarLienzo(pequeno, giro);
        const r = await reconocer(l, progresoDe(pasada++));
        r.lienzo = l;
        r.giro = giro;
        if (!tanteo || puntuar(r) > puntuar(tanteo)) tanteo = r;
        if (lecturaSuficiente(r)) break;
    }

    // La lectura buena, a tamaño completo, con el giro elegido y ya derecha.
    let completo = tanteo.giro === 0 ? lienzo : rotarLienzo(lienzo, tanteo.giro);
    if (Math.abs(tanteo.inclinacion) >= INCLINACION_MINIMA) completo = enderezarLienzo(completo, -tanteo.inclinacion);
    let mejor = await reconocer(completo, progresoDe(pasada++));
    mejor.lienzo = completo;
    mejor.giro = tanteo.giro;
    if (puntuar(tanteo) > puntuar(mejor)) mejor = { ...tanteo, lienzo: completo };

    onProgreso?.(1);
    return mejor;
}

async function reconocerLineas(lienzo, onProgreso) {
    const worker = await obtenerLector();
    avisarProgreso = onProgreso || (() => {});
    try {
        const { data } = await worker.recognize(lienzo, {}, { text: true, blocks: true });
        const lineas = [];
        for (const bloque of data.blocks || []) {
            for (const parrafo of bloque.paragraphs || []) {
                for (const linea of parrafo.lines || []) {
                    lineas.push({
                        text: linea.text,
                        bbox: linea.bbox,
                        baseline: linea.baseline,
                        words: (linea.words || []).map(w => ({ text: w.text, bbox: w.bbox })),
                    });
                }
            }
        }
        return { lineas, texto: data.text || '', confianza: data.confidence ?? null };
    } finally {
        avisarProgreso = () => {};
    }
}

async function reconocer(lienzo, onProgreso) {
    const { lineas, texto, confianza } = await reconocerLineas(lienzo, onProgreso);
    const columnas = repartirEnColumnas(lineas, lienzo.width);
    const campos = interpretarAlbaran(columnas);
    return { campos, texto: texto || columnas.todo, confianza, inclinacion: inclinacionDeLineas(lineas, lienzo.width) };
}

/** Miniatura en data URL para enseñar la hoja junto a lo que se ha leído. */
export function miniaturaDeLienzo(lienzo, ancho = 320) {
    const escala = Math.min(1, ancho / lienzo.width);
    const c = document.createElement('canvas');
    c.width = Math.round(lienzo.width * escala);
    c.height = Math.round(lienzo.height * escala);
    c.getContext('2d').drawImage(lienzo, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.7);
}
