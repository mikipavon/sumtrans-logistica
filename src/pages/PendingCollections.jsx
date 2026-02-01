import React, { useState, useMemo } from 'react';
import { Wallet, Filter, Search, User, Calendar, Truck, Euro, AlertTriangle, CheckCircle, ArrowRight } from 'lucide-react';

export default function PendingCollections({ shipments, drivers, clients }) {
    const [filterType, setFilterType] = useState('all'); // 'all', 'shipping_fee', 'reimbursement'
    const [filterDriver, setFilterDriver] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Logic to identify pending collections
    const pendingItems = useMemo(() => {
        if (!shipments) return [];

        return shipments.filter(s => {
            // 1. Reimbursements (Reembolsos)
            // Logic: Has COD amount > 0 AND (Status is 'En Reparto' (Driver has it) OR 'Entregado' (Driver collected it but not yet reconciled))
            // Actually, we usually want to see what is PENDING to be reconciled in the office.
            const codAmount = parseFloat((s.codAmount || '0').replace(/[^0-9.-]+/g, ""));
            const isReimbursement = codAmount > 0;

            // 2. Shipping Fees (Portes)
            // Logic: PaymentStatus is 'Pending' AND Client is 'Daily' or 'New' (Risk)
            const isShippingFee = s.paymentStatus === 'Pending' || s.status === 'Pendiente Cobro';

            // Refine Shipping Fee Logic: Only if client is Risk
            let isRiskClient = false;
            if (isShippingFee) {
                // Determine payer (usually destination for entrega, origin for recogida if not specified)
                // Simplified: Check Client Name against DB
                const clientName = s.client || s.destinationName;
                const clientData = clients.find(c => c.name.toLowerCase() === (clientName || '').toLowerCase());
                isRiskClient = !clientData || clientData.billingType === 'Cobro Diario' || clientData.status === 'pending';
            }

            // Must match at least one criteria
            if (!isReimbursement && !(isShippingFee && isRiskClient)) return false;

            return true;

        }).map(s => {
            // Normalize data for display
            const codAmount = parseFloat((s.codAmount || '0').replace(/[^0-9.-]+/g, ""));
            const shippingAmount = parseFloat((s.amount || '0').replace(/[^0-9.-]+/g, ""));

            const types = [];
            if (codAmount > 0) types.push({ type: 'Reembolso', amount: codAmount });

            // Check risk again for labelling
            const clientName = s.client || s.destinationName;
            const clientData = clients.find(c => c.name.toLowerCase() === (clientName || '').toLowerCase());
            const isRiskClient = !clientData || clientData.billingType === 'Cobro Diario' || clientData.status === 'pending';

            if ((s.paymentStatus === 'Pending' || s.status === 'Pendiente Cobro') && isRiskClient) {
                types.push({ type: 'Porte', amount: shippingAmount });
            }

            return {
                ...s,
                collectionTypes: types // Array of what needs to be collected
            };
        }).filter(item => item.collectionTypes.length > 0); // Remove if pushed nothing

    }, [shipments, clients]);

    // Apply UI Filters
    const filteredItems = pendingItems.filter(item => {
        // Filter by Type
        if (filterType !== 'all') {
            const hasType = item.collectionTypes.some(t =>
                (filterType === 'shipping_fee' && t.type === 'Porte') ||
                (filterType === 'reimbursement' && t.type === 'Reembolso')
            );
            if (!hasType) return false;
        }

        // Filter by Driver
        if (filterDriver !== 'all') {
            if (String(item.assignedDriverId) !== String(filterDriver)) return false;
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

    const totalPending = filteredItems.reduce((sum, item) => {
        const itemTotal = item.collectionTypes.reduce((subSum, t) => {
            // Filter sum based on view filter too? Ideally yes.
            if (filterType === 'shipping_fee' && t.type !== 'Porte') return subSum;
            if (filterType === 'reimbursement' && t.type !== 'Reembolso') return subSum;
            return subSum + t.amount;
        }, 0);
        return sum + itemTotal;
    }, 0);

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-indigo-600" />
                        Cobros Pendientes
                    </h1>
                    <p className="text-slate-500">Gestión de Portes Debidos y Reembolsos en poder de repartidores</p>
                </div>

                <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 min-w-[200px]">
                    <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Pendiente</p>
                    <p className="text-2xl font-bold text-slate-800">€{totalPending.toFixed(2)}</p>
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
                        <option value="shipping_fee">Solo Portes (Nuevos/Diarios)</option>
                        <option value="reimbursement">Solo Reembolsos</option>
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={filterDriver}
                        onChange={(e) => setFilterDriver(e.target.value)}
                    >
                        <option value="all">Todos los Repartidores</option>
                        {drivers.map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead className="bg-slate-50 text-left">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha / Ref</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Concepto</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Importe</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Repartidor</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Estado</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredItems.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <CheckCircle size={32} className="text-slate-200" />
                                            <p>No hay cobros pendientes con estos filtros.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredItems.map((item) => (
                                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-bold text-slate-700 text-sm">{item.date}</span>
                                            <span className="text-xs text-slate-400 font-mono">{item.id}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col">
                                            <span className="font-medium text-slate-800">{item.client}</span>
                                            <span className="text-xs text-slate-500 truncate max-w-[150px]">{item.destinationName || item.destinationAddress}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex flex-col gap-1">
                                            {item.collectionTypes.map((t, idx) => (
                                                <span
                                                    key={idx}
                                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold w-fit
                                                    ${t.type === 'Reembolso' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}
                                                >
                                                    {t.type === 'Reembolso' ? <Euro size={12} /> : <Truck size={12} />}
                                                    {t.type}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex flex-col items-end gap-1">
                                            {item.collectionTypes.map((t, idx) => (
                                                <span key={idx} className="font-bold text-slate-700 block">
                                                    €{t.amount.toFixed(2)}
                                                </span>
                                            ))}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {(() => {
                                            // Logic: If 'Reembolso' or 'Porte' (check who pays)
                                            // Simplified Assumption:
                                            // - Reembolso -> Receiver Pays -> Responsible: Delivering Driver (assignedDriverId)
                                            // - Porte (Shipping Fee) -> 
                                            //      If Pickup (Recogida) -> Sender Pays -> Responsible: Creating Driver (createdById)
                                            //      If Delivery (Entrega) -> Receiver Pays (Portes Debidos) -> Delivering Driver (assignedDriverId)

                                            // Note: 'item.assignedDriverId' is the current owner. 
                                            // If it's a 'Porte' and it was a 'Recogida', we might want the creator.

                                            let responsibleDriverId = item.assignedDriverId;

                                            // Check if it's a prepaid pickup (Porte + Recogida) 
                                            // Actually, 'Pendiente Cobro' on a Pickup usually means the driver who picked it up needs to collect.
                                            // So if type is Recogida, responsible is often the one who did it.
                                            // But assignedDriverId SHOULD be the one who did it if status is 'Entregado' (completed).
                                            // However, if the shipment was transferred, we stick to the user's rule:
                                            // "Remitente (Sender) -> Creator"
                                            // "Destinatario (Receiver) -> Deliverer"

                                            const isSenderPayment = item.type === 'Recogida'; // Simplified heuristic

                                            if (isSenderPayment && item.createdById) {
                                                responsibleDriverId = item.createdById;
                                            }

                                            const driver = drivers.find(d => d.id === responsibleDriverId);
                                            return driver ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                                        {driver.name.substring(0, 2).toUpperCase()}
                                                    </div>
                                                    <span className="text-sm text-slate-600">{driver.name}</span>
                                                </div>
                                            ) : (
                                                <span className="text-xs text-slate-400 italic">Sin Asignar</span>
                                            );
                                        })()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-2">
                                            {item.status === 'Entregado' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                    <Wallet size={12} />
                                                    Cobrado (Conductor)
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-50 text-blue-600">
                                                    <Truck size={12} />
                                                    En Reparto
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
