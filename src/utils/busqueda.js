// Búsqueda de texto de la aplicación.
//
// El buscador de envíos antes solo miraba `client`, que es el remitente (o el
// pagador según el porte). Si el albarán iba a nombre de PECOMARK y lo recibía
// David Gutiérrez, buscar "David Gutiérrez" no devolvía nada. Aquí se busca en
// las dos partes y en la ruta, sin depender de quién paga.

export const normalizarTexto = (val) => String(val ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

// Todas las palabras del término tienen que aparecer, aunque estén en campos
// distintos: "pecomark priego" encuentra el envío de PECOMARK a Priego.
// El separador evita que se peguen dos campos y salgan coincidencias falsas.
export const coincideEnCampos = (valores, termino) => {
    const palabras = normalizarTexto(termino).split(' ').filter(Boolean);
    if (palabras.length === 0) return true;
    const texto = (Array.isArray(valores) ? valores : [valores])
        .map(normalizarTexto)
        .filter(Boolean)
        .join(' | ');
    return palabras.every((palabra) => texto.includes(palabra));
};

export const CAMPOS_BUSCABLES_ENVIO = [
    'id',
    'client',          // remitente / cliente que factura
    'originName',      // nombre del remite cuando el porte es Debido
    'destinationName', // destinatario
    'origin',
    'destination',
    'destinationCity',
    'clientNif',
    'clientPhone'
];

export const coincideBusqueda = (envio, termino) => coincideEnCampos(
    CAMPOS_BUSCABLES_ENVIO.map((campo) => envio?.[campo]),
    termino
);
