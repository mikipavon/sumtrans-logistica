// Interpreta el texto que devuelve el OCR de un albarán de agencia (TXT, etc.)
// y saca los campos que hacen falta para crear el envío.
//
// Es código puro (sin navegador ni Tesseract) para poder probarlo con texto.
// Los albaranes de agencia van casi siempre a dos columnas: remitente/origen
// a la izquierda y destinatario/destino a la derecha. El OCR devuelve las dos
// columnas mezcladas línea a línea, así que primero se reparten las palabras
// por columnas usando la posición horizontal (repartirEnColumnas) y después
// se interpreta cada columna por separado (interpretarAlbaran).

const limpiar = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// Líneas no vacías de un bloque de texto.
const lineasDe = (texto) => String(texto || '').split('\n').map(limpiar).filter(Boolean);

/**
 * Reparte las líneas del OCR (cada una con sus palabras y cajas) en dos
 * columnas según el centro horizontal de cada palabra.
 *
 * @param {Array<{words: Array<{text: string, bbox: {x0:number, x1:number, y0:number, y1:number}}>, bbox?: object}>} lineas
 * @param {number} anchoPagina ancho en píxeles de la imagen leída
 * @returns {{izquierda: string, derecha: string, todo: string}}
 */
export function repartirEnColumnas(lineas, anchoPagina) {
    const mitad = (anchoPagina || 0) / 2;
    const ordenadas = [...(lineas || [])].sort((a, b) => ((a.bbox?.y0 ?? 0) - (b.bbox?.y0 ?? 0)));
    const izquierda = [];
    const derecha = [];
    const todo = [];
    for (const linea of ordenadas) {
        const palabras = (linea.words || []).filter(w => limpiar(w.text));
        if (palabras.length === 0) continue;
        const izq = [];
        const der = [];
        for (const w of palabras) {
            const centro = ((w.bbox?.x0 ?? 0) + (w.bbox?.x1 ?? 0)) / 2;
            (mitad > 0 && centro >= mitad ? der : izq).push(limpiar(w.text));
        }
        if (izq.length) izquierda.push(izq.join(' '));
        if (der.length) derecha.push(der.join(' '));
        todo.push(palabras.map(w => limpiar(w.text)).join(' '));
    }
    return {
        izquierda: izquierda.join('\n'),
        derecha: derecha.join('\n'),
        todo: todo.join('\n'),
        celdas: celdasDeLineas(ordenadas, anchoPagina),
        ancho: anchoPagina || 0,
    };
}

/**
 * Convierte las líneas del OCR en celdas: trozos de texto separados por un
 * hueco horizontal grande. En un albarán impreso cada dato vive en su casilla,
 * y el OCR junta en una misma "línea" casillas que están a la misma altura
 * ("PRODUCTOS RU-CA,S.L.   Ref. 456"). Con las celdas se puede buscar una
 * etiqueta ("Consignatario", "Kilos") y leer lo que hay debajo o al lado.
 */
export function celdasDeLineas(lineas, anchoPagina) {
    const celdas = [];
    for (const linea of lineas || []) {
        const palabras = (linea.words || []).filter(w => limpiar(w.text) && w.bbox).sort((a, b) => a.bbox.x0 - b.bbox.x0);
        if (palabras.length === 0) continue;
        const altos = palabras.map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
        const altoMedio = altos[Math.floor(altos.length / 2)] || 10;
        // Entre palabras de un mismo texto hay un cuarto o medio alto de letra;
        // entre casillas vecinas, bastante más. Una vez y media el alto separa bien.
        const umbral = Math.max((anchoPagina || 0) * 0.02, altoMedio * 1.5);
        let actual = null;
        for (const w of palabras) {
            if (actual && w.bbox.x0 - actual.x1 > umbral) { celdas.push(actual); actual = null; }
            if (!actual) {
                actual = { text: limpiar(w.text), x0: w.bbox.x0, x1: w.bbox.x1, y0: w.bbox.y0, y1: w.bbox.y1 };
            } else {
                actual.text += ' ' + limpiar(w.text);
                actual.x1 = Math.max(actual.x1, w.bbox.x1);
                actual.y0 = Math.min(actual.y0, w.bbox.y0);
                actual.y1 = Math.max(actual.y1, w.bbox.y1);
            }
        }
        if (actual) celdas.push(actual);
    }
    return celdas.sort((a, b) => (a.y0 - b.y0) || (a.x0 - b.x0));
}

// ─── Lectura por etiquetas (celdas) ───

