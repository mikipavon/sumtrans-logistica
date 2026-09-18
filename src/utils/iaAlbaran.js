// Lectura de albaranes de agencia con IA: manda la hoja a la función
// leer-albaran de Supabase, que es la que tiene la clave de OpenRouter.
//
// Con fotos de móvil lee mucho mejor que Tesseract (ocrAlbaran.js): con un TSB
// real torcido, Gemini 2.5 Flash-Lite sacó todos los campos, bultos y kilos
// incluidos, por unos 0,0003 $ la hoja. Tesseract se queda de respaldo por si
// no hay conexión o se acaba el saldo.

import { supabase } from '../lib/supabase';
import { normalizarCamposIA } from './lecturaAlbaranIA';

// Lado mayor con el que se manda la hoja. A 1600 px la letra de las casillas se
// lee de sobra y la foto pesa unos 200-300 KB; más grande sólo gasta más.
const LADO_ENVIO = 1600;
const CALIDAD_JPEG = 0.85;

function lienzoAJpeg(lienzo) {
    const escala = Math.min(1, LADO_ENVIO / Math.max(lienzo.width, lienzo.height));
    let origen = lienzo;
    if (escala < 1) {
        origen = document.createElement('canvas');
        origen.width = Math.round(lienzo.width * escala);
        origen.height = Math.round(lienzo.height * escala);
        const ctx = origen.getContext('2d');
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(lienzo, 0, 0, origen.width, origen.height);
    }
    return origen.toDataURL('image/jpeg', CALIDAD_JPEG);
}

/** El error de una Edge Function viene escondido en el cuerpo de la respuesta. */
async function motivoDelFallo(error) {
    try {
        const cuerpo = await error?.context?.json?.();
        if (cuerpo?.error) return { mensaje: cuerpo.error, sinSaldo: Boolean(cuerpo.sinSaldo) };
    } catch { /* la respuesta no traía JSON */ }
    return { mensaje: error?.message || 'error desconocido', sinSaldo: false };
}

export class ErrorLecturaIA extends Error {
    constructor(mensaje, { sinSaldo = false } = {}) {
        super(mensaje);
        this.sinSaldo = sinSaldo;
    }
}

/**
 * Lee una hoja con la IA.
 * @param {HTMLCanvasElement} lienzo
 * @returns {Promise<{campos: object, coste: number|null, modelo: string}>}
 * @throws {ErrorLecturaIA}
 */
export async function leerHojaConIA(lienzo) {
    const imagen = lienzoAJpeg(lienzo);
    const { data, error } = await supabase.functions.invoke('leer-albaran', { body: { accion: 'leer', imagen } });
    if (error) {
        const { mensaje, sinSaldo } = await motivoDelFallo(error);
        throw new ErrorLecturaIA(mensaje, { sinSaldo });
    }
    return { campos: normalizarCamposIA(data?.campos), coste: data?.coste ?? null, modelo: data?.modelo || '' };
}

/** Saldo de OpenRouter para el panel de consumo (en dólares). */
export async function consultarSaldoIA() {
    const { data, error } = await supabase.functions.invoke('leer-albaran', { body: { accion: 'saldo' } });
    if (error) throw new ErrorLecturaIA((await motivoDelFallo(error)).mensaje);
    return data;
}
