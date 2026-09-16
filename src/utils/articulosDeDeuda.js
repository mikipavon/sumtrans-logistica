import { precioUnitarioArticulo, repreciarArticulos } from './precioArticulo';

// ── Artículos de una deuda apuntada a mano ──────────────────────────────────
//
// Una deuda por albaranes en papel se puede desglosar en los mismos artículos
// que un albarán de la app (BLT_1, palets, lo que tenga la ficha del cliente),
// con el mismo precio que les pondría el alta: tarifa especial del cliente si la
// tiene, precio B2 si la deuda es de pueblos de Baremo 2, y si no el precio base.
// Las líneas se guardan con la misma forma que en el alta ({...artículo,
// uniqueId, quantity, unitPrice, totalPrice}), así que la ficha del recibo las
// enseña tal cual.

// BLT_1 a BLT_10: lo que ve un cliente sin lista propia de artículos en su
// ficha. Es la misma lista que STD_IDS en CreateShipmentModal (allí vive dentro
// del componente, sin exportar); si cambia una, cambiar la otra.
export const ARTICULOS_ESTANDAR = [
    '1774442159060', '1774442159061', '1774442159062', '1774442159063', // BLT_1-4
    '1774442159095', '1774442159096', '1774442159097',                  // BLT_5-7
    '1774442159098', '1774442159099', '1774442159100',                  // BLT_8-10
];

// Los artículos que se le pueden poner a la deuda de un cliente, en el orden de
// su ficha. Sin ficha (o sin lista propia) salen los estándar; si ninguno de
// los ids existe en el catálogo, todo el catálogo antes que una lista vacía.
export const articulosParaCliente = (articles, cliente) => {
    const catalogo = Array.isArray(articles) ? articles : [];
    const ids = (cliente?.allowedArticles?.length > 0 ? cliente.allowedArticles : ARTICULOS_ESTANDAR).map(String);
    const elegidos = catalogo
        .filter(a => ids.includes(String(a.id)))
        .sort((a, b) => ids.indexOf(String(a.id)) - ids.indexOf(String(b.id)));
    return elegidos.length > 0 ? elegidos : catalogo;
};

let contador = 0;

// Una línea nueva de la deuda, con el precio que le tocaría en el alta.
export const lineaDeArticulo = (articulo, cantidad, { cliente = null, baremo = 1 } = {}) => {
    if (!articulo) return null;
    const quantity = Math.max(1, parseInt(cantidad, 10) || 1);
    const unitPrice = precioUnitarioArticulo(articulo, { baremo: Number(baremo) === 2 ? 2 : 1, cliente });
    contador += 1;
    return {
        ...articulo,
        uniqueId: `${Date.now()}-${contador}`,
        quantity,
        unitPrice,
        totalPrice: Math.round(unitPrice * quantity * 100) / 100,
    };
};

// Las mismas líneas con el precio de otro cliente u otro baremo.
export const repreciarLineas = (lineas, { cliente = null, baremo = 1 } = {}) =>
    repreciarArticulos(lineas, { baremo: Number(baremo) === 2 ? 2 : 1, cliente }).articulos;

export const totalDeArticulos = (lineas) =>
    Math.round((lineas || []).reduce((suma, l) => suma + (Number(l.totalPrice) || 0), 0) * 100) / 100;
