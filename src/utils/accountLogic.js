/**
 * Utilidad para centralizar la lógica de cálculo de saldos y reembolsos del cierre de caja diario.
 */

export const parseAmount = (amount) => {
    if (typeof amount === 'number') return amount;
    if (!amount) return 0;
    
    let str = amount.toString().trim();
    // Remove currency symbols and other non-math stuff, but keep commas and dots
    str = str.replace(/[^0-9,.-]/g, '');

    if (str.includes(',') && str.includes('.')) {
        // Assume format like 1.250,50
        str = str.replace(/\./g, '').replace(',', '.');
    } else if (str.includes(',')) {
        // Assume format like 10,50
        str = str.replace(',', '.');
    }

    const val = parseFloat(str);
    return isNaN(val) ? 0 : val;
};

export const isToday = (dateValue, targetDate = new Date()) => {
    if (!dateValue) return false;
    try {
        const today = new Date(targetDate);
        today.setHours(0, 0, 0, 0);

        // 1. Direct Date object or ISO string in new Date()
        const d = new Date(dateValue);
        if (!isNaN(d.getTime())) {
            // Check for potential UTC shift if it's a date-only string like "2026-04-13"
            // We want to compare the "calendar day" regardless of time/timezone
            const dLocal = new Date(d.getTime() + (d.getTimezoneOffset() * 60000));
            
            // Try both original and local-corrected (heuristics for ISO date-only strings)
            const matchOrig = d.getFullYear() === today.getFullYear() && 
                            d.getMonth() === today.getMonth() && 
                            d.getDate() === today.getDate();
            const matchLocal = dLocal.getFullYear() === today.getFullYear() && 
                             dLocal.getMonth() === today.getMonth() && 
                             dLocal.getDate() === today.getDate();
            
            if (matchOrig || matchLocal) return true;
        }

        // 2. Strict String matching (YYYY-MM-DD)
        const dvStr = String(dateValue).trim().split('T')[0].split(' ')[0];
        const dateMatch = dvStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (dateMatch) {
            const [_, y, m, d] = dateMatch.map(Number);
            if (y === today.getFullYear() && m === (today.getMonth() + 1) && d === today.getDate()) return true;
        }

        // 3. DD/MM/YYYY matching
        const slashMatch = dvStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (slashMatch) {
            const [_, d, m, y] = slashMatch.map(Number);
            if (y === today.getFullYear() && m === (today.getMonth() + 1) && d === today.getDate()) return true;
        }

        // 4. Locale-based matching as a last resort
        const todayLocale = today.toLocaleDateString();
        if (dvStr === todayLocale) return true;

        return false;
    } catch (e) { return false; }
};


export const isCashClient = (clientName, clientsOrMap = [], fallbackBillingType = null) => {
    if (!clientName) return true;
    const normalize = (s) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
    const nName = normalize(clientName);

    const checkBillingType = (type, fallback = null) => {
        // Si el fallback del albarán dice "Facturación", prevalece sobre la ficha del cliente
        // porque el albarán se creó con el contexto correcto del cliente padre (ej: sedes/sucursales)
        const effectiveType = fallback || type;
        if (!effectiveType) return true; // Sin tipo conocido -> asumir contado por seguridad
        const tFallback = fallback ? normalize(fallback) : '';
        const tType = type ? normalize(type) : '';
        // Si CUALQUIERA de los dos indica facturación, NO es contado
        if (tFallback && (tFallback.includes('factur') || tFallback.includes('mensual') || tFallback.includes('presupuesto'))) return false;
        if (tType && (tType.includes('factur') || tType.includes('mensual') || tType.includes('presupuesto'))) return false;
        return true;
    };

    // MODO ALTO RENDIMIENTO: Si recibimos un Mapa indexado (O(1))
    if (clientsOrMap instanceof Map) {
        const c = clientsOrMap.get(nName);
        if (c) return checkBillingType(c.billingType || c.tipoFacturacion, fallbackBillingType);
    }

    // MODO COMPATIBILIDAD: Busqueda lineal en Array (O(N))
    if (clientsOrMap && Array.isArray(clientsOrMap)) {
        for (const cl of clientsOrMap) {
            if (normalize(cl.name) === nName || normalize(cl.legalName) === nName) {
                return checkBillingType(cl.billingType || cl.tipoFacturacion, fallbackBillingType);
            }
            if (cl.branches && Array.isArray(cl.branches)) {
                for (const branch of cl.branches) {
                    if (normalize(branch.name) === nName) {
                        return checkBillingType(cl.billingType || cl.tipoFacturacion, fallbackBillingType);
                    }
                }
            }
        }
    }

    // Si no esta en el listado, usamos el tipo de facturacion de respaldo si se proporciono
    if (fallbackBillingType) {
        return checkBillingType(fallbackBillingType);
    }

    return true; // Por defecto si no sabemos nada es contado
};

