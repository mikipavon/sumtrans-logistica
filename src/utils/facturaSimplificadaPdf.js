import jsPDF from 'jspdf';
import { EMPRESA, CIF, CORREO_FACTURAS } from './facturaSimplificada';

/**
 * La Factura Simplificada en PDF, con la misma pinta de ticket de 80 mm que la que
 * se imprime. El alto se calcula con lo que lleve: una sola página siempre, sin
 * blancos al final, que en el móvil del cliente se ve entera de un vistazo.
 *
 * Recibe lo que devuelve datosDeFacturaSimplificada: no hace cuentas propias.
 *
 * @returns {Blob} application/pdf
 */

const ANCHO = 80;
const MARGEN = 5;
const DERECHA = ANCHO - MARGEN;
const UTIL = ANCHO - 2 * MARGEN;

const euros = (n) => `${Number(n).toFixed(2)} €`;

// Dibuja sobre `doc` y devuelve dónde acaba. Con doc = null sólo mide: así se sabe
// el alto de la página antes de crearla.
const dibujar = (doc, datos) => {
    let y = MARGEN + 4;
    const medidor = doc || new jsPDF({ unit: 'mm', format: [ANCHO, 200] });
    const partir = (texto, tam) => {
        medidor.setFontSize(tam);
        return medidor.splitTextToSize(String(texto ?? ''), UTIL);
    };
    const texto = (t, x, opciones) => { if (doc) doc.text(t, x, y, opciones); };
    const fuente = (estilo, tam) => { medidor.setFont('courier', estilo); medidor.setFontSize(tam); };
    const raya = (grosor = 0.2, discontinua = false) => {
        if (!doc) return;
        doc.setLineWidth(grosor);
        doc.setLineDashPattern(discontinua ? [0.8, 0.8] : [], 0);
        doc.line(MARGEN, y, DERECHA, y);
        doc.setLineDashPattern([], 0);
    };
    const fila = (izq, der, estilo = 'normal', tam = 9) => {
        fuente(estilo, tam);
        texto(izq, MARGEN);
        texto(der, DERECHA, { align: 'right' });
        y += tam * 0.45;
    };

    // Cabecera
    fuente('bold', 12);
    texto(EMPRESA, ANCHO / 2, { align: 'center' });
    y += 4.5;
    fuente('normal', 9);
    texto(`CIF: ${CIF}`, ANCHO / 2, { align: 'center' });
    y += 5;
    fuente('bold', 10);
    if (doc) {
        doc.setLineWidth(0.5);
        doc.rect(ANCHO / 2 - 24, y - 4, 48, 5.8);
    }
    texto('FACTURA SIMPLIFICADA', ANCHO / 2, { align: 'center' });
    y += 4.5;
    raya(0.5);
    y += 4;

    fila('REF:', `FS-${datos.ref}`, 'bold');
    fila('FECHA:', datos.fecha, 'bold');
    y += 0.5;
    raya(0.1);
    y += 4;

    // Cliente
    fuente('bold', 9);
    texto('DATOS CLIENTE', MARGEN);
    y += 4.2;
    const { nombre, direccion, poblacion, cp, telefono } = datos.cliente;
    const lineasCliente = [
        ...partir(nombre, 9).map(t => ({ t, estilo: 'bold' })),
        ...partir(direccion, 9).map(t => ({ t, estilo: 'normal' })),
        ...(poblacion || cp ? partir(`${poblacion}${cp ? ' ' + cp : ''}`, 9).map(t => ({ t, estilo: 'normal' })) : []),
        ...(telefono ? [{ t: telefono, estilo: 'normal' }] : []),
    ];
    for (const { t, estilo } of lineasCliente) {
        fuente(estilo, 9);
        texto(t, MARGEN);
        y += 4;
    }
    y += 1;

    // Conceptos
    fila('CONCEPTO', 'IMPORTE', 'bold');
    y -= 3;
    raya(0.3);
    y += 4;
    for (const linea of datos.lineas) {
        fuente('normal', 9);
        const anchoTexto = linea.importe === null ? UTIL : UTIL - 20;
        medidor.setFontSize(9);
        const trozos = medidor.splitTextToSize(linea.texto, anchoTexto);
        trozos.forEach((t, i) => {
            texto(t, MARGEN);
            if (i === 0 && linea.importe !== null) texto(euros(linea.importe), DERECHA, { align: 'right' });
            y += 4;
        });
    }
    y -= 2.5;
    raya(0.3);
    y += 4;

    // Totales
    fila('Base Imponible:', euros(datos.base));
    fila('IVA 21%:', euros(datos.iva));
    y -= 2;
    raya(0.6);
    y += 5;
    fila('TOTAL:', euros(datos.total), 'bold', 12);
    y += 2;

    // Factura completa
    const cajaY = y;
    fuente('bold', 8.5);
    y += 4;
    texto('¿Necesita factura completa?', ANCHO / 2, { align: 'center' });
    y += 4;
    fuente('normal', 7.5);
    texto(`Solicítela en ${CORREO_FACTURAS}`, ANCHO / 2, { align: 'center' });
    y += 2.5;
    if (doc) {
        doc.setLineWidth(0.2);
        doc.setLineDashPattern([0.8, 0.8], 0);
        doc.rect(MARGEN, cajaY, UTIL, y - cajaY);
        doc.setLineDashPattern([], 0);
    }
    y += 6;

    fuente('normal', 8);
    texto('Gracias por confiar en SUMTRANS.', ANCHO / 2, { align: 'center' });
    y += MARGEN;
    return y;
};

export const facturaSimplificadaPdf = (datos) => {
    const alto = Math.max(90, dibujar(null, datos));
    const doc = new jsPDF({ unit: 'mm', format: [ANCHO, alto] });
    doc.setProperties({ title: `Factura Simplificada FS-${datos.ref}`, author: EMPRESA });
    dibujar(doc, datos);
    return doc.output('blob');
};
