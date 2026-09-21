// Porte de los clientes que cobran por peso (ficha con Tipo de tarifa
// "Por Kilos"): o una tabla de tramos (weightTariff: [{ maxKg, price }]) o una
// fórmula (weightCalculationMode 'formula' + weightFormula: base hasta X kg y
// tanto por kilo de más). Las agencias (XPO, TXT…) suelen ir así.
//
// Es la misma cuenta que hacen el alta (CreateShipmentModal) y la ficha del
// albarán (ShipmentDetailsModal), que la llevan copiada dentro. Aquí está para
// que la importación por fotos cobre igual que si el albarán se tecleara a mano.

/** ¿Este cliente cobra el porte por kilos? */
export function cobraPorKilos(cliente) {
    return cliente?.tariffType === 'Por Kilos';
}

/** Porte por peso en euros; 0 si no hay kilos o la ficha no tiene tarifa. */
export function precioPorKilos(kg, cliente) {
    const peso = parseFloat(kg);
    if (!Number.isFinite(peso) || peso <= 0) return 0;

    if (cliente?.weightCalculationMode === 'formula' && cliente?.weightFormula) {
        const { baseKg, basePrice, extraKgPrice } = cliente.weightFormula;
        const bKg = parseFloat(baseKg) || 0;
        const bPrice = parseFloat(basePrice) || 0;
        const ePrice = parseFloat(extraKgPrice) || 0;
        if (peso <= bKg) return bPrice;
        return bPrice + ((peso - bKg) * ePrice);
    }

    const tramos = cliente?.weightTariff;
    if (!Array.isArray(tramos) || tramos.length === 0) return 0;
    const ordenados = [...tramos].sort((a, b) => a.maxKg - b.maxKg);
    const tramo = ordenados.find(t => peso <= t.maxKg);
    // Más peso que el último tramo: se cobra el último, como en el alta.
    return parseFloat((tramo || ordenados[ordenados.length - 1]).price) || 0;
}

/** "Tramo ≤900kg", como lo guarda el alta en weightBracket. */
export function tramoDePeso(kg, cliente) {
    const tramos = cliente?.weightTariff;
    const peso = parseFloat(kg);
    if (!Array.isArray(tramos) || tramos.length === 0 || !Number.isFinite(peso) || peso <= 0) return '';
    const ordenados = [...tramos].sort((a, b) => a.maxKg - b.maxKg);
    const tramo = ordenados.find(t => peso <= t.maxKg);
    if (tramo) return `Tramo ≤${tramo.maxKg}kg`;
    return `Tramo >${ordenados[ordenados.length - 1].maxKg}kg (máximo)`;
}
