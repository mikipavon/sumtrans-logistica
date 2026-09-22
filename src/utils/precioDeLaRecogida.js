// El precio que la oficina dejó fijado en una recogida (CreatePickupModal lo
// guarda como «€12.00» y el número en customAmount), como texto numérico para
// la casilla de precio del alta de albarán, que es numérica y con el símbolo se
// quedaba en blanco. Sin precio («Por valorar») devuelve ''.
export const precioDeLaRecogida = (recogida) => {
    const custom = Number(recogida?.customAmount);
    if (Number.isFinite(custom) && custom > 0) return String(custom);
    const delTexto = parseFloat(String(recogida?.amount ?? '').replace(/[^0-9.,-]+/g, '').replace(',', '.'));
    return Number.isFinite(delTexto) && delTexto > 0 ? String(delTexto) : '';
};
