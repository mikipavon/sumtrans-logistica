// ── La ficha que nació en una entrega y que ya teníamos en cartera ──
//
// Al entregar, la app busca la ficha del destinatario por nombre EXACTO y, si
// no la encuentra, crea una pendiente con el GPS. Pero el remitente escribe
// "FERRETERIA EL REPUESTO, S.L." y en cartera está como "FERRETERIA EL
// REPUESTO JOAQUIN SALIDO": no casan, y en Validar Clientes sale una segunda
// ficha de la misma empresa. Hasta ahora sólo se podía rechazar (y tirar el
// GPS que tomó el conductor) o aprobar (y tener dos fichas).
//
// Esto es lo que hay que hacer para quedarse con la ficha de siempre:
//
//   1. Que responda al nombre que viene en el albarán. Se le apunta en «Otros
//      nombres» (ver otrosNombres.js): casa igual que el nombre comercial y
//      la razón social, pero no es una sede, no lleva dirección y no sale en
//      la lista como "7 sedes" que no existen. Si el nombre ya coincide con
//      la madre o con una sede, no hay nada que apuntar.
//   2. Que lo que trajo la entrega no se pierda: el GPS, el teléfono y quién
//      recibió van a la ficha (o a la sede que coincida), pero sólo en los
//      huecos. Los datos de la oficina mandan.
//   3. Que los albaranes que apuntaban a la ficha pendiente pasen a apuntar a
//      la de siempre, para que el repartidor vea sus datos.
//   4. Borrar la pendiente. A partir de ahí, el emparejado de la base de datos
//      (fase 30) engancha solo cualquier albarán con ese nombre.
//
// Quién decide es el administrativo, con el aviso de duplicado delante: esto
// no adivina nada. Un nombre parecido puede ser otra empresa de verdad.

import { normalizarNombreCliente } from './altaClientes';
import { leerReceptores, juntarReceptores } from './receptoresHabituales';
import { nombresDeLaMadre, conOtroNombre } from './otrosNombres';
import { baremoDelEnvio, repreciarArticulos, conMinimoFueraDeBaremo } from './precioArticulo';
import { calcularComisionReembolso } from './comisionReembolso';
import { quienPagaElPorte, camposDelPorte } from './shipmentUtils';

const vacio = (valor) => String(valor ?? '').trim() === '';

// Copia en `destino` lo que trae `origen` y a `destino` le falta. Devuelve
// sólo los campos que cambian.
const rellenarHuecos = (destino, origen, campos) => {
    const cambios = {};
    for (const campo of campos) {
        if (vacio(destino?.[campo]) && !vacio(origen?.[campo])) {
            cambios[campo] = origen[campo];
        }
    }
    return cambios;
};

// Los que recibieron en la pendiente van delante: son de las últimas
// entregas. Sin lista nueva no se escribe nada.
const receptoresJuntos = (destino, origen) => {
    const nuevos = leerReceptores(origen);
    if (nuevos.length === 0) return {};
    return { receivers: juntarReceptores(nuevos, leerReceptores(destino)), lastReceiver: null };
};

// Lo que se hereda en la MADRE: sólo lo que no tiene dueño en la oficina. La
// dirección de la madre es la suya aunque esté en blanco: la de la entrega
// puede ser la de otra nave, y eso sería una sede, no un hueco.
const LO_QUE_HEREDA_LA_MADRE = ['coordinates', 'phone'];
// En una sede que ya coincide con ese nombre, la entrega sí completa la
// dirección: es esa nave.
const LO_QUE_HEREDA_LA_SEDE = ['coordinates', 'phone', 'address', 'city', 'zip'];

// Dónde encaja el nombre de la pendiente dentro de la ficha de siempre:
// 'madre' (el nombre, la razón social u otro nombre), una sede, o ninguna.
const dondeEncaja = (nombre, ficha) => {
    if (nombresDeLaMadre(ficha).some(n => normalizarNombreCliente(n) === nombre)) {
        return { en: 'madre', sede: null };
    }
    const sede = (Array.isArray(ficha?.branches) ? ficha.branches : [])
        .find(s => s && normalizarNombreCliente(s.name) === nombre);
    return sede ? { en: 'sede', sede } : { en: null, sede: null };
};

