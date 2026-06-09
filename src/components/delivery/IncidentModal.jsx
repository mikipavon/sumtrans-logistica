import { useState, useEffect } from 'react';
import { X, AlertTriangle, Camera, Trash2, CheckCircle, Mic, MicOff } from 'lucide-react';

export default function IncidentModal({ isOpen, onClose, onConfirm, shipment, initialReason = '' }) {
    const [reason, setReason] = useState('');
    const [photo, setPhoto] = useState(null);
    const [isListening, setIsListening] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setReason(initialReason);
            setPhoto(null);
        }
    }, [isOpen, initialReason]);

    const handlePhotoUpload = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => setPhoto(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const startListening = () => {
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

            recognition.onstart = () => setIsListening(true);
            recognition.onend = () => setIsListening(false);
            recognition.onerror = () => setIsListening(false);
            
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                setReason(prev => prev ? `${prev} ${transcript}` : transcript);
            };

            recognition.start();
        } catch (error) {
            console.error("Speech Recognition Error:", error);
            setIsListening(false);
        }
    };

    if (!isOpen || !shipment) return null;

    const handleSubmit = () => {
        if (!reason.trim()) {
            alert("Por favor, describe el motivo de la incidencia.");
            return;
        }
        onConfirm(shipment.id, 'Incidencia', null, reason, photo);
        setReason('');
        setPhoto(null);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[110] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col h-[90vh] sm:h-auto">
                <div className="p-4 border-b border-slate-100 bg-red-50 flex justify-between items-center text-red-700">
                    <div className="flex items-center gap-2 font-bold">
                        <AlertTriangle size={20} />
                        <h3>Reportar Incidencia</h3>
                    </div>
                    <button onClick={onClose} className="text-red-400 hover:text-red-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
                    <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Albarán</p>
                        <p className="font-bold text-slate-800">#{shipment.id} - {shipment.client}</p>
                    </div>

                    <div className="relative">
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex justify-between items-center">
                            <span>Motivo de la Incidencia *</span>
                            <button 
                                id="tour-incident-mic"
                                onClick={startListening}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold transition-all ${
                                    isListening 
                                    ? 'bg-red-100 text-red-600 animate-pulse' 
                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                                title="Dictar por voz"
                            >
                                {isListening ? <MicOff size={12} /> : <Mic size={12} />}
                                {isListening ? 'Escuchando...' : 'Hablar'}
                            </button>
                        </label>
                        <textarea
                            id="tour-incident-textarea"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all min-h-[100px] resize-none"
                            placeholder="Ej: Cliente ausente, dirección incorrecta, paquete dañado..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                        />
                        <div id="tour-incident-shortcuts" className="flex flex-wrap gap-2 mt-2">
                            {['Cliente ausente', 'Dirección incorrecta', 'Paquete dañado', 'Local cerrado', 'Falta tiempo', 'Rechazado', 'No dispone del reembolso'].map(r => (
                                <button
                                    key={r}
                                    type="button"
                                    onClick={() => setReason(prev => prev ? `${prev}. ${r}` : r)}
                                    className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                            Foto de Prueba (Opcional)
                        </label>
                        <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl min-h-[150px] flex flex-col items-center justify-center overflow-hidden relative group">
                            {photo ? (
                                <>
                                    <img src={photo} alt="Incident" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => setPhoto(null)}
                                        className="absolute top-2 right-2 p-2 bg-red-600 text-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </>
                            ) : (
                                <label className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-4">
                                    <div className="p-3 bg-white rounded-full shadow-sm mb-2 text-red-500">
                                        <Camera size={24} />
                                    </div>
                                    <span className="text-sm text-slate-500 font-medium">Hacer foto / Subir archivo</span>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        capture="environment" 
                                        className="hidden" 
                                        onChange={handlePhotoUpload} 
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                </div>

                <div className="p-4 bg-slate-50 border-t border-slate-100 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors text-sm"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleSubmit}
                        className="flex-2 px-8 py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg shadow-red-500/30 hover:bg-red-700 transition-all flex items-center justify-center gap-2 text-sm"
                    >
                        <CheckCircle size={18} />
                        Enviar Incidencia
                    </button>
                </div>
            </div>
        </div>
    );
}
