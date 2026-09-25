/**
 * Lo que el optimizador aprende de A QUÉ HORA se puede entregar a cada cliente.
 *
 * El aprendizaje del orden (aprendizajeRuta.js) dice "en Lucena, A antes que B". Esto
 * dice otra cosa: "a B no se le puede entregar antes de las 10:30, abra el reparto por
 * donde abra". Son dos preguntas distintas y se guardan aparte, aunque vivan en el
 * mismo JSON del repartidor (bajo la clave `_horarios`, que el aprendizaje del orden
 * ignora porque empieza por guion bajo).
 *
 * ── De dónde sale "no antes de" ─────────────────────────────────────────────────
 *
 *  · De la ficha, si la oficina lo ha puesto (`noAntesDe: "10:30"`). Manda siempre.
 *
 *  · De las incidencias de CERRADO: si a las 9:05 estaba cerrado, no se vuelve a
 *    mandar a nadie antes de las 9:05 + un margen. Solo cuenta si nunca se ha
 *    conseguido entregar antes de esa hora: un "cerrado" a las 14:30 en un sitio donde
 *    se entrega a las 9 todos los días es la hora de comer, no la hora de apertura.
 *
 *  · De las propias entregas: si en cinco entregas la más temprana fue a las 10:40,
 *    es que ahí no se entrega antes de las diez y media. Hace falta un mínimo de
 *    entregas (MIN_ENTREGAS) para fiarse: una sola puede ser cualquier cosa.
 *
 * Con las entregas hay una trampa conocida: si la app aplaza a un cliente hasta las
 * 10:30, se le entregará siempre después de las 10:30 y el dato se confirma solo. La
 * salida está en manos del transportista, que es lo que se pide: si un día lo arrastra
 * antes y entrega a las 9:10, esa entrega es la nueva "más temprana" y la regla se
 * suelta sola. Por eso la parada aplazada va marcada en la tarjeta: para que él sepa
 * por qué se ha movido y pueda desmentirlo.
 *
 * Formato dentro del aprendizaje del repartidor:
 *   { _horarios: { [clienteNormalizado]: { primera, count, cerradoHasta, cerrados } } }
 *   · primera:      minutos del día de la entrega más temprana (null si no hay)
 *   · count:        entregas apuntadas
 *   · cerradoHasta: minutos del "cerrado" más tardío que aún no ha sido desmentido
 *   · cerrados:     veces que se ha encontrado cerrado
 */

import { minutosDeHora, horaDeMinutos } from './turnos';
import { adaptarConocimiento } from './aprendizajeRuta';

export const CLAVE_HORARIOS = '_horarios';

/** Cuántas entregas hacen falta para deducir la hora solo de las entregas. */
export const MIN_ENTREGAS = 3;

/** Si estaba cerrado a las 9:05, no volver antes de las 9:05 + esto. */
export const MARGEN_TRAS_CERRADO_MIN = 20;

/** Lo que se resta a la entrega más temprana para dar "no antes de". */
export const MARGEN_ANTES_DE_PRIMERA_MIN = 10;

/**
 * Un "cerrado" tan tarde no habla de la hora de abrir sino de la de cerrar (comida,
 * fin de jornada): no se aprende nada de él.
 */
export const HORA_TOPE_CERRADO = 13 * 60;

const normCliente = (valor) => String(valor || '').trim().toLowerCase();

const minutosDe = (fecha) => {
    const f = fecha instanceof Date ? fecha : new Date(fecha);
    if (isNaN(f)) return null;
    return f.getHours() * 60 + f.getMinutes();
};

const horariosDe = (datos) => {
    const h = datos?.[CLAVE_HORARIOS];
    return h && typeof h === 'object' ? h : {};
};

const entradaLimpia = (v) => ({
    primera: Number.isFinite(v?.primera) ? v.primera : null,
    count: Number(v?.count) || 0,
    cerradoHasta: Number.isFinite(v?.cerradoHasta) ? v.cerradoHasta : null,
    cerrados: Number(v?.cerrados) || 0,
});

/**
 * Apunta que a este cliente se le entregó a esta hora. Devuelve el aprendizaje nuevo
 * sin tocar el que entra.
 */
