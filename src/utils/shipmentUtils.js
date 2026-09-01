export const getPackagesCount = (shipment) => {
    if (!shipment) return 1;
    
    let count = parseInt(shipment.packages) || 0;
    if (count > 0) return count;
    
    if (shipment.articles && shipment.articles.length > 0) {
        const badiArticle = shipment.articles.find(a => 
            (a.category === 'BADI') || 
            (a.name && String(a.name).includes('BLT_')) || 
            (a.name && String(a.name).toLowerCase().includes('bulto')) ||
            (a.name && String(a.name).includes('BADI')) ||
            a.id === 'BADI'
        );
        
        if (badiArticle) {
            const parsed = parseInt(String(badiArticle.name).replace(/\D/g, ''));
            if (!isNaN(parsed) && parsed > 0) {
                return parsed * (parseInt(badiArticle.quantity) || 1);
            }
            return parseInt(badiArticle.quantity) || 1;
        } else {
            return shipment.articles.reduce((sum, art) => sum + (parseInt(art.quantity) || 1), 0);
        }
    }
    
    return 1;
};

/**
 * Decide si un albarán 'Pendiente de asignar' sale en la pestaña "Asignar" de un
 * conductor concreto.
 *
 * · Si un conductor lo devolvió deslizando la tarjeta, es SUYO en exclusiva: es el
 *   que ha detectado el error de asignación y el que sabe a quién le toca. Mientras
 *   siga sellado no lo ve ni el creador ni quien escaneó los bultos, para que no haya
 *   dos personas asignando el mismo albarán a conductores distintos.
 * · Sin sello, lo ve quien lo creó o quien recogió los bultos.
 */
export const puedeAsignarloEsteConductor = (shipment, driverId) => {
    if (!shipment || shipment.status !== 'Pendiente de asignar') return false;

    // Los albaranes de oficina se guardan con createdById null. Sin esta guarda,
    // Number(null) es 0 y cualquier comparación contra un id ausente daría positivo.
    const esEl = (id) => id !== null && id !== undefined && id !== '' &&
                         driverId !== null && driverId !== undefined && driverId !== '' &&
                         Number(id) === Number(driverId);

    if (shipment.returnedToAssignById !== null && shipment.returnedToAssignById !== undefined) {
        return esEl(shipment.returnedToAssignById);
    }

    return esEl(shipment.createdById) || esEl(shipment.pickedUpById);
};

/**
 * La población donde el conductor para de verdad.
 *
 * En una recogida el sitio al que va es el ORIGEN; mirando primero el destino, las
 * recogidas se agrupaban en el pueblo de entrega y se ordenaban como si hubiera que
 * pasar por allí.
 */
export const ciudadDeEnvio = (shipment) => {
    if (!shipment) return '';
    return shipment.type === 'Recogida'
        ? (shipment.originCity || shipment.destinationCity || '')
        : (shipment.destinationCity || shipment.originCity || '');
};

/**
 * El nombre con el que se identifica la parada, tanto para buscar la ficha del
 * cliente como para acordarse de en qué orden se entregó. Tiene que ser el mismo en
 * los dos sitios: cuando no lo era, el aprendizaje se guardaba con un nombre y se
 * leía con otro.
 */
export const nombreDeParada = (shipment) => {
    if (!shipment) return '';
    return shipment.type === 'Recogida'
        ? (shipment.originName || shipment.client || '')
        : (shipment.destinationName || shipment.client || '');
};

export const getIrregularReasons = (shipment) => {
    if (!shipment || shipment.notificationDismissed) return [];
    const reasons = [];

    // 0. Asignado a Administración
    if (shipment.status === 'Administración') {
        reasons.push('Asignado a Administración');
    }

    // 1. Observaciones
    if (shipment.observations && String(shipment.observations).replace(/\[COBRO PENDIENTE\]/gi, '').trim() !== '') {
        reasons.push('Tiene observaciones');
    }

    // 2. Más de 4 bultos
    const totalBultos = getPackagesCount(shipment);
    if (totalBultos > 4) {
        reasons.push(`Exceso de bultos (${totalBultos})`);
    }

    // 3. Contiene Palet
    let hasPalet = false;
    if (shipment.packages && String(shipment.packages).toLowerCase().includes('palet')) {
        hasPalet = true;
    }
    if (!hasPalet && shipment.articles && shipment.articles.length > 0) {
        hasPalet = shipment.articles.some(a => String(a.name || '').toLowerCase().includes('palet'));
    }
    if (hasPalet) {
        reasons.push('Contiene Palet');
    }

    return reasons;
};

/**
 * Si un albarán es "de" un conductor a efectos del filtro de la oficina.
 *
 * No basta con el conductor asignado: el día que uno cubre la ruta de otro, el
 * albarán se queda asignado al que faltaba y la entrega, el porte cobrado o el
 * reembolso los firma el que salió a la calle. Filtrando sólo por asignación, ese
 * trabajo desaparecía de su lista y aparecía en la del compañero que no estuvo.
 *
 * Cuenta cualquier intervención real: asignación, entrega, cobro de porte, cobro de
 * reembolso y recogida de bultos. NO cuenta `returnedToAssignById`: devolver una
 * tarjeta a Asignar es rechazar el trabajo, no haberlo hecho.
 */
