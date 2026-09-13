// ── De quién venía la mercancía de una ficha pendiente ──
//
// En Validar Clientes casi todo lo que hay son destinatarios que se apuntaron
// solos al entregarles un paquete: un nombre, una calle y un pueblo. Con eso
// delante no hay forma de saber si la ficha vale, porque falta lo único que la
// identifica de verdad: quién le mandó la mercancía. Saber que el paquete se lo
// mandó "PROSERVICE" o "TSB" es lo que permite decidir —o llamar y preguntar—.
//
// La ficha no guarda de qué albarán nació (nadie apuntó el envío al crearla, ni
// las de antes lo tienen), así que esto se saca de los propios envíos: se busca
// el albarán cuyo destinatario se llama igual que la ficha, y se enseña su
// remitente. Con las fichas de tipo Remitente se hace al revés: a quién le
// mandó ella.
//
// ── Lo que no cubre ───────────────────────────────────────────────────────────
// Sólo se mira lo que la app tiene cargado: los envíos activos y los terminados
// de los últimos 90 días (ver App.jsx). Una ficha pendiente desde hace medio año
// se queda sin línea, y eso es lo normal: no es que el dato esté mal, es que su
// albarán ya no se descarga. Por eso, cuando no hay envío, no se pinta nada en
// vez de escribir "se desconoce".

import { normalizarNombreCliente } from './altaClientes';

// `date` es texto en español ("7 sept 2026") y Date no sabe leerlo: para ordenar
// se usa `createdAt`, que es ISO. Sin él, el envío cuenta como el más antiguo.
const momentoDelEnvio = (envio) => {
    const t = Date.parse(envio?.createdAt || '');
    return isNaN(t) ? 0 : t;
};

// El remitente es `originName`; `client` es quien PAGA el porte, que desde los
// portes de intrapoblación puede ser otro. Se cae a `client` sólo si no hay
// originName, que es como nacieron los envíos antiguos.
const nombreDelRemitente = (envio) => String(envio?.originName || envio?.client || '').trim();
const nombreDelDestinatario = (envio) => String(envio?.destinationName || '').trim();

const apuntar = (mapa, clave, envio) => {
    if (!clave) return;
    const lista = mapa.get(clave);
    if (lista) lista.push(envio);
    else mapa.set(clave, [envio]);
};

/**
 * Índice de envíos por nombre de remitente y de destinatario. Se monta una vez
 * para toda la pantalla: recorrer los envíos por cada una de las 500 fichas
 * pendientes deja la lista pegada al desplazarse.
 */
export function indexarEnviosPorCliente(shipments = []) {
    const porDestinatario = new Map();
    const porRemitente = new Map();
    const porFichaDestino = new Map();

    for (const envio of shipments || []) {
        if (!envio) continue;
        apuntar(porDestinatario, normalizarNombreCliente(nombreDelDestinatario(envio)), envio);
        apuntar(porRemitente, normalizarNombreCliente(nombreDelRemitente(envio)), envio);
        // El enlace a nuestra ficha lo escribe la base de datos al guardar el
        // envío, así que ata la ficha a su albarán aunque el nombre se haya
        // corregido a mano después.
        if (envio.destinatarioId != null && envio.destinatarioId !== '') {
            apuntar(porFichaDestino, String(envio.destinatarioId), envio);
        }
    }

    return { porDestinatario, porRemitente, porFichaDestino };
}

const sinRepetir = (...listas) => {
    const vistos = new Set();
    const envios = [];
    for (const lista of listas) {
        for (const envio of lista || []) {
            const clave = envio?.id != null ? String(envio.id) : null;
            if (clave && vistos.has(clave)) continue;
            if (clave) vistos.add(clave);
            envios.push(envio);
        }
    }
    return envios;
};

/**
 * Quién le mandó la mercancía a esta ficha (o a quién se la mandó ella, si la
 * ficha es un remitente).
 *
 * @returns {null | {sentido: 'recibe'|'manda', nombre: string, albaran: string,
 *                   fecha: string, otros: number}}
 *          `otros` es cuántas empresas MÁS aparecen al otro lado, para poder
 *          decir "y 2 más" sin tener que enseñarlas todas.
 */
export function quienMandoLaMercancia(client, indice) {
    if (!client || !indice) return null;

    const esRemitente = String(client?.type || '') === 'Remitente';
    const clave = normalizarNombreCliente(client?.name);
    const yo = clave;

    const candidatos = esRemitente
        ? sinRepetir(indice.porRemitente?.get(clave))
        : sinRepetir(
            client?.id != null ? indice.porFichaDestino?.get(String(client.id)) : null,
            indice.porDestinatario?.get(clave),
        );

    const deInteres = [];
    const nombres = new Set();
    for (const envio of candidatos) {
        const nombre = esRemitente ? nombreDelDestinatario(envio) : nombreDelRemitente(envio);
        const suClave = normalizarNombreCliente(nombre);
        // Sin nombre no hay nada que enseñar, y un envío de uno a sí mismo
        // (remitente y destinatario iguales) sólo repetiría la propia ficha.
        if (!suClave || suClave === yo) continue;
        deInteres.push({ envio, nombre });
        nombres.add(suClave);
    }

    if (deInteres.length === 0) return null;

    // El último, que es el que explica por qué la ficha está ahí ahora.
    let elegido = deInteres[0];
    for (const candidato of deInteres) {
        if (momentoDelEnvio(candidato.envio) > momentoDelEnvio(elegido.envio)) elegido = candidato;
    }

    return {
        sentido: esRemitente ? 'manda' : 'recibe',
        nombre: elegido.nombre,
        albaran: elegido.envio?.id != null ? String(elegido.envio.id) : '',
        fecha: String(elegido.envio?.date || ''),
        otros: Math.max(0, nombres.size - 1),
    };
}
