import React, { useState, useMemo } from 'react';
import { Wallet, Filter, Search, User, Calendar, Truck, Euro, AlertTriangle, CheckCircle, ArrowRight, Pencil, X, FileText, ChevronUp, ChevronDown } from 'lucide-react';
import ShipmentDetailsModal from '../components/shipments/ShipmentDetailsModal';
import { utils, writeFile } from 'xlsx';
import Shipment from '../models/Shipment';

export default function PendingCollections({ shipments, drivers, clients, onAssignDriver }) {
    const [filterType, setFilterType] = useState('all'); // 'all', 'shipping_fee', 'reimbursement'
    const [filterDriver, setFilterDriver] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [tempDriverId, setTempDriverId] = useState('');
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-10 group-hover:opacity-30"><ChevronUp size={14} /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-indigo-600" /> : <ChevronDown size={14} className="text-indigo-600" />;
    };


    const startEditing = (itemId, currentDriverId) => {
        setEditingId(itemId);
        setTempDriverId(currentDriverId || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setTempDriverId('');
    };

    const saveDriver = (itemId) => {
        if (onAssignDriver) {
            onAssignDriver(itemId, tempDriverId);
        }
        setEditingId(null);
        setTempDriverId('');
    };

    // Helper for safe currency parsing
    const parseCurrency = (value) => {
        if (typeof value === 'number') return value;
        return parseFloat(String(value || '0').replace(/[^0-9.-]+/g, ""));
    };
    // Logic to identify pending collections - using the Shipment model
    const pendingItems = useMemo(() => {
        if (!Array.isArray(shipments)) return [];

        return shipments.filter(s => {
            // EXCLUDE: Pagados y entregados completamente
            if (s.status === 'Entregado' && s.paymentStatus === 'Paid' && s.portePaid !== false && !s.hasCod) return false;
            if (s.status === 'Anulado') return false;

            const normalize = (val) => String(val || '').trim().toLowerCase();
            const sName = normalize(s.client);
            const dName = normalize(s.destinationName);

            // Buscar en la lista de clientes para obtener datos frescos de facturación
            const senderClient = clients?.find(c => normalize(c.name) === sName || normalize(c.legalName) === sName);
            const destClient = clients?.find(c => normalize(c.name) === dName || normalize(c.legalName) === dName);

            const model = new Shipment({
                ...s,
                billingType: senderClient?.billingType || s.billingType || 'Clientes Habituales',
                destinationBillingType: destClient?.billingType || s.destinationBillingType || null
            });

            // CASO 2 y 5: Remitente cliente habitual + porte PAGADO → siempre en cobros pendientes
            const senderDebt = model.generatesPendingDebtOnCreation() && s.paymentStatus !== 'Paid';

            // CASO 3 y 6: Porte DEBIDO + cliente habitual destinatario → solo si está ENTREGADO
            const senderIsInvoice = model.isInvoiceBilling(s.billingType);
            const receiverOwesPorte = s.porteType === 'Debido'
                && s.status === 'Entregado'
                && !model.isInvoiceBilling(destClient?.billingType)
                && s.paymentStatus !== 'Paid';

            // Reembolso pendiente (siempre al entregarse si no se marcó como cobrado)
            const codPending = s.hasCod && parseCurrency(s.codAmount) > 0 && !s.codPaid && s.status === 'Entregado';

            return senderDebt || receiverOwesPorte || codPending;

        }).map(s => {
            const normalize = (val) => String(val || '').trim().toLowerCase();
            const sName = normalize(s.client);
            const dName = normalize(s.destinationName);

            const senderClient = clients?.find(c => normalize(c.name) === sName || normalize(c.legalName) === sName);
            const destClient = clients?.find(c => normalize(c.name) === dName || normalize(c.legalName) === dName);

            const model = new Shipment({
                ...s,
                billingType: senderClient?.billingType || s.billingType || 'Clientes Habituales',
                destinationBillingType: destClient?.billingType || s.destinationBillingType || null
            });

            const codAmount = parseCurrency(s.codAmount);
            const shippingAmount = parseCurrency(s.customAmount) || parseCurrency(s.amount);
            const designatedDriverId = s.assignedDriverId || s.createdById;
            const types = [];

            // Porte del REMITENTE (cliente habitual + pagado)
            if (model.generatesPendingDebtOnCreation() && s.paymentStatus !== 'Paid') {
                types.push({
                    type: 'Portes (Pagado)',
                    amount: shippingAmount,
                    amountDisplay: String(s.amount).toLowerCase() === 'tarifa' ? 'Tarifa' : shippingAmount,
                    responsibleDriverId: s.createdById || designatedDriverId,
                    payerName: s.client
                });
            }

            // Porte del DESTINATARIO (Debido + cliente habitual + entregado)
            if (s.porteType === 'Debido'
                && s.status === 'Entregado'
                && !model.isInvoiceBilling(destClient?.billingType)
                && s.paymentStatus !== 'Paid') {
                types.push({
                    type: 'Portes (Debido)',
                    amount: shippingAmount,
                    amountDisplay: shippingAmount,
                    responsibleDriverId: designatedDriverId,
                    payerName: s.destinationName || 'Destinatario'
                });
            }

            // Reembolso (COD)
            if (s.hasCod && codAmount > 0 && !s.codPaid && s.status === 'Entregado') {
                types.push({
                    type: 'Reembolso',
                    amount: codAmount,
                    amountDisplay: codAmount,
                    responsibleDriverId: designatedDriverId,
                    payerName: s.destinationName || 'Destinatario (Reembolso)'
                });
            }

            return { ...s, collectionTypes: types };
        }).filter(item => item.collectionTypes.length > 0);

    }, [shipments, clients]);

    // Apply UI Filters
    const filteredItems = pendingItems.filter(item => {
        // Filter by Type
        if (filterType !== 'all') {
            const hasType = item.collectionTypes.some(t =>
                (filterType === 'shipping_fee' && t.type.startsWith('Portes')) ||
                (filterType === 'reimbursement' && t.type === 'Reembolso')
            );
            if (!hasType) return false;
        }

        // Filter by Driver
        if (filterDriver !== 'all') {
            const hasDriverDebt = item.collectionTypes.some(t => String(t.responsibleDriverId) === String(filterDriver));
            if (!hasDriverDebt) return false;
        }

        // Search
        if (searchTerm) {
            const searchLower = searchTerm.toLowerCase();
            return (
                item.client?.toLowerCase().includes(searchLower) ||
                item.id.toLowerCase().includes(searchLower) ||
                item.destinationName?.toLowerCase().includes(searchLower)
            );
        }

        return true;
    });

    const sortedItems = useMemo(() => {
        let result = [...filteredItems];
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'amount') {
                    // Sum up the amounts in collectionTypes
                    const getSum = (item) => item.collectionTypes.reduce((s, t) => {
                        if (filterType === 'shipping_fee' && !t.type.startsWith('Portes')) return s;
                        if (filterType === 'reimbursement' && t.type !== 'Reembolso') return s;
                        return s + t.amount;
                    }, 0);
                    return sortConfig.direction === 'asc' ? getSum(a) - getSum(b) : getSum(b) - getSum(a);
                }

                if (sortConfig.key === 'date') {
                    return sortConfig.direction === 'asc' 
                        ? new Date(aVal) - new Date(bVal)
                        : new Date(bVal) - new Date(aVal);
                }

                const sA = String(aVal || '').toLowerCase();
                const sB = String(bVal || '').toLowerCase();
                if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [filteredItems, sortConfig, filterType]);


    const totalPending = filteredItems.reduce((sum, item) => {
        const itemTotal = item.collectionTypes.reduce((subSum, t) => {
            // Filter sum based on view filter too? Ideally yes.
            if (filterType === 'shipping_fee' && !t.type.startsWith('Portes')) return subSum;
            if (filterType === 'reimbursement' && t.type !== 'Reembolso') return subSum;
            return subSum + t.amount;
        }, 0);
        return sum + itemTotal;
    }, 0);

    const handleExportToExcel = () => {
        if (filteredItems.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }

        const data = filteredItems.flatMap(item => {
            return item.collectionTypes.map(t => {
                const driver = Array.isArray(drivers) ? drivers.find(d => d.id === t.responsibleDriverId) : null;
                return {
                    'ID Envío': item.id,
                    'Fecha': item.date,
                    'Remitente': item.client,
                    'Destinatario': item.destinationName || 'N/A',
                    'Pagador': t.payerName,
                    'Concepto': t.type,
                    'Importe': typeof t.amountDisplay !== 'undefined' ? t.amountDisplay : t.amount,
                    'Conductor': driver ? driver.name : 'Sin Asignar',
                    'Estado Envío': item.status
                };
            });
        });

        const ws = utils.json_to_sheet(data);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Cobros Pendientes");
        writeFile(wb, `Cobros_Pendientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => { setIsDetailsModalOpen(false); setSelectedShipment(null); }}
                shipment={selectedShipment}
                onUpdate={() => { }}
            />
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-indigo-600" />
                        Cobros Pendientes
                    </h1>
                    <p className="text-slate-500">Gestión de Porte Debido y Reembolsos en poder de repartidores</p>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={handleExportToExcel}
                        title="Exportar a Excel"
                        className="flex items-center justify-center p-4 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                        <FileText size={24} />
                    </button>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 min-w-[200px]">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Pendiente</p>
                        <p className="text-2xl font-bold text-slate-800">€{totalPending.toFixed(2)}</p>
                    </div>
                </div>
            </header>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, referencia..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Filter size={20} className="text-slate-400" />
                    <select
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">Todos los Tipos</option>
                        <option value="shipping_fee">Solo Porte (Nuevos/Diarios)</option>
                        <option value="reimbursement">Solo Reembolsos</option>
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={filterDriver}
                        onChange={(e) => setFilterDriver(e.target.value)}
                    >
                        <option value="all">Todos los Repartidores</option>
                        {Array.isArray(drivers) && drivers.filter(d => d.isActive !== false).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '26%' }} />
                            <col style={{ width: '16%' }} />
                        </colgroup>
                        <thead className="bg-slate-50 text-left">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('date')}>
                                    <div className="flex items-center gap-1">
                                        Fecha / Ref
                                        <SortIcon column="date" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('client')}>
                                    <div className="flex items-center gap-1">
                                        Clientes (Rem/Des)
                                        <SortIcon column="client" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Concepto</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Importe
                                        <SortIcon column="amount" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('assignedDriverId')}>
                                    <div className="flex items-center gap-1">
                                        Repartidor
                                        <SortIcon column="assignedDriverId" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('status')}>
                                    <div className="flex items-center gap-1">
                                        Estado
                                        <SortIcon column="status" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <CheckCircle size={32} className="text-slate-200" />
                                            <p>No hay cobros pendientes con estos filtros.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : sortedItems.map((item) => {
                                const hasPorte = item.collectionTypes.some(t => t.type.startsWith('Portes'));
                                const hasReembolso = item.collectionTypes.some(t => t.type === 'Reembolso');

                                // Logic: Receiver pays Reimbursement always. 
                                // For Porte, it depends on porteType (Debido = Receiver, Pagado = Sender)
                                const isReceiverPayer = hasReembolso || (hasPorte && item.porteType === 'Debido');
                                const isSenderPayer = hasPorte && item.porteType !== 'Debido';

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setSelectedShipment(item); setIsDetailsModalOpen(true); }}>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col truncate">
                                                <span className="font-bold text-slate-700 text-sm truncate">{item.date}</span>
                                                <span className="text-xs text-slate-400 font-mono truncate">{item.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col truncate">
                                                <span
                                                    className={`truncate ${isSenderPayer ? 'font-bold text-slate-900 text-sm' : 'text-slate-500 text-[11px]'}`}
                                                    title={`Remitente: ${item.client}`}
                                                >
                                                    {isSenderPayer && <span className="mr-1 text-[10px] text-indigo-500">◆</span>}
                                                    {item.client}
                                                </span>
                                                <span
                                                    className={`truncate mt-0.5 ${isReceiverPayer ? 'font-bold text-slate-900 text-sm' : 'text-slate-500 text-[11px]'}`}
                                                    title={`Destinatario: ${item.destinationName || 'Destinatario'}`}
                                                >
                                                    {isReceiverPayer && <span className="mr-1 text-[10px] text-amber-500">◆</span>}
                                                    {item.destinationName || 'Destinatario'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col gap-1 truncate">
                                                {item.collectionTypes.map((t, idx) => (
                                                    <span
                                                        key={idx}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold w-fit truncate
                                                    ${t.type === 'Reembolso' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}
                                                    >
                                                        {t.type === 'Reembolso' ? <Euro size={12} className="shrink-0" /> : <Truck size={12} className="shrink-0" />}
                                                        <span className="truncate">{t.type === 'Reembolso' ? 'Reembolso' : t.type}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                {item.collectionTypes.map((t, idx) => {
                                                    const displayVal = typeof t.amountDisplay !== 'undefined' ? t.amountDisplay : t.amount;
                                                    return (
                                                        <span key={idx} className="font-bold text-slate-700 block whitespace-nowrap">
                                                            {typeof displayVal === 'number' ? `€${displayVal.toFixed(2)}` : displayVal}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
                                                        value={tempDriverId}
                                                        onChange={(e) => setTempDriverId(e.target.value)}
                                                        autoFocus
                                                    >
                                                        <option value="">Sin Asignar</option>
                                                        {Array.isArray(drivers) && drivers.filter(d => d.isActive !== false || d.id === item.assignedDriverId).map(d => (
                                                            <option key={d.id} value={d.id}>{d.name}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); saveDriver(item.id); }}
                                                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                                        title="Guardar"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                                                        className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                                                        title="Cancelar"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {item.collectionTypes.map((t, idx) => {
                                                        const driver = Array.isArray(drivers) ? drivers.find(d => d.id === t.responsibleDriverId) : null;
                                                        return (
                                                            <div key={idx} className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400 w-12 font-medium truncate shrink-0">{t.type === 'Reembolso' ? 'Reemb.' : 'Porte'}</span>
                                                                {driver ? (
                                                                    <>
                                                                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                                                            {driver.name ? driver.name.substring(0, 2).toUpperCase() : '??'}
                                                                        </div>
                                                                        <span className="text-xs text-slate-600 truncate max-w-[80px]" title={driver.name}>
                                                                            {driver.name || 'Desc.'}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 italic">Sin Asignar</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="mt-1 flex justify-start">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); startEditing(item.id, item.assignedDriverId); }}
                                                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 font-medium transition-colors"
                                                            title="Cambiar repartidor del reparto"
                                                        >
                                                            <Pencil size={10} />
                                                            Editar
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {item.status === 'Entregado' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                        <Wallet size={12} />
                                                        Cobrado (Conductor)
                                                    </span>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${item.status === 'En reparto' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
                                                        <Truck size={12} />
                                                        {item.status === 'En reparto' ? 'En Reparto' : item.status}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
