import { useState, useEffect, useRef } from 'react';
import { X, Truck, User, FileText, Upload, Download, Trash2, Shield, Cpu, AlertTriangle, CheckCircle, Clock, Wrench, Droplets, Circle, Plus, Euro, Camera, Pencil, Save } from 'lucide-react';
import BrandLogo from './BrandLogo';
import MaintenanceIcon, { getMaintenanceConfig } from './MaintenanceIcon';

const BRANDS = [
    { key: 'fiat',       name: 'FIAT' },
    { key: 'peugeot',    name: 'PEUGEOT' },
    { key: 'hyundai',    name: 'HYUNDAI' },
    { key: 'mercedes',   name: 'MERCEDES' },
    { key: 'renault',    name: 'RENAULT' },
    { key: 'volkswagen', name: 'VOLKSWAGEN' },
    { key: 'iveco',      name: 'IVECO' },
    { key: 'man',        name: 'MAN' },
    { key: 'bmw',        name: 'BMW' },
    { key: 'toyota',     name: 'TOYOTA' },
    { key: 'ford',       name: 'FORD' },
    { key: 'citroen',    name: 'CITROËN' },
    { key: 'nissan',     name: 'NISSAN' },
    { key: 'volvo',      name: 'VOLVO' },
    { key: 'daf',        name: 'DAF' },
    { key: 'scania',     name: 'SCANIA' },
    { key: 'opel',       name: 'OPEL' },
];

const DOC_TYPES = ['Seguro','ITV','Ficha Técnica','Permiso de Circulación','Tarjeta de Transporte','Tacógrafo','Extintor / Seguridad','Otro'];

const MAINTENANCE_TYPES = [
    { value: 'Aceite', label: 'Cambio de Aceite', icon: Droplets, color: 'text-amber-500 bg-amber-50' },
    { value: 'Correa', label: 'Correa Distribución', icon: Circle, color: 'text-red-500 bg-red-50' },
    { value: 'Ruedas', label: 'Neumáticos / Ruedas', icon: Circle, color: 'text-slate-500 bg-slate-100' },
    { value: 'Reparación', label: 'Reparación / Avería', icon: Wrench, color: 'text-red-500 bg-red-50' },
    { value: 'Filtro Aire', label: 'Filtro de Aire', icon: Wrench, color: 'text-sky-500 bg-sky-50' },
    { value: 'Filtro Gasoil', label: 'Filtro de Gasoil', icon: Droplets, color: 'text-cyan-500 bg-cyan-50' },
    { value: 'Filtro Aceite', label: 'Filtro de Aceite', icon: Droplets, color: 'text-yellow-600 bg-yellow-100' },
    { value: 'Filtros', label: 'Otros Filtros (habitáculo…)', icon: Wrench, color: 'text-blue-500 bg-blue-50' },
    { value: 'Frenos', label: 'Frenos (General)', icon: Wrench, color: 'text-orange-500 bg-orange-50' },
    { value: 'Zapata Frenos', label: 'Zapata de Freno', icon: Wrench, color: 'text-orange-600 bg-orange-100' },
    { value: 'Pastillas Delanteras', label: 'Pastillas Delanteras', icon: Wrench, color: 'text-orange-500 bg-orange-50' },
    { value: 'Pastillas Traseras', label: 'Pastillas Traseras', icon: Wrench, color: 'text-orange-500 bg-orange-50' },
    { value: 'Revisión', label: 'Revisión General', icon: CheckCircle, color: 'text-emerald-500 bg-emerald-50' },
    { value: 'Otro', label: 'Otro', icon: Wrench, color: 'text-purple-500 bg-purple-50' },
];

// Types that support km-based alerts
const KM_ALERT_TYPES = ['Aceite', 'Correa', 'Ruedas', 'Filtros', 'Frenos', 'Zapata Frenos', 'Pastillas Delanteras', 'Pastillas Traseras', 'Filtro Aire', 'Filtro Gasoil', 'Filtro Aceite'];

