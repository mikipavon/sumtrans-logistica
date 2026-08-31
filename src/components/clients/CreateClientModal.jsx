import { X, Building2, MapPin, Tag, Phone, Map as MapIcon, FileCode, Euro, CreditCard, Briefcase, ListChecks, Shield, Lock, User, Mail, Image as ImageIcon, Upload, Trash2, Percent, Plus, Edit2, ChevronDown, ChevronUp, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { uploadProof } from '../../utils/storage';
import { compressImage, esImagenComprimible } from '../../utils/imageCompression';
import { getAgencies } from '../../utils/agencyOwnership';
import { esRegistroWeb } from '../../utils/altaClientes';
import { calcularComisionReembolso, COMISION_FIJA, COMISION_PORCENTAJE } from '../../utils/comisionReembolso';

const TABS = [
    { id: 'general', label: 'General', icon: FileCode },
    { id: 'direccion', label: 'Dir.', icon: MapPin },
    { id: 'contacto', label: 'Contacto', icon: Phone },
    { id: 'comercial', label: 'Comercial', icon: Briefcase },
    { id: 'bancario', label: 'Bancario', icon: CreditCard },
    { id: 'articulos', label: 'Artículos', icon: ListChecks },
    { id: 'sedes', label: 'Sedes', icon: Building2 },
    { id: 'reglas', label: 'Reglas', icon: ShieldCheck },
    { id: 'acceso', label: 'Acceso', icon: Shield },
];

const inputCls = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors";
const labelCls = "block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1";

function Field({ label, children }) {
    return (
        <div>
            <label className={labelCls}>{label}</label>
            {children}
        </div>
    );
}

const SPAIN_PROVINCES = {
    '01': 'Álava', '02': 'Albacete', '03': 'Alicante', '04': 'Almería', '05': 'Ávila',
    '06': 'Badajoz', '07': 'Islas Baleares', '08': 'Barcelona', '09': 'Burgos', '10': 'Cáceres',
    '11': 'Cádiz', '12': 'Castellón', '13': 'Ciudad Real', '14': 'Córdoba', '15': 'A Coruña',
    '16': 'Cuenca', '17': 'Girona', '18': 'Granada', '19': 'Guadalajara', '20': 'Guipúzcoa',
    '21': 'Huelva', '22': 'Huesca', '23': 'Jaén', '24': 'León', '25': 'Lleida',
    '26': 'La Rioja', '27': 'Lugo', '28': 'Madrid', '29': 'Málaga', '30': 'Murcia',
    '31': 'Navarra', '32': 'Ourense', '33': 'Asturias', '34': 'Palencia', '35': 'Las Palmas',
    '36': 'Pontevedra', '37': 'Salamanca', '38': 'Santa Cruz de Tenerife', '39': 'Cantabria', '40': 'Segovia',
    '41': 'Sevilla', '42': 'Soria', '43': 'Tarragona', '44': 'Teruel', '45': 'Toledo',
    '46': 'Valencia', '47': 'Valladolid', '48': 'Vizcaya', '49': 'Zamora', '50': 'Zaragoza',
    '51': 'Ceuta', '52': 'Melilla'
};

// ── Dónde ha ido a parar la ficha que estorba ──
//
// El listado de Clientes no las enseña todas: las que están pendientes de
// validar no salen ahí, salen en Validar Clientes. Así que decir sólo "el Nº 73
// ya está cogido" deja a quien lo lee buscando en el listado una ficha que
// nunca va a aparecer. Aquí se dice en qué pantalla está.
function dondeEstaLaFicha(ficha) {
    if (!ficha) return 'Usa otro número.';
    if (ficha.status === 'pending') {
        // Las de prueba no salen NI en el listado ni en Validar —ese filtra por
        // !isTest—, así que ocupan un número sin aparecer por ninguna parte. Si
        // no se dice aquí, no hay forma humana de dar con ellas.
        if (ficha.isTest) {
            return 'Esa ficha es de PRUEBAS y está pendiente, así que no sale ni en Clientes ni en Validar Clientes: sólo ocupa el número. Usa otro número.';
        }
        // Validar Clientes abre en la pestaña "Creados al hacer albaranes", que
        // esconde los registros de la web. Están ahí, pero en la otra pestaña.
        if (esRegistroWeb(ficha)) {
            return 'Esa ficha está pendiente y viene de un REGISTRO DE LA WEB: en "Validar Clientes" pulsa la pestaña "Todos" para verla, que la de inicio no la enseña.';
        }
        return 'Esa ficha está PENDIENTE DE VALIDAR, por eso no la ves en el listado de Clientes: búscala en "Validar Clientes", pestaña "Todos". Valídala, bórrala, o usa otro número.';
    }
    if (ficha.ownerAgencyId) {
        return 'Esa ficha es de la base de datos de una agencia, así que sólo la ves con el filtro de esa agencia puesto. Usa otro número.';
    }
    return 'Usa otro número, o deja el campo en blanco y se pone solo.';
}

// Qué decirle a quien está delante cuando la ficha no se ha guardado. Cada
// motivo lleva su salida: si el nombre choca, la ficha que estorba tiene nombre
// y número para poder ir a buscarla.
function explicarFalloDeAlta(resultado) {
    const ficha = resultado?.ficha;
    const comoSeLlama = ficha ? `"${ficha.name || 'sin nombre'}"${ficha.clientNumber ? ` (Nº ${ficha.clientNumber})` : ''}` : 'otra ficha';

    switch (resultado?.motivo) {
        case 'sin-nombre':
            return 'La ficha necesita un nombre para poder guardarse.';
        case 'duplicado':
            return resultado.esSede
                ? `Ese nombre ya es una SEDE de ${`"${resultado.fichaMadre?.name || ''}"`}. Edita esa sede, o ponle un nombre distinto a la ficha nueva.`
                : `Ya existe la ficha ${comoSeLlama} con ese mismo nombre. Edítala, o ponle un nombre distinto a la nueva.`;
        case 'duplicado-en-base':
            return `Ya existe la ficha ${comoSeLlama} con ese nombre, creada desde otro equipo. Búscala en el listado y edítala.`;
        default:
            return `No se ha podido guardar la ficha: ${resultado?.error?.message || 'revisa la conexión e inténtalo otra vez'}.`;
    }
}

export default function CreateClientModal({ isOpen, onClose, onSave, articles, tariffs, initialData, allPoblaciones, allClients }) {
    const [activeTab, setActiveTab] = useState('general');
    const [formData, setFormData] = useState({});

    const defaultForm = {
        // App fields
        clientNumber: '', name: '', legalName: '', cif: '', address: '', city: '', zip: '', province: '',
        phone: '', mobile: '', email: '', coordinates: '',
        opAddress: '', opCity: '', opZip: '',
        type: 'Remitente', billingType: 'Clientes Habituales', tariffType: 'General',
        customRates: {}, customRatesB2: {}, allowedArticles: [], codFee: '', codFeeMode: COMISION_FIJA, codFeePercent: '', codFeeMin: '', color: '#ef4444', 
        priority: 'urgent',
        username: '', password: '', accessEmail: '',
        // Factusol extra
        country: '', fax: '', contactPerson: '', agent: '',
        paymentMethod: '', financingPct: '', promptPaymentPct: '',
        tariff: '', payDay1: '', payDay2: '', payDay3: '',
        clientType: '', discount1: '', discount2: '', discount3: '',
        specialTariff: '', supplierCode: '', activities: '',
        freightType: '', freightText: '', applyToClient: '',
        vatType: '', equivalenceSurcharge: '',
        registrationDate: '', birthDate: '',
        bank: '', bankEntity: '', bankOffice: '', account: '', controlDigit: '',
        agencyLogoUrl: null,
        // Pertenencia: null = cartera propia de SUM. Ver utils/agencyOwnership.js
        isAgency: false,
        ownerAgencyId: null,
        weightTariff: [],
        branches: [],
        // Delivery Rules
        requireWeight: false,
        requireName: true,
        requireDNI: false,
        requirePhoto: false,
        requireSignature: false,
    };

    // Agencias disponibles para asignar la ficha, excluyendo la que se está editando
    // (una agencia no puede pertenecerse a sí misma).
    const agencyOptions = getAgencies(allClients).filter(a => String(a.id) !== String(initialData?.id));

    const fileInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [clientNumberError, setClientNumberError] = useState('');
    // Por qué no se ha podido guardar la ficha. Se enseña dentro del formulario,
    // que sigue abierto con los datos puestos, en vez de cerrarlo sin más.
    const [saveError, setSaveError] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'category', direction: 'asc' });
    const [searchArticle, setSearchArticle] = useState('');

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
        setSortConfig({ key, direction });
    };

    const sortedArticles = [...(articles || [])].sort((a, b) => {
        if (!sortConfig.key) return 0;

        if (sortConfig.key === 'category') {
            const catA = String(a.category || 'zzzz').toLowerCase();
            const catB = String(b.category || 'zzzz').toLowerCase();
            if (catA !== catB) {
                return sortConfig.direction === 'asc' ? catA.localeCompare(catB) : catB.localeCompare(catA);
            }
            // Secondary sort by name
            return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
        }

        const aVal = sortConfig.key === 'price' ? parseFloat(a[sortConfig.key] || 0) : String(a[sortConfig.key] || '').toLowerCase();
        const bVal = sortConfig.key === 'price' ? parseFloat(b[sortConfig.key] || 0) : String(b[sortConfig.key] || '').toLowerCase();
        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <span className="opacity-30 text-[10px]">↕</span>;
        return sortConfig.direction === 'asc' ? <span className="text-blue-500 text-[10px]">↑</span> : <span className="text-blue-500 text-[10px]">↓</span>;
    };

    useEffect(() => {
        if (isOpen) {
            setActiveTab('general');
            if (initialData) {
                setFormData({ ...defaultForm, ...initialData });
            } else {
                setFormData({ ...defaultForm });
            }
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const set = (key, val) => setFormData(prev => ({ ...prev, [key]: val }));

    // --- AUTO-FILL LOGIC ---
    const handleZipChange = (val) => {
        set('zip', val);
        if (!val || val.length < 2) return;
        
        const prefix = val.substring(0, 2);
        const defaultProvince = SPAIN_PROVINCES[prefix];
        
        setFormData(prev => {
            const updates = { ...prev, zip: val };
            
            // Search in Tariffs for prefix match (prioritize custom data)
            const matchingTariff = (tariffs || []).find(t => t.zipPrefix === prefix);
            
            if (matchingTariff) {
                if (matchingTariff.match && (!prev.city || prev.city === '')) updates.city = matchingTariff.match;
                if (matchingTariff.province && (!prev.province || prev.province === '')) updates.province = matchingTariff.province;
                if (matchingTariff.country && (!prev.country || prev.country === '')) updates.country = matchingTariff.country;
            }

            // Fallback to Spain Provinces map if still empty
            if (!updates.province && defaultProvince) {
                updates.province = defaultProvince;
                if (!updates.country) updates.country = 'España';
            }

            return updates;
        });
    };

    const handleCityChange = (val) => {
        set('city', val);
        if (!val) return;

        const normalizedCity = val.trim().toLowerCase();
        const matchingTariff = (tariffs || []).find(t => (t.match || '').toLowerCase() === normalizedCity);
        
        if (matchingTariff) {
            setFormData(prev => {
                const updates = { ...prev, city: val };
                if (matchingTariff.zipPrefix && (!prev.zip || prev.zip === '')) {
                    updates.zip = matchingTariff.zipPrefix;
                    // Auto-fill province/country if found in tariff OR mapping
                    const province = matchingTariff.province || SPAIN_PROVINCES[matchingTariff.zipPrefix];
                    if (province && (!prev.province || prev.province === '')) {
                        updates.province = province;
                        updates.country = matchingTariff.country || 'España';
                    }
                }
                return updates;
            });
        }
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        e.target.value = '';
        if (!file) return;
        try {
            // El logo se encoge pero se guarda en PNG: en JPEG perdería el fondo
            // transparente. Los SVG van tal cual.
            const dataUrl = esImagenComprimible(file)
                ? await compressImage(file, 600, 300, 1, 'image/png')
                : await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });
            set('agencyLogoUrl', dataUrl); // Base64 temporal para previsualización
        } catch (err) {
            console.error('[Logo] No se pudo procesar la imagen:', err);
            alert('No se ha podido procesar la imagen. Prueba con otra.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setClientNumberError('');
        setSaveError('');

        // --- Validación de Nº Cliente duplicado ---
        const enteredNumber = String(formData.clientNumber || '').trim();
        if (enteredNumber) {
            const editingId = initialData?.id;
            const duplicate = (allClients || []).find(c => {
                if (editingId && String(c.id) === String(editingId)) return false; // Excluir el propio cliente al editar
                return String(c.clientNumber || '').trim() === enteredNumber;
            });
            if (duplicate) {
                setClientNumberError(`Nº ${enteredNumber} ya asignado a "${duplicate.name || 'otro cliente'}". ${dondeEstaLaFicha(duplicate)}`);
                setActiveTab('general');
                return;
            }
        }

        setIsUploading(true);

        try {
            let finalLogoUrl = formData.agencyLogoUrl;

            // Si es un Base64 (nueva subida), intentamos subirlo a Storage
            if (formData.agencyLogoUrl && formData.agencyLogoUrl.startsWith('data:image')) {
                const fileName = `logo_${formData.name || 'client'}_${Date.now()}`;
                try {
                    // Intento de subida normal
                    finalLogoUrl = await uploadProof(fileName, formData.agencyLogoUrl, 'agency_logos');
                } catch (uploadError) {
                    console.warn("Fallo la subida a Storage (posible falta de permisos o bucket). Usando Base64 como fallback para garantizar el funcionamiento.", uploadError);
                    // Si falla, mantenemos finalLogoUrl como el Base64 que ya tiene (formData.agencyLogoUrl)
                    // No lanzamos error para que el cliente pueda guardarse igualmente
                }
            }

            // Se espera la respuesta: si la ficha no llega a guardarse, cerrar
            // aquí borraría todo lo tecleado sin decir por qué. Es lo que
            // pasaba cuando el nombre ya existía en otra ficha o en una sede:
            // el alta se descartaba en silencio y el formulario se cerraba
            // como si hubiera ido bien.
            const resultado = await onSave(initialData ? { ...formData, agencyLogoUrl: finalLogoUrl, id: initialData.id } : { ...formData, agencyLogoUrl: finalLogoUrl });

            if (resultado && resultado.ok === false) {
                setSaveError(explicarFalloDeAlta(resultado));
                setActiveTab('general');
                return;
            }

            onClose();
        } catch (error) {
            console.error("Error al guardar cliente con logo:", error);
            alert(`Error al guardar los datos: ${error.message || "Por favor, inténtalo de nuevo."}`);
        } finally {
            setIsUploading(false);
        }
    };

    const handleRateChange = (articleId, newPrice, isB2 = false) => {
        const key = isB2 ? 'customRatesB2' : 'customRates';
        setFormData(prev => ({ ...prev, [key]: { ...prev[key], [articleId]: newPrice } }));
    };

    const toggleArticle = (articleId) => {
        setFormData(prev => {
            const current = prev.allowedArticles || [];
            return current.includes(articleId)
                ? { ...prev, allowedArticles: current.filter(id => id !== articleId) }
                : { ...prev, allowedArticles: [...current, articleId] };
        });
    };

    const moveArticle = (index, direction) => {
        setFormData(prev => {
            const current = [...(prev.allowedArticles || [])];
            if (index + direction < 0 || index + direction >= current.length) return prev;
            const temp = current[index];
            current[index] = current[index + direction];
            current[index + direction] = temp;
            return { ...prev, allowedArticles: current };
        });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2">
                        <Building2 size={20} className="text-blue-600" />
                        {initialData ? 'Editar Ficha de Cliente' : 'Nueva Ficha de Cliente'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100 bg-white shrink-0 overflow-x-auto">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-1 px-3 py-3 text-xs font-medium border-b-2 transition-all whitespace-nowrap ${active
                                        ? 'border-blue-600 text-blue-600 bg-blue-50/50'
                                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                    }`}
                            >
                                <Icon size={14} />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>

                {/* Content */}
                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    <div className="flex-1 overflow-y-auto p-6">

                        {/* ─── TAB: GENERAL ─── */}
                        {activeTab === 'general' && (
                            <div className="space-y-5">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Nº Cliente (Opcional)">
                                        <input type="text" className={`${inputCls} ${clientNumberError ? 'border-red-500 ring-2 ring-red-500/20 bg-red-50' : ''}`} placeholder="Auto"
                                            value={formData.clientNumber || ''} onChange={e => { set('clientNumber', e.target.value); setClientNumberError(''); }} />
                                        {clientNumberError ? (
                                            <p className="text-[11px] text-red-600 font-bold mt-1 animate-pulse">⚠️ {clientNumberError}</p>
                                        ) : (
                                            <p className="text-[10px] text-slate-400 mt-1">Si lo dejas en blanco, se asignará el siguiente número libre.</p>
                                        )}
                                    </Field>
                                    <Field label="Nombre Comercial (App) *">
                                        <input type="text" required className={inputCls} placeholder="Ej: Pizzería Carlos"
                                            value={formData.name || ''} onChange={e => set('name', e.target.value)} />
                                        <p className="text-[10px] text-slate-400 mt-1">Nombre que aparecerá en la app y búsquedas.</p>
                                    </Field>
                                    <Field label="Razón Social (Fiscal)">
                                        <input type="text" className={inputCls} placeholder="Ej: Restauración Andaluza S.L."
                                            value={formData.legalName || ''} onChange={e => set('legalName', e.target.value)} />
                                        <p className="text-[10px] text-slate-400 mt-1">Nombre que aparecerá en facturas.</p>
                                    </Field>
                                    <Field label="NIF / CIF">
                                        <input type="text" className={inputCls} placeholder="B-12345678"
                                            value={formData.cif || ''} onChange={e => set('cif', e.target.value)} />
                                    </Field>
                                    <Field label="Tipo de Cliente (App)">
                                        <select className={inputCls} value={formData.type || 'Remitente'} onChange={e => set('type', e.target.value)}>
                                            <option value="Remitente">Remitente</option>
                                            <option value="Destinatario">Destinatario</option>
                                            <option value="Ambos">Ambos</option>
                                        </select>
                                    </Field>
                                    <Field label="Base de Datos (Pertenencia)">
                                        <select className={inputCls}
                                            value={formData.ownerAgencyId ? String(formData.ownerAgencyId) : ''}
                                            disabled={!!formData.isAgency}
                                            onChange={e => {
                                                const picked = agencyOptions.find(a => String(a.id) === e.target.value);
                                                set('ownerAgencyId', picked ? picked.id : null);
                                            }}>
                                            <option value="">🏠 Mis clientes (SUM)</option>
                                            {agencyOptions.map(a => (
                                                <option key={a.id} value={String(a.id)}>🚚 {a.name}</option>
                                            ))}
                                        </select>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            {formData.isAgency
                                                ? 'Las agencias son clientes tuyos: siempre en tu base de datos.'
                                                : 'Si la ficha es de una agencia, se borrará con ella al darla de baja.'}
                                        </p>
                                    </Field>
                                    <Field label="¿Es Agencia de Transporte?">
                                        <label className="flex items-center gap-2 cursor-pointer mt-2 group">
                                            <input type="checkbox" checked={!!formData.isAgency}
                                                onChange={e => {
                                                    set('isAgency', e.target.checked);
                                                    // Una agencia nunca pertenece a otra bolsa: es cliente directo de SUM.
                                                    if (e.target.checked) set('ownerAgencyId', null);
                                                }}
                                                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500" />
                                            <span className={`text-sm font-bold transition-colors ${formData.isAgency ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-600'}`}>
                                                Sí, trae carga de sus propios clientes
                                            </span>
                                        </label>
                                        <p className="text-[10px] text-slate-400 mt-1">Marca TSB, TXT y XPO. Sus destinatarios irán a una base de datos aparte.</p>
                                    </Field>
                                    <Field label="Tipo de Cobro">
                                        <div className="flex gap-4 mt-1">
                                            {['Facturación', 'Clientes Habituales', 'Presupuesto'].map(v => (
                                                <label key={v} className="flex items-center gap-2 cursor-pointer">
                                                    <input type="radio" name="billingType" value={v}
                                                        checked={formData.billingType === v} onChange={e => set('billingType', e.target.value)}
                                                        className="text-blue-600 focus:ring-blue-500" />
                                                    <span className="text-sm font-medium text-slate-700">{v}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </Field>
                                    <Field label="Prioridad de Servicio">
                                        <div className="flex gap-4 mt-1">
                                            {[
                                                { id: 'urgent', label: 'Urgente', color: '#ef4444' },
                                                { id: 'normal', label: 'Estándar', color: '#64748b' }
                                            ].map(v => (
                                                <label key={v.id} className="flex items-center gap-2 cursor-pointer group">
                                                    <input 
                                                        type="radio" 
                                                        name="priority" 
                                                        value={v.id}
                                                        checked={formData.priority === v.id} 
                                                        onChange={e => {
                                                            set('priority', e.target.value);
                                                            // Sugerir color si el actual es el de otra prioridad
                                                            if (formData.color === '#ef4444' || formData.color === '#64748b' || !formData.color) {
                                                                set('color', v.color);
                                                            }
                                                        }}
                                                        className="text-blue-600 focus:ring-blue-500" 
                                                    />
                                                    <span className={`text-sm font-bold transition-colors ${formData.priority === v.id ? (v.id === 'urgent' ? 'text-red-600' : 'text-slate-600') : 'text-slate-400 group-hover:text-slate-500'}`}>
                                                        {v.label}
                                                    </span>
                                                </label>
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">Influye en la optimización automática de la ruta del conductor.</p>
                                    </Field>
                                    <Field label="Etiqueta de Marca (Opcional)">
                                        <input type="text" className={inputCls} placeholder="Ej: logistica_plus (dejar vacío para SUM)"
                                            value={formData.agencyLabel || ''} onChange={e => set('agencyLabel', e.target.value)} />
                                        <p className="text-[10px] text-slate-400 mt-1">Si se rellena, sus envíos mostrarán esta marca en lugar del logo de SUM.</p>
                                    </Field>
                                    <Field label="Logo o Banner Personalizado">
                                        <div className="mt-1 flex items-center gap-4">
                                            <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden relative group">
                                                {formData.agencyLogoUrl ? (
                                                    <>
                                                        <img src={formData.agencyLogoUrl} alt="Preview" className="w-full h-full object-contain" />
                                                        <button 
                                                            type="button"
                                                            onClick={() => set('agencyLogoUrl', null)}
                                                            className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                                                        >
                                                            <Trash2 className="text-white" size={18} />
                                                        </button>
                                                    </>
                                                ) : (
                                                    <ImageIcon className="text-slate-300" size={24} />
                                                )}
                                            </div>
                                            <div className="flex-1">
                                                <button
                                                    type="button"
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                                                >
                                                    <Upload size={16} className="text-blue-600" />
                                                    {formData.agencyLogoUrl ? 'Cambiar Logo' : 'Subir Logo'}
                                                </button>
                                                <input 
                                                    type="file" 
                                                    ref={fileInputRef} 
                                                    className="hidden" 
                                                    accept="image/*" 
                                                    onChange={handleFileChange} 
                                                />
                                                <p className="text-[10px] text-slate-400 mt-2">
                                                    Formato recomendado: PNG o JPG. Se mostrará en la tarjeta del repartidor.
                                                </p>
                                            </div>
                                        </div>
                                    </Field>
                                    <Field label="Color Distintivo">
                                        <div className="flex items-center gap-3 mt-1">
                                            <input type="color" className="w-10 h-9 rounded cursor-pointer border border-slate-200"
                                                value={formData.color || '#ef4444'} onChange={e => set('color', e.target.value)} />
                                            <span className="text-sm text-slate-500">Apariencia en mapa y listados</span>
                                        </div>
                                    </Field>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: DIRECCIÓN ─── */}
                        {activeTab === 'direccion' && (
                            <div className="space-y-4">
                                <Field label="Domicilio">
                                    <input type="text" className={inputCls} placeholder="Calle, Número, Polígono..."
                                        value={formData.address || ''} onChange={e => set('address', e.target.value)} />
                                </Field>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Población">
                                        <input type="text" className={inputCls} placeholder="Madrid"
                                            value={formData.city || ''} onChange={e => handleCityChange(e.target.value)} 
                                            list="poblaciones-list" />
                                    </Field>
                                    <Field label="Código Postal">
                                        <input type="text" className={inputCls} placeholder="28001"
                                            value={formData.zip || ''} onChange={e => handleZipChange(e.target.value)} />
                                    </Field>
                                    <Field label="Provincia">
                                        <input type="text" className={inputCls} placeholder="Madrid"
                                            value={formData.province || ''} onChange={e => set('province', e.target.value)} />
                                    </Field>
                                    <Field label="País">
                                        <input type="text" className={inputCls} placeholder="España"
                                            value={formData.country || ''} onChange={e => set('country', e.target.value)} />
                                    </Field>
                                    <Field label="Coordenadas GPS">
                                        <div className="relative">
                                            <MapIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                            <input type="text" className={`${inputCls} pl-9`} placeholder="40.416, -3.703"
                                                value={formData.coordinates || ''} onChange={e => set('coordinates', e.target.value)} />
                                        </div>
                                    </Field>
                                </div>

                                <div className="pt-4 mt-4 border-t border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-700 mb-2">Dirección Operativa (Sede Física)</h4>
                                    <p className="text-xs text-slate-500 mb-4">
                                        Rellena esto <b>sólo</b> si la dirección donde vas a recoger o entregarle habitualmente 
                                        es distinta a la dirección de facturación (Ej. Facturación en Madrid, pero sede física en Córdoba).
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="md:col-span-2">
                                            <Field label="Domicilio Operativo">
                                                <input type="text" className={inputCls} placeholder="Calle física, naves..."
                                                    value={formData.opAddress || ''} onChange={e => set('opAddress', e.target.value)} />
                                            </Field>
                                        </div>
                                        <Field label="Población Operativa">
                                            <input type="text" className={inputCls} placeholder="Córdoba"
                                                value={formData.opCity || ''} onChange={e => set('opCity', e.target.value)} />
                                        </Field>
                                        <Field label="C.P. Operativo">
                                            <input type="text" className={inputCls} placeholder="14001"
                                                value={formData.opZip || ''} onChange={e => set('opZip', e.target.value)} />
                                        </Field>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: CONTACTO ─── */}
                        {activeTab === 'contacto' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Field label="Teléfono">
                                    <input type="tel" className={inputCls} placeholder="+34 600..."
                                        value={formData.phone || ''} onChange={e => set('phone', e.target.value)} />
                                </Field>
                                <Field label="Móvil">
                                    <input type="tel" className={inputCls} placeholder="+34 620..."
                                        value={formData.mobile || ''} onChange={e => set('mobile', e.target.value)} />
                                </Field>
                                <Field label="Fax">
                                    <input type="tel" className={inputCls} placeholder="+34 91..."
                                        value={formData.fax || ''} onChange={e => set('fax', e.target.value)} />
                                </Field>
                                <Field label="E-mail">
                                    <input type="email" className={inputCls} placeholder="cliente@empresa.com"
                                        value={formData.email || ''} 
                                        onChange={e => {
                                            const val = e.target.value;
                                            set('email', val);
                                            // Si el usuario está vacío o era igual al email anterior, lo actualizamos al nuevo email
                                            if (!formData.username || formData.username === formData.email) {
                                                set('username', val);
                                            }
                                        }} 
                                    />
                                </Field>
                                <Field label="Persona de Contacto">
                                    <input type="text" className={inputCls} placeholder="Juan García"
                                        value={formData.contactPerson || ''} onChange={e => set('contactPerson', e.target.value)} />
                                </Field>
                                <Field label="Agente Comercial">
                                    <input type="text" className={inputCls} placeholder="Código de agente"
                                        value={formData.agent || ''} onChange={e => set('agent', e.target.value)} />
                                </Field>
                            </div>
                        )}

                        {/* ─── TAB: COMERCIAL ─── */}
                        {activeTab === 'comercial' && (
                            <div className="space-y-6">
                                {/* Tarifas App */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                        <Euro size={15} className="text-green-600" /> Tarifas y Precios (App)
                                    </h4>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <Field label="Tipo de Tarifa">
                                            <div className="flex gap-4 mt-1">
                                                {['General', 'Personalizada', 'Por Kilos'].map(v => (
                                                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" name="tariffType" value={v}
                                                            checked={formData.tariffType === v} onChange={e => {
                                                                set('tariffType', e.target.value);
                                                                // Si cambia a "Por Kilos" y no tiene tramos, crear unos por defecto
                                                                if (e.target.value === 'Por Kilos' && (!formData.weightTariff || formData.weightTariff.length === 0)) {
                                                                    set('weightTariff', [
                                                                        { maxKg: 20, price: '' },
                                                                        { maxKg: 40, price: '' },
                                                                        { maxKg: 60, price: '' },
                                                                        { maxKg: 80, price: '' },
                                                                        { maxKg: 100, price: '' },
                                                                        { maxKg: 150, price: '' },
                                                                        { maxKg: 200, price: '' },
                                                                        { maxKg: 250, price: '' },
                                                                        { maxKg: 300, price: '' },
                                                                        { maxKg: 350, price: '' },
                                                                        { maxKg: 400, price: '' },
                                                                        { maxKg: 450, price: '' },
                                                                        { maxKg: 500, price: '' },
                                                                        { maxKg: 600, price: '' },
                                                                        { maxKg: 700, price: '' },
                                                                        { maxKg: 800, price: '' },
                                                                        { maxKg: 900, price: '' },
                                                                        { maxKg: 1000, price: '' }
                                                                    ]);
                                                                }
                                                            }} />
                                                        <span className={`text-sm font-medium ${formData.tariffType === v ? (v === 'Por Kilos' ? 'text-indigo-700' : 'text-slate-700') : 'text-slate-700'}`}>
                                                            {v === 'Por Kilos' ? '⚖️ Por Kilos' : v}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                        </Field>
                                        <div className="md:col-span-2">
                                            <label className={labelCls}>Servicio de Reembolso (COD)</label>
                                            <div className="flex flex-wrap gap-4 mt-1 mb-3">
                                                {[{ id: COMISION_FIJA, label: 'Importe fijo' }, { id: COMISION_PORCENTAJE, label: '% del reembolso' }].map(m => (
                                                    <label key={m.id} className="flex items-center gap-2 cursor-pointer">
                                                        <input type="radio" name="codFeeMode" value={m.id}
                                                            checked={(formData.codFeeMode || COMISION_FIJA) === m.id}
                                                            onChange={e => set('codFeeMode', e.target.value)} />
                                                        <span className={`text-sm font-medium ${(formData.codFeeMode || COMISION_FIJA) === m.id ? 'text-green-700' : 'text-slate-500'}`}>
                                                            {m.label}
                                                        </span>
                                                    </label>
                                                ))}
                                            </div>
                                            {(formData.codFeeMode || COMISION_FIJA) === COMISION_PORCENTAJE ? (
                                                <>
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Porcentaje</label>
                                                            <div className="relative">
                                                                <Percent className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                                                <input type="number" step="0.01" min="0" className={`${inputCls} pl-9`} placeholder="3.00"
                                                                    value={formData.codFeePercent || ''} onChange={e => set('codFeePercent', e.target.value)} />
                                                            </div>
                                                        </div>
                                                        <div>
                                                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mínimo</label>
                                                            <div className="relative">
                                                                <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                                                <input type="number" step="0.01" min="0" className={`${inputCls} pl-9`} placeholder="0.00"
                                                                    value={formData.codFeeMin || ''} onChange={e => set('codFeeMin', e.target.value)} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                    {/* Lo que de verdad se le va a cobrar, para no tener que fiarse de la cuenta mental. */}
                                                    <p className="text-[10px] text-slate-500 mt-2">
                                                        {[50, 100, 500].map(ejemplo => (
                                                            <span key={ejemplo} className="mr-3 whitespace-nowrap">
                                                                Reembolso {ejemplo} € → <strong className="text-green-700">{calcularComisionReembolso(formData, ejemplo).toFixed(2)} €</strong>
                                                            </span>
                                                        ))}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 mt-1">Se cobra el porcentaje del reembolso, y nunca menos del mínimo.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="relative">
                                                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                                        <input type="number" step="0.01" min="0" className={`${inputCls} pl-9`} placeholder="0.00"
                                                            value={formData.codFee || ''} onChange={e => set('codFee', e.target.value)} />
                                                    </div>
                                                    <p className="text-[10px] text-slate-400 mt-1">Se suma al porte si el envío lleva reembolso, dé lo que dé el reembolso.</p>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Tabla tarifas personalizadas */}
                                {formData.tariffType === 'Personalizada' && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                            <table className="w-full text-sm">
                                                <thead className="bg-slate-50 border-b border-slate-200">
                                                    <tr>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('category')}>
                                                            <div className="flex items-center gap-1">Familia <SortIcon column="category" /></div>
                                                        </th>
                                                        <th className="px-4 py-2 text-left font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('name')}>
                                                            <div className="flex items-center gap-1">Artículo <SortIcon column="name" /></div>
                                                        </th>
                                                        <th className="px-4 py-2 text-right font-medium text-slate-600 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('price')}>
                                                            <div className="flex items-center justify-end gap-1">P. General <SortIcon column="price" /></div>
                                                        </th>
                                                        <th className="px-4 py-2 text-right font-medium text-slate-600">P. Cliente (B1)</th>
                                                        <th className="px-4 py-2 text-right font-medium text-slate-600">P. Cliente (B2)</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {sortedArticles.map(article => (
                                                        <tr key={article.id}>
                                                            <td className="px-4 py-2 text-slate-700">
                                                                <div className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">{article.category || 'Sin familia'}</div>
                                                            </td>
                                                            <td className="px-4 py-2 text-slate-700">
                                                                <div className="font-medium">{article.name}</div>
                                                                {article.unit && <div className="text-xs text-slate-400">{article.unit}</div>}
                                                            </td>
                                                            <td className="px-4 py-2 text-right text-slate-500">{article.price} €</td>
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="relative inline-block w-24">
                                                                    <input type="number" step="0.01" placeholder={article.price}
                                                                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 text-right pr-6 text-sm"
                                                                        value={formData.customRates?.[article.id] || ''}
                                                                        onChange={e => handleRateChange(article.id, e.target.value, false)} />
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-2 text-right">
                                                                <div className="relative inline-block w-24">
                                                                    <input type="number" step="0.01" placeholder={article.priceB2 || ''}
                                                                        className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded focus:outline-none focus:border-blue-500 text-right pr-6 text-sm"
                                                                        value={formData.customRatesB2?.[article.id] || ''}
                                                                        onChange={e => handleRateChange(article.id, e.target.value, true)} />
                                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                    {(!articles || articles.length === 0) && (
                                                        <tr><td colSpan="5" className="px-4 py-4 text-center text-slate-400 italic">No hay artículos definidos.</td></tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </div>
                                )}

                                {/* Tabla tarifa por kilos */}
                                {formData.tariffType === 'Por Kilos' && (
                                    <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div className="bg-indigo-50/50 rounded-xl p-4 border border-indigo-100">
                                            <h4 className="text-sm font-bold text-indigo-700 flex items-center justify-between mb-3">
                                                <span className="flex items-center gap-2">⚙️ Configuración "Por Kilos"</span>
                                            </h4>
                                            
                                            <div className="mb-4">
                                                <label className="text-xs font-bold text-indigo-900 block mb-1">Modo de Cálculo</label>
                                                <select 
                                                    className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                    value={formData.weightCalculationMode || 'brackets'}
                                                    onChange={(e) => set('weightCalculationMode', e.target.value)}
                                                >
                                                    <option value="brackets">Tramos de Peso (Redondeo al tramo superior)</option>
                                                    <option value="formula">Fórmula Matemática (Kilos Base + Precio por Kg Extra)</option>
                                                </select>
                                            </div>

                                            {(!formData.weightCalculationMode || formData.weightCalculationMode === 'brackets') ? (
                                                <>
                                                    <p className="text-[10px] text-slate-500 mb-3">Define los tramos de peso y su precio. Se cobrará el precio del primer tramo que supere o iguale el peso.</p>
                                            <div className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                                                <div className="grid grid-cols-[1fr_1fr_auto] gap-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-50 border-b border-slate-200">
                                                    <div className="px-3 py-2">Hasta (Kg)</div>
                                                    <div className="px-3 py-2">Precio (€)</div>
                                                    <div className="px-3 py-2"></div>
                                                </div>
                                                {[...(formData.weightTariff || [])].sort((a, b) => a.maxKg - b.maxKg).map((bracket, i) => (
                                                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-0 border-b border-slate-100 last:border-0 items-center hover:bg-slate-50 transition-colors">
                                                        <div className="px-2 py-1.5">
                                                            <input type="number" min="1" className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-indigo-500 text-right"
                                                                value={bracket.maxKg}
                                                                onChange={(e) => {
                                                                    const newTariff = [...formData.weightTariff];
                                                                    const idx = newTariff.findIndex(b => b.maxKg === bracket.maxKg && b.price === bracket.price);
                                                                    if (idx !== -1) newTariff[idx] = { ...newTariff[idx], maxKg: parseInt(e.target.value) || 0 };
                                                                    set('weightTariff', newTariff);
                                                                }} />
                                                        </div>
                                                        <div className="px-2 py-1.5">
                                                            <div className="relative">
                                                                <input type="number" step="0.01" className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-sm focus:outline-none focus:border-indigo-500 text-right pr-6"
                                                                    value={bracket.price}
                                                                    onChange={(e) => {
                                                                        const newTariff = [...formData.weightTariff];
                                                                        const idx = newTariff.findIndex(b => b.maxKg === bracket.maxKg && b.price === bracket.price);
                                                                        if (idx !== -1) newTariff[idx] = { ...newTariff[idx], price: e.target.value };
                                                                        set('weightTariff', newTariff);
                                                                    }} />
                                                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400">€</span>
                                                            </div>
                                                        </div>
                                                        <div className="px-2">
                                                            <button type="button" onClick={() => {
                                                                set('weightTariff', formData.weightTariff.filter((_, idx) => idx !== formData.weightTariff.indexOf(bracket)));
                                                            }} className="p-1 text-slate-300 hover:text-red-500 transition-colors">
                                                                <Trash2 size={14} />
                                                            </button>
                                                    </div>
                                                </div>
                                                ))}
                                                </div>
                                                <button type="button" onClick={() => {
                                                    const sorted = [...(formData.weightTariff || [])].sort((a, b) => a.maxKg - b.maxKg);
                                                    const lastKg = sorted.length > 0 ? sorted[sorted.length - 1].maxKg : 0;
                                                    const lastPrice = sorted.length > 0 ? parseFloat(sorted[sorted.length - 1].price) : 0;
                                                    set('weightTariff', [...(formData.weightTariff || []), { maxKg: lastKg + 50, price: (lastPrice + 3).toFixed(2) }]);
                                                }} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors mt-2">
                                                    + Añadir Tramo
                                                </button>
                                                </>
                                            ) : (
                                                <div className="bg-white rounded-lg border border-indigo-200 p-4 space-y-4">
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="text-xs font-bold text-slate-700 block mb-1">Kilos Base (Hasta)</label>
                                                            <input type="number" step="0.1" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                                value={formData.weightFormula?.baseKg || ''} 
                                                                onChange={e => set('weightFormula', { ...formData.weightFormula, baseKg: e.target.value })} 
                                                                placeholder="Ej: 23" />
                                                        </div>
                                                        <div>
                                                            <label className="text-xs font-bold text-slate-700 block mb-1">Precio Base (€)</label>
                                                            <input type="number" step="0.01" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                                value={formData.weightFormula?.basePrice || ''} 
                                                                onChange={e => set('weightFormula', { ...formData.weightFormula, basePrice: e.target.value })} 
                                                                placeholder="Ej: 3.00" />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="text-xs font-bold text-slate-700 block mb-1">Precio por Kg Extra (€)</label>
                                                        <input type="number" step="0.01" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" 
                                                                value={formData.weightFormula?.extraKgPrice || ''} 
                                                                onChange={e => set('weightFormula', { ...formData.weightFormula, extraKgPrice: e.target.value })} 
                                                                placeholder="Ej: 0.13" />
                                                    </div>
                                                    <div className="bg-slate-50 p-3 rounded text-xs text-slate-600 font-mono">
                                                        Precio = Precio Base + (Kilos Reales - Kilos Base) × Precio Kg Extra
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                                {/* Factusol comercial */}
                                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                                    <h4 className="text-sm font-bold text-slate-700 mb-3">Datos Comerciales (Factusol)</h4>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                        <Field label="Forma de Pago">
                                            <input type="text" className={inputCls} placeholder="Contado / 30 días..."
                                                value={formData.paymentMethod || ''} onChange={e => set('paymentMethod', e.target.value)} />
                                        </Field>
                                        <Field label="Tarifa (Factusol)">
                                            <input type="text" className={inputCls} placeholder="1"
                                                value={formData.tariff || ''} onChange={e => set('tariff', e.target.value)} />
                                        </Field>
                                        <Field label="Tipo de Portes">
                                            <input type="text" className={inputCls} placeholder="Pagado / Debido"
                                                value={formData.freightType || ''} onChange={e => set('freightType', e.target.value)} />
                                        </Field>
                                        <Field label="Día de Pago 1">
                                            <input type="number" className={inputCls} placeholder="5"
                                                value={formData.payDay1 || ''} onChange={e => set('payDay1', e.target.value)} />
                                        </Field>
                                        <Field label="Día de Pago 2">
                                            <input type="number" className={inputCls} placeholder="20"
                                                value={formData.payDay2 || ''} onChange={e => set('payDay2', e.target.value)} />
                                        </Field>
                                        <Field label="Día de Pago 3">
                                            <input type="number" className={inputCls} placeholder=""
                                                value={formData.payDay3 || ''} onChange={e => set('payDay3', e.target.value)} />
                                        </Field>
                                        <Field label="Descuento Fijo 1 (%)">
                                            <input type="number" step="0.01" className={inputCls} placeholder="0"
                                                value={formData.discount1 || ''} onChange={e => set('discount1', e.target.value)} />
                                        </Field>
                                        <Field label="Descuento Fijo 2 (%)">
                                            <input type="number" step="0.01" className={inputCls} placeholder="0"
                                                value={formData.discount2 || ''} onChange={e => set('discount2', e.target.value)} />
                                        </Field>
                                        <Field label="Descuento Fijo 3 (%)">
                                            <input type="number" step="0.01" className={inputCls} placeholder="0"
                                                value={formData.discount3 || ''} onChange={e => set('discount3', e.target.value)} />
                                        </Field>
                                        <Field label="Tipo de IVA">
                                            <input type="text" className={inputCls} placeholder="0 / 10 / 21"
                                                value={formData.vatType || ''} onChange={e => set('vatType', e.target.value)} />
                                        </Field>
                                        <Field label="Recargo de Equivalencia">
                                            <input type="text" className={inputCls} placeholder="Sí / No"
                                                value={formData.equivalenceSurcharge || ''} onChange={e => set('equivalenceSurcharge', e.target.value)} />
                                        </Field>
                                        <Field label="% Financiación">
                                            <input type="number" step="0.01" className={inputCls} placeholder="0"
                                                value={formData.financingPct || ''} onChange={e => set('financingPct', e.target.value)} />
                                        </Field>
                                        <Field label="Tarifa Especial">
                                            <input type="text" className={inputCls} placeholder=""
                                                value={formData.specialTariff || ''} onChange={e => set('specialTariff', e.target.value)} />
                                        </Field>
                                        <Field label="Código de Proveedor">
                                            <input type="text" className={inputCls} placeholder=""
                                                value={formData.supplierCode || ''} onChange={e => set('supplierCode', e.target.value)} />
                                        </Field>
                                        <Field label="Actividades">
                                            <input type="text" className={inputCls} placeholder=""
                                                value={formData.activities || ''} onChange={e => set('activities', e.target.value)} />
                                        </Field>
                                        <Field label="Texto de Portes">
                                            <input type="text" className={inputCls} placeholder=""
                                                value={formData.freightText || ''} onChange={e => set('freightText', e.target.value)} />
                                        </Field>
                                        <Field label="Fecha de Alta">
                                            <input type="date" className={inputCls}
                                                value={formData.registrationDate || ''} onChange={e => set('registrationDate', e.target.value)} />
                                        </Field>
                                        <Field label="Fecha de Nacimiento">
                                            <input type="date" className={inputCls}
                                                value={formData.birthDate || ''} onChange={e => set('birthDate', e.target.value)} />
                                        </Field>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: BANCARIO ─── */}
                        {activeTab === 'bancario' && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <Field label="Banco">
                                        <input type="text" className={inputCls} placeholder="Nombre del banco"
                                            value={formData.bank || ''} onChange={e => set('bank', e.target.value)} />
                                    </Field>
                                    <Field label="Entidad">
                                        <input type="text" className={inputCls} placeholder="Código de entidad (4 dígitos)"
                                            value={formData.bankEntity || ''} onChange={e => set('bankEntity', e.target.value)} />
                                    </Field>
                                    <Field label="Oficina">
                                        <input type="text" className={inputCls} placeholder="Código de oficina (4 dígitos)"
                                            value={formData.bankOffice || ''} onChange={e => set('bankOffice', e.target.value)} />
                                    </Field>
                                    <Field label="Dígito de Control">
                                        <input type="text" className={inputCls} placeholder="2 dígitos"
                                            value={formData.controlDigit || ''} onChange={e => set('controlDigit', e.target.value)} />
                                    </Field>
                                    <div className="md:col-span-2">
                                        <Field label="Número de Cuenta (10 dígitos)">
                                            <input type="text" className={inputCls} placeholder="0000000000"
                                                value={formData.account || ''} onChange={e => set('account', e.target.value)} />
                                        </Field>
                                    </div>
                                </div>
                                <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-xs text-blue-600">
                                    <strong>IBAN completo:</strong> {formData.bankEntity && formData.bankOffice && formData.controlDigit && formData.account
                                        ? `ES** ${formData.bankEntity} ${formData.bankOffice} ${formData.controlDigit} ${formData.account}`
                                        : 'Rellena los campos para ver el IBAN'}
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: ARTÍCULOS ─── */}
                        {activeTab === 'articulos' && (
                            <div>
                                <p className="text-xs text-slate-500 mb-3">
                                    Selecciona los artículos visibles para este cliente y ordénalos con las flechas (los primeros aparecen antes al crear envíos).
                                </p>
                                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                                    {formData.allowedArticles && formData.allowedArticles.length > 0 && (
                                        <div className="bg-blue-50 border-b border-blue-100">
                                            <div className="px-3 py-2 text-[10px] uppercase font-bold text-blue-600">Habilitados (Orden de aparición)</div>
                                            <div className="divide-y divide-blue-100">
                                                {formData.allowedArticles.map((articleId, index) => {
                                                    const article = articles?.find(a => a.id === articleId);
                                                    if (!article) return null;
                                                    return (
                                                        <div key={articleId} className="px-3 py-2 flex items-center justify-between hover:bg-blue-100/50">
                                                            <div className="flex items-center gap-2">
                                                                <input type="checkbox" checked={true} onChange={() => toggleArticle(articleId)}
                                                                    className="rounded text-blue-600 focus:ring-blue-500" />
                                                                <span className="text-sm text-slate-700 font-medium">{article.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-1">
                                                                <button type="button" onClick={() => moveArticle(index, -1)} disabled={index === 0}
                                                                    className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30" title="Subir">
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                                                                </button>
                                                                <button type="button" onClick={() => moveArticle(index, 1)} disabled={index === formData.allowedArticles.length - 1}
                                                                    className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30" title="Bajar">
                                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="p-3 border-b border-slate-100 bg-slate-50">
                                        <input 
                                            type="text" 
                                            placeholder="Buscar artículo..." 
                                            className={`${inputCls} text-xs`} 
                                            value={searchArticle} 
                                            onChange={e => setSearchArticle(e.target.value)} 
                                        />
                                    </div>
                                    <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto">
                                        {Object.entries((articles || [])
                                            .filter(a => !formData.allowedArticles?.includes(a.id))
                                            .filter(a => a.name.toLowerCase().includes(searchArticle.toLowerCase()) || (a.category && a.category.toLowerCase().includes(searchArticle.toLowerCase())))
                                            .reduce((acc, article) => {
                                                const cat = article.category || 'Sin Familia';
                                                if (!acc[cat]) acc[cat] = [];
                                                acc[cat].push(article);
                                                return acc;
                                            }, {})
                                        ).sort(([catA], [catB]) => catA.localeCompare(catB))
                                        .map(([category, items]) => (
                                            <div key={category}>
                                                <div className="px-3 py-1.5 bg-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wider sticky top-0">
                                                    {category}
                                                </div>
                                                {items.sort((a,b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })).map(article => (
                                                    <div key={article.id} className="px-3 py-2 flex items-center gap-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 pl-5">
                                                        <input type="checkbox" checked={false} onChange={() => toggleArticle(article.id)}
                                                            className="rounded text-slate-400 focus:ring-slate-400" />
                                                        <span className="text-sm text-slate-500">{article.name}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                        {articles && articles.filter(a => !formData.allowedArticles?.includes(a.id)).filter(a => a.name.toLowerCase().includes(searchArticle.toLowerCase()) || (a.category && a.category.toLowerCase().includes(searchArticle.toLowerCase()))).length === 0 && (
                                            <div className="p-4 text-center text-sm text-slate-400 italic">No se encontraron artículos.</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: SEDES ─── */}
                        {activeTab === 'sedes' && (
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                            <Building2 size={15} className="text-blue-600" /> Sedes / Delegaciones
                                        </h4>
                                        <p className="text-xs text-slate-500 mt-1">
                                            Añade las ubicaciones físicas de este cliente. Cada sede aparecerá como opción al crear envíos. 
                                            Los datos fiscales y precios se heredan automáticamente de esta ficha.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newBranch = {
                                                id: `branch_${Date.now()}`,
                                                name: '',
                                                address: '',
                                                city: '',
                                                zip: '',
                                                province: '',
                                                coordinates: '',
                                                phone: '',
                                                contactPerson: ''
                                            };
                                            set('branches', [...(formData.branches || []), newBranch]);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 text-white rounded-lg text-xs font-bold hover:bg-blue-700 transition-colors shadow-md shadow-blue-500/20"
                                    >
                                        <Plus size={14} /> Añadir Sede
                                    </button>
                                </div>

                                {(!formData.branches || formData.branches.length === 0) ? (
                                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                                        <Building2 size={32} className="mx-auto text-slate-300 mb-2" />
                                        <p className="text-sm font-bold text-slate-400">Sin sedes registradas</p>
                                        <p className="text-xs text-slate-400 mt-1">Pulsa "Añadir Sede" para crear la primera delegación.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {(formData.branches || []).map((branch, idx) => (
                                            <div key={branch.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-[10px] font-bold">
                                                            {idx + 1}
                                                        </div>
                                                        <span className="text-sm font-bold text-slate-700">
                                                            {branch.name || <span className="italic text-slate-400">Nueva sede</span>}
                                                        </span>
                                                        {branch.city && (
                                                            <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                                                                {branch.city}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button type="button" disabled={idx === 0}
                                                            onClick={() => {
                                                                const arr = [...formData.branches];
                                                                [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                                                set('branches', arr);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-colors" title="Subir">
                                                            <ChevronUp size={14} />
                                                        </button>
                                                        <button type="button" disabled={idx === (formData.branches || []).length - 1}
                                                            onClick={() => {
                                                                const arr = [...formData.branches];
                                                                [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                                                set('branches', arr);
                                                            }}
                                                            className="p-1 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-colors" title="Bajar">
                                                            <ChevronDown size={14} />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (window.confirm(`¿Eliminar la sede "${branch.name || 'sin nombre'}"?`)) {
                                                                    set('branches', formData.branches.filter(b => b.id !== branch.id));
                                                                }
                                                            }}
                                                            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Eliminar sede"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <Field label="Nombre de la Sede *">
                                                        <input type="text" className={inputCls} placeholder="Ej: Sede Baena, Almacén Norte..."
                                                            value={branch.name || ''}
                                                            onChange={e => {
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, name: e.target.value } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                    <Field label="Teléfono">
                                                        <input type="tel" className={inputCls} placeholder="+34 600..."
                                                            value={branch.phone || ''}
                                                            onChange={e => {
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, phone: e.target.value } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                    <div className="md:col-span-2">
                                                        <Field label="Dirección">
                                                            <input type="text" className={inputCls} placeholder="Calle, Polígono, Nave..."
                                                                value={branch.address || ''}
                                                                onChange={e => {
                                                                    const updated = formData.branches.map(b => b.id === branch.id ? { ...b, address: e.target.value } : b);
                                                                    set('branches', updated);
                                                                }} />
                                                        </Field>
                                                    </div>
                                                    <Field label="Población">
                                                        <input type="text" className={inputCls} placeholder="Baena" list="poblaciones-list"
                                                            value={branch.city || ''}
                                                            onChange={e => {
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, city: e.target.value } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                    <Field label="Código Postal">
                                                        <input type="text" className={inputCls} placeholder="14850"
                                                            value={branch.zip || ''}
                                                            onChange={e => {
                                                                const val = e.target.value;
                                                                const updates = { zip: val };
                                                                if (val.length >= 2) {
                                                                    const prefix = val.substring(0, 2);
                                                                    const prov = SPAIN_PROVINCES[prefix];
                                                                    if (prov && !branch.province) updates.province = prov;
                                                                }
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, ...updates } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                    <Field label="Provincia">
                                                        <input type="text" className={inputCls} placeholder="Córdoba"
                                                            value={branch.province || ''}
                                                            onChange={e => {
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, province: e.target.value } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                    <Field label="Coordenadas GPS">
                                                        <div className="relative">
                                                            <MapIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                                            <input type="text" className={`${inputCls} pl-9`} placeholder="37.6167, -4.3225"
                                                                value={branch.coordinates || ''}
                                                                onChange={e => {
                                                                    const updated = formData.branches.map(b => b.id === branch.id ? { ...b, coordinates: e.target.value } : b);
                                                                    set('branches', updated);
                                                                }} />
                                                        </div>
                                                    </Field>
                                                    <Field label="Persona de Contacto">
                                                        <input type="text" className={inputCls} placeholder="Juan García"
                                                            value={branch.contactPerson || ''}
                                                            onChange={e => {
                                                                const updated = formData.branches.map(b => b.id === branch.id ? { ...b, contactPerson: e.target.value } : b);
                                                                set('branches', updated);
                                                            }} />
                                                    </Field>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── TAB: ACCESO ─── */}
                        {activeTab === 'acceso' && (
                            <div className="space-y-6">
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2 bg-white rounded-lg shadow-sm">
                                            <Shield className="text-emerald-600" size={24} />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-emerald-900">Credenciales de Acceso</h4>
                                            <p className="text-xs text-emerald-700">Configura los datos que el cliente usará para entrar en el Portal.</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                        <div className="md:col-span-2">
                                            <Field label="Correo de Acceso al Portal">
                                                <div className="relative">
                                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                    <input
                                                        type="email"
                                                        className={`${inputCls} pl-10`}
                                                        placeholder={formData.email || 'pedidos@empresa.com'}
                                                        value={formData.accessEmail || ''}
                                                        onChange={e => set('accessEmail', e.target.value)}
                                                    />
                                                </div>
                                                <p className="text-[10px] text-slate-400 mt-1">
                                                    Sólo si el cliente quiere entrar en la app con un correo distinto del de la ficha.
                                                    Vacío = entra con <strong>{formData.email || 'el e-mail de la pestaña Contacto'}</strong>.
                                                </p>
                                            </Field>
                                        </div>

                                        <Field label="Nombre de Usuario">
                                            <div className="relative">
                                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                <input 
                                                    type="text" 
                                                    className={`${inputCls} pl-10`} 
                                                    placeholder="Ej: cliente_premium"
                                                    value={formData.username || ''} 
                                                    onChange={e => set('username', e.target.value)} 
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">Si se deja vacío, se intentará usar el Nombre Comercial.</p>
                                        </Field>

                                        <Field label="Contraseña de Acceso">
                                            <div className="relative">
                                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                                <input 
                                                    type="text" 
                                                    className={`${inputCls} pl-10`} 
                                                    placeholder="Contraseña segura"
                                                    value={formData.password || ''} 
                                                    onChange={e => set('password', e.target.value)} 
                                                />
                                            </div>
                                        </Field>
                                    </div>
                                </div>

                                <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                                    <h5 className="text-[11px] font-bold text-slate-500 uppercase mb-2">Instrucciones para el Cliente</h5>
                                    <ul className="text-xs text-slate-600 space-y-2 list-disc pl-4">
                                        <li>El cliente debe entrar en la pestaña <strong>"Cliente"</strong> de la pantalla de inicio.</li>
                                        <li>Indícale que use el usuario y contraseña aquí configurados.</li>
                                        <li>Su cuenta se crea sobre el <strong>correo de acceso</strong> (o el e-mail de la ficha si aquél está vacío): es el que tiene que escribir si entra por email.</li>
                                        <li>Desde su portal podrá ver el estado de sus envíos y crear nuevos albaranes.</li>
                                    </ul>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB: REGLAS ─── */}
                        {activeTab === 'reglas' && (
                            <div className="space-y-6">
                                <div className="bg-slate-50 rounded-xl p-5 border border-slate-100">
                                    <div className="flex items-center gap-3 mb-4">
                                        <div className="p-2.5 bg-blue-100 rounded-lg">
                                            <ShieldCheck size={20} className="text-blue-600" />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800">Exigencias de Entrega</h4>
                                            <p className="text-[10px] text-slate-400">Configura qué datos son obligatorios al crear o entregar envíos de este cliente.</p>
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {/* Require Weight */}
                                        <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">⚖️</span>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Exigir Kilos (Peso)</p>
                                                    <p className="text-[10px] text-slate-400">No se podrá guardar un albarán sin poner el peso en Kg.</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only peer" checked={!!formData.requireWeight} onChange={e => set('requireWeight', e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                        </label>

                                        {/* Require Name */}
                                        <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">📝</span>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Exigir Nombre del Receptor <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1.5 py-0.5 rounded-full">POR DEFECTO</span></p>
                                                    <p className="text-[10px] text-slate-400">El repartidor debe escribir el nombre de quien recibe el paquete.</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only peer" checked={formData.requireName !== false} onChange={e => set('requireName', e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                        </label>

                                        {/* Require DNI */}
                                        <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">🪪</span>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Exigir DNI del Receptor</p>
                                                    <p className="text-[10px] text-slate-400">El repartidor no podrá entregar sin escribir el DNI/NIE.</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only peer" checked={!!formData.requireDNI} onChange={e => set('requireDNI', e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                        </label>

                                        {/* Require Photo */}
                                        <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">📸</span>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Exigir Foto (Sello / Albarán)</p>
                                                    <p className="text-[10px] text-slate-400">El repartidor debe adjuntar una foto obligatoria al entregar.</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only peer" checked={!!formData.requirePhoto} onChange={e => set('requirePhoto', e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                        </label>

                                        {/* Require Signature */}
                                        <label className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-200 cursor-pointer hover:border-blue-300 transition-colors group">
                                            <div className="flex items-center gap-3">
                                                <span className="text-lg">✍️</span>
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Exigir Firma Real</p>
                                                    <p className="text-[10px] text-slate-400">El repartidor debe capturar una firma real (no podrá marcar "Firma Ausente").</p>
                                                </div>
                                            </div>
                                            <div className="relative">
                                                <input type="checkbox" className="sr-only peer" checked={formData.requireSignature !== false} onChange={e => set('requireSignature', e.target.checked)} />
                                                <div className="w-11 h-6 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                                                <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow-sm peer-checked:translate-x-5 transition-transform"></div>
                                            </div>
                                        </label>
                                    </div>
                                </div>

                                {(formData.requireName !== false || formData.requireWeight || formData.requireDNI || formData.requirePhoto) && (
                                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                                        <p className="text-xs text-blue-700 font-medium">✅ Reglas activas para este cliente:</p>
                                        <ul className="text-[11px] text-blue-600 mt-1 space-y-0.5">
                                            {formData.requireWeight && <li>• Los kilos serán obligatorios al crear albaranes.</li>}
                                            {formData.requireName !== false && <li>• El repartidor deberá escribir el nombre del receptor.</li>}
                                            {formData.requireDNI && <li>• El repartidor deberá poner DNI al entregar.</li>}
                                            {formData.requirePhoto && <li>• El repartidor deberá hacer foto al entregar.</li>}
                                            {formData.requireSignature !== false && <li>• Se exigirá firma real (no firma ausente).</li>}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        )}


                    </div>

                    {/* Por qué no se ha guardado. Encima del botón, donde se está
                        mirando al pulsar, y con el formulario todavía lleno. */}
                    {saveError && (
                        <div className="px-6 py-3 border-t border-red-100 bg-red-50 shrink-0 flex items-start gap-2">
                            <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 font-semibold leading-relaxed">{saveError}</p>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 flex justify-between items-center shrink-0 bg-slate-50 rounded-b-2xl">
                        <div className="flex gap-1">
                            {TABS.map((tab, i) => (
                                <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                                    className={`w-2 h-2 rounded-full transition-all ${activeTab === tab.id ? 'bg-blue-600 w-4' : 'bg-slate-300'}`} />
                            ))}
                        </div>
                        <div className="flex gap-3">
                            <button type="button" onClick={onClose}
                                className="px-5 py-2 text-slate-500 font-medium hover:bg-slate-100 rounded-lg transition-colors text-sm">
                                Cancelar
                            </button>
                            <button type="submit" disabled={isUploading}
                                className={`px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg shadow-lg shadow-blue-600/20 transition-all text-sm flex items-center gap-2 ${isUploading ? 'opacity-70 cursor-not-allowed' : ''}`}>
                                {isUploading ? (
                                    <>
                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Subiendo...
                                    </>
                                ) : (
                                    'Guardar Ficha'
                                )}
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <datalist id="poblaciones-list">
                {(allPoblaciones || []).map((poblacion, idx) => (
                    <option key={`${idx}-${poblacion}`} value={poblacion} />
                ))}
            </datalist>
        </div>
    );
}
