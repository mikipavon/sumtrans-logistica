import { mensajeDeFacturaSimplificada } from './facturaSimplificada';
import { abrirWhatsApp } from './whatsappLink';

/**
 * El botón "Enviar por WhatsApp" de la ventana de la factura simplificada.
 *
 * Un wa.me sólo lleva texto, así que el PDF se sube a Supabase y en el mensaje va
 * el enlace para descargarlo. El número sigue saliendo solo: es el del recuadro.
 *
 * La ventana de la factura es HTML suelto (no puede importar nada), así que esto
 * vive en la app y printSimplifiedInvoice se lo cuelga a la ventana como
 * `__enviarFactura`; su script lo llama con el móvil ya comprobado.
 *
 * Si el PDF no sube (sin cobertura, o el contenedor aún no existe), NO se manda
 * nada a escondidas: se dice por qué y la segunda pulsación manda sólo el texto,
 * como antes.
 *
 * `generarPdf` y `subir` se inyectan para poder probarlo.
 */
export const prepararEnvioConPdf = (datos, ventana, {
    generarPdf = async (d) => (await import('./facturaSimplificadaPdf')).facturaSimplificadaPdf(d),
    subir = async (pdf, ref) => (await import('./storage')).subirFacturaSimplificada(pdf, ref),
} = {}) => {
    let enlace = null;        // el PDF se sube una vez aunque se mande a dos números
    let fallo = false;        // tras un fallo, la siguiente pulsación va sin PDF
    let ocupado = false;

    return async (numero) => {
        if (ocupado) return null;
        const doc = ventana.document;
        const boton = doc.getElementById('wa-boton');
        const aviso = doc.getElementById('wa-aviso');
        const decir = (t) => { if (aviso) aviso.textContent = t; };

        if (!enlace && !fallo) {
            ocupado = true;
            if (boton) boton.disabled = true;
            decir('Preparando el PDF…');
            try {
                enlace = await subir(await generarPdf(datos), datos.ref);
            } catch (error) {
                fallo = true;
                decir(`No se ha podido adjuntar el PDF (${error?.message || 'error'}). ` +
                    'Pulsa otra vez para mandarla sólo en texto.');
                return null;
            } finally {
                ocupado = false;
                if (boton) boton.disabled = false;
            }
        }

        decir('');
        const mensaje = mensajeDeFacturaSimplificada(datos, enlace);
        abrirWhatsApp({ telefono: numero, mensaje, ventana, documento: doc });
        return { enlace, mensaje };
    };
};
