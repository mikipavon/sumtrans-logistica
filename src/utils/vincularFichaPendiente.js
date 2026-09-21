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
//   1. Que responda al nombre que viene en el albarán. Se le cuelga una SEDE
//      con ese nombre y con lo que trajo la entrega (dirección, GPS, quién
//      recibió). La ficha madre no se toca: su nombre, su tarifa, su número y
//      sus señas son de la oficina. Si el nombre ya coincide con la madre, con
//      su razón social o con una sede, no hace falta sede nueva: sólo se
//      rellenan los huecos de la que coincide.
//   2. Que los albaranes que apuntaban a la ficha pendiente pasen a apuntar a
//      la de siempre (a esa sede), para que el repartidor vea sus datos.
//   3. Borrar la pendiente. A partir de ahí, el emparejado de la base de datos
//      (fase 21/22) engancha solo cualquier albarán con ese nombre, porque el
//      trigger mira también los nombres de las sedes.
//
// Por qué una sede y no la razón social: la razón social sale en facturas y
// no se puede usar de cajón de alias. Una sede es exactamente eso, "así lo
// escriben los remitentes, y ésta es su dirección".
//
// Quién decide es el administrativo, con el aviso de duplicado delante: esto
// no adivina nada. Un nombre parecido puede ser otra empresa de verdad.

import { normalizarNombreCliente } from './altaClientes';
import { leerReceptores, juntarReceptores } from './receptoresHabituales';

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

const LO_QUE_SE_HEREDA = ['coordinates', 'phone', 'address', 'city', 'zip'];

// Dónde encaja el nombre de la pendiente dentro de la ficha de siempre:
// 'madre' (el nombre o la razón social), una sede existente, o ninguna.
const dondeEncaja = (nombre, ficha) => {
    if (nombre === normalizarNombreCliente(ficha?.name) || nombre === normalizarNombreCliente(ficha?.legalName)) {
        return { en: 'madre', sede: null };
    }
    const sede = (Array.isArray(ficha?.branches) ? ficha.branches : [])
        .find(s => s && normalizarNombreCliente(s.name) === nombre);
    return sede ? { en: 'sede', sede } : { en: null, sede: null };
};

/**
 * Qué hay que escribir en la ficha de siempre para que absorba a la pendiente.
 *
 * Devuelve `{ posible: false, motivo }` o
 * `{ posible: true, cambios, sedeId, sedeNueva, hereda }`:
 *   - `cambios`   : lo único que se le escribe a la ficha existente (madre).
 *   - `sedeId`    : la sede a la que quedan atados los albaranes, o null si
 *                   van a la madre.
 *   - `sedeNueva` : true si se ha creado una sede con el nombre del albarán.
 *   - `hereda`    : qué datos de la pendiente se han copiado, para decirlo.
 */
export function planDeVinculo(pendiente, ficha, ahora = Date.now()) {
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

    if (sitio.en === 'madre') {
        const huecos = rellenarHuecos(ficha, pendiente, LO_QUE_SE_HEREDA);
        const cambios = { ...huecos, ...receptoresJuntos(ficha, pendiente) };
        return {
            posible: true,
            cambios,
            sedeId: null,
            sedeNueva: false,
            hereda: Object.keys(huecos).concat(cambios.receivers ? ['receivers'] : []),
        };
    }

    const sedes = Array.isArray(ficha.branches) ? ficha.branches : [];

    if (sitio.en === 'sede') {
        const huecos = rellenarHuecos(sitio.sede, pendiente, LO_QUE_SE_HEREDA);
        const cambiosSede = { ...huecos, ...receptoresJuntos(sitio.sede, pendiente) };
        const cambios = Object.keys(cambiosSede).length > 0
            ? { branches: sedes.map(s => (s === sitio.sede ? { ...s, ...cambiosSede } : s)) }
            : {};
        return {
            posible: true,
            cambios,
            sedeId: sitio.sede.id,
            sedeNueva: false,
            hereda: Object.keys(huecos).concat(cambiosSede.receivers ? ['receivers'] : []),
        };
    }

    // Sede nueva con el nombre tal cual viene en el albarán. La dirección es la
    // de la entrega; si la pendiente no trae alguna parte, se toma la de la
    // madre, que es la misma empresa.
    const sedeNueva = {
        id: `branch_${ahora}`,
        name: String(pendiente.name).trim(),
        address: String(pendiente.address || ficha.address || '').trim(),
        city: String(pendiente.city || ficha.city || '').trim(),
        zip: String(pendiente.zip || ficha.zip || '').trim(),
        province: String(pendiente.province || ficha.province || '').trim(),
        coordinates: String(pendiente.coordinates || '').trim(),
        phone: String(pendiente.phone || '').trim(),
        contactPerson: String(pendiente.contactPerson || '').trim(),
        ...receptoresJuntos(null, pendiente),
    };
    delete sedeNueva.lastReceiver;

    return {
        posible: true,
        cambios: { branches: [...sedes, sedeNueva] },
        sedeId: sedeNueva.id,
        sedeNueva: true,
        hereda: LO_QUE_SE_HEREDA.filter(c => !vacio(pendiente[c])).concat(sedeNueva.receivers ? ['receivers'] : []),
    };
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
    const conLo = hereda.length > 0 ? ` con ${hereda.join(', ')}` : '';

    const queSeHace = plan.sedeNueva
        ? `A ${nombreFicha} se le añade una sede llamada ${nombrePendiente}${conLo}: así responde también a ese nombre, que es como lo escriben en los albaranes.`
        : plan.sedeId
            ? `${nombreFicha} ya tiene una sede con ese nombre: se le rellena${conLo ? ' ' + hereda.join(', ') : 'n los huecos'}.`
            : `${nombreFicha} ya se llama así: se le rellena${conLo ? ' ' + hereda.join(', ') : 'n los huecos'}.`;

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
        `De la ficha no se toca nada más: nombre, tarifa, teléfono y número siguen igual.`,
        ``,
        envios,
        `La solicitud ${nombrePendiente} se borra, y los próximos albaranes con ese nombre irán solos a ${nombreFicha}.`,
        ``,
        `Compruébalo antes: si son dos empresas distintas, el repartidor vería los datos de una en las entregas de la otra.`,
        ``,
        `¿Vincular?`,
    ].join('\n');
}
