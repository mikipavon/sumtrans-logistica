import { TrendingUp, Package, Truck, AlertCircle } from 'lucide-react';

export default function Dashboard() {
    const stats = [
        { title: 'Envíos Activos', value: '24', icon: Package, color: 'bg-blue-500', trend: '+12%' },
        { title: 'En Ruta', value: '18', icon: Truck, color: 'bg-green-500', trend: '+5%' },
        { title: 'Pendientes', value: '6', icon: AlertCircle, color: 'bg-amber-500', trend: '-2%' },
        { title: 'Ingresos (Mes)', value: '€45.2k', icon: TrendingUp, color: 'bg-indigo-500', trend: '+18%' },
    ];

    return (
        <div className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <div key={index} className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow">
                        <div className="flex items-center justify-between mb-4">
                            <div className={`${stat.color} p-3 rounded-lg text-white`}>
                                <stat.icon size={24} />
                            </div>
                            <span className={`text-sm font-medium ${stat.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'} bg-slate-50 px-2 py-1 rounded-full`}>
                                {stat.trend}
                            </span>
                        </div>
                        <h3 className="text-slate-500 text-sm font-medium mb-1">{stat.title}</h3>
                        <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Content Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Actividad Reciente</h3>
                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="flex items-center gap-4 p-3 hover:bg-slate-50 rounded-lg transition-colors border border-transparent hover:border-slate-100">
                                <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-slate-800">Envío #TR-{2024 + i} actualizado</p>
                                    <p className="text-xs text-slate-500">Hace {i * 15} minutos • Madrid → Barcelona</p>
                                </div>
                                <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">En Tránsito</span>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
                    <h3 className="text-lg font-bold text-slate-800 mb-4">Estado de Flota</h3>
                    <div className="space-y-4">
                        <div className="relative pt-1">
                            <div className="flex mb-2 items-center justify-between">
                                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-green-600 bg-green-200">
                                    Operativa
                                </span>
                                <span className="text-xs font-semibold inline-block text-green-600">
                                    85%
                                </span>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-100">
                                <div style={{ width: "85%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"></div>
                            </div>
                        </div>

                        <div className="relative pt-1">
                            <div className="flex mb-2 items-center justify-between">
                                <span className="text-xs font-semibold inline-block py-1 px-2 uppercase rounded-full text-amber-600 bg-amber-200">
                                    Mantenimiento
                                </span>
                                <span className="text-xs font-semibold inline-block text-amber-600">
                                    15%
                                </span>
                            </div>
                            <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-amber-100">
                                <div style={{ width: "15%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-amber-500"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