const heredado = (huecos, cambios) => Object.keys(huecos).concat(cambios.receivers ? ['receivers'] : []);

/**
 * Qué hay que escribir en la ficha de siempre para que absorba a la pendiente.
 *
 * Devuelve `{ posible: false, motivo }` o
 * `{ posible: true, cambios, sedeId, otroNombre, hereda }`:
 *   - `cambios`    : lo único que se le escribe a la ficha existente.
 *   - `sedeId`     : la sede a la que quedan atados los albaranes, o null si
 *                    van a la madre.
 *   - `otroNombre` : true si el nombre del albarán se apunta en «Otros nombres».
 *   - `hereda`     : qué datos de la pendiente se han copiado, para decirlo.
 */
export function planDeVinculo(pendiente, ficha) {
    if (!pendiente || !ficha) {
        return { posible: false, motivo: 'falta la solicitud o la ficha' };
    }
    if (String(pendiente.id) === String(ficha.id)) {
        return { posible: false, motivo: 'es la misma ficha' };
    }

    const nombre = normalizarNombreCliente(pendiente.name);
    if (!nombre) {
        return { posible: false, motivo: 'la solicitud no tiene nombre' };
    }

    const sitio = dondeEncaja(nombre, ficha);

    if (sitio.en === 'sede') {
        const huecos = rellenarHuecos(sitio.sede, pendiente, LO_QUE_HEREDA_LA_SEDE);
        const cambiosSede = { ...huecos, ...receptoresJuntos(sitio.sede, pendiente) };
        const cambios = Object.keys(cambiosSede).length > 0
            ? { branches: ficha.branches.map(s => (s === sitio.sede ? { ...s, ...cambiosSede } : s)) }
            : {};
        return { posible: true, cambios, sedeId: sitio.sede.id, otroNombre: false, hereda: heredado(huecos, cambiosSede) };
    }

    const huecos = rellenarHuecos(ficha, pendiente, LO_QUE_HEREDA_LA_MADRE);
    const cambios = { ...huecos, ...receptoresJuntos(ficha, pendiente) };
    const otroNombre = sitio.en !== 'madre';
    if (otroNombre) {
        cambios.otrosNombres = conOtroNombre(ficha, pendiente.name, normalizarNombreCliente);
    }

    return { posible: true, cambios, sedeId: null, otroNombre, hereda: heredado(huecos, cambios) };
}

/**
 * Los albaranes que hay que pasar a la ficha de siempre: los que apuntan a la
 * pendiente, y los que se llaman igual y no apuntan a nadie (nacieron antes de
 * que existiera la pendiente y el trigger no los volvió a mirar).
 */
export function enviosQueSeVinculan(pendiente, shipments = []) {
    if (!pendiente) return [];
    const nombre = normalizarNombreCliente(pendiente.name);
    return (shipments || []).filter(envio => {
        if (!envio) return false;
        if (envio.destinatarioId != null && envio.destinatarioId !== '') {
            return String(envio.destinatarioId) === String(pendiente.id);
        }
        return nombre !== '' && normalizarNombreCliente(envio.destinationName) === nombre;
    });
}

// Lo que se escribe en cada albarán para dejarlo atado a la ficha buena.
export const enlaceDelEnvio = (ficha, plan) => ({
    destinatarioId: ficha.id,
    destinatarioSedeId: plan?.sedeId ?? null,
    destinatarioEmparejadoPor: 'vinculo',
});

