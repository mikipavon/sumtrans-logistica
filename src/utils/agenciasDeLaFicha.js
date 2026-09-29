// ── De qué agencia es una ficha pendiente ──
//
// En Validar Clientes casi todo lo que cae son destinatarios de TSB, TXT y XPO
// que se apuntan solos al entregarles. No son clientes de SUM y hay días en que
// sólo estorban: la oficina quiere poder quitarlos de la vista para repasar lo
// suyo, y volver a ponerlos cuando toque.
//
// La agencia se saca de dos sitios, por este orden:
//   1. La bolsa de la ficha (`ownerAgencyId`, ver agencyOwnership.js). Es lo que
//      se grabó al crearla y lo que la fila enseña en ámbar.
//   2. Si no tiene bolsa —las fichas de antes de que existieran—, quién le mandó
//      la mercancía (ver quienMandoLaMercancia.js).
//
// ── En la duda, la ficha se ve ────────────────────────────────────────────────
// Esconder es el lado peligroso: una ficha nuestra oculta es una ficha que nadie
// valida. Por eso por el camino 2 sólo cuenta como de agencia la que ha recibido
// TODO de agencias; con un solo albarán de un cliente de SUM se queda a la vista.

export const AGENCIAS = [
    { clave: 'tsb', nombre: 'TSB' },
    { clave: 'txt', nombre: 'TXT' },
    { clave: 'xpo', nombre: 'XPO' },
];

// Palabra entera, como en marca.js, para que EXPODISEÑO no cuente como XPO. Las
// letras sueltas se juntan aparte para que "T.S.B." siga siendo TSB.
const claveDeAgencia = (...textos) => {
    for (const texto of textos) {
        const palabras = String(texto || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .toLowerCase()
            .split(/[^a-z0-9]+/)
            .filter(Boolean);
        const junto = palabras.join('');
        const agencia = AGENCIAS.find(a => palabras.includes(a.clave) || junto === a.clave);
        if (agencia) return agencia.clave;
    }
    return '';
};

/**
 * Las agencias de las que es esta ficha: ['tsb'], ['tsb', 'xpo']... o [] si es
 * nuestra, si no se sabe, o si la agencia no es ninguna de las tres.
 *
 * @param mando lo que devuelve quienMandoLaMercancia para esta ficha, o null.
 */
export function agenciasDeLaFicha(client, clients = [], mando = null) {
    if (!client) return [];

    if (client.ownerAgencyId) {
        const agencia = (clients || []).find(c => c && String(c.id) === String(client.ownerAgencyId));
        const clave = agencia ? claveDeAgencia(agencia.name, agencia.agencyLabel, agencia.legalName) : '';
        return clave ? [clave] : [];
    }

    // A un remitente `todos` le dice a quién mandó, no por qué agencia llegó.
    if (!mando || mando.sentido !== 'recibe') return [];

    const claves = (mando.todos || []).map(r => claveDeAgencia(r?.nombre));
    if (claves.length === 0 || claves.some(c => c === '')) return [];
    return [...new Set(claves)];
}

/** true si TODAS las agencias de la ficha están entre las que se han quitado de la vista. */
export function estaOcultaPorAgencia(agencias, ocultas) {
    if (!Array.isArray(agencias) || agencias.length === 0) return false;
    return agencias.every(a => (ocultas || []).includes(a));
}
