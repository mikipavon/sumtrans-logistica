import { Search, Filter, MapPin, Building2, Calendar, Database, Lock, Edit2, Check, X, Plus, Upload, FileSpreadsheet } from 'lucide-react';
import { useState, useRef } from 'react';
import CreateClientModal from '../components/clients/CreateClientModal';

export default function Clients({ clients, articles, onUpdateClient, onAddClient, onImportClients }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingClient, setEditingClient] = useState(null);
    const fileInputRef = useRef(null);

    // Edit Handler: Open modal with client data
    const handleEdit = (client) => {
        setEditingClient(client);
        setIsCreateModalOpen(true);
    };

    // Save Handler: Distinguishes between Create and Update based on presence of ID
    const handleSave = (clientData) => {
        if (clientData.id) {
            // Update existing
            onUpdateClient(clientData.id, clientData);
        } else {
            // Create new
            onAddClient(clientData);
        }
        setEditingClient(null); // Clear editing state
    };

    const handleModalClose = () => {
        setIsCreateModalOpen(false);
        setEditingClient(null);
    };

    const handleFileUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            // Basic CSV Parser (assumes header: Name,Address,Type)
            const lines = text.split('\n');
            const newClients = [];

            // Skip header (index 0) if exists
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line) {
                    const [name, address, type] = line.split(',');
                    if (name && address) {
                        newClients.push({
                            name: name.trim(),
                            address: address.trim(),
                            type: type ? type.trim() : 'Remitente'
                        });
                    }
                }
            }

            if (newClients.length > 0) {
                onImportClients(newClients);
                alert(`Se han importado ${newClients.length} clientes correctamente.`);
            } else {
                alert('No se pudieron leer clientes del archivo. Asegúrate de usar formato CSV: Nombre,Direccion,Tipo');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset input
    };

    return (
        <div className="space-y-6">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 text-white p-6 rounded-xl shadow-lg flex items-center justify-between">
                    <div>
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Base de Datos</p>
                        <h2 className="text-2xl font-bold">{clients.length} Ubicaciones</h2>
                        <span className="text-xs text-emerald-400 flex items-center gap-1 mt-2">
                            <Lock size={12} />
                            Ubicaciones Protegidas
                        </span>
                    </div>
                    <div className="p-3 bg-slate-800 rounded-full">
                        <Database size={24} className="text-blue-400" />
                    </div>
                </div>
            </div>

            {/* Actions Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="relative w-full sm:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar cliente o dirección..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto">
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        accept=".csv"
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current.click()}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                    >
                        <FileSpreadsheet size={18} className="text-green-600" />
                        Importar Excel (CSV)
                    </button>
                    <button
                        onClick={() => {
                            setEditingClient(null);
                            setIsCreateModalOpen(true);
                        }}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-sm shadow-lg shadow-blue-500/20"
                    >
                        <Plus size={18} />
                        Nuevo Cliente
                    </button>
                </div>
            </div>

            {/* Clients Table */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Comercial / Razón Social</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Ubicación</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Contacto</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                            <th className="px-6 py-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">Cobro</th>
                            <th className="px-6 py-4 text-center text-xs font-semibold text-slate-500 uppercase tracking-wider">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {clients.map((client) => (
                            <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-slate-100 text-slate-600 rounded-lg shrink-0">
                                            <Building2 size={18} />
                                        </div>
                                        <div>
                                            <div className="font-bold text-slate-800">{client.name}</div>
                                            {client.legalName && <div className="text-xs text-slate-500 mt-0.5">{client.legalName}</div>}
                                            {client.cif && <div className="text-[10px] text-slate-400 font-mono mt-0.5">{client.cif}</div>}
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm">
                                        <div className="flex items-start gap-2 text-slate-700">
                                            <Lock size={12} className="text-amber-400 shrink-0 mt-1" title="Ubicación Bloqueada" />
                                            <span className="font-medium">{client.address}</span>
                                        </div>
                                        {(client.city || client.zip) && (
                                            <div className="ml-5 text-slate-500 text-xs mt-0.5">
                                                {client.zip} {client.city}
                                            </div>
                                        )}
                                        {client.coordinates && (
                                            <div className="ml-5 text-blue-400 text-[10px] mt-0.5 font-mono flex items-center gap-1">
                                                <MapPin size={8} />
                                                {client.coordinates}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    {client.phone ? (
                                        <div className="text-sm text-slate-600">{client.phone}</div>
                                    ) : (
                                        <span className="text-xs text-slate-300 italic">--</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                        ${client.type === 'Remitente' ? 'bg-blue-50 text-blue-700 border border-blue-100' :
                                            client.type === 'Destinatario' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                                                'bg-purple-50 text-purple-700 border border-purple-100'}`}>
                                        {client.type}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex flex-col gap-1">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
                                            ${client.billingType === 'Cobro Diario' ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-50 text-slate-600 border border-slate-200'}`}>
                                            {client.billingType || 'Facturación'}
                                        </span>
                                        {client.color && (
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: client.color }}></div>
                                                <span className="text-[10px] text-slate-400">Color</span>
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-center">
                                    <button
                                        onClick={() => handleEdit(client)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                        title="Editar Ubicación"
                                    >
                                        <Edit2 size={16} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {clients.length === 0 && (
                            <tr>
                                <td colSpan="6" className="text-center py-8 text-slate-400">
                                    No hay ubicaciones registradas aún.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            <CreateClientModal
                isOpen={isCreateModalOpen}
                onClose={handleModalClose}
                onSave={handleSave}
                articles={articles}
                initialData={editingClient}
            />
        </div>
    );
}
