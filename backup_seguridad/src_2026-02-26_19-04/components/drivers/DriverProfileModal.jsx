import { X, Truck, Phone, MapPin, Package, Clock, Euro, Wallet, Calendar, CheckCircle, AlertTriangle, Edit2, Save, Eye, EyeOff, Key } from 'lucide-react';
import { useMemo, useState, useEffect } from 'react';

export default function DriverProfileModal({ isOpen, onClose, driver, shipments, onUpdateDriver }) {
    const [isEditing, setIsEditing] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({});

    useEffect(() => {
        if (driver && isOpen) {
            setFormData({
                name: driver.name || '',
                phone: driver.phone || '',
                username: driver.username || '',
                password: driver.password || '',
            });
            setIsEditing(false);
            setShowPassword(false);
        }
    }, [driver, isOpen]);

    const handleSave = () => {
        if (onUpdateDriver) {
            onUpdateDriver(driver.id, formData);
        }
        setIsEditing(false);
    };

    // Filter shipments for this driver and today (for route view) and relevant calculations
    const driverStats = useMemo(() => {
        if (!driver) return { todayCount: 0, delivered: 0, pending: 0, cash: 0, route: [] };

        const driverShipments = (shipments || []).filter(s =>
            // Check both assigned ID and created ID for full picture
            (s.assignedDriverId === driver.id)
        );

        const today = new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

        const todayShipments = driverShipments.filter(s => s.date === today);
        const deliveredToday = todayShipments.filter(s => s.status === 'Entregado').length;
        const pendingToday = todayShipments.filter(s => s.status !== 'Entregado').length;

        // --- ACCOUNTING LOGIC (Mirrors DriverDashboard) ---

        // Helper: Check if client pays cash (Cobro Diario or New Client)
        const isCashClient = (shipment) => {
            // Logic derived from DriverDashboard
            // We don't have the full client object here easily unless we passed clients too, 
            // but we can infer from shipment billingType if available, or assume checks.
            // For robust admin view, let's look at shipment metadata if possible.
            // Filter STRICTLY mirrors 'DriverDashboard.jsx' latest logic:
            // "Cobros en Origen" (Prepaid) = Porte 'Pagado' AND PaymentStatus 'Paid' AND (Client is 'Cobro Diario' OR New)
            // But wait, we simplified in Dashboard to just check isCashClient.
            return shipment.billingType === 'Cobro Diario' || !shipment.billingType;
        };

        const parseAmount = (amountStr) => {
            if (!amountStr) return 0;
            if (typeof amountStr === 'number') return amountStr;
            try {
                return parseFloat(amountStr.replace(/[^0-9.-]+/g, "")) || 0;
            } catch (e) { return 0; }
        };

        // 1. Cobros en Origen (Prepaid Cash)
        // Logic: Created Today AND Prepaid AND Paid AND CashClient
        const prepaidCash = (shipments || []).filter(s =>
            (s.assignedDriverId === driver.id || (!s.assignedDriverId && s.createdById === driver.id)) && // Driver involved
            s.porteType === 'Pagado' &&
            s.paymentStatus === 'Paid' &&
            (s.billingType === 'Cobro Diario' || !s.billingType) && // Cash Client Logic
            s.date === today
        ).reduce((sum, s) => sum + parseAmount(s.amount), 0);

        // 2. Cobros en Destino (Collected at Delivery)
        // Logic: Delivered Today AND Due (Debido) AND CashClient (Receiver)
        const deliveredCash = todayShipments.filter(s =>
            s.status === 'Entregado' &&
            s.porteType === 'Debido'
            // We assume if it was delivered and marked "Debido", they collected it if they followed process.
            // Ideally we check if destination client is Cash, but we'll assume standard flow.
        ).reduce((sum, s) => sum + parseAmount(s.amount), 0);

        const totalCash = prepaidCash + deliveredCash;

        return {
            todayCount: todayShipments.length,
            delivered: deliveredToday,
            pending: pendingToday,
            cash: totalCash,
            route: todayShipments
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
                                    <div className="flex items-center gap-2">
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
                                    <h2 className="text-xl font-bold text-slate-800">{driver.name}</h2>
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

                <div className="overflow-y-auto p-6 custom-scrollbar">

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
                            <p className="text-xs text-blue-600/70 mt-3">
                                Estos datos permiten al conductor iniciar sesión en la aplicación móvil o portal de conductores.
                            </p>
                        </div>
                    )}

                    {/* Stats Grid */}
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
                            <Calendar size={16} />
                            Ruta de Hoy ({new Date().toLocaleDateString()})
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

                </div>
            </div>
        </div>
    );
}
