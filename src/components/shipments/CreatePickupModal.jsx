import { X, Building2, Package, FileText, MapPin, Loader2, Mic, MicOff } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function CreatePickupModal({ isOpen, onClose, onSave, clients, allPoblaciones, allShipments }) {
    const [formData, setFormData] = useState({
        clientName: '',
        originAddress: '',
        originZip: '',
        originCity: '',
        observations: '',
        originCoordinates: '',
        branchId: null,
        _parentClientId: null
    });

    const [gettingGps, setGettingGps] = useState(false);

    const [filteredClients, setFilteredClients] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [listeningField, setListeningField] = useState(null);

    const startListening = (field, targetKey) => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert("Tu navegador no soporta el reconocimiento de voz.");
            return;
        }

        try {
            const recognition = new SpeechRecognition();
            recognition.lang = 'es-ES';
            recognition.continuous = false;
            recognition.interimResults = false;

            recognition.onstart = () => setListeningField(field);
            recognition.onend = () => setListeningField(null);
            recognition.onerror = () => setListeningField(null);
            
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript.replace(/[.,;:]$/, '').trim();
                setFormData(prev => {
                    const newValue = prev[targetKey] ? `${prev[targetKey]} ${transcript}` : transcript;
                    
                    if (targetKey === 'clientName') {
                        setTimeout(() => updateSuggestions(newValue), 50);
                    }
                    
                    return {
                        ...prev,
                        [targetKey]: newValue
                    };
                });
            };

            recognition.start();
        } catch (error) {
            console.error("Speech Recognition Error:", error);
            setListeningField(null);
        }
    };

    useEffect(() => {
        if (!isOpen) {
            setFormData({
                clientName: '',
                originAddress: '',
                originZip: '',
                originCity: '',
                observations: '',
                originCoordinates: '',
                branchId: null,
                _parentClientId: null
            });
            setShowSuggestions(false);
        } else {
            // Try auto-capture on open if supported
            captureGps();
        }
    }, [isOpen]);

    const captureGps = () => {
        if (!navigator.geolocation) return;
        setGettingGps(true);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                setFormData(prev => ({ ...prev, originCoordinates: coords }));
                setGettingGps(false);
            },
            () => setGettingGps(false),
            { enableHighAccuracy: true, timeout: 5000 }
        );
    };

    // Helper para limpiar el texto de la voz (ignora puntuación y siglas legales)
    const normalizeForSearch = (text) => {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Sin acentos
            .replace(/[.,;:]/g, "") // Sin puntuación
            .replace(/\b(s\.?l\.?u?|s\.?a\.?|sociedad limitada|sociedad anonima)\b/g, "") // Ignorar S.L. S.A.
            .replace(/\s+/g, " ")
            .trim();
    };

    const updateSuggestions = (value) => {
        if (!clients) return;
        const search = normalizeForSearch(value);
        const sortedClients = [...clients].sort((a, b) => {
            // Priority 1: Approved users first
            if (a.status === 'approved' && b.status !== 'approved') return -1;
            if (a.status !== 'approved' && b.status === 'approved') return 1;
            // Priority 2: Alphabetical
            return (a.name || '').localeCompare(b.name || '');
        });

        const results = [];
        sortedClients.forEach(c => {
            const nameMatch = !search || normalizeForSearch(c.name).includes(search);
            const matchingBranches = [];
            if (Array.isArray(c.branches) && c.branches.length > 0) {
                c.branches.forEach(branch => {
                    const branchMatch = !search || 
                        normalizeForSearch(c.name).includes(search) ||
                        normalizeForSearch(branch.name).includes(search) ||
                        normalizeForSearch(branch.city).includes(search);
                    if (branchMatch) {
                        matchingBranches.push({
                            ...c,
                            _type: 'branch',
                            _branch: branch,
                            _displayName: branch.name,
                            id: `${c.id}_${branch.id}`,
                        });
                    }
                });
            }
            if (nameMatch) results.push({ ...c, _type: 'client' });
            results.push(...matchingBranches);
        });

        setFilteredClients(results);
        setShowSuggestions(results.length > 0);
    };

    const handleFocus = () => updateSuggestions(formData.clientName);

    const handleClientNameChange = (e) => {
        const value = e.target.value;
        // Si reescribe el nombre a mano, la sede que hubiera elegido antes ya no vale
        setFormData(prev => ({ ...prev, clientName: value, branchId: null, _parentClientId: null }));
        updateSuggestions(value);
    };

    const selectClient = (item) => {
        if (item._type === 'branch' && item._branch) {
            const branch = item._branch;
            setFormData(prev => ({
                ...prev,
                // El nombre de la sede, no el del cliente padre: si se elige
                // "AGROCOR MONTILLA" la recogida no puede salir a nombre de
                // "AGROCOR TORRECILLA" (mismo criterio que al crear un albaran).
                clientName: item._displayName || item.name,
                originAddress: branch.address || item.address || '',
                originZip: branch.zip || item.zip || '',
                originCity: branch.city || item.city || '',
                originCoordinates: branch.coordinates || '',
                branchId: branch.id,
                _parentClientId: item.id.split('_')[0]
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                clientName: item.name,
                originAddress: item.address || '',
                originZip: item.zip || '',
                originCity: item.city || '',
                originCoordinates: item.coordinates || '',
                branchId: null,
                _parentClientId: null
            }));
        }
        setShowSuggestions(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // For Pickups, origin is the relevant address
        const fullOrigin = `${formData.originAddress}, ${formData.originZip} ${formData.originCity}`.trim();

        const maxId = (allShipments || []).reduce((max, s) => {
            const num = parseInt(String(s.id || '').replace(/\D/g, ''), 10);
            return (!isNaN(num) && num < 100000 && num > max) ? num : max;
        }, 0);

        const newPickup = {
            // REC- desde 2026-08-20; las recogidas anteriores conservan su PU-.
            // El número no depende del prefijo: maxId sale de quitar las letras a
            // TODOS los albaranes, así que recogidas y envíos comparten contador.
            id: `REC-${maxId + 1}`,
            type: 'Recogida', // Essential tag
            client: formData.clientName,
            branchId: formData.branchId || null,
            _parentClientId: formData._parentClientId || null,

            // Pickup Location (Origin)
            origin: fullOrigin,
            originAddress: formData.originAddress,
            originZip: formData.originZip,
            originCity: formData.originCity,
            originCoordinates: formData.originCoordinates,

            // Destination is generic for Pickups until processed
            destination: 'Almacén Central',

            address: fullOrigin, // Main display address for functionality
            status: 'Pendiente de asignar', // Initial status
            date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
            amount: 'Por valorar',
            observations: formData.observations,

            // Will be handled by parent to assign to creator or pool
            isPickup: true
        };

        onSave(newPickup);
        onClose();
    };

    if (!isOpen) return null;

    const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm";
    const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1";

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white sm:rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col modal-mobile-full">
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-amber-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-amber-600" size={20} />
                        Nueva Recogida
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar">
                    <form onSubmit={handleSubmit} className="space-y-5">

                        <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-100 mb-4">
                            <p className="text-xs text-amber-800 flex gap-2">
                                <Building2 size={14} className="shrink-0 mt-0.5" />
                                Solo se requiere información del remitente. El destino será el almacén por defecto.
                            </p>
                        </div>

                        <div className="space-y-3">
                            <div className="relative">
                                <div className="flex justify-between items-center mb-1">
                                    <label className={labelClass + " mb-0"}>Remitente / Empresa</label>
                                    <button
                                        type="button"
                                        onClick={() => startListening('sender', 'clientName')}
                                        className={`p-1 rounded-md transition-colors ${listeningField === 'sender' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                        title="Hablar para escribir"
                                    >
                                        {listeningField === 'sender' ? <MicOff size={14} /> : <Mic size={14} />}
                                    </button>
                                </div>
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
                                        {filteredClients.map(item => (
                                            <button
                                                key={item.id}
                                                type="button"
                                                className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${item._type === 'branch' ? 'bg-blue-50/30' : ''}`}
                                                onClick={() => selectClient(item)}
                                            >
                                                <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                                    {item._type === 'branch' && <span className="text-blue-500 text-[10px]">📍</span>}
                                                    {item._displayName || item.name}
                                                </div>
                                                <div className="text-[10px] text-slate-500 truncate">
                                                    {item._type === 'branch' && item._branch ? (item._branch.address || item._branch.city || '') : item.address}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className={labelClass + " mb-0"}>Dirección de Recogida</label>
                                    <button
                                        type="button"
                                        onClick={() => startListening('address', 'originAddress')}
                                        className={`p-1 rounded-md transition-colors ${listeningField === 'address' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                        title="Hablar para escribir"
                                    >
                                        {listeningField === 'address' ? <MicOff size={14} /> : <Mic size={14} />}
                                    </button>
                                </div>
                                <input
                                    type="text"
                                    placeholder="Dirección completa"
                                    className={inputClass}
                                    value={formData.originAddress}
                                    onChange={(e) => setFormData({ ...formData, originAddress: e.target.value })}
                                />
                            </div>

                            {/* GPS Indicator for Origin */}
                            <div className="hidden justify-end -mt-2">
                                <button
                                    type="button"
                                    onClick={captureGps}
                                    disabled={gettingGps}
                                    className={`text-xs flex items-center gap-1 transition-colors ${formData.originCoordinates
                                        ? 'text-emerald-600 font-bold'
                                        : 'text-slate-400 hover:text-amber-600'
                                        }`}
                                    title="Capturar ubicación GPS"
                                >
                                    {gettingGps ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />}
                                    {formData.originCoordinates ? 'Ubicación Capturada' : 'Añadir GPS'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Población</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={formData.originCity}
                                        onChange={(e) => setFormData({ ...formData, originCity: e.target.value })}
                                        list="poblaciones-list"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>CP</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={formData.originZip}
                                        onChange={(e) => setFormData({ ...formData, originZip: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={14} /> Observaciones
                                </h4>
                                <button
                                    type="button"
                                    onClick={() => startListening('observations', 'observations')}
                                    className={`p-1 rounded-md transition-colors ${listeningField === 'observations' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                    title="Hablar para escribir"
                                >
                                    {listeningField === 'observations' ? <MicOff size={14} /> : <Mic size={14} />}
                                </button>
                            </div>
                            <textarea
                                className="flex-1 w-full bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 resize-none h-24"
                                placeholder="Horario preferente, bultos, peso aproximado..."
                                value={formData.observations}
                                onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
                            ></textarea>
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm"
                            >
                                <Package size={18} />
                                Crear Recogida
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <datalist id="poblaciones-list">
                {(allPoblaciones || []).map((poblacion, idx) => (
                    <option key={`${idx}-${poblacion}`} value={poblacion} />
                ))}
            </datalist>
        </div>
    );
}
