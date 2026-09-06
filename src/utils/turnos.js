/**
 * Turno de mañana o de tarde. Son DOS preguntas distintas, y por tener las dos un
 * "¿es de mañana?" cableado con horas diferentes parecían la misma cosa mal copiada:
 *
 * · turnoQueSeRepartaAhora — qué ronda está pisando el conductor en este momento.
 *   Decide qué pueblos le salen primero en el móvil al pulsar Optimizar. Las horas
 *   NO van cableadas: las pone la oficina en el Gestor de Rutas ("Programador de
 *   turnos") y se guardan en `settings` con la clave `horarioReparto`. Lo de fábrica:
 *   el orden de la MAÑANA manda desde las 18:00 de la víspera hasta las 10:00, y el
 *   de la TARDE desde las 10:01 hasta las 17:59.
 *
 * · turnoQueSeAsignaAhora — qué ronda se está despachando desde la oficina. Va POR
 *   DELANTE del reloj: a la una se está pasando el reparto de la tarde, así que hay
 *   que sugerir a quien va por la tarde. A partir de las 16:30 ya se prepara el
 *   reparto de la mañana siguiente y hay que sugerir a los de mañana.
 *
 * No unificar los dos números: unificar los conceptos. Si algún día hay que tocar
 * una hora, que quede claro cuál de las dos preguntas se está cambiando.
 */

export const MINUTOS_CORTE_ASIGNACION = 16 * 60 + 30;  // 16:30

export const TURNO_MANANA = 'manana';
export const TURNO_TARDE = 'tarde';

/** Clave de `settings` donde la oficina guarda el horario del programador. */
export const CLAVE_HORARIO_REPARTO = 'horarioReparto';

/**
 * Lo de fábrica. `mananaDesde` es la hora a partir de la cual manda el orden de la
 * mañana; `tardeDesde`, a partir de la cual manda el de la tarde. La ventana de la
 * mañana cruza la medianoche (de las 18:00 a las 10:00 del día siguiente).
 */
export const HORARIO_REPARTO_POR_DEFECTO = Object.freeze({
    mananaDesde: '18:00',
    tardeDesde: '10:01',
});

const minutosDelDia = (fecha) => {
    const f = fecha instanceof Date && !isNaN(fecha) ? fecha : new Date();
    return f.getHours() * 60 + f.getMinutes();
};

/** "18:00" -> 1080. Devuelve null si no es una hora válida. */
export const minutosDeHora = (texto) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(texto || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
};

/** 1080 -> "18:00". */
export const horaDeMinutos = (minutos) => {
    const m = ((Number(minutos) % (24 * 60)) + 24 * 60) % (24 * 60);
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

/**
 * Deja el horario en un objeto válido, venga como venga (de la nube llega como texto
 * JSON, del formulario como objeto, o no llega). Lo que no se entiende se sustituye
 * por lo de fábrica, campo a campo, para que un ajuste roto nunca deje al móvil sin
 * turno. Si las dos horas coinciden no hay ventana que valga: se vuelve a fábrica.
 */
export const normalizarHorarioReparto = (valor) => {
    let bruto = valor;
    if (typeof bruto === 'string') {
        try { bruto = JSON.parse(bruto); } catch { bruto = null; }
    }
    const mananaDesde = minutosDeHora(bruto?.mananaDesde) ?? minutosDeHora(HORARIO_REPARTO_POR_DEFECTO.mananaDesde);
    const tardeDesde = minutosDeHora(bruto?.tardeDesde) ?? minutosDeHora(HORARIO_REPARTO_POR_DEFECTO.tardeDesde);
    if (mananaDesde === tardeDesde) return { ...HORARIO_REPARTO_POR_DEFECTO };
    return { mananaDesde: horaDeMinutos(mananaDesde), tardeDesde: horaDeMinutos(tardeDesde) };
};

/** ¿`minuto` cae en [desde, hasta)? Si la ventana cruza la medianoche, también vale. */
const enVentana = (minuto, desde, hasta) =>
    desde < hasta
        ? (minuto >= desde && minuto < hasta)
        : (minuto >= desde || minuto < hasta);

/** El turno que el conductor está repartiendo ahora mismo, según el programador. */
export const turnoQueSeRepartaAhora = (fecha = new Date(), horario = HORARIO_REPARTO_POR_DEFECTO) => {
    const h = normalizarHorarioReparto(horario);
    const manana = enVentana(minutosDelDia(fecha), minutosDeHora(h.mananaDesde), minutosDeHora(h.tardeDesde));
    return manana ? TURNO_MANANA : TURNO_TARDE;
};

/** El turno para el que se están asignando albaranes ahora mismo. */
export const turnoQueSeAsignaAhora = (fecha = new Date()) =>
    minutosDelDia(fecha) <= MINUTOS_CORTE_ASIGNACION ? TURNO_TARDE : TURNO_MANANA;

/** El turno contrario, para cuando hay que recurrir al historial del otro. */
export const turnoContrario = (turno) =>
    turno === TURNO_TARDE ? TURNO_MANANA : TURNO_TARDE;

export const etiquetaTurno = (turno) =>
    turno === TURNO_TARDE ? '🌙 Tarde' : '☀️ Mañana';