// ── El precio del albarán que paga la ficha recién vinculada ──
//
// A porte Debido paga el destinatario. Si cuando nació el albarán no se sabía
// qué ficha era (el cliente lo creó en su portal, que no ve las fichas de los
// demás, y salió a precio de catálogo), al vincularlo ya se sabe: se le pone
// la tarifa de esa ficha y su comisión de reembolso (Miguel, 01/10/2026).
//
// No se toca lo que ya tiene el dinero cerrado: porte cobrado, facturado o
// cerrado en presupuesto. Tampoco si la ficha va por kilos (el porte sale del
// peso y eso lo valora la oficina en el albarán) ni si no hay artículos o
// población con que hacer la cuenta.
//
// Devuelve los campos a escribir en el albarán, o null si el precio no cambia.
export function precioAlVincular(envio, ficha, { tariffs = [], coverageZones = [], comisionPorDefecto = 3 } = {}) {
    if (!envio || !ficha) return null;
    if (quienPagaElPorte(envio) !== 'Destinatario') return null;
    if (envio.portePaid || envio.exportedAt || envio.budgetLiquidated) return null;
    if (ficha.tariffType === 'Por Kilos') return null;
    if (!Array.isArray(envio.articles) || envio.articles.length === 0) return null;
    if (vacio(envio.destinationCity) && vacio(envio.destinationZip)) return null;

    const { baremo, tariffId, fueraDeBaremo } = baremoDelEnvio(envio, { tariffs, coverageZones });
    const { articulos, cambiaron } = repreciarArticulos(envio.articles, { baremo, tariffId, cliente: ficha, destinatario: ficha });

    const comisionAntes = Number(envio.codCommission) || 0;
    const comision = calcularComisionReembolso(ficha, envio.codAmount, comisionPorDefecto);
    if (!cambiaron && Math.abs(comision - comisionAntes) < 0.005) return null;

    const porte = conMinimoFueraDeBaremo(articulos.reduce((suma, a) => suma + a.totalPrice, 0), fueraDeBaremo);
    if (porte <= 0) return null;

    return { articles: articulos, codCommission: comision, ...camposDelPorte(porte + comision) };
}

const NOMBRES = {
    coordinates: 'el GPS',
    phone: 'el teléfono',
    address: 'la dirección',
    city: 'la población',
    zip: 'el código postal',
    receivers: 'quién ha recibido',
};

// El texto del aviso que se le enseña antes de hacerlo. Se escribe aquí,
// junto a la decisión, para que lo prometido sea exactamente lo que se hace.
export function explicarElVinculo(pendiente, ficha, plan, cuantosEnvios = 0) {
    if (!plan?.posible) return '';

    const nombreFicha = `«${ficha?.name || 'la ficha'}»${ficha?.clientNumber ? ` (nº ${ficha.clientNumber})` : ''}`;
    const nombrePendiente = `«${pendiente?.name || 'la solicitud'}»`;
    const hereda = (plan.hereda || []).map(c => NOMBRES[c] || c);
    const seLeCopia = hereda.length > 0 ? `Se le copia ${hereda.join(', ')}.` : 'No trae ningún dato que le falte.';

    const queSeHace = plan.otroNombre
        ? `A ${nombreFicha} se le apunta ${nombrePendiente} en «Otros nombres»: así responde también a ese nombre, que es como lo escriben en los albaranes. No es una sede: no lleva dirección. ${seLeCopia}`
        : plan.sedeId
            ? `${nombreFicha} ya tiene una sede con ese nombre. ${seLeCopia}`
            : `${nombreFicha} ya se llama así. ${seLeCopia}`;

    const envios = cuantosEnvios === 0
        ? 'Ningún albarán cargado apuntaba a la solicitud.'
        : cuantosEnvios === 1
            ? '1 albarán pasa a apuntar a esa ficha.'
            : `${cuantosEnvios} albaranes pasan a apuntar a esa ficha.`;

    return [
        `Es la misma empresa que YA tienes:`,
        ``,
        `   • ${nombreFicha}`,
        ``,
        queSeHace,
        `De la ficha no se toca nada más: nombre, dirección, tarifa y número siguen igual.`,
        ``,
        envios,
        `La solicitud ${nombrePendiente} se borra, y los próximos albaranes con ese nombre irán solos a ${nombreFicha}.`,
        ``,
        `Compruébalo antes: si son dos empresas distintas, el repartidor vería los datos de una en las entregas de la otra.`,
        ``,
        `¿Vincular?`,
    ].join('\n');
}
