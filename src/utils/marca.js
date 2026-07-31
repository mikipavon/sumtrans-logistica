/**
 * ¿El albarán es nuestro (logo SUM) o de una agencia?
 *
 * Esto lo decidían dos sitios por separado y no siempre coincidían: la tarjeta del
 * repartidor miraba cuatro señales (logo del envío, etiqueta del envío, etiqueta y
 * logo DEL CLIENTE, y el nombre) mientras que el optimizador solo miraba la etiqueta
 * del envío. Resultado: albaranes con logo de TSB en la tarjeta que el optimizador
 * colocaba en el bloque de los nuestros.
 *
 * Una sola fuente de verdad, la misma para el logo y para el orden de la ruta.
 *
 * Ojo: la prioridad del cliente (urgent / normal) NO entra aquí. Es otro eje: un
 * cliente nuestro marcado como "normal" sigue siendo nuestro y va antes que las
 * agencias, solo que de los últimos entre los nuestros.
 */

export const LOGO_SUM = '/logo-sum.svg';
export const ETIQUETA_SUM = 'sum especial';

const AGENCIAS_CONOCIDAS = [
    { clave: 'tsb', logo: '/logos/tsb_logo.png' },
    { clave: 'xpo', logo: '/logos/xpo_logo.png' },
    { clave: 'txt', logo: '/logos/txt_logo.png' },
];

const norm = (valor) => String(valor || '').toLowerCase().trim();

/** Una etiqueta de marca rellena y distinta de la nuestra significa agencia. */
export const esEtiquetaDeAgencia = (etiqueta) => {
    const e = norm(etiqueta);
    return !!e && e !== ETIQUETA_SUM;
};

const tieneLogoPropio = (url) => !!url && url !== LOGO_SUM;

/**
 * El cliente al que corresponde el envío, con la misma tolerancia que usaba la
 * tarjeta: por nombre, por razón social, o por etiqueta de marca compartida.
 */
export const buscarClienteDeEnvio = (envio, clientes) => {
    if (!envio || !Array.isArray(clientes) || clientes.length === 0) return null;
    const nombreEnvio = norm(envio.client);
    const nombreDestino = norm(envio.destinationName || envio.client);
    const etiqueta = norm(envio.agencyLabel);

    return clientes.find(c => {
        if (!c) return false;
        const nombre = norm(c.name);
        const razon = norm(c.legalName);
        const marca = norm(c.agencyLabel);
        if (nombre && (nombre === nombreEnvio || nombre === nombreDestino)) return true;
        if (razon && (razon === nombreEnvio || razon === nombreDestino)) return true;
        if (esEtiquetaDeAgencia(etiqueta) && marca === etiqueta) return true;
        return false;
    }) || null;
};

/** Una de las agencias que reconocemos por el nombre, si es que es alguna. */
const agenciaPorNombre = (envio, cliente) => {
    const texto = [
        envio?.agencyLabel,
        envio?.client,
        envio?.destinationName,
        cliente?.agencyLabel,
        cliente?.name,
    ].map(norm).join(' ');
    return AGENCIAS_CONOCIDAS.find(a => texto.includes(a.clave)) || null;
};

/**
 * true = es de una agencia (tenemos margen para entregarlo).
 * false = es nuestro, lleva el logo de SUM y va primero.
 */
export const esDeAgencia = (envio, cliente = null) => {
    if (!envio) return false;
    if (tieneLogoPropio(envio.agencyLogoUrl)) return true;
    if (esEtiquetaDeAgencia(envio.agencyLabel)) return true;
    if (cliente) {
        if (tieneLogoPropio(cliente.agencyLogoUrl)) return true;
        if (esEtiquetaDeAgencia(cliente.agencyLabel)) return true;
    }
    return !!agenciaPorNombre(envio, cliente);
};

/** El logo que se pinta en la tarjeta. Mismo orden de preferencia que antes. */
export const resolverLogo = (envio, cliente = null) => {
    if (tieneLogoPropio(envio?.agencyLogoUrl)) return envio.agencyLogoUrl;
    if (cliente?.agencyLogoUrl) return cliente.agencyLogoUrl;
    const conocida = agenciaPorNombre(envio, cliente);
    return conocida ? conocida.logo : LOGO_SUM;
};

/** El distintivo de agencia que se pinta junto a "PARADA #n", o null si es nuestro. */
export const insigniaDeAgencia = (envio, cliente = null) => {
    const conocida = agenciaPorNombre(envio, cliente);
    if (conocida) return conocida.clave.toUpperCase();
    if (esEtiquetaDeAgencia(envio?.agencyLabel)) return String(envio.agencyLabel).toUpperCase();
    if (cliente && esEtiquetaDeAgencia(cliente.agencyLabel)) return String(cliente.agencyLabel).toUpperCase();
    return null;
};
