import { Search, Filter, Plus, MoreVertical, MapPin, Calendar, Truck, User, BarChart2, CheckCircle, Clock, AlertCircle, FileText } from 'lucide-react';
import { useState, useMemo } from 'react';
import CreateShipmentModal from '../components/shipments/CreateShipmentModal';
import ShipmentDetailsModal from '../components/shipments/ShipmentDetailsModal';
import { utils, writeFile } from 'xlsx';

export default function Shipments({ shipments, drivers, clients, onAssignDriver, onCreateShipment, onAddClient, tariffs, onUpdateShipment }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [viewMode, setViewMode] = useState('list'); // 'list' or 'stats'

    // Details Modal State
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);

    // Filters State
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [driverFilter, setDriverFilter] = useState('all');

    // Filter Logic
    const filteredShipments = useMemo(() => {
        const safeShipments = Array.isArray(shipments) ? shipments : [];
        return safeShipments.filter(shipment => {
            const matchesSearch =
                (shipment.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.client || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.origin || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                (shipment.destination || '').toLowerCase().includes(searchTerm.toLowerCase());

            const matchesStatus = statusFilter === 'all' || shipment.status === statusFilter;

            const matchesDriver = driverFilter === 'all' ||
                (driverFilter === 'unassigned' ? !shipment.assignedDriverId : String(shipment.assignedDriverId) === driverFilter);

            return matchesSearch && matchesStatus && matchesDriver;
        });
    }, [shipments, searchTerm, statusFilter, driverFilter]);

    // Statistics Logic
    const stats = useMemo(() => {
        const total = filteredShipments.length;
        const delivered = filteredShipments.filter(s => s.status === 'Entregado').length;
        const pending = filteredShipments.filter(s => s.status === 'Pendiente de asignar').length;
        const transit = filteredShipments.filter(s => s.status === 'En reparto').length;
        const incident = filteredShipments.filter(s => s.status === 'Incidencia').length;
        const deferred = filteredShipments.filter(s => s.status === 'Entrega aplazada').length;

        const safeDrivers = Array.isArray(drivers) ? drivers : [];

        // Group by City (Destination)
        const byCity = {};
        filteredShipments.forEach(s => {
            const city = s.destinationCity || (s.destination ? s.destination.split(',')[0].trim() : 'Desconocido'); // Fallback to parsing string if city field missing
            byCity[city] = (byCity[city] || 0) + 1;
        });

        // Group by Driver
        const byDriver = {};
        filteredShipments.forEach(s => {
            if (s.assignedDriverId) {
                const driver = safeDrivers.find(d => d.id === s.assignedDriverId);
                const name = driver ? driver.name : 'Desconocido';
                byDriver[name] = (byDriver[name] || 0) + 1;
            } else {
                byDriver['Sin Asignar'] = (byDriver['Sin Asignar'] || 0) + 1;
            }
        });

        return { total, delivered, pending, transit, incident, deferred, byCity, byDriver };
    }, [filteredShipments, drivers]);

    // Export to Excel Logic (Dual Export: Header & Lines)
    const handleExportToExcel = () => {
        if (filteredShipments.length === 0) {
            alert("No hay datos para exportar con los filtros actuales.");
            return;
        }

        // 1. Prepare Header Data (Cabecera)
        const headerData = filteredShipments.map(s => {
            const driver = Array.isArray(drivers) ? drivers.find(d => d.id === s.assignedDriverId) : null;
            return {
                'ID Envío': s.id,
                'Cliente': s.client,
                'Origen': s.originCity || s.origin || '',
                'Destino': s.destinationCity || s.destination || '',
                'Fecha': s.date,
                'Estado': s.status,
                'Conductor': driver ? driver.name : 'Sin Asignar',
                'Importe Total': s.amount,
                'Porte': s.porteType || 'Pagado',
                'Observaciones': s.observations || ''
            };
        });

        // 2. Prepare Lines Data (Líneas)
        const linesData = [];
        filteredShipments.forEach(s => {
            if (Array.isArray(s.articles) && s.articles.length > 0) {
                s.articles.forEach(art => {
                    linesData.push({
                        'ID Envío': s.id, // Link to Header
                        'Artículo': art.name,
                        'Descripción': art.description || '',
                        'Cantidad': art.quantity || 1,
                        'Precio Unitario': art.price,
                        'Total Línea': art.totalPrice?.toFixed(2) || art.price
                    });
                });
            } else {
                // If no specific articles, we can create a generic line for the total amount
                linesData.push({
                    'ID Envío': s.id,
                    'Artículo': 'Servicio de Transporte',
                    'Descripción': '',
                    'Cantidad': 1,
                    'Precio Unitario': s.amount?.replace('€', '') || '0',
                    'Total Línea': s.amount?.replace('€', '') || '0'
                });
            }
        });

        // Create Header Workbook
        const wsHeader = utils.json_to_sheet(headerData);
        const wbHeader = utils.book_new();
        utils.book_append_sheet(wbHeader, wsHeader, "Cabecera");
        writeFile(wbHeader, `Cabecera_Albaranes_${new Date().toISOString().split('T')[0]}.xlsx`);

        // Create Lines Workbook
        const wsLines = utils.json_to_sheet(linesData);
        const wbLines = utils.book_new();
        utils.book_append_sheet(wbLines, wsLines, "Líneas");
        writeFile(wbLines, `Lineas_Albaranes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header & Controls */}
            <div className="flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                            <Truck className="text-blue-600" />
                            Gestión de Envíos
                        </h1>
                        <p className="text-slate-500 mt-1">Control logístico y seguimiento en tiempo real</p>
                    </div>

                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                        <button
                            onClick={() => setViewMode('list')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'list' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Listado
                        </button>
                        <button
                            onClick={() => setViewMode('stats')}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${viewMode === 'stats' ? 'bg-blue-50 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            Estadísticas
                        </button>
                    </div>
                </div>

                {/* Filters Bar */}
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                    <div className="md:col-span-4 relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar ID, cliente, ciudad..."
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-medium"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="md:col-span-3">
                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-600 font-medium cursor-pointer"
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                        >
                            <option value="all">Todos los Estados</option>
                            <option value="Pendiente de asignar">Pendiente de asignar</option>
                            <option value="En reparto">En reparto</option>
                            <option value="Entregado">Entregado</option>
                            <option value="Incidencia">Incidencia</option>
                            <option value="Entrega aplazada">Entrega aplazada</option>
                        </select>
                    </div>

                    <div className="md:col-span-3">
                        <select
                            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-600 font-medium cursor-pointer"
                            value={driverFilter}
                            onChange={(e) => setDriverFilter(e.target.value)}
                        >
                            <option value="all">Todos los Conductores</option>
                            <option value="unassigned">Sin Asignar</option>
                            {(drivers || []).map(d => (
                                <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="md:col-span-2 flex gap-2 justify-end">
                        <button
                            onClick={handleExportToExcel}
                            title="Exportar a Excel para Facturación"
                            className="flex items-center justify-center p-2.5 bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-100 transition-colors border border-emerald-200"
                        >
                            <FileText size={20} />
                        </button>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-bold text-sm shadow-lg shadow-blue-500/20"
                        >
                            <Plus size={18} />
                            Nuevo
                        </button>
                    </div>
                </div>
            </div>

            {/* Content View */}
            {viewMode === 'list' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">ID Envío</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Clientes (Rem/Des)</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ruta</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Fecha</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Estado</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Conductor</th>
                                    <th className="px-6 py-4 text-right text-xs font-semibold text-slate-500 uppercase tracking-wider">Valor</th>
                                    <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredShipments.map((shipment) => (
                                    <tr
                                        key={shipment.id}
                                        className="hover:bg-slate-50 transition-colors group cursor-pointer"
                                        onClick={() => {
                                            setSelectedShipment(shipment);
                                            setIsDetailsModalOpen(true);
                                        }}
                                    >
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg group-hover:bg-blue-100 transition-colors">
                                                    <Truck size={16} />
                                                </div>
                                                <span className="font-bold text-slate-900">{shipment.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col">
                                                <span className="text-slate-900 font-bold block text-sm">{shipment.client}</span>
                                                <span className="text-slate-500 font-medium block text-[11px] mt-0.5 flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                    {shipment.destinationName || 'Destinatario'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                    <span className="truncate max-w-[150px]" title={shipment.origin}>{shipment.origin}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-xs text-slate-900 font-medium">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                    <span className="truncate max-w-[150px]" title={shipment.destination}>{shipment.destination}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                                            <div className="flex items-center gap-2">
                                                <Calendar size={14} className="text-slate-400" />
                                                {shipment.date}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border
                                                ${shipment.status === 'En reparto' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                                                    shipment.status === 'Entregado' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                                        shipment.status === 'Pendiente de asignar' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                                            shipment.status === 'Incidencia' ? 'bg-red-50 text-red-700 border-red-100' :
                                                                shipment.status === 'Entrega aplazada' ? 'bg-purple-50 text-purple-700 border-purple-100' :
                                                                    'bg-slate-50 text-slate-700 border-slate-100'}`}>
                                                <span className={`w-1.5 h-1.5 rounded-full
                                                    ${shipment.status === 'En reparto' ? 'bg-blue-500' :
                                                        shipment.status === 'Entregado' ? 'bg-emerald-500' :
                                                            shipment.status === 'Pendiente de asignar' ? 'bg-amber-500' :
                                                                shipment.status === 'Incidencia' ? 'bg-red-500' :
                                                                    shipment.status === 'Entrega aplazada' ? 'bg-purple-500' :
                                                                        'bg-slate-500'}`}></span>
                                                {shipment.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <div className="flex items-center gap-2">
                                                <User size={14} className="text-slate-400" />
                                                <select
                                                    className="bg-transparent text-sm text-slate-700 font-medium border-b border-transparent hover:border-slate-300 focus:border-blue-500 focus:outline-none transition-colors cursor-pointer py-0.5"
                                                    value={shipment.assignedDriverId || ''}
                                                    onClick={(e) => e.stopPropagation()} // Prevent opening details when clicking select
                                                    onChange={(e) => onAssignDriver(shipment.id, e.target.value)}
                                                >
                                                    <option value="">-- Asignar --</option>
                                                    {(drivers || []).map(driver => (
                                                        <option key={driver.id} value={driver.id}>{driver.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-bold text-slate-700">
                                            {shipment.amount}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-center">
                                            <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors">
                                                <MoreVertical size={18} />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredShipments.length === 0 && (
                                    <tr>
                                        <td colSpan="8" className="text-center py-12">
                                            <div className="bg-slate-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-300">
                                                <Search size={32} />
                                            </div>
                                            <h3 className="text-lg font-medium text-slate-900">No se encontraron envíos</h3>
                                            <p className="text-slate-500 mt-1">Prueba a ajustar los filtros o términos de búsqueda.</p>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {/* Pagination Mockup */}
                    <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
                        <span>Mostrando {filteredShipments.length} envíos</span>
                        <div className="flex gap-2">
                            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-50" disabled>Anterior</button>
                            <button className="px-3 py-1 border border-slate-200 rounded hover:bg-white disabled:opacity-50" disabled>Siguiente</button>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                                    <Truck size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Total</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.total}</div>
                            <div className="text-xs text-slate-500 mt-1">Envíos registrados</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
                                    <CheckCircle size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Entregados</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.delivered}</div>
                            <div className="text-xs text-emerald-600 mt-1 font-medium">{Math.round((stats.delivered / stats.total) * 100) || 0}% Completado</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                                    <Clock size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Pendientes</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.pending}</div>
                            <div className="text-xs text-amber-600 mt-1 font-medium">Requieren atención</div>
                        </div>
                        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-100">
                            <div className="flex justify-between items-start mb-2">
                                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                                    <AlertCircle size={20} />
                                </div>
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">En Ruta</span>
                            </div>
                            <div className="text-3xl font-bold text-slate-800">{stats.transit}</div>
                            <div className="text-xs text-purple-600 mt-1 font-medium">Activos ahora</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Stats by City */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <MapPin size={18} className="text-blue-500" />
                                Envíos por Población Destino
                            </h3>
                            <div className="space-y-4">
                                {Object.entries(stats.byCity)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([city, count]) => (
                                        <div key={city}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{city}</span>
                                                <span className="text-slate-500">{count} envíos</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div
                                                    className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>

                        {/* Stats by Driver */}
                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                            <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                                <User size={18} className="text-purple-500" />
                                Carga de Trabajo por Conductor
                            </h3>
                            <div className="space-y-4">
                                {Object.entries(stats.byDriver)
                                    .sort(([, a], [, b]) => b - a)
                                    .slice(0, 5)
                                    .map(([name, count]) => (
                                        <div key={name}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{name}</span>
                                                <span className="text-slate-500">{count} envíos</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-2">
                                                <div
                                                    className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                                                    style={{ width: `${(count / stats.total) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => setIsDetailsModalOpen(false)}
                shipment={selectedShipment}
                onUpdate={onUpdateShipment}
            />

            <CreateShipmentModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onCreateShipment}
                drivers={drivers}
                clients={clients}
                onAddClient={onAddClient}
                tariffs={tariffs}
            />
        </div>
    );
}
