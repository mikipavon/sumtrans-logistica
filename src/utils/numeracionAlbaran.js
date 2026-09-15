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
        // Los nombres llevan p_ porque `prefijo` a secas choca con la columna del
        // mismo nombre dentro de la función (42702) — ver 10_numeracion_albaranes.sql.
        const { data, error } = await supabase.rpc('reservar_numeros_albaran', {
            p_prefijo: serie,
            p_cantidad: cuantos
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

/** Código de Postgres cuando ya existe una fila con esa clave. */
export const CODIGO_ID_REPETIDO = '23505';

/**
 * Si ya hay una fila con este id, ¿es ESTA misma alta y no otra que ocupó el número?
 *
 * Pasa cuando el insert llega a la base de datos pero la respuesta se pierde por
 * el camino (cobertura mala): la app lo da por fallido, lo encola, y al
 * sincronizar el insert choca con su propia fila. Hasta el 15/09/2026 aquí se
 * pedía otro número y se grababa un gemelo (SUM-1314 y SUM-1315, la misma
 * recogida). Se reconoce por el milisegundo del alta (createdAt) y el creador.
 * Sin createdAt no hay forma de saberlo y no se consulta; si la consulta falla o
 * la fila no se puede leer, se devuelve null y se renumera como siempre.
 *
 * @returns {Promise<object|null>} La fila tal como está grabada, o null.
 */
const filaYaGrabada = async (fila) => {
    const marca = fila?.data?.createdAt;
    if (!marca) return null;
    try {
        const { data: existente, error } = await supabase
            .from('shipments')
            .select('*')
            .eq('id', fila.id)
            .maybeSingle();
        if (error || !existente) return null;
        const suya = existente.data || {};
        const mismoCreador = (suya.createdById ?? null) === (fila.data.createdById ?? null);
        return (suya.createdAt === marca && mismoCreador) ? existente : null;
    } catch (err) {
        console.warn(`[numeracionAlbaran] No se pudo comprobar si ${fila.id} ya era nuestro:`, err);
        return null;
    }
};

/**
 * Da de alta una fila de `shipments` sin pisar ninguna que ya exista.
 *
 * ── Por qué no vale `upsert` ─────────────────────────────────────────────────────
 * El 07/09/2026 dos repartidores guardaron un albarán con cuatro décimas de
 * segundo de diferencia. Los dos móviles habían calculado el mismo número
 * (máximo de la base de datos al abrir el formulario + 1), y como el alta iba por
 * `upsert`, el segundo no falló: sobrescribió al primero. Una recogida ya hecha
 * en Fernán-Núñez desapareció sin dejar rastro y nadie se enteró hasta que la
 * oficina la echó en falta.
 *
 * Con `insert` Postgres rechaza la repetida (23505). Aquí se recoge ese error,
 * se pide otro número al servidor y se vuelve a intentar: el segundo albarán
 * entra con el número siguiente y el primero se queda como estaba.
 *
 * @param {object} fila  { id, status, assignedDriverId, data } tal como va a la tabla.
 * @param {object} opciones
 * @param {Array}  opciones.enviosLocales  Envíos cargados, plan B si el servidor no reserva.
 * @param {number} opciones.intentos       Números distintos que se prueban antes de rendirse.
 * @returns {Promise<{data: Array|null, error: object|null, id: string, renumerado: boolean}>}
 *          `id` es el que ha quedado grabado; `renumerado` avisa de que no es el
 *          que traía la fila, para que quien llama actualice su copia.
 *          `yaEstaba` dice que la fila ya estaba grabada de un intento anterior.
 */
export const darDeAltaSinPisar = async (fila, { enviosLocales = [], intentos = 3 } = {}) => {
    let actual = { ...fila };
    let ultimoError = null;

    for (let intento = 0; intento < intentos; intento++) {
        const { data, error } = await supabase.from('shipments').insert([actual]).select();
        if (!error) {
            return { data, error: null, id: actual.id, renumerado: actual.id !== fila.id };
        }
        if (error.code !== CODIGO_ID_REPETIDO) {
            return { data: null, error, id: actual.id, renumerado: false };
        }
        ultimoError = error;

        // ¿La fila que choca es esta misma, grabada en un intento anterior cuya
        // respuesta no llegó? Entonces ya está hecho: no se pide otro número.
        const grabada = await filaYaGrabada(actual);
        if (grabada) {
            return { data: [grabada], error: null, id: actual.id, renumerado: actual.id !== fila.id, yaEstaba: true };
        }

        const m = String(actual.id || '').match(/^([A-Z]+)-(\d+)$/i);
        if (!m) break; // Sin serie correlativa no hay "siguiente número" que probar

        const serie = m[1].toUpperCase();
        const { primero } = await reservarNumerosAlbaran(serie, 1, {
            // El id que acaba de chocar cuenta como ocupado aunque no esté en la lista local
            enviosLocales: [...enviosLocales, { id: actual.id }]
        });
        // Nunca por debajo del que ya ha chocado: si el servidor no reserva y la
        // lista local va atrasada, al menos se avanza un número por intento.
        const numero = Math.max(primero, parseInt(m[2], 10) + 1);
        const nuevoId = `${serie}-${numero}`;
        console.warn(`[numeracionAlbaran] ${actual.id} ya existía; se guarda como ${nuevoId}`);
        actual = { ...actual, id: nuevoId, data: { ...(actual.data || {}), id: nuevoId } };
    }

    return { data: null, error: ultimoError, id: actual.id, renumerado: false };
};
