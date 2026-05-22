import { useState, useRef, useEffect, useMemo } from 'react';
import { X, CheckCircle, PenTool, Camera, Image as ImageIcon, Mic, MicOff, Wallet, MapPin } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';

export default function DeliveryConfirmationModal({ isOpen, onClose, onConfirm, shipment, collectionAlert, pendingDebts = [] }) {
    const labelClass = "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1";
    const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm";
    const [mode, setMode] = useState('signature'); // 'signature' or 'photo'
    const sigCanvas = useRef({});
    const [photoPreview, setPhotoPreview] = useState(null);

    // New Fields State
    const [receiverName, setReceiverName] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [deliveryCoordinates, setDeliveryCoordinates] = useState('');

    // Parse helper
    const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        return parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
    };

    // Unified list of all selectable debts (current + other pending)
    const [selectedDebts, setSelectedDebts] = useState([]);

    // Build a list of current shipment parts to make them selectable too
    const currentParts = useMemo(() => {
        if (!shipment) return [];
        const parts = [];
        const isPorteDebido = shipment.porteType === 'Debido';
        const hasCod = shipment.hasCod;
        const pVal = parseVal(shipment.amount);
        const cVal = hasCod ? parseVal(shipment.codAmount) : 0;

        if (isPorteDebido && pVal > 0) {
            parts.push({
                id: `${shipment.id}-porte`,
                label: `Porte Actual: ${shipment.id}`,
                amount: pVal.toFixed(2),
                type: 'Porte'
            });
        }
        if (hasCod && cVal > 0) {
            parts.push({
                id: `${shipment.id}-reembolso`,
                label: `Reembolso Actual: ${shipment.id}`,
                amount: cVal.toFixed(2),
                type: 'Reembolso'
            });
        }
        return parts;
    }, [shipment]);

    const allSelectableDebts = useMemo(() => {
        return [...currentParts, ...pendingDebts];
    }, [currentParts, pendingDebts]);

    // Auto-select all by default when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedDebts(allSelectableDebts.map(d => d.id));
        } else {
            setSelectedDebts([]);
        }
    }, [isOpen, allSelectableDebts]);

    // Calculate Dynamic Total
    const totalToCollect = allSelectableDebts
        .filter(d => selectedDebts.includes(d.id))
        .reduce((sum, d) => sum + parseVal(d.amount), 0);

    useEffect(() => {
        if (isOpen && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => setDeliveryCoordinates(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`),
                (error) => console.log(error)
            );
        } else if (!isOpen) {
            setDeliveryCoordinates('');
            setReceiverName('');
            setReceiverId('');
            setPhotoPreview(null);
            if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
                sigCanvas.current.clear();
            }
        }
    }, [isOpen]);

    if (!isOpen || !shipment) return null;

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

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPhotoPreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleClear = () => {
        if (mode === 'signature') {
            if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
                sigCanvas.current.clear();
            }
        } else {
            setPhotoPreview(null);
        }
    };

    const handleConfirm = (status) => {
        let proofData = { type: 'none', coordinates: deliveryCoordinates };

        if (mode === 'signature') {
            // Require either a signature or a typed name/id
            if (sigCanvas.current?.isEmpty() && !receiverName && !receiverId && status === 'Entregado') {
                alert("Por favor, introduzca una firma o el nombre del receptor para confirmar la entrega.");
                return;
            }

            let signatureImage = null;
            if (!sigCanvas.current?.isEmpty()) {
                try {
                    // Try to get trimmed canvas, fallback to full canvas if it fails
                    const trimmed = sigCanvas.current.getTrimmedCanvas();
                    signatureImage = trimmed.toDataURL('image/png');
                } catch (e) {
                    try {
                        signatureImage = sigCanvas.current.toDataURL('image/png');
                    } catch (err) {
                        console.error("Error generating signature image", err);
                    }
                }
            }

            proofData = {
                type: 'signature',
                data: signatureImage,
                name: receiverName,
                id: receiverId,
                coordinates: deliveryCoordinates
            };
        } else if (mode === 'photo') {
            if (!photoPreview && status === 'Entregado') {
                alert("Por favor, adjunte una imagen para confirmar la entrega.");
                return;
            }
            proofData = {
                type: 'photo',
                data: photoPreview,
                coordinates: deliveryCoordinates
            };
        }

        onConfirm(shipment.id, proofData, status, selectedDebts);
    };
    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[95vh]">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-slate-800">Confirmar Entrega</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Unified Cobros Section (The "Alarma") */}
                {allSelectableDebts.length > 0 && (
                    <div className="bg-red-50 border-b border-red-100 p-4 shrink-0 overflow-y-auto max-h-[40vh] custom-scrollbar">
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
                                                <span className="font-mono font-bold text-slate-800 text-sm">{debt.amount}€</span>
                                            </div>
                                            <p className="text-xs font-bold text-slate-700 mt-0.5">{debt.label}</p>
                                            {debt.detail && <p className="text-[10px] text-slate-400">{debt.detail}</p>}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="mt-4 pt-3 border-t border-red-200 flex justify-between items-end">
                            <div>
                                <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Total Seleccionado</p>
                                <p className="text-2xl font-black text-red-800 leading-none">{totalToCollect.toFixed(2)}€</p>
                            </div>
                            <span className="text-[10px] text-red-400 font-medium">Se marcarán como cobrados</span>
                        </div>
                    </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                    {/* ... (Existing Content: GPS, Mode, Canvas) ... */}
                    <p className="text-sm text-slate-500 mb-2">
                        Entrega para: <span className="font-bold text-slate-800">{shipment.client}</span>
                    </p>

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
                    {/* Logic: If anything needs collecting (Debido, COD, or Debts), show dual buttons. Else show single finish button. */}
                    {(shipment.porteType === 'Debido' || shipment.hasCod || selectedDebts.length > 0) ? (
                        <>
                            <button
                                onClick={() => handleConfirm('Entregado')}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 transition-all order-1"
                            >
                                <CheckCircle size={20} />
                                <span>Cobrar Todo (€{totalToCollect.toFixed(2)}) y Finalizar</span>
                            </button>
                            <button
                                onClick={() => handleConfirm('Entrega aplazada')}
                                className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-3 rounded-xl font-bold shadow-sm flex flex-col items-center justify-center gap-1 transition-all border border-amber-200 order-2"
                            >
                                <div className="flex items-center gap-2">
                                    <Wallet size={20} />
                                    <span>Confirmar (Entrega Aplazada)</span>
                                </div>
                                <span className="text-[10px] font-normal opacity-80">
                                    A cargo de: {(shipment.porteType === 'Debido' || (shipment.hasCod && parseVal(shipment.codAmount) > 0)) ? (shipment.destinationName || 'Destinatario') : (shipment.client || 'Remitente')}
                                </span>
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={() => handleConfirm('Entregado')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                        >
                            <CheckCircle size={20} />
                            <span>Confirmar Entrega</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
