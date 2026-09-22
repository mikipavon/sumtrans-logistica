import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getPackagesCount, papelDelClienteEnElEnvio } from './shipmentUtils';
import { fechaSinHora } from './fechaSinHora';

/**
 * Manifiesto de carga del portal del cliente.
 *
 * Es la hoja que el cliente imprime para que el conductor le firme lo que se
 * lleva: una fila por envío del día (o del rango de fechas que tenga puesto),
 * con destinatario, dirección, bultos y kilos y los totales al pie. Lo pidió un
 * cliente que ya lo tenía con otra agencia.
 *
 * NUNCA lleva importes: ni el porte (ver [[los-importes-son-de-quien-paga]]) ni
 * el reembolso. Lo firma un conductor y va por ahí en papel; el dinero se mira
 * en el albarán, no aquí.
 */

const ESTADO_ANULADO = 'Anulado';
export const TRANSPORTISTA = 'SUM Transportes';

const NAVY = [0, 45, 114];
const DGRAY = [71, 85, 105];
const BLACK = [15, 23, 42];

const kilosDe = (envio) => {
    const kg = parseFloat(envio?.weightKg);
    return Number.isFinite(kg) && kg > 0 ? kg : 0;
};

const numeroDeAlbaran = (id) => {
    const m = String(id ?? '').match(/\d+/);
    return m ? parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
};

/**
 * Qué envíos entran en el manifiesto de entre los que el portal tiene en
 * pantalla (ya filtrados por fechas y buscador).
 *
 * - Sólo lo que el cliente MANDA: lo que recibe no se lo lleva ningún conductor
 *   de su nave, así que no hay nada que firmar.
 * - Fuera los anulados.
 * - Sin filtro de fechas puesto, sólo los de hoy: el uso normal es "lo que sale
 *   esta tarde", y sin esta guarda saldría el histórico entero del cliente.
 *
 * Salen ordenados por número de albarán, que es como se cotejan contra los
 * paquetes.
 */
export const enviosDelManifiesto = (envios, client, { hayFiltroDeFechas = false, hoy = new Date() } = {}) => {
    const diaDeHoy = fechaSinHora(hoy);
    return (envios || [])
        .filter((s) => papelDelClienteEnElEnvio(s, client) === 'Remitente')
        .filter((s) => s.status !== ESTADO_ANULADO)
        .filter((s) => hayFiltroDeFechas || fechaSinHora(s.createdAt || s.date) === diaDeHoy)
        .sort((a, b) => numeroDeAlbaran(a.id) - numeroDeAlbaran(b.id));
};

export const COLUMNAS_DEL_MANIFIESTO = ['Albarán', 'Destinatario', 'Dirección', 'Población', 'Bultos', 'Kg', 'Ref. cliente', 'Observaciones'];

/** Una fila por envío, con las columnas de COLUMNAS_DEL_MANIFIESTO. Sin importes. */
export const filasDelManifiesto = (envios) => (envios || []).map((s) => {
    const kg = kilosDe(s);
    const poblacion = [s.destinationZip, s.destinationCity || s.destination].filter(Boolean).join(' ');
    return [
        String(s.id ?? ''),
        s.destinationName || '',
        s.destinationAddress || (s.destinationCity ? '' : s.destination || ''),
        poblacion,
        String(getPackagesCount(s)),
        kg ? String(kg).replace('.', ',') : '',
        s.clientReference || '',
        s.observations || '',
    ];
});

/** Envíos, bultos y kilos que suman las filas. */
export const totalesDelManifiesto = (envios) => (envios || []).reduce(
    (t, s) => ({
        envios: t.envios + 1,
        bultos: t.bultos + getPackagesCount(s),
        kilos: Math.round((t.kilos + kilosDe(s)) * 100) / 100,
    }),
    { envios: 0, bultos: 0, kilos: 0 }
);

const lineaDeFicha = (client) => [
    client?.cif,
    client?.address,
    [client?.zip, client?.city].filter(Boolean).join(' '),
    client?.phone ? `Tel. ${client.phone}` : '',
].filter(Boolean).join(' · ');

