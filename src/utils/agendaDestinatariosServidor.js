// ── La agenda de destinatarios que calcula el servidor (fase 26) ──
//
// Va en su propio fichero, aparte de agendaDestinatarios.js, para que aquél siga
// siendo puro (sin Supabase) y sus tests no arrastren el cliente.
//
// La función SQL mira TODOS los envíos del cliente conectado —también los que
// tecleó la oficina y los de hace más de 90 días, que el navegador no carga— y
// devuelve un destinatario por fila con el id de nuestra ficha cuando el envío
// estaba enlazado. Un cliente sólo recibe lo suyo: la función decide por el
// usuario conectado, no por lo que se le pase.

import { supabase } from '../lib/supabase';

/**
 * @returns {Promise<Array<{nombre, direccion, cp, poblacion, ficha_id, sede_id, veces, ultimo_envio}>>}
 */
export async function cargarAgendaDelServidor() {
    const { data, error } = await supabase.rpc('agenda_destinatarios_del_cliente_conectado');
    if (error) throw error;
    return Array.isArray(data) ? data : [];
}
