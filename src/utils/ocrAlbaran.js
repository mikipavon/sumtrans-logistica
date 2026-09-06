// Lee albaranes de agencia (fotos o PDF) con Tesseract dentro del navegador.
// No sale nada de la máquina: el motor y el idioma se descargan una vez desde
// el CDN de tesseract.js y el navegador los guarda en caché.
//
// Devuelve, por cada hoja, el texto plano y las líneas con la posición de cada
// palabra, que es lo que necesita lecturaAlbaranAgencia para separar columnas.

import { createWorker } from 'tesseract.js';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { repartirEnColumnas, interpretarAlbaran } from './lecturaAlbaranAgencia';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

// Ancho máximo al que se lleva cada hoja antes de leerla. Más grande no mejora
// la lectura y sí dispara la memoria y el tiempo.
const ANCHO_MAXIMO = 2200;
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
    const escala = Math.min(1, ANCHO_MAXIMO / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    const ctx = canvas.getContext('2d');
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

const camposRellenos = (campos) => ['destinatario', 'poblacion', 'cp', 'bultos', 'remitente', 'expedicion', 'porte'].filter(k => campos[k]).length;
const lecturaSuficiente = (campos) => Boolean(campos.destinatario && campos.bultos && (campos.poblacion || campos.cp));
const puntuar = (r) => camposRellenos(r.campos) * 20 + (r.confianza || 0);

/**
 * Lee una hoja y devuelve los campos interpretados más el texto en bruto.
 * Las fotos del móvil llegan muchas veces tumbadas y el lector sólo entiende
 * texto derecho: si la primera pasada no saca lo esencial, se prueba girando
 * la hoja y se devuelve la lectura con más campos (y el lienzo ya girado, para
 * que la miniatura enseñe lo que se ha leído).
 * @param {HTMLCanvasElement} lienzo
 * @param {(progreso: number) => void} [onProgreso] 0..1
 */
export async function leerHoja(lienzo, onProgreso) {
    const giros = [0, 90, 270, 180];
    let mejor = null;
    for (let i = 0; i < giros.length; i++) {
        const giro = giros[i];
        const l = giro === 0 ? lienzo : rotarLienzo(lienzo, giro);
        const r = await reconocer(l, (p) => onProgreso?.((i + p) / giros.length));
        r.lienzo = l;
        r.giro = giro;
        if (!mejor || puntuar(r) > puntuar(mejor)) mejor = r;
        if (lecturaSuficiente(r.campos)) break;
    }
    onProgreso?.(1);
    return mejor;
}

async function reconocer(lienzo, onProgreso) {
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
                        words: (linea.words || []).map(w => ({ text: w.text, bbox: w.bbox })),
                    });
                }
            }
        }
        const columnas = repartirEnColumnas(lineas, lienzo.width);
        const campos = interpretarAlbaran(columnas);
        return { campos, texto: data.text || columnas.todo, confianza: data.confidence ?? null };
    } finally {
        avisarProgreso = () => {};
    }
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
