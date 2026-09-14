// Empareja cada nómina de la carpeta con su conductor y saca de qué mes es.
//
// Antes se buscaba el nombre como trozo de texto suelto, y fallaba de dos maneras:
//   - Un alias de una sola palabra ("Francisco") estaba dentro del fichero de
//     cualquier otro Francisco, y la nómina de PAVON MAIZ FRANCISCO JAVIER se
//     asignaba a FRANCISCO MANUEL AGUILAR SANCHEZ.
//   - "mayo" está dentro de "mayor", que sale en el texto de las nóminas, y como
//     se miraba antes que "agosto", las de agosto salían como "Nómina Mayo".

const MESES = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

// Cuántas palabras pueden separar las partes de un nombre para darlo por el mismo
// ("PAVON MAIZ, MIGUEL ANGEL" frente a "Miguel Pavon").
const VENTANA = 6;

/** Minúsculas, sin acentos y sólo letras y números separados por un espacio. */
export const normalizarNombre = (texto) => {
    if (!texto) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const palabras = (texto) => {
    const limpio = normalizarNombre(texto);
    return limpio ? limpio.split(' ') : [];
};

/**
 * Si el nombre está en el texto, devuelve cuántas partes coinciden y dónde empieza;
 * si no, null. Tienen que estar TODAS las partes (de más de dos letras, para saltar
 * "de" o "la"), como palabras enteras, cerca unas de otras y ser al menos dos: un
 * nombre de pila suelto sale en la nómina de cualquiera que se llame igual.
 */
export const coincidenciaDeNombre = (nombre, palabrasDelTexto) => {
    const partes = [...new Set(palabras(nombre).filter(p => p.length > 2))];
    if (partes.length < 2) return null;

    const posiciones = partes.map(p => {
        const lista = [];
        palabrasDelTexto.forEach((w, i) => { if (w === p) lista.push(i); });
        return lista;
    });
    if (posiciones.some(lista => lista.length === 0)) return null;

    let inicio = null;
    for (const i of posiciones[0]) {
        const cercanas = posiciones.map(lista => lista.find(j => Math.abs(j - i) <= VENTANA));
        if (cercanas.every(j => j !== undefined)) {
            inicio = Math.min(...cercanas);
            break;
        }
    }
    return inicio === null ? null : { partes: partes.length, inicio };
};

/**
 * El conductor cuyo nombre o alias aparece en el texto (nombre del fichero o texto
 * del PDF). Gana el que coincide en más partes y, a igualdad, el que sale antes. Si
 * dos conductores distintos empatan del todo, no se elige ninguno: mejor asignarla a
 * mano que dársela a quien no es.
 */
export const buscarConductor = (texto, conductores = []) => {
    const t = palabras(texto);
    if (t.length === 0) return null;

    let mejor = null;
    let empate = false;
    for (const conductor of conductores) {
        for (const nombre of [conductor.name, conductor.alias]) {
            const c = coincidenciaDeNombre(nombre, t);
            if (!c) continue;
            if (!mejor || c.partes > mejor.partes || (c.partes === mejor.partes && c.inicio < mejor.inicio)) {
                mejor = { ...c, conductor };
                empate = false;
            } else if (c.partes === mejor.partes && c.inicio === mejor.inicio && mejor.conductor.id !== conductor.id) {
                empate = true;
            }
        }
    }
    return mejor && !empate ? mejor.conductor : null;
};

const etiqueta = (indiceMes, anio) =>
    `Nómina ${MESES[indiceMes].charAt(0).toUpperCase()}${MESES[indiceMes].slice(1)} ${anio}`;

const mesEnTexto = (texto) => {
    if (!texto) return null;
    const t = String(texto).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
        .replace(/setiembre/g, 'septiembre');
    const nombres = MESES.join('|');

    // "agosto 2026", "agosto de 2026": el mes con su año al lado es el más fiable.
    const conAnio = t.match(new RegExp(`\\b(${nombres})\\b(?:\\s+de)?[\\s_-]+(20\\d{2})\\b`));
    if (conAnio) return etiqueta(MESES.indexOf(conAnio[1]), conAnio[2]);

    // El mes suelto, como palabra entera (que "mayor" no cuente como mayo).
    const suelto = t.match(new RegExp(`\\b(${nombres})\\b`));
    if (suelto) {
        const anio = t.match(/\b(20\d{2})\b/);
        return etiqueta(MESES.indexOf(suelto[1]), anio ? anio[1] : new Date().getFullYear());
    }

    // dd/mm/aaaa
    const fecha = t.match(/\b\d{1,2}\/(\d{1,2})\/(20\d{2})\b/);
    if (fecha) {
        const indice = parseInt(fecha[1], 10) - 1;
        if (indice >= 0 && indice < 12) return etiqueta(indice, fecha[2]);
    }
    return null;
};

/**
 * "Nómina Agosto 2026". Manda el nombre del fichero: lo pone quien prepara las
 * nóminas y dice el mes que es. El texto del PDF sólo se mira si el nombre no lo
 * dice, porque ahí salen más fechas (antigüedad, alta, periodo de atrasos...).
 */
export const detectarMes = (nombreFichero, textoPdf = '') =>
    mesEnTexto(nombreFichero) || mesEnTexto(textoPdf);
