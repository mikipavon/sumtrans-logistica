// Cuentas de la tarjeta "Ingresos" y del desplegable "Ingresos por cliente"
// del Panel de Control.
//
// Cada albarán cae en UNA sola línea (Facturación, Clientes Habituales o
// Presupuestos) según el tipo de cobro de quien PAGA el porte: el remitente en
// porte pagado, el destinatario en porte debido. Es la misma regla que usan el
// filtro de Envíos y la exportación a Excel (tipoDeClienteDelEnvio). Antes el
// panel lo mandaba a Clientes Habituales si CUALQUIERA de las dos partes lo era,
// y un cliente de facturación que enviaba a un destinatario recién creado
// (toda ficha nace "Clientes Habituales") engordaba la línea equivocada.
//
// La tarjeta y el desplegable salen de la misma lista (ingresosPorCliente), así
// que el total de la tarjeta y el pie del desplegable siempre coinciden.

import { filtroTipoDeCliente, nombreDelPagador } from './filtrosEnvios';
import { normalizarTexto } from './busqueda';

export const CATEGORIAS_DE_INGRESO = [
    { clave: 'facturacion', tipo: 'Facturación', etiqueta: 'Facturación' },
    { clave: 'habituales', tipo: 'Clientes Habituales', etiqueta: 'Clientes Habituales' },
    { clave: 'presupuestos', tipo: 'Presupuesto', etiqueta: 'Presupuestos' }
];

export const TODAS_LAS_CATEGORIAS = CATEGORIAS_DE_INGRESO.map((c) => c.clave);

/**
 * Importe del porte. `amount` suele llevar el símbolo ("€7.00") o ser la palabra
 * "Tarifa" (vale 0); `customAmount` manda si está puesto.
 */
export const importeDelEnvio = (envio) =>
    parseFloat(String(envio?.customAmount || envio?.amount || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;

/** Devuelve una función envío → clave de categoría. Monta los índices de clientes una sola vez. */
export const clasificadorDeIngresos = (clientes) => {
    const filtros = CATEGORIAS_DE_INGRESO.map((c) => [c.clave, filtroTipoDeCliente(c.tipo, clientes)]);
    return (envio) => (filtros.find(([, cumple]) => cumple(envio)) || ['habituales'])[0];
};

/**
 * Qué líneas suman en la tarjeta según las casillas marcadas. "Total General"
 * manda sobre las demás: con ella marcada se suma todo.
 */
export const categoriasMarcadas = ({ total, facturacion, habituales, presupuestos }) => {
    if (total) return TODAS_LAS_CATEGORIAS;
    const marcadas = { facturacion, habituales, presupuestos };
    return TODAS_LAS_CATEGORIAS.filter((clave) => marcadas[clave]);
};

/** Título de la tarjeta: dice qué está sumando. */
export const tituloDeIngresos = (claves) => {
    if (claves.length === TODAS_LAS_CATEGORIAS.length) return 'Ingresos (Total)';
    if (claves.length === 0) return 'Ingresos (ninguna línea)';
    return `Ingresos (${CATEGORIAS_DE_INGRESO
        .filter((c) => claves.includes(c.clave))
        .map((c) => c.etiqueta)
        .join(' + ')})`;
};

/**
 * Ingresos agrupados por quien paga, sólo de las categorías pedidas, de mayor a
 * menor importe. Cada fila: { cliente, categorias, envios, importe }.
 */
export const ingresosPorCliente = (envios, clasificar, claves) => {
    const grupos = new Map();
    (Array.isArray(envios) ? envios : []).forEach((envio) => {
        const categoria = clasificar(envio);
        if (!claves.includes(categoria)) return;
        const nombre = String(nombreDelPagador(envio) || '').trim() || 'Sin cliente';
        const clave = normalizarTexto(nombre) || nombre;
        let fila = grupos.get(clave);
        if (!fila) {
            fila = { cliente: nombre, categorias: [], envios: 0, importe: 0 };
            grupos.set(clave, fila);
        }
        if (!fila.categorias.includes(categoria)) fila.categorias.push(categoria);
        fila.envios += 1;
        fila.importe += importeDelEnvio(envio);
    });
    return Array.from(grupos.values())
        .map((fila) => ({
            ...fila,
            importe: Math.round(fila.importe * 100) / 100,
            categorias: TODAS_LAS_CATEGORIAS.filter((c) => fila.categorias.includes(c))
        }))
        .sort((a, b) => b.importe - a.importe || a.cliente.localeCompare(b.cliente, 'es'));
};

export const sumaDeIngresos = (filas) =>
    Math.round(filas.reduce((suma, fila) => suma + fila.importe * 100, 0)) / 100;
