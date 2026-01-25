import { Truck, CheckCircle, AlertTriangle, MapPin, Gauge } from 'lucide-react';

export default function Fleet() {
    const trucks = [
        { id: 'V-8921-GZ', model: 'Volvo FH16', driver: 'Carlos Ruiz', status: 'En Ruta', location: 'A-6 km 45, Madrid', fuel: '78%', maintenance: 'OK' },
        { id: 'B-1234-XY', model: 'Scania R500', driver: 'Ana Garcia', status: 'Disponible', location: 'Base Central', fuel: '100%', maintenance: 'OK' },
        { id: 'M-5678-AB', model: 'Mercedes Actros', driver: 'Miguel Angel', status: 'Mantenimiento', location: 'Taller', fuel: '45%', maintenance: 'Warning' },
        { id: 'V-9999-BB', model: 'Iveco S-Way', driver: 'Jose Luis', status: 'En Ruta', location: 'AP-7, Valencia', fuel: '62%', maintenance: 'OK' },
    ];

    return (
        <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 mb-6">
                <h2 className="text-xl font-bold text-slate-800 mb-4">Estado de la Flota</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-blue-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-blue-200 p-3 rounded-full text-blue-700"><Truck /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">45</p>
                            <p className="text-sm text-slate-600">Total Vehículos</p>
                        </div>
                    </div>
                    <div className="bg-green-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-green-200 p-3 rounded-full text-green-700"><CheckCircle /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">38</p>
                            <p className="text-sm text-slate-600">Operativos</p>
                        </div>
                    </div>
                    <div className="bg-amber-50 p-4 rounded-lg flex items-center gap-4">
                        <div className="bg-amber-200 p-3 rounded-full text-amber-700"><AlertTriangle /></div>
                        <div>
                            <p className="text-2xl font-bold text-slate-800">7</p>
                            <p className="text-sm text-slate-600">En Taller</p>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {trucks.map((truck) => (
                    <div key={truck.id} className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden hover:shadow-md transition-shadow">
                        <div className="p-4 border-b border-slate-50 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center">
                                    <Truck className="text-slate-500" size={20} />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">{truck.id}</h3>
                                    <p className="text-xs text-slate-500">{truck.model}</p>
                                </div>
                            </div>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${truck.status === 'En Ruta' ? 'bg-blue-100 text-blue-700' :
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
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">
                                        {truck.driver.charAt(0)}
                                    </div>
                                    <span className="text-sm font-medium text-slate-700">{truck.driver}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
