// ── Varios artículos con cantidad en el portal del cliente ──
//
// En el portal el cliente elige UN tipo de mercancía y el envío nace con una
// unidad. Para casi todos vale: cada BLT_n ya dice cuántos bultos son. Pero
// los talleres de neumáticos mandan siempre por cantidad ("4 de turismo y 2
// de 4x4"), y con un solo artículo no podían decirlo (Neumáticos Velasco,
// 21/09/2026).
//
// La ficha del cliente lleva el interruptor `portalVariosArticulos`. Con él
// puesto, el portal enseña una lista: elige artículo, pone cantidad, Añadir,
// y repite. Sin él, todo sigue como siempre. Lo decide la oficina en la ficha
// (pestaña Artículos), no el nombre del artículo: en el catálogo se llaman
// "TURISMO", "CAJACÁMARAS"... y no hay forma fiable de adivinarlo.

/** true si en el portal este cliente puede meter varias líneas con cantidad. */
export const elPortalAdmiteVariosArticulos = (cliente) => !!cliente?.portalVariosArticulos;

/** Entero de 1 para arriba, o null si lo tecleado no vale. */
export const cantidadValida = (tecleada) => {
    const n = parseInt(tecleada, 10);
    return Number.isInteger(n) && n > 0 && String(tecleada).trim() === String(n) ? n : null;
};

/**
 * Añade una línea { articleId, quantity }. Si el artículo ya estaba, se suman
 * las cantidades en vez de duplicar la línea. Devuelve la lista nueva; si el
 * artículo o la cantidad no valen, devuelve la misma lista sin tocar.
 */
export const anadirLinea = (lineas, articleId, cantidad) => {
    const n = cantidadValida(cantidad);
    if (articleId === undefined || articleId === null || articleId === '' || n === null) return lineas;
    const id = String(articleId);
    const existente = lineas.find(l => String(l.articleId) === id);
    if (existente) {
        return lineas.map(l => String(l.articleId) === id ? { ...l, quantity: l.quantity + n } : l);
    }
    return [...lineas, { articleId: id, quantity: n }];
};

export const quitarLinea = (lineas, articleId) =>
    lineas.filter(l => String(l.articleId) !== String(articleId));

/** Las líneas guardadas en un envío (sus articles), para volver a editarlas. */
export const lineasDelEnvio = (envio) =>
    (Array.isArray(envio?.articles) ? envio.articles : [])
        .filter(a => a && a.id !== undefined && a.id !== null)
        .map(a => ({ articleId: String(a.id), quantity: cantidadValida(a.quantity) ?? 1 }));

/** Cuántos bultos son: un BLT_n cuenta n por unidad; cualquier otro, uno por unidad. */
export const bultosDeLosArticulos = (articulos) => {
    const total = (articulos || []).reduce((suma, a) => {
        const cantidad = cantidadValida(a.quantity) ?? 1;
        if (a.category === 'BADI') {
            const n = parseInt(String(a.name || '').replace(/\D/g, ''), 10);
            if (!isNaN(n) && n > 0) return suma + n * cantidad;
        }
        return suma + cantidad;
    }, 0);
    return total > 0 ? total : 1;
};

/**
 * Convierte las líneas en los articles del envío, valorados. `precioUnitario`
 * es la función que da el precio de cada artículo (el baremo ya va dentro).
 * Devuelve { articles, total }.
 */
export const valorarLineas = (lineas, articulosDisponibles, precioUnitario) => {
    const articles = [];
    let total = 0;
    (lineas || []).forEach((linea, i) => {
        const articulo = (articulosDisponibles || []).find(a => String(a.id) === String(linea.articleId));
        if (!articulo) return;
        const cantidad = cantidadValida(linea.quantity) ?? 1;
        const unitPrice = Number(precioUnitario(articulo)) || 0;
        const totalPrice = unitPrice * cantidad;
        total += totalPrice;
        articles.push({ ...articulo, uniqueId: Date.now() + i, quantity: cantidad, unitPrice, totalPrice });
    });
    return { articles, total };
};
