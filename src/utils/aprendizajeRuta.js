/**
 * Lo que el optimizador aprende del transportista: en qué orden confirma las
 * entregas de cada pueblo.
 *
 * ── Por qué cambió el formato ──────────────────────────────────────────────────
 * Antes se guardaba la posición ABSOLUTA ("este cliente fue el 3º de Cabra"). Eso no
 * se puede promediar entre días: si un día Cabra tiene 3 paradas y otro 9, "el
 * último" vale 3 un día y 9 el otro, y la media los mezcla como si fueran cosas
 * distintas. El dato que de verdad da el transportista es RELATIVO —confirmó A antes
 * que B—, así que se guarda como orden relativo: 0 = el primero del pueblo,
 * 1 = el último, independientemente de cuántas paradas hubiera ese día.
 *
 * Además ahora hay nivel de turno. Sin él era imposible guardar "en Cabra por la
 * mañana empiezo por A y por la tarde por B", que es justo lo que promete tener la
 * ruta partida en mañana y tarde.
 *
 * Formato v2:
 *   { _v: 2, [puebloNormalizado]: { manana: { [cliente]: {orden, count} }, tarde: {…} } }
 *
 * Formato v1 (el que hay en producción):
 *   { [ciudadCruda]: { [cliente]: {avg, count} } }
 *
 * El v1 no se migra a lo bruto: se adapta AL LEER (ver `adaptarConocimiento`), porque
 * `settings/route_knowledge` es un JSON único compartido por todos los repartidores y
 * reescribirlo desde un móvil es la forma más rápida de pisarle el aprendizaje a otro.
 */

import { normalizarPueblo } from './townMatch';

export const VERSION = 2;

/** Cuántas confirmaciones hacen falta para dar por sabido a un cliente. */
export const MADUREZ_PLENA = 5;

/** Por encima de esta confianza, el orden aprendido manda sobre la geografía. */
export const UMBRAL_MEMORIA_FIRME = 0.6;

/** Cuántas entregas pesa la media móvil (más = memoria más lenta y más estable). */
const VENTANA_MEDIA = 20;

const TURNOS = ['manana', 'tarde'];

const redondear = (n) => Math.round(n * 1000) / 1000;

const normCliente = (valor) => String(valor || '').trim().toLowerCase();

const turnoValido = (turno) => (turno === 'tarde' ? 'tarde' : 'manana');

/**
 * Orden relativo de una parada dentro de su pueblo: 0 el primero, 1 el último.
 *
 * Devuelve null si el pueblo tenía una sola parada ese día. Un pueblo de paso no
 * enseña nada —no hubo ninguna comparación— y antes se registraba como "posición 1",
 * clavando a ese cliente en cabeza para siempre.
 */
export const ordenRelativo = (posicion, total) => {
    const p = Number(posicion);
    const t = Number(total);
    if (!Number.isFinite(p) || !Number.isFinite(t) || t < 2) return null;
    const acotada = Math.min(Math.max(p, 1), t);
    return redondear((acotada - 1) / (t - 1));
};

/** Mete una entrada en el destino, fusionando si ya había algo (media ponderada). */
const fusionarEntrada = (destino, pueblo, turno, cliente, orden, count) => {
    if (!destino[pueblo]) destino[pueblo] = {};
    if (!destino[pueblo][turno]) destino[pueblo][turno] = {};
    const previo = destino[pueblo][turno][cliente];
    if (!previo) {
        destino[pueblo][turno][cliente] = { orden: redondear(orden), count };
        return;
    }
    const total = previo.count + count;
    const mezcla = total > 0
        ? (previo.orden * previo.count + orden * count) / total
        : (previo.orden + orden) / 2;
    destino[pueblo][turno][cliente] = { orden: redondear(mezcla), count: total };
};

const esFormatoNuevo = (datos) => datos?._v === VERSION;

const pareceNodoDeTurnos = (pueblo) =>
    !!pueblo && TURNOS.some(t => pueblo[t] && typeof pueblo[t] === 'object');

/**
 * Deja cualquier conocimiento —v1 o v2— en formato v2, sin perder nada.
 *
 * Del v1 hace dos cosas:
 *  1. Normaliza la clave del pueblo. Se guardaba con la ciudad cruda del albarán
 *     ("montalbán de córdoba (14548)") y se leía con el nombre del pueblo de la ruta
 *     ("montalbán de córdoba"), así que el historial casi nunca se encontraba. Al
 *     normalizar, dos claves distintas pueden caer en la misma: se fusionan
 *     ponderando por el número de entregas de cada una.
 *  2. Convierte las posiciones absolutas en orden relativo, ordenando los clientes
 *     de cada pueblo por su media antigua. Se conserva el ORDEN, que es lo que vale.
 *
 * Los datos v1 no tienen turno, así que valen para los dos hasta que cada turno
 * acumule historial propio.
 */
