import React, { useState, useMemo } from 'react';
import { Bell, Package, CheckCircle, FileText, AlertTriangle, ChevronRight, ExternalLink, Search, X } from 'lucide-react';
import ShipmentDetailsModal from '../components/shipments/ShipmentDetailsModal';
import { getIrregularReasons } from '../utils/shipmentUtils';
import { coincideBusqueda, coincideEnCampos } from '../utils/busqueda';

export default function NotificationCenter({ shipments, drivers, clients, onUpdateShipment, articles, tariffs, defaultCodFee, familyOrder, coverageZones }) {
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [searchTerm, setSearchTerm] = useState('');

    // Filter shipments that have irregular reasons and are not dismissed
    const allNotifications = useMemo(() => {
        return shipments
            .map(shipment => ({
                shipment,
                reasons: getIrregularReasons(shipment)
            }))
            .filter(item => item.reasons.length > 0)
            .sort((a, b) => new Date(b.shipment.createdAt || 0) - new Date(a.shipment.createdAt || 0));
    }, [shipments]);

    // El buscador mira los mismos campos que el de envíos (referencia, remitente,
    // destinatario, ruta, NIF, teléfono) y además el motivo de la alerta y las
    // observaciones, que es lo que se ve en esta pantalla.
    const notifications = useMemo(() => {
        if (!searchTerm.trim()) return allNotifications;
        return allNotifications.filter(({ shipment, reasons }) =>
            coincideBusqueda(shipment, searchTerm) ||
            coincideEnCampos([...reasons, shipment.observations], searchTerm)
        );
    }, [allNotifications, searchTerm]);

    const handleDismiss = async (e, shipmentId) => {
        e.stopPropagation();
        if (window.confirm('¿Marcar como visto? Desaparecerá de esta lista.')) {
            await onUpdateShipment(shipmentId, { notificationDismissed: true });
            setSelectedIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(shipmentId);
                return newSet;
            });
        }
    };

    const handleBulkDismiss = async () => {
        if (selectedIds.size === 0) return;
        if (window.confirm(`¿Marcar ${selectedIds.size} envíos como vistos?`)) {
            const idsArray = Array.from(selectedIds);
            for (const id of idsArray) {
                 await onUpdateShipment(id, { notificationDismissed: true });
            }
            setSelectedIds(new Set());
        }
    };

    // "Seleccionar todos" actúa solo sobre lo que se ve tras el buscador.
    const visibleIds = notifications.map(n => n.shipment.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

    const toggleSelectAll = () => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (allVisibleSelected) visibleIds.forEach(id => newSet.delete(id));
            else visibleIds.forEach(id => newSet.add(id));
            return newSet;
        });
    };

    const toggleSelect = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) newSet.delete(id);
            else newSet.add(id);
            return newSet;
        });
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-amber-100 text-amber-600 rounded-xl">
                        <Bell size={28} />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-slate-800 tracking-tight">Centro de Notificaciones</h1>
                        <p className="text-slate-500 font-medium">Atención especial: Palets, excesos de bultos, observaciones y kilos indicados por el cliente.</p>
                    </div>
                </div>
                <div className="bg-amber-50 px-4 py-2 rounded-lg border border-amber-200">
                    <span className="text-amber-800 font-bold text-lg">{allNotifications.length}</span>
                    <span className="text-amber-600 text-sm ml-2 font-medium">Pendientes de Revisión</span>
                </div>
            </div>

            {/* Buscador */}
            {allNotifications.length > 0 && (
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
                    <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar por referencia, remitente, destinatario, motivo..."
                            className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                                title="Limpiar búsqueda"
                            >
                                <X size={18} />
                            </button>
                        )}
                    </div>
                    {searchTerm.trim() && (
                        <p className="mt-2 text-xs text-slate-500 font-medium">
                            {notifications.length} de {allNotifications.length} notificaciones coinciden con la búsqueda
                        </p>
                    )}
                </div>
            )}

            {/* Bulk Actions */}
            {notifications.length > 0 && (
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex justify-between items-center">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input 
                            type="checkbox" 
                            className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                            checked={allVisibleSelected}
                            onChange={toggleSelectAll}
                        />
                        <span className="text-sm font-bold text-slate-700">Seleccionar Todos</span>
                    </label>

                    {selectedIds.size > 0 && (
                        <button 
                            onClick={handleBulkDismiss}
                            className="px-4 py-2 bg-emerald-600 text-white hover:bg-emerald-700 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
                        >
                            <CheckCircle size={16} /> Marcar {selectedIds.size} como vistos
                        </button>
                    )}
                </div>
            )}

            {/* List */}
            {notifications.length === 0 && allNotifications.length > 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={40} className="text-slate-400" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Sin resultados</h3>
                    <p className="text-slate-500">Ninguna notificación coincide con "{searchTerm.trim()}".</p>
                </div>
            ) : notifications.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-sm">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={40} className="text-emerald-500" />
                    </div>
                    <h3 className="text-xl font-bold text-slate-700 mb-2">Todo bajo control</h3>
                    <p className="text-slate-500">No hay ningún envío irregular o con alertas pendiente de revisar.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {notifications.map(({ shipment, reasons }) => (
                        <div 
                            key={shipment.id}
                            onClick={() => setSelectedShipment(shipment)}
                            className={`bg-white rounded-xl border p-5 shadow-sm hover:shadow-md transition-all cursor-pointer group flex flex-col sm:flex-row gap-5 ${selectedIds.has(shipment.id) ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 hover:border-amber-300'}`}
                        >
                            {/* Checkbox */}
                            <div className="flex items-center sm:pt-1 shrink-0" onClick={(e) => toggleSelect(e, shipment.id)}>
                                <input 
                                    type="checkbox" 
                                    className="w-5 h-5 rounded text-amber-600 focus:ring-amber-500 cursor-pointer pointer-events-none"
                                    checked={selectedIds.has(shipment.id)}
                                    onChange={() => {}}
                                />
                            </div>

                            {/* Left Side: Basic Info */}
                            <div className="flex-1 space-y-3">
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded">
                                        REF: {shipment.id}
                                    </span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded ${
                                        shipment.status === 'Entregado' ? 'bg-emerald-100 text-emerald-700' :
                                        shipment.status === 'Incidencia' ? 'bg-red-100 text-red-700' :
                                        'bg-blue-100 text-blue-700'
                                    }`}>
                                        {shipment.status || 'Pendiente'}
                                    </span>
                                    <span className="text-xs text-slate-400 font-medium ml-auto">
                                        {new Date(shipment.createdAt || shipment.date).toLocaleDateString('es-ES')}
                                    </span>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Remitente</p>
                                        <p className="text-sm font-bold text-slate-800">{shipment.client}</p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase">Destinatario</p>
                                        <p className="text-sm font-bold text-slate-800">{shipment.destinationName || shipment.client}</p>
                                    </div>
                                    {parseFloat(shipment.weightKg) > 0 && (
                                        <div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase">Peso indicado</p>
                                            <p className="text-sm font-bold text-indigo-700">⚖️ {parseFloat(shipment.weightKg)} kg</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Middle: Reasons */}
                            <div className="flex-1 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-5 flex flex-col justify-center">
                                <p className="text-[10px] font-bold text-amber-500 uppercase tracking-widest mb-2 flex items-center gap-1">
                                    <AlertTriangle size={12} /> Motivo de Alerta
                                </p>
                                <div className="flex flex-col gap-2">
                                    {reasons.map((r, i) => (
                                        <span key={i} className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"></span>
                                            {r}
                                        </span>
                                    ))}
                                </div>
                                {reasons.includes('Tiene observaciones') && shipment.observations && (
                                    <p className="mt-2 text-xs text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">
                                        "{String(shipment.observations).replace(/\[COBRO PENDIENTE\]/gi, '').trim()}"
                                    </p>
                                )}
                            </div>

                            {/* Right Side: Actions */}
                            <div className="flex sm:flex-col items-center justify-end sm:justify-center gap-3 border-t sm:border-t-0 sm:border-l border-slate-100 pt-4 sm:pt-0 sm:pl-5 shrink-0">
                                <button 
                                    className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setSelectedShipment(shipment);
                                    }}
                                >
                                    <ExternalLink size={14} /> Ver Detalles
                                </button>
                                <button 
                                    onClick={(e) => handleDismiss(e, shipment.id)}
                                    className="px-4 py-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 hover:text-emerald-700 rounded-lg text-xs font-bold transition-colors flex items-center gap-2"
                                >
                                    <CheckCircle size={14} /> Marcar Visto
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Detalles */}
            {selectedShipment && (
                <ShipmentDetailsModal
                    isOpen={!!selectedShipment}
                    onClose={() => setSelectedShipment(null)}
                    shipment={selectedShipment}
                    onUpdate={onUpdateShipment}
                    drivers={drivers}
                    clients={clients}
                    articles={articles}
                    tariffs={tariffs}
                    coverageZones={coverageZones}
                    familyOrder={familyOrder}
                />
            )}
        </div>
    );
}