const ETIQUETA_DESTINATARIO = /^(consignatari\w*|destinatari\w*)\b/i;
const ETIQUETA_REMITENTE = /^remitente\b/i;
// Etiquetas que cortan un bloque de nombre y dirección.
const ETIQUETA_DE_CORTE = /^(?:observaciones|recibi|remitente|consignatari\w*|destinatari\w*|ped|dep|nif|cif|cod|ref|telf?|tel|tfno|fecha|origen|destino|zona|bultos|kilos|volumen|porte)s?\b/i;

const alto = (c) => c.y1 - c.y0;
const centroY = (c) => (c.y0 + c.y1) / 2;
const enLaMismaFila = (a, b) => Math.abs(centroY(a) - centroY(b)) < Math.max(alto(a), alto(b)) * 0.7;
const alineadaDebajo = (etiqueta, c, tolX) => c.y0 >= etiqueta.y1 - alto(etiqueta) * 0.5 && c !== etiqueta && Math.abs(c.x0 - etiqueta.x0) < tolX;

function buscarEtiqueta(celdas, regex) {
    return (celdas || []).find(c => regex.test(sinAcentos(c.text))) || null;
}

/**
 * Valor que acompaña a una etiqueta: en la misma celda ("Kilos 36"), en la
 * celda de su derecha en la misma fila, o en la celda justo debajo alineada.
 * `valido` es la forma que debe tener el valor para no coger otra etiqueta.
 */
function valorDeEtiqueta(celdas, regex, ancho, valido) {
    const et = buscarEtiqueta(celdas, regex);
    if (!et) return '';
    const acepta = (t) => t && (!valido || valido.test(t));
    const enLinea = limpiar(sinAcentos(et.text).replace(regex, '')).replace(/^[\s:.\-/]+/, '');
    if (acepta(enLinea)) return enLinea;
    const derecha = celdas.filter(c => c !== et && enLaMismaFila(et, c) && c.x0 >= et.x1).sort((a, b) => a.x0 - b.x0)[0];
    if (derecha && acepta(derecha.text)) return derecha.text;
    const debajo = celdas.filter(c => alineadaDebajo(et, c, (ancho || 0) * 0.08)).sort((a, b) => a.y0 - b.y0)[0];
    if (debajo && acepta(debajo.text)) return debajo.text;
    return '';
}

/** Líneas que cuelgan de una etiqueta (nombre, dirección, "CP POBLACIÓN"). */
function bloqueBajoEtiqueta(celdas, regex, ancho) {
    const et = buscarEtiqueta(celdas, regex);
    if (!et) return null;
    const tolX = (ancho || 0) * 0.08;
    const lineas = [];
    const enLinea = limpiar(et.text.replace(new RegExp(regex.source, 'i'), '')).replace(/^[\s:.-]+/, '');
    if (enLinea) lineas.push(enLinea);
    let y1 = et.y1;
    const siguientes = celdas.filter(c => alineadaDebajo(et, c, tolX) && c.y0 > et.y0).sort((a, b) => a.y0 - b.y0);
    for (const c of siguientes) {
        if (ETIQUETA_DE_CORTE.test(sinAcentos(c.text))) break;
        lineas.push(c.text);
        y1 = c.y1;
        if (partirCp(c.text) || lineas.length >= 5) break;
    }
    return { lineas, y0: et.y0, y1 };
}

function leerPorEtiquetas(celdas, ancho) {
    const r = {};
    if (!celdas || celdas.length === 0) return r;

    const dest = bloqueBajoEtiqueta(celdas, ETIQUETA_DESTINATARIO, ancho);
    if (dest && dest.lineas.length) {
        const cpIdx = dest.lineas.findIndex(l => partirCp(l));
        const sinCp = cpIdx >= 0 ? dest.lineas.filter((_, i) => i !== cpIdx) : dest.lineas;
        r.destinatario = sinCp[0] || '';
        r.direccion = sinCp.slice(1).join(', ');
        if (cpIdx >= 0) Object.assign(r, partirCp(dest.lineas[cpIdx]));
        // El teléfono del destinatario suele estar a su misma altura, en otra casilla.
        const enSuAltura = celdas.filter(c => c.y1 >= dest.y0 && c.y0 <= dest.y1 + alto(c)).map(c => c.text).join(' ');
        const tel = enSuAltura.match(/\b(?:telf?|tel|tfno|movil|móvil)\.?\s*:?\s*([6789]\d{8})\b/i) || enSuAltura.match(/\b([6789]\d{8})\b/);
        if (tel) r.telefono = tel[1];
    }

    const rem = bloqueBajoEtiqueta(celdas, ETIQUETA_REMITENTE, ancho);
    if (rem && rem.lineas.length) r.remitente = rem.lineas[0];

    const kilos = valorDeEtiqueta(celdas, /^(kilos|peso)\b/i, ancho, /^\d{1,5}([.,]\d{1,3})?$/);
    if (kilos) r.kilos = leerNumero(kilos);

    const bultos = valorDeEtiqueta(celdas, /^(n[º°o]?\.?\s*)?bultos\b/i, ancho, /^\d{1,4}$/);
    if (bultos) r.bultos = parseInt(bultos, 10);

    const exp = valorDeEtiqueta(celdas, /^(n[º°o]?\.?\s*)?exped\w*\b[^\s]*/i, ancho, /^[\d\s-]{6,25}$/);
    if (exp) r.expedicion = exp.replace(/\s+/g, '');

    return r;
}

