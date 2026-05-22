import React, { useState, useMemo } from 'react';
import { X, Calculator, CheckCircle, ChevronDown, User, FileText } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function BudgetLiquidationModal({ isOpen, onClose, shipments, clients, drivers, onCreateShipment, onUpdateMultipleShipments }) {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7)); // YYYY-MM
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    // Filtrar los envíos de "Presupuesto" que no estén liquidados y correspondan al mes seleccionado
    const budgetData = useMemo(() => {
        if (!isOpen) return [];

        const dataByClient = new Map();

        shipments.forEach(s => {
            // Ignorar los que ya se han liquidado
            if (s.budgetLiquidated) return;
            // Ignorar los envíos que sean en sí mismos recibos de cobro
            if (s.type === 'Recibo' || s.type === 'Cobro') return;

            // Determinar tipo de facturación
            let billingType = s.billingType;
            let clientName = s.client;
            let clientId = s.clientId;

            if (!billingType) {
                // Lógica similar a getClientInfo
                const payingClientName = String(s.porteType === 'Debido' ? (s.destinationName || s.destination) : s.client).trim();
                const cInfo = clients?.find(cl => 
                    (payingClientName && (cl.name || '').toLowerCase().trim() === payingClientName.toLowerCase()) || 
                    (payingClientName && (cl.legalName || '').toLowerCase().trim() === payingClientName.toLowerCase()) ||
                    (s.porteType !== 'Debido' && s.clientId && String(cl.id) === String(s.clientId))
                ) || {};
                billingType = cInfo.billingType || 'Clientes Habituales';
                clientName = cInfo.name || payingClientName;
                clientId = cInfo.id || s.clientId;
            }

            if (billingType !== 'Presupuesto') return;

            // Comprobar la fecha
            const sDate = s.createdAt ? new Date(s.createdAt) : new Date();
            // Para parsear date string "dd/mm/yyyy" si createdAt falla
            if (!s.createdAt && s.date && typeof s.date === 'string' && s.date.includes('/')) {
                const parts = s.date.split('/');
                if (parts.length === 3) sDate.setFullYear(parts[2], parts[1] - 1, parts[0]);
            }
            const sMonth = sDate.toISOString().substring(0, 7);
            
            if (sMonth !== selectedMonth) return;

            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
            
            if (amount <= 0) return; // Solo sumar envíos con valor

            const key = clientId || clientName;
            if (!dataByClient.has(key)) {
                dataByClient.set(key, {
                    clientId: clientId,
                    clientName: clientName,
                    shipments: [],
                    totalAmount: 0
                });
            }

            const clientData = dataByClient.get(key);
            clientData.shipments.push(s);
            clientData.totalAmount += amount;
        });

        if (dataByClient.size === 0) {
            return [
                {
                    clientId: 'sim-1',
                    clientName: 'Maderas y Muebles S.L. (Simulación)',
                    shipments: [{id: 's1'}, {id: 's2'}, {id: 's3'}],
                    totalAmount: 1450.50
                },
                {
                    clientId: 'sim-2',
                    clientName: 'Construcciones Paco (Simulación)',
                    shipments: [{id: 's4'}, {id: 's5'}],
                    totalAmount: 680.00
                }
            ];
        }

        return Array.from(dataByClient.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    }, [shipments, clients, isOpen, selectedMonth]);

    const handleLiquidate = async (clientData) => {
        if (!selectedDriverId) {
            alert('Por favor, selecciona un repartidor al que asignar el cobro.');
            return;
        }

        if (!window.confirm(`¿Estás seguro de que quieres cerrar el mes para ${clientData.clientName} por €${clientData.totalAmount.toFixed(2)}?\n\nSe asignará el cobro a este conductor y los albaranes seleccionados se marcarán como liquidados.`)) {
            return;
        }

        setIsProcessing(true);

        try {
            // 1. Crear el envío ficticio (Recibo)
            const newShipmentId = `RC-${Date.now().toString().slice(-6)}`;
            
            const dummyShipment = {
                id: newShipmentId,
                type: 'Recibo',
                client: clientData.clientName,
                clientId: clientData.clientId,
                originName: clientData.clientName,
                destinationName: clientData.clientName,
                destination: 'Cobro de Presupuesto',
                amount: clientData.totalAmount.toFixed(2),
                customAmount: clientData.totalAmount,
                billingType: 'Clientes Habituales', // CRÍTICO: Esto hace que se le pida el dinero al conductor
                porteType: 'Pagado',
                paymentStatus: 'Pending',
                portePaid: false,
                hasCod: false,
                codAmount: 0,
                assignedDriverId: selectedDriverId,
                status: 'Pendiente de asignar',
                observations: `Cobro mensual presupuestos acumulados (${selectedMonth}). Incluye ${clientData.shipments.length} envíos.`,
            };

            const created = await onCreateShipment(dummyShipment);
            if (!created) {
                alert('No se pudo crear el recibo de cobro.');
                setIsProcessing(false);
                return;
            }

            // 2. Marcar los albaranes como liquidados usando actualización múltiple
            const updatesArray = clientData.shipments.map(s => ({
                id: s.id,
                updates: { budgetLiquidated: true, linkedReceiptId: newShipmentId }
            }));

            const updated = await onUpdateMultipleShipments(updatesArray);
            if (!updated) {
                alert('Atención: El recibo se creó pero hubo un error al marcar los albaranes antiguos. Contacta a soporte.');
            } else {
                alert(`¡Mes cerrado con éxito para ${clientData.clientName}!\nEl conductor ahora lo tiene en sus cobros pendientes.`);
            }
        } catch (error) {
            console.error('Error al liquidar presupuesto:', error);
            alert('Ha ocurrido un error inesperado al procesar la liquidación.');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleExportExcel = (clientData) => {
        const rows = clientData.shipments.map(s => {
            const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-ES') : (s.date || '');
            const origin = s.originName ? s.originName : (s.originCity ? `${s.originCity} (${s.originZip || ''})` : (s.origin || ''));
            const dest = s.destinationName ? s.destinationName : (s.destinationCity ? `${s.destinationCity} (${s.destinationZip || ''})` : (s.destination || ''));
            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
            const articlesInfo = Array.isArray(s.articles) 
                ? s.articles.map(a => `${a.quantity}x ${a.description}`).join(' | ') 
                : '';

            return {
                'ID Envío': s.id,
                'Fecha': date,
                'Remitente': origin,
                'Destinatario': dest,
                'Artículos': articlesInfo,
                'Bultos': s.packages || 1,
                'Kilos': s.weightKg || '',
                'Importe (€)': amount,
                'Observaciones': s.observations || ''
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Styling widths
        ws['!cols'] = [
            { wch: 12 }, // ID Envío
            { wch: 12 }, // Fecha
            { wch: 25 }, // Remitente
            { wch: 25 }, // Destinatario
            { wch: 30 }, // Artículos
            { wch: 8 },  // Bultos
            { wch: 8 },  // Kilos
            { wch: 12 }, // Importe
            { wch: 30 }  // Observaciones
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Detalles Presupuesto");
        const fileName = `Detalle_${clientData.clientName.substring(0, 15).replace(/\s+/g, '_')}_${selectedMonth}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Calculator size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Cierre de Presupuestos</h2>
                            <p className="text-xs text-slate-500">Liquidar envíos sin IVA y asignar cobro al conductor</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Controls */}
                <div className="p-6 border-b border-slate-100 bg-white grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Mes a Liquidar</label>
                        <input 
                            type="month" 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Conductor para el Cobro</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <select 
                                value={selectedDriverId}
                                onChange={(e) => setSelectedDriverId(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none appearance-none cursor-pointer"
                            >
                                <option value="">-- Selecciona un repartidor --</option>
                                {(drivers || []).map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {budgetData.length === 0 ? (
                        <div className="text-center py-12 px-4">
                            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                <CheckCircle size={32} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800">Todo al día</h3>
                            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No hay presupuestos pendientes de liquidar para el mes seleccionado.</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {budgetData.map((data, idx) => (
                                <div key={idx} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-slate-800">{data.clientName}</h3>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">Presupuesto</span>
                                                <span className="text-sm text-slate-500">{data.shipments.length} envíos acumulados</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col md:flex-row items-center gap-4">
                                            <div className="text-right">
                                                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total Acumulado</p>
                                                <p className="text-2xl font-black text-slate-900">€{data.totalAmount.toFixed(2)}</p>
                                            </div>
                                            <div className="flex items-center gap-2 w-full md:w-auto">
                                                <button 
                                                    onClick={() => handleExportExcel(data)}
                                                    className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                                                    title="Descargar detalle en Excel"
                                                >
                                                    <FileText size={18} />
                                                </button>
                                                <button 
                                                    onClick={() => handleLiquidate(data)}
                                                    disabled={isProcessing}
                                                    className="flex-1 md:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                                                >
                                                    Cerrar Mes
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
