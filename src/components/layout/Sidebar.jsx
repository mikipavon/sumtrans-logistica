import { LayoutDashboard, Truck, Package, Settings, LogOut, Menu, Users, Map as MapIcon, Database, Tag, FileText, AlertTriangle, UserCheck, Wallet, Calculator, Fuel, Bell } from 'lucide-react';
import { useState, useRef } from 'react';

export default function Sidebar({ onLogout, currentView, onNavigate, pendingClientsCount = 0, pendingIncidentsCount = 0, irregularCount = 0, onSecretUnlock }) {
    const [collapsed, setCollapsed] = useState(false);
    const clickCountRef = useRef(0);
    const lastClickTimeRef = useRef(0);

    const handleSecretClick = () => {
        const now = Date.now();
        if (now - lastClickTimeRef.current > 3000) {
            clickCountRef.current = 0;
        }
        clickCountRef.current += 1;
        console.log('🔑 Secret click:', clickCountRef.current);
        if (clickCountRef.current >= 4) {
            console.log('🔓 Triggering unlock!');
            if (onSecretUnlock) onSecretUnlock();
            clickCountRef.current = 0;
        }
        lastClickTimeRef.current = now;
    };

    const sections = [
        {
            title: 'Gestión Central',
            items: [
                { id: 'dashboard', icon: LayoutDashboard, label: 'Panel Principal' },
                { id: 'notifications', icon: Bell, label: 'Notificaciones Albaranes', badge: irregularCount },
                { id: 'pending-collections', icon: Wallet, label: 'Cobros Pendientes' },
                { id: 'shipments', icon: Package, label: 'Envíos' },
                { id: 'incidents', icon: AlertTriangle, label: 'Incidencias', badge: pendingIncidentsCount },
                { id: 'clients', icon: Database, label: 'Clientes' },
                { id: 'clientValidation', icon: UserCheck, label: 'Validar Clientes', badge: pendingClientsCount },
                { id: 'articles', icon: Tag, label: 'Artículos y Tarifa' }
            ]
        },
        {
            title: 'Transportistas',
            items: [
                { id: 'drivers', icon: Users, label: 'Conductores' },
                { id: 'fleet', icon: Truck, label: 'Flota (Vehículos)' },
                { id: 'fuel', icon: Fuel, label: 'Control Combustible' },
                { id: 'tracking', icon: MapIcon, label: 'Mapa en Vivo' },
            ]
        },
        {
            title: 'Sistema',
            items: [
                { id: 'settings', icon: Settings, label: 'Configuración' },
            ]
        }
    ];

    return (
        <aside className={`bg-slate-900 border-r border-slate-800 text-white transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'} flex flex-col h-screen fixed left-0 top-0 shadow-xl z-50`}>
            {/* Header */}
            <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800 shrink-0 bg-slate-900">
                {!collapsed && (
                    <div className="flex items-center gap-3">
                        {/* Text Logo for Dark Mode compatibility */}
                        <div className="flex flex-col cursor-pointer select-none" onClick={handleSecretClick}>
                            <span className="font-extrabold text-xl tracking-tight text-white leading-none">SUM</span>
                            <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest leading-none mt-1">LOGÍSTICA</span>
                        </div>
                    </div>
                )}
                <button onClick={() => setCollapsed(!collapsed)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                    <Menu size={20} />
                </button>
            </div>

            {/* Navigation Sections */}
            <nav className="flex-1 py-6 px-3 space-y-8 overflow-y-auto custom-scrollbar">
                {sections.map((section, index) => (
                    <div key={index}>
                        {!collapsed && <h3 className="px-3 mb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">{section.title}</h3>}
                        <div className="space-y-1">
                            {section.items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all duration-200 group relative ${currentView === item.id
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }`}
                                >
                                    <item.icon size={20} className={`${currentView === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} transition-colors shrink-0`} />
                                    {!collapsed && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}

                                    {/* Badge for pending items */}
                                    {item.badge > 0 && !collapsed && (
                                        <span className="ml-auto bg-amber-500 shadow-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                            {item.badge}
                                        </span>
                                    )}
                                    {item.badge > 0 && collapsed && (
                                        <span className="absolute -top-1 -right-1 bg-amber-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                                            {item.badge}
                                        </span>
                                    )}

                                    {/* Tooltip for collapsed mode */}
                                    {collapsed && (
                                        <div className="absolute left-full ml-4 px-3 py-1.5 bg-slate-800 text-white font-medium text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50 shadow-xl">
                                            {item.label}
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                ))}
            </nav>

            {/* Footer */}
            <div className="p-4 border-t border-slate-800 shrink-0">
                <button onClick={onLogout} className="flex items-center gap-3 w-full px-3 py-3 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                    <LogOut size={20} />
                    {!collapsed && <span className="font-medium text-sm">Cerrar Sesión</span>}
                </button>
            </div>
        </aside>
    );
}
