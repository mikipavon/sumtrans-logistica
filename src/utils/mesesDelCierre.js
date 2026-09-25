// ── Qué meses entran en un cierre de presupuestos ───────────────────────────
//
// El cierre se hace mes a mes, pero septiembre de 2026 es el primer mes con la
// app y los albaranes en papel de agosto se han pasado a mano con su fecha de
// agosto. Miguel quiere cobrarlos en el mismo cierre que septiembre. En general,
// lo que quedó sin cerrar de un mes anterior no puede quedarse olvidado en un mes
// que nadie vuelve a abrir, así que el cierre puede arrastrarlo (casilla en
// BudgetLiquidationModal, marcada de serie).

/** ¿Un albarán de `mes` entra en el cierre de `mesElegido`? Meses en 'YYYY-MM'. */
export const entraEnElCierre = (mes, mesElegido, arrastrarAnteriores) => {
    if (!mes || !mesElegido) return false;
    return arrastrarAnteriores ? mes <= mesElegido : mes === mesElegido;
};

const nombreDeMes = (mes) => {
    const [y, m] = String(mes).split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long' });
};
const anioDe = (mes) => String(mes).slice(0, 4);
const unirConY = (partes) => (partes.length <= 1
    ? partes.join('')
    : `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`);

/**
 * El periodo de un cierre, para títulos y recibos: 'Septiembre de 2026',
 * 'Agosto y septiembre de 2026', 'Diciembre de 2026 y enero de 2027'.
 */
export const nombreDelPeriodo = (meses) => {
    const lista = [...new Set((meses || []).filter(Boolean))].sort();
    if (lista.length === 0) return '';
    const anios = [...new Set(lista.map(anioDe))];
    let texto;
    if (anios.length === 1) {
        texto = `${unirConY(lista.map(nombreDeMes))} de ${anios[0]}`;
    } else {
        texto = unirConY(anios.map(a => `${unirConY(lista.filter(m => anioDe(m) === a).map(nombreDeMes))} de ${a}`));
    }
    return texto.charAt(0).toUpperCase() + texto.slice(1);
};

// Hasta qué día del mes la ventana del cierre abre en el mes anterior.
export const DIAS_PARA_CERRAR_EL_MES_ANTERIOR = 10;

/**
 * El mes con el que abre la ventana del cierre ('YYYY-MM', hora local). Los
 * primeros días se cierra el mes que acaba de terminar: abriendo en el mes en
 * curso, un cierre de septiembre hecho el 2 de octubre arrastraba también los
 * albaranes del 1 y el 2 de octubre (Miguel, 25/09/2026).
 */
export const mesPorDefectoDelCierre = (hoy = new Date()) => {
    const d = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    if (hoy.getDate() <= DIAS_PARA_CERRAR_EL_MES_ANTERIOR) d.setMonth(d.getMonth() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** El mes en que se cerró un recibo: el más reciente de sus albaranes. */
export const mesDelCierre = (meses) => [...(meses || [])].filter(Boolean).sort().pop() || '';
