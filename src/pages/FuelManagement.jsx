import { Fuel, Plus, Calendar, Truck, User, TrendingDown, DollarSign, Activity, ChevronUp, ChevronDown } from 'lucide-react';
import { useState, useMemo } from 'react';

export default function FuelManagement({ drivers, fuelLogs, onAddFuelLog, shipments }) {
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [filterDriver, setFilterDriver] = useState('all');
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
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-orange-600" /> : <ChevronDown size={14} className="text-orange-600" />;
    };


    // Default price per liter setting (could be global state later)
    const FUEL_PRICE_PER_LITER = 1.25; 

    // Compute basic analytics
    const analytics = useMemo(() => {
        let relevantLogs = filterDriver === 'all' 
            ? (fuelLogs || []) 
            : (fuelLogs || []).filter(log => String(log.driverId) === String(filterDriver));
            
        const totalLiters = relevantLogs.reduce((acc, log) => acc + Number(log.liters || 0), 0);
        const totalCost = totalLiters * FUEL_PRICE_PER_LITER;

        // Group shipments by assigned driver if filtering by one, else all that have drivers
        let relevantShipments = (shipments || []).filter(s => s.status === 'Entregado' && s.assignedDriverId);
        if (filterDriver !== 'all') {
            relevantShipments = relevantShipments.filter(s => String(s.assignedDriverId) === String(filterDriver));
        }

        const totalShipped = relevantShipments.length;
        
        // Compute revenue (only counting portes for this estimate, not reembolsos)
        const totalRevenue = relevantShipments.reduce((acc, s) => {
            const val = parseFloat(String(s.amount).replace(/[^0-9.-]+/g, "")) || 0;
            return acc + val;
        }, 0);

        const costPerPackage = totalShipped > 0 ? (totalCost / totalShipped) : 0;
        const grossProfitability = totalRevenue - totalCost;

        // Compute L/100km per vehicle
        // For accurate L/100km, we need the latest km minus earliest km for that vehicle
        const vehicles = {};
        relevantLogs.forEach(log => {
            if (!vehicles[log.plate]) {
                vehicles[log.plate] = { logs: [], minKm: Infinity, maxKm: 0, totalLiters: 0 };
            }
            vehicles[log.plate].logs.push(log);
            vehicles[log.plate].totalLiters += Number(log.liters);
            if (Number(log.km) < vehicles[log.plate].minKm) vehicles[log.plate].minKm = Number(log.km);
            if (Number(log.km) > vehicles[log.plate].maxKm) vehicles[log.plate].maxKm = Number(log.km);
        });

        // calculate weighted average of consumption across vehicles
        let sumL100 = 0;
        let countVehicles = 0;

        // Note: The totalLiters used for L/100km computation should ideal exclude the first fillup
        // or just calculate (Max Km - Min Km) / (Total Liters minus last fillup). 
        // For simplicity: Total Liters / ((MaxKm - MinKm)/100)
        for (let plate in vehicles) {
            const v = vehicles[plate];
            const diffKm = v.maxKm - v.minKm;
            if (diffKm > 0) {
                // Approximate: exclude one fillup to represent the starting tank, or just use all.
                const l100 = (v.totalLiters / diffKm) * 100;
                sumL100 += l100;
                countVehicles++;
            }
        }

        const avgConsumption = countVehicles > 0 ? (sumL100 / countVehicles) : 0;

        return {
            totalLiters,
            totalCost,
            totalShipped,
            totalRevenue,
            costPerPackage,
            grossProfitability,
            avgConsumption
        };

    }, [filterDriver, fuelLogs, shipments]);

    // Simple Form State
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        driverId: '',
        plate: '',
        km: '',
        liters: ''
    });

    const handleSave = (e) => {
        e.preventDefault();
        onAddFuelLog({
            ...formData,
            id: Date.now().toString(),
        });
        setIsModalOpen(false);
        setFormData({ ...formData, km: '', liters: '' }); // keep date/driver/plate to speed up entry
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                        <Fuel className="text-orange-500" />
                        Control de Flota y Combustible
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Registra repostajes del surtidor y analiza la rentabilidad de las rutas.</p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-700 transition-colors flex items-center gap-2 shadow-sm"
                >
                    <Plus size={16} /> Registrar Repostaje
                </button>
            </div>

            {/* Metrics Dashboard */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Dashboard de Rentabilidad / Consumo</h3>
                    <select 
                        val={filterDriver} 
                        onChange={e => setFilterDriver(e.target.value)}
                        className="p-2 border border-slate-200 rounded-lg text-sm"
                    >
                        <option value="all">Todas las rutas y conductores</option>
                        {(drivers || []).map(d => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                    </select>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="text-slate-400 mb-2 flex items-center gap-2 text-xs font-bold uppercase"><Activity size={16}/> Consumo Medio</div>
                        <p className="text-2xl font-bold text-slate-800">{analytics.avgConsumption.toFixed(1)} <span className="text-sm text-slate-500 font-normal">L/100km</span></p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                        <div className="text-orange-500 mb-2 flex items-center gap-2 text-xs font-bold uppercase"><TrendingDown size={16}/> Coste x Paquete</div>
                        <p className="text-2xl font-bold text-orange-700">€{analytics.costPerPackage.toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                        <div className="text-emerald-600 mb-2 flex items-center gap-2 text-xs font-bold uppercase"><DollarSign size={16}/> Beneficio Ruta (Bruto)</div>
                        <p className="text-2xl font-bold text-emerald-700">€{analytics.grossProfitability.toFixed(2)}</p>
                    </div>
                    <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                        <div className="text-blue-500 mb-2 flex items-center gap-2 text-xs font-bold uppercase"><Truck size={16}/> Paquetes Entregados</div>
                        <p className="text-2xl font-bold text-blue-700">{analytics.totalShipped}</p>
                    </div>
                </div>
                <div className="mt-4 text-xs text-slate-400 text-right">
                   * Basado en un coste estimado de €{FUEL_PRICE_PER_LITER}/litro
                </div>
            </div>

            {/* Logs Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-4 border-b border-slate-100">
                    <h3 className="font-bold text-slate-800">Historial del Surtidor</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-500 uppercase text-xs">
                            <tr>
                                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('date')}>
                                    <div className="flex items-center gap-1">
                                        Fecha
                                        <SortIcon column="date" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('driverId')}>
                                    <div className="flex items-center gap-1">
                                        Conductor
                                        <SortIcon column="driverId" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('plate')}>
                                    <div className="flex items-center gap-1">
                                        Matrícula
                                        <SortIcon column="plate" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('liters')}>
                                    <div className="flex items-center gap-1">
                                        Litros
                                        <SortIcon column="liters" />
                                    </div>
                                </th>
                                <th className="px-4 py-3 cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('km')}>
                                    <div className="flex items-center gap-1">
                                        Kilómetros
                                        <SortIcon column="km" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(fuelLogs || [])
                                .filter(log => filterDriver === 'all' || String(log.driverId) === String(filterDriver))
                                .sort((a, b) => {
                                    if (!sortConfig.key) return 0;
                                    let aVal = a[sortConfig.key];
                                    let bVal = b[sortConfig.key];
                                    
                                    if (sortConfig.key === 'date') {
                                        return sortConfig.direction === 'asc' 
                                            ? new Date(aVal) - new Date(bVal)
                                            : new Date(bVal) - new Date(aVal);
                                    }
                                    
                                    if (sortConfig.key === 'liters' || sortConfig.key === 'km') {
                                        return sortConfig.direction === 'asc' 
                                            ? Number(aVal) - Number(bVal)
                                            : Number(bVal) - Number(aVal);
                                    }

                                    const sA = String(aVal || '').toLowerCase();
                                    const sB = String(bVal || '').toLowerCase();
                                    if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                                    if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                                    return 0;
                                })
                                .map(log => {
                                const driverName = (drivers || []).find(d => String(d.id) === String(log.driverId))?.name || 'Desconocido';
                                return (
                                    <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                                        <td className="px-4 py-3 font-medium text-slate-700"><Calendar size={14} className="inline mr-2 text-slate-400"/> {new Date(log.date).toLocaleDateString()}</td>
                                        <td className="px-4 py-3"><User size={14} className="inline mr-2 text-slate-400"/> {driverName}</td>
                                        <td className="px-4 py-3 font-mono text-slate-500">{log.plate}</td>
                                        <td className="px-4 py-3 font-bold text-orange-600">{log.liters} L</td>
                                        <td className="px-4 py-3 font-medium">{log.km} km</td>
                                    </tr>
                                );
                            })}
                            {(!fuelLogs || fuelLogs.length === 0) && (
                                <tr>
                                    <td colSpan="5" className="px-4 py-8 text-center text-slate-400">
                                        No hay repostajes registrados. Añade el primero para generar estadísticas.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <Fuel className="text-orange-500" />
                                Añadir Repostaje
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-2 rounded-full transition-colors">
                                <Plus className="rotate-45" size={20} />
                            </button>
                        </div>
                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Fecha</label>
                                <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Conductor</label>
                                <select required value={formData.driverId} onChange={e => setFormData({...formData, driverId: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500">
                                    <option value="">Selecciona Conductor...</option>
                                    {(drivers || []).map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">Matrícula (Vehículo)</label>
                                <input type="text" placeholder="Ej: 1234-ABC" required value={formData.plate} onChange={e => setFormData({...formData, plate: e.target.value.toUpperCase()})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Kilómetros Cuadro</label>
                                    <input type="number" required placeholder="Ej: 145000" min="0" value={formData.km} onChange={e => setFormData({...formData, km: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-slate-600 mb-1">Litros Repostados</label>
                                    <input type="number" step="0.01" required placeholder="Ej: 50.5" min="0" value={formData.liters} onChange={e => setFormData({...formData, liters: e.target.value})} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors flex items-center gap-2">
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
