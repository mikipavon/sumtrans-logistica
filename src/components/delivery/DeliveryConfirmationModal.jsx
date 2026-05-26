import { useState, useRef, useEffect, useMemo } from 'react';
import { X, CheckCircle, PenTool, Camera, Image as ImageIcon, Mic, MicOff, Wallet, MapPin, RotateCcw, AlertTriangle, FileText, ShieldCheck } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Shipment from '../../models/Shipment';
import { compressImage } from '../../utils/imageCompression';
import { printSimplifiedInvoice } from '../../utils/printSimplifiedInvoice';

export default function DeliveryConfirmationModal({ isOpen, onClose, onConfirm, shipment, collectionAlert, pendingDebts = [], clients = [] }) {
    const labelClass = "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1";
    const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm";
    const [isSignatureCaptured, setIsSignatureCaptured] = useState(false);
    const sigCanvas = useRef({});
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoPreview2, setPhotoPreview2] = useState(null);

    const [receiverName, setReceiverName] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [deliveryCoordinates, setDeliveryCoordinates] = useState('');
    const [customAmounts, setCustomAmounts] = useState({});
    const [selectedDebts, setSelectedDebts] = useState([]);
    const [showReturnPrompt, setShowReturnPrompt] = useState(false);
    const [initialReturnAlert, setInitialReturnAlert] = useState(false);
    const [initialSignatureAlert, setInitialSignatureAlert] = useState(false);
    const [pendingConfirmData, setPendingConfirmData] = useState(null);
    const [validationFailed, setValidationFailed] = useState(false);
    const [includeIva, setIncludeIva] = useState(false);

    // Parse helper
    const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        return parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
    };

    // Build the Shipment model instance to use its business logic
    const shipmentModel = useMemo(() => {
        if (!shipment) return null;

        // Find the destination client to get their billingType
        const destClient = clients?.find(c => {
            const name = String(c.name || '').trim().toLowerCase();
            const dest = String(shipment.destinationName || '').trim().toLowerCase();
            return name === dest;
        });

        return new Shipment({
            ...shipment,
            // Pass destination billing type from client list if available
            destinationBillingType: destClient?.billingType || shipment.destinationBillingType || null,
        });
    }, [shipment, clients]);

    // Build list of current shipment cobros using the MODEL logic
    const currentParts = useMemo(() => {
        if (!shipment || !shipmentModel) return [];
        const parts = [];
        const porte = parseVal(shipment.customAmount) || parseVal(shipment.amount) || 0;
        const cod = parseVal(shipment.codAmount) || 0;
        const amountToColl = shipmentModel.amountToCollectAtDelivery();

        // Porte a cobrar en destino
        if (shipment.porteType === 'Debido' && porte > 0) {
            const porteACobrar = amountToColl - (shipment.hasCod ? cod : 0);
            if (porteACobrar > 0) {
                parts.push({
                    id: `${shipment.id}-porte`,
                    shipmentId: shipment.id,
                    type: 'Porte',
                    amount: porteACobrar.toFixed(2),
                    label: 'Porte Debido',
                    detail: shipment.destinationName || 'Destinatario'
                });
            }
        } else if (shipment.status === 'Pendiente Cobro' && porte > 0) {
            parts.push({
                id: `${shipment.id}-porte`,
                shipmentId: shipment.id,
                type: 'Porte',
                amount: porte.toFixed(2),
                label: 'Porte (Pendiente)',
                detail: shipment.destinationName || 'Destinatario'
            });
        }

        // Reembolso (COD) siempre se cobra al destinatario
        if (shipment.hasCod && cod > 0) {
            parts.push({
                id: `${shipment.id}-reembolso`,
                shipmentId: shipment.id,
                type: 'Reembolso',
                amount: cod.toFixed(2),
                label: 'Reembolso',
                detail: shipment.destinationName || 'Destinatario'
            });
        }

        return parts;
    }, [shipment, shipmentModel]);

    const allSelectableDebts = useMemo(() => {
        return [...currentParts, ...pendingDebts];
    }, [currentParts, pendingDebts]);

    // Auto-select only current delivery parts (Porte Debido, Reembolso) by default
    useEffect(() => {
        if (isOpen) {
            setSelectedDebts(currentParts.map(d => d.id));
            // Initialize custom amounts for ALL selectable debts
            const initialAmounts = {};
            allSelectableDebts.forEach(d => {
                initialAmounts[d.id] = d.amount === 'Tarifa' ? '' : d.amount;
            });
            setCustomAmounts(initialAmounts);
        } else {
            setSelectedDebts([]);
            setCustomAmounts({});
        }
    }, [isOpen, currentParts, allSelectableDebts]);

    // Calculate Dynamic Total using custom amounts (Separating Porte from Reembolso)
    const basePorteTotal = allSelectableDebts
        .filter(d => selectedDebts.includes(d.id) && d.type === 'Porte')
        .reduce((sum, d) => {
            const val = customAmounts[d.id] !== undefined ? customAmounts[d.id] : d.amount;
            return sum + (String(val).toLowerCase() === 'tarifa' ? 0 : parseVal(val));
        }, 0);

    const baseReembolsoTotal = allSelectableDebts
        .filter(d => selectedDebts.includes(d.id) && d.type === 'Reembolso')
        .reduce((sum, d) => {
            const val = customAmounts[d.id] !== undefined ? customAmounts[d.id] : d.amount;
            return sum + (String(val).toLowerCase() === 'tarifa' ? 0 : parseVal(val));
        }, 0);

    const baseTotalToCollect = basePorteTotal + baseReembolsoTotal;
    const totalToCollect = includeIva ? +(basePorteTotal * 1.21 + baseReembolsoTotal).toFixed(2) : baseTotalToCollect;

    useEffect(() => {
        if (isOpen && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => setDeliveryCoordinates(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`),
                (error) => console.log(error),
                { enableHighAccuracy: true }
            );
        } else if (!isOpen) {
            setDeliveryCoordinates('');
            setReceiverName('');
            setReceiverId('');
            setReceiverId('');
            setPhotoPreview(null);
            setPhotoPreview2(null);
            setShowReturnPrompt(false);
            setInitialReturnAlert(false);
            setInitialSignatureAlert(false);
            setPendingConfirmData(null);
            setValidationFailed(false);
            setIncludeIva(false);
            if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
                sigCanvas.current.clear();
            }
        }
    }, [isOpen]);

    // Handle Initial Return Alert
    useEffect(() => {
        if (isOpen && shipment) {
            if (shipment.hasReturn) setInitialReturnAlert(true);
            if (shipment.needsSignatureReturn) setInitialSignatureAlert(true);
        }
    }, [isOpen, shipment?.id]);

    if (!isOpen || !shipment) return null;

    const rules = shipment.deliveryRules || {};
    const requiresPhoto1 = !!(rules.requirePhoto || shipment.needsSignatureReturn);
    const requiresPhoto2 = !!(rules.requirePhoto && shipment.needsSignatureReturn);

    const handleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('El reconocimiento de voz no está soportado en tu navegador.');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setReceiverName(transcript);
        };
        recognition.start();
    };

    const handlePhotoUpload = async (e, photoIndex = 1) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = async () => {
                const base64 = reader.result;
                try {
                    // Compress immediately to save memory and ensure successful upload later
                    const compressed = await compressImage(base64);
                    if (photoIndex === 1) {
                        setPhotoPreview(compressed);
                    } else {
                        setPhotoPreview2(compressed);
                    }
                } catch (err) {
                    console.error("Compression error:", err);
                    if (photoIndex === 1) {
                        setPhotoPreview(base64); // Fallback to original if compression fails
                    } else {
                        setPhotoPreview2(base64);
                    }
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClearSignature = () => {
        if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
            sigCanvas.current.clear();
            setIsSignatureCaptured(false);
        }
    };

    const handleClearPhoto = (photoIndex = 1) => {
        if (photoIndex === 1) {
            setPhotoPreview(null);
        } else {
            setPhotoPreview2(null);
        }
    };

    const handleConfirm = async (status, skipCurrentDebts = false) => {
        let proofData = { 
            type: 'multi', 
            coordinates: deliveryCoordinates,
            name: receiverName,
            id: receiverId,
            signatureData: null,
            photoData: photoPreview,
            photoData2: photoPreview2
        };

        // Capture Signature if not empty
        if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
            try {
                const trimmed = sigCanvas.current.getTrimmedCanvas();
                const rawSignature = trimmed.toDataURL('image/png');
                proofData.signatureData = await compressImage(rawSignature, 800, 400, 0.6);
            } catch (e) {
                try {
                    proofData.signatureData = sigCanvas.current.toDataURL('image/png');
                } catch (err) {
                    console.error("Error generating signature image", err);
                }
            }
        }

        // Validation: At least name + (signature OR photo) if status is 'Entregado' and NOT a pickup
        if (status === 'Entregado' && shipment?.type !== 'Recogida') {
            const rules = shipment.deliveryRules || {};
            let hasError = false;
            
            // Check required DNI
            if (rules.requireDNI && !receiverId?.trim()) {
                hasError = true;
            }
            
            // Check required Photos (If needsSignatureReturn is true, we require at least 1 photo.
            // If rules.requirePhoto is also true, we require 2 photos).
            const requiresPhoto1 = rules.requirePhoto || shipment.needsSignatureReturn;
            const requiresPhoto2 = rules.requirePhoto && shipment.needsSignatureReturn;

            if (requiresPhoto1 && !proofData.photoData) {
                hasError = true;
            }
            if (requiresPhoto2 && !proofData.photoData2) {
                hasError = true;
            }
            
            // Check required Signature
            if (rules.requireSignature !== false && !proofData.signatureData) {
                hasError = true;
            }

            if (!receiverName && !receiverId) {
                hasError = true;
            }
            if (!proofData.signatureData && !proofData.photoData) {
                hasError = true;
            }

            if (hasError) {
                setValidationFailed(true);
                // Show specific error for the first failing rule
                if (rules.requireDNI && !receiverId?.trim()) {
                    alert("🪪 DNI OBLIGATORIO\n\nEste cliente exige que el receptor identifique su DNI/NIE antes de entregar.");
                } else if (requiresPhoto1 && !proofData.photoData) {
                    alert(shipment.needsSignatureReturn
                        ? "📸 FOTO 1 OBLIGATORIA\n\nEs obligatorio tomar una foto del albarán de la agencia."
                        : "📸 FOTO OBLIGATORIA\n\nEste cliente exige una foto para completar la entrega.");
                } else if (requiresPhoto2 && !proofData.photoData2) {
                    alert("📄 FOTO 2 OBLIGATORIA\n\nDebes tomar una foto del albarán de contenido firmado (Documentación de vuelta).");
                } else if (rules.requireSignature !== false && !proofData.signatureData) {
                    alert("✍️ FIRMA OBLIGATORIA\n\nEste cliente exige una firma real del receptor. No se puede dejar en blanco.");
                } else if (!receiverName && !receiverId) {
                    alert("Por favor, introduzca el nombre o DNI del receptor.");
                } else {
                    alert("Es obligatorio capturar al menos una prueba (Firma o Foto del Sello/Albarán).");
                }
                return;
            }
        }

        // IMPORTANT: Filter out current shipment debts if we are choosing "Postpone/Aplazar" mode
        const finalDebts = skipCurrentDebts 
            ? selectedDebts.filter(id => !id.startsWith(`${shipment.id}-`))
            : selectedDebts;

        if (status === 'Entregado' && shipment.hasReturn && !showReturnPrompt) {
            setPendingConfirmData({ shipmentId: shipment.id, proofData, status, finalDebts, customAmounts, includeIva });
            setShowReturnPrompt(true);
            return;
        }

        executeConfirm(shipment.id, proofData, status, finalDebts, customAmounts, false, includeIva);
    };

    const executeConfirm = (shipId, pData, stat, fDebts, cAmts, shouldGen, wantsIva) => {
        let extraFlags = null;
        if (wantsIva) {
            // Solo aplicamos IVA a la parte de Porte
            const finalPorteTotal = fDebts.reduce((sum, dId) => {
                const debt = allSelectableDebts.find(d => d.id === dId);
                if (debt?.type !== 'Porte') return sum;
                const val = cAmts[dId] !== undefined ? cAmts[dId] : debt.amount;
                return sum + parseVal(val);
            }, 0);
            
            const finalPorteWithIva = +(finalPorteTotal * 1.21).toFixed(2);
            
            extraFlags = {
                hasSimplifiedInvoice: true,
                simplifiedInvoiceAmount: finalPorteWithIva,
                simplifiedInvoicePaid: true
            };

            printSimplifiedInvoice({
                ...shipment,
                amount: finalPorteWithIva,
                id: shipment.id,
                date: new Date().toLocaleDateString('es-ES'),
                articles: shipment.articles || []
            });
        }
        
        onConfirm(shipId, pData, stat, fDebts, cAmts, shouldGen, extraFlags);
    };

    const handleConfirmReturn = (shouldGenerate) => {
        if (!pendingConfirmData) return;
        executeConfirm(
            pendingConfirmData.shipmentId, 
            pendingConfirmData.proofData, 
            pendingConfirmData.status, 
            pendingConfirmData.finalDebts, 
            pendingConfirmData.customAmounts,
            shouldGenerate,
            pendingConfirmData.includeIva
        );
        setShowReturnPrompt(false);
    };
    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-300">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[95vh]">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800">{shipment?.type === 'Recogida' ? 'Cobros Pendientes' : 'Confirmar Entrega'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Unified Cobros Section (The "Alarma") */}
                {allSelectableDebts.length > 0 && (
                    <div className="bg-red-50 border-b border-orange-100 p-3 sm:p-4 shrink-0 overflow-y-auto max-h-[35vh] sm:max-h-[40vh] custom-scrollbar">
                        {shipment.hasReturn && (
                            <div className="mb-3 flex items-center gap-3 bg-red-600 text-white p-3 rounded-xl animate-pulse shadow-lg shadow-red-600/20">
                                <RotateCcw size={18} className="shrink-0" />
                                <div className="flex-1 leading-none">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Aviso Especial</p>
                                    <p className="text-sm font-bold">ESTE ENVÍO TIENE RETORNO</p>
                                </div>
                                <AlertTriangle size={18} />
                            </div>
                        )}
                        {shipment.needsSignatureReturn && (
                            <div className="mb-3 flex items-center gap-3 bg-emerald-600 text-white p-3 rounded-xl shadow-lg shadow-emerald-600/20">
                                <FileText size={18} className="shrink-0" />
                                <div className="flex-1 leading-none">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Documentación</p>
                                    <p className="text-sm font-bold">RECOGER FIRMA DE VUELTA</p>
                                </div>
                                <CheckCircle size={18} />
                            </div>
                        )}
                        <div className="flex items-center gap-2 mb-3">
                            <Wallet className="text-red-600" size={18} />
                            <h4 className="text-sm font-black text-red-700 uppercase tracking-tighter">Listado de Cobros Pendientes</h4>
                        </div>

                        <div className="space-y-2">
                            {allSelectableDebts.map(debt => {
                                const isSelected = selectedDebts.includes(debt.id);
                                return (
                                    <label
                                        key={debt.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-white border-red-200 shadow-sm' : 'bg-red-50/50 border-red-100 opacity-60'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedDebts([...selectedDebts, debt.id]);
                                                else setSelectedDebts(selectedDebts.filter(id => id !== debt.id));
                                            }}
                                            className="w-5 h-5 text-red-600 rounded-md focus:ring-red-500 border-red-200"
                                        />
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${debt.type === 'Porte' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                                                    }`}>
                                                    {debt.type}
                                                </span>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 shadow-inner focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all">
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={customAmounts[debt.id] ?? ''}
                                                            onChange={(e) => {
                                                                setCustomAmounts(prev => ({ ...prev, [debt.id]: e.target.value }));
                                                            }}
                                                            onClick={(e) => e.preventDefault()} // Prevent label click from toggling checkbox when clicking input
                                                            className="w-16 bg-transparent border-none p-0 text-right font-mono font-bold text-slate-800 text-sm focus:ring-0"
                                                            placeholder="0.00"
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">€</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs font-bold text-slate-700 mt-0.5">{debt.label}</p>
                                            {debt.detail && <p className="text-[10px] text-slate-400">{debt.detail}</p>}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="mt-4 pt-3 border-t border-red-200">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Total Seleccionado</p>
                                    <p className="text-2xl font-black text-red-800 leading-none">{totalToCollect.toFixed(2)}€</p>
                                </div>
                                <span className="text-[10px] text-red-400 font-medium">Se marcarán como cobrados</span>
                            </div>
                            
                            {/* Casilla Factura Simplificada */}
                            {basePorteTotal > 0 && (
                                <label className={`mt-3 flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer shadow-sm ${includeIva ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="checkbox" 
                                        checked={includeIva}
                                        onChange={(e) => setIncludeIva(e.target.checked)}
                                        className="w-5 h-5 text-orange-600 rounded-md focus:ring-orange-500 border-slate-300"
                                    />
                                    <div className="flex-1 leading-none">
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                            🧾 Emitir Factura Simplificada
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">Aplica un +21% de IVA al cobro del porte (+{+(basePorteTotal * 0.21).toFixed(2)}€)</p>
                                    </div>
                                </label>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    <div className="mb-4 space-y-1">
                        <p className="text-sm text-slate-500">
                            Envia: <span className="font-bold text-slate-800">{shipment.client}</span>
                        </p>
                        <p className="text-sm text-slate-500">
                            Entrega para: <span className="font-bold text-slate-800">{shipment.destinationName}</span>
                        </p>
                    </div>

                    <div className={`flex items-center gap-2 text-xs mb-4 px-3 py-2 rounded-lg ${deliveryCoordinates
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-amber-50 text-amber-700'
                        }`}>
                        <MapPin size={14} />
                        {deliveryCoordinates
                            ? `📍 Ubicación capturada: ${deliveryCoordinates}`
                            : '⏳ Obteniendo ubicación GPS...'
                        }
                    </div>

                    {/* Secciones de prueba: Solo para entregas, NO para recogidas */}
                    {shipment?.type !== 'Recogida' && (
                    <div className="space-y-6">
                        {/* Client Rules Banner */}
                        {(rules.requireDNI || requiresPhoto1 || (rules.requireSignature !== false)) && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                                <p className="text-[10px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
                                    <ShieldCheck size={13} className="text-amber-600" />
                                    Exigencias del Cliente
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {rules.requireDNI && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${receiverId?.trim() ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                            🪪 DNI {receiverId?.trim() ? '✓' : 'Obligatorio'}
                                        </span>
                                    )}
                                    {requiresPhoto1 && !requiresPhoto2 && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${photoPreview ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                            📸 Foto {photoPreview ? '✓' : 'Obligatoria'}
                                        </span>
                                    )}
                                    {requiresPhoto2 && (
                                        <>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${photoPreview ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                                📸 Foto 1: Agencia {photoPreview ? '✓' : 'Obligatoria'}
                                            </span>
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${photoPreview2 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                                📄 Foto 2: Doc. Firmado {photoPreview2 ? '✓' : 'Obligatoria'}
                                            </span>
                                        </>
                                    )}
                                    {rules.requireSignature !== false && (
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isSignatureCaptured ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700 animate-pulse'}`}>
                                            ✍️ Firma {isSignatureCaptured ? '✓' : 'Obligatoria'}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* 1. Recipient Name Section */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText size={14} className="text-blue-500" />
                                Datos de quien recibe
                            </h4>
                            <div>
                                <label className={labelClass}>Nombre Completo</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Pulsa el micro y habla..."
                                        className={`${inputClass} pr-10`}
                                        value={receiverName}
                                        onChange={(e) => setReceiverName(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleVoiceInput}
                                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
                                        title="Dictar nombre"
                                    >
                                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>DNI / NIE / ID {shipment.deliveryRules?.requireDNI && <span className="text-red-500">*</span>}</label>
                                <input
                                    type="text"
                                    placeholder="12345678X"
                                    className={`${inputClass} ${(validationFailed && shipment.deliveryRules?.requireDNI && !receiverId?.trim()) || (validationFailed && !receiverName && !receiverId) ? '!border-red-500 !ring-2 !ring-red-500/30 animate-pulse' : ''}`}
                                    value={receiverId}
                                    onChange={(e) => setReceiverId(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* 2. Signature Section */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <label className={labelClass}>Firma Digital</label>
                                <button onClick={handleClearSignature} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-1">
                                    Limpiar
                                </button>
                            </div>
                            <div className={`bg-white border-2 rounded-2xl h-[160px] relative overflow-hidden shadow-inner ${validationFailed && shipment.deliveryRules?.requireSignature !== false && !isSignatureCaptured ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-200'}`}>
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    onBegin={() => setIsSignatureCaptured(true)}
                                    penColor="black"
                                    canvasProps={{ className: 'absolute inset-0 w-full h-full' }}
                                    backgroundColor="#ffffff"
                                />
                                {!isSignatureCaptured && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                        <PenTool size={40} className="text-slate-400" />
                                        <span className="ml-2 text-sm font-bold text-slate-400 uppercase italic">Firme aquí</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Photo Section */}
                        {requiresPhoto1 && (
                            <div className="space-y-4">
                                {requiresPhoto2 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Photo 1: Agency Proof */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">📸 Foto 1: Agencia <span className="text-red-500">*</span></label>
                                                {photoPreview && (
                                                    <button onClick={() => handleClearPhoto(1)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-0.5">
                                                        Quitar
                                                    </button>
                                                )}
                                            </div>
                                            <div className={`bg-slate-50 border-2 border-dashed rounded-2xl h-[130px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && !photoPreview ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                                {photoPreview ? (
                                                    <img src={photoPreview} alt="Agencia Proof" className="w-full h-full object-contain" />
                                                ) : (
                                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-2 text-center">
                                                        <div className="p-2 bg-white rounded-full shadow-sm mb-1 text-blue-500">
                                                            <Camera size={20} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Foto Agencia</span>
                                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoUpload(e, 1)} />
                                                    </label>
                                                )}
                                            </div>
                                        </div>

                                        {/* Photo 2: Content Signature Return Proof */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">📄 Foto 2: Doc. Firmado <span className="text-red-500">*</span></label>
                                                {photoPreview2 && (
                                                    <button onClick={() => handleClearPhoto(2)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-0.5">
                                                        Quitar
                                                    </button>
                                                )}
                                            </div>
                                            <div className={`bg-slate-50 border-2 border-dashed rounded-2xl h-[130px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && !photoPreview2 ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                                {photoPreview2 ? (
                                                    <img src={photoPreview2} alt="Document Proof" className="w-full h-full object-contain" />
                                                ) : (
                                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-2 text-center">
                                                        <div className="p-2 bg-white rounded-full shadow-sm mb-1 text-emerald-500">
                                                            <FileText size={20} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Doc. Firmado</span>
                                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoUpload(e, 2)} />
                                                    </label>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Single Photo Capture */
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <label className={labelClass}>Foto del Sello / Albarán / Documento {requiresPhoto1 && <span className="text-red-500">*</span>}</label>
                                            {photoPreview && (
                                                <button onClick={() => handleClearPhoto(1)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-1">
                                                    Quitar
                                                </button>
                                            )}
                                        </div>
                                        <div className={`bg-slate-50 border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && requiresPhoto1 && !photoPreview ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                            {photoPreview ? (
                                                <img src={photoPreview} alt="Proof" className="w-full h-full object-contain" />
                                            ) : (
                                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-6">
                                                    <div className="p-4 bg-white rounded-full shadow-sm mb-2 text-blue-500">
                                                        <Camera size={32} />
                                                    </div>
                                                    <span className="text-sm text-slate-500 font-bold uppercase tracking-tight">
                                                        {shipment.needsSignatureReturn ? "Tomar Foto del Doc. Firmado" : "Tomar Foto del Sello"}
                                                    </span>
                                                    <span className="text-xs text-slate-400">Captura la evidencia visual</span>
                                                    <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handlePhotoUpload(e, 1)} />
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-col gap-2">
                    {/* Logic: If there is SOMETHING to collect (current Porte, COD, or old Debts), show dual buttons. Else show single finish button. */}
                    {allSelectableDebts.length > 0 ? (
                        <>
                            <button
                                onClick={() => handleConfirm('Entregado')}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 transition-all order-1"
                            >
                                <CheckCircle size={20} />
                                <span>
                                    {shipment?.type === 'Recogida'
                                        ? `Cobrar (€${totalToCollect.toFixed(2)}) y Continuar`
                                        : `Cobrar Todo (€${totalToCollect.toFixed(2)}) y Finalizar`
                                    }
                                </span>
                            </button>
                            {shipment?.type === 'Recogida' ? (
                                <button
                                    onClick={() => { onConfirm(shipment.id, { type: 'multi', coordinates: deliveryCoordinates }, 'skip_pickup', [], customAmounts, false); }}
                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-all border border-slate-200 order-2"
                                >
                                    <span>Saltar Cobros y Continuar</span>
                                </button>
                            ) : (
                                !shipment.hasCod && (
                                    <button
                                        onClick={() => handleConfirm('Entregado', true)}
                                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-3 rounded-xl font-bold shadow-sm flex flex-col items-center justify-center gap-1 transition-all border border-amber-200 order-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Wallet size={20} />
                                            <span>Aplazar Porte</span>
                                        </div>
                                        <span className="text-[10px] font-normal opacity-80 text-center px-4">
                                            Entregar paquete HOY. Registrar deuda para cobrar después.
                                        </span>
                                    </button>
                                )
                            )}
                        </>
                    ) : (
                        <button
                            onClick={() => handleConfirm('Entregado')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                        >
                            <CheckCircle size={20} />
                            <span>{shipment?.type === 'Recogida' ? 'Continuar con Recogida' : 'Confirmar Entrega'}</span>
                        </button>
                    )}
                </div>

                {/* Return Prompt Overlay/Screen */}
                {showReturnPrompt && (
                    <div className="absolute inset-0 bg-blue-900/95 backdrop-blur-xl z-[200] flex items-center justify-center p-6 text-center animate-in zoom-in duration-300">
                        <div className="space-y-6 max-w-xs">
                            <div className="w-20 h-20 bg-amber-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-amber-400/20">
                                <RotateCcw size={40} className="text-amber-900 animate-spin-slow" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">¿Realizar Retorno?</h3>
                                <p className="text-blue-100 text-sm leading-relaxed">Este envío tiene marcado un **retorno**. El precio ({shipment.amount}) será heredado automáticamente al origen.</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleConfirmReturn(true)}
                                    className="w-full bg-white text-blue-900 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <RotateCcw size={18} />
                                    GENERAR RETORNO
                                </button>
                                <button
                                    onClick={() => handleConfirmReturn(false)}
                                    className="w-full bg-blue-800/50 text-blue-200 py-3 rounded-xl font-bold hover:bg-blue-800/70 transition-all text-sm"
                                >
                                    NO TIENE RETORNO
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Initial Return Alert (Upon opening) */}
                {initialReturnAlert && (
                    <div className="absolute inset-0 bg-blue-600 z-[300] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-6 text-white max-w-xs text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                                <RotateCcw size={40} className="text-white" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black uppercase tracking-tighter">¡Llleva Retorno!</h2>
                                <p className="text-blue-100 font-medium">Este envío tiene vinculada una **recogida de retorno**. Recuérdalo antes de marcharte.</p>
                            </div>
                            <button
                                onClick={() => setInitialReturnAlert(false)}
                                className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black shadow-xl shadow-blue-900/20 active:scale-95 transition-all text-sm tracking-widest"
                            >
                                ENTENDIDO, RECOGERÉ EL RETORNO
                            </button>
                        </div>
                    </div>
                )}
                {/* Initial Signature Alert */}
                {initialSignatureAlert && (
                    <div className="absolute inset-0 bg-emerald-600 z-[300] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-6 text-white max-w-xs text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                                <FileText size={40} className="text-white" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black uppercase tracking-tighter">Papel Firmado</h2>
                                <p className="text-emerald-50 font-medium">El cliente solicita la **devolución de documentación firmada**. Recógela antes de marcharte.</p>
                            </div>
                            <button
                                onClick={() => setInitialSignatureAlert(false)}
                                className="w-full bg-white text-emerald-600 py-4 rounded-2xl font-black shadow-xl shadow-emerald-900/20 active:scale-95 transition-all text-sm tracking-widest"
                            >
                                ENTENDIDO, TENGO EL PAPEL
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
