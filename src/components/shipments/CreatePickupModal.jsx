import { X, Building2, Package, FileText, MapPin, Loader2, Mic, MicOff, Truck, Phone, Euro, User } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import CityAutocomplete from '../CityAutocomplete';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { ahoraParaInputLocal, conHoraRapida, HORAS_RAPIDAS_DE_ASIGNACION } from '../../utils/horaDeAsignacion';

// Serie de las recogidas. REC- desde 2026-08-20; las anteriores conservan su PU-.
const SERIE_RECOGIDAS = 'REC';

const FORMULARIO_VACIO = {
    clientName: '',
    originAddress: '',
    originZip: '',
    originCity: '',
    originPhone: '', // Teléfono del remitente: es el que llama el repartidor desde la parada.
    observations: '',
    originCoordinates: '',
    branchId: null,
    _parentClientId: null,
    assignedDriverId: '',
    scheduledDate: '', // Hora a la que le sale al conductor. Solo la pone la oficina.

    // Destinatario y precio, si la oficina ya los sabe al apuntar la recogida.
    // Van con los mismos nombres que en el albarán: cuando el repartidor termina
    // la recogida, el alta de albarán (CreateShipmentModal) se abre rellenada con
    // la recogida entera y estos campos salen puestos sin teclear nada.
    destinationName: '',
    destinationAddress: '',
    destinationZip: '',
    destinationCity: '',
    destinationPhone: '',
    destinationCoordinates: '',
    precio: '',           // Precio del porte, en número. Vacío = «Por valorar», como siempre.
    porteType: 'Pagado'   // Quién paga el porte. 'Pagado' es lo que ya tenían todas las recogidas.
};

