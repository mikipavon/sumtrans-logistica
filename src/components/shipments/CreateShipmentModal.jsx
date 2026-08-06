import { X, Truck, Package, Euro, Map as MapIcon, Building2, FileText, UserPlus, Check, MapPin, Loader2, CheckCircle, Trash2, Plus, Mic, MicOff, RotateCcw, Image as ImageIcon, Camera } from 'lucide-react';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Shipment from '../../models/Shipment';
import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import { uploadProof } from '../../utils/storage';
import { compressImage } from '../../utils/imageCompression';
import { printSimplifiedInvoice } from '../../utils/printSimplifiedInvoice';
import CityAutocomplete from '../CityAutocomplete';
import { supabase } from '../../lib/supabase';

export default function CreateShipmentModal({ isOpen, onClose, onSave, drivers, clients, allPoblaciones, prefillData, onAddClient, onUpdateClient, tariffs, articles, defaultCodFee, familyOrder, isDriver, coverageZones = [], allShipments = [], onUpdateShipment, currentDriverId }) {
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
        codCommission: '',
        agencyLabel: 'SUM ESPECIAL',
        agencyLogoUrl: null,
        hasReturn: false,
        needsSignatureReturn: false
    });

    const [filteredClients, setFilteredClients] = useState([]);
    const [filteredDestinations, setFilteredDestinations] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [showDestSuggestions, setShowDestSuggestions] = useState(false);
    const [savedDestClient, setSavedDestClient] = useState(false);
    const [listeningField, setListeningField] = useState(null);
    const [keepOrigin, setKeepOrigin] = useState(false); // 'sender', 'destination', 'observations'
    const [selectedDebtIds, setSelectedDebtIds] = useState([]); // Deudas seleccionadas para cobrar
    const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);

    // ── Ref para el input del destinatario (para auto-focus en creación múltiple) ──
    const destinationInputRef = useRef(null);

    // ── Números de albarán ya emitidos en esta sesión del modal ──
    // En Envío Múltiple el modal no se cierra entre albaranes, y la prop
    // allShipments tarda en actualizarse (onSave → upsert en Supabase → setShipments
    // → re-render). Si se guardan dos albaranes seguidos rápido, el segundo
    // recalcularía el MISMO número correlativo y el upsert pisaría al primero.
    // Guardamos aquí el último número emitido por serie para que no se repita.
    const issuedNumbersRef = useRef({});

    // ── ¿Se ha creado ya algún albarán con Envío Múltiple activo? ──
    // Cambiar el remitente desactiva el Envío Múltiple, pero SOLO una vez
    // encadenada la serie: si no, marcar la casilla y escribir después el
    // remitente (el orden natural, la casilla está justo encima del campo)
    // la desmarcaba sola y el modal se cerraba al guardar.
    const multipleChainStartedRef = useRef(false);

    // ── Número más alto que hay realmente en la base de datos, por serie ──
    // allShipments es el estado en memoria de ESTE dispositivo: no ve los
    // albaranes que hayan creado otros mientras tanto. Se consulta una vez al
    // abrir el modal (no en cada albarán, para no penalizar al conductor).
    const dbMaxNumbersRef = useRef({});
    useEffect(() => {
        if (!isOpen) return;
        let cancelled = false;
        (async () => {
            try {
                const { data } = await supabase.from('shipments').select('id');
                if (cancelled || !data) return;
                const maxByPrefix = {};
                for (const row of data) {
                    const m = String(row.id || '').match(/^([A-Z]+)-(\d+)$/i);
                    if (!m) continue;
                    const key = m[1].toUpperCase();
                    const num = parseInt(m[2], 10);
                    if (!isNaN(num) && num < 100000 && num > (maxByPrefix[key] || 0)) {
                        maxByPrefix[key] = num;
                    }
                }
                dbMaxNumbersRef.current = maxByPrefix;
            } catch (err) {
                // Sin conexión: seguimos con allShipments. El peor caso es un
                // número repetido, igual que antes de este cambio.
                console.warn('[CreateShipment] No se pudo consultar el último nº de albarán:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen]);

    // ── GPS silencioso: captura la ubicación del dispositivo al abrir el modal ──
    const capturedGpsRef = useRef('');
    useEffect(() => {
        if (isOpen && navigator.geolocation) {
            capturedGpsRef.current = '';
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    capturedGpsRef.current = `${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`;
                },
                () => { /* Sin GPS disponible — silencioso */ },
                { timeout: 10000, maximumAge: 60000 }
            );
        }
    }, [isOpen]);

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
                // Eliminar punto final u otras puntuaciones que suele poner el dictado
                const transcript = event.results[0][0].transcript.replace(/[.,;:]$/, '').trim();
                
                setFormData(prev => {
                    const newValue = prev[targetKey] ? `${prev[targetKey]} ${transcript}` : transcript;
                    
                    // Disparar las sugerencias (búsqueda) automáticamente
                    if (targetKey === 'clientName') {
                        setTimeout(() => updateSuggestions(newValue), 50);
                    } else if (targetKey === 'destinationName') {
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
    const [showPaymentAlert, setShowPaymentAlert] = useState(false);
    const [pendingSubmitData, setPendingSubmitData] = useState(null);
    const [gettingOriginGps, setGettingOriginGps] = useState(false);
    const [gettingDestGps, setGettingDestGps] = useState(false);

    // Article Selection State
    const [selectedArticles, setSelectedArticles] = useState([]);
    const [tempArticleId, setTempArticleId] = useState('');
    const [tempQuantity, setTempQuantity] = useState(1);

    // Weight-based pricing state (for agencies like XPO, TSB, TXT)
    const [weightKg, setWeightKg] = useState('');

    // Retorno generado al entregar. Viene con las observaciones ya rellenas
    // ("[RETORNO DE SUM-xxxx]", que es lo que enlaza el retorno con la entrega de la
    // que sale y se imprime en el albarán y en la etiqueta), así que la comprobación
    // general de "artículo u observación" pasaba sola y el retorno salía sin que nadie
    // dijera qué se recoge ni cuántos bultos son. En los retornos el artículo es
    // obligatorio.
    const isReturn = !!prefillData?.isReturn;

    // Merchandise Photo State
    const [merchandisePhoto, setMerchandisePhoto] = useState(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [validationFailed, setValidationFailed] = useState(false);
    const fileInputRef = useRef(null);
    const cameraOpenRef = useRef(false); // Track if the native camera is open

    // ── Persistencia Android: guardar/restaurar formulario ──
    // Android mata la pestaña del navegador al abrir la cámara nativa.
    // Guardamos el estado del formulario en sessionStorage para poder restaurarlo.
    const SESSION_KEY = 'sumtrans_shipment_draft';

    const saveFormToSession = useCallback(() => {
        try {
            const draft = {
                formData,
                selectedArticles,
                weightKg,
                keepOrigin,
                savedAt: Date.now()
            };
            sessionStorage.setItem(SESSION_KEY, JSON.stringify(draft));
        } catch { /* sessionStorage may be full or unavailable */ }
    }, [formData, selectedArticles, weightKg, keepOrigin]);

    // Restaurar borrador al abrir el modal (si Android mató la página)
    useEffect(() => {
        if (!isOpen) return;
        try {
            const saved = sessionStorage.getItem(SESSION_KEY);
            if (saved) {
                const draft = JSON.parse(saved);
                // Solo restaurar si se guardó hace menos de 10 minutos
                if (draft.savedAt && (Date.now() - draft.savedAt) < 10 * 60 * 1000) {
                    if (draft.formData && draft.formData.clientName) {
                        setFormData(prev => ({ ...prev, ...draft.formData }));
                    }
                    if (draft.selectedArticles?.length > 0) {
                        setSelectedArticles(draft.selectedArticles);
                    }
                    if (draft.weightKg) setWeightKg(draft.weightKg);
                    if (draft.keepOrigin !== undefined) setKeepOrigin(draft.keepOrigin);
                }
                sessionStorage.removeItem(SESSION_KEY);
            }
        } catch { /* ignore parse errors */ }
    }, [isOpen]);

    // --- IDLE TIMER (Auto-close after 2 mins of inactivity if open) ---
    const idleTimerRef = useRef(null);

    useEffect(() => {
        if (!isOpen) {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            return;
        }
        
        // Clear previous timer
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        // Set a new timer for 2 minutes (120000 ms)
        idleTimerRef.current = setTimeout(() => {
            // Auto-close due to inactivity
            onClose();
        }, 120000);

        // Pause the idle timer when the page goes to background (camera open)
        const handleVisibility = () => {
            if (document.visibilityState === 'hidden') {
                // Page going to background (camera opening) — pause idle timer
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            } else {
                // Page returning from background — restart idle timer
                if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
                idleTimerRef.current = setTimeout(() => onClose(), 120000);
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        // Cleanup on unmount or when dependencies change
        return () => {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [isOpen, formData, selectedArticles, keepOrigin]);
    // ----------------------------------------------------------------
    const resolveBillingClient = (clientName, parentClientId) => {
        if (!clients) return null;
        // If we have a parent client ID (from branch selection), use it directly
        if (parentClientId) {
            const parent = clients.find(c => String(c.id) === String(parentClientId));
            if (parent) return parent;
        }
        if (!clientName) return null;
        const cName = String(clientName).toLowerCase().trim();
        const client = clients.find(c => 
            String(c.name || '').toLowerCase().trim() === cName || 
            String(c.legalName || '').toLowerCase().trim() === cName
        );
        if (!client) return null;

        const rawNum = client.clientNumber || '';
        const matchSuffix = String(rawNum).match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
        if (matchSuffix) {
            const baseNumber = matchSuffix[1];
            const parentClient = clients.find(c => String(c.clientNumber || '') === baseNumber);
            if (parentClient) return parentClient;
        }
        return client;
    };

    const shouldHidePrices = useMemo(() => {
        if (!isDriver) return false;
        const payingClientName = formData.porteType === 'Pagado' ? formData.clientName : formData.destinationName;
        const parentId = formData.porteType === 'Pagado' ? formData._parentClientId : formData._destParentClientId;
        const payingClient = resolveBillingClient(payingClientName, parentId);
        const bType = String(payingClient?.billingType || '').toLowerCase();
        return bType.includes('factur') || bType.includes('presupuesto');
    }, [isDriver, formData.porteType, formData.clientName, formData.destinationName, formData._parentClientId, formData._destParentClientId, clients]);

    const [priceOverride, setPriceOverride] = useState(null); // null = no override, string = manual price

    // Detect if the PAYING client uses weight-based pricing
    // Solo el cliente que PAGA determina si va por kilos:
    //   - Pagado → el remitente paga → comprobar remitente
    //   - Debido → el destinatario paga → comprobar destinatario
    const weightClientData = useMemo(() => {
        const payingClientName = formData.porteType === 'Pagado' ? formData.clientName : formData.destinationName;
        const parentId = formData.porteType === 'Pagado' ? formData._parentClientId : formData._destParentClientId;
        const client = resolveBillingClient(payingClientName, parentId);
        console.log('[WeightTariff] porteType:', formData.porteType, '| Paying client:', payingClientName, '| Resolved:', client?.name, '| tariffType:', client?.tariffType);
        const isByKilos = client && client.tariffType === 'Por Kilos';
        if (isByKilos) {
            return { client, tariff: client.weightTariff || [] };
        }
        return null;
    }, [formData.porteType, formData.clientName, formData.destinationName, formData._parentClientId, formData._destParentClientId, clients]);

    // Resolve delivery rules from the billing client
    const clientRules = useMemo(() => {
        const payingClientName = formData.porteType === 'Pagado' ? formData.clientName : formData.destinationName;
        const parentId = formData.porteType === 'Pagado' ? formData._parentClientId : formData._destParentClientId;
        const client = resolveBillingClient(payingClientName, parentId);
        if (!client) return { requireWeight: false, requireName: true, requireDNI: false, requirePhoto: false, requireSignature: false };
        return {
            requireWeight: !!client.requireWeight,
            requireName: client.requireName !== false,
            requireDNI: !!client.requireDNI,
            requirePhoto: !!client.requirePhoto,
            requireSignature: client.requireSignature !== false,
        };
    }, [formData.porteType, formData.clientName, formData.destinationName, formData._parentClientId, formData._destParentClientId, clients]);

    // Calculate price from weight bracket
    const calculateWeightPrice = (kg, tariff, clientData) => {
        if (!kg) return 0;
        const weight = parseFloat(kg);
        if (isNaN(weight) || weight <= 0) return 0;

        if (clientData?.weightCalculationMode === 'formula' && clientData?.weightFormula) {
            const { baseKg, basePrice, extraKgPrice } = clientData.weightFormula;
            const bKg = parseFloat(baseKg) || 0;
            const bPrice = parseFloat(basePrice) || 0;
            const ePrice = parseFloat(extraKgPrice) || 0;

            if (weight <= bKg) return bPrice;
            return bPrice + ((weight - bKg) * ePrice);
        }

        if (!tariff || tariff.length === 0) return 0;
        // Sort tariff by maxKg ascending
        const sorted = [...tariff].sort((a, b) => a.maxKg - b.maxKg);
        // Find the first bracket where maxKg >= weight
        const bracket = sorted.find(b => weight <= b.maxKg);
        if (bracket) return parseFloat(bracket.price);
        // If weight exceeds all brackets, use the last (highest) one
        return parseFloat(sorted[sorted.length - 1].price);
    };

    // Get the matched bracket label for UI
    const getWeightBracketLabel = (kg, tariff) => {
        if (!kg || !tariff || tariff.length === 0) return '';
        const weight = parseFloat(kg);
        if (isNaN(weight) || weight <= 0) return '';
        const sorted = [...tariff].sort((a, b) => a.maxKg - b.maxKg);
        const bracket = sorted.find(b => weight <= b.maxKg);
        if (bracket) return `Tramo ≤${bracket.maxKg}kg`;
        return `Tramo >${sorted[sorted.length - 1].maxKg}kg (máximo)`;
    };

    useEffect(() => {
        if (isOpen) {
            setSelectedArticles([]); // Reset articles on open
            setTempArticleId('');
            setTempQuantity(1);
            setWeightKg(''); // Reset weight on open
            setValidationFailed(false); // Reset validation highlights
            setKeepOrigin(false); // Make sure Envío Múltiple resets by default
            issuedNumbersRef.current = {}; // Nueva sesión → nadie ha emitido nada aún
            multipleChainStartedRef.current = false;

            if (prefillData) {
                // Pre-fill from Pickup (Recogida), Return or other source
                setFormData({
                    clientName: prefillData.clientName || prefillData.client || '',
                    originAddress: prefillData.originAddress || '',
                    originZip: prefillData.originZip || '',
                    originCity: prefillData.originCity || '',
                    originPhone: prefillData.originPhone || '',
                    originCoordinates: prefillData.originCoordinates || '',
                    
                    destinationName: prefillData.destinationName || '',
                    destinationAddress: prefillData.destinationAddress || '',
                    destinationZip: prefillData.destinationZip || '',
                    destinationCity: prefillData.destinationCity || '',
                    destinationPhone: prefillData.destinationPhone || '',
                    destinationCoordinates: prefillData.destinationCoordinates || '',

                    amount: prefillData.amount || '',
                    porteType: prefillData.porteType || 'Pagado',
                    assignedDriverId: prefillData.assignedDriverId || '',
                    observations: prefillData.observations || '',
                    hasCod: prefillData.hasCod || false,
                    codAmount: prefillData.codAmount || '',
                    codCommission: prefillData.codCommission || '',
                    agencyLabel: prefillData.agencyLabel || 'SUM ESPECIAL',
                    agencyLogoUrl: prefillData.agencyLogoUrl || null,
                    hasReturn: prefillData.hasReturn || false,
                    needsSignatureReturn: prefillData.needsSignatureReturn || false
                });
                setMerchandisePhoto(prefillData.merchandisePhoto || null);
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
                    codCommission: '',
                    agencyLabel: 'SUM ESPECIAL',
                    agencyLogoUrl: null,
                    hasReturn: false,
                    needsSignatureReturn: false
                });
                setMerchandisePhoto(null);
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
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            }
        }
    }, [isOpen, prefillData]);

    // Helper para limpiar el texto de la voz (ignora puntuación y siglas legales)
    const normalizeForSearch = (text) => {
        if (!text) return '';
        return String(text)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Sin acentos
            .replace(/[.,;:]/g, "") // Sin puntuación añadida por la voz
            .replace(/\b(s\.?l\.?u?|s\.?a\.?|sociedad limitada|sociedad anonima)\b/g, "") // Ignorar S.L. S.A.
            .replace(/\s+/g, " ") // Normalizar espacios múltiples
            .trim();
    };

    const updateSuggestions = (value) => {
        if (!clients) return;
        const search = normalizeForSearch(value);
        // Solo mostrar clientes validados por administración
        // (approved o sin status para compatibilidad con clientes antiguos)
        const approvedClients = clients
            .filter(c => !c.status || c.status === 'approved')
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const results = [];
        approvedClients.forEach(c => {
            const nameMatch = !search || normalizeForSearch(c.name).includes(search);
            // Collect matching branches (keeping user's saved order)
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
            // Add client first, then its branches in saved order
            if (nameMatch) results.push({ ...c, _type: 'client' });
            results.push(...matchingBranches);
        });
        setFilteredClients(results);
        setShowSuggestions(results.length > 0);
    };

    const updateDestSuggestions = (value) => {
        if (!clients) return;
        const search = normalizeForSearch(value);
        // Solo mostrar clientes validados por administración
        const approvedClients = clients
            .filter(c => !c.status || c.status === 'approved')
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const results = [];
        approvedClients.forEach(c => {
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
        setFilteredDestinations(results);
        setShowDestSuggestions(results.length > 0);
    };

    const handleZipChange = (zip, prefix) => {
        const cityKey = prefix === 'origin' ? 'originCity' : 'destinationCity';
        const zipKey = prefix === 'origin' ? 'originZip' : 'destinationZip';
        
        setFormData(prev => ({ ...prev, [zipKey]: zip }));

        if (zip.length >= 4) {
            const match = ALL_BAREMO_PUEBLOS.find(p => p.zip === zip);
            if (match) {
                setFormData(prev => ({ ...prev, [cityKey]: match.name }));
            }
        }
    };

    const normalize = (s) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

    const handleCityChange = (city, prefix) => {
        const cityKey = prefix === 'origin' ? 'originCity' : 'destinationCity';
        const zipKey = prefix === 'origin' ? 'originZip' : 'destinationZip';

        setFormData(prev => ({ ...prev, [cityKey]: city }));

        let matchedZip = null;
        
        // 1. Check coverageZones first
        const zoneMatch = (coverageZones || []).find(z => normalize(z.name) === normalize(city));
        if (zoneMatch && zoneMatch.zip) {
            matchedZip = zoneMatch.zip;
        }

        // 2. Fallback to ALL_BAREMO_PUEBLOS if no zip found
        if (!matchedZip) {
            const baremoMatch = ALL_BAREMO_PUEBLOS.find(p => normalize(p.name) === normalize(city));
            if (baremoMatch && baremoMatch.zip) {
                matchedZip = baremoMatch.zip;
            }
        }

        if (matchedZip) {
            setFormData(prev => ({ ...prev, [zipKey]: matchedZip }));
        }
    };

    const handleFocus = () => updateSuggestions(formData.clientName);
    const handleDestFocus = () => updateDestSuggestions(formData.destinationName);

    const handleClientNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, clientName: value, selectedClientBillingType: null }));
        updateSuggestions(value);
        if (keepOrigin && multipleChainStartedRef.current) setKeepOrigin(false);
    };

    const handleDestinationNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, destinationName: value, selectedDestBillingType: null }));
        updateDestSuggestions(value);
    };

    const selectClient = (item) => {
        if (keepOrigin && multipleChainStartedRef.current) setKeepOrigin(false);
        if (item._type === 'branch' && item._branch) {
            const branch = item._branch;
            setFormData(prev => ({
                ...prev,
                clientName: item._displayName,
                originAddress: branch.address || item.opAddress || item.address || '',
                originZip: branch.zip || item.opZip || item.zip || '',
                originCity: branch.city || item.opCity || item.city || '',
                originPhone: branch.phone || item.phone || '',
                originCoordinates: branch.coordinates || '',
                // Sin tipo de cobro conocido (p. ej. cliente aun pendiente de validar) →
                // se trata como Clientes Habituales, igual que un cliente desconocido.
                selectedClientBillingType: item.billingType || 'Clientes Habituales',
                agencyLabel: item.agencyLabel || 'SUM ESPECIAL',
                agencyLogoUrl: item.agencyLogoUrl || null,
                branchId: branch.id,
                _parentClientId: item.id.split('_')[0],
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                clientName: item.name,
                originAddress: item.opAddress || item.address || '',
                originZip: item.opZip || item.zip || '',
                originCity: item.opCity || item.city || '',
                originPhone: item.phone || '',
                selectedClientBillingType: item.billingType || 'Clientes Habituales',
                agencyLabel: item.agencyLabel || 'SUM ESPECIAL',
                agencyLogoUrl: item.agencyLogoUrl || null,
                branchId: null,
                _parentClientId: null,
            }));
        }
        setShowSuggestions(false);
    };

    const selectDestination = (item) => {
        if (item._type === 'branch' && item._branch) {
            const branch = item._branch;
            setFormData(prev => ({
                ...prev,
                destinationName: item._displayName,
                destinationAddress: branch.address || item.opAddress || item.address || '',
                destinationZip: branch.zip || item.opZip || item.zip || '',
                destinationCity: branch.city || item.opCity || item.city || '',
                destinationPhone: branch.phone || item.phone || '',
                destinationCoordinates: branch.coordinates || item.coordinates || '',
                destinationBranchId: branch.id,
                _destParentClientId: item.id.split('_')[0],
                selectedDestBillingType: item.billingType || null,
            }));
        } else {
            setFormData(prev => ({
                ...prev,
                destinationName: item.name,
                destinationAddress: item.opAddress || item.address || '',
                destinationZip: item.opZip || item.zip || '',
                destinationCity: item.opCity || item.city || '',
                destinationPhone: item.phone || '',
                destinationCoordinates: item.coordinates || '',
                destinationBranchId: null,
                _destParentClientId: null,
                selectedDestBillingType: item.billingType || null,
            }));
        }
        setShowDestSuggestions(false);
    };

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
                // Do not alert on auto-capture error to avoid annoying the user if they denied permission
                setGettingOriginGps(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    useEffect(() => {
        if (isOpen && isDriver && !formData.originCoordinates && !gettingOriginGps) {
            captureOriginGps();
        }
    }, [isOpen, isDriver]);

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

    // Helper to normalize strings for comparison (remove accents, lowercase, remove suffixes)
    const normalizeText = (text) => {
        if (!text) return '';
        return String(text)
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "") // Remove accents
            .replace(/\s+de\s+cordoba$/, "")
            .replace(/\s+de\s+la\s+frontera$/, "")
            .replace(/\s+de\s+los\s+caballeros$/, "")
            .replace(/[^a-z0-9\s]/g, "") // Remove special chars
            .replace(/\s+/g, " "); // Normalize spaces
    };

    // Helper to determine the baremo (1 or 2) for a single point
    const getPointBaremo = (city, zip) => {
        let matchedTariffId = null;
        let baremo = 1;
        let source = "General";

        const cleanCity = String(city || '').trim().toLowerCase();
        const cleanZip = String(zip || '').trim();

        if (!cleanCity && !cleanZip) {
            console.log("📍 [Baremo] Origen/Destino vacío -> B1 (Por defecto)");
            return { baremo: 1, tariffId: null }; 
        }

        if (tariffs) {
            const normCity = normalizeText(cleanCity);
            const cityMatch = tariffs.find(t =>
                t.match && normCity &&
                normalizeText(t.match) === normCity
            );
            const zipMatch = tariffs.find(t =>
                t.zipPrefix && cleanZip &&
                cleanZip.startsWith(t.zipPrefix.trim())
            );
            const foundTariff = cityMatch || zipMatch;
            if (foundTariff) {
                matchedTariffId = foundTariff.id;
                // Si la tarifa tiene baremo explícito (2 o 1), lo usamos. 
                // Si no tiene (es 0 o null), NO defaulteamos a 1 todavía, 
                // permitimos que siga buscando en la lista maestra.
                if (foundTariff.baremo) {
                    baremo = Number(foundTariff.baremo);
                    source = "Tarifa Especial";
                }
            }
        }

        if (!matchedTariffId || baremo === 1) {
            const normCity = normalizeText(cleanCity);
            
            // 1. Check Personalized/DB Coverage Zones
            const dynamicMatch = (coverageZones || []).find(p => 
                (normCity && normalizeText(p.name) === normCity) || 
                (cleanZip && String(p.zip || '').trim() === cleanZip)
            );
            
            // 2. Check Master List (baremos.js) - This ensures Antequera is B2 even if not in DB
            const masterMatch = (ALL_BAREMO_PUEBLOS || []).find(p => 
                (normCity && normalizeText(p.name) === normCity) || 
                (cleanZip && String(p.zip || '').trim() === cleanZip)
            );

            if (dynamicMatch) {
                baremo = Number(dynamicMatch.baremo || 1);
                source = "Lista Personalizada (Ajustes)";
            } else if (masterMatch) {
                baremo = Number(masterMatch.baremo);
                source = "Listado Maestro (Sistema)";
            } else {
                if (cleanZip.startsWith('14')) {
                    baremo = 1;
                    source = "C.P. Córdoba (14xxx)";
                } else if (cleanCity || cleanZip) {
                    baremo = 2;
                    source = "Fuera de Córdoba (B2)";
                } else {
                    baremo = 1;
                    source = "Local (Córdoba)";
                }
            }
        }
        return { baremo, tariffId: matchedTariffId, source };
    };

    // Global helper to determine the effective baremo for the whole shipment
    const getEffectiveBaremo = () => {
        const originInfo = getPointBaremo(formData.originCity, formData.originZip);
        const destInfo = getPointBaremo(formData.destinationCity, formData.destinationZip);

        // If EITHER point is Baremo 2, the whole shipment is Baremo 2
        const baremo = (Number(originInfo.baremo) === 2 || Number(destInfo.baremo) === 2) ? 2 : 1;
        
        // Final source for UI display
        let source = originInfo.baremo === 2 ? originInfo.source : destInfo.source;
        if (originInfo.baremo === 2 && destInfo.baremo === 2) source = `${originInfo.source} + ${destInfo.source}`;

        // We use destination tariff ID for potential zone-specific price overrides 
        // as usually those are defined per destination.
        return { baremo, tariffId: destInfo.tariffId, source };
    };

    // Update existing articles prices when origin or destination changes
    useEffect(() => {
        if (selectedArticles.length === 0) return;

        const { baremo, tariffId } = getEffectiveBaremo();

        const payingClientName = formData.porteType === 'Pagado' ? formData.clientName : formData.destinationName;
        const parentId = formData.porteType === 'Pagado' ? formData._parentClientId : formData._destParentClientId;
        const client = resolveBillingClient(payingClientName, parentId);

        const updatedArticles = selectedArticles.map(item => {
            let unitPrice = parseFloat(item.price || 0); // Base (B1)

            // Solo el que PAGA determina si va por kilos
            if (weightClientData) {
                unitPrice = 0;
            } else if (baremo === 2 && client?.customRatesB2 && client.customRatesB2[item.id] !== undefined && client.customRatesB2[item.id] !== '') {
                unitPrice = parseFloat(client.customRatesB2[item.id]);
            } else if (baremo === 1 && client?.customRates && client.customRates[item.id] !== undefined && client.customRates[item.id] !== '') {
                unitPrice = parseFloat(client.customRates[item.id]);
            } else if (client?.customRates && client.customRates[item.id] !== undefined && client.customRates[item.id] !== '') {
                // Autocompletado si hay general pero no B2
                unitPrice = parseFloat(client.customRates[item.id]);
            } else if (item.zonePrices && tariffId && item.zonePrices[tariffId]) {
                unitPrice = parseFloat(item.zonePrices[tariffId]);
            } else if (baremo === 2 && (item.priceB2 !== undefined && item.priceB2 !== null && item.priceB2 !== '')) {
                unitPrice = parseFloat(item.priceB2);
            }

            return {
                ...item,
                unitPrice,
                totalPrice: unitPrice * item.quantity
            };
        });

        // Only update if something changed
        const hasChanged = JSON.stringify(updatedArticles) !== JSON.stringify(selectedArticles);
        if (hasChanged) {
            console.log("💰 [Precios] Actualizando precios de artículos por cambio de zona:", updatedArticles);
            setSelectedArticles(updatedArticles);
            const articlesTotal = updatedArticles.reduce((sum, item) => sum + item.totalPrice, 0);
            const commission = parseFloat(formData.codCommission) || 0;
            setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
        }
    }, [formData.porteType, formData.clientName, formData.destinationName, formData.originCity, formData.originZip, formData.destinationCity, formData.destinationZip, tariffs, selectedArticles]);

    const addArticle = (id, quantity) => {
        if (!id || quantity <= 0) return;

        const article = (articles || []).find(a => a.id.toString() === id.toString());
        if (!article) return;

        const { baremo, tariffId } = getEffectiveBaremo();

        const payingClientName = formData.porteType === 'Pagado' ? formData.clientName : formData.destinationName;
        const parentId = formData.porteType === 'Pagado' ? formData._parentClientId : formData._destParentClientId;
        const client = resolveBillingClient(payingClientName, parentId);

        let unitPrice = parseFloat(article.price);

        // ── Solo el que PAGA determina si va por kilos ──
        if (weightClientData) {
            unitPrice = 0;
        } else if (baremo === 2 && client?.customRatesB2 && client.customRatesB2[article.id] !== undefined && client.customRatesB2[article.id] !== '') {
            unitPrice = parseFloat(client.customRatesB2[article.id]);
        } else if (baremo === 1 && client?.customRates && client.customRates[article.id] !== undefined && client.customRates[article.id] !== '') {
            unitPrice = parseFloat(client.customRates[article.id]);
        } else if (client?.customRates && client.customRates[article.id] !== undefined && client.customRates[article.id] !== '') {
            unitPrice = parseFloat(client.customRates[article.id]);
        } else if (article.zonePrices && tariffId && article.zonePrices[tariffId]) {
            unitPrice = parseFloat(article.zonePrices[tariffId]);
        } else if (baremo === 2 && (article.priceB2 !== undefined && article.priceB2 !== null && article.priceB2 !== '')) {
            unitPrice = parseFloat(article.priceB2);
        }

        const newItem = {
            ...article,
            uniqueId: Date.now(),
            quantity: parseInt(tempQuantity),
            unitPrice: unitPrice,
            totalPrice: unitPrice * parseInt(tempQuantity)
        };

        const updatedList = [...selectedArticles, newItem];
        setSelectedArticles(updatedList);

        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
        setTempArticleId('');
    };

    const removeArticle = (uniqueId) => {
        const updatedList = selectedArticles.filter(item => item.uniqueId !== uniqueId);
        setSelectedArticles(updatedList);

        const articlesTotal = updatedList.reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        setFormData(prev => ({ ...prev, amount: (articlesTotal + commission).toFixed(2) }));
    };

    useEffect(() => {
        // Precio se calcula solo al seleccionar artículos, no auto-rellena por zona
        return;
    }, [formData.destinationCity, formData.destinationZip, tariffs, isOpen, selectedArticles]);

    const handlePhotoChange = (e) => {
        cameraOpenRef.current = false; // Camera returned
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            alert("La imagen es demasiado grande. Máximo 20MB.");
            return;
        }
        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const compressed = await compressImage(reader.result, 1200, 1200, 0.75);
                setMerchandisePhoto(compressed);
            } catch {
                setMerchandisePhoto(reader.result); // Fallback sin compresión
            }
        };
        reader.readAsDataURL(file);
    };

    // Guardar formulario antes de abrir la cámara (por si Android mata la página)
    const handleOpenCamera = () => {
        cameraOpenRef.current = true;
        saveFormToSession();
        fileInputRef.current?.click();
    };

    const handleInitialSubmit = async (e) => {
        e.preventDefault();

        // Validación obligatoria de kilos para clientes con tarifa por peso O regla "requireWeight"
        if ((weightClientData || clientRules.requireWeight) && (!weightKg || parseFloat(weightKg) <= 0)) {
            setValidationFailed(true);
            alert("⚖️ Este cliente exige el peso obligatorio.\n\nDebes introducir el peso (Kg) del envío antes de continuar.");
            return;
        }

        // Para clientes "Por Kilos", artículo es obligatorio (no vale solo observación)
        if (weightClientData && selectedArticles.length === 0) {
            alert("📦 Este cliente factura por kilos.\n\nDebes seleccionar al menos un artículo (Bulto/Palet) además del peso.");
            return;
        }

        // En un retorno las observaciones vienen rellenas de serie ("[RETORNO DE ...]"),
        // así que la comprobación de abajo pasaba sola y el retorno salía sin decir qué
        // se recoge. Aquí el artículo es obligatorio: la observación ya no vale.
        if (isReturn && selectedArticles.length === 0) {
            setValidationFailed(true);
            alert("📦 FALTA EL ARTÍCULO\n\nEn un retorno hay que añadir el artículo que recoges (los bultos que te llevas de vuelta).\n\nSin él no se pueden imprimir bien las etiquetas.");
            return;
        }

        if (!weightClientData && selectedArticles.length === 0 && (!formData.observations || formData.observations.trim() === '')) {
            alert("⚠️ Atención: Debes añadir al menos un artículo o escribir una observación para describir qué se transporta.");
            return;
        }

        setIsUploadingPhoto(true);

        // Determinar el prefijo según QUIÉN PAGA el porte:
        // - Porte Pagado → paga el REMITENTE → usar su billingType
        // - Porte Debido → paga el DESTINATARIO → usar su billingType
        // HAB- → el pagador es habitual / presupuesto (serie confidencial)
        // SUM- → el pagador es de facturación / empresa (serie visible)
        const isHabitual = (() => {
            const normalize = (val) => String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
            const lookupBilling = (name) => {
                const n = normalize(name);
                const found = clients?.find(c => normalize(c.name) === n || normalize(c.legalName) === n);
                if (found) return found.billingType || 'Clientes Habituales';
                for (const c of (clients || [])) {
                    if (Array.isArray(c.branches)) {
                        for (const b of c.branches) {
                            if (normalize(b.name) === n) return c.billingType || 'Clientes Habituales';
                        }
                    }
                }
                // Cliente sin ficha en la BD → se considera Habitual por defecto
                // (misma regla que aplica el resto del sistema al calcular cobros)
                return 'Clientes Habituales';
            };
            let billingType = '';
            if (formData.porteType === 'Debido') {
                // Paga el DESTINATARIO
                billingType = formData.selectedDestBillingType || lookupBilling(formData.destinationName);
            } else {
                // Paga el REMITENTE (Pagado)
                billingType = formData.selectedClientBillingType || lookupBilling(formData.clientName);
            }
            const t = normalize(billingType);
            return t.includes('habitual') || t.includes('diar') || t.includes('libre') || t.includes('contado') || t.includes('presupuesto');
        })();
        const prefix = isHabitual ? 'HAB' : 'SUM';
        // Calcular el siguiente número correlativo dentro de la misma serie (SUM o HAB)
        const maxFromList = (allShipments || []).reduce((max, s) => {
            const sId = String(s.id || '');
            if (!sId.toUpperCase().startsWith(prefix + '-')) return max;
            const num = parseInt(sId.replace(/\D/g, ''), 10);
            return (!isNaN(num) && num < 100000 && num > max) ? num : max;
        }, 0);
        // …combinado con lo que hay en la BD (otros dispositivos) y con lo ya
        // emitido en esta sesión del modal (allShipments va por detrás cuando se
        // encadenan albaranes en Envío Múltiple).
        // El número se reserva en finalizeSubmit (al guardar de verdad), no aquí,
        // para no dejar huecos en la numeración si se cancela el aviso de cobro.
        const maxId = Math.max(
            maxFromList,
            dbMaxNumbersRef.current[prefix] || 0,
            issuedNumbersRef.current[prefix] || 0
        );
        const shipmentId = `${prefix}-${maxId + 1}`;
        let photoUrl = null;

        try {
            if (merchandisePhoto && merchandisePhoto.startsWith('data:image')) {
                photoUrl = await uploadProof(shipmentId, merchandisePhoto, 'merchandise_photos');
            } else if (merchandisePhoto) {
                photoUrl = merchandisePhoto; // Si ya es una URL (prefill)
            }
        } catch (error) {
            console.error("Error uploading photo:", error);
            const msg = error.message || "Error desconocido";
            alert(`Error al subir la foto: ${msg}\n\nSe guardará el envío sin foto.`);
        }

        const fullOrigin = `${formData.originAddress}, ${formData.originZip} ${formData.originCity}`.trim();
        const fullDest = `${formData.destinationAddress}, ${formData.destinationZip} ${formData.destinationCity}`.trim();

        const shipmentData = {
            id: shipmentId,
            client: formData.clientName,
            branchId: formData.branchId || null,
            _parentClientId: formData._parentClientId || null,
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
            billingType: (function() {
                if (formData.selectedClientBillingType) return formData.selectedClientBillingType;
                const normalize = (val) => String(val || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
                const sName = normalize(formData.clientName);
                // Buscar primero en clientes principales
                const client = clients?.find(c => normalize(c.name) === sName || normalize(c.legalName) === sName);
                // Sin tipo de cobro conocido (p. ej. cliente aun pendiente de validar) →
                // Clientes Habituales, igual que un cliente desconocido: se cobra en el momento.
                if (client) return client.billingType || 'Clientes Habituales';
                // Buscar en sedes/sucursales (branches)
                for (const c of (clients || [])) {
                    if (Array.isArray(c.branches)) {
                        for (const b of c.branches) {
                            if (normalize(b.name) === sName) {
                                return c.billingType || 'Clientes Habituales';
                            }
                        }
                    }
                }
                // Cliente desconocido (no está en BD) → tratarlo como Clientes Habituales
                // para que salte el modal de cobro. La visibilidad en el panel admin
                // la gestiona visibleShipments (muestra siempre si el cliente no está en BD).
                return 'Clientes Habituales';
            })(),
            porteType: formData.porteType,
            assignedDriverId: formData.assignedDriverId ? Number(formData.assignedDriverId) : null,
            observations: formData.observations,
            originCoordinates: formData.originCoordinates || capturedGpsRef.current || '',
            destinationCoordinates: formData.destinationCoordinates,
            destinationBillingType: (function() {
                if (formData.selectedDestBillingType) return formData.selectedDestBillingType;
                const normalize = (val) => String(val || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
                const dName = normalize(formData.destinationName);
                const client = clients?.find(c => normalize(c.name) === dName || normalize(c.legalName) === dName);
                // Sin tipo de cobro conocido (p. ej. cliente aun pendiente de validar) →
                // Clientes Habituales, igual que un cliente desconocido: se cobra en el momento.
                if (client) return client.billingType || 'Clientes Habituales';
                for (const c of (clients || [])) {
                    if (Array.isArray(c.branches)) {
                        for (const b of c.branches) {
                            if (normalize(b.name) === dName) {
                                return c.billingType || 'Clientes Habituales';
                            }
                        }
                    }
                }
                return 'Clientes Habituales';
            })(),
            articles: selectedArticles,
            hasCod: formData.hasCod,
            codAmount: formData.codAmount ? parseFloat(formData.codAmount) : 0,
            codCommission: formData.codCommission ? parseFloat(formData.codCommission) : 0,
            agencyLabel: formData.agencyLabel || 'SUM ESPECIAL',
            agencyLogoUrl: formData.agencyLogoUrl || null,
            hasReturn: !!formData.hasReturn,
            needsSignatureReturn: !!formData.needsSignatureReturn,
            merchandisePhoto: photoUrl,
            weightKg: weightKg ? parseFloat(weightKg) : null,
            weightBracket: weightClientData ? getWeightBracketLabel(weightKg, weightClientData.tariff) : null,
            // Delivery rules snapshot from client config (frozen at creation time)
            deliveryRules: {
                requireName: clientRules.requireName,
                requireDNI: clientRules.requireDNI,
                requirePhoto: clientRules.requirePhoto,
                requireSignature: clientRules.requireSignature,
                requireWeight: clientRules.requireWeight,
            }
        };
        const shipmentModel = new Shipment(shipmentData);
        const needsAlert = shipmentModel.needsPaymentAlert();

        setIsUploadingPhoto(false);

        if (needsAlert) {
            setPendingSubmitData(shipmentData);
            setShowPaymentAlert(true);
        } else {
            let isPendingByDefault = false;
            if (formData.porteType === 'Debido') {
                const isDestFacturacion = shipmentModel.isInvoiceBilling(shipmentData.destinationBillingType);
                if (!isDestFacturacion) {
                    isPendingByDefault = true;
                }
            }
            await finalizeSubmit(shipmentData, isPendingByDefault ? 'Pending' : 'Paid');
        }
    };

    const finalizeSubmit = async (data, paymentStatus) => {
        const finalData = {
            ...data,
            paymentStatus: paymentStatus,
            portePaid: paymentStatus === 'Paid',
            porteCollectedById: paymentStatus === 'Paid' ? currentDriverId : null,
            observations: paymentStatus === 'Pending'
                ? `[COBRO PENDIENTE] ${data.observations}`
                : data.observations
        };

        // Si se seleccionaron deudas pendientes y se pulsa "Cobrado", marcarlas como pagadas
        if (paymentStatus === 'Paid' && selectedDebtIds.length > 0 && onUpdateShipment) {
            for (const debtId of selectedDebtIds) {
                const debtShipment = (allShipments || []).find(s => s && s.id === debtId);
                if (debtShipment) {
                    const updates = { ...debtShipment };
                    if (!debtShipment.portePaid) {
                        updates.portePaid = true;
                        updates.paymentStatus = 'Paid';
                        updates.status = 'Entregado';
                        updates.porteCollectedById = currentDriverId;
                    }
                    if (debtShipment.hasCod && !debtShipment.codPaid) {
                        updates.codPaid = true;
                        updates.codCollectedById = currentDriverId;
                    }
                    try {
                        await onUpdateShipment(debtId, updates);
                    } catch (err) {
                        console.error(`Error cobrando deuda ${debtId}:`, err);
                    }
                }
            }
        }

        setSelectedDebtIds([]);

        // ── Auto-crear clientes desconocidos ──
        if (onAddClient && clients) {
            const normalize = (s) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
            const checkAndCreateClient = (name, type, address, zip, city, phone) => {
                if (!name || String(name).trim() === '') return;
                const nName = normalize(name);
                const exists = clients.some(c => 
                    normalize(c.name) === nName || 
                    normalize(c.legalName) === nName || 
                    (c.branches && c.branches.some(b => normalize(b.name) === nName))
                );
                if (!exists) {
                    onAddClient({
                        name: name.trim(),
                        type: type,
                        address: address || '',
                        zip: zip || '',
                        city: city || '',
                        phone: phone || '',
                        status: 'pending',
                        billingType: 'Clientes Habituales',
                        createdFrom: 'Albarán Automático',
                        createdBy: isDriver ? 'Conductor' : 'Administración',
                        creatorId: currentDriverId || 'admin'
                    });
                }
            };
            checkAndCreateClient(finalData.client, 'Remitente', finalData.originAddress, finalData.originZip, finalData.originCity, finalData.originPhone);
            checkAndCreateClient(finalData.destinationName, 'Destinatario', finalData.destinationAddress, finalData.destinationZip, finalData.destinationCity, finalData.destinationPhone);
        }

        // ── Auto-aprendizaje de coordenadas del REMITENTE ──
        // Solo guardamos las coords del remitente al crear el albarán (estamos en su ubicación).
        // Las del destinatario se guardan en la entrega (handleDeliveryConfirm).
        const gps = capturedGpsRef.current;
        if (gps && onUpdateClient && clients) {
            const normalize = (s) => String(s || '').normalize("NFD").replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
            let targetClient = null;
            let targetBranch = null;
            
            for (const c of clients) {
                if (normalize(c.name) === normalize(finalData.client) || normalize(c.legalName) === normalize(finalData.client)) {
                    targetClient = c;
                    break;
                }
                if (c.branches && Array.isArray(c.branches)) {
                    const b = c.branches.find(br => normalize(br.name) === normalize(finalData.client));
                    if (b) {
                        targetClient = c;
                        targetBranch = b;
                        break;
                    }
                }
            }

            if (targetClient) {
                if (targetBranch) {
                    if (!(targetBranch.coordinates && String(targetBranch.coordinates).trim().length > 0)) {
                        onUpdateClient(targetClient.id, { coordinates: gps }, targetBranch.id);
                        console.log(`[AutoCoords] Remitente Sede "${finalData.client}" → ${gps}`);
                    }
                } else {
                    if (!(targetClient.coordinates && String(targetClient.coordinates).trim().length > 0)) {
                        onUpdateClient(targetClient.id, { coordinates: gps });
                        console.log(`[AutoCoords] Remitente "${finalData.client}" → ${gps}`);
                    }
                }
            }
        }

        // Reservar el número de albarán ANTES de guardar: si el usuario encadena
        // otro en Envío Múltiple, no puede volver a salir el mismo (allShipments
        // aún no lo refleja y el upsert pisaría al anterior).
        const idMatch = String(finalData.id || '').match(/^([A-Z]+)-(\d+)$/i);
        if (idMatch) {
            const [, idPrefix, idNum] = idMatch;
            const key = idPrefix.toUpperCase();
            issuedNumbersRef.current[key] = Math.max(issuedNumbersRef.current[key] || 0, parseInt(idNum, 10));
        }

        // await: en Envío Múltiple el modal sigue abierto y el usuario puede
        // encadenar el siguiente albarán. Sin esperar aquí, allShipments todavía
        // no contiene el que se acaba de guardar.
        await onSave({ ...finalData, _capturedGps: capturedGpsRef.current });
        setShowPaymentAlert(false);

        if (keepOrigin) {
            // A partir de aquí sí: cambiar el remitente rompe la cadena y
            // desactiva el Envío Múltiple.
            multipleChainStartedRef.current = true;
            setShowSuccessFeedback(true);
            setTimeout(() => setShowSuccessFeedback(false), 3000);
            
            // Reset only destination and specific shipment info
            setFormData(prev => ({
                ...prev,
                destinationName: '',
                destinationAddress: '',
                destinationZip: '',
                destinationCity: '',
                destinationPhone: '',
                destinationCoordinates: '',
                amount: '',
                observations: '',
                hasCod: false,
                codAmount: '',
                codCommission: '',
                hasReturn: false,
                needsSignatureReturn: false
            }));
            setSelectedArticles([]);
            setWeightKg('');
            setMerchandisePhoto(null);
            
            // Auto-scroll y focus al campo del destinatario
            setTimeout(() => {
                if (destinationInputRef.current) {
                    destinationInputRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    destinationInputRef.current.focus();
                }
            }, 400);
        } else {
            onClose();
        }
    };

    if (!isOpen) return null;

    const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm";
    const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1";

    return (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white sm:rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden flex flex-col modal-mobile-full">
                <div className="flex justify-between items-center px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                        <Package className="text-blue-600" size={20} />
                        Nuevo Albarán
                    </h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {showSuccessFeedback && (
                    <div className="bg-green-500 text-white px-6 py-3 flex items-center justify-center gap-2 font-bold animate-in slide-in-from-top-2 duration-300 shadow-sm z-50 relative transition-all">
                        <CheckCircle size={20} className="animate-bounce" />
                        ¡Albarán generado correctamente! Registros limpiados para el siguiente paquete.
                    </div>
                )}

                <div className="overflow-y-auto p-4 custom-scrollbar">
                    <form onSubmit={handleInitialSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-3" id="shipment-form-sender">
                                <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wider border-b border-blue-100 pb-2 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Building2 size={14} />
                                        Remitente (Origen)
                                    </div>
                                    <div className={`px-2 py-0.5 rounded text-[10px] flex flex-col items-end ${getPointBaremo(formData.originCity, formData.originZip).baremo === 2 ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                                        <span className="font-bold">B{getPointBaremo(formData.originCity, formData.originZip).baremo}</span>
                                        <span className="opacity-70 text-[8px] uppercase">{getPointBaremo(formData.originCity, formData.originZip).source}</span>
                                    </div>
                                </h4>
                                <div className="space-y-2">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className={labelClass + " !mb-0"}>Cliente</label>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full text-[9px] text-blue-700 font-bold transition-colors shadow-sm border border-blue-200" title="Mantener origen para envío múltiple">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={keepOrigin}
                                                        onChange={(e) => setKeepOrigin(e.target.checked)}
                                                        className="w-2.5 h-2.5 rounded-sm border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="select-none uppercase">Envío Múltiple</span>
                                                </label>
                                                <button 
                                                type="button"
                                                onClick={() => startListening('sender', 'clientName')}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${
                                                    listeningField === 'sender' 
                                                    ? 'bg-red-100 text-red-600 animate-pulse ring-1 ring-red-200' 
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95'
                                                }`}
                                            >
                                                {listeningField === 'sender' ? <MicOff size={10} /> : <Mic size={10} />}
                                                {listeningField === 'sender' ? 'ESCUCHANDO...' : 'HABLAR'}
                                                </button>
                                            </div>
                                        </div>
                                        <div className="relative">
                                            <input
                                                type="text"
                                                placeholder="Buscar cliente..."
                                                className={inputClass}
                                                value={formData.clientName}
                                                onChange={handleClientNameChange}
                                                onFocus={handleFocus}
                                                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                                                required
                                            />
                                            {showSuggestions && filteredClients.length > 0 && (
                                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-100 rounded-lg shadow-xl z-[100] max-h-40 overflow-y-auto">
                                                    {filteredClients.map(item => (
                                                        <button
                                                            key={item.id}
                                                            type="button"
                                                            className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${item._type === 'branch' ? 'bg-blue-50/30' : ''}`}
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                selectClient(item);
                                                            }}
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
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2">
                                            <label className={labelClass}>Población</label>
                                            <CityAutocomplete
                                                className={inputClass}
                                                value={formData.originCity}
                                                poblaciones={allPoblaciones || []}
                                                placeholder="Población"
                                                required
                                                onChange={(e) => handleCityChange(e.target.value, 'origin')}
                                                onSelect={(val) => handleCityChange(val, 'origin')}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>C.P.</label>
                                            <input
                                                type="text"
                                                className={inputClass}
                                                value={formData.originZip}
                                                onChange={(e) => handleZipChange(e.target.value, 'origin')}
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Dirección</label>
                                        <input
                                            type="text"
                                            className={inputClass}
                                            placeholder="Calle, número, bloque..."
                                            value={formData.originAddress}
                                            onChange={(e) => setFormData({ ...formData, originAddress: e.target.value })}
                                        />
                                    </div>

                                </div>
                            </div>
                            <div className="space-y-3" id="shipment-form-dest">
                                <h4 className="text-xs font-bold text-amber-600 uppercase tracking-wider border-b border-amber-100 pb-2 flex items-center gap-2">
                                    <MapIcon size={14} />
                                    Destinatario (Entrega)
                                </h4>
                                <div className="space-y-2">
                                    <div>
                                        <div className="flex justify-between items-center mb-1">
                                            <label className={labelClass + " !mb-0"}>Destinatario</label>
                                            <button 
                                                type="button"
                                                onClick={() => startListening('destination', 'destinationName')}
                                                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${listeningField === 'destination' ? 'bg-red-100 text-red-600 animate-pulse ring-1 ring-red-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95'}`}
                                            >
                                                {listeningField === 'destination' ? <MicOff size={10} /> : <Mic size={10} />}
                                                {listeningField === 'destination' ? 'ESCUCHANDO...' : 'HABLAR'}
                                            </button>
                                        </div>
                                        <div className="relative">
                                            <div className="flex gap-2">
                                                <input
                                                    ref={destinationInputRef}
                                                    type="text"
                                                    placeholder="Buscar destino..."
                                                    className={`${inputClass} flex-1`}
                                                    value={formData.destinationName}
                                                    onChange={(e) => { handleDestinationNameChange(e); setSavedDestClient(false); }}
                                                    onFocus={handleDestFocus}
                                                    onBlur={() => setTimeout(() => setShowDestSuggestions(false), 150)}
                                                    required
                                                />
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
                                                                billingType: 'Clientes Habituales'
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
                                                    {filteredDestinations.map(item => (
                                                        <button 
                                                            key={item.id} 
                                                            type="button" 
                                                            className={`w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-50 last:border-0 ${item._type === 'branch' ? 'bg-blue-50/30' : ''}`} 
                                                            onMouseDown={(e) => {
                                                                e.preventDefault();
                                                                selectDestination(item);
                                                            }}
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
                                    </div>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="col-span-2">
                                            <label className={labelClass}>Población</label>
                                            <CityAutocomplete
                                                className={inputClass}
                                                value={formData.destinationCity}
                                                poblaciones={allPoblaciones || []}
                                                placeholder="Población"
                                                required
                                                onChange={(e) => handleCityChange(e.target.value, 'destination')}
                                                onSelect={(val) => handleCityChange(val, 'destination')}
                                            />
                                        </div>
                                        <div>
                                            <label className={labelClass}>C.P.</label>
                                            <input type="text" className={inputClass} value={formData.destinationZip} onChange={(e) => handleZipChange(e.target.value, 'destination')} required />
                                        </div>
                                    </div>


                                    <div className="pt-2">
                                        <label className={labelClass}>Dirección</label>
                                        <input type="text" className={inputClass} placeholder="Calle, número, bloque..." value={formData.destinationAddress} onChange={(e) => setFormData({ ...formData, destinationAddress: e.target.value })} />
                                    </div>
                                    <div className="pt-2">
                                        <label className={labelClass}>Teléfono</label>
                                        <input type="tel" className={inputClass} placeholder="Teléfono de contacto..." value={formData.destinationPhone} onChange={(e) => setFormData({ ...formData, destinationPhone: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-5" id="shipment-form-payment">
                            <div>
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                    <Euro size={14} className="text-blue-600" />
                                    Condiciones de Pago
                                </h4>
                                <div className="space-y-3" id="shipment-form-sender">
                                    <label className={labelClass}>¿Quién Paga el Porte?</label>
                                    <div className="flex gap-2">
                                        <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-all ${formData.porteType === 'Pagado' ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                            <input type="radio" name="porteType" value="Pagado" checked={formData.porteType === 'Pagado'} onChange={(e) => setFormData({ ...formData, porteType: e.target.value })} className="hidden" />
                                            <span className="text-xs font-bold uppercase transition-all">PAGADO (Remitente)</span>
                                        </label>
                                        <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer p-3 rounded-lg border transition-all ${formData.porteType === 'Debido' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                            <input type="radio" name="porteType" value="Debido" checked={formData.porteType === 'Debido'} onChange={(e) => setFormData({ ...formData, porteType: e.target.value })} className="hidden" />
                                            <span className="text-xs font-bold uppercase transition-all">DEBIDO (Destinatario)</span>
                                        </label>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <label className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-blue-50 transition-all group">
                                            <input type="checkbox" checked={formData.hasReturn} onChange={(e) => setFormData({ ...formData, hasReturn: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 transition-all cursor-pointer" />
                                            <div className="flex-1">
                                                <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700 transition-colors">Con Retorno</span>
                                                <p className="text-[9px] text-slate-400 leading-tight">Incluye viaje de vuelta.</p>
                                            </div>
                                            <RotateCcw size={16} className={formData.hasReturn ? 'text-blue-600' : 'text-slate-300'} />
                                        </label>
                                        <label className="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 bg-white cursor-pointer hover:bg-emerald-50 transition-all group">
                                            <input type="checkbox" checked={formData.needsSignatureReturn} onChange={(e) => setFormData({ ...formData, needsSignatureReturn: e.target.checked })} className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 transition-all cursor-pointer" />
                                            <div className="flex-1">
                                                <span className="text-xs font-bold text-slate-700 group-hover:text-emerald-700 transition-colors">Firma Doc.</span>
                                                <p className="text-[9px] text-slate-400 leading-tight">Recoger papel firmado.</p>
                                            </div>
                                            <FileText size={16} className={formData.needsSignatureReturn ? 'text-emerald-600' : 'text-slate-300'} />
                                        </label>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between items-center mb-2">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <FileText size={14} className="text-slate-400" />
                                        Notas y Observaciones
                                    </h4>
                                    <button type="button" onClick={() => startListening('observations', 'observations')} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold transition-all ${listeningField === 'observations' ? 'bg-red-100 text-red-600 animate-pulse ring-1 ring-red-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 active:scale-95'}`}>
                                        {listeningField === 'observations' ? <MicOff size={10} /> : <Mic size={10} />}
                                        {listeningField === 'observations' ? 'ESCUCHANDO...' : 'HABLAR'}
                                    </button>
                                </div>
                                <textarea className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none h-16" placeholder="Instrucciones adicionales..." value={formData.observations} onChange={(e) => setFormData({ ...formData, observations: e.target.value })}></textarea>
                            </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 space-y-3" id="shipment-form-articles">
                            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileText size={14} />
                                Artículos y Servicios
                                {weightClientData && <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-600 rounded-full text-[9px] font-black">⚖️ TARIFA POR KILOS</span>}
                                {!weightClientData && clientRules.requireWeight && <span className="ml-2 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full text-[9px] font-black">⚖️ PESO OBLIGATORIO</span>}
                                {isReturn && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[9px] font-black">🔄 RETORNO</span>}
                            </h4>

                            {/* En un retorno las observaciones ya vienen puestas, así que hay
                                que decir aquí qué se recoge: de ahí salen los bultos de la
                                etiqueta. */}
                            {isReturn && selectedArticles.length === 0 && (
                                <div className={`flex items-center gap-2 rounded-lg border p-3 ${validationFailed ? 'bg-red-50 border-red-300 animate-pulse' : 'bg-blue-50 border-blue-200'}`}>
                                    <Package size={16} className={validationFailed ? 'text-red-500 shrink-0' : 'text-blue-500 shrink-0'} />
                                    <p className={`text-[11px] leading-snug ${validationFailed ? 'text-red-700' : 'text-blue-700'}`}>
                                        <span className="font-black uppercase">Añade el artículo del retorno.</span>{' '}
                                        Es lo que se lleva de vuelta, y de ahí salen los bultos de la etiqueta.
                                    </p>
                                </div>
                            )}

                            {/* ── STANDARD ARTICLE SELECTOR (always shown) ── */}
                            <div className="flex gap-2 items-end mb-3">
                                <div className="flex-1">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Artículo</label>
                                    <select className={inputClass} value={tempArticleId} onChange={(e) => { const val = e.target.value; setTempArticleId(val); if (val) addArticle(val, tempQuantity); }}>
                                        <option value="">Seleccionar artículo...</option>
                                        {(() => {
                                            let availableArticles = [...(articles || [])];
                                            const client = resolveBillingClient(formData.clientName, formData._parentClientId);
                                            const destClient = resolveBillingClient(formData.destinationName, formData._destParentClientId);
                                            const STD_IDS = ['1774442159060', '1774442159061', '1774442159062', '1774442159063']; // BLT_1-4

                                            // Para clientes "Por Kilos" sin artículos personalizados,
                                            // mostramos todos los Bultos (BLT_) y Palets disponibles
                                            const isWeightClient = client?.tariffType === 'Por Kilos' || destClient?.tariffType === 'Por Kilos';

                                            let clientIds;
                                            if (client?.allowedArticles?.length > 0) {
                                                clientIds = client.allowedArticles;
                                            } else if (isWeightClient) {
                                                // Incluir todos los BLT_ y Palet automáticamente
                                                clientIds = availableArticles
                                                    .filter(a => {
                                                        const name = String(a.name || '').toLowerCase();
                                                        return name.includes('blt_') || name.includes('bulto') || name.includes('palet');
                                                    })
                                                    .map(a => a.id);
                                                // Si no hay ninguno con esos nombres, fallback a STD_IDS
                                                if (clientIds.length === 0) clientIds = STD_IDS;
                                            } else {
                                                clientIds = STD_IDS;
                                            }
                                            const destIds = (destClient?.allowedArticles?.length > 0) ? destClient.allowedArticles : [];

                                            // Merge: client articles first, then destination articles (without duplicates)
                                            const mergedIds = [...clientIds];
                                            for (const id of destIds) {
                                                if (!mergedIds.includes(id)) mergedIds.push(id);
                                            }

                                            availableArticles = availableArticles.filter(a => mergedIds.includes(a.id) || mergedIds.includes(String(a.id)));
                                            availableArticles.sort((a, b) => {
                                                const iA = mergedIds.indexOf(a.id) !== -1 ? mergedIds.indexOf(a.id) : mergedIds.indexOf(String(a.id));
                                                const iB = mergedIds.indexOf(b.id) !== -1 ? mergedIds.indexOf(b.id) : mergedIds.indexOf(String(b.id));
                                                return iA - iB;
                                            });
                                            return availableArticles.map(article => <option key={article.id} value={article.id}>{article.name}</option>);
                                        })()}
                                    </select>
                                </div>
                                <div className="w-20">
                                    <label className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Cant.</label>
                                    <input type="number" min="1" className={inputClass} value={tempQuantity} onChange={(e) => setTempQuantity(e.target.value)} />
                                </div>
                                {/* ── WEIGHT FIELD (for Por Kilos clients OR requireWeight rule) ── */}
                                {(weightClientData || clientRules.requireWeight) && (
                                    <div className="w-28">
                                        <label className="text-[10px] uppercase font-bold text-indigo-500 mb-1 block">⚖️ Kg *</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                step="0.1"
                                                placeholder="Kg"
                                                className={`${inputClass} pr-8 !font-bold ${validationFailed && (!weightKg || parseFloat(weightKg) <= 0) ? '!border-red-500 !ring-2 !ring-red-500/30 animate-pulse' : '!border-indigo-200 focus:!border-indigo-500 focus:!ring-indigo-500/20'}`}
                                                value={weightKg}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setWeightKg(val);
                                                    if (weightClientData) {
                                                        const price = calculateWeightPrice(val, weightClientData.tariff, weightClientData.client);
                                                        const articlesTotal = selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0);
                                                        const commission = parseFloat(formData.codCommission) || 0;
                                                        setFormData(prev => ({ ...prev, amount: (articlesTotal + price + commission).toFixed(2) }));
                                                    }
                                                }}
                                            />
                                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-black text-indigo-300">Kg</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Weight bracket info */}
                            {weightClientData && weightKg && parseFloat(weightKg) > 0 && (
                                <div className="flex items-center gap-3 mb-3 bg-indigo-50 rounded-lg px-3 py-2 border border-indigo-100 animate-in fade-in duration-200">
                                    <span className="text-lg">⚖️</span>
                                    <div className="flex-1">
                                        <p className="text-[10px] font-bold text-indigo-400 uppercase">{getWeightBracketLabel(weightKg, weightClientData.tariff)}</p>
                                        <p className="text-sm font-black text-indigo-700">
                                            {shouldHidePrices ? 'Precio fijado en tarifa' : `${calculateWeightPrice(weightKg, weightClientData.tariff, weightClientData.client).toFixed(2)}€ (porte por peso)`}
                                        </p>
                                    </div>
                                    {!shouldHidePrices && (
                                        <details className="text-right">
                                            <summary className="text-[9px] font-bold text-indigo-400 cursor-pointer hover:text-indigo-600">📋 Tramos</summary>
                                            <div className="absolute right-4 mt-1 bg-white rounded-lg border border-slate-200 p-2 shadow-lg z-10 max-h-48 overflow-y-auto w-48">
                                                {[...weightClientData.tariff].sort((a, b) => a.maxKg - b.maxKg).map((b, i) => {
                                                    const isActive = parseFloat(weightKg) <= b.maxKg && (i === 0 || parseFloat(weightKg) > [...weightClientData.tariff].sort((x, y) => x.maxKg - y.maxKg)[i - 1]?.maxKg);
                                                    return (
                                                        <div key={i} className={`flex justify-between text-[10px] py-0.5 px-1 rounded ${isActive ? 'bg-indigo-100 font-black text-indigo-700' : 'text-slate-500'}`}>
                                                            <span>≤{b.maxKg}kg</span>
                                                            <span>{parseFloat(b.price).toFixed(2)}€</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </details>
                                    )}
                                </div>
                            )}
                            {selectedArticles.length > 0 && (
                                <div className="bg-slate-50 rounded-lg p-2 mb-3 border border-slate-100 space-y-1">
                                    {selectedArticles.map((item) => (
                                        <div key={item.uniqueId} className="flex justify-between items-center text-sm p-1">
                                            <div className="flex gap-2 items-center"><span className="font-bold text-slate-700">{item.quantity}x</span><span className="text-slate-600">{item.name}</span></div>
                                            <div className="flex gap-3 items-center"><span className="font-bold text-slate-700">{shouldHidePrices ? '***' : `${item.totalPrice.toFixed(2)}€`}</span><button type="button" onClick={() => removeArticle(item.uniqueId)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button></div>
                                        </div>
                                    ))}
                                    <div className="border-t border-slate-200 mt-2 pt-2 flex justify-between items-center px-1"><span className="font-bold text-slate-500 text-xs uppercase">Total Artículos</span><span className="font-bold text-blue-600">{shouldHidePrices ? 'Fijado en Tarifa' : `${selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0).toFixed(2)}€`}</span></div>
                                </div>
                            )}
                            <div id="shipment-form-cod">
                                <div className="relative">
                                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                                    <input type="number" step="0.01" placeholder="REEMBOLSO 0.00" className={inputClass + " pl-9 border-red-200 focus:border-red-500 focus:ring-red-500/20"} value={formData.codAmount} onChange={(e) => {
                                        const val = e.target.value; const amount = parseFloat(val) || 0;
                                        let fee = 0; if (amount > 0) { const client = resolveBillingClient(formData.clientName, formData._parentClientId); fee = (client && client.codFee) ? parseFloat(client.codFee) : (parseFloat(defaultCodFee) || 3.00); }
                                        const prevCommission = parseFloat(formData.codCommission) || 0;
                                        const currentTotal = parseFloat(formData.amount) || 0;
                                        const basePorte = selectedArticles.length > 0 ? selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0) : Math.max(0, currentTotal - prevCommission);
                                        setFormData(prev => ({ ...prev, codAmount: val, hasCod: amount > 0, codCommission: fee, amount: (basePorte + fee).toFixed(2) }));
                                    }} />
                                </div>
                            </div>
                            <div className="space-y-1" id="shipment-form-price">
                                <div className="relative">
                                    <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                                    <input type="number" step="0.01" inputMode="decimal" placeholder={shouldHidePrices ? "FACTURACIÓN - pulsa para cambiar" : "PRECIO FINAL 0.00"} className={`w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-bold text-lg ${shouldHidePrices && priceOverride === null ? 'text-slate-400 italic' : 'text-slate-700'}`} value={shouldHidePrices ? (priceOverride !== null ? priceOverride : '') : formData.amount} onChange={(e) => { const val = e.target.value; if (shouldHidePrices) { setPriceOverride(val); } setFormData({ ...formData, amount: val }); }} />
                                </div>
                                <div className="flex justify-between items-center px-1">
                                    {(() => {
                                        const { baremo, source } = getEffectiveBaremo();
                                        return (
                                            <div className="flex items-center gap-2">
                                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded ${baremo === 2 ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                                                    BAREMO {baremo}
                                                </span>
                                                <span className="text-[9px] text-slate-400 font-medium italic">
                                                    Origen: {source || 'Autocalculado'}
                                                </span>
                                            </div>
                                        );
                                    })()}
                                    {!shouldHidePrices && (
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">I.V.A. NO INCLUIDO</span>
                                            {(() => {
                                                const base = parseFloat(formData.amount) || 0;
                                                if (base > 0) {
                                                    const conIva = (base * 1.21).toFixed(2);
                                                    return (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                printSimplifiedInvoice({
                                                                    ...formData,
                                                                    id: 'NUEVO',
                                                                    date: new Date().toLocaleDateString('es-ES'),
                                                                    articles: selectedArticles.map(a => ({ name: a.name, quantity: a.quantity, price: a.unitPrice }))
                                                                });
                                                            }}
                                                            className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100 hover:bg-emerald-100 hover:border-emerald-200 transition-colors cursor-pointer active:scale-95"
                                                            title="Pulsa para generar Factura Simplificada"
                                                        >
                                                            🧾 CON IVA: {conIva}€
                                                        </button>
                                                    );
                                                }
                                                return null;
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Foto de la Mercancía (Opcional) */}
                            <div className="pt-4 border-t border-slate-100">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                        <Camera size={14} className="text-slate-400" />
                                        Foto de la Mercancía (Opcional)
                                    </h4>
                                    {merchandisePhoto && (
                                        <button 
                                            type="button" 
                                            onClick={() => setMerchandisePhoto(null)}
                                            className="text-[10px] font-bold text-red-500 hover:text-red-700 flex items-center gap-1"
                                        >
                                            <Trash2 size={12} /> BORRAR FOTO
                                        </button>
                                    )}
                                </div>
                                
                                {!merchandisePhoto ? (
                                    <button
                                        type="button"
                                        onClick={handleOpenCamera}
                                        className="w-full py-4 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50 text-slate-400 hover:bg-slate-100 hover:border-slate-300 transition-all flex flex-col items-center justify-center gap-1.5 active:scale-95 group"
                                    >
                                        <div className="p-2 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                                            <Camera size={20} className="text-blue-500" />
                                        </div>
                                        <span className="text-[10px] font-bold uppercase tracking-wider">Capturar o Subir Foto</span>
                                        <input 
                                            ref={fileInputRef}
                                            type="file" 
                                            accept="image/*" 
                                            capture="environment" 
                                            onChange={handlePhotoChange} 
                                            className="hidden" 
                                        />
                                    </button>
                                ) : (
                                    <div className="relative rounded-xl overflow-hidden aspect-video bg-slate-900 flex items-center justify-center ring-2 ring-blue-500/20 mx-1">
                                        <img 
                                            src={merchandisePhoto} 
                                            alt="Preview" 
                                            className="max-w-full max-h-full object-contain"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent pointer-events-none"></div>
                                        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 text-white/90">
                                            <ImageIcon size={14} />
                                            <span className="text-[10px] font-bold uppercase">Foto Capturada</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>


                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 sm:rounded-b-2xl" id="shipment-form-save-btn">
                            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancelar</button>
                            <button type="submit" className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm"><Package size={18} />Generar Albarán</button>
                    </div>
                </form>
            </div>

            {/* Poblaciones datalist for autocomplete */}
            <datalist id="poblaciones-list">
                {(allPoblaciones || coverageZones || []).map((poblacion, idx) => (
                    <option key={`${idx}-${poblacion}`} value={poblacion} />
                ))}
            </datalist>
        </div>

        {showPaymentAlert && (() => {
            // Calcular deudas del remitente
            const clientName = (pendingSubmitData?.client || '').trim().toLowerCase();
            const debts = clientName ? (allShipments || []).filter(s => {
                if (!s) return false;
                const hasPendingPorte = parseFloat(String(s.amount || '0').replace(/[^0-9.]/g, '')) > 0 && !s.portePaid;
                const hasPendingCod = s.hasCod && parseFloat(s.codAmount || 0) > 0 && !s.codPaid;
                if (!hasPendingPorte && !hasPendingCod) return false;
                const destClean = (s.destinationName || '').trim().toLowerCase();
                const senderClean = (s.client || '').trim().toLowerCase();
                const originClean = (s.originName || '').trim().toLowerCase();
                if (hasPendingPorte) {
                    const payerClean = s.porteType === 'Debido' ? (destClean || senderClean) : (originClean || senderClean);
                    if (payerClean === clientName) return true;
                }
                if (hasPendingCod) {
                    if ((destClean || senderClean) === clientName) return true;
                }
                return false;
            }) : [];

            // Deduplicar por ID (puede haber duplicados en allShipments por sincronización)
            const seenIds = new Set();
            const uniqueDebts = debts.filter(d => {
                if (seenIds.has(d.id)) return false;
                seenIds.add(d.id);
                return true;
            });

            const selectedDebtTotal = uniqueDebts.filter(d => selectedDebtIds.includes(d.id)).reduce((sum, s) => {
                let amt = 0;
                if (!s.portePaid) amt += parseFloat(String(s.amount || '0').replace(/[^0-9.]/g, '')) || 0;
                if (s.hasCod && !s.codPaid) amt += parseFloat(s.codAmount || 0) || 0;
                return sum + amt;
            }, 0);

            const currentAmount = parseFloat(String(pendingSubmitData?.amount || '0').replace(/[^0-9.]/g, '')) || 0;
            const grandTotal = currentAmount + selectedDebtTotal;

            return (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative p-6 text-center space-y-4 max-h-[90vh] overflow-y-auto">
                    <button type="button" onClick={() => { setShowPaymentAlert(false); setSelectedDebtIds([]); }} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>
                    <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto"><Euro size={32} /></div>
                    <h3 className="text-xl font-bold text-slate-800">Atribución de Cobro al Contado</h3>
                    <div className="text-slate-600 text-sm space-y-2">
                        <p>El responsable del pago es un <strong>Cliente Habitual o Nuevo</strong>.</p>
                        {pendingSubmitData?.porteType === 'Debido' && <p className="bg-amber-50 text-amber-700 p-2 rounded-lg border border-amber-100 text-[11px] font-bold">⚠️ PORTE DEBIDO. Cobro en destino.</p>}
                        {pendingSubmitData?.hasCod && <p className="bg-rose-50 text-rose-700 p-2 rounded-lg border border-rose-100 text-[11px] font-bold">💰 LLEVA REEMBOLSO. Cobro en destino.</p>}
                    </div>

                    {/* DEUDAS PENDIENTES SELECCIONABLES */}
                    {uniqueDebts.length > 0 && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-3 text-left space-y-2">
                            <div className="flex justify-between items-center">
                                <p className="text-[11px] font-black text-red-700 uppercase tracking-wider flex items-center gap-1.5">
                                    ⚠️ COBROS PENDIENTES ({uniqueDebts.length})
                                </p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (selectedDebtIds.length === uniqueDebts.length) {
                                            setSelectedDebtIds([]);
                                        } else {
                                            setSelectedDebtIds(uniqueDebts.map(d => d.id));
                                        }
                                    }}
                                    className="text-[9px] font-bold text-red-600 hover:text-red-800 underline"
                                >
                                    {selectedDebtIds.length === uniqueDebts.length ? 'Deseleccionar todo' : 'Seleccionar todo'}
                                </button>
                            </div>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {uniqueDebts.map(d => {
                                    const debtAmt = (parseFloat(String(d.amount || '0').replace(/[^0-9.]/g, '')) || 0);
                                    const isSelected = selectedDebtIds.includes(d.id);
                                    return (
                                        <label
                                            key={d.id}
                                            className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer transition-all ${isSelected ? 'bg-red-100 ring-1 ring-red-300' : 'hover:bg-red-100/50'}`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={() => {
                                                    setSelectedDebtIds(prev =>
                                                        prev.includes(d.id)
                                                            ? prev.filter(id => id !== d.id)
                                                            : [...prev, d.id]
                                                    );
                                                }}
                                                className="w-4 h-4 rounded border-red-300 text-red-600 focus:ring-red-500"
                                            />
                                            <div className="flex-1 flex justify-between text-[10px]">
                                                <span className="font-bold text-red-700">{d.id}</span>
                                                <span className="font-bold text-red-600">€{debtAmt.toFixed(2)}</span>
                                            </div>
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedDebtIds.length > 0 && (
                                <p className="text-[10px] font-bold text-red-800 border-t border-red-200 pt-1.5">
                                    Deuda seleccionada: €{selectedDebtTotal.toFixed(2)}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="py-4 bg-slate-50 rounded-xl border border-slate-100 flex flex-col items-center justify-center gap-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total a Recaudar</span>
                        <span className="text-3xl font-bold text-slate-900">
                            {String(pendingSubmitData?.amount).includes('Tarifa') ? 'Tarifa' : `€${grandTotal.toFixed(2)}`}
                        </span>
                        {selectedDebtIds.length > 0 && (
                            <span className="text-[9px] text-slate-400">
                                (€{currentAmount.toFixed(2)} envío actual + €{selectedDebtTotal.toFixed(2)} deudas)
                            </span>
                        )}
                    </div>

                    <div className="grid grid-cols-2 gap-3 pt-2">
                        <button type="button" onClick={() => { setSelectedDebtIds([]); finalizeSubmit(pendingSubmitData, 'Pending'); }} className="py-3 px-4 bg-white border-2 border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors">Cobrar Más Tarde</button>
                        <button type="button" onClick={() => finalizeSubmit(pendingSubmitData, 'Paid')} className="py-3 px-4 bg-green-600 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 shadow-lg shadow-green-500/20 hover:bg-green-700 transition-colors"><Check size={18} />Cobrado</button>
                    </div>

                    {/* Botón Factura Simplificada (Disimulado) */}
                    {grandTotal > 0 && (
                        <div className="pt-3 text-center">
                            <button
                                type="button"
                                onClick={() => {
                                    const totalConIva = +(grandTotal * 1.21).toFixed(2);
                                    // 1. Generar e imprimir la factura simplificada
                                    printSimplifiedInvoice({
                                        ...pendingSubmitData,
                                        amount: grandTotal,
                                        id: pendingSubmitData?.id || 'NUEVO',
                                        date: new Date().toLocaleDateString('es-ES'),
                                        articles: selectedArticles.map(a => ({ name: a.name, quantity: a.quantity, price: a.unitPrice }))
                                    });
                                    // 2. Cobrar con el importe IVA incluido y marcar como factura simplificada
                                    finalizeSubmit({
                                        ...pendingSubmitData,
                                        amount: totalConIva,
                                        customAmount: totalConIva,
                                        hasSimplifiedInvoice: true,
                                        simplifiedInvoiceAmount: grandTotal,
                                        simplifiedInvoicePaid: true
                                    }, 'Paid');
                                }}
                                className="text-[10px] text-slate-400 hover:text-slate-600 underline font-medium transition-colors"
                            >
                                🧾 Generar Factura Simplificada — Cobrar €{(grandTotal * 1.21).toFixed(2)} (con IVA)
                            </button>
                        </div>
                    )}
                </div>
            </div>
            );
        })()}

        <datalist id="cities-list">
            {ALL_BAREMO_PUEBLOS.map((p, idx) => (
                <option key={idx} value={p.name}>{p.zip}</option>
            ))}
        </datalist>
    </div>
);
}
