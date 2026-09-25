import React, { useState, useMemo, useEffect } from 'react';
import { X, Calculator, CheckCircle, ChevronDown, User, FileText, DownloadCloud, Printer, Clock } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generateDeliveryPDFBlob } from '../../utils/deliveryPdf';
import { printBudgetSummary } from '../../utils/printBudgetSummary';
import { fichaDelPagador } from '../../utils/shipmentUtils';
import { mesDelPresupuesto } from '../../utils/reciboDeDeuda';
import { entraEnElCierre, nombreDelPeriodo, mesDelCierre, mesPorDefectoDelCierre } from '../../utils/mesesDelCierre';

export default function BudgetLiquidationModal({ isOpen, onClose, shipments, clients, drivers, onCreateShipment, onUpdateMultipleShipments }) {
    // YYYY-MM. Hasta el día 10 abre en el mes anterior (ver utils/mesesDelCierre.js).
    const [selectedMonth, setSelectedMonth] = useState(() => mesPorDefectoDelCierre());
    // La ventana vive montada dentro de Envíos, que puede quedarse abierto días:
    // el mes se vuelve a calcular cada vez que se abre, no sólo al cargar.
    useEffect(() => {
        if (isOpen) setSelectedMonth(mesPorDefectoDelCierre());
    }, [isOpen]);
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [viewTab, setViewTab] = useState('pending'); // 'pending' | 'liquidated'
    // Sumar también lo que quedó sin cerrar de meses anteriores (ver utils/mesesDelCierre.js).
    const [arrastrarAnteriores, setArrastrarAnteriores] = useState(true);

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
                // Misma regla que getClientInfo en Shipments.jsx: primero por el
                // enlace con la ficha, luego por nombre (fichaDelPagador).
                const payingClientName = String(s.porteType === 'Debido' ? (s.destinationName || s.destination) : s.client).trim();
                const cInfo = fichaDelPagador(s, clients) || {};
                billingType = cInfo.billingType || 'Clientes Habituales';
                clientName = cInfo.name || payingClientName;
                clientId = cInfo.id || s.clientId;
            }

            if (billingType !== 'Presupuesto') return;

            // Comprobar la fecha. Una deuda apuntada a mano cuenta en el mes de su
            // fecha escrita (fechaContable), no en el del día en que se tecleó.
            const mes = mesDelPresupuesto(s);
            if (!entraEnElCierre(mes, selectedMonth, arrastrarAnteriores)) return;

            const amount = parseFloat((s.amount || '0').toString().replace(/[^0-9.-]/g, '')) || 0;
            
            if (amount <= 0) return; // Solo sumar envíos con valor

            const key = clientId || clientName;
            if (!dataByClient.has(key)) {
                dataByClient.set(key, {
                    clientId: clientId,
                    clientName: clientName,
                    shipments: [],
                    meses: new Set(),
                    totalAmount: 0
                });
            }

            const clientData = dataByClient.get(key);
            clientData.shipments.push(s);
            clientData.meses.add(mes);
            clientData.totalAmount += amount;
        });

        return Array.from(dataByClient.values())
            .map(d => ({ ...d, meses: [...d.meses].sort(), periodo: nombreDelPeriodo([...d.meses]) }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
    }, [shipments, clients, isOpen, selectedMonth, arrastrarAnteriores]);

    // Albaranes de meses anteriores que quedaron sin cerrar. Se cuentan siempre,
    // con la casilla marcada o no, para que se sepa que existen.
    const deMesesAnteriores = useMemo(() => {
        if (!isOpen) return 0;
        return shipments.filter(s => {
            if (s.budgetLiquidated || s.type === 'Recibo' || s.type === 'Cobro') return false;
            const tipo = s.billingType || (fichaDelPagador(s, clients) || {}).billingType;
            if (tipo !== 'Presupuesto') return false;
            if ((parseFloat((s.amount || '0').toString().replace(/[^0-9.-]/g, '')) || 0) <= 0) return false;
            return mesDelPresupuesto(s) < selectedMonth;
        }).length;
    }, [shipments, clients, isOpen, selectedMonth]);

    // Presupuestos ya cerrados este mes: para saber a quién se le asignó cada cobro
    // y si ya lo cobró o sigue pendiente, sin tener que recordarlo de memoria.
    const liquidatedData = useMemo(() => {
        if (!isOpen) return [];

        const byReceipt = new Map();

        shipments.forEach(s => {
            if (!s.budgetLiquidated || !s.linkedReceiptId) return;
            if (s.type === 'Recibo' || s.type === 'Cobro') return;

            if (!byReceipt.has(s.linkedReceiptId)) {
                byReceipt.set(s.linkedReceiptId, []);
            }
            byReceipt.get(s.linkedReceiptId).push(s);
        });

        // Un recibo sale en el mes en que se cerró: el de su albarán más reciente.
        // Así un cierre de agosto y septiembre juntos se ve entero en septiembre.
        const groups = Array.from(byReceipt.entries())
            .filter(([, groupShipments]) => mesDelCierre(groupShipments.map(mesDelPresupuesto)) === selectedMonth)
            .map(([receiptId, groupShipments]) => {
            const receipt = shipments.find(s => s.id === receiptId);
            const driver = receipt ? (drivers || []).find(d => String(d.id) === String(receipt.assignedDriverId)) : null;
            const totalAmount = receipt
                ? (parseFloat(receipt.customAmount) > 0 ? parseFloat(receipt.customAmount) : parseFloat(receipt.amount)) || 0
                : groupShipments.reduce((sum, s) => sum + (parseFloat((s.amount || '0').toString().replace(/[^0-9.-]/g, '')) || 0), 0);

            return {
                receiptId,
                clientName: groupShipments[0]?.client || receipt?.client || 'Desconocido',
                shipments: groupShipments,
                periodo: nombreDelPeriodo(groupShipments.map(mesDelPresupuesto)),
                totalAmount,
                receipt,
                driverName: driver?.name || (receipt?.assignedDriverId ? 'Conductor desconocido' : 'Sin asignar'),
                isCollected: !!receipt?.portePaid,
                liquidatedAt: receipt?.paidAt || null,
            };
        });

        return groups.sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [shipments, drivers, isOpen, selectedMonth]);

    const handlePrintBudget = (clientData, statusInfo = null) => {
        printBudgetSummary(clientData, selectedMonth, statusInfo);
    };

    const handleLiquidate = async (clientData) => {
        if (!selectedDriverId) {
            alert('Por favor, selecciona un repartidor al que asignar el cobro.');
            return;
        }

        if (!window.confirm(`¿Estás seguro de que quieres cerrar ${clientData.periodo || 'el mes'} para ${clientData.clientName} por €${clientData.totalAmount.toFixed(2)}?\n\nSe asignará el cobro a este conductor y los albaranes seleccionados se marcarán como liquidados.`)) {
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
                observations: `Cobro mensual presupuestos acumulados (${clientData.periodo || selectedMonth}). Incluye ${clientData.shipments.length} envíos.`,
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

    const handleDownloadZip = async (clientData) => {
        setIsProcessing(true);
        try {
            const zip = new JSZip();
            const safeClientName = clientData.clientName.substring(0, 20).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const folderName = `Albaranes_${safeClientName}_${selectedMonth}`;
            const folder = zip.folder(folderName);

            let count = 0;
            for (const s of clientData.shipments) {
                const blob = await generateDeliveryPDFBlob(s);
                if (blob) {
                    const fileName = `POD_${s.id}_${s.destinationName || 'Envio'}.pdf`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
                    folder.file(fileName, blob);
                    count++;
                }
            }

            if (count === 0) {
                alert("No se pudo generar ningún PDF válido para descargar.");
                return;
            }

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${folderName}.zip`);
            
        } catch (error) {
            console.error('Error generando ZIP:', error);
            alert('Error al descargar los PDFs en ZIP.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center sm:p-4">
            <div className="bg-white sm:rounded-2xl w-full max-w-4xl modal-mobile-full flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
                
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

                {/* Tabs */}
                <div className="px-6 pt-4 bg-white flex gap-2 border-b border-slate-100">
                    <button
                        onClick={() => setViewTab('pending')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                            viewTab === 'pending' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        Pendientes de Liquidar {budgetData.length > 0 && `(${budgetData.length})`}
                    </button>
                    <button
                        onClick={() => setViewTab('liquidated')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                            viewTab === 'liquidated' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        Ya Liquidados {liquidatedData.length > 0 && `(${liquidatedData.length})`}
                    </button>
                </div>

                {/* Controls */}
                <div className={`p-6 border-b border-slate-100 bg-white grid grid-cols-1 gap-4 ${viewTab === 'pending' ? 'md:grid-cols-2' : ''}`}>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Mes a Liquidar</label>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none"
                        />
                    </div>
                    {viewTab === 'pending' && (
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
                    )}
                </div>

                {viewTab === 'pending' && deMesesAnteriores > 0 && (
                    <label className="mx-6 -mt-2 mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5 accent-indigo-600"
                            checked={arrastrarAnteriores}
                            onChange={(e) => setArrastrarAnteriores(e.target.checked)}
                        />
                        <span>
                            Sumar también lo que quedó sin cerrar de meses anteriores
                            <span className="font-bold"> ({deMesesAnteriores} {deMesesAnteriores === 1 ? 'albarán' : 'albaranes'})</span>.
                            Se cobra todo junto en este cierre.
                        </span>
                    </label>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {viewTab === 'pending' ? (
                        budgetData.length === 0 ? (
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
                                                    {data.meses.length > 1 && (
                                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">{data.periodo}</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-col md:flex-row items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total Acumulado</p>
                                                    <p className="text-2xl font-black text-slate-900">€{data.totalAmount.toFixed(2)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto">
                                                    <button
                                                        onClick={() => handlePrintBudget(data)}
                                                        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                                        title="Imprimir detalle para el cliente"
                                                    >
                                                        <Printer size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportExcel(data)}
                                                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                                                        title="Descargar detalle en Excel"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadZip(data)}
                                                        disabled={isProcessing}
                                                        className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-blue-200 disabled:opacity-50"
                                                        title="Descargar PDFs en ZIP"
                                                    >
                                                        {isProcessing ? <span className="animate-pulse">...</span> : <DownloadCloud size={18} />}
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
                        )
                    ) : (
                        liquidatedData.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <Clock size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Nada liquidado todavía</h3>
                                <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No se ha cerrado ningún presupuesto para el mes seleccionado.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {liquidatedData.map((data) => (
                                    <div key={data.receiptId} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div>
                                                <h3 className="text-lg font-bold text-slate-800">{data.clientName}</h3>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">Presupuesto</span>
                                                    <span className="text-sm text-slate-500">{data.shipments.length} envíos · {data.receiptId}</span>
                                                    {data.periodo && data.periodo.includes(' y ') && (
                                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">{data.periodo}</span>
                                                    )}
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                                        data.isCollected ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                        {data.isCollected ? '✓ Cobrado' : '⏳ Pendiente de cobro'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                    <User size={12} /> Asignado a: <span className="font-semibold text-slate-500">{data.driverName}</span>
                                                </p>
                                            </div>
                                            <div className="flex flex-col md:flex-row items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total</p>
                                                    <p className="text-2xl font-black text-slate-900">€{data.totalAmount.toFixed(2)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto">
                                                    <button
                                                        onClick={() => handlePrintBudget(data, {
                                                            driverName: data.driverName,
                                                            isCollected: data.isCollected,
                                                            liquidatedAt: data.liquidatedAt,
                                                        })}
                                                        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                                        title="Imprimir detalle para el cliente"
                                                    >
                                                        <Printer size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportExcel(data)}
                                                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                                                        title="Descargar detalle en Excel"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

            </div>
        </div>
    );
}
