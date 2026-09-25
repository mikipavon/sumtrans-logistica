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
import { quienPagaElPorte } from './shipmentUtils';

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

/**
 * Título de la tarjeta: dice qué está sumando. `conCaja` añade la línea Caja
 * (portes cobrados por los repartidores), que no es una categoría de albarán.
 */
export const tituloDeIngresos = (claves, conCaja = false) => {
    if (claves.length === TODAS_LAS_CATEGORIAS.length) return 'Ingresos (Total)';
    const nombres = CATEGORIAS_DE_INGRESO
        .filter((c) => claves.includes(c.clave))
        .map((c) => c.etiqueta)
        .concat(conCaja ? ['Caja'] : []);
    if (nombres.length === 0) return 'Ingresos (ninguna línea)';
    return `Ingresos (${nombres.join(' + ')})`;
};

/**
 * Devuelve una función envío → ficha madre de quien paga (o null si no hay
 * ficha). Las sedes no son clientes aparte: una sede guardada dentro de la
 * ficha (branches) y una ficha numerada "123-A" cuentan para su matriz, igual
 * que al decidir el tipo de cobro en filtrosEnvios.
 */
const buscadorDeMatriz = (clientes) => {
    const porNombre = new Map();
    const porId = new Map();
    const porNumero = new Map();
    (Array.isArray(clientes) ? clientes : []).forEach((c) => {
        if (!c) return;
        if (c.id != null) porId.set(String(c.id), c);
        const numero = String(c.clientNumber || '').trim();
        if (numero && !porNumero.has(numero)) porNumero.set(numero, c);
        [c.name, c.legalName]
            .concat(Array.isArray(c.branches) ? c.branches.map((b) => b?.name) : [])
            .forEach((n) => {
                const clave = normalizarTexto(n);
                if (clave && !porNombre.has(clave)) porNombre.set(clave, c);
            });
    });
    const matriz = (ficha) => {
        const m = String(ficha?.clientNumber || '').trim().match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
        return (m && porNumero.get(m[1])) || ficha;
    };
    return (envio) => {
        let ficha = porNombre.get(normalizarTexto(nombreDelPagador(envio)));
        if (!ficha && quienPagaElPorte(envio) !== 'Destinatario' && envio?.clientId != null) {
            ficha = porId.get(String(envio.clientId));
        }
        return ficha ? matriz(ficha) : null;
    };
};

/**
 * Ingresos agrupados por quien paga —con sus sedes sumadas a la ficha madre—,
 * sólo de las categorías pedidas, de mayor a menor importe.
 * Cada fila: { cliente, categorias, envios, importe }.
 */
export const ingresosPorCliente = (envios, clasificar, claves, clientes = []) => {
    const matrizDe = buscadorDeMatriz(clientes);
    const grupos = new Map();
    (Array.isArray(envios) ? envios : []).forEach((envio) => {
        const categoria = clasificar(envio);
        if (!claves.includes(categoria)) return;
        const ficha = matrizDe(envio);
        const nombre = String(ficha?.name || nombreDelPagador(envio) || '').trim() || 'Sin cliente';
        const clave = ficha?.id != null ? `ficha:${ficha.id}` : (normalizarTexto(nombre) || nombre);
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
