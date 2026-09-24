// ── Qué envíos tienen las etiquetas por imprimir ──
//
// Un cliente pidió imprimir de una vez las etiquetas de todos los envíos del
// día en vez de ir albarán por albarán (24/09/2026). Pero su día no es de una
// sola tacada: crea por la mañana e imprime, recogemos a media mañana, y por la
// tarde crea más pedidos. Al volver a pulsar no le pueden salir otra vez las de
// la mañana, así que el botón saca sólo las que faltan:
//
// - Del día (o del rango de fechas puesto), de lo que él MANDA y sin anulados:
//   el mismo conjunto que el manifiesto de carga.
// - Sin `labelsPrintedAt`: cada envío guarda cuándo se imprimieron sus
//   etiquetas, desde el botón de arriba o desde la impresora de su fila.
// - Que el cliente todavía pueda tocar: lo que ya hemos recogido o puesto en
//   marcha ya se fue, sus etiquetas no hacen falta... y además la base de datos
//   no dejaría apuntar que se imprimieron (fase 31), y saldrían siempre.
//
// Para repetir una etiqueta está la impresora de cada fila, que no mira nada.

import { enviosDelManifiesto } from './manifiestoDeCarga';
import { elClientePuedeTocarlo } from './envioDelPortal';

/** true si ya se mandaron a imprimir las etiquetas de este envío. */
export const etiquetasImpresas = (envio) => Boolean(envio?.labelsPrintedAt);

export const enviosPendientesDeEtiqueta = (envios, client, opciones = {}) =>
    enviosDelManifiesto(envios, client, opciones)
        .filter((s) => !etiquetasImpresas(s))
        .filter((s) => elClientePuedeTocarlo(s, client));
