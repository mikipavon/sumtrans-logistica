// ── La lista de cobros del día es una sola, se apunte desde donde se apunte ──
//
// Cada porte o reembolso que se marca cobrado en Cobros deja una entrada en la
// lista del día del repartidor (`collectedCollections_AAAA-MM-DD`, en su fila
// de `drivers`), y de esa lista sale la Cuenta. Cada aparato guardaba la suya y
// sólo la juntaba con la de la nube al abrir la app; al apuntar un cobro subía
// su lista ENTERA, pisando la que hubiera. Así, un porte cobrado desde el
// ordenador de la oficina (entrando como el repartidor) salía en la Cuenta del
// ordenador y no en el móvil, y el siguiente cobro del móvil lo borraba además
// de la nube (porte de Talleres Luque a Javito, 01/10/2026).
//
// Las entradas no se editan nunca —sólo se añaden—, así que juntar dos listas es
// quedarse con todas las de una y añadir las de la otra que falten, por su id.

const conId = (cobro) => cobro && cobro.id !== undefined && cobro.id !== null && cobro.id !== '';

/**
 * `propios` más los cobros de `ajenos` que le falten. Si no le falta ninguno
 * devuelve `propios` TAL CUAL (la misma lista, no una copia): quien la guarda en
 * un estado de React no repinta ni vuelve a subirla.
 */
export const unirCobros = (propios, ajenos) => {
    const base = Array.isArray(propios) ? propios : [];
    if (!Array.isArray(ajenos) || ajenos.length === 0) return base;

    const vistos = new Set(base.filter(conId).map(c => c.id));
    const nuevos = [];
    for (const cobro of ajenos) {
        if (!conId(cobro) || vistos.has(cobro.id)) continue;
        vistos.add(cobro.id);
        nuevos.push(cobro);
    }
    return nuevos.length === 0 ? base : [...base, ...nuevos];
};

/** Si a `lista` le falta algún cobro de `otros`. */
export const leFaltanCobros = (lista, otros) => {
    const base = Array.isArray(lista) ? lista : [];
    return unirCobros(base, otros) !== base;
};