function getKmAlertStatus(log, currentOdometer) {
    if (!log.alertAtKm || !currentOdometer) return null;
    const alertKm = parseInt(log.alertAtKm);
    const odom = parseInt(currentOdometer);
    const remaining = alertKm - odom;
    if (remaining <= 0)   return { label: '¡KM SUPERADOS!',  color: 'text-red-600 bg-red-50 border-red-200', icon: 'critical', remaining };
    if (remaining <= 1000) return { label: `${remaining} km para alerta`, color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'warning', remaining };
    if (remaining <= 3000) return { label: `${remaining} km para alerta`, color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: 'notice', remaining };
    return { label: `Faltan ${remaining.toLocaleString('es-ES')} km`, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: 'ok', remaining };
}

function getExpiryStatus(expiryDate) {
    if (!expiryDate) return null;
    const today = new Date();
    const exp = new Date(expiryDate);
    const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0)  return { label: 'VENCIDO', color: 'text-red-600 bg-red-50 border-red-200', icon: 'critical', days: diffDays };
    if (diffDays <= 30) return { label: `Vence en ${diffDays}d`, color: 'text-amber-600 bg-amber-50 border-amber-200', icon: 'warning', days: diffDays };
    if (diffDays <= 90) return { label: `Vence en ${diffDays}d`, color: 'text-yellow-600 bg-yellow-50 border-yellow-200', icon: 'notice', days: diffDays };
    return { label: `OK (${diffDays}d)`, color: 'text-emerald-600 bg-emerald-50 border-emerald-200', icon: 'ok', days: diffDays };
}