// ── Logos ──
//
// Como en las etiquetas: el nuestro siempre, y el del cliente si lo tiene (el de
// la agencia que le puso la oficina, o el que subió él en Configuración).
//
// jsPDF sólo pega PNG y JPEG, y el nuestro es un SVG y el del cliente puede ser
// cualquier cosa, así que se pasan por un canvas y salen como PNG. Nunca lanza:
// un logo que no carga (sin red, ruta rota, formato raro) deja el hueco vacío y
// el manifiesto sale igual. Fuera del navegador (tests) no hay canvas y se
// devuelve null.

export const LOGO_SUM = '/logo-sum.svg';

export const logoParaPdf = (src, { esperaMax = 8000 } = {}) => new Promise((resolveFinal) => {
    if (!src || typeof document === 'undefined' || typeof Image === 'undefined') return resolveFinal(null);
    // Un logo de agencia en un almacén lento no puede tener al cliente esperando
    // sin fin: pasado el plazo, el manifiesto sale sin él.
    let resuelto = false;
    let reloj;
    const resolve = (valor) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(reloj);
        resolveFinal(valor);
    };
    reloj = setTimeout(() => resolve(null), esperaMax);
    try {
        const img = new Image();
        // Los logos de agencia viven en el almacén de Supabase: sin esto el canvas
        // queda "sucio" y toDataURL lanza.
        if (!String(src).startsWith('data:')) img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const ancho = img.naturalWidth || img.width;
                const alto = img.naturalHeight || img.height;
                if (!ancho || !alto) return resolve(null);
                // Un SVG chico se rasteriza borroso: se escala a un ancho decente.
                // Sin pasarse: jsPDF guarda el PNG sin comprimir y cada logo de
                // 600 px ya pesa medio mega en el PDF.
                const escala = Math.max(1, Math.min(4, 600 / ancho));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(ancho * escala);
                canvas.height = Math.round(alto * escala);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                const dataUrl = canvas.toDataURL('image/png');
                canvas.width = 0;
                canvas.height = 0;
                resolve({ dataUrl, ancho, alto });
            } catch {
                resolve(null);
            }
        };
        img.onerror = () => resolve(null);
        img.src = src;
    } catch {
        resolve(null);
    }
});

export const logoDelCliente = (client) => client?.agencyLogoUrl || client?.customLogo || null;

export const cargarLogosDelManifiesto = async (client, opciones) => {
    const [sum, cliente] = await Promise.all([
        logoParaPdf(LOGO_SUM, opciones),
        logoParaPdf(logoDelCliente(client), opciones),
    ]);
    return { sum, cliente };
};

// Pega un logo dentro de una caja de maxAncho x maxAlto (mm) sin deformarlo.
// `alinear` 'derecha' lo pega al borde derecho de la caja. Devuelve lo que ocupa.
const pegarLogo = (doc, logo, x, y, maxAncho, maxAlto, alinear = 'izquierda') => {
    if (!logo?.dataUrl) return { ancho: 0, alto: 0 };
    const escala = Math.min(maxAncho / logo.ancho, maxAlto / logo.alto);
    const ancho = logo.ancho * escala;
    const alto = logo.alto * escala;
    const xReal = alinear === 'derecha' ? x + maxAncho - ancho : x;
    try {
        const formato = /^data:image\/jpe?g/i.test(logo.dataUrl) ? 'JPEG' : 'PNG';
        doc.addImage(logo.dataUrl, formato, xReal, y, ancho, alto);
        return { ancho, alto };
    } catch {
        return { ancho: 0, alto: 0 };
    }
};

/**
 * Monta el documento (sin descargarlo), para poder comprobarlo en los tests.
 * Apaisado, como el listado que trae el cliente de la otra agencia: ocho
 * columnas no caben legibles en vertical.
 *
 * `logos` viene de cargarLogosDelManifiesto; sin él la cabecera sale sólo con
 * texto.
 */
