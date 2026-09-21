// ── Hasta dónde puede tocar el cliente su propio envío ──
//
// Un envío creado en el portal es del cliente hasta que lo tenemos en la mano:
// mientras siga "Pendiente de asignar" y ningún conductor le haya pasado el
// escáner, puede modificarlo o borrarlo él mismo. En cuanto hay un bulto
// escaneado, o la oficina lo pone en marcha, sólo la administración lo toca.
//
// La misma regla vive en la base de datos
// (supabase/31_el_cliente_toca_su_envio_hasta_el_escaner.sql), y es la que
// manda: aquí sólo se refleja para no enseñar botones que no van a hacer nada
// y para explicarle al cliente por qué ya no puede.

import { papelDelClienteEnElEnvio } from './shipmentUtils';

export const ESTADO_PENDIENTE = 'Pendiente de asignar';

/** true si algún conductor ya ha escaneado al menos un bulto de este envío. */
export const tieneBultosEscaneados = (envio) =>
    Array.isArray(envio?.scannedPackages) && envio.scannedPackages.length > 0;

/**
 * Por qué el cliente NO puede modificar ni borrar este envío. Devuelve null si
 * sí puede; si no, el motivo en palabras, listo para enseñárselo.
 */
export const porQueElClienteNoPuedeTocarlo = (envio, cliente) => {
    if (!envio) return 'Este envío ya no existe.';
    if (papelDelClienteEnElEnvio(envio, cliente) !== 'Remitente') {
        return 'Este envío no lo has creado tú: sólo puedes modificar los que mandas.';
    }
    if (tieneBultosEscaneados(envio)) {
        return 'Ya hemos recogido este envío. A partir de aquí sólo puede modificarlo nuestra oficina.';
    }
    if (envio.status !== ESTADO_PENDIENTE) {
        return 'Este envío ya está en marcha. A partir de aquí sólo puede modificarlo nuestra oficina.';
    }
    return null;
};

export const elClientePuedeTocarlo = (envio, cliente) =>
    porQueElClienteNoPuedeTocarlo(envio, cliente) === null;

// Lo que se le dice cuando la base de datos no deja (la política RLS no da
// error: sencillamente no devuelve la fila). Pasa cuando lo recogemos justo
// mientras él lo tenía abierto, o cuando su lista iba con retraso.
export const AVISO_ENVIO_YA_ES_NUESTRO =
    'Este envío ya lo hemos recogido o está en reparto: a partir de aquí sólo puede modificarlo o borrarlo nuestra oficina.\n\n' +
    'Si necesitas cambiar algo, llámanos.';
