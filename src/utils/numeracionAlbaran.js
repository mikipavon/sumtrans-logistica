import { supabase } from '../lib/supabase';

/**
 * Numeración de albaranes del portal de clientes.
 *
 * ── El problema ───────────────────────────────────────────────────────────────────
 * El número de albarán se venía calculando en el navegador: máximo de la serie +1.
 * Eso funciona para administración y para los repartidores, que leen la tabla
 * entera, pero NO para un cliente: desde las políticas de la fase 04 sólo ve sus
 * propios envíos, así que su "máximo" va muy por detrás del real y emite un número
 * que ya tiene otro cliente. El guardado va por `upsert`, de modo que la colisión
 * no se queda en un aviso: cae sobre la fila ajena, Postgres la rechaza por RLS
 * (42501, el cliente no tiene UPDATE) y la app lo toma por un fallo de red y deja
 * el envío reintentando en la cola offline para siempre.
 *
 * ── La solución ───────────────────────────────────────────────────────────────────
 * El número lo reserva el servidor (`reservar_numeros_albaran`, en
 * supabase/10_numeracion_albaranes.sql). Es SECURITY DEFINER: ve todos los envíos
 * aunque quien llame no pueda, y reserva el tramo de forma atómica, así que dos
 * clientes creando a la vez no se llevan el mismo número.
 */

// Los ids con más de 5 dígitos no son de la serie correlativa (llevan el año
// incrustado). Mismo criterio que aplica el resto de la app.
const MAXIMO_CORRELATIVO = 100000;

/**
 * Número más alto de una serie dentro de una lista de envíos ya cargada.
 * Es lo que se usaba antes en todas partes, y sigue siendo el plan B cuando no
 * se puede hablar con el servidor.
 */
export const maximoDeLaSerie = (envios, prefijo) => {
    const serie = String(prefijo || '').toUpperCase() + '-';
    return (envios || []).reduce((max, envio) => {
        const id = String(envio?.id || '');
        if (!id.toUpperCase().startsWith(serie)) return max;
        const num = parseInt(id.replace(/\D/g, ''), 10);
        return (!isNaN(num) && num < MAXIMO_CORRELATIVO && num > max) ? num : max;
    }, 0);
};

/**
 * Reserva `cantidad` números correlativos de una serie.
 *
 * @param {string} prefijo        Serie: 'SUM', 'HAB'...
 * @param {number} cantidad       Cuántos números seguidos hacen falta.
 * @param {object} opciones
 * @param {Array}  opciones.enviosLocales  Envíos ya cargados, para el plan B.
 * @returns {Promise<{primero: number, reservado: boolean}>}
 *          `primero` es el primer número del tramo; los siguientes son
 *          consecutivos. `reservado` dice si lo garantiza el servidor: en false
 *          el número sale del cálculo local de siempre, con su mismo riesgo de
 *          colisión, pero al cliente no se le bloquea la creación.
 */
export const reservarNumerosAlbaran = async (prefijo, cantidad = 1, { enviosLocales = [] } = {}) => {
    const serie = String(prefijo || '').toUpperCase();
    const cuantos = Math.max(1, parseInt(cantidad, 10) || 1);

    try {
        const { data, error } = await supabase.rpc('reservar_numeros_albaran', {
            prefijo: serie,
            cantidad: cuantos
        });
        if (error) throw error;

        const primero = Number(data);
        if (!Number.isInteger(primero) || primero < 1) {
            throw new Error(`Respuesta inesperada del servidor: ${JSON.stringify(data)}`);
        }
        return { primero, reservado: true };
    } catch (err) {
        // Sin cobertura, o con la migración 10 todavía sin aplicar. No se corta la
        // creación del envío: se vuelve al cálculo local (lo que hacía la app antes
        // de este cambio) y queda el aviso en consola.
        console.error(
            `[numeracionAlbaran] No se pudo reservar número de la serie ${serie}; ` +
            'se numera con lo que hay en este dispositivo, puede repetirse:',
            err
        );
        return { primero: maximoDeLaSerie(enviosLocales, serie) + 1, reservado: false };
    }
};