export const adaptarConocimiento = (datos) => {
    if (!datos || typeof datos !== 'object') return { _v: VERSION };
    if (esFormatoNuevo(datos)) return datos;

    const salida = { _v: VERSION };

    for (const [clavePueblo, contenido] of Object.entries(datos)) {
        if (clavePueblo.startsWith('_')) continue;
        if (!contenido || typeof contenido !== 'object') continue;

        const pueblo = normalizarPueblo(clavePueblo);
        if (!pueblo) continue;

        // Un objeto ya partido por turnos dentro de un blob sin _v: respetarlo.
        if (pareceNodoDeTurnos(contenido)) {
            TURNOS.forEach(turno => {
                Object.entries(contenido[turno] || {}).forEach(([cliente, v]) => {
                    if (!v || typeof v !== 'object') return;
                    const orden = Number.isFinite(Number(v.orden)) ? Number(v.orden) : null;
                    if (orden === null) return;
                    fusionarEntrada(salida, pueblo, turno, normCliente(cliente), orden, Number(v.count) || 0);
                });
            });
            continue;
        }

        const entradas = Object.entries(contenido)
            .filter(([nombre, v]) => !nombre.startsWith('_') && v && typeof v === 'object')
            .map(([nombre, v]) => ({
                cliente: normCliente(nombre),
                avg: Number(v.avg) || 0,
                count: Number(v.count) || 0,
            }))
            .filter(e => e.cliente);

        if (entradas.length === 0) continue;

        entradas.sort((a, b) => a.avg - b.avg);
        const n = entradas.length;
        entradas.forEach((e, i) => {
            const orden = n > 1 ? i / (n - 1) : 0.5;
            TURNOS.forEach(turno => fusionarEntrada(salida, pueblo, turno, e.cliente, orden, e.count));
        });
    }

    return salida;
};

/**
 * Apunta que este cliente se confirmó en la posición `posicion` de `total` paradas
 * de su pueblo. Devuelve el conocimiento nuevo, sin tocar el que entra.
 */
export const registrarEntrega = (datos, { pueblo, turno, cliente, posicion, total }) => {
    const base = adaptarConocimiento(datos);
    const clave = normalizarPueblo(pueblo);
    const nombre = normCliente(cliente);
    const orden = ordenRelativo(posicion, total);
    if (!clave || !nombre || orden === null) return base;

    const t = turnoValido(turno);
    const previo = base[clave]?.[t]?.[nombre];
    const count = (previo?.count || 0) + 1;
    const anterior = previo ? previo.orden : orden;
    // Media móvil ponderada: las últimas entregas pesan más, pero nunca de golpe.
    const nuevo = anterior + (orden - anterior) / Math.min(count, VENTANA_MEDIA);

    return {
        ...base,
        [clave]: {
            ...(base[clave] || {}),
            [t]: {
                ...(base[clave]?.[t] || {}),
                [nombre]: { orden: redondear(nuevo), count },
            },
        },
    };
};

/**
 * Lo aprendido de un pueblo en un turno: { cliente: {orden, count} }.
 *
 * Si el turno que toca todavía no tiene historial, sirve el del turno contrario:
 * el orden de la mañana es mejor punto de partida que ninguno.
 */
export const memoriaDelPueblo = (datos, pueblo, turno) => {
    const base = adaptarConocimiento(datos);
    const clave = normalizarPueblo(pueblo);
    if (!clave || !base[clave]) return {};
    const t = turnoValido(turno);
    const propia = base[clave][t] || {};
    if (Object.keys(propia).length > 0) return propia;
    return base[clave][t === 'tarde' ? 'manana' : 'tarde'] || {};
};

/**
 * Cuánto se puede fiar el optimizador de lo aprendido en este pueblo, de 0 a 1.
 *
 * Combina cobertura (cuántas de las paradas de hoy conoce) con madurez (cuántas
 * veces las ha confirmado). Un pueblo con 8 paradas del que solo conoce una, vista
 * una vez, no debe mandar sobre la geografía.
 */
export const confianzaDeMemoria = (memoria, nombres) => {
    if (!memoria || !Array.isArray(nombres) || nombres.length === 0) return 0;
    let conocidos = 0;
    let madurez = 0;
    nombres.forEach(nombre => {
        const entrada = memoria[normCliente(nombre)];
        if (!entrada) return;
        conocidos++;
        madurez += Math.min(entrada.count || 0, MADUREZ_PLENA) / MADUREZ_PLENA;
    });
    if (conocidos === 0) return 0;
    const cobertura = conocidos / nombres.length;
    return redondear(cobertura * (madurez / conocidos));
};

/** El orden aprendido de un cliente, o null si no hay historial suyo. */
export const ordenDeCliente = (memoria, nombre) => {
    const entrada = memoria?.[normCliente(nombre)];
    return entrada && Number.isFinite(entrada.orden) ? entrada.orden : null;
};

/** Nº de pueblos con algo memorizado. */
export const contarPueblosMemorizados = (datos) =>
    Object.keys(adaptarConocimiento(datos)).filter(k => !k.startsWith('_')).length;
