import Sidebar from './Sidebar';
import OfflineBanner from './OfflineBanner';
import { Bell, Moon, Sun, Package, Euro, AlertTriangle, Truck, X, CheckCheck, PlayCircle, StopCircle, RefreshCw } from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';

export default function Layout({ children, onLogout, currentView, onNavigate, pendingClientsCount, pendingIncidentsCount, irregularCount = 0, shipments = [], collections = [], incidents = [], vehicles = [], onSecretUnlock, isTestMode, setIsTestMode, onResetToZero, isOnline = true, justReconnected = false, pendingQueueCount = 0, isSyncingQueue = false }) {
    const [showNotifications, setShowNotifications] = useState(false);
    const [readIds, setReadIds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('readNotifIds') || '[]'); } catch { return []; }
    });
    const [isDarkMode, setIsDarkMode] = useState(() => {
        const saved = localStorage.getItem('darkMode');
        const initialValue = saved === 'true';
        if (initialValue) document.documentElement.classList.add('dark');
        return initialValue;
    });

    useEffect(() => {
        if (isDarkMode) {
            document.documentElement.classList.add('dark');
            try { localStorage.setItem('darkMode', 'true'); } catch (_) {}
        } else {
            document.documentElement.classList.remove('dark');
            try { localStorage.setItem('darkMode', 'false'); } catch (_) {}
        }
    }, [isDarkMode]);

    // --- Build Dynamic Notifications from real app data ---
    const notifications = useMemo(() => {
        const notifs = [];

        // 1. Envíos creados por clientes web que siguen sin asignar
        const clientWebPending = shipments.filter(s =>
            s.status === 'Pendiente de asignar' &&
            s.createdBy && s.createdBy.startsWith('ClienteWeb:')
        );
        if (clientWebPending.length > 0) {
            notifs.push({
                id: `client-web-${clientWebPending.length}`,
                icon: Package,
                iconBg: 'bg-blue-100 text-blue-600',
                title: `${clientWebPending.length} envío${clientWebPending.length > 1 ? 's' : ''} de cliente web sin asignar`,
                detail: clientWebPending.map(s => s.id).join(', '),
                time: 'Ahora',
                urgency: 'high',
                action: () => { onNavigate('shipments'); setShowNotifications(false); }
            });
        }

        // 2. Envíos genéricos pendientes de asignar (sin conductor)
        const genericPending = shipments.filter(s =>
            s.status === 'Pendiente de asignar' &&
            !(s.createdBy && s.createdBy.startsWith('ClienteWeb:'))
        );
        if (genericPending.length > 0) {
            notifs.push({
                id: `generic-pending-${genericPending.length}`,
                icon: Truck,
                iconBg: 'bg-amber-100 text-amber-600',
                title: `${genericPending.length} envío${genericPending.length > 1 ? 's' : ''} pendiente${genericPending.length > 1 ? 's' : ''} de asignar conductor`,
                detail: genericPending.slice(0, 3).map(s => s.id).join(', ') + (genericPending.length > 3 ? '...' : ''),
                time: 'Pendiente',
                urgency: 'medium',
                action: () => { onNavigate('shipments'); setShowNotifications(false); }
            });
        }

        // 3. Cobros pendientes (collections sin liquidar)
        const pendingCols = (collections || []).filter(c => !c.settled);
        if (pendingCols.length > 0) {
            const total = pendingCols.reduce((sum, c) => sum + parseFloat(c.amount || 0), 0);
            notifs.push({
                id: `collections-${pendingCols.length}`,
                icon: Euro,
                iconBg: 'bg-emerald-100 text-emerald-600',
                title: `${pendingCols.length} cobro${pendingCols.length > 1 ? 's' : ''} pendiente${pendingCols.length > 1 ? 's' : ''} de liquidar`,
                detail: `Total acumulado: €${total.toFixed(2)}`,
                time: 'Revisar',
                urgency: 'medium',
                action: () => { onNavigate('pending-collections'); setShowNotifications(false); }
            });
        }

        // 4. Incidencias abiertas
        const openIncidents = shipments.filter(s => s.incidentStatus === 'active' || s.status === 'Incidencia');
        if (openIncidents.length > 0) {
            notifs.push({
                id: `incidents-${openIncidents.length}`,
                icon: AlertTriangle,
                iconBg: 'bg-red-100 text-red-600',
                title: `${openIncidents.length} incidencia${openIncidents.length > 1 ? 's' : ''} abierta${openIncidents.length > 1 ? 's' : ''}`,
                detail: openIncidents.slice(0, 2).map(s => s.id).join(', ') + (openIncidents.length > 2 ? '...' : ''),
                time: 'Urgente',
                urgency: 'critical',
                action: () => { onNavigate('incidents'); setShowNotifications(false); }
            });
        }

        // 5. Clientes web pendientes de validar
        if (pendingClientsCount > 0) {
            notifs.push({
                id: `client-validation-${pendingClientsCount}`,
                icon: Package,
                iconBg: 'bg-purple-100 text-purple-600',
                title: `${pendingClientsCount} cliente${pendingClientsCount > 1 ? 's' : ''} nuevo${pendingClientsCount > 1 ? 's' : ''} por validar`,
                detail: 'Accede a Gestión → Validar Clientes',
                time: 'Nuevo',
                urgency: 'low',
                action: () => { onNavigate('clientValidation'); setShowNotifications(false); }
            });
        }

        // 6. Documentos de flota caducados o próximos a vencer
        const today = new Date();
        const expiredDocs = [];
        const warnDocs = [];
        (vehicles || []).forEach(v => {
            (v.documents || []).forEach(doc => {
                if (!doc.expiryDate) return;
                const exp = new Date(doc.expiryDate);
                const diffDays = Math.ceil((exp - today) / (1000 * 60 * 60 * 24));
                if (diffDays < 0) expiredDocs.push({ vehicle: v.id, docType: doc.docType || doc.name, days: diffDays });
                else if (diffDays <= 30) warnDocs.push({ vehicle: v.id, docType: doc.docType || doc.name, days: diffDays });
            });
        });
        if (expiredDocs.length > 0) {
            notifs.push({
                id: `fleet-expired-${expiredDocs.map(d=>d.vehicle+d.docType).join()}`,
                icon: AlertTriangle,
                iconBg: 'bg-red-100 text-red-600',
                title: `${expiredDocs.length} documento${expiredDocs.length > 1 ? 's' : ''} de flota VENCIDO${expiredDocs.length > 1 ? 'S' : ''}`,
                detail: expiredDocs.map(d => `${d.vehicle}: ${d.docType}`).join(' · '),
                time: 'URGENTE',
                urgency: 'critical',
                action: () => { onNavigate('fleet'); setShowNotifications(false); }
            });
        }
        if (warnDocs.length > 0) {
            notifs.push({
                id: `fleet-warn-${warnDocs.map(d=>d.vehicle+d.docType).join()}`,
                icon: AlertTriangle,
                iconBg: 'bg-amber-100 text-amber-600',
                title: `${warnDocs.length} documento${warnDocs.length > 1 ? 's' : ''} de flota vence${warnDocs.length > 1 ? 'n' : ''} pronto`,
                detail: warnDocs.map(d => `${d.vehicle}: ${d.docType} (${d.days}d)`).join(' · '),
                time: 'Atención',
                urgency: 'high',
                action: () => { onNavigate('fleet'); setShowNotifications(false); }
            });
        }

        // 7. Alertas de km de mantenimiento (aceite, correa, etc.)
        const kmOverdue = [];
        const kmWarn = [];
        (vehicles || []).forEach(v => {
            const odom = parseInt(v.currentOdometer || 0);
            if (!odom) return;
            (v.maintenanceLogs || []).forEach(log => {
                if (!log.alertAtKm) return;
                const alertKm = parseInt(log.alertAtKm);
                const remaining = alertKm - odom;
                const typeLabel = log.type || 'Mantenimiento';
                if (remaining <= 0) kmOverdue.push({ vehicle: v.id, type: typeLabel, remaining });
                else if (remaining <= 1000) kmWarn.push({ vehicle: v.id, type: typeLabel, remaining });
            });
        });
        if (kmOverdue.length > 0) {
            notifs.push({
                id: `km-overdue-${kmOverdue.map(d=>d.vehicle+d.type).join()}`,
                icon: AlertTriangle,
                iconBg: 'bg-red-100 text-red-600',
                title: `${kmOverdue.length} revisión${kmOverdue.length > 1 ? 'es' : ''} de flota superada${kmOverdue.length > 1 ? 's' : ''} en km`,
                detail: kmOverdue.map(d => `${d.vehicle}: ${d.type}`).join(' · '),
                time: '¡KM SUPERADOS!',
                urgency: 'critical',
                action: () => { onNavigate('fleet'); setShowNotifications(false); }
            });
        }
        if (kmWarn.length > 0) {
            notifs.push({
                id: `km-warn-${kmWarn.map(d=>d.vehicle+d.type).join()}`,
                icon: AlertTriangle,
                iconBg: 'bg-orange-100 text-orange-600',
                title: `${kmWarn.length} revisión${kmWarn.length > 1 ? 'es' : ''} de flota próxima${kmWarn.length > 1 ? 's' : ''} por km`,
                detail: kmWarn.map(d => `${d.vehicle}: ${d.type} (${d.remaining} km)`).join(' · '),
                time: 'Atención',
                urgency: 'high',
                action: () => { onNavigate('fleet'); setShowNotifications(false); }
            });
        }

        return notifs;
    }, [shipments, collections, incidents, vehicles, pendingClientsCount]);

    const unreadNotifs = notifications.filter(n => !readIds.includes(n.id));
    const unreadCount = unreadNotifs.length;

    const markAllRead = () => {
        const allIds = notifications.map(n => n.id);
        setReadIds(allIds);
        try { localStorage.setItem('readNotifIds', JSON.stringify(allIds)); } catch (_) {}
    };

    const urgencyBorder = (u) => {
        if (u === 'critical') return 'border-l-4 border-red-400';
        if (u === 'high') return 'border-l-4 border-blue-400';
        if (u === 'medium') return 'border-l-4 border-amber-400';
        return 'border-l-4 border-slate-200';
    };

    // Banner height offset so sticky header is not hidden underneath
    const bannerVisible = !isOnline || justReconnected;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors duration-300">
            {/* Offline / Reconnected Banner — fixed, above everything */}
            <OfflineBanner
                isOnline={isOnline}
                justReconnected={justReconnected}
                pendingCount={pendingQueueCount}
                isSyncing={isSyncingQueue}
            />
            <Sidebar onLogout={onLogout} currentView={currentView} onNavigate={onNavigate} pendingClientsCount={pendingClientsCount} pendingIncidentsCount={pendingIncidentsCount} irregularCount={irregularCount} onSecretUnlock={onSecretUnlock} />
            <div className="pl-64 transition-all duration-300">
                <header className={`h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky z-40 px-8 flex items-center justify-between shadow-sm transition-all duration-300 ${bannerVisible ? 'top-10' : 'top-0'}`}>
                    <h2 className="text-xl font-semibold text-slate-800 dark:text-white capitalize">
                        Panel de Control
                    </h2>
                    <div className="flex items-center gap-4">

                        {/* Contextual Test Mode Indicator & Reset */}
                        {isTestMode && (
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-amber-200 bg-amber-50 animate-in slide-in-from-right-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-amber-500 animate-pulse-amber"></div>
                                    <span className="text-[10px] font-bold text-amber-700 uppercase tracking-tight">Modo Pruebas</span>
                                </div>
                                <div className="w-px h-4 bg-amber-200 mx-1"></div>
                                <button 
                                    onClick={() => onResetToZero(true)}
                                    className="flex items-center gap-1.5 px-2 py-1 bg-white border border-amber-300 text-amber-600 rounded-lg hover:bg-amber-100 transition-colors shadow-sm text-[10px] font-bold"
                                    title="Borrar solo envíos de prueba"
                                >
                                    <Trash2 size={12} />
                                    Limpiar Tests
                                </button>
                            </div>
                        )}

                        {/* Dark Mode Toggle */}
                        <button
                            onClick={() => setIsDarkMode(!isDarkMode)}
                            className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
                            title="Alternar Modo Oscuro"
                        >
                            {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
                        </button>

                        {/* Notifications Bell */}
                        <div className="relative">
                            <button
                                onClick={() => setShowNotifications(!showNotifications)}
                                className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors relative"
                                title="Notificaciones"
                            >
                                <Bell size={20} className={unreadCount > 0 ? 'animate-[wiggle_1s_ease-in-out_infinite]' : ''} />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full border-2 border-white dark:border-slate-800 flex items-center justify-center px-0.5">
                                        {unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Dropdown Panel */}
                            {showNotifications && (
                                <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-200">
                                    {/* Header */}
                                    <div className="p-4 border-b border-slate-100 dark:border-slate-700 flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold text-slate-800 dark:text-white">Centro de Alertas</h3>
                                            {unreadCount > 0 && (
                                                <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-0.5 rounded-full">{unreadCount} nueva{unreadCount > 1 ? 's' : ''}</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {unreadCount > 0 && (
                                                <button onClick={markAllRead} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 font-bold hover:underline">
                                                    <CheckCheck size={14} /> Marcar leídas
                                                </button>
                                            )}
                                            <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                                                <X size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Notification List */}
                                    <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-50 dark:divide-slate-700/50">
                                        {notifications.length === 0 ? (
                                            <div className="p-10 text-center">
                                                <Bell size={32} className="mx-auto text-slate-200 dark:text-slate-600 mb-3" />
                                                <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Todo al día ✓</p>
                                                <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">No hay alertas pendientes</p>
                                            </div>
                                        ) : (
                                            notifications.map(notif => {
                                                const isUnread = !readIds.includes(notif.id);
                                                const Icon = notif.icon;
                                                return (
                                                    <button
                                                        key={notif.id}
                                                        onClick={notif.action}
                                                        className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${urgencyBorder(notif.urgency)} ${isUnread ? 'bg-blue-50/40 dark:bg-blue-900/10' : ''}`}
                                                    >
                                                        <div className="flex items-start gap-3">
                                                            <div className={`p-2 rounded-xl shrink-0 ${notif.iconBg}`}>
                                                                <Icon size={16} />
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-sm leading-snug ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-600 dark:text-slate-300'}`}>
                                                                    {notif.title}
                                                                </p>
                                                                {notif.detail && (
                                                                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{notif.detail}</p>
                                                                )}
                                                                <span className={`text-[10px] font-bold mt-1 block ${
                                                                    notif.urgency === 'critical' ? 'text-red-500' :
                                                                    notif.urgency === 'high' ? 'text-blue-500' :
                                                                    notif.urgency === 'medium' ? 'text-amber-500' : 'text-slate-400'
                                                                }`}>{notif.time}</span>
                                                            </div>
                                                            {isUnread && (
                                                                <div className="w-2 h-2 bg-blue-500 rounded-full mt-1.5 shrink-0"></div>
                                                            )}
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        )}
                                    </div>

                                    {notifications.length > 0 && (
                                        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-700 text-center">
                                            <p className="text-xs text-slate-400 dark:text-slate-500">Haz clic en cada alerta para ir directamente a la sección</p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center border border-slate-200 ml-2 overflow-hidden p-1.5 shadow-sm">
                            <img src="/logo-sum.svg" alt="SUM" className="w-full h-full object-contain" />
                        </div>
                    </div>
                </header>
                <main className="p-4 w-full max-w-none min-h-[calc(100vh-4rem)]">
                    {isTestMode && (
                        <div className="mb-4 bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
                           <div className="p-2 bg-amber-100 text-amber-600 rounded-lg">
                               <AlertTriangle size={18} />
                           </div>
                           <div className="flex-1">
                               <p className="text-sm font-bold text-amber-900">Estás en Modo Pruebas</p>
                               <p className="text-xs text-amber-700">Las ubicaciones GPS se guardan en los albaranes pero no afectan a las fichas reales de los clientes. Los envíos creados se marcarán como "Prueba".</p>
                           </div>
                        </div>
                    )}
                    {children}
                </main>
            </div>
        </div>
    );
}
