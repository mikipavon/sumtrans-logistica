import { X, User, Package, PenTool, CheckCircle } from 'lucide-react';
import { useState } from 'react';

export default function DeliveryNoteModal({ isOpen, onClose }) {
    const [signed, setSigned] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        alert('Albarán creado correctamente (Simulado)');
        setSigned(false);
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50/50">
                    <h3 className="text-lg font-bold text-slate-800">Nuevo Albarán</h3>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Cliente / Destino</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="text"
                                placeholder="Nombre del Cliente"
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                required
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Mercancía</label>
                        <div className="relative">
                            <Package className="absolute left-3 top-3 text-slate-400" size={18} />
                            <textarea
                                placeholder="Descripción de la entrega..."
                                className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all min-h-[100px] resize-none"
                                required
                            ></textarea>
                        </div>
                    </div>

                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Conformidad</label>
                        <button
                            type="button"
                            onClick={() => setSigned(true)}
                            className={`w-full py-4 rounded-lg border-2 border-dashed flex items-center justify-center gap-2 transition-all ${signed
                                    ? 'bg-green-50 border-green-500 text-green-700'
                                    : 'border-slate-300 text-slate-400 hover:text-slate-600 hover:border-slate-400'
                                }`}
                        >
                            {signed ? (
                                <>
                                    <CheckCircle size={20} />
                                    <span>Firmado Digitalmente</span>
                                </>
                            ) : (
                                <>
                                    <PenTool size={20} />
                                    <span>Solicitar Firma</span>
                                </>
                            )}
                        </button>
                    </div>

                    <button
                        type="submit"
                        className="w-full mt-6 bg-blue-600 text-white font-bold py-3.5 rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20"
                    >
                        Guardar Albarán
                    </button>
                </form>
            </div>
        </div>
    );
}
