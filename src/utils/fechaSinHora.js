/**
 * La fecha de un albarán escrita para un papel: día, mes y año, sin hora.
 *
 * Los albaranes NO guardan la fecha en un formato de máquina: la guardan ya
 * escrita en español, tal como la dejó el navegador que creó el albarán. Por eso
 * conviven "7/9/2026" y "7 sept 2026" en el mismo campo, y por eso aquí no se
 * parsea nada que ya venga escrito así.
 *
 * La trampa: new Date("7/9/2026") NO falla, devuelve el 9 de julio. JavaScript lee
 * ese formato a la americana (mes/día), así que cualquier intento de "arreglar" la
 * fecha pasándola por new Date le cambia el día a más de la mitad de los albaranes
 * del año sin dar ningún error. Lo escrito en español se enseña tal cual.
 */
export const fechaSinHora = (valor) => {
    if (valor instanceof Date) {
        return isNaN(valor.getTime()) ? '' : valor.toLocaleDateString('es-ES');
    }

    const texto = String(valor ?? '').trim();
    if (!texto) return '';

    // Marca de tiempo ISO ("2026-09-07T18:38:19Z"): es un instante, se pasa al huso
    // horario de aquí antes de quedarse con el día.
    if (texto.includes('T')) {
        const instante = new Date(texto);
        if (!isNaN(instante.getTime())) return instante.toLocaleDateString('es-ES');
    }

    // ISO a secas ("2026-09-07"): se parte a mano. new Date lo entiende en UTC y
    // eso puede correr el día uno arriba o uno abajo según el huso.
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) return `${Number(iso[3])}/${Number(iso[2])}/${iso[1]}`;

    // Lo habitual: ya viene escrita en español. Se enseña como está, quitándole la
    // hora si la lleva pegada detrás ("7/9/2026, 18:38:19").
    return texto.split(',')[0].trim();
};

export default fechaSinHora;