export const calculateDailyAccount = ({ allShipments, driverId, clients, collectedCollections, targetDate = new Date(), deletedShipmentIds = null }) => {
    const driverIdNum = Number(driverId);

    /**
     * IMPORTANTE - REGLA DE NEGOCIO "CASO 5":
     * Un envío de "Clientes Habituales" con "Porte Pagado" + "Reembolso" genera dos entradas:
     * 1. El Porte (shipping fee) se suma a totalPrepaid si s.portePaid es true.
     * 2. El Reembolso (COD) se suma a totalReimbursements si s.codPaid es true.
     * 
     * IMPORTANTE - REGLA DE NEGOCIO "CASO 6":
     * Un envío de "Porte Debido" se cobra en destino.
     * 1. Se suma a totalDelivered si s.status === 'Entregado' y s.portePaid es true.
     * 
     * IMPORTANTE - REGLA DE NEGOCIO "CASO 7":
     * Un envío de "Porte Debido" donde el DESTINATARIO es de Facturación.
     * 1. El Porte NO se suma a la caja (se filtra por no ser cliente de contado).
     * 2. El Reembolso SI se suma a la caja si s.codPaid es true.
     */
    const todayRef = new Date(targetDate);
    const todayStr = `${todayRef.getFullYear()}-${String(todayRef.getMonth() + 1).padStart(2, '0')}-${String(todayRef.getDate()).padStart(2, '0')}`;
    


    const getShipmentDate = (s) => s.date || s.date_created || (s.updatedAt ? new Date(s.updatedAt).toLocaleDateString() : todayStr);

    // 1. Cobros en Origen (Porte Pagado hoy)
    const prepaidCollections = (allShipments || []).filter(s => {
        if (!s || s.porteType !== 'Pagado' || !s.portePaid) return false;
        if (s.hasSimplifiedInvoice) return false; // Se contabiliza aparte
        
        let isMyResponsibility = false;
        if (s.porteCollectedById) {
            isMyResponsibility = Number(s.porteCollectedById) === driverIdNum;
        } else if (s.createdById) {
            // Para Porte Pagado, el que lo CREÓ es quien lo COBRÓ en origen
            isMyResponsibility = Number(s.createdById) === driverIdNum;
        } else {
            isMyResponsibility = Number(s.assignedDriverId) === driverIdNum;
        }
        
        if (!isMyResponsibility) return false;
        // BUG FIX: removed isToday(s.updatedAt) to prevent old prepaid shipments from reappearing when unassigned or edited today.
        if (!isToday(s.paidAt, targetDate) && !isToday(s.date, targetDate)) return false;
        return isCashClient(s.client, clients, s.billingType);
    });

    // 2. Cobros en Entrega (Porte Debido hoy)
    const deliveredCollectionsRaw = (allShipments || []).filter(s => {
        if (!s || s.porteType !== 'Debido' || s.status !== 'Entregado' || !s.portePaid) return false;
        if (s.hasSimplifiedInvoice) return false; // Se contabiliza aparte

        let isMyResponsibility = false;
        if (s.porteCollectedById) {
            isMyResponsibility = Number(s.porteCollectedById) === driverIdNum;
        } else {
            isMyResponsibility = Number(s.assignedDriverId) === driverIdNum;
        }

        if (!isMyResponsibility) return false;
        // Día del cobro o, si falta, día de la entrega. Nunca updatedAt: un
        // retoque de la oficina al albarán hoy hacía reaparecer en la Cuenta de
        // hoy un porte Debido cobrado ayer (mismo fallo que los reembolsos).
        if (!isToday(s.paidAt, targetDate) && !isToday(s.deliveredAt, targetDate)) return false;
        // Para Porte Debido, el que paga es el DESTINATARIO, por tanto miramos si el destino es contado
        return isCashClient(s.destinationName || s.client, clients, s.destinationBillingType);
    });

    // 3. Cobros Manuales (desde pestaña Cobros o generados en entrega)
    //
    // Un cobro es dinero que el conductor lleva encima. Solo se descarta cuando CONSTA
    // que el envío fue borrado (`deletedShipmentIds`), nunca por no encontrarlo en
    // `allShipments`: esa lista trae los envíos activos y los finalizados de los últimos
    // 90 días, así que un envío fuera de esa ventana —o que no llegó por un fallo de
    // carga— no es un envío borrado, y darlo por borrado hacía desaparecer el dinero de
    // la caja del día sin ningún aviso.
    const deletedIds = deletedShipmentIds instanceof Set
        ? deletedShipmentIds
        : new Set(deletedShipmentIds || []);
    const isDeletedShipment = (c) => Boolean(c.shipmentId) && deletedIds.has(c.shipmentId);

    // El envío no está cargado: el cobro cuenta igual, pero se marca para que la oficina
    // vea que no se puede contrastar con su albarán.
    const existingShipmentIds = new Set((allShipments || []).map(s => s.id));
    const isShipmentMissing = (c) => Boolean(c.shipmentId) && !existingShipmentIds.has(c.shipmentId);

    // La oficina ha deshecho el cobro. Un compañero pulsa "Marcar Cobrado" por
    // error; la oficina edita el albarán y lo vuelve a poner en Pendiente de
    // Cobro. Eso corrige el albarán (portePaid / codPaid a false) pero la entrada
    // que el móvil apuntó en la lista de cobros del día seguía aquí, así que la
    // Cuenta seguía sumando un dinero que el albarán decía que no se había cobrado,
    // y encima el mismo porte volvía a salir en Cobros como pendiente. El albarán
    // manda: si está cargado y dice que esa parte NO está cobrada, la entrada no
    // cuenta. Si el albarán no está cargado no se puede saber, y el cobro cuenta
    // igual (ver arriba).
    const cobroDeshecho = (c) => {
        if (!c.shipmentId) return false;
        const ship = (allShipments || []).find(s => s.id === c.shipmentId);
        if (!ship) return false;
        if (c.type === 'Reembolso') return !ship.codPaid;
        return !ship.portePaid;
    };

    const manualPorteCollections = (collectedCollections || [])
        .filter(c => {
            if (isDeletedShipment(c)) return false;
            if (cobroDeshecho(c)) return false;
            const matchType = (c.type === 'Porte' || c.type === 'Efectivo');
            const matchDate = isToday(c.date, targetDate);
            if (matchType && (c.date === todayStr || matchDate)) return true;
            return false;
        })
        .filter((c, index, self) => 
            // Si tiene shipmentId, solo dejamos la primera ocurrencia por envío y tipo
            !c.shipmentId || index === self.findIndex(t => t.shipmentId === c.shipmentId && t.type === c.type)
        )
        .filter(c => {
            // Excluir cobros de porte cuyo envío ya tiene Factura Simplificada
            // (se contabilizan en la sección de Facturas Simplificadas, no aquí)
            if (!c.shipmentId) return true;
            const ship = (allShipments || []).find(s => s.id === c.shipmentId);
            return !ship?.hasSimplifiedInvoice;
        });

    // Filtramos los envíos que ya figuran explícitamente en cobros manuales
    const uniqueDeliveredCollections = deliveredCollectionsRaw.filter(s => 
        !manualPorteCollections.some(c => c.shipmentId === s.id)
    );
    const uniquePrepaidCollections = prepaidCollections.filter(s => 
        !manualPorteCollections.some(c => c.shipmentId === s.id)
    );

    // 4. Totales de Portes (priorizamos customAmount si está modificado)
    const totalPrepaid = uniquePrepaidCollections.reduce((sum, s) => sum + parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount), 0);
    const totalDelivered = uniqueDeliveredCollections.reduce((sum, s) => sum + parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount), 0);
    const totalManualPorte = manualPorteCollections.reduce((sum, c) => {
        // Prioridad: importe del cobro (lo que realmente se cobró) > importe del envío
        const collectedAmt = parseAmount(c.amount);
        if (collectedAmt > 0) return sum + collectedAmt;
        const ship = (allShipments || []).find(s => s.id === c.shipmentId);
        const shipAmt = ship ? (parseAmount(ship.customAmount) > 0 ? ship.customAmount : ship.amount) : null;
        return sum + (shipAmt !== null ? parseAmount(shipAmt) : 0);
    }, 0);
    const totalPorteValue = totalPrepaid + totalDelivered + totalManualPorte;

    // 5. Reembolsos
    const collectedReembolsosRaw = (collectedCollections || [])
        .filter(c => c.type === 'Reembolso' && isToday(c.date, targetDate))
        .filter(c => !isDeletedShipment(c))
        .filter(c => !cobroDeshecho(c))
        .filter((c, index, self) => 
            !c.shipmentId || index === self.findIndex(t => t.shipmentId === c.shipmentId && t.type === c.type)
        );

    console.log("📊 [AccountLogic] Filtered manual Porte:", manualPorteCollections.length);
    console.log("📊 [AccountLogic] Filtered manual Reembolso:", collectedReembolsosRaw.length);

    // Un reembolso entra en la caja del día en que se COBRÓ (paidAt) o, si el
    // albarán no guardó esa hora, del día en que se ENTREGÓ (deliveredAt). Nunca
    // por updatedAt: cualquier retoque de la oficina al albarán (corregir un
    // nombre, un bulto) pone updatedAt a hoy, y así un reembolso cobrado ayer se
    // volvía a colar en la Cuenta de hoy del repartidor.
    const derivedReembolsos = (allShipments || []).filter(s => {
        if (!s || !s.codAmount || parseAmount(s.codAmount) <= 0 || s.status !== 'Entregado' || !s.codPaid) return false;
        if (!isToday(s.paidAt || s.deliveredAt, targetDate)) return false;

        let isMyResponsibility = false;
        if (s.codCollectedById) {
             isMyResponsibility = Number(s.codCollectedById) === driverIdNum;
        } else {
             isMyResponsibility = Number(s.assignedDriverId) === driverIdNum;
        }

        return isMyResponsibility;
    });
    const uniqueDerivedReembolsos = derivedReembolsos.filter(d => 
        !collectedReembolsosRaw.some(c => c.shipmentId === d.id)
    );
    const totalReimbursements = [...uniqueDerivedReembolsos.map(s => s.codAmount), ...collectedReembolsosRaw.map(c => {
        const ship = (allShipments || []).find(s => s.id === c.shipmentId);
        return ship ? ship.codAmount : c.amount;
    })].reduce((sum, a) => sum + parseAmount(a), 0);

    // 6. Preparar listados para UI e Impresión
    const allPorteDetail = [
        ...uniquePrepaidCollections.map(s => ({
            id: s.id,
            key: `pre-${s.id}`,
            date: getShipmentDate(s),
            client: s.client,
            sender: s.client,
            receiver: s.destinationName || 'Destinatario',
            payer: 'sender',
            detail: `Porte Pagado - ${s.id}`,
            amount: parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount).toFixed(2),
            amountDisplay: `€${parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount).toFixed(2)}`,
            colorClass: 'text-emerald-600',
            sourceTitle: 'Cobro Origen',
            source: 'shipment'
        })),
        ...uniqueDeliveredCollections.map(s => ({
            id: s.id,
            key: `del-${s.id}`,
            date: getShipmentDate(s),
            client: s.destinationName || s.client,
            sender: s.originName || s.client,
            receiver: s.destinationName || 'Destinatario',
            payer: 'receiver',
            detail: `Porte Debido - ${s.id}`,
            amount: parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount).toFixed(2),
            amountDisplay: `€${parseAmount(parseAmount(s.customAmount) > 0 ? s.customAmount : s.amount).toFixed(2)}`,
            colorClass: 'text-emerald-600',
            sourceTitle: 'Entrega',
            source: 'shipment'
        })),
        ...manualPorteCollections.map(c => {
            const ship = (allShipments || []).find(s => s.id === c.shipmentId);
            // Prioridad: importe del cobro (lo que el conductor realmente cobró) > importe del envío
            const collectedAmt = parseAmount(c.amount);
            const shipAmt = ship ? (parseAmount(ship.customAmount) > 0 ? ship.customAmount : ship.amount) : null;
            const amountToUse = collectedAmt > 0 ? c.amount : ((shipAmt !== null && parseAmount(shipAmt) > 0) ? shipAmt : c.amount);
            // El nombre del pagador se guardó en la entrada tal como estaba al
            // cobrar. Si la oficina corrige después el destinatario (o el
            // remitente), la Cuenta debe enseñar el nombre actual del albarán.
            const pagadorActual = ship
                ? (ship.porteType === 'Debido' ? ship.destinationName : (ship.client || ship.originName))
                : null;
            return {
                id: c.shipmentId || c.id,
                key: `man-${c.id}`,
                date: c.date || (ship ? getShipmentDate(ship) : todayStr),
                client: pagadorActual || c.client,
                sender: c.sender || (ship ? (ship.originName || ship.client) : 'Remitente'),
                receiver: (ship ? ship.destinationName : (c.client === 'Destinatario' ? c.client : 'Destinatario')) || 'Destinatario',
                payer: (ship && ship.porteType === 'Pagado') ? 'sender' : 'receiver',
                detail: `Cobrado en Cobros - ${c.id}`,
                amount: parseAmount(amountToUse).toFixed(2),
                amountDisplay: `€${parseAmount(amountToUse).toFixed(2)}`,
                colorClass: 'text-amber-600',
                sourceTitle: 'Cobro Manual',
                source: 'collected',
                shipmentMissing: isShipmentMissing(c)
            };
        })
    ];

    const allReimbursementsDetail = [
        ...uniqueDerivedReembolsos.map(s => ({
            id: s.id,
            key: s.id,
            client: s.destinationName || s.client,
            sender: s.originName || s.client,
            type: 'Reembolso',
            detail: `Reembolso - ${s.id}`,
            amount: parseAmount(s.codAmount).toFixed(2),
            amountDisplay: `€${parseAmount(s.codAmount).toFixed(2)}`,
            colorClass: 'text-indigo-600',
            source: 'derived',
            original: s
        })),
        ...collectedReembolsosRaw.map(c => {
            const ship = (allShipments || []).find(s => s.id === c.shipmentId);
            // Prioridad: importe del cobro (lo que realmente se cobró) > importe del envío
            const collectedAmt = parseAmount(c.amount);
            const amountToUse = collectedAmt > 0 ? c.amount : (ship ? ship.codAmount : c.amount);
            return {
                id: c.shipmentId || c.id,
                key: c.id,
                client: c.client,
                // El remitente es a quien se le entrega el dinero, así que el
                // justificante lo necesita sí o sí. Los cobros antiguos se
                // guardaron sin este campo: caemos al envío como en los portes.
                sender: c.sender || (ship ? (ship.originName || ship.client) : 'Remitente'),
                type: 'Reembolso',
                detail: `Reembolso Cobrado - ${c.id}`,
                amount: parseAmount(amountToUse).toFixed(2),
                amountDisplay: `€${parseAmount(amountToUse).toFixed(2)}`,
                colorClass: 'text-indigo-600',
                source: 'collected',
                original: c,
                shipmentMissing: isShipmentMissing(c)
            };
        })
    ];

    // 7. Facturas Simplificadas (cobros con IVA, sección aparte)
    const simplifiedInvoices = (allShipments || []).filter(s => {
        if (!s || !s.hasSimplifiedInvoice || !s.simplifiedInvoicePaid) return false;
        // Evitar que s.updatedAt cause falsos positivos al desasignar
        if (!isToday(s.paidAt, targetDate) && !isToday(s.date, targetDate)) return false;

        let isMyResponsibility = false;
        if (s.porteCollectedById) {
            isMyResponsibility = Number(s.porteCollectedById) === driverIdNum;
        } else {
            isMyResponsibility = Number(s.assignedDriverId) === driverIdNum ||
                                 (Number(s.createdById) === driverIdNum && !s.assignedDriverId);
        }
        return isMyResponsibility;
    });

    // simplifiedInvoiceAmount ya incluye IVA (se guardó así desde el modal de entrega)
    const totalSimplifiedInvoices = simplifiedInvoices.reduce((sum, s) => sum + parseAmount(s.simplifiedInvoiceAmount || s.amount), 0);

    const allSimplifiedInvoiceDetail = simplifiedInvoices.map(s => {
        const totalWithIva = parseAmount(s.simplifiedInvoiceAmount || s.amount);
        const base = +(totalWithIva / 1.21).toFixed(2);
        const iva = +(totalWithIva - base).toFixed(2);
        return {
            id: s.id,
            key: `fs-${s.id}`,
            date: getShipmentDate(s),
            client: s.destinationName || s.client,
            detail: `Factura Simple - ${s.id}`,
            base: base.toFixed(2),
            iva: iva.toFixed(2),
            amount: totalWithIva.toFixed(2),
            amountDisplay: `€${totalWithIva.toFixed(2)}`,
            colorClass: 'text-orange-600',
            source: 'simplified',
            original: s
        };
    });

    const dailyTotal = (totalPorteValue || 0) + (totalReimbursements || 0) + (totalSimplifiedInvoices || 0);

    return {
        collectedPorte: totalPorteValue || 0,
        collectedReembolsos: totalReimbursements || 0,
        collectedSimplifiedInvoices: totalSimplifiedInvoices || 0,
        dailyTotal: dailyTotal || 0,
        allPorteDetail: allPorteDetail || [],
        allReimbursementsDetail: allReimbursementsDetail || [],
        allSimplifiedInvoiceDetail: allSimplifiedInvoiceDetail || []
    };
};