export default function CreatePickupModal({ isOpen, onClose, onSave, clients, allPoblaciones, allShipments, drivers = [], driverNamePreference = 'both', isDriver, coverageZones = [] }) {
    const [formData, setFormData] = useState(FORMULARIO_VACIO);

    const [gettingGps, setGettingGps] = useState(false);

    // ── Guardado ──
    // `guardando` bloquea el botón mientras se reserva el número y se guarda.
    // `avisoGuardado` es el motivo por el que la recogida NO se ha guardado; el
    // modal se queda abierto para que se vea y no se pierda lo tecleado.
    // `numeroReservadoRef` guarda el número que ya dio el servidor: si el guardado
    // falla y se vuelve a pulsar, se reutiliza en vez de gastar otro.
    const [guardando, setGuardando] = useState(false);
    const [avisoGuardado, setAvisoGuardado] = useState(null); // { tipo: 'error' | 'cola', texto }
    const numeroReservadoRef = useRef(null);

    const [filteredClients, setFilteredClients] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [filteredDestinations, setFilteredDestinations] = useState([]);
    const [showDestSuggestions, setShowDestSuggestions] = useState(false);
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
                    if (targetKey === 'destinationName') {
                        setTimeout(() => updateDestSuggestions(newValue), 50);
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
            setFormData(FORMULARIO_VACIO);
            setShowSuggestions(false);
            setShowDestSuggestions(false);
            setAvisoGuardado(null);
            setGuardando(false);
            numeroReservadoRef.current = null;
        }
        // Al crear la recogida NO se captura el GPS, ni en la oficina ni en el
        // móvil: quien la apunta no está en casa del remitente. La ubicación se
        // coge cuando el repartidor llega y hace el albarán (CreateShipmentModal).
        // Si se capturaba aquí, la ficha del remitente nacía con la posición de
        // donde se apuntó la recogida y el GPS bueno ya no la pisaba (sólo
        // rellena huecos).
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

    // Mismo criterio que en el alta de albaranes (CreateShipmentModal): al elegir
    // la población se busca su código postal primero en el listado de Baremos
    // (coverageZones) y, si no está, en la lista fija; y al teclear un CP se
    // rellena la población. Sin esto el CP se quedaba vacío al elegir del desplegable.
    const normalizeCity = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    // `lado` es 'origin' (remitente) o 'destination' (destinatario): los dos pares
    // población/CP se rellenan con la misma regla.
    const handleCityChange = (city, lado = 'origin') => {
        const zoneMatch = (coverageZones || []).find(z => z.zip && normalizeCity(z.name) === normalizeCity(city));
        const baremoMatch = zoneMatch ? null : ALL_BAREMO_PUEBLOS.find(p => p.zip && normalizeCity(p.name) === normalizeCity(city));
        const matchedZip = (zoneMatch && zoneMatch.zip) || (baremoMatch && baremoMatch.zip) || null;
        setFormData(prev => ({ ...prev, [`${lado}City`]: city, ...(matchedZip ? { [`${lado}Zip`]: matchedZip } : {}) }));
    };

    const handleZipChange = (zip, lado = 'origin') => {
        const match = zip.length >= 4 ? ALL_BAREMO_PUEBLOS.find(p => p.zip === zip) : null;
        setFormData(prev => ({ ...prev, [`${lado}Zip`]: zip, ...(match ? { [`${lado}City`]: match.name } : {}) }));
    };

    // Las fichas (y sus sedes) que casan con lo tecleado. Sirve para el remitente
    // y para el destinatario, que buscan en la misma lista.
    const buscarFichas = (value) => {
        if (!clients) return null;
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

        return results;
    };

    const updateSuggestions = (value) => {
        const results = buscarFichas(value);
        if (!results) return;
        setFilteredClients(results);
        setShowSuggestions(results.length > 0);
    };

    const updateDestSuggestions = (value) => {
        const results = buscarFichas(value);
        if (!results) return;
        setFilteredDestinations(results);
        setShowDestSuggestions(results.length > 0);
    };

    const handleFocus = () => updateSuggestions(formData.clientName);
    const handleDestFocus = () => updateDestSuggestions(formData.destinationName);

    const handleDestinationNameChange = (e) => {
        setFormData(prev => ({ ...prev, destinationName: e.target.value }));
        updateDestSuggestions(e.target.value);
    };

    // Mismo relleno que al elegir el destinatario en el alta de albaranes:
    // dirección, CP, población, teléfono y coordenadas de la ficha o de la sede.
    const selectDestination = (item) => {
        if (item._type === 'branch' && item._branch) {
            const branch = item._branch;
            setFormData(prev => ({
                ...prev,
                destinationName: item._displayName || item.name,
                destinationAddress: branch.address || item.address || '',
                destinationZip: branch.zip || item.zip || '',
                destinationCity: branch.city || item.city || '',
                destinationPhone: branch.mobile || branch.phone || item.mobile || item.phone || '',
                destinationCoordinates: branch.coordinates || item.coordinates || ''
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                destinationName: item.name,
                destinationAddress: item.address || '',
                destinationZip: item.zip || '',
                destinationCity: item.city || '',
                destinationPhone: item.mobile || item.phone || '',
                destinationCoordinates: item.coordinates || ''
            }));
        }
        setShowDestSuggestions(false);
    };

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
                // Móvil antes que fijo: es a quien hay que localizar para recoger.
                originPhone: branch.mobile || branch.phone || item.mobile || item.phone || '',
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
                originPhone: item.mobile || item.phone || '',
                originCoordinates: item.coordinates || '',
                branchId: null,
                _parentClientId: null
            }));
        }
        setShowSuggestions(false);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (guardando) return;
        setGuardando(true);
        setAvisoGuardado(null);

        // For Pickups, origin is the relevant address
        const fullOrigin = `${formData.originAddress}, ${formData.originZip} ${formData.originCity}`.trim();

        // Destinatario y precio sólo los apunta la oficina. Si no se ponen, la
        // recogida sale como siempre: destino «Almacén Central» y «Por valorar».
        const destinatario = !isDriver ? String(formData.destinationName || '').trim() : '';
        const hayDestinatario = destinatario !== '';
        const fullDestination = hayDestinatario
            ? [formData.destinationAddress, [formData.destinationZip, formData.destinationCity].filter(Boolean).join(' ')].filter(Boolean).join(', ')
            : '';
        const precio = !isDriver ? parseFloat(String(formData.precio || '').replace(',', '.')) : NaN;
        const hayPrecio = Number.isFinite(precio) && precio > 0;

        try {
            // El número lo reserva el servidor (reservar_numeros_albaran), que ve
            // TODAS las recogidas y atiende de una en una. Antes se calculaba con la
            // lista de este navegador: la oficina con el Modo Fantasma echado no
            // veía las recogidas de clientes Habituales, y dos pantallas a la vez
            // sacaban el mismo número; el guardado por upsert pisaba la otra
            // recogida sin avisar. Sin conexión se numera en local, como siempre.
            if (!numeroReservadoRef.current) {
                const { primero } = await reservarNumerosAlbaran(SERIE_RECOGIDAS, 1, { enviosLocales: allShipments });
                numeroReservadoRef.current = primero;
            }

            const newPickup = {
                id: `${SERIE_RECOGIDAS}-${numeroReservadoRef.current}`,
                type: 'Recogida', // Essential tag
                client: formData.clientName,
                branchId: formData.branchId || null,
                _parentClientId: formData._parentClientId || null,

                // Pickup Location (Origin)
                origin: fullOrigin,
                originAddress: formData.originAddress,
                originZip: formData.originZip,
                originCity: formData.originCity,
                originPhone: String(formData.originPhone || '').trim(),
                originCoordinates: formData.originCoordinates,

                // Destino: el destinatario si la oficina ya lo sabe; si no, el
                // almacén, hasta que el repartidor haga el albarán.
                destination: hayDestinatario ? (fullDestination || destinatario) : 'Almacén Central',
                destinationName: destinatario,
                destinationAddress: hayDestinatario ? String(formData.destinationAddress || '').trim() : '',
                destinationZip: hayDestinatario ? String(formData.destinationZip || '').trim() : '',
                destinationCity: hayDestinatario ? String(formData.destinationCity || '').trim() : '',
                destinationPhone: hayDestinatario ? String(formData.destinationPhone || '').trim() : '',
                destinationCoordinates: hayDestinatario ? (formData.destinationCoordinates || '') : '',

                address: fullOrigin, // Main display address for functionality
                // Si la oficina ya eligió conductor aquí mismo, la recogida nace igual que
                // si la hubiera asignado luego desde el listado: «En reparto» y con la hora
                // programada. Hasta esa hora no le aparece al conductor.
                status: (!isDriver && formData.assignedDriverId) ? 'En reparto' : 'Pendiente de asignar',
                assignedDriverId: (!isDriver && formData.assignedDriverId) ? Number(formData.assignedDriverId) : null,
                scheduledDate: (!isDriver && formData.assignedDriverId && formData.scheduledDate) ? formData.scheduledDate : null,
                date: new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }),
                // Con el mismo formato que guarda el alta de albaranes («€12.00» y
                // el número aparte en customAmount) para que los listados lo pinten
                // igual. Una recogida con precio NO es un cobro pendiente (ver
                // lineasDeCobro): el cobro nace con el albarán que sale de ella.
                amount: hayPrecio ? `€${precio.toFixed(2)}` : 'Por valorar',
                customAmount: hayPrecio ? precio : null,
                porteType: (!isDriver && formData.porteType) || 'Pagado',
                observations: formData.observations,

                // Will be handled by parent to assign to creator or pool
                isPickup: true
            };

            // Se espera la respuesta: si el guardado dice que no, el modal se queda
            // abierto con el motivo. Antes se cerraba sin esperar y una recogida
            // que no llegaba a la base de datos parecía guardada (04/09/2026,
            // recogida de Agrícola Castillero que no existía en ninguna parte).
            const resultado = await onSave(newPickup);

            if (resultado === false) {
                setAvisoGuardado({
                    tipo: 'error',
                    texto: `La recogida ${newPickup.id} NO se ha guardado: el servidor ha devuelto un error. Los datos siguen aquí; vuelve a pulsar "Crear Recogida" o avisa a administración.`
                });
                return;
            }

            // Guardado en la cola offline de este navegador: todavía no está en la
            // base de datos. Al repartidor se le deja seguir (es su forma normal de
            // trabajar sin cobertura); a la oficina se le dice, porque desde un
            // ordenador con conexión eso significa que algo va mal.
            if (resultado === 'encolado' && !isDriver) {
                setAvisoGuardado({
                    tipo: 'cola',
                    texto: `La recogida ${newPickup.id} se ha quedado pendiente de sincronizar en este navegador y todavía NO está en la base de datos. Se subirá sola cuando vuelva la conexión con el servidor; si cierras el navegador antes, se pierde.`
                });
                return;
            }

            numeroReservadoRef.current = null;
            onClose();
        } catch (err) {
            console.error('[CreatePickupModal] No se pudo guardar la recogida:', err);
            setAvisoGuardado({
                tipo: 'error',
                texto: `La recogida NO se ha guardado (${err?.message || 'error inesperado'}). Los datos siguen aquí; vuelve a intentarlo.`
            });
        } finally {
            setGuardando(false);
        }
    };

    if (!isOpen) return null;

    const nombreDeConductor = (d) => {
        const name = d?.name || '';
        const alias = d?.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };

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
                                {isDriver
                                    ? 'Solo se requiere información del remitente. El destino será el almacén por defecto.'
                                    : 'Solo hace falta el remitente. Si ya se sabe el destinatario o el precio, se apuntan abajo y salen puestos en el albarán cuando el repartidor termine la recogida.'}
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
                                    <CityAutocomplete
                                        className={inputClass}
                                        value={formData.originCity}
                                        poblaciones={allPoblaciones || []}
                                        placeholder="Población"
                                        required
                                        onChange={(e) => handleCityChange(e.target.value)}
                                        onSelect={(val) => handleCityChange(val)}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>CP</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={formData.originZip}
                                        onChange={(e) => handleZipChange(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Teléfono del remitente. Va a originPhone, que es lo que
                                el repartidor llama desde la parada y lo que sale en el
                                detalle del albarán; antes había que meterlo en
                                Observaciones y no servía para el botón de llamar. */}
                            <div>
                                <div className="flex justify-between items-center mb-1">
                                    <label className={labelClass + " mb-0"}>Teléfono</label>
                                    <button
                                        type="button"
                                        onClick={() => startListening('phone', 'originPhone')}
                                        className={`p-1 rounded-md transition-colors ${listeningField === 'phone' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                        title="Hablar para escribir"
                                    >
                                        {listeningField === 'phone' ? <MicOff size={14} /> : <Mic size={14} />}
                                    </button>
                                </div>
                                <div className="relative">
                                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    <input
                                        type="tel"
                                        inputMode="tel"
                                        placeholder="Teléfono de contacto..."
                                        className={inputClass + " pl-9"}
                                        value={formData.originPhone}
                                        onChange={(e) => setFormData({ ...formData, originPhone: e.target.value })}
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

                        {/* ── DESTINATARIO Y PRECIO (solo oficina, opcionales) ──
                            Lo que se apunte aquí viaja dentro de la recogida y el alta
                            de albarán lo carga tal cual cuando el repartidor la termina.
                            Al repartidor no se le enseña: su recogida sigue siendo rápida. */}
                        {!isDriver && (
                            <div className="pt-2 border-t border-slate-100 space-y-3">
                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2">
                                    <User size={14} className="text-amber-600" />
                                    Destinatario
                                    <span className="font-medium normal-case tracking-normal text-[10px] text-slate-400">(opcional, si ya se sabe)</span>
                                </h4>
                                <div className="relative">
                                    <div className="flex justify-between items-center mb-1">
                                        <label className={labelClass + " mb-0"}>Nombre del destinatario</label>
                                        <button
                                            type="button"
                                            onClick={() => startListening('destination', 'destinationName')}
                                            className={`p-1 rounded-md transition-colors ${listeningField === 'destination' ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'}`}
                                            title="Hablar para escribir"
                                        >
                                            {listeningField === 'destination' ? <MicOff size={14} /> : <Mic size={14} />}
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="Buscar destinatario..."
                                        className={inputClass}
                                        value={formData.destinationName}
                                        onChange={handleDestinationNameChange}
                                        onFocus={handleDestFocus}
                                        onBlur={() => setTimeout(() => setShowDestSuggestions(false), 150)}
                                    />
                                    {showDestSuggestions && filteredDestinations.length > 0 && (
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-lg shadow-xl z-[100] max-h-40 overflow-y-auto">
                                            {filteredDestinations.map(item => (
                                                <button
                                                    key={item.id}
                                                    type="button"
                                                    className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${item._type === 'branch' ? 'bg-blue-50/30' : ''}`}
                                                    onMouseDown={(e) => { e.preventDefault(); selectDestination(item); }}
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
                                    <label className={labelClass}>Dirección de Entrega</label>
                                    <input
                                        type="text"
                                        placeholder="Dirección del destinatario"
                                        className={inputClass}
                                        value={formData.destinationAddress}
                                        onChange={(e) => setFormData(prev => ({ ...prev, destinationAddress: e.target.value }))}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Población de Entrega</label>
                                        <CityAutocomplete
                                            className={inputClass}
                                            value={formData.destinationCity}
                                            poblaciones={allPoblaciones || []}
                                            placeholder="Población de entrega"
                                            onChange={(e) => handleCityChange(e.target.value, 'destination')}
                                            onSelect={(val) => handleCityChange(val, 'destination')}
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>CP de Entrega</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            value={formData.destinationZip}
                                            onChange={(e) => handleZipChange(e.target.value, 'destination')}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClass}>Teléfono del Destinatario</label>
                                    <div className="relative">
                                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                        <input
                                            type="tel"
                                            inputMode="tel"
                                            placeholder="Teléfono del destinatario..."
                                            className={inputClass + " pl-9"}
                                            value={formData.destinationPhone}
                                            onChange={(e) => setFormData(prev => ({ ...prev, destinationPhone: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 pt-1">
                                    <Euro size={14} className="text-amber-600" />
                                    Precio del Porte
                                    <span className="font-medium normal-case tracking-normal text-[10px] text-slate-400">(opcional, si ya está fijado)</span>
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Precio (€)</label>
                                        <div className="relative">
                                            <Euro size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                inputMode="decimal"
                                                placeholder="Por valorar"
                                                className={inputClass + " pl-9"}
                                                value={formData.precio}
                                                onChange={(e) => setFormData(prev => ({ ...prev, precio: e.target.value }))}
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Quién paga</label>
                                        <select
                                            className={inputClass}
                                            value={formData.porteType}
                                            onChange={(e) => setFormData(prev => ({ ...prev, porteType: e.target.value }))}
                                        >
                                            <option value="Pagado">Pagado (remitente)</option>
                                            <option value="Debido">Debido (destinatario)</option>
                                        </select>
                                    </div>
                                </div>
                                <p className="text-[10px] text-slate-400 leading-tight">
                                    Sin precio, el albarán sale «Por valorar» y lo pone el repartidor al hacerlo.
                                </p>
                            </div>
                        )}

                        {/* ── PROGRAMAR LA ASIGNACIÓN (solo oficina) ──
                            Mismo par conductor + fecha/hora que el cuadro «Programar
                            Asignación» del listado, para dejarlo hecho al crear. */}
                        {!isDriver && (
                            <div className="pt-2 border-t border-slate-100">
                                <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-2 mb-2">
                                    <Truck size={14} className="text-amber-600" />
                                    Programar Asignación
                                    <span className="font-medium normal-case tracking-normal text-[10px] text-slate-400">(opcional)</span>
                                </h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <label className={labelClass}>Conductor</label>
                                        <select
                                            className={inputClass}
                                            value={formData.assignedDriverId}
                                            onChange={(e) => {
                                                const driverId = e.target.value;
                                                setFormData(prev => ({
                                                    ...prev,
                                                    assignedDriverId: driverId,
                                                    // Al elegir conductor se propone «ahora»; si se quita, se
                                                    // borra también la hora.
                                                    scheduledDate: driverId ? (prev.scheduledDate || ahoraParaInputLocal()) : ''
                                                }));
                                            }}
                                        >
                                            <option value="">-- Sin asignar --</option>
                                            {(drivers || []).filter(d => d.isActive !== false).map(d => (
                                                <option key={d.id} value={d.id}>{nombreDeConductor(d)}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Fecha y Hora de Asignación</label>
                                        <input
                                            type="datetime-local"
                                            className={inputClass}
                                            value={formData.scheduledDate}
                                            disabled={!formData.assignedDriverId}
                                            onChange={(e) => setFormData(prev => ({ ...prev, scheduledDate: e.target.value }))}
                                        />
                                        <div className="flex gap-2 mt-2">
                                            {HORAS_RAPIDAS_DE_ASIGNACION.map(hora => {
                                                const activa = (formData.scheduledDate || '').endsWith(`T${hora}`);
                                                return (
                                                    <button
                                                        key={hora}
                                                        type="button"
                                                        disabled={!formData.assignedDriverId}
                                                        onClick={() => setFormData(prev => ({ ...prev, scheduledDate: conHoraRapida(prev.scheduledDate, hora) }))}
                                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${activa
                                                            ? 'bg-blue-600 border-blue-600 text-white'
                                                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-400 hover:text-blue-600'}`}
                                                    >
                                                        {hora}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                                            {formData.assignedDriverId
                                                ? 'No le aparece al conductor hasta esa hora.'
                                                : 'Elige conductor para poder programar la hora.'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {avisoGuardado && (
                            <div
                                role="alert"
                                className={`p-3 rounded-lg border text-xs font-semibold ${avisoGuardado.tipo === 'error'
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-amber-50 border-amber-200 text-amber-800'}`}
                            >
                                {avisoGuardado.texto}
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm"
                            >
                                {avisoGuardado?.tipo === 'cola' ? 'Cerrar' : 'Cancelar'}
                            </button>
                            {/* En cola ya no hay nada que reintentar: volver a pulsar duplicaría la recogida en pantalla. */}
                            {avisoGuardado?.tipo !== 'cola' && (
                                <button
                                    type="submit"
                                    disabled={guardando}
                                    className="flex-[2] bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 transition-colors shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 text-sm disabled:opacity-60 disabled:cursor-wait"
                                >
                                    {guardando ? <Loader2 size={18} className="animate-spin" /> : <Package size={18} />}
                                    {guardando ? 'Guardando...' : (avisoGuardado ? 'Volver a intentar' : 'Crear Recogida')}
                                </button>
                            )}
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