export default function VehicleDetailsModal({ isOpen, onClose, vehicle, drivers, onUpdateVehicle }) {
    const [activeTab, setActiveTab] = useState('detalles');
    const [assignedDriverId, setAssignedDriverId] = useState('');
    const [documents, setDocuments] = useState([]);
    const [maintenanceLogs, setMaintenanceLogs] = useState([]);

    // Upload form state
    const [uploadDocType, setUploadDocType] = useState('Seguro');
    const [uploadExpiry, setUploadExpiry] = useState('');
    const [uploadLabel, setUploadLabel] = useState('');

    // Maintenance form state
    const [showMaintForm, setShowMaintForm] = useState(false);
    const [editingLogId, setEditingLogId] = useState(null); // null = adding, id = editing
    const [selectedTypes, setSelectedTypes] = useState(['Aceite']);
    const [mDetails, setMDetails] = useState({});
    const [mDate, setMDate] = useState(new Date().toISOString().split('T')[0]);
    const [mKm, setMKm] = useState('');
    const [mWorkshop, setMWorkshop] = useState('');
    const [mInvoicePhoto, setMInvoicePhoto] = useState(null);
    const invoiceInputRef = useRef(null);

    // Vehicle current odometer
    const [currentOdometer, setCurrentOdometer] = useState('');

    // Editing brand/model
    const [editingModel, setEditingModel] = useState(false);
    const [modelBrand, setModelBrand] = useState('');
    const [modelName, setModelName] = useState('');

    useEffect(() => {
        if (vehicle) {
            setAssignedDriverId(vehicle.assignedDriverId || '');
            setDocuments(vehicle.documents || []);
            setMaintenanceLogs(vehicle.maintenanceLogs || []);
            setCurrentOdometer(vehicle.currentOdometer || '');
            setActiveTab('detalles');
            setEditingModel(false);
            // Parse brand from model string
            const m = vehicle.model || '';
            const foundBrand = BRANDS.find(b => m.toUpperCase().startsWith(b.name));
            setModelBrand(foundBrand ? foundBrand.name : '');
            setModelName(foundBrand ? m.slice(foundBrand.name.length).trim() : m);
        }
    }, [vehicle]);

    if (!isOpen || !vehicle) return null;

    const handleDriverChange = (e) => {
        const newDriverId = e.target.value ? Number(e.target.value) : null;
        setAssignedDriverId(newDriverId);
        onUpdateVehicle(vehicle.id, { assignedDriverId: newDriverId });
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) { alert('El archivo es demasiado grande. Límite: 2MB.'); return; }
        const reader = new FileReader();
        reader.onload = (event) => {
            const newDoc = {
                id: Date.now(), name: uploadLabel || file.name,
                docType: uploadDocType, expiryDate: uploadExpiry || null,
                type: file.type, size: (file.size / 1024).toFixed(1) + ' KB',
                date: new Date().toLocaleDateString('es-ES'), dataUrl: event.target.result,
            };
            const updatedDocs = [...documents, newDoc];
            setDocuments(updatedDocs);
            onUpdateVehicle(vehicle.id, { documents: updatedDocs });
            setUploadLabel(''); setUploadExpiry(''); setUploadDocType('Seguro'); e.target.value = '';
        };
        reader.readAsDataURL(file);
    };

    const handleDeleteDocument = (docId) => {
        if (window.confirm('¿Seguro?')) {
            const updatedDocs = documents.filter(d => d.id !== docId);
            setDocuments(updatedDocs);
            onUpdateVehicle(vehicle.id, { documents: updatedDocs });
        }
    };

    const resetMaintForm = () => {
        setSelectedTypes(['Aceite']);
        setMDetails({});
        setMKm('');
        setMWorkshop('');
        setMInvoicePhoto(null);
        setMDate(new Date().toISOString().split('T')[0]);
        setEditingLogId(null);
        setShowMaintForm(false);
    };

    const handleToggleType = (type) => {
        if (editingLogId) {
            setSelectedTypes([type]);
        } else {
            if (selectedTypes.includes(type)) {
                if (selectedTypes.length > 1) {
                    setSelectedTypes(selectedTypes.filter(t => t !== type));
                }
            } else {
                setSelectedTypes([...selectedTypes, type]);
            }
        }
    };

    const updateDetail = (type, field, val) => {
        setMDetails(prev => ({
            ...prev,
            [type]: {
                ...(prev[type] || { cost: '', nextKm: '', alertAtKm: '', notes: '' }),
                [field]: val
            }
        }));
    };

    const handleAddMaintenance = (e) => {
        e.preventDefault();
        let updated;
        if (editingLogId) {
            // Editing existing log
            const type = selectedTypes[0] || 'Aceite';
            const details = mDetails[type] || {};
            updated = maintenanceLogs.map(log => {
                if (log.id === editingLogId) {
                    return {
                        ...log,
                        type,
                        date: mDate,
                        km: mKm,
                        cost: details.cost || '',
                        notes: details.notes || '',
                        workshop: mWorkshop,
                        nextKm: details.nextKm || '',
                        alertAtKm: details.alertAtKm || null,
                        invoicePhoto: mInvoicePhoto || log.invoicePhoto || null,
                        updatedAt: new Date().toISOString(),
                    };
                }
                return log;
            });
        } else {
            // Adding multiple new logs (as separate independent entries)
            const newLogs = selectedTypes.map((type, idx) => {
                const details = mDetails[type] || {};
                return {
                    id: Date.now() + idx,
                    type,
                    date: mDate,
                    km: mKm,
                    cost: details.cost || '',
                    notes: details.notes || '',
                    workshop: mWorkshop,
                    nextKm: details.nextKm || '',
                    alertAtKm: details.alertAtKm || null,
                    invoicePhoto: mInvoicePhoto || null,
                    createdAt: new Date().toISOString(),
                };
            });
            updated = [...newLogs, ...maintenanceLogs];
        }
        setMaintenanceLogs(updated);
        const updates = { maintenanceLogs: updated };
        if (mKm) { setCurrentOdometer(mKm); updates.currentOdometer = mKm; }
        onUpdateVehicle(vehicle.id, updates);
        resetMaintForm();
    };

    const handleEditMaint = (log) => {
        setEditingLogId(log.id);
        setSelectedTypes([log.type || 'Aceite']);
        setMDate(log.date || new Date().toISOString().split('T')[0]);
        setMKm(log.km || '');
        setMWorkshop(log.workshop || '');
        setMInvoicePhoto(log.invoicePhoto || null);
        setMDetails({
            [log.type || 'Aceite']: {
                cost: log.cost || '',
                notes: log.notes || '',
                nextKm: log.nextKm || '',
                alertAtKm: log.alertAtKm || '',
            }
        });
        setShowMaintForm(true);
    };

    const handleInvoicePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { alert('Imagen demasiado grande. Límite: 4MB.'); return; }
        const reader = new FileReader();
        reader.onload = (ev) => setMInvoicePhoto(ev.target.result);
        reader.readAsDataURL(file);
        e.target.value = '';
    };

    const handleDeleteMaint = (id) => {
        if (window.confirm('¿Eliminar este registro?')) {
            const updated = maintenanceLogs.filter(l => l.id !== id);
            setMaintenanceLogs(updated);
            onUpdateVehicle(vehicle.id, { maintenanceLogs: updated });
        }
    };

    const assignedDriverInfo = drivers.find(d => d.id === assignedDriverId);
    const alertDocs = documents.filter(d => { const st = getExpiryStatus(d.expiryDate); return st && (st.icon === 'critical' || st.icon === 'warning'); });
    const totalMaintCost = maintenanceLogs.reduce((s, l) => s + parseFloat(l.cost || 0), 0);
    const kmAlertLogs = maintenanceLogs.filter(l => l.alertAtKm && currentOdometer && getKmAlertStatus(l, currentOdometer)?.icon !== 'ok');

    const getTypeConfig = (val) => MAINTENANCE_TYPES.find(t => t.value === val) || MAINTENANCE_TYPES[MAINTENANCE_TYPES.length - 1];

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3 flex-wrap">
                        <BrandLogo model={vehicle.model} size={40} />
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{vehicle.id}</h3>
                            <p className="text-sm text-slate-500">{vehicle.model}</p>
                        </div>
                        {alertDocs.length > 0 && (
                            <span className="flex items-center gap-1 bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full border border-red-200">
                                <AlertTriangle size={12} /> {alertDocs.length} doc urgente{alertDocs.length > 1 ? 's' : ''}
                            </span>
                        )}
                        {kmAlertLogs.length > 0 && (
                            <span className="flex items-center gap-1 bg-orange-100 text-orange-600 text-xs font-bold px-2 py-1 rounded-full border border-orange-200">
                                <AlertTriangle size={12} /> {kmAlertLogs.length} alerta km
                            </span>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"><X size={20} /></button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-200 px-4 pt-2 bg-slate-50 overflow-x-auto">
                    {[
                        { id: 'detalles', label: 'Detalles' },
                        { id: 'mantenimiento', label: `Mantenimiento${maintenanceLogs.length > 0 ? ` (${maintenanceLogs.length})` : ''}` },
                        { id: 'documentos', label: `Documentos${documents.length > 0 ? ` (${documents.length})` : ''}`, alert: alertDocs.length > 0 },
                    ].map(tab => (
                        <button key={tab.id}
                            className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 ${activeTab === tab.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            onClick={() => setActiveTab(tab.id)}
                        >
                            {tab.alert && <span className="w-2 h-2 bg-red-500 rounded-full inline-block"></span>}
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="p-6 overflow-y-auto flex-1 bg-slate-50/50">

                    {/* ── DETALLES TAB ── */}
                    {activeTab === 'detalles' && (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><User size={18} className="text-slate-400" /> Conductor Asignado</h4>
                                <select value={assignedDriverId || ''} onChange={handleDriverChange} className="w-full border border-slate-300 rounded-lg px-4 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium">
                                    <option value="">-- Sin conductor asignado --</option>
                                    {drivers.filter(d => d.isActive !== false || d.id === assignedDriverId).map(driver => (
                                        <option key={driver.id} value={driver.id}>{driver.name} {driver.isActive === false ? '(Baja)' : ''} {driver.vehicle ? `(En ${driver.vehicle})` : ''}</option>
                                    ))}
                                </select>
                                {assignedDriverInfo && (
                                    <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">{assignedDriverInfo.name.charAt(0)}</div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{assignedDriverInfo.name}</p>
                                            <p className="text-sm text-slate-500">{assignedDriverInfo.phone}</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Brand / Model editor */}
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <div className="flex items-center justify-between mb-4">
                                    <h4 className="font-bold text-slate-700 flex items-center gap-2"><Truck size={18} className="text-slate-400" /> Marca y Modelo</h4>
                                    {!editingModel && (
                                        <button
                                            onClick={() => setEditingModel(true)}
                                            className="flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded-lg transition-colors"
                                        >
                                            <Pencil size={12} /> Editar
                                        </button>
                                    )}
                                </div>
                                {editingModel ? (
                                    <div className="space-y-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Marca</label>
                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                {BRANDS.map(b => (
                                                    <button
                                                        key={b.key}
                                                        type="button"
                                                        onClick={() => setModelBrand(b.name)}
                                                        className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-bold transition-all ${
                                                            modelBrand === b.name
                                                                ? 'border-blue-500 bg-blue-50 text-blue-700 shadow'
                                                                : 'border-slate-200 text-slate-600 hover:border-blue-300'
                                                        }`}
                                                    >
                                                        <img src={`/logos/brands/${b.key}.png`} alt={b.name} className="w-7 h-7 object-contain" />
                                                        <span>{b.name}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Modelo</label>
                                            <input
                                                type="text"
                                                value={modelName}
                                                onChange={e => setModelName(e.target.value)}
                                                placeholder="Ej: Ducato, Boxer, Sprinter..."
                                                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                            />
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const combined = modelBrand
                                                        ? `${modelBrand} ${modelName}`.trim()
                                                        : modelName.trim();
                                                    onUpdateVehicle(vehicle.id, { model: combined });
                                                    setEditingModel(false);
                                                }}
                                                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg py-2 text-sm transition-colors"
                                            >
                                                <Save size={14} /> Guardar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setEditingModel(false)}
                                                className="px-4 text-slate-500 hover:bg-slate-100 rounded-lg font-medium text-sm transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-3">
                                        <BrandLogo model={vehicle.model} size={40} />
                                        <div>
                                            <p className="font-bold text-slate-800">{vehicle.model || <span className="text-slate-400 italic">Sin marca asignada</span>}</p>
                                            <p className="text-xs text-slate-400">Haz clic en "Editar" para cambiar la marca</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2"><Truck size={18} className="text-slate-400" /> Estado del Vehículo</h4>
                                <select
                                    value={vehicle.status || 'Disponible'}
                                    onChange={(e) => onUpdateVehicle(vehicle.id, { status: e.target.value })}
                                    className={`w-full border rounded-lg px-4 py-2.5 font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                        vehicle.status === 'Inactivo' ? 'border-slate-300 bg-slate-100 text-slate-500' :
                                        vehicle.status === 'Mantenimiento' ? 'border-amber-300 bg-amber-50 text-amber-700' :
                                        vehicle.status === 'En Ruta' ? 'border-blue-300 bg-blue-50 text-blue-700' :
                                        'border-green-300 bg-green-50 text-green-700'
                                    }`}
                                >
                                    <option value="Disponible">🟢 Disponible</option>
                                    <option value="En Ruta">🔵 En Ruta</option>
                                    <option value="Mantenimiento">🟡 En Taller / Mantenimiento</option>
                                    <option value="Inactivo">⛔ Inactivo / Vendido</option>
                                </select>
                                {vehicle.status === 'Inactivo' && (
                                    <p className="text-xs text-slate-400 mt-2 italic">Este vehículo aparecerá atenuado en la lista de flota</p>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                                    <Shield className="text-emerald-500 mt-0.5" size={20} />
                                    <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Mantenimiento</p><p className="font-bold text-slate-700 mt-1">{vehicle.maintenance}</p></div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                                    <Cpu className="text-indigo-500 mt-0.5" size={20} />
                                    <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Combustible</p><p className="font-bold text-slate-700 mt-1">{vehicle.fuel}</p></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* ── MANTENIMIENTO TAB ── */}
                    {activeTab === 'mantenimiento' && (
                        <div className="space-y-4 animate-in fade-in">
                            {/* Summary bar */}
                            {maintenanceLogs.length > 0 && (
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
                                        <p className="text-xl font-bold text-slate-800">{maintenanceLogs.length}</p>
                                        <p className="text-xs text-slate-500 font-medium">Registros</p>
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
                                        <p className="text-xl font-bold text-slate-800">€{totalMaintCost.toFixed(0)}</p>
                                        <p className="text-xs text-slate-500 font-medium">Coste Total (sin IVA)</p>
                                    </div>
                                    <div className="bg-white rounded-xl border border-slate-200 p-3 text-center shadow-sm">
                                        <p className="text-xl font-bold text-slate-800">{maintenanceLogs[0]?.km ? `${parseInt(maintenanceLogs[0].km).toLocaleString('es-ES')} km` : '—'}</p>
                                        <p className="text-xs text-slate-500 font-medium">Último KM</p>
                                    </div>
                                </div>
                            )}

                            {/* Odometer input */}
                            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-4">
                                <div className="p-2 bg-slate-100 rounded-lg text-slate-500"><Cpu size={18}/></div>
                                <div className="flex-1">
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Odómetro Actual del Vehículo (km)</label>
                                    <input
                                        type="number"
                                        placeholder="Ej: 125000"
                                        value={currentOdometer}
                                        onChange={e => {
                                            setCurrentOdometer(e.target.value);
                                            onUpdateVehicle(vehicle.id, { currentOdometer: e.target.value });
                                        }}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                                    />
                                </div>
                                {currentOdometer && <span className="text-sm font-bold text-slate-700 shrink-0">{parseInt(currentOdometer).toLocaleString('es-ES')} km</span>}
                            </div>

                            {/* Add button / Form toggle */}
                            {!showMaintForm ? (
                                <button onClick={() => setShowMaintForm(true)} className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 text-blue-600 font-bold rounded-xl py-3 text-sm transition-all">
                                    <Plus size={18} /> Añadir Registro de Mantenimiento
                                </button>
                            ) : (
                                <form onSubmit={handleAddMaintenance} className={`bg-white rounded-xl border shadow-sm p-5 space-y-4 ${editingLogId ? 'border-amber-300 bg-amber-50/30' : 'border-blue-200'}`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                            {editingLogId ? <><Pencil size={16} className="text-amber-500" /> Editando Registro</> : 'Nuevo Registro'}
                                        </h4>
                                        <button type="button" onClick={resetMaintForm} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
                                    </div>

                                    {/* General Fields */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha</label>
                                            <input type="date" required value={mDate} onChange={e => setMDate(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Kilómetros en el momento</label>
                                            <input type="number" placeholder="Ej: 125000" value={mKm} onChange={e => setMKm(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Taller / Proveedor</label>
                                        <input type="text" placeholder="Nombre del taller o mecánico" value={mWorkshop} onChange={e => setMWorkshop(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>

                                    {/* Type selector */}
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                            {editingLogId ? 'Tipo de Intervención' : 'Tipos de Intervención (puedes elegir varios)'}
                                        </label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                            {MAINTENANCE_TYPES.map(t => {
                                                const isSelected = selectedTypes.includes(t.value);
                                                return (
                                                    <button key={t.value} type="button"
                                                        onClick={() => handleToggleType(t.value)}
                                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-bold transition-all ${isSelected ? 'border-blue-500 bg-blue-50 text-blue-700 shadow' : 'border-slate-200 text-slate-600 hover:border-blue-300'}`}
                                                    >
                                                        <MaintenanceIcon type={t.value} size={14} withBg={false} />
                                                        {t.label.split('/')[0].trim()}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Per-type specific details */}
                                    {selectedTypes.length > 0 && (
                                        <div className="space-y-3 pt-2">
                                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detalles específicos por intervención</p>
                                            {selectedTypes.map(type => {
                                                const config = MAINTENANCE_TYPES.find(t => t.value === type) || { label: type };
                                                const details = mDetails[type] || {};
                                                return (
                                                    <div key={type} className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3 shadow-sm">
                                                        <div className="flex items-center gap-2 font-bold text-slate-700 text-sm">
                                                            <MaintenanceIcon type={type} size={14} withBg={true} bgSize={24} />
                                                            <span>{config.label}</span>
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-3">
                                                            <div>
                                                                <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1">Coste sin IVA (€)</label>
                                                                <input type="number" step="0.01" placeholder="0.00"
                                                                    value={details.cost || ''}
                                                                    onChange={e => updateDetail(type, 'cost', e.target.value)}
                                                                    className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                            </div>
                                                            <div>
                                                                <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1">Próx. cambio ref (km)</label>
                                                                <input type="number" placeholder="Ej: 135000"
                                                                    value={details.nextKm || ''}
                                                                    onChange={e => updateDetail(type, 'nextKm', e.target.value)}
                                                                    className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                                            </div>
                                                        </div>
                                                        {KM_ALERT_TYPES.includes(type) && (
                                                            <div className="bg-amber-50/60 border border-amber-200/60 rounded-lg p-2.5">
                                                                <label className="block text-xxs font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1">
                                                                    <AlertTriangle size={10}/> Alertar en (km)
                                                                </label>
                                                                <input
                                                                    type="number"
                                                                    placeholder={details.nextKm ? `Sugerencia: ${details.nextKm} km` : 'Ej: 135000'}
                                                                    value={details.alertAtKm || ''}
                                                                    onChange={e => updateDetail(type, 'alertAtKm', e.target.value)}
                                                                    className="w-full border border-amber-300 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-amber-400 font-bold"
                                                                />
                                                            </div>
                                                        )}
                                                        <div>
                                                            <label className="block text-xxs font-bold text-slate-400 uppercase tracking-wider mb-1">Notas / Descripción</label>
                                                            <textarea rows={1} placeholder="Notas particulares..."
                                                                value={details.notes || ''}
                                                                onChange={e => updateDetail(type, 'notes', e.target.value)}
                                                                className="w-full border border-slate-200 bg-white rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* Invoice photo */}
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                            <Camera size={12} /> Foto de Factura / Ticket (opcional)
                                        </label>
                                        {mInvoicePhoto ? (
                                            <div className="flex items-center gap-3">
                                                <img src={mInvoicePhoto} alt="Factura" className="w-16 h-16 object-cover rounded-lg border border-slate-200 shadow-sm" />
                                                <div className="flex flex-col gap-1">
                                                    <span className="text-xs text-emerald-600 font-bold">✓ Foto adjunta</span>
                                                    <button type="button" onClick={() => setMInvoicePhoto(null)}
                                                        className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                                                        <X size={10} /> Eliminar
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <label className="cursor-pointer flex items-center justify-center gap-2 border-2 border-dashed border-slate-300 hover:border-blue-400 bg-white hover:bg-blue-50 text-slate-500 hover:text-blue-600 font-medium rounded-xl py-3 text-sm transition-all">
                                                <Camera size={16} /> Seleccionar foto o PDF
                                                <input type="file" className="hidden" accept="image/*,.pdf" ref={invoiceInputRef} onChange={handleInvoicePhotoUpload} />
                                            </label>
                                        )}
                                    </div>

                                    <button type="submit" className={`w-full font-bold py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 shadow-lg text-white ${editingLogId ? 'bg-amber-500 hover:bg-amber-600 shadow-amber-500/20' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'}`}>
                                        {editingLogId ? <><Pencil size={16} /> Guardar Cambios</> : <><Plus size={18} /> Guardar Registro</>}
                                    </button>
                                </form>
                            )}

                            {/* Log list */}
                            {maintenanceLogs.length === 0 && !showMaintForm ? (
                                <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-10 text-center flex flex-col items-center">
                                    <div className="bg-slate-100 p-4 rounded-full mb-3 text-slate-400"><Wrench size={32} /></div>
                                    <p className="text-slate-600 font-medium">Sin registros de mantenimiento</p>
                                    <p className="text-slate-400 text-sm mt-1">Añade cambios de aceite, neumáticos, reparaciones...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {maintenanceLogs.map((log) => {
                                        const tc = getTypeConfig(log.type);
                                        const Icon = tc.icon;
                                        const kmStatus = getKmAlertStatus(log, currentOdometer);
                                        return (
                                            <div key={log.id} className={`bg-white border rounded-xl p-4 shadow-sm group hover:border-blue-200 transition-colors ${kmStatus?.icon === 'critical' ? 'border-red-300' : kmStatus?.icon === 'warning' ? 'border-amber-300' : 'border-slate-200'}`}>
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                                        <MaintenanceIcon type={log.type} size={18} withBg={true} bgSize={38} />
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center flex-wrap gap-2">
                                                                <p className="font-bold text-slate-800 text-sm">{tc.label}</p>
                                                                <span className="text-xs text-slate-400 font-medium">{new Date(log.date).toLocaleDateString('es-ES')}</span>
                                                                {log.km && <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-bold">{parseInt(log.km).toLocaleString('es-ES')} km</span>}
                                                                {log.cost && <span className="text-xs bg-emerald-50 text-emerald-600 px-2 py-0.5 rounded-full border border-emerald-200 font-bold flex items-center gap-0.5"><Euro size={10}/>  {parseFloat(log.cost).toFixed(2)}</span>}
                                                            </div>
                                                            {log.workshop && <p className="text-xs text-slate-500 mt-1">🔧 {log.workshop}</p>}
                                                            {log.notes && <p className="text-xs text-slate-500 mt-1 italic">"{log.notes}"</p>}
                                                            {log.nextKm && <p className="text-xs text-blue-600 mt-1 font-medium">📍 Próx. cambio referencia: {parseInt(log.nextKm).toLocaleString('es-ES')} km</p>}
                                                            {log.invoicePhoto && (
                                                                <a href={log.invoicePhoto} target="_blank" rel="noreferrer"
                                                                    className="inline-flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:text-blue-800 font-medium">
                                                                    <Camera size={11} /> Ver factura adjunta
                                                                </a>
                                                            )}
                                                            {log.alertAtKm && kmStatus && (
                                                                <span className={`inline-flex items-center gap-1 mt-1.5 text-xs font-bold px-2 py-0.5 rounded-full border ${kmStatus.color}`}>
                                                                    {kmStatus.icon === 'critical' ? <AlertTriangle size={10}/> : <Clock size={10}/>}
                                                                    🔔 Alerta a {parseInt(log.alertAtKm).toLocaleString('es-ES')} km — {kmStatus.label}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button onClick={() => handleEditMaint(log)} className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all" title="Editar">
                                                            <Pencil size={14} />
                                                        </button>
                                                        <button onClick={() => handleDeleteMaint(log.id)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Eliminar">
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── DOCUMENTOS TAB ── */}
                    {activeTab === 'documentos' && (
                        <div className="space-y-4 animate-in fade-in">
                            {/* Upload Form */}
                            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
                                <h4 className="font-bold text-slate-700 flex items-center gap-2"><Upload size={16} className="text-blue-500" /> Subir Nuevo Documento</h4>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Tipo</label>
                                        <select value={uploadDocType} onChange={e => setUploadDocType(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                                            {DOC_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Etiqueta</label>
                                        <input type="text" placeholder="Ej: Seguro Mapfre 2025" value={uploadLabel} onChange={e => setUploadLabel(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Fecha Vencimiento</label>
                                        <input type="date" value={uploadExpiry} onChange={e => setUploadExpiry(e.target.value)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                                    </div>
                                </div>
                                <label className="cursor-pointer w-full flex items-center justify-center gap-2 border-2 border-dashed border-blue-200 hover:border-blue-400 bg-blue-50/50 hover:bg-blue-50 text-blue-600 font-bold rounded-xl py-3 text-sm transition-all">
                                    <Upload size={16} /> Seleccionar archivo y subir
                                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                                </label>
                            </div>

                            {documents.length === 0 ? (
                                <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-10 text-center flex flex-col items-center">
                                    <div className="bg-slate-100 p-4 rounded-full mb-3 text-slate-400"><FileText size={32} /></div>
                                    <p className="text-slate-600 font-medium">No hay documentos subidos</p>
                                    <p className="text-slate-400 text-sm mt-1">Seguro, ITV, Permiso de circulación...</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {documents.map((doc) => {
                                        const expStatus = getExpiryStatus(doc.expiryDate);
                                        return (
                                            <div key={doc.id} className={`bg-white border rounded-xl p-4 shadow-sm flex items-center justify-between group hover:border-blue-300 transition-colors ${expStatus?.icon === 'critical' ? 'border-red-300' : expStatus?.icon === 'warning' ? 'border-amber-300' : 'border-slate-200'}`}>
                                                <div className="flex items-center gap-4 flex-1 min-w-0">
                                                    <div className={`p-3 rounded-lg shrink-0 ${expStatus?.icon === 'critical' ? 'bg-red-50 text-red-500' : expStatus?.icon === 'warning' ? 'bg-amber-50 text-amber-500' : 'bg-blue-50 text-blue-600'}`}><FileText size={20} /></div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <p className="font-bold text-slate-700 truncate">{doc.name}</p>
                                                            {doc.docType && <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 shrink-0">{doc.docType}</span>}
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                                                            <span className="text-xs text-slate-400">Subido {doc.date} · {doc.size}</span>
                                                            {doc.expiryDate && (
                                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 ${expStatus?.color}`}>
                                                                    {expStatus?.icon === 'critical' ? <AlertTriangle size={10} /> : expStatus?.icon === 'ok' ? <CheckCircle size={10} /> : <Clock size={10} />}
                                                                    {expStatus?.label} · {new Date(doc.expiryDate).toLocaleDateString('es-ES')}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                                                    <a
                                                        href={doc.dataUrl}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        download={doc.dataUrl?.startsWith('data:') ? doc.name : undefined}
                                                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                                                        title="Abrir documento"
                                                    ><Download size={18} /></a>
                                                    <button onClick={() => handleDeleteDocument(doc.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Eliminar"><Trash2 size={18} /></button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
