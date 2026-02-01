import { LayoutDashboard, Truck, Package, Settings, LogOut, Menu, Users, Map, Database, Tag, FileText, AlertTriangle, UserCheck, Wallet } from 'lucide-react';
import { useState } from 'react';

export default function Sidebar({ onLogout, currentView, onNavigate, pendingClientsCount = 0 }) {
    const [collapsed, setCollapsed] = useState(false);

    const sections = [
        {
            title: 'Gestión Central',
            items: [
                { id: 'dashboard', icon: LayoutDashboard, label: 'Panel Principal' },
                { id: 'pending-collections', icon: Wallet, label: 'Cobros Pendientes' },
                { id: 'shipments', icon: Package, label: 'Envíos' },
                { id: 'incidents', icon: AlertTriangle, label: 'Incidencias' },
                { id: 'clients', icon: Database, label: 'Clientes / Ubicaciones' },
                { id: 'clientValidation', icon: UserCheck, label: 'Validar Clientes', badge: pendingClientsCount },
                { id: 'articles', icon: Tag, label: 'Artículos y Tarifa' },
            ]
        },
        {
            title: 'Transportistas',
            items: [
                { id: 'fleet', icon: Truck, label: 'Flota' },
                { id: 'drivers', icon: Users, label: 'Conductores' },
                { id: 'tracking', icon: Map, label: 'Mapa en Vivo' },
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
        <aside className={`bg-slate-900 text-white transition-all duration-300 ${collapsed ? 'w-20' : 'w-64'} flex flex-col h-screen fixed left-0 top-0 shadow-xl z-50`}>
            {/* Header */}
            <div className="h-20 flex items-center justify-between px-4 border-b border-slate-200 shrink-0 bg-white">
                {!collapsed && (
                    <div className="flex items-center gap-3">
                        <img
                            src="/logo-sum.jpg"
                            alt="Transportes SUM"
                            className="h-10 w-auto object-contain"
                        />
                    </div>
                )}
                <button onClick={() => setCollapsed(!collapsed)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-800 transition-colors">
                    <Menu size={20} />
                </button>
            </div>

            {/* Navigation Sections */}
            <nav className="flex-1 py-6 px-3 space-y-8 overflow-y-auto custom-scrollbar">
                {sections.map((section, index) => (
                    <div key={index}>
                        {!collapsed && <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">{section.title}</h3>}
                        <div className="space-y-1">
                            {section.items.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => onNavigate(item.id)}
                                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200 group relative ${currentView === item.id
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20'
                                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }`}
                                >
                                    <item.icon size={20} className={`${currentView === item.id ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'} transition-colors shrink-0`} />
                                    {!collapsed && <span className="font-medium text-sm whitespace-nowrap">{item.label}</span>}

                                    {/* Badge for pending items */}
                                    {item.badge > 0 && !collapsed && (
                                        <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
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
                                        <div className="absolute left-full ml-4 px-2 py-1 bg-slate-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
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
                <button onClick={onLogout} className="flex items-center gap-3 w-full px-3 py-3 rounded-lg text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-colors">
                    <LogOut size={20} />
                    {!collapsed && <span className="font-medium text-sm">Cerrar Sesión</span>}
                </button>
            </div>
        </aside>
    );
}
