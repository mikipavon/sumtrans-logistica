/**
 * El parte de la baja médica: qué bajas están pendientes de papel.
 *
 * El problema que resuelve: cuando un conductor llama diciendo que está malo, la
 * oficina le marca la Baja Médica ese mismo día — no puede esperar al parte, porque
 * la ausencia es lo que le bloquea el fichaje y lo deja fuera del reparto. Pero
 * entonces la baja queda igual que una ya justificada: nada recuerda que el papel
 * sigue sin llegar, y a fin de mes no hay forma de saber cuáles faltan.
 *
 * Aquí vive la cuenta de eso. Una baja nace PENDIENTE y sólo deja de estarlo cuando
 * la oficina marca que el parte está en mano (`medical_note_received`). Lo demás
 * -bloquear el fichaje, no descontar vacaciones- no cambia: el parte es papeleo, no
 * decide si el conductor está malo.
 *
 * El agrupado en tramos es lo que hace esto usable: una baja de dos semanas son
 * catorce filas en la tabla, pero UN parte. Se marcan de una vez.
 */

export const TIPO_BAJA = 'Baja Médica';

/** La columna que añade `supabase/24_baja_medica_pendiente_de_parte.sql`. */
export const CAMPO_PARTE = 'medical_note_received';
export const CAMPO_PARTE_FECHA = 'medical_note_at';

/** El parte escaneado, que añade `supabase/25_el_parte_escaneado.sql`. */
export const CAMPO_PARTE_FICHERO = 'medical_note_path';

/** ¿Esta baja tiene el parte escaneado guardado, no sólo marcado a mano? */
export const tieneParteEscaneado = (ausencia) =>
    !!ausencia && ausencia.type === TIPO_BAJA && !!ausencia[CAMPO_PARTE_FICHERO];

/**
 * ¿Está ya ejecutada la migración 24? Se pregunta a las propias filas: si NINGUNA
 * trae la columna, la tabla todavía no la tiene y el control del parte se queda
 * apagado — mejor eso que pintarle "falta el parte" a bajas de hace meses porque
 * el script aún no se ha pasado por el SQL Editor.
 *
 * Con la tabla vacía devuelve false: no hay nada que avisar de todas formas.
 */
export const laTablaLlevaParte = (filas) =>
    Array.isArray(filas) && filas.some(f => f && Object.prototype.hasOwnProperty.call(f, CAMPO_PARTE));

/** Una baja médica sin el parte en mano. Lo que no es baja nunca está pendiente. */
export const faltaElParte = (ausencia) =>
    !!ausencia && ausencia.type === TIPO_BAJA && ausencia[CAMPO_PARTE] !== true;

// ── Fechas ('YYYY-MM-DD', que es como se guardan) ─────────────────────────────

const aISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const sumarDias = (iso, n) => {
    const d = new Date(`${iso}T12:00:00`);
    d.setDate(d.getDate() + n);
    return aISO(d);
};

const esFinDeSemana = (iso) => {
    const g = new Date(`${iso}T12:00:00`).getDay();
    return g === 0 || g === 6;
};

/**
 * Entre dos días de baja, ¿sólo hay fin de semana por medio? Si es así son la misma
 * baja: nadie marca el sábado y el domingo, pero el conductor no se curó el viernes
 * para recaer el lunes.
 */
const soloFinDeSemanaEnMedio = (desde, hasta) => {
    let dia = sumarDias(desde, 1);
    while (dia < hasta) {
        if (!esFinDeSemana(dia)) return false;
        dia = sumarDias(dia, 1);
    }
    return true;
};

/**
 * Junta días sueltos en tramos de baja seguidos. Devuelve, en orden:
 *   { desde, hasta, dias: ['YYYY-MM-DD', …], ids: [id, …] }
 *
 * Se le pasan SÓLO las que interesan (las pendientes, normalmente), así que un tramo
 * es siempre "un parte que falta".
 */
export const agruparEnTramos = (ausencias = []) => {
    const ordenadas = [...(ausencias || [])]
        .filter(a => a && typeof a.date === 'string')
        .sort((a, b) => a.date.localeCompare(b.date));

    const tramos = [];
    ordenadas.forEach(a => {
        const ultimo = tramos[tramos.length - 1];
        if (ultimo && soloFinDeSemanaEnMedio(ultimo.hasta, a.date)) {
            ultimo.hasta = a.date;
            ultimo.dias.push(a.date);
            ultimo.ids.push(a.id);
        } else {
            tramos.push({ desde: a.date, hasta: a.date, dias: [a.date], ids: [a.id] });
        }
    });
    return tramos;
};

/** Las bajas sin parte del año, agrupadas por parte que falta. */
export const tramosSinParte = (ausencias = []) =>
    agruparEnTramos((ausencias || []).filter(faltaElParte));

// ── Texto ─────────────────────────────────────────────────────────────────────

const diaYMes = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' });
const soloDia  = (iso) => new Date(`${iso}T12:00:00`).getDate();

const mismoMes = (a, b) => a.slice(0, 7) === b.slice(0, 7);

/** "12 de septiembre" · "del 7 al 18 de septiembre" · "del 28 de septiembre al 9 de octubre". */
export const textoDelTramo = (tramo) => {
    if (!tramo) return '';
    if (tramo.desde === tramo.hasta) return diaYMes(tramo.desde);
    if (mismoMes(tramo.desde, tramo.hasta)) return `del ${soloDia(tramo.desde)} al ${diaYMes(tramo.hasta)}`;
    return `del ${diaYMes(tramo.desde)} al ${diaYMes(tramo.hasta)}`;
};
