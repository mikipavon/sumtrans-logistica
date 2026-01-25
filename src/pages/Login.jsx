import { useState } from 'react';
import { Truck, ArrowRight, Shield, User, Briefcase } from 'lucide-react';

export default function Login({ onLogin }) {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState('admin'); // 'admin', 'driver', 'client'

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulate login
        if (email && password) {
            onLogin(activeTab);
        }
    };

    const getTabConfig = () => {
        switch (activeTab) {
            case 'driver':
                return {
                    title: 'Acceso Conductores',
                    subtitle: 'Gestiona tus rutas y entregas.',
                    icon: Truck,
                    color: 'bg-amber-500',
                    ring: 'focus:ring-amber-200',
                    btn: 'hover:bg-amber-600',
                    btnBg: 'bg-amber-500'
                };
            case 'client':
                return {
                    title: 'Portal de Clientes',
                    subtitle: 'Realiza seguimiento de tus envíos.',
                    icon: User,
                    color: 'bg-emerald-500',
                    ring: 'focus:ring-emerald-200',
                    btn: 'hover:bg-emerald-600',
                    btnBg: 'bg-emerald-500'
                };
            default: // admin
                return {
                    title: 'Administración',
                    subtitle: 'Panel de control de logística.',
                    icon: Shield,
                    color: 'bg-blue-600',
                    ring: 'focus:ring-blue-200',
                    btn: 'hover:bg-blue-700',
                    btnBg: 'bg-blue-600'
                };
        }
    };

    const config = getTabConfig();
    const Icon = config.icon;

    return (
        <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl flex w-full max-w-4xl overflow-hidden min-h-[600px]">
                {/* Left Side - Form */}
                <div className="w-full md:w-1/2 p-12 flex flex-col justify-center">

                    {/* Brand Logo */}
                    <div className="flex justify-center mb-8">
                        <div className="p-4">
                            <img
                                src="/logo-sum.jpg"
                                alt="Transportes SUM"
                                className="h-24 w-auto object-contain hover:scale-105 transition-transform duration-500"
                            />
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex p-1 bg-slate-100 rounded-lg mb-8">
                        <button
                            onClick={() => setActiveTab('admin')}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${activeTab === 'admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Admin
                        </button>
                        <button
                            onClick={() => setActiveTab('driver')}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${activeTab === 'driver' ? 'bg-white text-amber-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Repartidor
                        </button>
                        <button
                            onClick={() => setActiveTab('client')}
                            className={`flex-1 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${activeTab === 'client' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            Cliente
                        </button>
                    </div>

                    <div className="mb-8">
                        <div className={`w-12 h-12 ${config.color} rounded-xl flex items-center justify-center text-white mb-4 transition-colors duration-300`}>
                            <Icon size={24} />
                        </div>
                        <h1 className="text-3xl font-bold text-slate-900 mb-2 transition-all duration-300">{config.title}</h1>
                        <p className="text-slate-500 transition-all duration-300">{config.subtitle}</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">
                                {activeTab === 'admin' ? 'Email Corporativo' : activeTab === 'driver' ? 'Usuario / ID' : 'Email de Contacto'}
                            </label>
                            <input
                                type={activeTab === 'driver' ? 'text' : 'email'}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className={`w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-transparent focus:ring-2 ${config.ring} outline-none transition-all`}
                                placeholder={activeTab === 'admin' ? "usuario@empresa.com" : activeTab === 'driver' ? "CONDUCTOR-ID" : "cliente@email.com"}
                                required
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`w-full px-4 py-3 rounded-lg border border-slate-200 focus:border-transparent focus:ring-2 ${config.ring} outline-none transition-all`}
                                placeholder="••••••••"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            className={`w-full ${config.btnBg} ${config.btn} text-white font-bold py-3.5 rounded-lg transition-colors flex items-center justify-center gap-2`}
                        >
                            Iniciar Sesión
                            <ArrowRight size={20} />
                        </button>
                    </form>

                    <p className="mt-8 text-center text-sm text-slate-400">
                        © 2024 Logistics Pro Platform
                    </p>
                </div>

                {/* Right Side - Image/Decoration */}
                <div className="hidden md:block w-1/2 bg-slate-900 relative">
                    <div className={`absolute inset-0 bg-gradient-to-br transition-colors duration-500 z-10 
                        ${activeTab === 'admin' ? 'from-blue-600/20 to-purple-600/20' :
                            activeTab === 'driver' ? 'from-amber-600/20 to-orange-600/20' :
                                'from-emerald-600/20 to-teal-600/20'}`}>
                    </div>
                    <img
                        src="https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?ixlib=rb-4.0.3&auto=format&fit=crop&w=2070&q=80"
                        alt="Logistics Warehouse"
                        className="absolute inset-0 w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-700"
                    />
                    <div className="absolute bottom-12 left-12 right-12 z-20 text-white">
                        <h2 className="text-2xl font-bold mb-4">Gestión Inteligente de Flotas</h2>
                        <p className="text-slate-300">Monitorea envíos en tiempo real, optimiza rutas y maximiza la eficiencia de tu operación logística.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
