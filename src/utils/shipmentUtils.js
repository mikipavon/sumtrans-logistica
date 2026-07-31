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
