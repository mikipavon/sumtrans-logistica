import { useState, useRef, useEffect } from 'react';
import { X, CheckCircle, PenTool, Camera, Image as ImageIcon, Mic, MicOff, Wallet, MapPin } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

export default function DeliveryConfirmationModal({ isOpen, onClose, onConfirm, shipment, collectionAlert }) {
    const [mode, setMode] = useState('signature'); // 'signature' or 'photo'
    const sigCanvas = useRef({});
    const [photoPreview, setPhotoPreview] = useState(null);

    // New Fields State
    const [receiverName, setReceiverName] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [deliveryCoordinates, setDeliveryCoordinates] = useState('');

    // Auto-capture GPS and Collection Alert when modal opens
    useEffect(() => {
        if (isOpen) {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const coords = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
                        setDeliveryCoordinates(coords);
                    },
                    (error) => console.log('GPS capture failed:', error.message),
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            }

            // Show Alert if Collection Required
            if (collectionAlert) {
                // Small delay to allow modal render first
                setTimeout(() => {
                    alert("⚠️ AVISO IMPORTANTE: COBRO PENDIENTE\n\nEste envío es a PORTES DEBIDOS.\nEl destinatario debe abonar el importe AHORA.\n\nNo entregue sin cobrar.");
                }, 300);
            }
        }
    }, [isOpen, collectionAlert]);

    if (!isOpen || !shipment) return null;

    // ... (rest of methods unchanged)
    // Voice Recognition Logic
    const handleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert("Tu navegador no soporta dictado por voz. Intenta usar Chrome o Safari.");
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();

        recognition.lang = 'es-ES';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        if (isListening) {
            recognition.stop();
            setIsListening(false);
            return;
        }

        setIsListening(true);
        recognition.start();

        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setReceiverName(prev => (prev ? prev + ' ' + transcript : transcript)); // Append if exists
            setIsListening(false);
        };

        recognition.onerror = (event) => {
            console.error("Speech recognition error", event.error);
            setIsListening(false);
        };

        recognition.onend = () => {
            setIsListening(false);
        };
    };

    const handleClear = () => {
        if (mode === 'signature') {
            sigCanvas.current.clear();
        } else {
            setPhotoPreview(null);
        }
    };

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleConfirm = (status) => {
        let proofData = null;

        if (mode === 'signature') {
            if (sigCanvas.current.isEmpty && sigCanvas.current.isEmpty()) {
                alert("Por favor, firma antes de confirmar.");
                return;
            }
            proofData = {
                type: 'signature',
                data: sigCanvas.current.toDataURL(),
                name: receiverName,
                dni: receiverId,
                coordinates: deliveryCoordinates
            };
        } else {
            if (!photoPreview) {
                alert("Por favor, sube una foto antes de confirmar.");
                return;
            }
            proofData = { type: 'photo', data: photoPreview, coordinates: deliveryCoordinates };
        }

        onConfirm(shipment.id, proofData, status);
        onClose();
        // Reset states
        setPhotoPreview(null);
        setReceiverName('');
        setReceiverId('');
    };

    // Input classes helper
    const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm";
    const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1";

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800">Confirmar Entrega</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Collection Alert Banner */}
                {collectionAlert && (
                    <div className="bg-red-50 border-b border-red-100 p-3 px-6 animate-in slide-in-from-top-2">
                        <div className="flex items-start gap-3">
                            <Wallet className="text-red-600 shrink-0 mt-0.5" size={18} />
                            <div>
                                <h4 className="text-sm font-bold text-red-700 uppercase tracking-wider">Cobrar al Entregar</h4>
                                <p className="text-xs text-red-600 font-medium">Portes Debidos: <span className="text-lg font-bold">{shipment.amount}</span></p>
                            </div>
                        </div>
                    </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    <p className="text-sm text-slate-500 mb-2">
                        Entrega para: <span className="font-bold text-slate-800">{shipment.client}</span>
                    </p>

                    {/* GPS Status Indicator */}
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

                    {/* Mode Toggle */}
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
                        <button
                            onClick={() => setMode('signature')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'signature' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <PenTool size={16} />
                            Firma
                        </button>
                        <button
                            onClick={() => setMode('photo')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-all ${mode === 'photo' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <Camera size={16} />
                            Foto / Sello
                        </button>
                    </div>

                    {/* Extra Fields for Signature */}
                    {mode === 'signature' && (
                        <div className="space-y-3 mb-4 animate-in slide-in-from-top-2 duration-200">
                            <div>
                                <label className={labelClass}>Nombre de quien Recibe</label>
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
                                <label className={labelClass}>DNI / NIE</label>
                                <input
                                    type="text"
                                    placeholder="12345678X"
                                    className={inputClass}
                                    value={receiverId}
                                    onChange={(e) => setReceiverId(e.target.value)}
                                />
                            </div>
                        </div>
                    )}

                    <label className={labelClass} style={{ marginBottom: '0.5rem' }}>
                        {mode === 'signature' ? 'Firma del Receptor' : 'Adjuntar Imagen'}
                    </label>

                    <div className="bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl min-h-[200px] flex flex-col items-center justify-center relative overflow-hidden">
                        {mode === 'signature' ? (
                            <SignatureCanvas
                                ref={sigCanvas}
                                penColor="black"
                                canvasProps={{ className: 'absolute inset-0 w-full h-full' }}
                                backgroundColor="rgba(255,255,255,0)"
                            />
                        ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center p-4">
                                {photoPreview ? (
                                    <img src={photoPreview} alt="Proof" className="w-full h-full object-contain rounded-lg" />
                                ) : (
                                    <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors">
                                        <div className="p-4 bg-white rounded-full shadow-sm mb-2">
                                            <Camera size={32} className="text-blue-500" />
                                        </div>
                                        <span className="text-sm text-slate-500 font-medium">Pulsa para tomar foto</span>
                                        <span className="text-xs text-slate-400">o subir archivo</span>
                                        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
                                    </label>
                                )}
                            </div>
                        )}
                    </div>

                    <button onClick={handleClear} className="w-full mt-2 text-xs text-red-500 font-medium hover:underline text-center">
                        Limpiar {mode === 'signature' ? 'Firma' : 'Imagen'}
                    </button>
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-col gap-2">
                    <button
                        onClick={() => handleConfirm('Pendiente Cobro')}
                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-3 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-all border border-amber-200"
                    >
                        <Wallet size={20} />
                        Confirmar (Pendiente de Cobro)
                    </button>
                    <button
                        onClick={() => handleConfirm('Entregado')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                    >
                        <CheckCircle size={20} />
                        Confirmar y Finalizar
                    </button>
                </div>
            </div>
        </div>
    );
}
