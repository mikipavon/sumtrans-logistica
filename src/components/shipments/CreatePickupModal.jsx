import { X, Building2, Package, FileText } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function CreatePickupModal({ isOpen, onClose, onSave, clients }) {
    const [formData, setFormData] = useState({
        clientName: '',
        originAddress: '',
        originZip: '',
        originCity: '',
        observations: ''
    });

    const [filteredClients, setFilteredClients] = useState([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            setFormData({
                clientName: '',
                originAddress: '',
                originZip: '',
                originCity: '',
                observations: ''
            });
            setShowSuggestions(false);
        }
    }, [isOpen]);

    const updateSuggestions = (value) => {
        if (!clients) return;
        const matches = clients.filter(c => {
            // Allow searching ALL clients, regardless of type
            if (!value) return true;
            return (c.name || '').toLowerCase().includes(value.toLowerCase());
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

    const handleFocus = () => updateSuggestions(formData.clientName);

    const handleClientNameChange = (e) => {
        const value = e.target.value;
        setFormData(prev => ({ ...prev, clientName: value }));
        updateSuggestions(value);
    };

    const selectClient = (client) => {
        setFormData(prev => ({
            ...prev,
            clientName: client.name,
            originAddress: client.address,
            originZip: client.zip || '',
            originCity: client.city || ''
        }));
        setShowSuggestions(false);
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        // For Pickups, origin is the relevant address
        const fullOrigin = `${formData.originAddress}, ${formData.originZip} ${formData.originCity}`.trim();

        const newPickup = {
            id: `PU-${new Date().getFullYear()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
            type: 'Recogida', // Essential tag
            client: formData.clientName,

            // Pickup Location (Origin)
            origin: fullOrigin,
            originAddress: formData.originAddress,
            originZip: formData.originZip,
            originCity: formData.originCity,

            // Destination is generic for Pickups until processed
            destination: 'Almacén Central',

            address: fullOrigin, // Main display address for functionality
            status: 'Pendiente', // Initial status
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
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-[9999] p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
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
                                <label className={labelClass}>Remitente / Empresa</label>
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

                            <div>
                                <label className={labelClass}>Dirección de Recogida</label>
                                <input
                                    type="text"
                                    placeholder="Dirección completa"
                                    className={inputClass}
                                    value={formData.originAddress}
                                    onChange={(e) => setFormData({ ...formData, originAddress: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
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
                                    <label className={labelClass}>CP</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={formData.originZip}
                                        onChange={(e) => setFormData({ ...formData, originZip: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col">
                            <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                                <FileText size={14} /> Observaciones
                            </h4>
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
        </div>
    );
}
