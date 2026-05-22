import { useState } from 'react';
import { AlertTriangle, Calendar, Truck, MapPin, CheckCircle, Search, Filter } from 'lucide-react';

export default function Incidents({ shipments, onUpdateStatus, drivers }) {
    const [filterDriver, setFilterDriver] = useState('');
    const [filterDate, setFilterDate] = useState('');

    // Filter shipments with status 'Incidencia'
    const incidents = shipments.filter(s => {
        const isIncident = s.status === 'Incidencia';
        const matchesDriver = filterDriver ? (s.assignedDriverId?.toString() === filterDriver || s.createdBy?.includes(drivers.find(d => d.id.toString() === filterDriver)?.name)) : true;
        const matchesDate = filterDate ? s.createdAt?.startsWith(filterDate) : true;
        return isIncident && matchesDriver && matchesDate;
    });

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
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full uppercase">Incidencia</span>
                                            <span className="text-xs text-slate-400 font-mono">#{shipment.id}</span>
                                        </div>
                                        <h3 className="text-lg font-bold text-slate-800">{shipment.client}</h3>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-slate-400">Reportado el</p>
                                        <p className="text-sm font-medium text-slate-600">{new Date(shipment.createdAt || Date.now()).toLocaleDateString()}</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                                    <div className="space-y-2">
                                        <div className="flex items-start gap-2 text-slate-600 text-sm">
                                            <MapPin size={16} className="mt-0.5 text-slate-400" />
                                            <span>{shipment.address}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-slate-600 text-sm">
                                            <Truck size={16} className="text-slate-400" />
                                            <span>Conductor: {shipment.createdBy || 'Desconocido'}</span>
                                        </div>
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
                                        <p className="text-xs text-slate-400 font-bold uppercase mb-1">Notas del Conductor</p>
                                        <p className="text-sm text-slate-600 italic">"Cliente ausente al momento de la entrega. Se intentó contactar sin éxito."</p>
                                        {/* TODO: Connect real refusal reason */}
                                    </div>
                                </div>

                                <div className="flex gap-3 pt-4 border-t border-slate-100 justify-end">
                                    <button
                                        onClick={() => onUpdateStatus(shipment.id, 'Pendiente')}
                                        className="px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition-colors"
                                    >
                                        Marcar Pendiente
                                    </button>
                                    <button
                                        onClick={() => onUpdateStatus(shipment.id, 'Asignar')}
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors shadow-sm shadow-blue-500/30"
                                    >
                                        Mover a Asignación
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
            {drivers.map(d => (
                <option key={d.id} value={d.id}>{d.name}</option>
            ))}
        </select>
    );
}
