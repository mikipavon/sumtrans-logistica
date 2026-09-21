// Lo que devuelve la IA al leer la foto de un albarán (función leer-albaran)
// pasa por aquí antes de llegar a la pantalla de revisión.
//
// El modelo casi siempre devuelve lo pedido, pero no siempre con la forma
// exacta: "14520 " con espacio, bultos como "1", el teléfono con el prefijo
// +34, null donde se esperaba texto… Aquí se deja todo con la forma que usan
// los campos de ImportarAlbaranesAgencia, y lo que no tenga sentido se queda
// vacío para que la oficina lo vea y lo rellene.
//
// El porte (pagado/debido) del papel no se lee: el albarán de una agencia lo
// paga siempre la agencia, sean quienes sean el remitente y el destinatario.
//
// Es código puro, sin navegador ni red, para poder probarlo.

import { normalizarPueblo } from './townMatch';

const texto = (v) => (v === null || v === undefined ? '' : String(v).replace(/\s+/g, ' ').trim());

function numero(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).replace(/[^\d.,-]/g, '');
    if (!s) return null;
    // "1.250,50" y "1250.50" → 1250.5; "5,5" → 5.5
    const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = parseFloat(normal);
    return Number.isFinite(n) ? n : null;
}

function cp(v) {
    const m = texto(v).match(/\b(\d{5})\b/) || texto(v).replace(/\D/g, '').match(/^(\d{5})$/);
    return m ? m[1] : '';
}

function telefono(v) {
    let d = texto(v).replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('34')) d = d.slice(2);
    if (d.length === 13 && d.startsWith('0034')) d = d.slice(4);
    // Sólo un teléfono español de 9 cifras. Un número más largo suele ser un
    // código de cliente o la referencia de la agencia leída como teléfono.
    return /^[6789]\d{8}$/.test(d) ? d : '';
}

/**
 * Deja la lectura de la IA con la forma de los campos de la pantalla de revisión.
 * @param {Record<string, unknown> | null | undefined} bruto
 */
export function normalizarCamposIA(bruto) {
    const b = bruto || {};
    const bultos = numero(b.bultos);
    const kilos = numero(b.kilos);
    const reembolso = numero(b.reembolso);
    return {
        expedicion: texto(b.expedicion),
        remitente: texto(b.remitente),
        destinatario: texto(b.destinatario),
        direccion: texto(b.direccion),
        poblacion: texto(b.poblacion),
        cp: cp(b.cp),
        telefono: telefono(b.telefono),
        bultos: bultos !== null && bultos >= 1 ? Math.round(bultos) : null,
        kilos: kilos !== null && kilos > 0 ? kilos : null,
        reembolso: reembolso !== null && reembolso > 0 ? Math.round(reembolso * 100) / 100 : 0,
        // DAC en TXT, "devolver albarán firmado" en XPO: al repartidor le sale
        // "Recoger firma de vuelta" y se le pide foto del papel firmado.
        devolverFirmado: siONo(b.devolverFirmado),
    };
}

function siONo(v) {
    if (typeof v === 'boolean') return v;
    return /^(true|si|sí|yes|1)$/i.test(texto(v));
}

/**
 * Cuadra la población leída con el código postal.
 *
 * Las etiquetas de agencia ponen "CORDOBA" por todas partes (la delegación de
 * destino, la provincia entre paréntesis) y el lector se lo lleva a la
 * población aunque el CP diga 14920, que es Aguilar de la Frontera. El CP se
 * lee mucho mejor que el nombre (son cinco cifras impresas), así que cuando el
 * CP está en las tablas de pueblos y el nombre leído no es ninguno de los que
 * tienen ese CP, manda el CP: se pone el pueblo de la tabla y se avisa a la
 * oficina de lo que se ha cambiado para que lo vea en la revisión.
 *
 * Un CP puede tener varios pueblos (14911: Llanos de Don Juan, Navas del
 * Selpillar, Jauja): si el leído es uno de ellos, se respeta.
 *
 * @param {{poblacion?: string, cp?: string}} campos
 * @param {Array<{name?: string, zip?: string}>} pueblos tablas de baremo y zonas de cobertura
 * @returns {{campos: object, correccion: string|null}}
 */
export function poblacionSegunCP(campos, pueblos = []) {
    const c = campos || {};
    const cpLimpio = texto(c.cp);
    if (!/^\d{5}$/.test(cpLimpio)) return { campos: c, correccion: null };
    const conEseCP = (pueblos || []).filter(p => String(p?.zip || '').trim() === cpLimpio && texto(p?.name));
    if (conEseCP.length === 0) return { campos: c, correccion: null };
    const leida = normalizarPueblo(c.poblacion);
    if (leida && conEseCP.some(p => normalizarPueblo(p.name) === leida)) return { campos: c, correccion: null };
    const pueblo = texto(conEseCP[0].name);
    const correccion = leida
        ? `Población cambiada por el CP ${cpLimpio}: se leyó «${texto(c.poblacion)}» y se ha puesto ${pueblo}`
        : `Población puesta por el CP ${cpLimpio}: ${pueblo}`;
    return { campos: { ...c, poblacion: pueblo }, correccion };
}

/**
 * Cuántos albaranes se han creado a partir de fotos en el mes de `hoy`.
 * Es lo que enseña el panel de consumo junto al gasto del mes: se cuentan los
 * envíos que dejó la importación por fotos (createdBy lo marca), no las hojas
 * leídas, que incluyen las repetidas y las que se quitaron en la revisión.
 */
export function albaranesPorFotoDelMes(envios, hoy = new Date()) {
    const anio = hoy.getFullYear();
    const mes = hoy.getMonth();
    return (envios || []).filter((s) => {
        if (!String(s?.createdBy || '').includes('Import Fotos')) return false;
        const f = new Date(s.createdAt);
        return !Number.isNaN(f.getTime()) && f.getFullYear() === anio && f.getMonth() === mes;
    }).length;
}

/** Color del saldo que queda: rojo casi a cero, naranja cuando conviene recargar. */
export function nivelDeSaldo(queda) {
    if (queda === null || queda === undefined) return 'desconocido';
    if (queda < 1) return 'rojo';
    if (queda < 3) return 'naranja';
    return 'verde';
}