export const intervinoConductor = (shipment, driverId) => {
    if (!shipment) return false;

    // Los albaranes de oficina llevan ids a null. Sin esta guarda, Number(null) es 0
    // y cualquier comparación contra un id ausente daría positivo.
    const esEl = (id) => id !== null && id !== undefined && id !== '' &&
                         driverId !== null && driverId !== undefined && driverId !== '' &&
                         Number(id) === Number(driverId);

    return esEl(shipment.assignedDriverId) ||
           esEl(shipment.deliveredById) ||
           esEl(shipment.porteCollectedById) ||
           esEl(shipment.codCollectedById) ||
           esEl(shipment.pickedUpById);
};

/**
 * Quién paga el porte de este albarán.
 *
 * 'Debido' es el porte que se cobra en destino: lo paga el DESTINATARIO. Cualquier
 * otra cosa ('Pagado', o un albarán antiguo que venga sin el campo) la paga el
 * REMITENTE, que es quien encarga el transporte.
 */
export const quienPagaElPorte = (shipment) =>
    String(shipment?.porteType || '').trim().toLowerCase() === 'debido'
        ? 'Destinatario'
        : 'Remitente';

const importeDelAlbaran = (val) => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    const str = val.toString().replace(/[^0-9,.-]+/g, '');
    const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
    const num = parseFloat(normalized);
    return isNaN(num) ? 0 : num;
};

/**
 * Las líneas de dinero del justificante de WhatsApp: estado del cobro, precio del
 * porte y reembolso.
 *
 * El justificante se le manda tanto al remitente como al destinatario, pero el
 * precio del porte es cosa de UNO SOLO de los dos: el que paga. Mandándoselo al
 * otro se le enseña lo que factura el de enfrente y, peor todavía, un
 * "PENDIENTE DE COBRO" que parece una deuda suya cuando no lo es. Por eso `paga`:
 * si quien va a recibir el mensaje no es el pagador, del porte no se dice nada.
 *
 * El REEMBOLSO va en los dos justificantes a propósito: lo pone el destinatario
 * pero es dinero del remitente, y los dos necesitan ver que cuadra.
 *
 * @param shipment       el albarán.
 * @param paga           true si quien recibe el mensaje es quien paga el porte.
 * @param isContado      serie HAB-: precio cerrado en mano, sin desglose de IVA.
 * @returns {{estadoText: string, priceText: string, codText: string}} líneas ya
 *          formateadas (con su salto de línea) o cadena vacía si no van.
 */
export const lineasDeDineroDelJustificante = (shipment, { paga = true, isContado = false } = {}) => {
    const envio = shipment || {};

    const hasReembolso = parseFloat(
        String(envio.codAmount || '0').replace(',', '.').replace(/[^0-9.-]/g, '')
    ) > 0;

    // "a cobrar" solo mientras esté sin cobrar: si ya se ha liquidado, el
    // justificante diría lo contrario que la línea de Estado.
    const codText = hasReembolso
        ? (envio.codPaid === true
            ? `*Reembolso cobrado:* ${envio.codAmount} €\n`
            : `*Reembolso a cobrar:* ${envio.codAmount} €\n`)
        : '';

    // Al que no paga, ni el importe ni el estado del porte. Si hay reembolso ya se
    // entera por su propia línea, que esa sí es suya.
    if (!paga) return { estadoText: '', priceText: '', codText };

    const priceBase = importeDelAlbaran(envio.customAmount || envio.amount);
    const priceIva = +(priceBase * 0.21).toFixed(2);
    const priceTotal = +(priceBase + priceIva).toFixed(2);
    const fmt = (n) => n.toFixed(2).replace('.', ',');

    const priceText = priceBase > 0
        ? (isContado
            ? `*Precio:* ${fmt(priceBase)} €\n`
            : `*Precio:* ${fmt(priceBase)} € + IVA = *${fmt(priceTotal)} €*\n`)
        : '';

    // El cliente no necesita saber en qué pestaña interna anda el albarán
    // ("Pendiente de asignar" y compañía son etiquetas nuestras): lo que le
    // importa del justificante es si el porte queda cobrado o a deber.
    // Ojo: porte y reembolso se liquidan por separado, así que "PAGADO" solo
    // vale cuando no queda ninguno de los dos suelto (ver Shipment.js).
    const porteCobrado = envio.portePaid === true || envio.paymentStatus === 'Paid';
    const reembolsoPendiente = hasReembolso && envio.codPaid !== true;
    // 'Tarifa' es un importe por concretar, pero se cobra igual: cuenta como
    // que hay algo pendiente aunque el precio no salga en el mensaje.
    const hayQueCobrar = priceBase > 0 || hasReembolso ||
        String(envio.amount || '').toLowerCase().trim() === 'tarifa';

    const estadoText = !hayQueCobrar
        ? ''
        : porteCobrado
            ? (reembolsoPendiente
                ? `*Estado:* Porte pagado · reembolso pendiente\n`
                : `*Estado:* PAGADO\n`)
            : `*Estado:* PENDIENTE DE COBRO\n`;

    return { estadoText, priceText, codText };
};
