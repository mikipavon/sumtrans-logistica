import { LogOut, FileText, Truck, Map, Package, Plus, Clock, Euro, Wallet, ArrowUpDown, GripVertical, User, CheckCircle, Calculator, Sparkles, BrainCircuit, AlertTriangle, Printer, PackagePlus, Phone } from 'lucide-react';
import React, { useState, useRef, useEffect, useMemo } from 'react';
import CreateShipmentModal from '../../components/shipments/CreateShipmentModal';
import CreatePickupModal from '../../components/shipments/CreatePickupModal';
import DeliveryConfirmationModal from '../../components/delivery/DeliveryConfirmationModal';
import ShipmentDetailsModal from '../../components/shipments/ShipmentDetailsModal';

// Error Boundary for debugging
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("DriverDashboard Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-900 min-h-screen">
                    <h1 className="text-2xl font-bold mb-4">Algo salió mal en el Dashboard</h1>
                    <p className="font-mono text-sm bg-white p-4 rounded border border-red-200 overflow-auto">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </p>
                    <button
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
                        onClick={() => window.location.reload()}
                    >
                        Recargar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

function DriverDashboardContent({ onLogout, allShipments, currentDriverId, onAssignShipment, drivers, clients, onCreateShipment, onStatusChange, onUpdateShipment, tariffs, articles }) {
    console.log('DriverDashboard Render', { currentDriverId, drivers: drivers?.length, shipments: allShipments?.length, clients: clients?.length });


    const [activeTab, setActiveTab] = useState('route');
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [deliveryModalShipment, setDeliveryModalShipment] = useState(null); // Which shipment is being confirmed
    const [pickupToConvert, setPickupToConvert] = useState(null); // Pickup being converted to shipment
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    // AI / Smart Features State
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [learningMessage, setLearningMessage] = useState(null);

    // Drag & Drop State
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);

    // Derived State Logic
    const [localRoute, setLocalRoute] = useState([]);
    const [isInitialized, setIsInitialized] = useState(false);

    const [pendingCollections, setPendingCollections] = useState([
        { id: 'COL-001', client: 'Restaurante El Puerto', sender: 'Distribuciones Garcia', amount: '125.50', type: 'Efectivo', date: '21/01/2024' },
        { id: 'COL-002', client: 'Talleres Mecánicos', sender: 'Recambios Central', amount: '450.00', type: 'Contra reembolso', date: '21/01/2024' }
    ]);
    const [collectedCollections, setCollectedCollections] = useState([]);

    // Helper to get legal name and CIF
    const getClientLegalInfo = (clientName) => {
        if (!clients || !clientName) return { name: clientName, cif: '' };
        const clientObj = clients.find(c => (c.name || '').toLowerCase() === clientName.toLowerCase());
        if (clientObj) {
            return {
                name: clientObj.legalName || clientObj.name || clientName,
                cif: clientObj.cif ? ` (CIF: ${clientObj.cif})` : ''
            };
        }
        return { name: clientName, cif: '' };
    };

    // Print Receipt Function
    const handlePrintReceipt = (collection) => {
        const legalInfo = getClientLegalInfo(collection.client);
        const receiptWindow = window.open('', '_blank');
        receiptWindow.document.write(`
            <html>
                <head>
                    <title>Justificante de Entrega de Fondos</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        .title { font-size: 16px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 12px; color: #666; }
                        .details { margin-bottom: 20px; }
                        .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
                        .label { font-weight: bold; }
                        .amount { font-size: 18px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
                        .signature-box { margin-top: 30px; border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; }
                        .footer { margin-top: 20px; font-size: 8px; text-align: center; color: #888; }
                        @media print {
                            body { width: 80mm; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">SUMTRANS LOGISTICA</h1>
                        <p class="subtitle">Justificante de Reembolso</p>
                    </div>
                    
                    <div class="details">
                        <div class="row">
                            <span class="label">Fecha:</span>
                            <span>${new Date().toLocaleString()}</span>
                        </div>
                         <div class="row">
                            <span class="label">ID Recibo:</span>
                            <span>${collection.id}</span>
                        </div>
                        <div class="row">
                            <span class="label">Cliente:</span>
                            <span>${legalInfo.name}${legalInfo.cif}</span>
                        </div>
                        <div class="row">
                            <span class="label">Recibe:</span>
                            <span>${collection.sender || '__________________'}</span>
                        </div>
                         <div class="row">
                            <span class="label">Concepto:</span>
                            <span>${collection.type}</span>
                        </div>
                        
                        <div class="amount">
                            TOTAL: €${collection.amount}
                        </div>
                    </div>

                    <div class="signature-box">
                        Firma y Sello del Cliente (Remitente)
                        <br/><br/><br/>
                    </div>
                    
                    <div class="footer">
                        Este documento justifica la entrega del importe recaudado al remitente.
                    </div>

                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
            </html>
        `);
        receiptWindow.document.close();
    };

    // Print Porte (Shipping Fees) Report - Only cash collections (Cobro Diario / new clients)
    const handlePrintPorte = () => {
        // Use only the collections visible in "Cuenta" tab (cash clients only)
        const cashCollections = [...prepaidCollections, ...deliveredCollections];
        const totalCashPorte = cashCollections.reduce((sum, s) => sum + parseAmount(s.amount), 0);

        const porteRows = cashCollections.map(s => {
            const legalInfo = getClientLegalInfo(s.client);
            return `
            <tr>
                <td>${legalInfo.name}${legalInfo.cif}</td>
                <td>${s.porteType === 'Pagado' ? 'Cobro Origen' : ((s.address || s.destinationAddress || '').split(',')[0] || 'Entrega')}</td>
                <td style="text-align:right">${s.amount}</td>
            </tr>
        `;
        }).join('');

        const porteWindow = window.open('', '_blank');
        porteWindow.document.write(`
                < html >
                <head>
                    <title>Resumen Porte del Día</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
                        .title { font-size: 14px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 10px; color: #666; }
                        .info { font-size: 11px; margin-bottom: 10px; }
                        table { width: 100%; font-size: 10px; border-collapse: collapse; }
                        th { text-align: left; border-bottom: 1px solid #ccc; padding: 4px 0; }
                        td { padding: 4px 0; border-bottom: 1px dashed #eee; }
                        .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 2px solid #333; padding-top: 10px; }
                        .footer { margin-top: 15px; font-size: 8px; text-align: center; color: #888; }
                        @media print { body { width: 80mm; } button { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">SUMTRANS LOGISTICA</h1>
                        <p class="subtitle">Resumen de Porte (Solo Cobro Diario)</p>
                    </div>
                    
                    <div class="info">
                        <strong>Conductor:</strong> ${(() => { const d = (drivers || []).find(d => d.id === currentDriverId); return d ? d.name : 'Conductor'; })()} (DRV-${currentDriverId})<br/>
                        <strong>Fecha:</strong> ${new Date().toLocaleDateString()}
                    </div>

                    <table>
                        <thead>
                            <tr><th>Cliente</th><th>Concepto</th><th>Importe</th></tr>
                        </thead>
                        <tbody>
                            ${porteRows || '<tr><td colspan="3" style="text-align:center">Sin cobros de porte hoy</td></tr>'}
                        </tbody>
                    </table>
                    
                    <div class="total">
                        TOTAL PORTE: €${totalCashPorte.toFixed(2)}
                    </div>
                    
                    <div class="footer">
                        * Solo incluye clientes de cobro diario / contado<br/>
                        Generado: ${new Date().toLocaleString()}
                    </div>

                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
            </html >
        `);
        porteWindow.document.close();
    };


    useEffect(() => {
        if (allShipments && !isInitialized) {
            const assigned = allShipments.filter(s => s.assignedDriverId === currentDriverId && s.status !== 'Entregado' && s.status !== 'Entrega aplazada');
            setLocalRoute(assigned);
            setIsInitialized(true);
        } else if (allShipments) {
            const assigned = allShipments.filter(s => s && s.assignedDriverId === currentDriverId && s.status !== 'Entregado' && s.status !== 'Entrega aplazada');
            if (assigned.length !== localRoute.length) {
                setLocalRoute(assigned);
            }
        }
    }, [allShipments, currentDriverId, isInitialized, localRoute.length]);

    const deliveredShipments = (allShipments || []).filter(s => s && s.assignedDriverId === currentDriverId && s.status === 'Entregado');
    const availableShipments = (allShipments || []).filter(s => s && (s.status === 'Pendiente de asignar' || !s.assignedDriverId));

    // Smart Sort Algorithm (Mock IA)
    const handleSmartSort = () => {
        setIsOptimizing(true);
        setTimeout(() => {
            try {
                if (!localRoute || !Array.isArray(localRoute)) {
                    console.warn("Invalid route data for sorting");
                    return;
                }

                const sorted = [...localRoute].sort((a, b) => {
                    if (!a || !b) return 0;

                    // Robust address getter
                    const getAddress = (item) => {
                        try {
                            const val = item.destinationAddress || item.address || item.originAddress;
                            return (typeof val === 'string') ? val : '';
                        } catch { return ''; }
                    };

                    const addrA = getAddress(a);
                    const addrB = getAddress(b);

                    const cityA = addrA.includes(',') ? addrA.split(',').pop().trim() : addrA;
                    const cityB = addrB.includes(',') ? addrB.split(',').pop().trim() : addrB;

                    if (cityA && cityB && cityA !== cityB) return cityA.localeCompare(cityB);

                    // Robust amount parser
                    const getVal = (v) => {
                        try {
                            if (typeof v === 'number') return v;
                            if (typeof v !== 'string') return 0;
                            return parseFloat(v.replace(/[^0-9.-]+/g, "")) || 0;
                        } catch { return 0; }
                    };

                    return getVal(b.amount) - getVal(a.amount);
                });

                setLocalRoute(sorted);
                setLearningMessage("Ruta optimizada por IA según tráfico y prioridad.");
            } catch (error) {
                console.error("Critical error in smart sort:", error);
                setLearningMessage("Hubo un pequeño error al optimizar, pero sigues operativo.");
            } finally {
                setIsOptimizing(false);
                setTimeout(() => setLearningMessage(null), 3000);
            }
        }, 1500);
    };

    // Drag Handlers
    const handleSort = () => {
        let _route = [...localRoute];
        const draggedItemContent = _route.splice(dragItem.current, 1)[0];
        _route.splice(dragOverItem.current, 0, draggedItemContent);
        dragItem.current = null;
        dragOverItem.current = null;
        setLocalRoute(_route);
        setLearningMessage("Aprendiendo nuevo patrón de entrega...");
        setTimeout(() => setLearningMessage(null), 2000);
    };

    // Calculate Daily Totals
    const parseAmount = (amountStr) => {
        if (!amountStr) return 0;
        if (typeof amountStr === 'number') return amountStr;
        try {
            return parseFloat(amountStr.replace(/[^0-9.-]+/g, "")) || 0;
        } catch { return 0; }
    };

    // Helper: Check if client pays cash (Cobro Diario or New Client)
    const isCashClient = (clientName) => {
        if (!clients) return true; // Fallback to cash if no client list
        const c = clients.find(cl => (cl.name || '').toLowerCase() === (clientName || '').toLowerCase());
        return !c || c.billingType === 'Cobro Diario';
    };

    // 1. Cobros en Origen (Prepaid at creation) - "Cobrado al crear"
    // Filtrar envíos creados hoy, pagados, tipo 'Pagado', y cliente contado
    // 1. Cobros en Origen (Prepaid at creation) - "Cobrado al crear"
    // Filtrar envíos creados hoy, pagados, tipo 'Pagado', y cliente contado
    const prepaidCollections = (allShipments || []).filter(s =>
        s &&
        (s.assignedDriverId === currentDriverId || !s.assignedDriverId) && // Driver created or assigned
        s.porteType === 'Pagado' &&
        s.paymentStatus === 'Paid' &&
        isCashClient(s.client) &&
        s.date === new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) // Matches creation format
    );

    // 2. Cobros en Destino (Collected at delivery) - "Cobrado al entregar"
    const deliveredCollections = deliveredShipments.filter(s =>
        s &&
        s.porteType === 'Debido' &&
        isCashClient(s.destinationName || s.client)
    );

    // Sums
    const totalPrepaid = prepaidCollections.reduce((sum, s) => sum + parseAmount(s.amount), 0);
    const totalDeliveredCash = deliveredCollections.reduce((sum, s) => sum + parseAmount(s.amount), 0);

    // Total Cash in Box - Split collectedCollections by type (Porte vs Reembolso)
    const collectedPorte = collectedCollections.filter(c => c.type === 'Porte' || c.type === 'Efectivo');
    const collectedReembolsos = collectedCollections.filter(c => c.type === 'Reembolso');
    const totalCollectedPorte = collectedPorte.reduce((sum, c) => sum + parseAmount(c.amount), 0);
    const totalReimbursements = collectedReembolsos.reduce((sum, c) => sum + parseAmount(c.amount), 0);

    const totalCash = totalPrepaid + totalDeliveredCash + totalCollectedPorte + totalReimbursements;



    // Safe calculations for Modal Props
    const pendingDebts = useMemo(() => {
        try {
            if (!deliveryModalShipment) return [];

            // 1. Determine who we are interacting with (The Entity)
            let targetName = '';
            if (deliveryModalShipment.type === 'Recogida') {
                targetName = deliveryModalShipment.originName || deliveryModalShipment.client;
            } else {
                targetName = deliveryModalShipment.destinationName || deliveryModalShipment.client;
            }

            if (!targetName) return [];

            // 2. Check if this Entity is 'New' or 'Daily' (Risk)
            const targetClient = (clients || []).find(c => (c.name || '').toLowerCase() === targetName.toLowerCase());
            const isTargetType = !targetClient || targetClient.billingType === 'Cobro Diario';

            if (!isTargetType) return [];

            // 3. Find other shipments for this Entity that are Pending Cobro
            const otherPendingShipments = (allShipments || []).filter(s =>
                s && s.id !== deliveryModalShipment.id && // Exclude current
                (s.status === 'Entrega aplazada' || s.status === 'Pendiente de asignar' || s.paymentStatus === 'Pending') &&
                (
                    (s.destinationName && s.destinationName.toLowerCase() === targetName.toLowerCase()) ||
                    (s.client && s.client.toLowerCase() === targetName.toLowerCase()) ||
                    (s.originName && s.originName.toLowerCase() === targetName.toLowerCase())
                )
            );

            const debtParts = [];
            otherPendingShipments.forEach(s => {
                const isDebido = s.porteType === 'Debido';
                const hasCod = s.hasCod;
                const porteVal = parseAmount(s.amount);
                const codVal = hasCod ? parseAmount(s.codAmount) : 0;

                if (isDebido && porteVal > 0 && !s.portePaid) {
                    debtParts.push({
                        id: `${s.id} -porte`,
                        shipmentId: s.id,
                        type: 'Porte',
                        amount: porteVal.toFixed(2),
                        label: `Porte: ${s.id} `,
                        detail: s.originName || s.client || 'N/A'
                    });
                }
                if (hasCod && codVal > 0 && !s.codPaid) {
                    debtParts.push({
                        id: `${s.id} -reembolso`,
                        shipmentId: s.id,
                        type: 'Reembolso',
                        amount: codVal.toFixed(2),
                        label: `Reembolso: ${s.id} `,
                        detail: s.originName || s.client || 'N/A'
                    });
                }
                if (!isDebido && !hasCod && porteVal > 0) {
                    debtParts.push({
                        id: `${s.id} -total`,
                        shipmentId: s.id,
                        type: 'Cobro',
                        amount: porteVal.toFixed(2),
                        label: `Pendiente: ${s.id} `,
                        detail: s.originName || s.client || 'N/A'
                    });
                }
            });

            return debtParts;
        } catch { console.error('Debts Logic Error'); return []; }
    }, [deliveryModalShipment, clients, allShipments]);

    const collectionAlert = useMemo(() => {
        try {
            if (!deliveryModalShipment) return false;

            // Determine client type
            let targetName = '';
            if (deliveryModalShipment.type === 'Recogida') {
                targetName = deliveryModalShipment.originName || deliveryModalShipment.client;
            } else {
                targetName = deliveryModalShipment.destinationName || deliveryModalShipment.client;
            }
            const targetClient = (clients || []).find(c => (c.name || '').toLowerCase() === (targetName || '').toLowerCase());
            const isTargetType = !targetClient || targetClient.billingType === 'Cobro Diario';

            if (!isTargetType) return false;

            // Trigger alarm if there are other pending debts
            if (pendingDebts.length > 0) return true;

            // Trigger alarm if current shipment is Debido or has COD
            if (deliveryModalShipment.porteType === 'Debido' || deliveryModalShipment.hasCod) return true;

            return false;
        } catch (e) { console.error('Alert Logic Error', e); return false; }
    }, [deliveryModalShipment, clients, pendingDebts]);

    // Helper to Add to Collections
    const handleDeliveryConfirm = (id, proof, status, selectedDebtIds) => {
        if (!onStatusChange) {
            console.error("onStatusChange is not defined!");
            return;
        }

        // Helper to process a specific part of a shipment
        const processCollectionPart = (shipmentId, partType, amount) => {
            const ship = (allShipments || []).find(s => s.id === shipmentId);
            if (!ship) return;

            const isPorte = partType === 'porte';
            const label = isPorte ? 'Porte' : 'Reembolso';

            // Register collection
            const newCol = {
                id: `COL - ${Date.now()} -${shipmentId} -${partType} `,
                client: ship.destinationName || ship.client || 'Cliente',
                sender: ship.senderName || ship.originName || 'N/A',
                amount: parseAmount(amount).toFixed(2),
                type: label,
                date: new Date().toLocaleDateString()
            };
            setCollectedCollections(prev => [...prev, newCol]);

            // Update shipment flags
            const updates = isPorte ? { portePaid: true } : { codPaid: true };
            onUpdateShipment(shipmentId, updates);

            // Check if fully paid now
            const updatedShip = { ...ship, ...updates };
            const isFullyPaid = (!updatedShip.hasCod || updatedShip.codPaid) &&
                (updatedShip.porteType !== 'Debido' || updatedShip.portePaid);

            if (isFullyPaid) {
                onStatusChange(shipmentId, 'Entregado');
            }
        };

        // 1. Process current shipment based on selection
        const currentId = id;
        const currentShip = deliveryModalShipment;
        console.log("Current shipment details:", currentShip);

        const currentPorteSelected = (selectedDebtIds || []).includes(`${currentId} -porte`);
        const currentCodSelected = (selectedDebtIds || []).includes(`${currentId} -reembolso`);

        if (status === 'Entregado') {
            onStatusChange(currentId, 'Entregado', proof?.coordinates || null);

            if (currentPorteSelected) processCollectionPart(currentId, 'porte', currentShip.amount);
            if (currentCodSelected) processCollectionPart(currentId, 'reembolso', currentShip.codAmount);

            // If neither was selected but it was Entregado, check if it's already paid or free
            if (!currentPorteSelected && !currentCodSelected) {
                // Generic collection if needed (not Debido/COD)
                if (currentShip.porteType !== 'Debido' && !currentShip.hasCod && parseAmount(currentShip.amount) > 0) {
                    // Fallback
                    const genericCol = {
                        id: `COL - ${Date.now()} -${currentId} `,
                        client: currentShip.client || 'Cliente',
                        sender: currentShip.senderName || currentShip.originName || 'N/A',
                        amount: currentShip.amount,
                        type: 'Efectivo',
                        date: new Date().toLocaleDateString()
                    };
                    setCollectedCollections(prev => [...prev, genericCol]);
                }
            }
        } else if (status === 'Entrega aplazada' || status === 'Pendiente Cobro') {
            onStatusChange(currentId, 'Entrega aplazada', proof?.coordinates || null);
            // Even if status is Entrega aplazada, we might have selected some parts to pay now
            if (currentPorteSelected) processCollectionPart(currentId, 'porte', currentShip.amount);
            if (currentCodSelected) processCollectionPart(currentId, 'reembolso', currentShip.codAmount);
            setActiveTab('collections');
        }

        // 2. Process other selected debts
        if (selectedDebtIds && selectedDebtIds.length > 0) {
            selectedDebtIds.forEach(fullId => {
                if (fullId.startsWith(currentId)) return; // Already handled above

                const [shipId, partType] = fullId.split('-');
                const ship = (allShipments || []).find(s => s.id === shipId);
                if (ship) {
                    const amount = partType === 'porte' ? ship.amount : ship.codAmount;
                    processCollectionPart(shipId, partType, amount);
                }
            });
        }

        // Close the modal after processing
        setDeliveryModalShipment(null);
    };

    if (!drivers || !allShipments || !clients) {
        return <div className="flex h-screen items-center justify-center text-slate-400">Cargando dashboard...</div>;
    }

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col">
            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                shipment={selectedShipment}
                onUpdate={onUpdateShipment}
            />
            {/* Header */}
            <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-md">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="font-bold text-lg">Hola, {drivers?.find(d => d.id === currentDriverId)?.name || 'Conductor'}</h1>
                        <p className="text-xs text-slate-400">Repartidor - ID: DRV-{currentDriverId}</p>
                    </div>
                    <button onClick={onLogout} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                        <LogOut size={20} />
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="overflow-x-auto pb-2">
                    <nav className="flex bg-slate-800 p-1 rounded-xl gap-1 min-w-[320px] overflow-x-auto scrolbar-hide">
                        <button onClick={() => setActiveTab('route')} className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'route' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Reparto</button>
                        <button onClick={() => setActiveTab('assign')} className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'assign' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Asignar</button>
                        <button onClick={() => setActiveTab('delivered')} className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'delivered' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Entregados</button>
                        <button onClick={() => setActiveTab('collections')} className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'collections' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Cobros</button>
                        <button onClick={() => setActiveTab('account')} className={`flex-1 py-2 px-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Cuenta</button>
                    </nav>
                </div>
            </header>

            <main className="flex-1 p-4 max-w-lg mx-auto w-full pb-24 relative">

                {/* AI Notification Toast */}
                {learningMessage && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top-4 z-50 flex items-center gap-2">
                        <BrainCircuit size={14} className="text-purple-400" />
                        {learningMessage}
                    </div>
                )}

                {/* View: Mi Ruta (Active Shipments) */}
                {activeTab === 'route' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center px-1">
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Pendientes</h3>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{localRoute.length} Envíos</span>
                            </div>
                            <button
                                onClick={handleSmartSort}
                                disabled={isOptimizing}
                                className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm
                                    ${isOptimizing ? 'bg-purple-100 text-purple-400' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-500/30'}`}
                            >
                                {isOptimizing ? (
                                    <>Calculando...</>
                                ) : (
                                    <>
                                        <Sparkles size={14} />
                                        Optimizar Ruta (v3)
                                    </>
                                )}
                            </button>
                        </div>

                        <div className="space-y-3">
                            {localRoute.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <p>¡Todo entregado! No tienes envíos pendientes.</p>
                                    <button onClick={() => setActiveTab('assign')} className="text-blue-500 underline mt-2 text-sm">Buscar más envíos</button>
                                </div>
                            ) : localRoute.filter(Boolean).map((stop, index) => (
                                <div
                                    key={stop.id || index}
                                    draggable
                                    onDragStart={(e) => {
                                        dragItem.current = index;
                                        e.currentTarget.classList.add('opacity-50');
                                    }}
                                    onDragEnter={() => {
                                        dragOverItem.current = index;
                                    }}
                                    onDragEnd={(e) => {
                                        handleSort();
                                        e.currentTarget.classList.remove('opacity-50');
                                    }}
                                    onDragOver={(e) => e.preventDefault()}
                                    onClick={(e) => {
                                        // Prevent modal opening if clicking buttons/inputs
                                        if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                                            setSelectedShipment(stop);
                                            setIsDetailsModalOpen(true);
                                        }
                                    }}
                                    className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 relative overflow-hidden cursor-pointer hover:border-purple-300 transition-all active:scale-[0.98] active:shadow-md"
                                >
                                    <div
                                        className="absolute left-0 top-0 bottom-0 w-1"
                                        style={{
                                            backgroundColor: (() => {
                                                if (stop.color) return stop.color;
                                                if (!clients) return '#3b82f6';
                                                const client = clients.find(c => c && c.name === (stop.destinationName || stop.client));
                                                return client?.color || '#3b82f6'; // Fallback blue
                                            })()
                                        }}
                                    ></div>
                                    <div className="flex gap-3">
                                        <div
                                            className="flex flex-col items-center justify-center text-slate-300 cursor-move active:cursor-grabbing px-1"
                                            onMouseDown={(e) => e.stopPropagation()} // Prevent click when starting drag
                                        >
                                            <GripVertical size={20} />
                                        </div>
                                        <div className="flex-1">
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className="text-xs font-bold text-blue-600 mb-1 block">PARADA #{index + 1}</span>
                                                    <h4 className="font-bold text-slate-800">{stop.destinationName || stop.client}</h4>
                                                </div>
                                                <div className="flex flex-col items-end gap-1">
                                                    <span className="text-xs bg-amber-50 text-amber-600 px-2 py-1 rounded-full font-medium border border-amber-100">
                                                        {stop.status}
                                                    </span>
                                                    {stop.type === 'Recogida' ? (
                                                        <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                                                            RECOGIDA
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                                                            ENTREGA
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="space-y-1 mb-3">
                                                <p className="text-sm text-slate-600 flex items-start gap-2">
                                                    <Map size={16} className="shrink-0 mt-0.5 text-slate-400" />
                                                    <span className="line-clamp-2">{stop.destinationAddress || stop.address}</span>
                                                </p>
                                                {stop.destinationCity && (
                                                    <p className="text-xs text-slate-500 pl-6 mb-1">
                                                        {stop.destinationCity} {stop.destinationZip && `(${stop.destinationZip})`}
                                                    </p>
                                                )}
                                                {stop.destinationPhone && (
                                                    <a
                                                        href={`tel:${stop.destinationPhone}`}
                                                        className="inline-flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline pl-6 py-1"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <Phone size={14} />
                                                        {stop.destinationPhone}
                                                    </a>
                                                )}
                                                <div className="flex items-center gap-2 pl-6 pt-1">
                                                    <Euro size={14} className="text-slate-400" />
                                                    <span className="text-sm font-medium text-slate-700">{stop.amount}</span>
                                                </div>
                                            </div>

                                            <div className="flex gap-2">
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        const reason = prompt("Describe la incidencia:");
                                                        if (reason) onStatusChange(stop.id, 'Incidencia');
                                                    }}
                                                    className="w-1/3 bg-red-100 text-red-700 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-red-200 transition-colors flex items-center justify-center gap-1 border border-red-200"
                                                >
                                                    <AlertTriangle size={16} />
                                                    Incidencia
                                                </button>
                                                {stop.type === 'Recogida' ? (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPickupToConvert(stop);
                                                            setIsNoteModalOpen(true);
                                                        }}
                                                        className="flex-1 bg-purple-600 text-white py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-purple-700 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <PackagePlus size={16} />
                                                        Realizar Recogida
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setDeliveryModalShipment(stop);
                                                        }}
                                                        className="flex-1 bg-green-600 text-white py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                                                    >
                                                        <CheckCircle size={16} />
                                                        Confirmar Entrega
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* View: Asignar */}
                {activeTab === 'assign' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Disponibles en Zona</h3>
                        {availableShipments.map((shipment) => (
                            <div key={shipment.id} className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <div className="flex justify-between items-start mb-2">
                                    <div>
                                        {shipment.type === 'Recogida' ? (
                                            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 block w-fit mb-1">
                                                RECOGIDA
                                            </span>
                                        ) : (
                                            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 block w-fit mb-1">
                                                ALBARÃN
                                            </span>
                                        )}
                                        <h4 className="font-bold text-slate-800">
                                            {shipment.type === 'Recogida' ? shipment.client : (shipment.destinationName || shipment.client)}
                                        </h4>
                                    </div>
                                    <span className="text-xs font-mono text-slate-400">{shipment.id}</span>
                                </div>
                                <p className="text-sm text-slate-600 mb-3 flex items-start gap-2">
                                    <Map size={16} className="shrink-0 mt-0.5 text-slate-400" />
                                    {shipment.type === 'Recogida' ? shipment.originAddress : (shipment.destinationAddress || shipment.address)}
                                </p>
                                <div className="flex items-center justify-between pt-3 border-t border-slate-50">
                                    <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                        <Package size={14} />
                                        {shipment.amount}
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <User size={16} className="text-slate-400" />
                                        <select
                                            className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:border-blue-500 max-w-[150px]"
                                            onChange={(e) => {
                                                if (e.target.value) onAssignShipment(shipment.id, e.target.value)
                                            }}
                                            value=""
                                        >
                                            <option value="">Asignar a...</option>
                                            <option value={currentDriverId}>A Mí</option>
                                            {drivers && drivers.filter(d => d.id !== currentDriverId).map(d => (
                                                <option key={d.id} value={d.id}>{d.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                        {availableShipments.length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-8">No hay envíos disponibles para asignar.</p>
                        )}
                    </div>
                )}

                {/* View: Entregados */}
                {activeTab === 'delivered' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center px-1 mb-2">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Historial Entregas</h3>
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">{deliveredShipments.length} Total</span>
                        </div>
                        {deliveredShipments.length === 0 ? (
                            <p className="text-center text-slate-400 text-sm py-8">Aún no has entregado nada hoy.</p>
                        ) : deliveredShipments.map((shipment) => (
                            <div key={shipment.id} className="bg-slate-50 p-4 rounded-xl border border-slate-200 opacity-75">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-slate-700">{shipment.client}</h4>
                                    <span className="text-xs bg-green-200 text-green-800 px-2 py-0.5 rounded-full font-bold">Entregado</span>
                                </div>
                                <p className="text-xs text-slate-500 mb-2">{shipment.address}</p>
                                <div className="text-right font-mono text-sm text-slate-600">
                                    {shipment.amount}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* View: Cobros */}
                {activeTab === 'collections' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Pendientes Cobros y Reembolsos</h3>
                        {(() => {
                            const pendingShipments = (allShipments || []).filter(s =>
                                s &&
                                s.assignedDriverId === currentDriverId &&
                                (s.status === 'Pendiente Cobro' || s.paymentStatus === 'Pending')
                            );

                            // Build separate debt items from pending shipments
                            const debtItems = [];
                            pendingShipments.forEach(shipment => {
                                const isDebido = shipment.porteType === 'Debido';
                                const hasCod = shipment.hasCod;
                                const serviceVal = isDebido ? parseAmount(shipment.amount) : 0;
                                const codVal = hasCod ? parseAmount(shipment.codAmount) : 0;

                                // Porte card (only if Debido and not yet paid)
                                if (isDebido && serviceVal > 0 && !shipment.portePaid) {
                                    debtItems.push({
                                        key: `${shipment.id}-porte`,
                                        shipment,
                                        type: 'porte',
                                        label: 'Porte Debido',
                                        amount: serviceVal,
                                        payerName: shipment.destinationName || 'Destinatario',
                                        colorClass: 'border-l-yellow-400',
                                        badgeClass: 'text-yellow-600 bg-yellow-50',
                                    });
                                }

                                // Reembolso card (only if hasCod and not yet paid)
                                if (hasCod && codVal > 0 && !shipment.codPaid) {
                                    debtItems.push({
                                        key: `${shipment.id}-reembolso`,
                                        shipment,
                                        type: 'reembolso',
                                        label: 'Reembolso (Contrareembolso)',
                                        amount: codVal,
                                        payerName: shipment.destinationName || 'Destinatario',
                                        colorClass: 'border-l-red-500',
                                        badgeClass: 'text-red-600 bg-red-50',
                                    });
                                }

                                // If not Debido and no COD, but still pending (e.g. porte pagado deferred)
                                if (!isDebido && !hasCod) {
                                    const totalVal = parseAmount(shipment.amount);
                                    if (totalVal > 0) {
                                        debtItems.push({
                                            key: `${shipment.id}-porte`,
                                            shipment,
                                            type: 'porte',
                                            label: 'Porte Pagado (Pendiente)',
                                            amount: totalVal,
                                            payerName: shipment.client || 'Remitente',
                                            colorClass: 'border-l-yellow-400',
                                            badgeClass: 'text-yellow-600 bg-yellow-50',
                                        });
                                    }
                                }
                            });

                            const totalPendingValue = debtItems.reduce((sum, item) => sum + item.amount, 0) +
                                pendingCollections.reduce((sum, c) => sum + parseAmount(c.amount), 0);

                            const remitenteDebts = debtItems.filter(item => item.label.includes('Pagado'));
                            const destinatarioDebts = debtItems.filter(item => item.label.includes('Debido'));
                            const reembolsoDebts = debtItems.filter(item => item.type === 'reembolso');

                            const renderDebtCard = (item) => {
                                const { shipment } = item;
                                return (
                                    <div key={item.key} className={`bg-white p-4 rounded-xl shadow-sm border border-l-4 ${item.colorClass} border-slate-100`}>
                                        <div className="flex justify-between items-start mb-2">
                                            <div>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 inline-block ${item.badgeClass}`}>
                                                    {item.label}
                                                </span>
                                                <h4 className="font-bold text-slate-800">{item.payerName}</h4>
                                                {(item.payerName !== shipment.client) && (
                                                    <p className="text-[10px] text-slate-400">Cliente origen: {shipment.client}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="font-mono font-bold text-slate-700 block">{item.amount.toFixed(2)} €</span>
                                                <span className="text-[10px] text-slate-400 block">
                                                    {item.type === 'porte' ? '(Servicio de Transporte)' : item.type === 'reembolso' ? '(Contra Reembolso)' : ''}
                                                </span>
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                                            <Clock size={12} />
                                            {shipment.paymentStatus === 'Pending' ? 'Deuda Activa' : `Entregado: ${new Date(shipment.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                        </p>
                                        <button
                                            onClick={() => {
                                                // Mark only this specific part as paid
                                                if (item.type === 'porte') {
                                                    // Check if everything is now paid (no COD or COD already paid)
                                                    const isFullyPaid = !shipment.hasCod || shipment.codPaid;

                                                    // Mark porte as paid (and paymentStatus if fully collected)
                                                    onUpdateShipment(shipment.id, {
                                                        portePaid: true,
                                                        ...(isFullyPaid && { paymentStatus: 'Paid' })
                                                    });

                                                    // Register porte collection
                                                    const newCollection = {
                                                        id: `COL-${Date.now()}-${shipment.id}-porte`,
                                                        client: item.payerName,
                                                        sender: shipment.senderName || shipment.originName || 'N/A',
                                                        amount: item.amount.toFixed(2),
                                                        type: 'Porte',
                                                        date: new Date().toLocaleDateString()
                                                    };
                                                    setCollectedCollections(prev => [...prev, newCollection]);

                                                    if (isFullyPaid) {
                                                        onStatusChange(shipment.id, 'Entregado');
                                                    }
                                                } else if (item.type === 'reembolso') {
                                                    // Check if everything is now paid (no porte due or porte already paid)
                                                    const isDebido = shipment.porteType === 'Debido';
                                                    const isFullyPaid = !isDebido || shipment.portePaid;

                                                    // Mark COD as paid (and paymentStatus if fully collected)
                                                    onUpdateShipment(shipment.id, {
                                                        codPaid: true,
                                                        ...(isFullyPaid && { paymentStatus: 'Paid' })
                                                    });

                                                    // Register reembolso collection
                                                    const newCollection = {
                                                        id: `COL - ${Date.now()} -${shipment.id} -reembolso`,
                                                        client: item.payerName,
                                                        sender: shipment.senderName || shipment.originName || 'N/A',
                                                        amount: item.amount.toFixed(2),
                                                        type: 'Reembolso',
                                                        date: new Date().toLocaleDateString()
                                                    };
                                                    setCollectedCollections(prev => [...prev, newCollection]);

                                                    if (isFullyPaid) {
                                                        onStatusChange(shipment.id, 'Entregado');
                                                    }
                                                }
                                            }}
                                            className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                                        >
                                            Marcar Cobrado
                                        </button>
                                    </div>
                                );
                            };

                            return (
                                <>
                                    <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-4">
                                        <p className="text-indigo-200 text-sm font-medium mb-1">Total a Recaudar</p>
                                        <h2 className="text-3xl font-bold">{totalPendingValue.toFixed(2)} €</h2>
                                    </div>
                                    <div className="space-y-6">
                                        {remitenteDebts.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                    Cobros a Remitentes (Porte)
                                                </h4>
                                                <div className="space-y-3">
                                                    {remitenteDebts.map(renderDebtCard)}
                                                </div>
                                            </div>
                                        )}

                                        {destinatarioDebts.length > 0 && (
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                                    Cobros a Destinatarios (Porte)
                                                </h4>
                                                <div className="space-y-3">
                                                    {destinatarioDebts.map(renderDebtCard)}
                                                </div>
                                            </div>
                                        )}

                                        {(reembolsoDebts.length > 0 || pendingCollections.length > 0) && (
                                            <div>
                                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                    Reembolsos (Destinatarios)
                                                </h4>
                                                <div className="space-y-3">
                                                    {reembolsoDebts.map(renderDebtCard)}
                                                    {pendingCollections.map(collection => (
                                                        <div key={collection.id} className="bg-white p-4 rounded-xl shadow-sm border border-l-4 border-l-indigo-500 border-slate-100">
                                                            <div className="flex justify-between items-start mb-2">
                                                                <div>
                                                                    <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full mb-1 inline-block">Reembolso</span>
                                                                    <h4 className="font-bold text-slate-800">{collection.client}</h4>
                                                                </div>
                                                                <span className="font-mono font-bold text-slate-700">€{collection.amount}</span>
                                                            </div>
                                                            <p className="text-xs text-slate-500 mb-2">{collection.type} - {collection.date}</p>
                                                            <button
                                                                onClick={() => {
                                                                    setPendingCollections(prev => prev.filter(c => c.id !== collection.id));
                                                                    setCollectedCollections(prev => [...prev, collection]);
                                                                }}
                                                                className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                                                            >
                                                                Marcar Cobrado
                                                            </button>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {debtItems.length === 0 && pendingCollections.length === 0 && (
                                            <div className="text-center py-8 text-slate-400">
                                                <CheckCircle className="mx-auto mb-2 text-slate-300" size={32} />
                                                <p>No tienes cobros pendientes.</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* View: Cuenta */}
                {activeTab === 'account' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Cierre de Caja Diario</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <div className="text-slate-400 mb-1"><Euro size={20} /></div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Reembolsos</p>
                                <h4 className="text-xl font-bold text-slate-800">
                                    €{totalReimbursements.toFixed(2)}
                                </h4>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                <div className="text-slate-400 mb-1"><Truck size={20} /></div>
                                <p className="text-xs text-slate-500 uppercase font-bold">Porte (Caja)</p>
                                <h4 className="text-xl font-bold text-slate-800">€{(totalPrepaid + totalDeliveredCash + totalCollectedPorte).toFixed(2)}</h4>
                            </div>
                        </div>
                        <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg mt-2">
                            <div className="flex items-center justify-between mb-4">
                                <div>
                                    <p className="text-slate-400 text-sm font-medium">Total Recaudado Hoy</p>
                                    <h2 className="text-3xl font-bold">
                                        €{totalCash.toFixed(2)}
                                    </h2>
                                </div>
                                <div className="p-3 bg-slate-800 rounded-full">
                                    <Wallet size={24} className="text-emerald-400" />
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4 mt-6">
                            {/* Combined Section: Cobros de Porte (Origen + Entrega) */}
                            {(() => {
                                const combinedCollections = [...prepaidCollections, ...deliveredCollections];
                                const allPorte = [...combinedCollections.map((s, idx) => ({
                                    key: `${s.id} -${idx} `,
                                    client: s.client,
                                    detail: s.porteType === 'Pagado' ? `Pagado al Crear - ${s.id}` : (s.address ? `${s.address.split(',')[0]}...` : s.id),
                                    amount: s.amount,
                                    colorClass: s.porteType === 'Pagado' ? 'text-blue-600' : 'text-emerald-600',
                                    source: 'shipment'
                                })), ...collectedPorte.map(c => ({
                                    key: c.id,
                                    client: c.client,
                                    detail: `Cobrado en Cobros - ${c.id} `,
                                    amount: `€${c.amount}`,
                                    colorClass: 'text-amber-600',
                                    source: 'collected'
                                }))];

                                if (allPorte.length === 0) return null;

                                return (
                                    <div>
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                            Cobros de Porte (Origen, Entrega y Cobros)
                                            <button onClick={handlePrintPorte} className="ml-auto p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors" title="Imprimir Resumen Porte">
                                                <Printer size={14} />
                                            </button>
                                        </h4>
                                        <div className="bg-white rounded-xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                                            {allPorte.map(item => (
                                                <div key={item.key} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                        <p className="text-[10px] text-slate-400">{item.detail}</p>
                                                    </div>
                                                    <span className={`font-mono text-sm font-bold ${item.colorClass}`}>
                                                        {item.amount}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })()}

                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                    Detalle Reembolsos
                                </h4>
                                <div className="bg-white rounded-xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                                    {collectedReembolsos.length === 0 && (
                                        <p className="p-4 text-xs text-slate-400 text-center">No hay reembolsos cobrados.</p>
                                    )}
                                    {collectedReembolsos.map(item => (
                                        <div key={item.id} className="p-3 flex justify-between items-center hover:bg-slate-50">
                                            <div>
                                                <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                <p className="text-[10px] text-slate-400">{item.type} - {item.id}</p>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-sm font-bold text-indigo-600">€{item.amount}</span>
                                                <button onClick={() => handlePrintReceipt(item)} className="p-1.5 bg-slate-100 text-slate-600 rounded-lg hover:bg-blue-50 hover:text-blue-600 transition-colors" title="Imprimir Justificante">
                                                    <Printer size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {/* Floating Action Button (Speed Dial) */}
            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3">
                {showFabMenu && (
                    <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-5 fade-in duration-200">
                        <button
                            onClick={() => {
                                setIsPickupModalOpen(true);
                                setShowFabMenu(false);
                            }}
                            className="flex items-center gap-3 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 transition-all font-bold text-sm"
                        >
                            <span className="whitespace-nowrap">Nueva Recogida</span>
                            <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <Package size={20} />
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                setIsNoteModalOpen(true);
                                setShowFabMenu(false);
                            }}
                            className="flex items-center gap-3 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 transition-all font-bold text-sm"
                        >
                            <span className="whitespace-nowrap">Nueva Entrega</span>
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <FileText size={20} />
                            </div>
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setShowFabMenu(!showFabMenu)}
                    className={`w-14 h-14 ${showFabMenu ? 'bg-slate-800 rotate-45' : 'bg-blue-600'} text-white rounded-full shadow-xl shadow-blue-600/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300`}
                    aria-label="Crear Nuevo"
                >
                    <Plus size={28} />
                </button>
            </div>

            <CreateShipmentModal
                isOpen={isNoteModalOpen}
                onClose={() => {
                    setIsNoteModalOpen(false);
                    setPickupToConvert(null);
                }}
                onSave={(data) => {
                    onCreateShipment(data, pickupToConvert ? pickupToConvert.id : null);
                    setPickupToConvert(null);
                }}
                drivers={drivers}
                clients={clients}
                prefillData={pickupToConvert}
                tariffs={tariffs}
                articles={articles}
            />

            <CreatePickupModal
                isOpen={isPickupModalOpen}
                onClose={() => setIsPickupModalOpen(false)}
                onSave={onCreateShipment}
                clients={clients}
            />

            <DeliveryConfirmationModal
                isOpen={!!deliveryModalShipment}
                onClose={() => setDeliveryModalShipment(null)}
                shipment={deliveryModalShipment}
                collectionAlert={collectionAlert}
                pendingDebts={pendingDebts}
                onConfirm={handleDeliveryConfirm}
            />
        </div>
    );
}

export default function DriverDashboard(props) {
    return (
        <ErrorBoundary>
            <DriverDashboardContent {...props} />
        </ErrorBoundary>
    );
}
