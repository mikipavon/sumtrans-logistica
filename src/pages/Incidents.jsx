import { useState, useMemo } from 'react';

import { AlertTriangle, Calendar, Truck, MapPin, CheckCircle, Search, Filter, MessageSquare, Send, User, Package, Euro, Clock } from 'lucide-react';

export default function Incidents({ shipments, onUpdateStatus, onResolve, onReply, drivers }) {
    const [filterDriver, setFilterDriver] = useState('');
    const [filterDate, setFilterDate] = useState('');
    const [replyState, setReplyState] = useState({}); // Local text for inputs
    const [sortConfig, setSortConfig] = useState({ key: 'createdAt', direction: 'desc' });


    // Filter and Sort shipments with active incident status
    const incidents = useMemo(() => {
        const filtered = (shipments || []).filter(s => {
            const isIncident = s.incidentStatus === 'active' || s.status === 'Incidencia';
            const matchesDriver = filterDriver ? (
                s.assignedDriverId?.toString() === filterDriver || 
                (s.createdBy && (s.createdBy || '').toLowerCase().includes((drivers.find(d => d.id.toString() === filterDriver)?.name || '').toLowerCase()))
            ) : true;
            const matchesDate = filterDate ? (s.createdAt || '').startsWith(filterDate) : true;
            return isIncident && matchesDriver && matchesDate;
        });


        if (sortConfig.key) {
            filtered.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'createdAt') {
                    return sortConfig.direction === 'asc' 
                        ? new Date(aVal || 0) - new Date(bVal || 0)
                        : new Date(bVal || 0) - new Date(aVal || 0);
                }

                const sA = String(aVal || '').toLowerCase();
                const sB = String(bVal || '').toLowerCase();
                if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return filtered;
    }, [shipments, filterDriver, filterDate, sortConfig, drivers]);


    const getDriverName = (id) => {
        const driver = drivers.find(d => d.id === id);
        return driver ? driver.name : 'Sin Asignar';
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header and Filters */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <AlertTriangle className="text-red-500" />
                        Gestión de Incidencias
                    </h1>
                    <p className="text-slate-500 text-sm">Resuelve y gestiona los envíos con problemas reportados.</p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative">
                        <UserFilter drivers={drivers} value={filterDriver} onChange={setFilterDriver} />
                    </div>
                    <input
                        type="date"
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        value={filterDate}
                        onChange={(e) => setFilterDate(e.target.value)}
                    />
                    <select
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        value={`${sortConfig.key}-${sortConfig.direction}`}
                        onChange={(e) => {
                            const [key, direction] = e.target.value.split('-');
                            setSortConfig({ key, direction });
                        }}
                    >
                        <option value="createdAt-desc">Más recientes primero</option>
                        <option value="createdAt-asc">Más antiguos primero</option>
                        <option value="client-asc">Cliente (A-Z)</option>
                        <option value="client-desc">Cliente (Z-A)</option>
                    </select>
                </div>

            </div>

            {/* Incidents List */}
            <div className="grid grid-cols-1 gap-4">
                {incidents.length === 0 ? (
                    <div className="bg-white rounded-xl p-12 text-center border border-dashed border-slate-300">
                        <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-4" />
                        <h3 className="text-lg font-medium text-slate-900">Sin Incidencias Activas</h3>
                        <p className="text-slate-500">No hay envíos reportados con incidencias en este momento.</p>
                    </div>
                ) : (
                    incidents.map((shipment) => (
                        <div key={shipment.id} className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden flex flex-col md:flex-row">
                            {/* Left Status Strip */}
                            <div className="w-full md:w-2 bg-red-500"></div>

                            <div className="p-6 flex-1">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="flex-1">
                                        <div className="flex flex-wrap items-center gap-2 mb-2">
                                            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full uppercase">Incidencia</span>
                                            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-1 rounded-md border border-slate-200">#{shipment.id}</span>
                                            {shipment.hasCod && (
                                                <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-1 rounded-full uppercase flex items-center gap-1">
                                                    <Euro size={12} /> Reembolso: {shipment.codAmount}€
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div className="text-right bg-slate-50 p-2 rounded-lg border border-slate-100 ml-2">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase flex items-center justify-end gap-1 mb-1"><Clock size={12}/> Hora de Incidencia</p>
                                        <p className="text-sm font-bold text-slate-700">{new Date(shipment.updatedAt || shipment.createdAt || Date.now()).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-4">
                                    <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-100 h-fit">
                                        <div className="flex flex-col gap-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Remitente</span>
                                            <div className="flex items-center gap-2 text-slate-700 font-medium">
                                                <User size={16} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{shipment.client || 'No especificado'}</span>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col gap-1 pt-3 border-t border-slate-200">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Destinatario</span>
                                            <div className="flex items-start gap-2 text-slate-700 font-medium">
                                                <Package size={16} className="text-slate-400 shrink-0 mt-0.5" />
                                                <div className="min-w-0">
                                                    <p className="truncate">{shipment.destinationName || shipment.client || 'No especificado'}</p>
                                                    <p className="text-xs text-slate-500 font-normal mt-0.5 flex items-start gap-1">
                                                        <MapPin size={12} className="shrink-0 mt-0.5" />
                                                        <span className="line-clamp-2">{shipment.destinationAddress || shipment.address || 'Sin dirección'}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        <div className="flex flex-col gap-1 mt-2 pt-3 border-t border-slate-200">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Conductor Asignado</span>
                                            <div className="flex items-center gap-2 text-slate-700 font-medium">
                                                <Truck size={16} className="text-slate-400 shrink-0" />
                                                <span className="truncate">{getDriverName(shipment.assignedDriverId)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="space-y-3">
                                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                            <p className="text-xs text-slate-400 font-bold uppercase mb-1">Notas del Conductor</p>
                                            <p className="text-sm text-slate-600 italic mb-2">"{shipment.incidentReason || 'Sin detalles especificados'}"</p>
                                            {shipment.incidentPhoto && (
                                                <div className="mt-2 rounded-lg overflow-hidden border border-slate-200 shadow-sm max-w-[200px]">
                                                    <img 
                                                        src={shipment.incidentPhoto} 
                                                        alt="Evidencia de incidencia" 
                                                        className="w-full h-auto cursor-pointer hover:scale-105 transition-transform"
                                                        onClick={() => window.open(shipment.incidentPhoto, '_blank')}
                                                    />
                                                </div>
                                            )}
                                        </div>

                                        {/* Admin Reply Section */}
                                        <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                                            <p className="text-xs text-blue-500 font-bold uppercase mb-2 flex items-center gap-1">
                                                <MessageSquare size={12} />
                                                Instrucciones para el Conductor
                                            </p>
                                            
                                            {shipment.incidentReply ? (
                                                <div className="mb-3 p-2 bg-white rounded border border-blue-100 text-sm text-blue-800 font-medium italic">
                                                    "{shipment.incidentReply}"
                                                </div>
                                            ) : (
                                                <p className="text-xs text-slate-400 mb-2">No se han enviado instrucciones aún.</p>
                                            )}

                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Escribe instrucciones aquí..."
                                                    className="flex-1 text-sm border-blue-100 focus:ring-blue-500 focus:border-blue-500 rounded-lg py-1.5"
                                                    value={replyState[shipment.id] || ''}
                                                    onChange={(e) => setReplyState({ ...replyState, [shipment.id]: e.target.value })}
                                                    onKeyDown={(e) => {
                                                        if (e.key === 'Enter') {
                                                            onReply(shipment.id, replyState[shipment.id]);
                                                            setReplyState({ ...replyState, [shipment.id]: '' });
                                                        }
                                                    }}
                                                />
                                                <button
                                                    onClick={() => {
                                                        onReply(shipment.id, replyState[shipment.id]);
                                                        setReplyState({ ...replyState, [shipment.id]: '' });
                                                    }}
                                                    className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                                >
                                                    <Send size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
                                    <button
                                        onClick={() => onResolve(shipment.id)}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-500/30 flex items-center gap-2"
                                    >
                                        <CheckCircle size={16} />
                                        Resolver y Limpiar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function UserFilter({ drivers, value, onChange }) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 appearance-none min-w-[150px]"
        >
            <option value="">Todos los Conductores</option>
            {drivers.filter(d => d.isActive !== false).map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
            ))}
        </select>
    );
}
