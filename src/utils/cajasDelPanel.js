// Suma de las cajas de todos los repartidores, día a día, para la gráfica del
// Panel de Control.
//
// Cada caja sale de calculateDailyAccount, la misma cuenta que ve el repartidor
// en el móvil y la oficina en su ficha: si aquí se sumara con otra regla, la
// gráfica no cuadraría con los cierres. Los cobros apuntados desde el móvil
// viven en la fila del conductor, una lista por día (`collectedCollections_AAAA-MM-DD`).
//
// calculateDailyAccount recorre todos los envíos varias veces por conductor y
// día; con un año de rango eran millones de fechas que interpretar. Por eso a
// cada día sólo se le pasan los envíos que PUEDEN caer en él (por alguna de sus
// fechas de cobro o entrega) y los que citan sus cobros. La cuenta vuelve a
// mirar cada fecha con isToday, así que sobrar alguno no cambia nada; faltar sí,
// y por eso diasPosibles reproduce todas las formas en que isToday da un día por
// bueno. Una fecha que no se deja leer ('7 sept 2026') tampoco la acepta isToday.

import { calculateDailyAccount } from './accountLogic';

export const claveDelDia = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Las fechas de las que tira calculateDailyAccount para decidir el día de un
// cobro. La del albarán sólo es el respaldo del porte cuando no hay fecha de cobro.
const fechasDelEnvio = (s) => [
    s.portePaidAt, s.paidAt, s.codPaidAt, s.deliveredAt,
    (s.portePaidAt || s.paidAt) ? null : s.date
].filter(Boolean);

// Días en los que isToday podría dar por buena esta fecha.
const diasPosibles = (valor) => {
    const texto = String(valor).trim();
    const dias = [];
    const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) dias.push(`${iso[1]}-${iso[2]}-${iso[3]}`);
    const barras = texto.split('T')[0].split(' ')[0].match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (barras) {
        const [, a, b, y] = barras;
        dias.push(`${y}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`);
        // toLocaleDateString de un navegador en inglés lo escribe al revés
        dias.push(`${y}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`);
    }
    const d = new Date(valor);
    if (!isNaN(d.getTime())) {
        dias.push(claveDelDia(d));
        // isToday prueba también la fecha corrida a UTC
        dias.push(claveDelDia(new Date(d.getTime() + d.getTimezoneOffset() * 60000)));
    }
    return dias;
};

const huboCobro = (s) => s && (s.portePaid || s.codPaid || s.simplifiedInvoicePaid);

/**
 * Caja de todos los repartidores sumada por día, de `desde` a `hasta` (ambos
 * incluidos). Devuelve Map 'AAAA-MM-DD' → { porte, reembolsos, facturas, total }.
 */
export const cajasPorDia = ({ envios, repartidores, clientes, desde, hasta }) => {
    const todos = Array.isArray(envios) ? envios : [];
    const porId = new Map(todos.map((s) => [s.id, s]));

    const porDia = new Map();
    todos.filter(huboCobro).forEach((s) => {
        const dias = new Set(fechasDelEnvio(s).flatMap(diasPosibles));
        dias.forEach((dia) => {
            if (!porDia.has(dia)) porDia.set(dia, []);
            porDia.get(dia).push(s);
        });
    });

    const resultado = new Map();
    const dia = new Date(desde);
    dia.setHours(12, 0, 0, 0);
    const fin = new Date(hasta);
    fin.setHours(23, 59, 59, 999);

    while (dia <= fin) {
        const clave = claveDelDia(dia);
        const suma = { porte: 0, reembolsos: 0, facturas: 0, total: 0 };
        const candidatos = porDia.get(clave) || [];

        (Array.isArray(repartidores) ? repartidores : []).forEach((r) => {
            const cobros = Array.isArray(r?.[`collectedCollections_${clave}`]) ? r[`collectedCollections_${clave}`] : [];
            if (cobros.length === 0 && candidatos.length === 0) return;
            // Los envíos que citan los cobros hacen falta aunque no se cobraran ese
            // día: con ellos la cuenta sabe si la oficina deshizo el cobro y qué
            // precio vale.
            const citados = cobros.map((c) => c?.shipmentId && porId.get(c.shipmentId)).filter(Boolean);
            const cuenta = calculateDailyAccount({
                allShipments: citados.length ? [...new Set([...candidatos, ...citados])] : candidatos,
                driverId: r.id,
                clients: clientes,
                collectedCollections: cobros,
                targetDate: new Date(dia)
            });
            suma.porte += cuenta.collectedPorte;
            suma.reembolsos += cuenta.collectedReembolsos;
            suma.facturas += cuenta.collectedSimplifiedInvoices;
            suma.total += cuenta.dailyTotal;
        });

        resultado.set(clave, {
            porte: Math.round(suma.porte * 100) / 100,
            reembolsos: Math.round(suma.reembolsos * 100) / 100,
            facturas: Math.round(suma.facturas * 100) / 100,
            total: Math.round(suma.total * 100) / 100
        });
        dia.setDate(dia.getDate() + 1);
    }
    return resultado;
};
