// ── La agenda de destinatarios que calcula el servidor (fase 26) ──
//
// Va en su propio fichero, aparte de agendaDestinatarios.js, para que aquél siga
// siendo puro (sin Supabase) y sus tests no arrastren el cliente.
//
// La función SQL mira TODOS los envíos del cliente —también los que tecleó la
// oficina y los de hace más de 90 días, que el navegador no carga— y devuelve
// un destinatario por fila con el id de nuestra ficha cuando el envío estaba
// enlazado.
//
// El id de la ficha se manda siempre, pero sólo cuenta cuando quien llama es la
// oficina desde la vista de administración (fase 27). Para un cliente el
// servidor lo ignora y decide por su cuenta: no puede pedir la agenda de otro.

import { supabase } from '../lib/supabase';

/**
 * @param {string|number|null} idFicha  La ficha cuya agenda se quiere (sólo cuenta para la oficina).
 * @returns {Promise<Array<{nombre, direccion, cp, poblacion, ficha_id, sede_id, veces, ultimo_envio}>>}
 */
export async function cargarAgendaDelServidor(idFicha = null) {
    const p_cliente = idFicha === null || idFicha === undefined || String(idFicha).trim() === ''
        ? null : String(idFicha);
    const { data, error } = await supabase.rpc('agenda_destinatarios_del_cliente_conectado', { p_cliente });
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}
