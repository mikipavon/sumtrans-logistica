import { useState } from 'react';
import { CheckCircle, XCircle, Clock, MapPin, Phone, Building2, Tag, User, Calendar, Edit, Mail, Search, Trash2 } from 'lucide-react';
import CreateClientModal from '../components/clients/CreateClientModal';
import { supabase } from '../lib/supabase';

// ── Llama a la Edge Function para enviar email de acceso al cliente ──
async function sendAccessEmail(clientId) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            alert('Tu sesión ha caducado. Vuelve a iniciar sesión para poder activar clientes.');
            return;
        }
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/confirmar-acceso`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Token de la sesión, no la anon key: la función comprueba que
                // quien llama es admin antes de dar acceso al cliente.
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ clientId }),
        });
        const result = await res.json();
        if (result.ok) {
            console.log(`[Email] Email de acceso enviado a: ${result.emailSentTo}`);
        } else {
            console.warn('[Email] No se pudo enviar el email de acceso:', result.error);
            alert(`El cliente se ha aprobado, pero no se le pudo enviar el email de acceso:\n\n${result.error}`);
        }
    } catch (e) {
        console.warn('[Email] Error al enviar email de acceso:', e);
    }
}

export default function ClientValidation({ clients, onValidateClient, onUpdateClient, onDeleteClients, articles, tariffs, allPoblaciones }) {
    // Filter only pending clients — exclude test-mode clients (isTest: true)
    const pendingClients = clients.filter(c => c.status === 'pending' && !c.isTest);

    const [searchTerm, setSearchTerm] = useState('');
    const normalize = (val) => String(val || '')
        .toLowerCase()
        .trim()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u');
    const filteredClients = searchTerm.trim() === ''
        ? pendingClients
        : pendingClients.filter(c => {
            const term = normalize(searchTerm);
            return normalize(c.name).includes(term)
                || normalize(c.city).includes(term)
                || normalize(c.phone).includes(term)
                || normalize(c.address).includes(term);
        });

    // Selección múltiple
    const [selectedIds, setSelectedIds] = useState([]);

    const toggleSelected = (clientId) => {
        setSelectedIds(prev => prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]);
    };

    const allFilteredSelected = filteredClients.length > 0 && filteredClients.every(c => selectedIds.includes(c.id));

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            const filteredIds = filteredClients.map(c => c.id);
            setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
        } else {
            const filteredIds = filteredClients.map(c => c.id);
            setSelectedIds(prev => [...new Set([...prev, ...filteredIds])]);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0 || !onDeleteClients) return;
        if (!window.confirm(`¿Borrar ${selectedIds.length} cliente${selectedIds.length > 1 ? 's' : ''} pendiente${selectedIds.length > 1 ? 's' : ''} permanentemente? Esta acción no se puede deshacer.`)) return;
        await onDeleteClients(selectedIds);
        setSelectedIds([]);
    };

    // Edit modal state
    const [editingClient, setEditingClient] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const openEditModal = (client) => {
        setEditingClient(client);
        setIsEditModalOpen(true);
    };

    const handleSaveAndApprove = async (clientData) => {
        if (onUpdateClient && editingClient) {
            // Update client data with everything from the full form
            // ⚠️ await is important: ensures billingType is saved before number assignment
            const { id, ...dataWithoutId } = clientData;
            await onUpdateClient(editingClient.id, dataWithoutId);
        }
        // Auto-approve after editing (billingType ya actualizado → número correcto)
        await onValidateClient(editingClient.id, true);
        // Enviar email automático de confirmación de acceso
        await sendAccessEmail(editingClient.id);
        setEditingClient(null);
        setIsEditModalOpen(false);
    };

    const handleModalClose = () => {
        setIsEditModalOpen(false);
        setEditingClient(null);
    };

    const handleApprove = async (clientId) => {
        await onValidateClient(clientId, true);
        // Enviar email automático de confirmación de acceso
        await sendAccessEmail(clientId);
    };

    const handleReject = (clientId) => {
        onValidateClient(clientId, false);
    };

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

            {/* Search + Selección masiva */}
            {pendingClients.length > 0 && (
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="relative max-w-md flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre, ciudad o teléfono..."
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                        />
                    </div>
                    {filteredClients.length > 0 && (
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={allFilteredSelected}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                Seleccionar todos
                            </label>
                            {selectedIds.length > 0 && (
                                <button
                                    onClick={handleDeleteSelected}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm transition-colors"
                                >
                                    <Trash2 size={16} />
                                    Borrar ({selectedIds.length})
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Pending Clients Grid */}
            {filteredClients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map(client => (
                        <div key={client.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${selectedIds.includes(client.id) ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-100'}`}>
                            {/* Header */}
                            <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex items-center justify-between">
                                <div className="flex items-center gap-2 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(client.id)}
                                        onChange={() => toggleSelected(client.id)}
                                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0"
                                    />
                                    <div className="p-2 bg-amber-100 rounded-lg shrink-0">
                                        <Building2 size={16} className="text-amber-600" />
                                    </div>
                                    <span className="font-bold text-slate-800 truncate max-w-[150px]" title={client.name}>
                                        {client.name}
                                    </span>
                                </div>
                                <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${client.type === 'Remitente'
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
            ) : pendingClients.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Sin resultados</h3>
                    <p className="text-slate-500">Ningún cliente pendiente coincide con "{searchTerm}".</p>
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

            {/* Full Edit Modal — Same as Create Client */}
            <CreateClientModal
                isOpen={isEditModalOpen}
                onClose={handleModalClose}
                onSave={handleSaveAndApprove}
                articles={articles}
                tariffs={tariffs}
                allPoblaciones={allPoblaciones}
                initialData={editingClient}
                allClients={clients}
            />
        </div>
    );
}

