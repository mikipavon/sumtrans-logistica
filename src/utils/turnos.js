/**
 * Turno de mañana o de tarde. Son DOS preguntas distintas, y por tener las dos un
 * "¿es de mañana?" cableado con horas diferentes parecían la misma cosa mal copiada:
 *
 * · turnoQueSeRepartaAhora — qué ronda está pisando el conductor en este momento.
 *   Decide qué pueblos le salen primero en el móvil. Francis a la una sigue de
 *   mañana, así que cambia a las 14:00.
 *
 * · turnoQueSeAsignaAhora — qué ronda se está despachando desde la oficina. Va POR
 *   DELANTE del reloj: a la una se está pasando el reparto de la tarde, así que hay
 *   que sugerir a quien va por la tarde. A partir de las 16:30 ya se prepara el
 *   reparto de la mañana siguiente y hay que sugerir a los de mañana.
 *
 * No unificar los dos números: unificar los conceptos. Si algún día hay que tocar
 * una hora, que quede claro cuál de las dos preguntas se está cambiando.
 */

export const MINUTOS_CORTE_REPARTO = 14 * 60;          // 14:00
export const MINUTOS_CORTE_ASIGNACION = 16 * 60 + 30;  // 16:30

export const TURNO_MANANA = 'manana';
export const TURNO_TARDE = 'tarde';

const minutosDelDia = (fecha) => {
    const f = fecha instanceof Date && !isNaN(fecha) ? fecha : new Date();
    return f.getHours() * 60 + f.getMinutes();
};

/** El turno que el conductor está repartiendo ahora mismo. */
export const turnoQueSeRepartaAhora = (fecha = new Date()) =>
    minutosDelDia(fecha) < MINUTOS_CORTE_REPARTO ? TURNO_MANANA : TURNO_TARDE;

/** El turno para el que se están asignando albaranes ahora mismo. */
export const turnoQueSeAsignaAhora = (fecha = new Date()) =>
    minutosDelDia(fecha) <= MINUTOS_CORTE_ASIGNACION ? TURNO_TARDE : TURNO_MANANA;

/** El turno contrario, para cuando hay que recurrir al historial del otro. */
export const turnoContrario = (turno) =>
    turno === TURNO_TARDE ? TURNO_MANANA : TURNO_TARDE;

export const etiquetaTurno = (turno) =>
    turno === TURNO_TARDE ? '🌙 Tarde' : '☀️ Mañana';