export const crearDocumentoDeManifiesto = ({ client, envios, fecha = new Date(), transportista = TRANSPORTISTA, logos = {} }) => {
    const doc = new jsPDF({ orientation: 'landscape' });
    const pW = doc.internal.pageSize.getWidth();
    const pH = doc.internal.pageSize.getHeight();
    const M = 12;
    const fechaStr = fecha.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // ── Cabecera ──
    // Izquierda: logo del cliente (si lo tiene) y su ficha. Derecha: nuestro
    // logo, la fecha y el transportista. El título va entre los dos.
    const altoLogos = 16;
    const logoCliente = pegarLogo(doc, logos.cliente, M, 10, 50, altoLogos);
    const logoSum = pegarLogo(doc, logos.sum, pW - M - 45, 10, 45, altoLogos, 'derecha');

    let yIzq = logoCliente.alto ? 10 + logoCliente.alto + 6 : 18;
    doc.setTextColor(...BLACK);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(client?.name || 'Cliente', M, yIzq);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...DGRAY);
    const ficha = lineaDeFicha(client);
    if (ficha) { yIzq += 5; doc.text(ficha, M, yIzq); }

    let yDer = logoSum.alto ? 10 + logoSum.alto + 6 : 18;
    doc.setTextColor(...BLACK);
    doc.setFontSize(11);
    doc.text(`Fecha: ${fechaStr}`, pW - M, yDer, { align: 'right' });
    yDer += 6;
    doc.text(`Transportista: ${transportista}`, pW - M, yDer, { align: 'right' });

    const yLinea = Math.max(yIzq, yDer) + 4;
    doc.setDrawColor(...NAVY);
    doc.setLineWidth(0.6);
    doc.line(M, yLinea, pW - M, yLinea);

    doc.setTextColor(...NAVY);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Manifiesto de carga', pW / 2, yLinea + 8, { align: 'center' });

    // ── Tabla ──
    const filas = filasDelManifiesto(envios);
    const totales = totalesDelManifiesto(envios);
    autoTable(doc, {
        startY: yLinea + 12,
        margin: { left: M, right: M },
        head: [COLUMNAS_DEL_MANIFIESTO],
        body: filas,
        foot: [[
            { content: `Total: ${totales.envios} envíos`, colSpan: 4 },
            String(totales.bultos),
            totales.kilos ? String(totales.kilos).replace('.', ',') : '',
            '', '',
        ]],
        theme: 'grid',
        // El total sólo al final, y ninguna fila partida entre dos hojas (una
        // población a medias en la hoja siguiente parece otro envío).
        showFoot: 'lastPage',
        rowPageBreak: 'avoid',
        headStyles: { fillColor: NAVY, textColor: 255, fontStyle: 'bold' },
        footStyles: { fillColor: [226, 232, 240], textColor: BLACK, fontStyle: 'bold' },
        styles: { fontSize: 9, cellPadding: 2, valign: 'middle', overflow: 'linebreak' },
        columnStyles: {
            0: { cellWidth: 24, fontStyle: 'bold' },
            1: { cellWidth: 48 },
            2: { cellWidth: 52 },
            3: { cellWidth: 36 },
            4: { cellWidth: 16, halign: 'right' },
            5: { cellWidth: 16, halign: 'right' },
            6: { cellWidth: 28 },
            7: { cellWidth: 'auto' },
        },
    });

    // Sin recuadros de firma (Miguel, 22/09/2026): el conductor firma sobre la
    // hoja, como en el manifiesto de la otra agencia.

    // Pie con la página, para que un manifiesto de dos hojas no se quede a medias.
    const paginas = doc.internal.getNumberOfPages();
    for (let p = 1; p <= paginas; p++) {
        doc.setPage(p);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...DGRAY);
        doc.text(`${client?.name || ''} · Manifiesto de carga ${fechaStr} · pág. ${p}/${paginas}`, pW / 2, pH - 6, { align: 'center' });
    }

    return { doc, filas, totales, fechaStr };
};

const nombreDeFichero = (client, fechaStr) =>
    `Manifiesto_${client?.name || 'Cliente'}_${fechaStr.replace(/\//g, '-')}`.replace(/\s+/g, '_') + '.pdf';

/** Genera y descarga el manifiesto, con los logos. Devuelve cuántos envíos lleva. */
export const descargarManifiesto = async ({ client, envios, fecha = new Date() }) => {
    if (!envios || envios.length === 0) return 0;
    const logos = await cargarLogosDelManifiesto(client);
    const { doc, fechaStr } = crearDocumentoDeManifiesto({ client, envios, fecha, logos });
    doc.save(nombreDeFichero(client, fechaStr));
    return envios.length;
};
