import { useState, useMemo, useRef } from 'react';
import {
    Wrench, Droplets, Circle, CheckCircle, AlertTriangle, Clock,
    Euro, Truck, Filter, Download, ChevronDown, ChevronUp,
    Trash2, Camera, X, Search, CalendarRange, FileText
} from 'lucide-react';
import BrandLogo from '../components/fleet/BrandLogo';
import MaintenanceIcon, { getMaintenanceConfig } from '../components/fleet/MaintenanceIcon';
import { compressImage, esImagenComprimible } from '../utils/imageCompression';
import CameraCaptureModal from '../components/CameraCaptureModal';

const MAINTENANCE_TYPES = [
    { value: 'Aceite',    label: 'Cambio de Aceite',        icon: Droplets,     color: 'text-amber-500 bg-amber-50 border-amber-200' },
    { value: 'Correa',    label: 'Correa Distribución',     icon: Circle,       color: 'text-red-500 bg-red-50 border-red-200' },
    { value: 'Ruedas',    label: 'Neumáticos / Ruedas',     icon: Circle,       color: 'text-slate-500 bg-slate-100 border-slate-200' },
    { value: 'Reparación',label: 'Reparación / Avería',     icon: Wrench,       color: 'text-red-500 bg-red-50 border-red-200' },
    { value: 'Filtro Aire',label: 'Filtro de Aire',         icon: Wrench,       color: 'text-sky-500 bg-sky-50 border-sky-200' },
    { value: 'Filtro Gasoil',label: 'Filtro de Gasoil',     icon: Droplets,     color: 'text-cyan-500 bg-cyan-50 border-cyan-200' },
    { value: 'Filtro Aceite',label: 'Filtro de Aceite',     icon: Droplets,     color: 'text-yellow-600 bg-yellow-50 border-yellow-200' },
    { value: 'Filtros',   label: 'Otros Filtros',           icon: Wrench,       color: 'text-blue-500 bg-blue-50 border-blue-200' },
    { value: 'Frenos',    label: 'Frenos (General)',        icon: Wrench,       color: 'text-orange-500 bg-orange-50 border-orange-200' },
    { value: 'Zapata Frenos', label: 'Zapata de Freno',     icon: Wrench,       color: 'text-orange-600 bg-orange-100 border-orange-300' },
    { value: 'Pastillas Delanteras', label: 'Pastillas Delanteras', icon: Wrench, color: 'text-orange-500 bg-orange-50 border-orange-200' },
    { value: 'Pastillas Traseras', label: 'Pastillas Traseras', icon: Wrench,   color: 'text-orange-500 bg-orange-50 border-orange-200' },
    { value: 'Discos Delanteros', label: 'Discos Delanteros', icon: Circle,    color: 'text-slate-600 bg-slate-100 border-slate-300' },
    { value: 'Discos Traseros', label: 'Discos Traseros',   icon: Circle,      color: 'text-slate-500 bg-slate-50 border-slate-200' },
    { value: 'Revisión',  label: 'Revisión General',        icon: CheckCircle,  color: 'text-emerald-500 bg-emerald-50 border-emerald-200' },
    { value: 'Otro',      label: 'Otro',                    icon: Wrench,       color: 'text-purple-500 bg-purple-50 border-purple-200' },
];

function getTypeConfig(val) {
    return MAINTENANCE_TYPES.find(t => t.value === val) || MAINTENANCE_TYPES[MAINTENANCE_TYPES.length - 1];
}

function getKmAlertStatus(log, currentOdometer) {
    if (!log.alertAtKm || !currentOdometer) return null;
    const remaining = parseInt(log.alertAtKm) - parseInt(currentOdometer);
    if (remaining <= 0)    return { label: '¡KM SUPERADOS!',             color: 'text-red-600 bg-red-50 border-red-200',     icon: 'critical' };
    if (remaining <= 1000) return { label: `${remaining} km para alerta`, color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'warning' };
    if (remaining <= 3000) return { label: `${remaining} km para alerta`, color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: 'notice' };
    return null;
}

