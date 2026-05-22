import { useState, useEffect } from 'react';
import { X, Truck, User, FileText, Upload, Download, Trash2, Calendar, Shield, Cpu } from 'lucide-react';

export default function VehicleDetailsModal({ isOpen, onClose, vehicle, drivers, onUpdateVehicle }) {
    const [activeTab, setActiveTab] = useState('detalles');
    const [assignedDriverId, setAssignedDriverId] = useState('');
    const [documents, setDocuments] = useState([]);

    useEffect(() => {
        if (vehicle) {
            setAssignedDriverId(vehicle.assignedDriverId || '');
            setDocuments(vehicle.documents || []);
            setActiveTab('detalles');
        }
    }, [vehicle]);

    if (!isOpen || !vehicle) return null;

    const handleDriverChange = (e) => {
        const newDriverId = e.target.value ? Number(e.target.value) : null;
        setAssignedDriverId(newDriverId);
        onUpdateVehicle(vehicle.id, { assignedDriverId: newDriverId });
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Limitar tamaño a 2MB para no bloquear localStorage
        if (file.size > 2 * 1024 * 1024) {
            alert('El archivo es demasiado grande. El límite es de 2MB para esta demostración.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const newDoc = {
                id: Date.now(),
                name: file.name,
                type: file.type,
                size: (file.size / 1024).toFixed(1) + ' KB',
                date: new Date().toLocaleDateString(),
                dataUrl: event.target.result // Base64 string para simular la subida y descarga
            };

            const updatedDocs = [...documents, newDoc];
            setDocuments(updatedDocs);
            onUpdateVehicle(vehicle.id, { documents: updatedDocs });
        };
        reader.readAsDataURL(file);
    };

    const handleDeleteDocument = (docId) => {
        if (window.confirm('¿Seguro que quieres eliminar este documento?')) {
            const updatedDocs = documents.filter(d => d.id !== docId);
            setDocuments(updatedDocs);
            onUpdateVehicle(vehicle.id, { documents: updatedDocs });
        }
    };

    const assignedDriverInfo = drivers.find(d => d.id === assignedDriverId);

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-100 p-2 rounded-lg text-blue-600">
                            <Truck size={24} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-lg">{vehicle.id}</h3>
                            <p className="text-sm text-slate-500">{vehicle.model}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex border-b border-slate-200 px-4 pt-2 bg-slate-50">
                    <button
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'detalles' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('detalles')}
                    >
                        Detalles y Asignación
                    </button>
                    <button
                        className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${activeTab === 'documentos' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab('documentos')}
                    >
                        Documentación
                        {documents.length > 0 && (
                            <span className="ml-2 bg-slate-200 text-slate-600 py-0.5 px-2 rounded-full text-xs">{documents.length}</span>
                        )}
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1 bg-slate-50/50">
                    {activeTab === 'detalles' ? (
                        <div className="space-y-6 animate-in fade-in">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h4 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                    <User size={18} className="text-slate-400" />
                                    Conductor Asignado
                                </h4>
                                <div className="flex items-center gap-4">
                                    <select
                                        value={assignedDriverId || ''}
                                        onChange={handleDriverChange}
                                        className="flex-1 border border-slate-300 rounded-lg px-4 py-2.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                                    >
                                        <option value="">-- Sin conductor asignado --</option>
                                        {drivers.map(driver => (
                                            <option key={driver.id} value={driver.id}>
                                                {driver.name} {driver.vehicle ? `(Actualmente en ${driver.vehicle})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {assignedDriverInfo && (
                                    <div className="mt-4 p-4 bg-blue-50/50 border border-blue-100 rounded-lg flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold">
                                            {assignedDriverInfo.name.charAt(0)}
                                        </div>
                                        <div>
                                            <p className="font-semibold text-slate-800">{assignedDriverInfo.name}</p>
                                            <p className="text-sm text-slate-500">{assignedDriverInfo.phone}</p>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                                    <Shield className="text-emerald-500 mt-0.5" size={20} />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Estado de Mantenimiento</p>
                                        <p className="font-bold text-slate-700 mt-1">{vehicle.maintenance}</p>
                                    </div>
                                </div>
                                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-start gap-3">
                                    <Cpu className="text-indigo-500 mt-0.5" size={20} />
                                    <div>
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Combustible</p>
                                        <p className="font-bold text-slate-700 mt-1">{vehicle.fuel}</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 animate-in fade-in">
                            <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-slate-700">Archivos del Vehículo</h4>
                                <label className="cursor-pointer bg-blue-50 hover:bg-blue-100 text-blue-700 px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border border-blue-200">
                                    <Upload size={16} />
                                    Subir Archivo
                                    <input type="file" className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" />
                                </label>
                            </div>

                            {documents.length === 0 ? (
                                <div className="bg-white border-2 border-dashed border-slate-200 rounded-xl p-10 text-center flex flex-col items-center justify-center">
                                    <div className="bg-slate-100 p-4 rounded-full mb-3 text-slate-400">
                                        <FileText size={32} />
                                    </div>
                                    <p className="text-slate-600 font-medium">No hay documentos subidos</p>
                                    <p className="text-slate-400 text-sm mt-1">Permiso de circulación, seguro, ficha técnica, etc.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {documents.map((doc) => (
                                        <div key={doc.id} className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex items-center justify-between group hover:border-blue-300 transition-colors">
                                            <div className="flex items-center gap-4">
                                                <div className="bg-blue-50 p-3 rounded-lg text-blue-600">
                                                    <FileText size={24} />
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-700 truncate max-w-[250px] md:max-w-xs">{doc.name}</p>
                                                    <p className="text-xs text-slate-400 mt-0.5">Subido el {doc.date} · {doc.size}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <a
                                                    href={doc.dataUrl}
                                                    download={doc.name}
                                                    className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                    title="Descargar"
                                                >
                                                    <Download size={18} />
                                                </a>
                                                <button
                                                    onClick={() => handleDeleteDocument(doc.id)}
                                                    className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Eliminar"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