// La línea con el NIF de la delegación de la agencia separa sus datos de los del
// cliente. Un "Tlf:" suelto no vale de frontera: puede ser el del propio destinatario.
const ES_LINEA_NIF = /\b(nif|cif)\b/i;
const ES_LINEA_CP_DELANTE = /^(\d{5})\s*[-–,]?\s*([^\d].*)$/;
const ES_LINEA_CP_DETRAS = /^(.+?)[\s,–-]+(\d{5})$/;
// Donde termina el bloque de direcciones y empiezan los datos de la mercancía.
const FIN_DE_BLOQUE = /^(bultos|contenido|kilos|peso|volumen|recib[ií]|tipo de portes|zona\s*:)/i;

function partirCp(linea) {
    const s = limpiar(linea);
    let m = s.match(ES_LINEA_CP_DELANTE);
    if (m) return { cp: m[1], poblacion: limpiar(m[2]) };
    m = s.match(ES_LINEA_CP_DETRAS);
    if (m) return { cp: m[2], poblacion: limpiar(m[1]) };
    return null;
}

const TELEFONO = /\b[6789]\d{8}\b/;

// Bloque de destinatario: entre la última línea de NIF/Tlf de la agencia de
// destino y la última línea "CP-POBLACIÓN" que aparece antes de BULTOS.
function leerDestinatario(textoColumna) {
    const lineas = lineasDe(textoColumna);
    const fin = lineas.findIndex(l => FIN_DE_BLOQUE.test(sinAcentos(l)));
    const zona = fin >= 0 ? lineas.slice(0, fin) : lineas;

    let idxCp = -1;
    for (let i = zona.length - 1; i >= 0; i--) {
        if (partirCp(zona[i])) { idxCp = i; break; }
    }
    if (idxCp < 0) return { destinatario: '', direccion: '', poblacion: '', cp: '', telefono: '' };

    let inicio = -1;
    for (let i = idxCp - 1; i >= 0; i--) {
        if (ES_LINEA_NIF.test(zona[i])) { inicio = i; break; }
    }
    let bloque = inicio >= 0
        ? zona.slice(inicio + 1, idxCp)
        : zona.slice(Math.max(0, idxCp - 3), idxCp).filter(l => !/^(destino|destinatario|consignatario)/i.test(l));

    // Si el OCR ha dejado dentro un encabezado tipo "Destinatario:", fuera.
    bloque = bloque.filter(l => !/^(destino|destinatario|consignatario)\s*:?\s*$/i.test(l));

    const { cp, poblacion } = partirCp(zona[idxCp]);
    const telefono = (bloque.join(' ').match(TELEFONO) || [])[0] || '';
    const sinTelefono = bloque.map(l => l.replace(/\b(tl?f|tel|telefono|teléfono)\.?\s*:?\s*[6789]\d{8}\b/i, '').replace(TELEFONO, '')).map(limpiar).filter(Boolean);

    return {
        destinatario: sinTelefono[0] || '',
        direccion: sinTelefono.slice(1).join(', '),
        poblacion,
        cp,
        telefono,
    };
}