export default function MaintenanceHistory({ vehicles = [], onUpdateVehicle, onNavigateToFleet }) {
    const [filterVehicle, setFilterVehicle] = useState('all');
    const [filterType, setFilterType]       = useState('all');
    const [filterFrom, setFilterFrom]       = useState('');
    const [filterTo, setFilterTo]           = useState('');
    const [search, setSearch]               = useState('');
    const [sortKey, setSortKey]             = useState('date');
    const [sortDir, setSortDir]             = useState('desc');
    const [expandedId, setExpandedId]       = useState(null);
    const [viewingPhoto, setViewingPhoto]   = useState(null);
    const photoInputRefs = useRef({});

    // Flatten all maintenance logs from all vehicles
    const allLogs = useMemo(() => {
        const rows = [];
        vehicles.forEach(v => {
            (v.maintenanceLogs || []).forEach(log => {
                rows.push({ ...log, vehicleId: v.id, vehicleModel: v.model, currentOdometer: v.currentOdometer });
            });
        });
        return rows;
    }, [vehicles]);

    // Apply filters
    const filtered = useMemo(() => {
        let rows = allLogs;
        if (filterVehicle !== 'all') rows = rows.filter(r => r.vehicleId === filterVehicle);
        if (filterType !== 'all')    rows = rows.filter(r => r.type === filterType);
        if (filterFrom)              rows = rows.filter(r => r.date >= filterFrom);
        if (filterTo)                rows = rows.filter(r => r.date <= filterTo);
        if (search) {
            const q = search.toLowerCase();
            rows = rows.filter(r =>
                r.vehicleId.toLowerCase().includes(q) ||
                (r.notes || '').toLowerCase().includes(q) ||
                (r.workshop || '').toLowerCase().includes(q) ||
                getTypeConfig(r.type).label.toLowerCase().includes(q)
            );
        }
        // Sort
        rows = [...rows].sort((a, b) => {
            let av, bv;
            if (sortKey === 'date')    { av = a.date || ''; bv = b.date || ''; }
            else if (sortKey === 'km') { av = parseInt(a.km || 0); bv = parseInt(b.km || 0); }
            else if (sortKey === 'cost'){ av = parseFloat(a.cost || 0); bv = parseFloat(b.cost || 0); }
            else if (sortKey === 'vehicle') { av = a.vehicleId; bv = b.vehicleId; }
            else { av = a.date || ''; bv = b.date || ''; }
            if (av < bv) return sortDir === 'asc' ? -1 : 1;
            if (av > bv) return sortDir === 'asc' ? 1 : -1;
            return 0;
        });
        return rows;
    }, [allLogs, filterVehicle, filterType, filterFrom, filterTo, search, sortKey, sortDir]);

    // Stats
    const stats = useMemo(() => {
        const total = filtered.reduce((s, r) => s + parseFloat(r.cost || 0), 0);
        const byType = {};
        filtered.forEach(r => { byType[r.type] = (byType[r.type] || 0) + 1; });
        const topType = Object.entries(byType).sort((a, b) => b[1] - a[1])[0];
        const alerts  = allLogs.filter(r => {
            const s = getKmAlertStatus(r, r.currentOdometer);
            return s?.icon === 'critical' || s?.icon === 'warning';
        }).length;
        return { total, count: filtered.length, topType: topType ? getTypeConfig(topType[0]).label : '—', alerts };
    }, [filtered, allLogs]);

    const toggleSort = (key) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const SortIcon = ({ col }) => {
        if (sortKey !== col) return <ChevronDown size={12} className="text-slate-300" />;
        return sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />;
    };

    // Handle invoice photo
    // Foto hecha dentro de la app (sin ceder el turno a la cámara del móvil).
    const [camaraDestino, setCamaraDestino] = useState(null); // { vehicleId, logId }

    const guardarFotoDeCamara = (dataUrl) => {
        const { vehicleId, logId } = camaraDestino || {};
        setCamaraDestino(null);
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const updatedLogs = (vehicle.maintenanceLogs || []).map(l =>
            l.id === logId ? { ...l, invoicePhoto: dataUrl } : l
        );
        onUpdateVehicle && onUpdateVehicle(vehicleId, { maintenanceLogs: updatedLogs });
    };

    const handlePhotoUpload = async (vehicleId, logId, e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        // El límite de 4 MB era para que la foto cupiera en la ficha. Ahora la foto se
        // encoge antes, así que entra cualquier foto de móvil (los PDF siguen igual).
        if (!esImagenComprimible(file) && file.size > 4 * 1024 * 1024) {
            alert('Archivo demasiado grande. Límite: 4MB.'); return;
        }
        if (file.size > 20 * 1024 * 1024) { alert('Archivo demasiado grande. Límite: 20MB.'); return; }
        try {
            const dataUrl = esImagenComprimible(file)
                ? await compressImage(file, 1600, 1600, 0.75)
                : await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => resolve(ev.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            const vehicle = vehicles.find(v => v.id === vehicleId);
            if (!vehicle) return;
            const updatedLogs = (vehicle.maintenanceLogs || []).map(l =>
                l.id === logId ? { ...l, invoicePhoto: dataUrl } : l
            );
            onUpdateVehicle && onUpdateVehicle(vehicleId, { maintenanceLogs: updatedLogs });
        } catch (err) {
            console.error('[Factura taller] No se pudo procesar el archivo:', err);
            alert('No se ha podido procesar el archivo. Vuelve a intentarlo.');
        }
    };

    const handleDeletePhoto = (vehicleId, logId) => {
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const updatedLogs = (vehicle.maintenanceLogs || []).map(l =>
            l.id === logId ? { ...l, invoicePhoto: null } : l
        );
        onUpdateVehicle && onUpdateVehicle(vehicleId, { maintenanceLogs: updatedLogs });
    };

    const handleDeleteLog = (vehicleId, logId) => {
        if (!window.confirm('¿Eliminar este registro?')) return;
        const vehicle = vehicles.find(v => v.id === vehicleId);
        if (!vehicle) return;
        const updatedLogs = (vehicle.maintenanceLogs || []).filter(l => l.id !== logId);
        onUpdateVehicle && onUpdateVehicle(vehicleId, { maintenanceLogs: updatedLogs });
    };

    // Export CSV
    const handleExportCSV = () => {
        const headers = ['Vehículo', 'Modelo', 'Tipo', 'Fecha', 'Km', 'Coste (€)', 'Próx. Km', 'Alerta Km', 'Taller', 'Notas'];
        const rows = filtered.map(r => [
            r.vehicleId, r.vehicleModel || '', getTypeConfig(r.type).label,
            r.date || '', r.km || '', r.cost || '', r.nextKm || '', r.alertAtKm || '',
            r.workshop || '', r.notes || ''
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';'));
        const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url;
        a.download = `mantenimiento_flota_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    };

    const clearFilters = () => {
        setFilterVehicle('all'); setFilterType('all');
        setFilterFrom(''); setFilterTo(''); setSearch('');
    };
    const hasActiveFilters = filterVehicle !== 'all' || filterType !== 'all' || filterFrom || filterTo || search;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-3">
                            <div className="p-2 bg-orange-100 rounded-xl text-orange-600"><Wrench size={24} /></div>
                            Historial de Mantenimiento
                        </h2>
                        <p className="text-slate-500 text-sm mt-1">Todos los registros de revisiones y cambios de toda la flota</p>
                    </div>
                    <div className="flex gap-2">
                        {onNavigateToFleet && (
                            <button onClick={onNavigateToFleet}
                                className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium text-sm transition-colors">
                                <Truck size={16} /> Ver Flota
                            </button>
                        )}
                        <button onClick={handleExportCSV}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm transition-colors shadow-sm">
                            <Download size={16} /> Exportar CSV
                        </button>
                    </div>
                </div>

                {/* Stats row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                        <p className="text-2xl font-bold text-blue-700">{stats.count}</p>
                        <p className="text-xs font-medium text-blue-500 mt-0.5">Registros (filtro actual)</p>
                    </div>
                    <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                        <p className="text-2xl font-bold text-emerald-700">€{stats.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-xs font-medium text-emerald-500 mt-0.5">Coste Total (sin IVA)</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                        <p className="text-sm font-bold text-amber-700 truncate">{stats.topType}</p>
                        <p className="text-xs font-medium text-amber-500 mt-0.5">Servicio más frecuente</p>
                    </div>
                    <div className={`rounded-xl p-4 border ${stats.alerts > 0 ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
                        <p className={`text-2xl font-bold ${stats.alerts > 0 ? 'text-red-600' : 'text-slate-500'}`}>{stats.alerts}</p>
                        <p className={`text-xs font-medium mt-0.5 ${stats.alerts > 0 ? 'text-red-400' : 'text-slate-400'}`}>Alertas km activas</p>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                    {/* Search */}
                    <div className="relative lg:col-span-2">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar vehículo, taller, notas..."
                            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>
                    {/* Vehicle filter */}
                    <select value={filterVehicle} onChange={e => setFilterVehicle(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="all">🚛 Todos los vehículos</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.id} — {v.model}</option>)}
                    </select>
                    {/* Type filter */}
                    <select value={filterType} onChange={e => setFilterType(e.target.value)}
                        className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                        <option value="all">🔧 Todos los tipos</option>
                        {MAINTENANCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    {/* Date range */}
                    <div className="flex items-center gap-2">
                        <CalendarRange size={16} className="text-slate-400 shrink-0" />
                        <input type="date" value={filterFrom} onChange={e => setFilterFrom(e.target.value)}
                            className="flex-1 min-w-0 border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                        <span className="text-slate-400 shrink-0">—</span>
                        <input type="date" value={filterTo} onChange={e => setFilterTo(e.target.value)}
                            className="flex-1 min-w-0 border border-slate-200 rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                </div>
                {hasActiveFilters && (
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs text-slate-500">Filtros activos</span>
                        <button onClick={clearFilters}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium bg-blue-50 px-2 py-1 rounded-lg border border-blue-200 transition-colors">
                            <X size={12} /> Limpiar filtros
                        </button>
                    </div>
                )}
            </div>

            {/* Table */}
            {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl shadow-sm border-2 border-dashed border-slate-200 p-16 text-center">
                    <div className="bg-slate-100 p-5 rounded-full inline-flex mb-4 text-slate-400"><Wrench size={36} /></div>
                    <p className="text-slate-600 font-semibold text-lg">Sin registros de mantenimiento</p>
                    <p className="text-slate-400 text-sm mt-2">
                        {hasActiveFilters ? 'No hay registros que coincidan con los filtros aplicados.' : 'Añade el primer registro desde la ficha de un vehículo en la sección Flota.'}
                    </p>
                    {onNavigateToFleet && (
                        <button onClick={onNavigateToFleet}
                            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-medium text-sm hover:bg-blue-700 transition-colors">
                            <Truck size={16} /> Ir a Flota
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                    {/* Table header */}
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-4 py-3 text-left">
                                        <button onClick={() => toggleSort('vehicle')} className="flex items-center gap-1 font-bold text-slate-600 uppercase text-xs tracking-wider hover:text-blue-600">
                                            Vehículo <SortIcon col="vehicle" />
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase text-xs tracking-wider">Tipo</th>
                                    <th className="px-4 py-3 text-left">
                                        <button onClick={() => toggleSort('date')} className="flex items-center gap-1 font-bold text-slate-600 uppercase text-xs tracking-wider hover:text-blue-600">
                                            Fecha <SortIcon col="date" />
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                        <button onClick={() => toggleSort('km')} className="flex items-center gap-1 font-bold text-slate-600 uppercase text-xs tracking-wider hover:text-blue-600 ml-auto">
                                            Km <SortIcon col="km" />
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-right">
                                        <button onClick={() => toggleSort('cost')} className="flex items-center gap-1 font-bold text-slate-600 uppercase text-xs tracking-wider hover:text-blue-600 ml-auto">
                                            Coste (sin IVA) <SortIcon col="cost" />
                                        </button>
                                    </th>
                                    <th className="px-4 py-3 text-left font-bold text-slate-600 uppercase text-xs tracking-wider">Taller</th>
                                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase text-xs tracking-wider">Alerta</th>
                                    <th className="px-4 py-3 text-center font-bold text-slate-600 uppercase text-xs tracking-wider">Factura</th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filtered.map((row) => {
                                    const tc = getTypeConfig(row.type);

                                    const kmStatus = getKmAlertStatus(row, row.currentOdometer);
                                    const isExpanded = expandedId === `${row.vehicleId}-${row.id}`;
                                    const rowKey = `${row.vehicleId}-${row.id}`;

                                    return (
                                        <>
                                            <tr
                                                key={rowKey}
                                                onClick={() => setExpandedId(isExpanded ? null : rowKey)}
                                                className={`hover:bg-slate-50 cursor-pointer transition-colors ${kmStatus?.icon === 'critical' ? 'bg-red-50/40' : kmStatus?.icon === 'warning' ? 'bg-amber-50/40' : ''}`}
                                            >
                                                {/* Vehicle */}
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <BrandLogo model={row.vehicleModel} size={32} />
                                                        <div>
                                                            <p className="font-bold text-slate-800 text-xs">{row.vehicleId}</p>
                                                            <p className="text-slate-400 text-[10px]">{row.vehicleModel}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                {/* Type */}
                                                <td className="px-4 py-3">
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold ${tc.color}`}>
                                                        <MaintenanceIcon type={row.type} size={14} /> {tc.label}
                                                    </span>
                                                </td>
                                                {/* Date */}
                                                <td className="px-4 py-3 text-slate-600 font-medium text-xs">
                                                    {row.date ? new Date(row.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                                                </td>
                                                {/* Km */}
                                                <td className="px-4 py-3 text-right">
                                                    {row.km ? (
                                                        <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                                                            {parseInt(row.km).toLocaleString('es-ES')} km
                                                        </span>
                                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                                {/* Cost */}
                                                <td className="px-4 py-3 text-right">
                                                    {row.cost ? (
                                                        <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 inline-flex items-center gap-0.5">
                                                            <Euro size={10} />{parseFloat(row.cost).toFixed(2)}
                                                        </span>
                                                    ) : <span className="text-slate-300 text-xs">—</span>}
                                                </td>
                                                {/* Workshop */}
                                                <td className="px-4 py-3 text-slate-600 text-xs max-w-[130px] truncate">
                                                    {row.workshop || <span className="text-slate-300">—</span>}
                                                </td>
                                                {/* Alert */}
                                                <td className="px-4 py-3 text-center">
                                                    {kmStatus ? (
                                                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${kmStatus.color}`}>
                                                            {kmStatus.icon === 'critical' ? <AlertTriangle size={9} /> : <Clock size={9} />}
                                                            {kmStatus.icon === 'critical' ? 'KM!' : 'Próx.'}
                                                        </span>
                                                    ) : row.alertAtKm ? (
                                                        <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 font-bold">✓ OK</span>
                                                    ) : <span className="text-slate-200 text-xs">—</span>}
                                                </td>
                                                {/* Invoice photo */}
                                                <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                                                    {row.invoicePhoto ? (
                                                        <button
                                                            onClick={() => setViewingPhoto(row.invoicePhoto)}
                                                            className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 hover:bg-blue-100 transition-colors"
                                                        >
                                                            <Camera size={10} /> Ver
                                                        </button>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setCamaraDestino({ vehicleId: row.vehicleId, logId: row.id })}
                                                                className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200 hover:border-blue-300 hover:text-blue-500 transition-colors"
                                                            >
                                                                <Camera size={10} /> Foto
                                                            </button>
                                                            <label className="cursor-pointer inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200 hover:border-blue-300 hover:text-blue-500 transition-colors">
                                                                <FileText size={10} /> Archivo
                                                                <input
                                                                    type="file" className="hidden"
                                                                    accept="image/*,.pdf"
                                                                    ref={el => photoInputRefs.current[rowKey] = el}
                                                                    onChange={e => handlePhotoUpload(row.vehicleId, row.id, e)}
                                                                />
                                                            </label>
                                                        </span>
                                                    )}
                                                </td>
                                                {/* Actions */}
                                                <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => handleDeleteLog(row.vehicleId, row.id)}
                                                        className="p-1.5 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Eliminar registro"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>

                                            {/* Expanded row */}
                                            {isExpanded && (
                                                <tr key={`${rowKey}-expanded`} className="bg-slate-50/80">
                                                    <td colSpan={9} className="px-6 py-4">
                                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                                            {row.notes && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Notas</p>
                                                                    <p className="text-slate-600 italic text-xs">"{row.notes}"</p>
                                                                </div>
                                                            )}
                                                            {row.nextKm && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Próximo cambio referencia</p>
                                                                    <p className="text-blue-600 font-bold text-xs">📍 {parseInt(row.nextKm).toLocaleString('es-ES')} km</p>
                                                                </div>
                                                            )}
                                                            {row.alertAtKm && (
                                                                <div>
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Alerta configurada</p>
                                                                    <p className="text-amber-600 font-bold text-xs">🔔 {parseInt(row.alertAtKm).toLocaleString('es-ES')} km</p>
                                                                    {kmStatus && (
                                                                        <span className={`inline-flex items-center gap-1 mt-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${kmStatus.color}`}>
                                                                            {kmStatus.label}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            )}
                                                            {row.invoicePhoto && (
                                                                <div className="md:col-span-3 flex items-center gap-3">
                                                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Factura adjunta:</p>
                                                                    <button onClick={() => setViewingPhoto(row.invoicePhoto)}
                                                                        className="text-xs text-blue-600 font-bold hover:underline flex items-center gap-1">
                                                                        <Camera size={12} /> Ver factura
                                                                    </button>
                                                                    <button onClick={() => handleDeletePhoto(row.vehicleId, row.id)}
                                                                        className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                                                                        <Trash2 size={12} /> Eliminar foto
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Footer */}
                    <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex justify-between items-center text-xs text-slate-500">
                        <span>{filtered.length} registro{filtered.length !== 1 ? 's' : ''} mostrados</span>
                        <span className="font-bold">Total filtrado: €{stats.total.toLocaleString('es-ES', { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            )}

            {/* Photo viewer modal */}
            {viewingPhoto && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
                    onClick={() => setViewingPhoto(null)}>
                    <div className="relative max-w-3xl max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
                        <button onClick={() => setViewingPhoto(null)}
                            className="absolute -top-4 -right-4 bg-white text-slate-700 hover:text-red-500 rounded-full p-2 shadow-lg z-10 transition-colors">
                            <X size={20} />
                        </button>
                        <img src={viewingPhoto} alt="Factura" className="max-w-full max-h-[85vh] object-contain rounded-xl shadow-2xl" />
                        <a href={viewingPhoto} download="factura_mantenimiento.jpg"
                            className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-white text-slate-700 rounded-xl font-medium text-sm shadow hover:bg-slate-50 transition-colors">
                            <Download size={14} /> Descargar
                        </a>
                    </div>
                </div>
            )}

            <CameraCaptureModal
                isOpen={camaraDestino !== null}
                onClose={() => setCamaraDestino(null)}
                onCapture={guardarFotoDeCamara}
                titulo="Factura del taller"
                maxLado={1600}
                calidad={0.75}
            />
        </div>
    );
}
