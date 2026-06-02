import { X, Truck, Phone, MapPin, Package, Clock, Euro, Wallet, Calendar, CheckCircle, AlertTriangle, Edit2, Save, Eye, EyeOff, Key, BarChart2, TrendingUp, Target, Activity, Printer, Sun, Moon, FileText, Trash2, Download } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';
import { calculateDailyAccount, isToday } from '../../utils/accountLogic';
import { generateCashReportPDF } from '../../utils/cashReportPdf';
import ShipmentDetailsModal from '../shipments/ShipmentDetailsModal';
import { RUTAS_MAESTRAS } from '../../data/rutas';

export default function DriverProfileModal({ isOpen, onClose, driver, shipments, clients, onUpdateDriver, isGhostModeUnlocked, routes, onUpdateRoutes }) {
    const [isEditing, setIsEditing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({});
    const [selectedDateStr, setSelectedDateStr] = useState(new Date().toISOString().split('T')[0]);
    const [activeTab, setActiveTab] = useState('actividad'); // 'actividad' | 'estadisticas'
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
    const [morningInput, setMorningInput] = useState('');
    const activeRoutes = routes && routes.length > 0 ? routes : RUTAS_MAESTRAS;
    const [afternoonInput, setAfternoonInput] = useState('');

    useEffect(() => {
        if (driver && isOpen) {
            setFormData({
                name: driver.name || '',
                alias: driver.alias || '',
                phone: driver.phone || '',
                username: driver.username || '',
                password: driver.password || '',
                routeId: driver.routeId || '',
                morningTowns: driver.morningTowns || [],
                afternoonTowns: driver.afternoonTowns || [],
                isTestMode: driver.isTestMode || false,
                isActive: driver.isActive !== false,
                signaturePinHash: driver.signaturePinHash || null,
            });
            setIsEditing(false);
            setShowPassword(false);
            setSelectedDateStr(new Date().toISOString().split('T')[0]);
            setActiveTab('actividad');
        }
    }, [driver, isOpen]);

    const handleSave = () => {
        if (onUpdateDriver) {
            onUpdateDriver(driver.id, formData);
        }
        setIsEditing(false);
    };

    const handleDeletePayroll = async (payrollToDelete) => {
        if (!window.confirm(`¿Estás seguro de que deseas desasignar y ocultar "${payrollToDelete.fileName}"?`)) return;
        const newPayrolls = (driver.payrolls || []).filter(p => p.url !== payrollToDelete.url);
        if (onUpdateDriver) {
            await onUpdateDriver(driver.id, { ...driver, payrolls: newPayrolls });
        }
    };

    // Filter shipments for this driver and today (for route view) and relevant calculations
    const driverStats = useMemo(() => {
        if (!driver) return { todayCount: 0, delivered: 0, pending: 0, cash: 0, route: [] };

        const targetDate = new Date(selectedDateStr);

        const driverShipments = (shipments || []).filter(s =>
            (s.assignedDriverId === driver.id)
        );

        const targetDateShipments = driverShipments.filter(s => isToday(s.date, targetDate) || isToday(s.updatedAt, targetDate) || isToday(s.paidAt, targetDate) || isToday(s.date_created, targetDate));
        
        const deliveredToday = targetDateShipments.filter(s => s.status === 'Entregado').length;
        const pendingToday = targetDateShipments.filter(s => s.status !== 'Entregado').length;

        // --- ACCOUNTING LOGIC (Mirrors DriverDashboard exactly) ---
        const accountResult = calculateDailyAccount({
            allShipments: shipments, // Need entire shipments context for createdById checks
            driverId: driver.id,
            clients: clients || [],
            collectedCollections: [], // Admin doesn't see ephemeral collections
            targetDate: targetDate
        });

        return {
            todayCount: targetDateShipments.length,
            delivered: deliveredToday,
            pending: pendingToday,
            cash: accountResult.dailyTotal || 0,
            route: targetDateShipments,
            account: accountResult
        };
    }, [driver, shipments, clients, selectedDateStr]);

    // --- ALL-TIME GLOBAL STATS ---
    const globalStats = useMemo(() => {
        if (!driver) return {};
        const all = (shipments || []).filter(s => s.assignedDriverId === driver.id);
        const total = all.length;
        const delivered = all.filter(s => s.status === 'Entregado');
        const incidents = all.filter(s => s.status === 'Incidencia');
        const pending = all.filter(s => ['Pendiente de asignar', 'Entrega aplazada', 'En reparto'].includes(s.status));

        // Average delivery time in hours (between createdAt/date and paidAt/updatedAt)
        const deliveryTimes = delivered
            .map(s => {
                const start = s.createdAt ? new Date(s.createdAt) : (s.date ? new Date(s.date) : null);
                const end = s.paidAt ? new Date(s.paidAt) : (s.updatedAt ? new Date(s.updatedAt) : null);
                if (start && end && end > start) return (end - start) / 3600000;
                return null;
            })
            .filter(Boolean);
        const avgDeliveryHours = deliveryTimes.length
            ? (deliveryTimes.reduce((a, b) => a + b, 0) / deliveryTimes.length).toFixed(1)
            : null;

        // Total revenue (portes) ever
        const parseAmount = v => parseFloat(String(v || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) || 0;
        const totalRevenue = all.reduce((s, sh) => s + parseAmount(sh.amount), 0);
        
        // Revenue this month
        const now = new Date();
        const thisMonth = all.filter(s => {
            const d = s.paidAt ? new Date(s.paidAt) : (s.updatedAt ? new Date(s.updatedAt) : null);
            return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
        const monthlyRevenue = thisMonth.reduce((s, sh) => s + parseAmount(sh.amount), 0);

        // Top destinations
        const cityCounts = {};
        all.forEach(s => {
            const city = s.destinationCity || (s.destination || '').split(',')[0].trim() || 'Desconocido';
            cityCounts[city] = (cityCounts[city] || 0) + 1;
        });
        const topCities = Object.entries(cityCounts).sort(([,a],[,b]) => b - a).slice(0, 5);

        return {
            total,
            deliveredCount: delivered.length,
            incidentsCount: incidents.length,
            pendingCount: pending.length,
            deliveryRate: total > 0 ? ((delivered.length / total) * 100).toFixed(1) : 0,
            incidentRate: total > 0 ? ((incidents.length / total) * 100).toFixed(1) : 0,
            avgDeliveryHours,
            totalRevenue,
            monthlyRevenue,
            topCities,
        };
    }, [driver, shipments]);

    if (!isOpen || !driver) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-50 border-b border-slate-100 p-6 flex justify-between items-start">
                    <div className="flex items-center gap-4 w-full">
                        <div className="w-16 h-16 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold shrink-0">
                            {driver.name.charAt(0)}
                        </div>
                        <div className="flex-1">
                            {isEditing ? (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="font-bold text-slate-800 text-xl border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-1/2"
                                        placeholder="Nombre del Conductor"
                                    />
                                    <input
                                        type="text"
                                        value={formData.alias}
                                        onChange={(e) => setFormData({ ...formData, alias: e.target.value })}
                                        className="font-semibold text-slate-600 text-md border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-1/2 mt-2"
                                        placeholder="Alias (Opcional)"
                                    />
                                    <div className="flex items-center gap-2 mt-2">
                                        <Phone size={14} className="text-slate-400" />
                                        <input
                                            type="text"
                                            value={formData.phone}
                                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                            className="text-sm text-slate-600 border border-blue-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full md:w-1/3"
                                            placeholder="Teléfono"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <h2 className="text-xl font-bold text-slate-800">
                                        {driver.name} {driver.alias && <span className="text-slate-400 text-lg font-medium">({driver.alias})</span>}
                                    </h2>
                                    <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                                        <Phone size={14} /> {driver.phone}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${driver.status === 'En Ruta' ? 'bg-blue-100 text-blue-700' :
                                            driver.status === 'Descanso' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                                            }`}>
                                            {driver.status}
                                        </span>
                                        <span className="text-xs text-slate-400">ID: {driver.id}</span>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <>
                                <button onClick={() => setIsEditing(false)} className="px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
                                    Cancelar
                                </button>
                                <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors shadow-sm">
                                    <Save size={16} /> Guardar
                                </button>
                            </>
                        ) : (
                            <button onClick={() => setIsEditing(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors">
                                <Edit2 size={16} /> Editar
                            </button>
                        )}
                        <button onClick={onClose} className="p-2 ml-2 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="bg-slate-50 border-b border-slate-100 px-6 flex gap-1">
                    {[['actividad', Package, 'Actividad'], ['estadisticas', BarChart2, 'Estadísticas'], ['nominas', FileText, 'Nóminas']].map(([tab, Icon, label]) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors -mb-px ${
                                activeTab === tab
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Icon size={14} />{label}
                        </button>
                    ))}
                </div>

                <div className="overflow-y-auto flex-1 custom-scrollbar">

                    {/* ====== ACTIVIDAD TAB ====== */}
                    {activeTab === 'actividad' && (
                    <div className="p-6 space-y-6">

                    {/* Credentials Section (Visible when editing) */}
                    {isEditing && (
                        <div className="mb-8 bg-blue-50/50 p-5 rounded-xl border border-blue-100 animate-in fade-in">
                            <h3 className="text-sm font-bold text-blue-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Key size={16} />
                                Credenciales de Acceso
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Usuario</label>
                                    <input
                                        type="text"
                                        value={formData.username}
                                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                        placeholder="Ej: conductor1"
                                    />
                                </div>
                                <div className="relative">
                                    <label className="block text-xs font-bold text-slate-600 mb-1">Contraseña</label>
                                    <div className="flex items-center">
                                        <input
                                            type={showPassword ? "text" : "password"}
                                            value={formData.password}
                                            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 pr-10"
                                            placeholder="Contraseña"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPassword(!showPassword)}
                                            className="absolute right-3 text-slate-400 hover:text-slate-600 mt-1"
                                        >
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                            
                            {/* PIN de Firma Section */}
                            <div className="mt-4 pt-4 border-t border-blue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-100">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">PIN de Firma Digital (Horas)</label>
                                    <div className="flex items-center gap-2">
                                        {formData.signaturePinHash ? (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded-full">
                                                <CheckCircle size={12} className="text-emerald-500" /> CONFIGURADO (Encriptado)
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-500 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-full">
                                                ⚪ PENDIENTE DE CONFIGURAR
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {formData.signaturePinHash && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (window.confirm("¿Estás seguro de que deseas restablecer el PIN de Firma de este conductor?\n\nEsto borrará el PIN actual y le obligará a configurar un nuevo PIN de 4 dígitos la próxima vez que vaya a firmar su jornada desde su móvil.")) {
                                                setFormData({ ...formData, signaturePinHash: null });
                                            }
                                        }}
                                        className="sm:self-end bg-red-50 hover:bg-red-100 text-red-600 border border-red-100 hover:text-red-700 px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all active:scale-95 flex items-center gap-1.5 shadow-sm"
                                    >
                                        <Trash2 size={12} /> Restablecer PIN de Firma
                                    </button>
                                )}
                            </div>

                            <div className="mt-6 pt-4 border-t border-blue-200">
                                <label className="block text-xs font-bold text-blue-800 mb-2 flex items-center gap-1">
                                    <MapPin size={12} /> Ruta Asignada
                                </label>
                                {(() => {
                                    const assignedRoute = (routes || []).find(r => String(r.conductorId) === String(driver.id));
                                    if (assignedRoute) {
                                        return (
                                            <div className="bg-white border border-blue-100 rounded-lg p-3 text-sm flex justify-between items-center">
                                                <span className="font-bold text-slate-700">{assignedRoute.nombre}</span>
                                                <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Gestionado en Panel de Rutas</span>
                                            </div>
                                        );
                                    }
                                    return (
                                        <div className="bg-slate-50 border border-dashed border-slate-200 rounded-lg p-3 text-sm text-slate-500 italic">
                                            Sin ruta fija. Asígnale una desde el Gestor de Rutas.
                                        </div>
                                    );
                                })()}
                            </div>

                            <div className="mt-6 pt-4 border-t border-blue-200 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isTestMode}
                                            onChange={(e) => setFormData({ ...formData, isTestMode: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                                    </div>
                                    <div>
                                        <span className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            Modo Pruebas
                                            {formData.isTestMode && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>}
                                        </span>
                                        <p className="text-[10px] text-slate-500">
                                            🛡️ Sandbox completo: el conductor ve todo normal pero <strong>NADA se guarda</strong>.
                                        </p>
                                    </div>
                                </label>

                                <label className="flex items-center gap-3 cursor-pointer group">
                                    <div className="relative inline-flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                            className="sr-only peer"
                                        />
                                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-green-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                                    </div>
                                    <div>
                                        <span className={`text-sm font-bold flex items-center gap-2 ${formData.isActive ? 'text-green-600' : 'text-red-500'}`}>
                                            {formData.isActive ? 'Conductor Activo' : 'Dado de Baja'}
                                            {!formData.isActive && <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>}
                                        </span>
                                        <p className="text-[10px] text-slate-500">
                                            {!formData.isActive ? '🚫 Oculto en desplegables y sin acceso al portal.' : '✅ Operativo y con acceso al sistema.'}
                                        </p>
                                    </div>
                                </label>
                            </div>
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                            <Calendar size={16} />
                            Actividad y Caja Reales
                        </h3>
                        <div className="flex items-center gap-3">
                            {isGhostModeUnlocked && (
                                <>
                                    <button
                                        onClick={() => generateCashReportPDF(driver, new Date(selectedDateStr), driverStats.account)}
                                        title="Imprimir Liquidación PDF"
                                        className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 p-2 rounded-lg transition-colors border border-emerald-200 shadow-sm flex items-center gap-2 text-sm font-bold"
                                    >
                                        <Printer size={16} /> <span className="hidden sm:inline">Cierre PDF</span>
                                    </button>
                                    <input 
                                        type="date" 
                                        className="text-sm font-bold text-slate-700 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                                        value={selectedDateStr}
                                        onChange={(e) => setSelectedDateStr(e.target.value)}
                                    />
                                </>
                            )}
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-4 mb-8">
                        <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                            <div className="flex items-center gap-2 text-slate-400 mb-2">
                                <Wallet size={16} />
                                <span className="text-xs font-bold uppercase">Caja (Recaudado)</span>
                            </div>
                            <p className="text-2xl font-bold text-slate-800">€{driverStats.cash.toFixed(2)}</p>
                            <p className="text-xs text-slate-500">Efectivo en mano hoy</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                            <div className="flex items-center gap-2 text-blue-400 mb-2">
                                <Package size={16} />
                                <span className="text-xs font-bold uppercase">Envíos Hoy</span>
                            </div>
                            <p className="text-2xl font-bold text-blue-700">{driverStats.todayCount}</p>
                            <p className="text-xs text-blue-600/70">{driverStats.pending} pendientes</p>
                        </div>
                        <div className="bg-green-50 p-4 rounded-xl border border-green-100">
                            <div className="flex items-center gap-2 text-green-500 mb-2">
                                <CheckCircle size={16} />
                                <span className="text-xs font-bold uppercase">Entregados</span>
                            </div>
                            <p className="text-2xl font-bold text-green-700">{driverStats.delivered}</p>
                            <div className="w-full bg-green-200 rounded-full h-1.5 mt-2">
                                <div
                                    className="bg-green-500 h-1.5 rounded-full transition-all"
                                    style={{ width: `${driverStats.todayCount > 0 ? (driverStats.delivered / driverStats.todayCount) * 100 : 0}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>

                    {/* Route List */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <MapPin size={16} />
                            Envíos del Día Seleccionado
                        </h3>

                        <div className="space-y-3">
                            {driverStats.route.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 border-2 border-dashed border-slate-100 rounded-xl">
                                    <Truck className="mx-auto mb-2 opacity-50" size={24} />
                                    <p>No tiene envíos asignados hoy.</p>
                                </div>
                            ) : (
                                driverStats.route.map((shipment, index) => (
                                    <div key={shipment.id} className="bg-white border border-slate-200 rounded-xl p-4 hover:border-blue-300 transition-colors">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center font-bold text-xs">
                                                    {index + 1}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-slate-800 text-sm">
                                                        {shipment.destinationName || shipment.client}
                                                    </h4>
                                                    <p className="text-xs text-slate-500">{shipment.destinationCity}</p>
                                                </div>
                                            </div>
                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${shipment.status === 'Entregado' ? 'bg-green-100 text-green-700' :
                                                shipment.status === 'Incidencia' ? 'bg-red-100 text-red-700' :
                                                    'bg-blue-50 text-blue-600'
                                                }`}>
                                                {shipment.status}
                                            </span>
                                        </div>
                                        <div className="pl-9">
                                            <p className="text-xs text-slate-600 mb-2 flex items-start gap-1">
                                                <MapPin size={12} className="mt-0.5" />
                                                {shipment.destinationAddress}
                                            </p>
                                            <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-50">
                                                <span className="font-mono text-slate-500">{shipment.id}</span>
                                                <span className="font-bold text-slate-700">{shipment.amount}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Caja Details (Admin Account View) - PROTEGIDO POR MODO PRIVACIDAD */}
                    {isGhostModeUnlocked && (
                        <div className="mt-8 pt-8 border-t border-slate-100">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-6 flex items-center gap-2">
                                <Wallet size={16} />
                                Desglose de Caja del Día
                            </h3>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Reembolsos */}
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                        <Euro size={14} className="text-blue-500" />
                                        Detalle Reembolsos
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full ml-auto">
                                            €{(driverStats.account?.collectedReembolsos || 0).toFixed(2)}
                                        </span>
                                    </h4>
                                    {driverStats.account?.allReimbursementsDetail?.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">No hay reembolsos este día.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {driverStats.account?.allReimbursementsDetail?.map(item => (
                                                <div 
                                                    key={item.key} 
                                                    className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm cursor-pointer hover:bg-slate-200 transition-colors"
                                                    onClick={() => {
                                                        let ship = (shipments || []).find(s => s.id === item.id);
                                                        if (!ship && item.original?.shipmentId) {
                                                            ship = (shipments || []).find(s => s.id === item.original.shipmentId);
                                                        }
                                                        if (ship) {
                                                            setSelectedShipment(ship);
                                                            setIsReadOnlyModal(true);
                                                            setIsDetailsModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <div className="flex justify-between items-start mb-1">
                                                        <span className="font-bold text-slate-700">{item.client || item.destinationName}</span>
                                                        <span className="font-bold text-blue-600">{item.amountDisplay || `€${item.amount}`}</span>
                                                    </div>
                                                    <div className="text-xs text-slate-500">
                                                        Albarán: {item.id}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Portes */}
                                <div>
                                    <h4 className="font-bold text-slate-800 text-sm mb-3 flex items-center gap-2">
                                        <Truck size={14} className="text-amber-500" />
                                        Cobros de Porte
                                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full ml-auto">
                                            €{(driverStats.account?.collectedPorte || 0).toFixed(2)}
                                        </span>
                                    </h4>
                                    {driverStats.account?.allPorteDetail?.length === 0 ? (
                                        <p className="text-sm text-slate-400 italic">No hay cobros de porte este día.</p>
                                    ) : (
                                        <div className="space-y-2">
                                            {driverStats.account?.allPorteDetail?.map(item => (
                                                <div 
                                                    key={item.key} 
                                                    className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-sm flex gap-2 items-start cursor-pointer hover:bg-slate-200 transition-colors"
                                                    onClick={() => {
                                                        let ship = (shipments || []).find(s => s.id === item.id);
                                                        if (!ship && item.original?.shipmentId) {
                                                            ship = (shipments || []).find(s => s.id === item.original.shipmentId);
                                                        }
                                                        if (ship) {
                                                            setSelectedShipment(ship);
                                                            setIsReadOnlyModal(true);
                                                            setIsDetailsModalOpen(true);
                                                        }
                                                    }}
                                                >
                                                    <div className={`mt-0.5 w-1.5 h-1.5 rounded-full shrink-0 ${item.type === 'Efectivo' ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-start mb-1">
                                                            <span className="font-bold text-slate-700 leading-tight">
                                                                {item.client || item.description || 'Porte'}
                                                            </span>
                                                            <span className="font-bold text-amber-600 shrink-0 ml-2">{item.amountDisplay || `€${item.amount}`}</span>
                                                        </div>
                                                        {item.id && <div className="text-[10px] text-slate-400 font-mono">ID: {item.id}</div>}
                                                        <div className="text-[10px] text-slate-500 mt-1 uppercase tracking-wider font-semibold">
                                                            {item.type}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    </div>
                    )}

                    {/* ====== ESTADÍSTICAS TAB ====== */}
                    {activeTab === 'estadisticas' && (
                    <div className="p-6 space-y-6">

                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                                <div className="flex items-center gap-2 text-emerald-500 mb-1">
                                    <CheckCircle size={16} />
                                    <span className="text-xs font-bold uppercase">Tasa Entrega</span>
                                </div>
                                <p className="text-3xl font-bold text-emerald-700">{globalStats.deliveryRate}%</p>
                                <p className="text-xs text-emerald-600 mt-1">{globalStats.deliveredCount} de {globalStats.total} envíos</p>
                            </div>
                            <div className="bg-red-50 border border-red-100 rounded-xl p-4">
                                <div className="flex items-center gap-2 text-red-400 mb-1">
                                    <AlertTriangle size={16} />
                                    <span className="text-xs font-bold uppercase">Incidencias</span>
                                </div>
                                <p className="text-3xl font-bold text-red-600">{globalStats.incidentRate}%</p>
                                <p className="text-xs text-red-500 mt-1">{globalStats.incidentsCount} incidencias totales</p>
                            </div>
                            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                <div className="flex items-center gap-2 text-blue-400 mb-1">
                                    <Clock size={16} />
                                    <span className="text-xs font-bold uppercase">Tiempo Medio</span>
                                </div>
                                <p className="text-3xl font-bold text-blue-700">
                                    {globalStats.avgDeliveryHours != null ? `${globalStats.avgDeliveryHours}h` : '—'}
                                </p>
                                <p className="text-xs text-blue-600 mt-1">Creación → entrega</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                                <div className="flex items-center gap-2 text-slate-400 mb-1">
                                    <Package size={16} />
                                    <span className="text-xs font-bold uppercase">Pendientes</span>
                                </div>
                                <p className="text-3xl font-bold text-slate-700">{globalStats.pendingCount}</p>
                                <p className="text-xs text-slate-500 mt-1">Activos actualmente</p>
                            </div>
                        </div>

                        {/* Revenue */}
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <Euro size={14} /> Facturación (Portes)
                            </h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-xs text-slate-400 mb-1">Este mes</p>
                                    <p className="text-2xl font-bold text-slate-800">€{(globalStats.monthlyRevenue || 0).toFixed(2)}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-slate-400 mb-1">Total histórico</p>
                                    <p className="text-2xl font-bold text-slate-800">€{(globalStats.totalRevenue || 0).toFixed(2)}</p>
                                </div>
                            </div>
                        </div>

                        {/* Top destinations */}
                        <div className="bg-white border border-slate-200 rounded-xl p-5">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                <MapPin size={14} /> Destinos más frecuentes
                            </h3>
                            {(globalStats.topCities || []).length === 0 ? (
                                <p className="text-sm text-slate-400 italic">Sin datos</p>
                            ) : (
                                <div className="space-y-3">
                                    {(globalStats.topCities || []).map(([city, count]) => (
                                        <div key={city}>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="font-medium text-slate-700">{city}</span>
                                                <span className="text-slate-500">{count} envíos</span>
                                            </div>
                                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                                <div
                                                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                                                    style={{ width: `${globalStats.total > 0 ? (count / globalStats.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                    </div>
                    )}

                    {/* ====== NÓMINAS TAB ====== */}
                    {activeTab === 'nominas' && (
                        <div className="p-6 space-y-4">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2 mb-4">
                                <FileText size={16} /> Documentos de Nómina
                            </h3>
                            {(!driver.payrolls || driver.payrolls.length === 0) ? (
                                <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-xl">
                                    <FileText className="mx-auto mb-3 text-slate-300" size={32} />
                                    <p className="text-sm font-medium text-slate-500">No hay nóminas asignadas</p>
                                    <p className="text-xs text-slate-400 mt-1">Sube nóminas desde la gestión masiva de carpetas.</p>
                                </div>
                            ) : (
                                <div className="grid gap-3">
                                    {driver.payrolls.map((payroll, idx) => (
                                        <div key={idx} className="bg-white border border-slate-200 rounded-xl p-4 flex justify-between items-center hover:border-blue-300 transition-colors shadow-sm">
                                            <div className="flex items-center gap-3">
                                                <div className="bg-blue-50 text-blue-500 p-2.5 rounded-xl">
                                                    <FileText size={20} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-800 text-sm">{payroll.fileName}</p>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                        <Calendar size={12} /> {new Date(payroll.date).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <a 
                                                    href={payroll.url} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer" 
                                                    className="p-2 text-blue-600 bg-blue-50 hover:bg-blue-100 hover:text-blue-700 rounded-lg transition-colors flex items-center justify-center"
                                                    title="Ver / Descargar Documento"
                                                >
                                                    <Download size={18} />
                                                </a>
                                                <button 
                                                    onClick={() => handleDeletePayroll(payroll)}
                                                    className="p-2 text-red-500 bg-red-50 hover:bg-red-100 hover:text-red-700 rounded-lg transition-colors flex items-center justify-center"
                                                    title="Ocultar del portal del empleado"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>

            {/* Shipment Details Modal */}
            {isDetailsModalOpen && selectedShipment && (
                <ShipmentDetailsModal
                    isOpen={isDetailsModalOpen}
                    onClose={() => {
                        setIsDetailsModalOpen(false);
                        setSelectedShipment(null);
                        setIsReadOnlyModal(false);
                    }}
                    shipment={selectedShipment}
                    readOnly={isReadOnlyModal}
                />
            )}
        </div>
    );
}
