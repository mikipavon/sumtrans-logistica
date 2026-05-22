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
