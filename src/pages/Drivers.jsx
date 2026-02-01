import { User, Phone, Star, Map, Clock, Truck } from 'lucide-react';
import { useState } from 'react';
import CreateDriverModal from '../components/drivers/CreateDriverModal';
import DriverProfileModal from '../components/drivers/DriverProfileModal';

export default function Drivers({ drivers, onAddDriver, shipments, onImpersonate }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-slate-800">Plantilla de Conductores</h2>
                <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                >
                    + Nuevo Conductor
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {(drivers || []).map((driver) => (
                    <div key={driver.id} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-4 relative group hover:border-blue-200 transition-colors">
                        <button
                            onClick={() => setSelectedDriver(driver)}
                            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors opacity-0 group-hover:opacity-100"
                            title="Ver Perfil Completo"
                        >
                            <User size={18} />
                        </button>
                        <div className="flex justify-between items-start">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                    {(driver.name || '?').charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">{driver.name}</h3>
                                    <div className="flex items-center gap-1 text-amber-500 text-sm">
                                        <Star size={14} fill="currentColor" />
                                        <span className="text-slate-600 font-medium">{driver.rating}</span>
                                    </div>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${driver.status === 'En Ruta' ? 'bg-blue-50 text-blue-600' :
                                driver.status === 'Descanso' ? 'bg-amber-50 text-amber-600' :
                                    'bg-slate-50 text-slate-600'
                                }`}>
                                {driver.status}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                            <div className="bg-slate-50 p-2 rounded-lg">
                                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Truck size={12} /> Vehículo Actual</p>
                                <p className="font-semibold text-slate-700">{driver.vehicle}</p>
                            </div>
                            <div className="bg-slate-50 p-2 rounded-lg">
                                <p className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Clock size={12} /> Antigüedad</p>
                                <p className="font-semibold text-slate-700">Desde {driver.since}</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                            <button className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-2 transition-colors">
                                <Phone size={16} /> Llamar
                            </button>
                            <button className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-2 transition-colors">
                                <Map size={16} /> Localizar
                            </button>
                            <button
                                onClick={() => onImpersonate && onImpersonate(driver.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-2 transition-colors bg-blue-50 px-3 py-1 rounded-lg"
                            >
                                <User size={16} /> Entrar
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <CreateDriverModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onAddDriver}
            />

            <DriverProfileModal
                isOpen={!!selectedDriver}
                onClose={() => setSelectedDriver(null)}
                driver={selectedDriver}
                shipments={shipments}
            />
        </div>
    );
}