// Remitente: primera línea con nombre después del NIF/Tlf de la agencia de
// origen, antes de TIPO DE PORTES. Si no hay NIF, la línea que sigue a "Remitente".
function leerRemitente(textoColumna) {
    const lineas = lineasDe(textoColumna);
    const fin = lineas.findIndex(l => FIN_DE_BLOQUE.test(sinAcentos(l)));
    const zona = fin >= 0 ? lineas.slice(0, fin) : lineas;

    const idxNif = zona.findIndex(l => ES_LINEA_NIF.test(l));
    if (idxNif >= 0) {
        const candidata = zona.slice(idxNif + 1).find(l => !partirCp(l) && !/^(origen|remitente)\s*:?/i.test(l));
        if (candidata) return candidata;
    }
    const idxRem = zona.findIndex(l => /^remitente\s*:?\s*(.*)$/i.test(l));
    if (idxRem >= 0) {
        const enLinea = limpiar(zona[idxRem].replace(/^remitente\s*:?/i, ''));
        if (enLinea) return enLinea;
        if (zona[idxRem + 1]) return zona[idxRem + 1];
    }
    return '';
}

function leerNumero(texto) {
    if (!texto) return null;
    const n = parseFloat(String(texto).replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
}

/**
 * Interpreta el texto de un albarán de agencia.
 *
 * @param {string | {izquierda?: string, derecha?: string, todo?: string}} entrada
 *   Texto plano, o el resultado de repartirEnColumnas.
 */
export function interpretarAlbaran(entrada) {
    const esTexto = typeof entrada === 'string';
    const todo = esTexto ? entrada : (entrada?.todo || '');
    const izquierda = esTexto ? entrada : (entrada?.izquierda || '');
    const derecha = esTexto ? entrada : (entrada?.derecha || '');
    const plano = sinAcentos(todo);

    // Expedición. Las agencias la imprimen como "0334-000108683655": un código con
    // guion que no se parece a nada más de la hoja, así que se busca primero en
    // todo el texto. Con el OCR real la etiqueta "EXPEDICIÓN" y el número acaban
    // separados por otras líneas (la fecha de salida se cuela en medio).
    let expedicion = '';
    let m = plano.match(/\b(\d{3,4}-\d{8,15})\b/);
    if (m) expedicion = m[1];
    // Primero por etiquetas (celdas con posición): vale para cualquier diseño en
    // el que los datos lleven su rótulo. Lo que no salga por ahí se intenta con
    // las columnas (TXT y parecidos) y con el texto plano.
    const porEtiquetas = esTexto ? {} : leerPorEtiquetas(entrada?.celdas, entrada?.ancho);

    if (!expedicion && porEtiquetas.expedicion) expedicion = porEtiquetas.expedicion;
    if (!expedicion) {
        m = plano.match(/exped\w*[\s\S]{0,150}?\b(\d{8,20})\b/i);
        if (m) expedicion = m[1];
    }
    if (!expedicion) {
        m = plano.match(/referencias?\s*:?\s*([A-Z0-9][A-Z0-9-]{4,})/i);
        if (m) expedicion = m[1];
    }

    let bultos = porEtiquetas.bultos ?? null;
    if (!bultos) {
        m = plano.match(/\b(\d{1,4})\s*bultos?\b/i) || plano.match(/bultos\W{0,10}(\d{1,4})\b/i);
        bultos = m ? parseInt(m[1], 10) : null;
    }

    let kilos = porEtiquetas.kilos ?? null;
    if (kilos === null) {
        m = plano.match(/(?:kilos|peso)\W{0,10}(\d{1,5}(?:[.,]\d{1,3})?)/i);
        kilos = m ? leerNumero(m[1]) : null;
    }

    let porte = '';
    m = plano.match(/portes?\W{0,15}(?:p\.?\s*)?(pagad|debid)/i);
    if (m) porte = /pagad/i.test(m[1]) ? 'Pagado' : 'Debido';
    else if (/\bp\.?\s*pagados?\b|\(pagados?\)/i.test(plano)) porte = 'Pagado';
    else if (/\bp\.?\s*debidos?\b|\(debidos?\)/i.test(plano)) porte = 'Debido';

    m = plano.match(/reembolso\w*\s*:?\s*(\d{1,6}[.,]\d{2})\s*(?:€|eur)?/i);
    const reembolso = m ? leerNumero(m[1]) : 0;

    const destinatario = porEtiquetas.destinatario
        ? { destinatario: porEtiquetas.destinatario, direccion: porEtiquetas.direccion || '', poblacion: porEtiquetas.poblacion || '', cp: porEtiquetas.cp || '', telefono: porEtiquetas.telefono || '' }
        : leerDestinatario(derecha);
    const remitente = porEtiquetas.remitente || leerRemitente(izquierda);

    return {
        expedicion,
        remitente,
        ...destinatario,
        bultos,
        kilos,
        porte,
        reembolso: reembolso || 0,
    };
}