export const registrarHoraDeEntrega = (datos, { cliente, fecha = new Date() }) => {
    // Se parte del conocimiento ya adaptado (con su marca de versión): sin ella, al
    // releer se tomaría por formato antiguo y se tiraría todo lo que empieza por "_".
    const base = adaptarConocimiento(datos);
    const nombre = normCliente(cliente);
    const minutos = minutosDe(fecha);
    if (!nombre || minutos === null) return base;

    const previo = entradaLimpia(horariosDe(base)[nombre]);
    const primera = previo.primera === null ? minutos : Math.min(previo.primera, minutos);
    // Una entrega antes del "cerrado" lo desmiente: ese día abrían antes.
    const cerradoHasta = previo.cerradoHasta !== null && previo.cerradoHasta >= primera
        ? null
        : previo.cerradoHasta;

    return {
        ...base,
        [CLAVE_HORARIOS]: {
            ...horariosDe(base),
            [nombre]: { ...previo, primera, count: previo.count + 1, cerradoHasta },
        },
    };
};

/**
 * Apunta que a esta hora el cliente estaba cerrado. Solo enseña algo si es por la
 * mañana y si nunca se ha entregado antes de esa hora.
 */
export const registrarCerrado = (datos, { cliente, fecha = new Date() }) => {
    const base = adaptarConocimiento(datos);
    const nombre = normCliente(cliente);
    const minutos = minutosDe(fecha);
    if (!nombre || minutos === null) return base;
    if (minutos >= HORA_TOPE_CERRADO) return base;

    const previo = entradaLimpia(horariosDe(base)[nombre]);
    if (previo.primera !== null && minutos >= previo.primera) return base;

    const cerradoHasta = previo.cerradoHasta === null ? minutos : Math.max(previo.cerradoHasta, minutos);
    return {
        ...base,
        [CLAVE_HORARIOS]: {
            ...horariosDe(base),
            [nombre]: { ...previo, cerradoHasta, cerrados: previo.cerrados + 1 },
        },
    };
};

/** ¿El motivo de una incidencia dice que el sitio estaba cerrado? */
export const motivoDiceCerrado = (motivo) => {
    const texto = String(motivo || '').toLowerCase();
    return /cerrad|no (han |ha )?abiert|no abre|abren? a las|todav[ií]a no abr/.test(texto);
};

/** Junta lo que saben varios repartidores del mismo cliente. */
const fusionar = (a, b) => {
    const primera = a.primera === null ? b.primera : (b.primera === null ? a.primera : Math.min(a.primera, b.primera));
    const cerradoCandidato = a.cerradoHasta === null ? b.cerradoHasta
        : (b.cerradoHasta === null ? a.cerradoHasta : Math.max(a.cerradoHasta, b.cerradoHasta));
    // Una entrega de cualquiera antes del "cerrado" de otro lo desmiente igual.
    const cerradoHasta = cerradoCandidato !== null && primera !== null && cerradoCandidato >= primera
        ? null
        : cerradoCandidato;
    return { primera, count: a.count + b.count, cerradoHasta, cerrados: a.cerrados + b.cerrados };
};

/**
 * Antes de qué minuto del día no conviene mandar a nadie a este cliente, o null si no
 * se sabe nada. `fuentes` son los aprendizajes de uno o varios repartidores; el de la
 * ficha (`deLaFicha`, "10:30") manda sobre todos.
 */
export const noAntesDe = (fuentes, cliente, deLaFicha = null) => {
    const fijo = minutosDeHora(deLaFicha);
    if (fijo !== null) return fijo;

    const nombre = normCliente(cliente);
    if (!nombre) return null;

    const lista = Array.isArray(fuentes) ? fuentes : [fuentes];
    let junto = null;
    lista.forEach(datos => {
        const entrada = horariosDe(datos)[nombre];
        if (!entrada) return;
        const limpia = entradaLimpia(entrada);
        junto = junto ? fusionar(junto, limpia) : limpia;
    });
    if (!junto) return null;

    if (junto.cerradoHasta !== null) return junto.cerradoHasta + MARGEN_TRAS_CERRADO_MIN;
    if (junto.count >= MIN_ENTREGAS && junto.primera !== null) {
        return Math.max(0, junto.primera - MARGEN_ANTES_DE_PRIMERA_MIN);
    }
    return null;
};

/** "10:30" para enseñarlo en la tarjeta. */
export const etiquetaDeHora = (minutos) => (Number.isFinite(minutos) ? horaDeMinutos(minutos) : '');

/** Nº de clientes con algo apuntado. */
export const contarClientesConHorario = (datos) => Object.keys(horariosDe(datos)).length;
