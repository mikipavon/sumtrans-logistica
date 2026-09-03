/**
 * Emparejar la población de un envío con los pueblos definidos en las rutas.
 *
 * El nombre del pueblo llega escrito de muchas maneras ("MONTALBÁN DE CÓRDOBA (14548)",
 * "Montalban de Cordoba", "Fernan-Nuñez"), así que la comparación tiene que ser
 * tolerante. Pero tolerante "a trozos" no vale: "Montalbán de Córdoba" contiene
 * "Córdoba", y así los envíos de Montalbán se los quedaba cualquier ruta que
 * pasara por Córdoba capital. La regla es quedarse con el pueblo que encaje y
 * tenga el nombre MÁS LARGO, que es el más específico.
 */

/** Deja el nombre en minúsculas, sin acentos, sin código postal ni puntuación. */
export const normalizarPueblo = (valor) => {
    if (!valor) return '';
    return String(valor)
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')  // acentos fuera (ñ -> n)
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')       // "(14548)" fuera
        .replace(/[^a-z]+/g, ' ')         // cifras, guiones y comas -> espacio
        .trim()
        .replace(/\s+/g, ' ');
};

/** ¿Este pueblo de ruta puede corresponder a la población del envío? */
const encaja = (ciudadNorm, puebloNorm) =>
    !!ciudadNorm && !!puebloNorm &&
    (ciudadNorm === puebloNorm || ciudadNorm.includes(puebloNorm) || puebloNorm.includes(ciudadNorm));

/**
 * De una lista de pueblos, el que mejor representa a la población del envío.
 *
 * 1º una coincidencia exacta, si la hay. Es lo que evita que un envío a Córdoba
 *    capital se lo lleve "Montalbán de Córdoba" solo por ser un nombre más largo.
 * 2º si no la hay, el candidato que encaje con el nombre más específico (el más
 *    largo). Así "Tejar" sigue encontrando "El Tejar".
 *
 * Devuelve el nombre tal y como estaba escrito en la ruta, o null si ninguno encaja.
 */
export const mejorPuebloParaCiudad = (ciudad, pueblos = []) => {
    const c = normalizarPueblo(ciudad);
    if (!c) return null;

    const exacto = pueblos.find(pueblo => normalizarPueblo(pueblo) === c);
    if (exacto) return exacto;

    let mejor = null;
    let largoDelMejor = -1;
    for (const pueblo of pueblos) {
        const p = normalizarPueblo(pueblo);
        if (!encaja(c, p)) continue;
        if (p.length > largoDelMejor) {
            mejor = pueblo;
            largoDelMejor = p.length;
        }
    }
    return mejor;
};

/** Dos nombres de población que se refieren al mismo sitio. */
export const esElMismoPueblo = (a, b) => {
    const na = normalizarPueblo(a);
    return !!na && na === normalizarPueblo(b);
};

/**
 * El pueblo de las rutas al que va un envío. Primero por el nombre de la
 * población; si no casa con ninguna ruta, por el nombre que la tabla de baremos
 * da a ese código postal. Así una errata tecleada desde el móvil ("CORODBA",
 * 14013) sigue encontrando la ruta de Córdoba en vez de quedarse sin propuesta.
 *
 * Devuelve el pueblo tal y como está escrito en la ruta, o null.
 */
export const puebloDeRutaParaEnvio = (ciudad, cp, pueblosDeRuta = [], tablaBaremo = []) => {
    const porNombre = mejorPuebloParaCiudad(ciudad, pueblosDeRuta);
    if (porNombre) return porNombre;
    const cpLimpio = String(cp || '').trim();
    if (!cpLimpio) return null;
    const delBaremo = tablaBaremo.find(p => String(p?.zip || '').trim() === cpLimpio);
    return delBaremo ? mejorPuebloParaCiudad(delBaremo.name, pueblosDeRuta) : null;
};
