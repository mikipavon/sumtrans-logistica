import { X, Truck, Package, Euro, Map, Building2, FileText, UserPlus, Check, MapPin, Loader2, CheckCircle, Trash2, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function CreateShipmentModal({ isOpen, onClose, onSave, drivers, clients, prefillData, onAddClient, tariffs, articles }) {
    const [formData, setFormData] = useState({
        // Remitente (Sender)
        clientName: '',
        originAddress: '',
        originZip: '',
        originCity: '',
        originPhone: '',
        originCoordinates: '',

        // Destino (Receiver)
        destinationName: '',
        destinationAddress: '',
        destinationZip: '',
        destinationCity: '',
        destinationPhone: '',
        destinationCoordinates: '',

        amount: '',
        porteType: 'Pagado', // 'Pagado' or 'Debido'
        assignedDriverId: '',
        observations: '',
        hasCod: false,
        codAmount: '',
        codCommission: ''
    });

    const [filteredClients, setFilteredClients] = useState([]);
    const [filteredDestinations, setFilteredDestinations] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showDestSuggestions, setShowDestSuggestions] = useState(false);
    const [savedDestClient, setSavedDestClient] = useState(false);
    const [showPaymentAlert, setShowPaymentAlert] = useState(false);
    const [pendingSubmitData, setPendingSubmitData] = useState(null);
    const [gettingOriginGps, setGettingOriginGps] = useState(false);
    const [gettingDestGps, setGettingDestGps] = useState(false);

    // Article Selection State
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [tempArticleId, setTempArticleId] = useState('');
    const [tempQuantity, setTempQuantity] = useState(1);

    useEffect(() => {
        if (isOpen) {
            setSelectedArticles([]); // Reset articles on open
            setTempArticleId('');
            setTempQuantity(1);

            if (prefillData) {
                // Pre-fill from Pickup (Recogida) or other source
                setFormData({
                    clientName: prefillData.client || '',
                    originAddress: prefillData.originAddress || '',
                    originZip: prefillData.originZip || '',
                    originCity: prefillData.originCity || '',
                    originPhone: prefillData.originPhone || '',
                    originCoordinates: prefillData.originCoordinates || '',

                    destinationName: '',
                    destinationAddress: '',
                    destinationZip: '',
                    destinationCity: '',
                    destinationPhone: '',
                    destinationCoordinates: '',

                    amount: '',
                    porteType: 'Pagado',
                    assignedDriverId: '', // Ensure unassigned as requested
                    observations: prefillData.observations || ''
                });
            } else {
                // Reset clean
                setFormData({
                    clientName: '',
                    originAddress: '',
                    originZip: '',
                    originCity: '',
                    originPhone: '',
                    originCoordinates: '',
                    destinationName: '',
                    destinationAddress: '',
                    destinationZip: '',
                    destinationCity: '',
                    destinationPhone: '',
                    destinationCoordinates: '',
                    amount: '',
                    porteType: 'Pagado',
                    assignedDriverId: '',
                    observations: '',
                    hasCod: false,
                    codAmount: '',
                    codCommission: ''
                });
            }

            // Auto-capture GPS on open (for origin - where shipment is being created)
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                        setFormData(prev => ({ ...prev, originCoordinates: coords }));
                    },
                    (error) => {
                        console.log('GPS auto-capture failed:', error.message);
                    },
                    { enableHighAccuracy: true, timeout: 5000 }
                );
            }
        }
    }, [isOpen, prefillData]);

    const updateSuggestions = (value) => {
        if (!clients) return;
        const matches = clients.filter(c => {
            // Remove type restriction to allow searching any client
            if (!value) return true;
            return c.name.toLowerCase().includes(value.toLowerCase());
        }).sort((a, b) => {
            // Priority 1: Approved users first
            if (a.status === 'approved' && b.status !== 'approved') return -1;
            if (a.status !== 'approved' && b.status === 'approved') return 1;
            // Priority 2: Alphabetical
            return a.name.localeCompare(b.name);
        });
        setFilteredClients(matches);
        setShowSuggestions(matches.length > 0);
    };

    const updateDestSuggestions = (value) => {
        if (!clients) return;
        const matches = clients.filter(c => {
            // Remove type restriction to allow searching any client
            if (!value) return true;
            return c.name.toLowerCase().includes(value.toLowerCase());
        }).sort((a, b) => {
            // Priority 1: Approved users first
            if (a.status === 'approved' && b.status !== 'approved') return -1;
            if (a.status !== 'approved' && b.status === 'approved') return 1;
            // Priority 2: Alphabetical
            return a.name.localeCompare(b.name);
        });
        setFilteredDestinations(matches);
        setShowDestSuggestions(matches.length > 0);
    };

    const handleFocus = () => updateSuggestions(formData.clientName);
    const handleDestFocus = () => updateDestSuggestions(formData.destinationName);

    const handleClientNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, clientName: value, selectedClientBillingType: null }));
        updateSuggestions(value);
    };

    const handleDestinationNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, destinationName: value }));
        updateDestSuggestions(value);
    };

    const selectClient = (client) => {
        setFormData(prev => ({
            ...prev,
            clientName: client.name,
            originAddress: client.address,
            originZip: client.zip || '',
            originCity: client.city || '',
            originPhone: client.phone || '',
            selectedClientBillingType: client.billingType || 'Facturación',
        }));
        setShowSuggestions(false);
    };

    const selectDestination = (client) => {
        setFormData(prev => ({
            ...prev,
            destinationName: client.name,
            destinationAddress: client.address,
            destinationZip: client.zip || '',
            destinationCity: client.city || '',
            destinationPhone: client.phone || '',
            destinationCoordinates: client.coordinates || '',
        }));
        setShowDestSuggestions(false);
    };

    // GPS Capture Functions
    const captureOriginGps = () => {
        if (!navigator.geolocation) {
            alert('Tu navegador no soporta geolocalización');
            return;
        }
        setGettingOriginGps(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                setFormData(prev => ({ ...prev, originCoordinates: coords }));
                setGettingOriginGps(false);
            },
            (error) => {
                console.error('Error getting GPS:', error);
                alert('Error obteniendo ubicación GPS');
                setGettingOriginGps(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    const captureDestGps = () => {
        if (!navigator.geolocation) {
            alert('Tu navegador no soporta geolocalización');
            return;
        }
        setGettingDestGps(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                setFormData(prev => ({ ...prev, destinationCoordinates: coords }));
                setGettingDestGps(false);
            },
            (error) => {
                console.error('Error getting GPS:', error);
                alert('Error obteniendo ubicación GPS');
                setGettingDestGps(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    // Article Logic
    const handleAddArticle = () => {
        if (!tempArticleId || tempQuantity <= 0) return;

        const article = articles.find(a => a.id.toString() === tempArticleId.toString());
        if (!article) return;

        const newItem = {
            ...article,
            uniqueId: Date.now(), // Unique ID for this list instance
            quantity: parseInt(tempQuantity),
            totalPrice: parseFloat(article.price) * parseInt(tempQuantity)
        };

        const updatedList = [...selectedArticles, newItem];
        setSelectedArticles(updatedList);

        // Recalculate Total Amount: Articles + Commission
        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));

        // Reset inputs
        setTempArticleId('');
        setTempQuantity(1);
    };

    const removeArticle = (uniqueId) => {
        const updatedList = selectedArticles.filter(item => item.uniqueId !== uniqueId);
        setSelectedArticles(updatedList);

        // Recalculate Total Amount: Articles + Commission
        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
    };

    // Auto-Pricing Logic (Only if NO articles selected, or maybe articles override tariffs?)
    // Let's say Articles override Tariffs. If articles list > 0, we use articles sum. If 0, we check tariffs.
    useEffect(() => {
        if (!isOpen) return;

        // If user manually selected articles, that price takes precedence (calculated in handleAddArticle)
        if (selectedArticles.length > 0) return;

        if (!tariffs) return;

        const checktariff = () => {
            // 1. Try Find by City Match
            const cityMatch = tariffs.find(t =>
                t.match && formData.destinationCity &&
                t.match.toLowerCase() === formData.destinationCity.toLowerCase()
            );

            // 2. Try Find by ZIP Match
            const zipMatch = tariffs.find(t =>
                t.zipPrefix && formData.destinationZip &&
                formData.destinationZip.startsWith(t.zipPrefix)
            );

            const foundTariff = cityMatch || zipMatch;

            if (foundTariff) {
                // Only auto-update if different to avoid infinite loop
                if (formData.amount !== foundTariff.price) {
                    setFormData(prev => ({ ...prev, amount: foundTariff.price }));
                }
            }
        };

        const timer = setTimeout(checktariff, 500); // Debounce to allow typing
        return () => clearTimeout(timer);

    }, [formData.destinationCity, formData.destinationZip, tariffs, isOpen, selectedArticles]);

    const checkPaymentRequirements = (data) => {
        // Check for Daily Payment Alert (Remitente)
        const isNewClient = !clients?.find(c => c.name.toLowerCase() === data.clientName.toLowerCase());
        const isCobroDiario = data.selectedClientBillingType === 'Cobro Diario';

        // Logic: If Paid Shipment AND (New Client OR Daily Payment Client) -> Alert to Collect
        if (data.porteType === 'Pagado' && (isNewClient || isCobroDiario)) {
            return true;
        }
        return false;
    };

    const handleInitialSubmit = (e) => {
        e.preventDefault();

        // Prepare data object
        const fullOrigin = `${formData.originAddress}, ${formData.originZip} ${formData.originCity}`.trim();
        const fullDest = `${formData.destinationAddress}, ${formData.destinationZip} ${formData.destinationCity}`.trim();

        const shipmentData = {
            id: `TR-${new Date().getFullYear()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
            client: formData.clientName,
            origin: fullOrigin,
            originAddress: formData.originAddress,
            originZip: formData.originZip,
            originCity: formData.originCity,
            originPhone: formData.originPhone,

            destination: fullDest,
            destinationName: formData.destinationName,
            destinationAddress: formData.destinationAddress,
            destinationZip: formData.destinationZip,
            destinationCity: formData.destinationCity,
            destinationPhone: formData.destinationPhone,

            address: fullDest,
            status: 'Pendiente de asignar',
            date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
            amount: formData.amount ? `€${formData.amount}` : 'Tarifa',
            customAmount: formData.amount ? parseFloat(formData.amount) : null,
            billingType: formData.selectedClientBillingType || 'Cobro Diario',
            porteType: formData.porteType,
            assignedDriverId: formData.assignedDriverId ? Number(formData.assignedDriverId) : null,
            observations: formData.observations,
            originCoordinates: formData.originCoordinates,
            destinationCoordinates: formData.destinationCoordinates,

            // Pending: Backend needs to support articles list if we want to save it permanently in structured format
            // For now, we appply it to observations or assume it stays in amount
            articles: selectedArticles,
            hasCod: formData.hasCod,
            codAmount: formData.codAmount ? parseFloat(formData.codAmount) : 0,
            codCommission: formData.codCommission ? parseFloat(formData.codCommission) : 0
        };

        if (checkPaymentRequirements(formData)) {
            setPendingSubmitData(shipmentData);
            setShowPaymentAlert(true);
        } else {
            finalizeSubmit(shipmentData, 'Paid'); // Default to paid/credit if no alert needed
        }
    };

    const finalizeSubmit = (data, paymentStatus) => {
        const finalData = {
            ...data,
            paymentStatus: paymentStatus, // 'Paid' or 'Pending'
            // If Pending, add a note to observations automatically?
            observations: paymentStatus === 'Pending'
                ? `[COBRO PENDIENTE] ${data.observations}`
                : data.observations
        };
        onSave(finalData);
        onClose();
        setShowPaymentAlert(false);
    };

    if (!isOpen) return null;

    // Helper for input classes
    const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm";
    const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1";

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-blue-600" size={20} />
                        Nuevo Albarán
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar">
                    <form onSubmit={handleInitialSubmit} className="space-y-8">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            {/* REMITENTE */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2 flex items-center gap-2">
                                    <Building2 size={14} />
                                    Remitente (Origen)
                                </h4>

                                <div className="space-y-3">
                                    <div>
                                        <label className={labelClass}>Cliente</label>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Buscar cliente..."
                                                className={inputClass}
                                                value={formData.clientName}
                                                onChange={handleClientNameChange}
                                                onFocus={handleFocus}
                                                required
                                            />
                                            {showSuggestions && filteredClients.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-lg shadow-xl z-[100] max-h-40 overflow-y-auto">
                                                    {filteredClients.map(client => (
                                                        <button
                                                            key={client.id}
                                                            type="button"
                                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                                            onClick={() => selectClient(client)}
                                                        >
                                                            <div className="font-bold text-slate-800 text-xs">{client.name}</div>
                                                            <div className="text-[10px] text-slate-500 truncate">{client.address}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Población</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={formData.originCity}
                                            onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Dirección</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={formData.originAddress}
                                            onChange={(e) => setFormData({ ...formData, originAddress: e.target.value })}
                                        />
                                    </div>

                                    {/* Campos ocultos visualmente pero funcionales */}
                                    <div className="hidden">
                                        <input type="text" value={formData.originZip} onChange={(e) => setFormData({ ...formData, originZip: e.target.value })} />
                                        <input type="text" value={formData.originCoordinates} readOnly />
                                    </div>

                                    {/* Selector Tipo de Porte */}
                                    <div className="pt-1 pb-1">
                                        <label className={labelClass}>¿Quién Paga? (Porte)</label>
                                        <div className="flex gap-2">
                                            <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-2 rounded-lg border transition-all ${formData.porteType === 'Pagado' ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                <input
                                                    type="radio"
                                                    name="porteType"
                                                    value="Pagado"
                                                    checked={formData.porteType === 'Pagado'}
                                                    onChange={(e) => setFormData({ ...formData, porteType: e.target.value })}
                                                    className="hidden"
                                                />
                                                <span className="text-xs font-bold">PAGADO</span>
                                            </label>
                                            <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-2 rounded-lg border transition-all ${formData.porteType === 'Debido' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                <input
                                                    type="radio"
                                                    name="porteType"
                                                    value="Debido"
                                                    checked={formData.porteType === 'Debido'}
                                                    onChange={(e) => setFormData({ ...formData, porteType: e.target.value })}
                                                    className="hidden"
                                                />
                                                <span className="text-xs font-bold">DEBIDO</span>
                                            </label>
                                        </div>
                                    </div>

                                    <div className="pt-2">
                                        <label className={labelClass}>Observaciones</label>
                                        <textarea
                                            className="w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none h-24"
                                            placeholder="Notas para el conductor..."
                                            value={formData.observations}
                                            onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                                        ></textarea>
                                    </div>
                                </div>
                            </div>

                            {/* DESTINATARIO */}
                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider border-b border-amber-100 pb-2 flex items-center gap-2">
                                    <Map size={14} />
                                    Destinatario (Entrega)
                                </h4>

                                <div className="space-y-3">
                                    <div>
                                        <label className={labelClass}>Destinatario</label>
                                        <div className="relative">
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    placeholder="Buscar destino..."
                                                    className={`${inputClass} flex-1`}
                                                    value={formData.destinationName}
                                                    onChange={(e) => {
                                                        handleDestinationNameChange(e);
                                                        setSavedDestClient(false);
                                                    }}
                                                    onFocus={handleDestFocus}
                                                    required
                                                />
                                                {/* Botón rápido para guardar nuevo cliente */}
                                                {formData.destinationName && onAddClient && !clients?.find(c => c.name.toLowerCase() === formData.destinationName.toLowerCase()) && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            onAddClient({
                                                                name: formData.destinationName,
                                                                address: formData.destinationAddress || '',
                                                                city: formData.destinationCity || '',
                                                                zip: formData.destinationZip || '',
                                                                phone: formData.destinationPhone || '',
                                                                type: 'Destinatario',
                                                                billingType: 'Cobro Diario'
                                                            });
                                                            setSavedDestClient(true);
                                                        }}
                                                        className={`flex items-center justify-center w-10 h-10 rounded-lg transition-colors shrink-0 ${savedDestClient ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600 hover:bg-amber-200'}`}
                                                        title="Guardar como cliente"
                                                    >
                                                        {savedDestClient ? <Check size={18} /> : <UserPlus size={18} />}
                                                    </button>
                                                )}
                                            </div>
                                            {showDestSuggestions && filteredDestinations.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-lg shadow-xl z-[100] max-h-40 overflow-y-auto">
                                                    {filteredDestinations.map(client => (
                                                        <button
                                                            key={client.id}
                                                            type="button"
                                                            className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0"
                                                            onClick={() => selectDestination(client)}
                                                        >
                                                            <div className="font-bold text-slate-800 text-xs">{client.name}</div>
                                                            <div className="text-[10px] text-slate-500 truncate">{client.address}</div>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelClass}>Población</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={formData.destinationCity}
                                            onChange={(e) => setFormData({ ...formData, destinationCity: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Dirección</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={formData.destinationAddress}
                                            onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })}
                                        />
                                    </div>

                                    <div>
                                        <label className={labelClass}>Teléfono</label>
                                        <input
                                            type="tel"
                                            className={inputClass}
                                            value={formData.destinationPhone}
                                            onChange={(e) => setFormData({ ...formData, destinationPhone: e.target.value })}
                                        />
                                    </div>

                                    {/* Botón GPS Destination discreto */}
                                    <div className="flex justify-end pt-1">
                                        <button
                                            type="button"
                                            onClick={captureDestGps}
                                            disabled={gettingDestGps}
                                            className={`text-xs flex items-center gap-1 transition-colors ${formData.destinationCoordinates
                                                ? 'text-emerald-600 font-bold'
                                                : 'text-slate-400 hover:text-blue-600'
                                                }`}
                                            title="Capturar ubicación GPS destino"
                                        >
                                            {gettingDestGps ? (
                                                <Loader2 size={12} className="animate-spin" />
                                            ) : (
                                                <MapPin size={12} />
                                            )}
                                            {formData.destinationCoordinates ? 'GPS Capturado' : 'Añadir GPS'}
                                        </button>

                                        {/* Hidden origin GPS trigger if needed manually, currently auto-triggered */}
                                    </div>

                                    {/* Datos ocultos */}
                                    <div className="hidden">
                                        <input type="text" value={formData.destinationZip} onChange={(e) => setFormData({ ...formData, destinationZip: e.target.value })} />
                                        <input type="text" value={formData.destinationCoordinates} readOnly />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ARTICLES SELECTION SECTION */}
                        <div className="pt-4 border-t border-slate-100">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileText size={14} />
                                Artículos y Servicios
                            </h4>

                            {/* Selector */}
                            <div className="flex gap-2 items-end mb-3">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Artículo</label>
                                    <select
                                        className={inputClass}
                                        value={tempArticleId}
                                        onChange={(e) => setTempArticleId(e.target.value)}
                                    >
                                        <option value="">Seleccionar artículo...</option>
                                        {(() => {
                                            // Logic to filter and sort articles based on availableArticles/Client
                                            let availableArticles = articles || [];
                                            const client = clients?.find(c => c.name.toLowerCase() === formData.clientName.toLowerCase());

                                            // If client has allowedArticles, filter and sort
                                            if (client && client.allowedArticles && client.allowedArticles.length > 0) {
                                                // 1. Filter
                                                const allowedIds = client.allowedArticles;
                                                const filtered = availableArticles.filter(a => allowedIds.includes(a.id));

                                                // 2. Sort based on index in allowedArticles
                                                filtered.sort((a, b) => {
                                                    const indexA = allowedIds.indexOf(a.id);
                                                    const indexB = allowedIds.indexOf(b.id);
                                                    // console.log(`Sorting ${a.name} (${indexA}) vs ${b.name} (${indexB})`);
                                                    return indexA - indexB;
                                                });

                                                availableArticles = filtered;
                                            }

                                            return availableArticles.map(article => (
                                                <option key={article.id} value={article.id}>
                                                    {article.name} ({article.price}€)
                                                </option>
                                            ));
                                        })()}
                                    </select>
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Cant.</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className={inputClass}
                                        value={tempQuantity}
                                        onChange={(e) => setTempQuantity(e.target.value)}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={handleAddArticle}
                                    className="bg-blue-100 text-blue-700 p-2.5 rounded-lg hover:bg-blue-200 transition-colors"
                                >
                                    <Plus size={18} />
                                </button>
                            </div>

                            {/* List of Selected Articles */}
                            {selectedArticles.length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-2 mb-3 border border-slate-100 space-y-1">
                                    {selectedArticles.map((item) => (
                                        <div key={item.uniqueId} className="flex justify-between items-center text-sm p-1">
                                            <div className="flex gap-2 items-center">
                                                <span className="font-bold text-slate-700">{item.quantity}x</span>
                                                <span className="text-slate-600">{item.name}</span>
                                            </div>
                                            <div className="flex gap-3 items-center">
                                                <span className="font-bold text-slate-700">{item.totalPrice.toFixed(2)}€</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeArticle(item.uniqueId)}
                                                    className="text-red-400 hover:text-red-600"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center px-1">
                                        <span className="font-bold text-slate-500 text-xs uppercase">Total Artículos</span>
                                        <span className="font-bold text-blue-600">{selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}€</span>
                                    </div>
                                </div>
                            )}

                            {/* COD / Reembolso Automated Field */}
                            <div>
                                <label className={labelClass}>Valor Reembolso (A cobrar)</label>
                                <div className="relative">
                                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className={inputClass + " pl-9 border-red-200 focus:border-red-500 focus:ring-red-500/20"}
                                        value={formData.codAmount}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            const amount = parseFloat(val) || 0;

                                            // Find Fee
                                            let fee = 0;
                                            if (amount > 0) {
                                                const client = clients?.find(c => c.name.toLowerCase() === formData.clientName.toLowerCase());
                                                if (client && client.codFee) {
                                                    fee = parseFloat(client.codFee) || 0;
                                                }
                                            }

                                            // Calc Articles Total
                                            const articlesTotal = selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0);

                                            setFormData(prev => ({
                                                ...prev,
                                                codAmount: val,
                                                hasCod: amount > 0,
                                                codCommission: fee,
                                                amount: (articlesTotal + fee).toFixed(2)
                                            }));
                                        }}
                                    />
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">
                                    Si rellenas este campo, se sumará automáticamente la comisión pactada ({formData.codCommission || 0} €).
                                </p>
                            </div>

                            {/* Final Price Input Override */}
                            <div>
                                <label className={labelClass}>Precio Final del Porte (Artículos + Comisión)</label>
                                <div className="relative">
                                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder="0.00"
                                        className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-lg text-slate-700"
                                        value={formData.amount}
                                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm"
                            >
                                <Package size={18} />
                                Generar Albarán
                            </button>
                        </div>
                    </form>
                </div>
            </div >

            {/* PAYMENT ALERT OVERLAY */}
            {showPaymentAlert && (
                <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6 text-center space-y-4">
                            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-2">
                                <Euro size={32} />
                            </div>
                            <h3 className="text-xl font-bold text-slate-800">Cobro Requerido</h3>
                            <p className="text-slate-600 font-medium">
                                El cliente es de <strong>Cobro Diario/Nuevo</strong>.
                                <br />
                                <span className="text-sm text-slate-500 font-normal">Debe gestionar el cobro antes de continuar.</span>
                            </p>

                            <div className="py-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Importe a Cobrar</span>
                                <span className="text-3xl font-bold text-slate-900">
                                    {pendingSubmitData?.amount || 'Tarifa'}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => finalizeSubmit(pendingSubmitData, 'Pending')}
                                    className="py-3 px-4 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 hover:border-slate-300 transition-colors text-xs flex flex-col items-center justify-center gap-1"
                                >
                                    <span>Cobrar Más Tarde</span>
                                    <span className="font-normal text-[10px] opacity-70">(Marcar Pendiente)</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => finalizeSubmit(pendingSubmitData, 'Paid')}
                                    className="py-3 px-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-500/20 transition-colors text-sm flex items-center justify-center gap-2"
                                >
                                    <Check size={18} />
                                    Cobrado
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
