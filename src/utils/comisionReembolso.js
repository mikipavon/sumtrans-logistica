/**
 * Comisión que se le cobra al cliente por gestionar un reembolso (COD).
 *
 * Las agencias no cobran todas igual: unas pagan un importe fijo por envío y
 * otras un porcentaje del reembolso con un mínimo por debajo del cual no baja.
 * Antes esto se calculaba suelto en cuatro pantallas distintas (alta de envío,
 * ficha del envío, importación de Excel y portal del cliente) y cada una tenía
 * su propio 3 € de reserva, así que aquí queda una sola versión.
 */

export const COMISION_FIJA = 'fijo';
export const COMISION_PORCENTAJE = 'porcentaje';

const numero = (valor, siNoHay = 0) => {
    if (valor === null || valor === undefined || String(valor).trim() === '') return siNoHay;
    const n = parseFloat(valor);
    return Number.isFinite(n) ? n : siNoHay;
};

const aCentimos = (n) => Math.round(n * 100) / 100;

/**
 * @param {object|null} cliente  Ficha del cliente que factura el envío.
 * @param {number|string} importeReembolso  Lo que el destinatario paga.
 * @param {number|string} comisionPorDefecto  Ajuste general, para clientes sin tarifa propia.
 * @returns {number} Comisión en euros, ya redondeada a céntimos.
 */
export function calcularComisionReembolso(cliente, importeReembolso, comisionPorDefecto = 3) {
    const importe = numero(importeReembolso);
    // Sin reembolso no hay servicio que cobrar, ni siquiera el mínimo.
    if (importe <= 0) return 0;

    const ficha = cliente || {};
    const porDefecto = numero(comisionPorDefecto, 3);

    if (ficha.codFeeMode === COMISION_PORCENTAJE) {
        const porcentaje = numero(ficha.codFeePercent);
        const minimo = numero(ficha.codFeeMin);
        return aCentimos(Math.max(importe * porcentaje / 100, minimo));
    }

    // Modo fijo: un 0 escrito a mano es un 0 de verdad, no "sin configurar".
    const fija = ficha.codFee;
    if (fija === null || fija === undefined || String(fija).trim() === '') return aCentimos(porDefecto);
    return aCentimos(numero(fija, porDefecto));
}

/**
 * Cómo cobra este cliente, en una línea, para enseñarlo en la ficha.
 */
export function textoComisionReembolso(cliente, comisionPorDefecto = 3) {
    const ficha = cliente || {};
    const euros = (n) => `${n.toFixed(2).replace('.', ',')} €`;

    if (ficha.codFeeMode === COMISION_PORCENTAJE) {
        const porcentaje = numero(ficha.codFeePercent);
        const minimo = numero(ficha.codFeeMin);
        const pct = `${String(porcentaje).replace('.', ',')} %`;
        return minimo > 0 ? `${pct} del reembolso, mínimo ${euros(minimo)}` : `${pct} del reembolso`;
    }

    return `${euros(calcularComisionReembolso(ficha, 1, comisionPorDefecto))} por envío`;
}
