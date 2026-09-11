// ── El número de ficha del cliente ──
//
// El prefijo lo marca la forma de cobro: Presupuesto va en la serie P-,
// Clientes Habituales en la CH-, y lo que se factura va en la serie a secas.
// Dentro de cada serie se coge el primer hueco libre, no el último más uno: si
// se borra la ficha 7, la siguiente alta vuelve a ser la 7.
export const prefijoDeCliente = (billingType) => {
    if (billingType === 'Presupuesto') return 'P-';
    if (billingType === 'Clientes Habituales') return 'CH-';
    return '';
};

export const siguienteNumeroDeCliente = (fichas, prefijo) => {
    const ocupados = new Set();
    (fichas || []).forEach(c => {
        const str = String(c?.clientNumber || '').trim();
        if (prefijo) {
            if (str.startsWith(prefijo)) {
                const num = parseInt(str.substring(prefijo.length), 10);
                if (!isNaN(num) && num > 0) ocupados.add(num);
            }
        } else if (/^\d+$/.test(str)) {
            // Sin prefijo sólo cuentan los números pelados: el "CH-3" de otra
            // serie no ocupa el 3 de ésta.
            const num = parseInt(str, 10);
            if (!isNaN(num) && num > 0) ocupados.add(num);
        }
    });
    let siguiente = 1;
    while (ocupados.has(siguiente)) siguiente++;
    return `${prefijo}${siguiente}`;
};

// ── "Auto" también al editar ──
//
// Hay fichas en cartera con la columna Nº Cliente en blanco: las de antes de
// que la numeración fuera automática y las que entran en una restauración de
// copia de seguridad, que se graban tal cual venían en el fichero. Hasta ahora
// no había forma de arreglarlas desde la aplicación salvo escribir el número a
// mano: la casilla pone "Auto", pero el reparto automático sólo corría al dar
// de alta, al importar y al aprobar en Validar Clientes. Al guardar una ficha
// que ya existía no corría nadie.
//
// Devuelve el número que hay que ponerle, o null si no hay que tocarle nada:
// si ya tiene el suyo no se renumera —el número es con el que el cliente
// aparece en Factusol y en sus facturas—, y si la oficina ha escrito uno,
// manda el que ha escrito.
export const numeroQueLeFalta = (ficha, fichas) => {
    if (String(ficha?.clientNumber || '').trim()) return null;
    return siguienteNumeroDeCliente(fichas, prefijoDeCliente(ficha?.billingType));
};

// ── Repasar de golpe las que se quedaron sin número ──
//
// Arreglarlas de una en una (abrir la ficha, guardar, cerrar) es el camino
// largo cuando son decenas. Esto prepara la lista entera de antemano para poder
// enseñarla ANTES de tocar nada: qué ficha y qué número le tocaría.
//
// El número que se va repartiendo entra en la cuenta para la siguiente. Sin eso
// las tres fichas sin número de la serie CH- sacarían las tres el mismo hueco
// libre —ninguna lo ha ocupado todavía— y acabarían las tres siendo la CH-12.
//
// `candidatas` son las fichas que hay que repasar, en el orden en que se van a
// enseñar; `cartera` es contra quién se mira que el número esté libre, y tiene
// que ser la cartera COMPLETA aunque en pantalla se vea sólo una parte: un
// número ocupado por una ficha que ahora mismo no se ve sigue estando ocupado.
export const planDeNumeracion = (candidatas, cartera) => {
    const ocupadas = [...(cartera || [])];
    const plan = [];
    (candidatas || []).forEach(ficha => {
        const numero = numeroQueLeFalta(ficha, ocupadas);
        if (!numero) return;
        plan.push({ id: ficha.id, name: ficha.name, billingType: ficha.billingType, clientNumber: numero });
        ocupadas.push({ clientNumber: numero });
    });
    return plan;
};
