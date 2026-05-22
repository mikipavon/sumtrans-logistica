import { useState } from 'react';
import { CheckCircle, XCircle, Clock, MapPin, Phone, Building2, Tag, User, Calendar, Edit, X, Save } from 'lucide-react';

export default function ClientValidation({ clients, onValidateClient, onUpdateClient }) {
    // Filter only pending clients — exclude test-mode clients (isTest: true)
    const pendingClients = clients.filter(c => c.status === 'pending' && !c.isTest);

    // Edit modal state
    const [editingClient, setEditingClient] = useState(null);
    const [editForm, setEditForm] = useState({
        name: '',
        address: '',
        city: '',
        zip: '',
        phone: '',
        coordinates: '',
        type: 'Destinatario',
        billingType: 'Clientes Habituales'
    });

    const openEditModal = (client) => {
        setEditForm({
            name: client.name || '',
            address: client.address || '',
            city: client.city || '',
            zip: client.zip || '',
            phone: client.phone || '',
            coordinates: client.coordinates || '',
            type: client.type || 'Destinatario',
            billingType: client.billingType || 'Clientes Habituales'
        });
        setEditingClient(client);
    };

    const handleSaveAndApprove = () => {
        if (onUpdateClient && editingClient) {
            // Update client data then approve
            onUpdateClient(editingClient.id, editForm);
        }
        onValidateClient(editingClient.id, true);
        setEditingClient(null);
    };

    const handleApprove = (clientId) => {
        onValidateClient(clientId, true);
    };

    const handleReject = (clientId) => {
        onValidateClient(clientId, false);
    };

    const inputClass = "w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm";
    const labelClass = "block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Clock className="text-amber-600" />
                        Validar Clientes
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Clientes creados automáticamente pendientes de aprobación
                    </p>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                    <Clock size={18} className="text-amber-600" />
                    <span className="font-bold text-amber-700">{pendingClients.length}</span>
                    <span className="text-amber-600">pendientes</span>
                </div>
            </div>

            {/* Pending Clients Grid */}
            {pendingClients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pendingClients.map(client => (
                        <div key={client.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                            {/* Header */}
                            <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="p-2 bg-amber-100 rounded-lg">
                                        <Building2 size={16} className="text-amber-600" />
                                    </div>
                                    <span className="font-bold text-slate-800 truncate max-w-[150px]" title={client.name}>
                                        {client.name}
                                    </span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full ${client.type === 'Remitente'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-purple-100 text-purple-700'
                                    }`}>
                                    {client.type}
                                </span>
                            </div>

                            {/* Body */}
                            <div className="p-4 space-y-3 text-sm">
                                {client.address && (
                                    <div className="flex items-start gap-2">
                                        <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                        <span className="text-slate-600">{client.address}</span>
                                    </div>
                                )}
                                {client.city && (
                                    <div className="flex items-center gap-2">
                                        <Tag size={14} className="text-slate-400" />
                                        <span className="text-slate-600">{client.city} {client.zip && `(${client.zip})`}</span>
                                    </div>
                                )}
                                {client.phone && (
                                    <div className="flex items-center gap-2">
                                        <Phone size={14} className="text-slate-400" />
                                        <span className="text-slate-600">{client.phone}</span>
                                    </div>
                                )}
                                {client.coordinates && (
                                    <div className="flex items-center gap-2">
                                        <MapPin size={14} className="text-emerald-500" />
                                        <span className="text-emerald-600 text-xs font-mono">{client.coordinates}</span>
                                    </div>
                                )}

                                {/* Meta info */}
                                <div className="pt-2 border-t border-slate-100 space-y-1">
                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                        <Calendar size={12} />
                                        <span>Creado: {client.lastInteraction}</span>
                                    </div>
                                    {client.createdFrom && (
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <Tag size={12} />
                                            <span>Desde: {client.createdFrom}</span>
                                        </div>
                                    )}
                                    {client.createdBy && (
                                        <div className="flex items-center gap-2 text-xs text-slate-400">
                                            <User size={12} />
                                            <span>Por: {client.createdBy}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="px-4 pb-4 space-y-2">
                                <button
                                    onClick={() => openEditModal(client)}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                                >
                                    <Edit size={16} />
                                    Editar y Validar
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(client.id)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold rounded-lg transition-colors text-sm"
                                    >
                                        <CheckCircle size={14} />
                                        Aprobar
                                    </button>
                                    <button
                                        onClick={() => handleReject(client.id)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition-colors text-sm"
                                    >
                                        <XCircle size={14} />
                                        Rechazar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">¡Todo validado!</h3>
                    <p className="text-slate-500">No hay clientes pendientes de aprobación.</p>
                </div>
            )}

            {/* Edit Modal */}
            {editingClient && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Edit size={18} className="text-blue-600" />
                                Editar Cliente
                            </h3>
                            <button onClick={() => setEditingClient(null)} className="text-slate-400 hover:text-slate-600">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                            <div>
                                <label className={labelClass}>Nombre / Empresa</label>
                                <input
                                    type="text"
                                    className={inputClass}
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Dirección</label>
                                <input
                                    type="text"
                                    className={inputClass}
                                    value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Ciudad / Población</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={editForm.city}
                                        onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Código Postal</label>
                                    <input
                                        type="text"
                                        className={inputClass}
                                        value={editForm.zip}
                                        onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className={labelClass}>Teléfono</label>
                                <input
                                    type="tel"
                                    className={inputClass}
                                    value={editForm.phone}
                                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className={labelClass}>Coordenadas GPS</label>
                                <input
                                    type="text"
                                    className={`${inputClass} font-mono text-xs`}
                                    value={editForm.coordinates}
                                    onChange={(e) => setEditForm({ ...editForm, coordinates: e.target.value })}
                                    placeholder="40.4168, -3.7038"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelClass}>Tipo</label>
                                    <select
                                        className={inputClass}
                                        value={editForm.type}
                                        onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                                    >
                                        <option value="Remitente">Remitente</option>
                                        <option value="Destinatario">Destinatario</option>
                                        <option value="Ambos">Ambos</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelClass}>Facturación</label>
                                    <select
                                        className={inputClass}
                                        value={editForm.billingType}
                                        onChange={(e) => setEditForm({ ...editForm, billingType: e.target.value })}
                                    >
                                        <option value="Facturación">Facturación</option>
                                        <option value="Clientes Habituales">Clientes Habituales</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                            <button
                                onClick={() => setEditingClient(null)}
                                className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleSaveAndApprove}
                                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
                            >
                                <Save size={18} />
                                Guardar y Aprobar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
