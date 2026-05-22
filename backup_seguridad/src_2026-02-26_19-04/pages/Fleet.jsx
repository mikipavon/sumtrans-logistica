import { Truck, CheckCircle, AlertTriangle, MapPin, Gauge, Trash2 } from 'lucide-react';
import { useState } from 'react';
import CreateVehicleModal from '../components/fleet/CreateVehicleModal';
import VehicleDetailsModal from '../components/fleet/VehicleDetailsModal';

export default function Fleet({ vehicles, drivers, onAddVehicle, onUpdateVehicle, onDeleteVehicle }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedVehicle, setSelectedVehicle] = useState(null);

    // Calc stats
    const totalVehicles = vehicles?.length || 0;
    const activeVehicles = vehicles?.filter(v => v.status === 'Disponible' || v.status === 'En Ruta').length || 0;
    const maintenanceVehicles = vehicles?.filter(v => v.status === 'Mantenimiento').length || 0;

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6 relative">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-slate-800">Estado de la Flota</h2>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        + Nuevo Vehículo
                    </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-blue-200 p-3 rounded-full text-blue-700"><Truck /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{totalVehicles}</p>
                            <p className="text-sm text-slate-600">Total Vehículos</p>
                        </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-green-200 p-3 rounded-full text-green-700"><CheckCircle /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{activeVehicles}</p>
                            <p className="text-sm text-slate-600">Operativos</p>
                        </div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-amber-200 p-3 rounded-full text-amber-700"><AlertTriangle /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">{maintenanceVehicles}</p>
                            <p className="text-sm text-slate-600">En Taller</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(vehicles || []).map((truck) => {
                    const assignedDriver = (drivers || []).find(d => d.id === truck.assignedDriverId);

                    return (
                        <div
                            key={truck.id}
                            onClick={() => setSelectedVehicle(truck)}
                            className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                        >
                            <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50 group-hover:bg-blue-50/30 transition-colors relative">
                                <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation(); // Prevenir abrir el modal de detalles
                                            if (window.confirm(`¿Estás seguro de que quieres eliminar el vehículo ${truck.id}?`)) {
                                                onDeleteVehicle && onDeleteVehicle(truck.id);
                                            }
                                        }}
                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors bg-white shadow-sm border border-slate-100"
                                        title="Eliminar Vehículo"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center group-hover:border-blue-200 transition-colors">
                                        <Truck className="text-slate-500 group-hover:text-blue-600" size={20} />
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-slate-800">{truck.id}</h3>
                                        <p className="text-xs text-slate-500">{truck.model}</p>
                                    </div>
                                </div>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium mr-8 ${truck.status === 'En Ruta' ? 'bg-blue-100 text-blue-700' :
                                    truck.status === 'Disponible' ? 'bg-green-100 text-green-700' :
                                        'bg-amber-100 text-amber-700'
                                    }`}>
                                    {truck.status}
                                </span>
                            </div>

                            <div className="p-4 space-y-3">
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-2"><MapPin size={16} /> Ubicación</span>
                                    <span className="font-medium text-slate-700 text-right truncate max-w-[150px]">{truck.location}</span>
                                </div>
                                <div className="flex items-center justify-between text-sm">
                                    <span className="text-slate-500 flex items-center gap-2"><Gauge size={16} /> Combustible</span>
                                    <span className="font-medium text-slate-700">{truck.fuel}</span>
                                </div>
                                <div className="pt-2 mt-2 border-t border-slate-50">
                                    <p className="text-xs text-slate-400">Conductor Asignado</p>
                                    {assignedDriver ? (
                                        <div className="flex items-center gap-2 mt-1">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                                                {assignedDriver.name.charAt(0)}
                                            </div>
                                            <span className="text-sm font-medium text-slate-700">{assignedDriver.name}</span>
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-sm text-slate-400 italic">
                                            Ninguno
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>

            <CreateVehicleModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onAddVehicle}
            />

            <VehicleDetailsModal
                isOpen={!!selectedVehicle}
                onClose={() => setSelectedVehicle(null)}
                vehicle={selectedVehicle}
                drivers={drivers}
                onUpdateVehicle={onUpdateVehicle}
            />
        </div>
    );
}
