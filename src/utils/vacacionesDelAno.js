/**
 * Cuántos días de vacaciones le tocan a un conductor este año.
 *
 * En la casa se cuentan CUATRO SEMANAS al año: 20 días laborables, que es lo que se
 * marca en el calendario de ausencias (los sábados y domingos de esas semanas no se
 * marcan ni se descuentan). No hay días extra por antigüedad: cuatro semanas para
 * todos, del primero al último.
 *
 * Lo que sí cambia es el AÑO EN QUE ENTRA uno. Un conductor que empieza en septiembre
 * no ha generado las cuatro semanas enteras, y hasta ahora el contador le ponía 20
 * igual. Aquí se reparte: los 20 días a prorrata del tiempo que lleva de alta ese año.
 *
 * Se cuenta por días naturales de alta, no por meses cerrados — es como lo hace la
 * nómina y evita la discusión de si un mes empezado cuenta entero. Sale a la misma
 * cuenta de siempre: una semana por cada tres meses, o 1,67 días por mes.
 *
 * Del 1 de enero siguiente en adelante, 20 días completos como todo el mundo.
 */

export const SEMANAS_DE_VACACIONES = 4;
export const DIAS_POR_SEMANA       = 5;

/** Cuatro semanas laborables. */
export const DIAS_VACACIONES_AL_ANO = SEMANAS_DE_VACACIONES * DIAS_POR_SEMANA;

/** La fecha de alta se guarda en la ficha del conductor como 'YYYY-MM-DD'. */
export const esFechaDeAlta = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(`${v}T12:00:00Z`));

// Mediodía UTC: así ni el horario de verano ni la zona horaria mueven un día.
const enUTC = (iso) => new Date(`${iso}T12:00:00Z`).getTime();

/** Días de calendario de `desde` a `hasta`, contando los dos extremos. */
const diasEntre = (desde, hasta) => Math.round((enUTC(hasta) - enUTC(desde)) / 86400000) + 1;

/**
 * Los días que le corresponden en ese año.
 *
 * Devuelve { dias, prorrateado, diasDeAlta, diasDelAno }: `prorrateado` es lo que
 * distingue "le tocan 20 porque lleva todo el año" de "le tocan 20 porque no sabemos
 * cuándo entró", y es lo que la pantalla usa para explicar el número.
 *
 * Sin fecha de alta en la ficha se dan los 20 completos: mientras nadie la teclee,
 * mejor el número de siempre que recortarle días por un dato que falta.
 */
export const diasDeVacaciones = (fechaAlta, ano) => {
    const total = DIAS_VACACIONES_AL_ANO;
    const anoNum = Number(ano);

    if (!esFechaDeAlta(fechaAlta) || !Number.isInteger(anoNum)) {
        return { dias: total, prorrateado: false, diasDeAlta: null, diasDelAno: null };
    }

    const anoDeAlta = Number(fechaAlta.slice(0, 4));

    // Entró en años anteriores: año completo.
    if (anoDeAlta < anoNum) {
        return { dias: total, prorrateado: false, diasDeAlta: null, diasDelAno: null };
    }

    // El año que se está mirando es anterior a su alta: aquí todavía no estaba.
    if (anoDeAlta > anoNum) {
        return { dias: 0, prorrateado: true, diasDeAlta: 0, diasDelAno: null };
    }

    const diasDelAno  = diasEntre(`${anoNum}-01-01`, `${anoNum}-12-31`);
    const diasDeAlta  = diasEntre(fechaAlta, `${anoNum}-12-31`);

    return {
        dias: Math.round((total * diasDeAlta) / diasDelAno),
        prorrateado: true,
        diasDeAlta,
        diasDelAno,
    };
};

/** "20 días · 4 semanas" · "13 días · parte proporcional desde el 12/03/2026". */
export const explicacionDeLosDias = (fechaAlta, ano) => {
    const { prorrateado } = diasDeVacaciones(fechaAlta, ano);
    if (!prorrateado) return `${SEMANAS_DE_VACACIONES} semanas al año`;
    const [a, m, d] = fechaAlta.split('-');
    return `parte proporcional desde el ${d}/${m}/${a}`;
};
