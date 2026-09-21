// ── Los otros nombres con los que llega una ficha en los albaranes ──
//
// "COMERCIAL AGROCOR S.A." lo escribe cada remitente a su manera: "AGROCOR",
// "Agrocor Torrecilla", "COMERCIAL AGROCOR". Cada forma que no coincida con la
// ficha hace que el albarán llegue sin enlace y que el conductor, al entregar,
// cree otra ficha pendiente. Antes la única forma de que la ficha respondiera a
// otro nombre era colgarle una sede, y así una ficha con una sola nave acababa
// con "7 sedes" que no existen.
//
// Aquí vive `otrosNombres`: una lista de textos en `data` de la ficha, sin
// dirección ni nada más, que casa igual que el nombre comercial y la razón
// social. Quien pregunta "¿esta ficha responde a este nombre?" tiene que mirar
// los tres —nombre, razón social y otros nombres— y luego las sedes. Esto lo
// hace en un sitio para que la app (altaClientes.js, receptoresHabituales.js,
// duplicadosClientes.js) y la base de datos (30_otros_nombres_de_la_ficha.sql)
// digan lo mismo.

const limpio = (valor) => String(valor ?? '').trim();

/** La lista de otros nombres de una ficha, limpia y sin vacíos. */
export const leerOtrosNombres = (ficha) => {
    const guardados = Array.isArray(ficha?.otrosNombres) ? ficha.otrosNombres : [];
    return guardados.map(limpio).filter(Boolean);
};

/**
 * Todos los nombres por los que responde la ficha MADRE (no las sedes): el
 * comercial, la razón social y los otros nombres. Sin vacíos.
 */
export const nombresDeLaMadre = (ficha) => [ficha?.name, ficha?.legalName, ...leerOtrosNombres(ficha)]
    .map(limpio)
    .filter(Boolean);

/**
 * La lista con un nombre más, sin repetir: si ya estaba (con el mismo
 * `normalizar`) o ya es el nombre comercial, la razón social o una sede, la
 * lista vuelve igual. `normalizar` es la función con la que se comparan los
 * nombres en quien llama, para que "ya está" signifique lo mismo que "casa".
 */
export const conOtroNombre = (ficha, nombre, normalizar) => {
    const actuales = leerOtrosNombres(ficha);
    const nuevo = limpio(nombre);
    if (!nuevo) return actuales;

    const clave = normalizar(nuevo);
    if (!clave) return actuales;

    const yaResponde = nombresDeLaMadre(ficha).some(n => normalizar(n) === clave)
        || (Array.isArray(ficha?.branches) ? ficha.branches : []).some(s => normalizar(s?.name) === clave);
    if (yaResponde) return actuales;

    return [...actuales, nuevo];
};
