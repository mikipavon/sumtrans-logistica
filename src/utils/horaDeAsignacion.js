// Fecha y hora para el campo de programar asignación, en el formato que quiere un
// <input type="datetime-local"> (AAAA-MM-DDTHH:MM, siempre en hora local).

// Las horas a las que la oficina asigna casi siempre: salen como accesos directos
// debajo del campo para no tener que mover el reloj a mano.
export const HORAS_RAPIDAS_DE_ASIGNACION = ['14:00', '19:00'];

const dos = (n) => String(n).padStart(2, '0');

const fechaLocal = (d) => `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`;

// «Ahora» en local, no en UTC: cortar el ISO sin más propondría dos horas menos en verano.
export const ahoraParaInputLocal = (ahora = new Date()) =>
    `${fechaLocal(ahora)}T${dos(ahora.getHours())}:${dos(ahora.getMinutes())}`;

// Cambia solo la hora del valor que ya hay en el campo y respeta el día elegido.
// Si el campo está vacío, la pone sobre el día de hoy.
export const conHoraRapida = (valorActual, hora, ahora = new Date()) => {
    const fecha = /^\d{4}-\d{2}-\d{2}/.test(valorActual || '') ? valorActual.slice(0, 10) : fechaLocal(ahora);
    return `${fecha}T${hora}`;
};
