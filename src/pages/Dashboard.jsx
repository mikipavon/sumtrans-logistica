import { TrendingUp, Package, Truck, AlertCircle, BarChart2, DollarSign, Activity, Clock, Filter, Calendar } from 'lucide-react';
import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export default function Dashboard({ onSync, isSyncing, shipments = [], clients = [], isGhostModeUnlocked = false, onNavigate }) {
    const normalize = (val) => String(val || '').toLowerCase().trim();
    
    const [timeGrouping, setTimeGrouping] = useState('days'); 
    const [dateRange, setDateRange] = useState('7'); 
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    
    const [showFacturacion, setShowFacturacion] = useState(true);
    const [showHabituales, setShowHabituales] = useState(true);
    const [showPresupuestos, setShowPresupuestos] = useState(true);
    const [showTotal, setShowTotal] = useState(false);

    const clientsMap = useMemo(() => {
        const map = new Map();
        (clients || []).forEach(c => {
            const nameNorm = normalize(c.name);
            const legalNorm = normalize(c.legalName);
            if (nameNorm) map.set(nameNorm, c);
            if (legalNorm) map.set(legalNorm, c);
        });
        return map;
    }, [clients]);

    const parseShipmentDate = (s) => {
        if (s.createdAt) {
            const dStr = s.createdAt.split('T')[0];
            const [y, m, d] = dStr.split('-');
            return new Date(y, m - 1, d);
        }
        if (s.date && s.date.includes('-')) {
            const parts = s.date.split('-');
            if (parts[0].length === 4) return new Date(parts[0], parts[1]-1, parts[2]);
            return new Date(parts[2], parts[1]-1, parts[0]);
        }
        if (s.date && s.date.includes('/')) {
            const parts = s.date.split('/');
            return new Date(parts[2], parts[1]-1, parts[0]);
        }
        const d = new Date(s.date);
        if (!isNaN(d.getTime())) return d;
        return new Date();
    };

    const { startDate, endDate, filteredShipments } = useMemo(() => {
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        let start = new Date();
        start.setHours(0, 0, 0, 0);

        if (dateRange === 'custom' && customStart && customEnd) {
            const [sy, sm, sd] = customStart.split('-');
            start = new Date(sy, sm - 1, sd);
            const [ey, em, ed] = customEnd.split('-');
            today.setTime(new Date(ey, em - 1, ed).getTime());
            today.setHours(23, 59, 59, 999);
        } else if (dateRange !== 'all') {
            const daysToSubtract = parseInt(dateRange, 10) - 1;
            start.setDate(start.getDate() - daysToSubtract);
        } else {
            start = new Date(2023, 0, 1); // Fallback old date
            if (shipments.length > 0) {
                const earliest = shipments.reduce((min, s) => {
                    const dObj = new Date(s.createdAt || s.date || new Date());
                    return isNaN(dObj.getTime()) ? min : (dObj < min ? dObj : min);
                }, new Date());
                start = new Date(earliest);
                start.setHours(0, 0, 0, 0);
            }
        }

        const filtered = shipments.filter(s => {
            const sDate = parseShipmentDate(s);
            if (!sDate || isNaN(sDate.getTime())) return false;
            return sDate >= start && sDate <= today;
        });

        return { startDate: start, endDate: today, filteredShipments: filtered };
    }, [shipments, dateRange, customStart, customEnd]);

    const stats = useMemo(() => {
        // Status counts use ALL shipments (estado operativo actual, sin filtro de fecha)
        const allShipments = Array.isArray(shipments) ? shipments : [];
        const enReparto = allShipments.filter(s => s.status === 'En reparto').length;
        const entregados = allShipments.filter(s => s.status === 'Entregado').length;
        const pendientes = allShipments.filter(s => ['Pendiente', 'Asignado', 'Pendiente de asignar'].includes(s.status)).length;
        // Ingresos sí usa el periodo seleccionado
        const ingresosMes = filteredShipments.reduce((acc, s) => acc + (parseFloat(s.amount) || 0), 0);
        
        return [
            { title: 'En Reparto', value: enReparto.toString(), icon: Truck, color: 'bg-blue-500 dark:bg-blue-600', trend: '', filterKey: 'En reparto' },
            { title: 'Entregados', value: entregados.toString(), icon: Package, color: 'bg-emerald-500 dark:bg-emerald-600', trend: '', filterKey: 'Entregado' },
            { title: 'Pendientes', value: pendientes.toString(), icon: Clock, color: 'bg-amber-500 dark:bg-amber-600', trend: '', filterKey: 'Pendiente' },
            { title: 'Ingresos (Periodo)', value: `€${ingresosMes.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, icon: DollarSign, color: 'bg-indigo-500 dark:bg-indigo-600', trend: '', filterKey: null },
        ];
    }, [shipments, filteredShipments]);

    const revenueData = useMemo(() => {
        const buckets = new Map();
        let current = new Date(startDate);
        
        // Generate continuous buckets
        while (current <= endDate) {
            let key = '';
            let label = '';
            
            if (timeGrouping === 'days') {
                key = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
                label = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short' }).format(current);
                current.setDate(current.getDate() + 1);
            } else if (timeGrouping === 'months') {
                key = `${current.getFullYear()}-${current.getMonth()}`;
                label = new Intl.DateTimeFormat('es-ES', { month: 'short', year: 'numeric' }).format(current);
                current.setMonth(current.getMonth() + 1);
                current.setDate(1);
            } else if (timeGrouping === 'quarters') {
                const q = Math.floor(current.getMonth() / 3) + 1;
                key = `${current.getFullYear()}-Q${q}`;
                label = `Q${q} ${current.getFullYear()}`;
                current.setMonth(current.getMonth() + 3);
                current.setDate(1);
            } else if (timeGrouping === 'years') {
                key = `${current.getFullYear()}`;
                label = `${current.getFullYear()}`;
                current.setFullYear(current.getFullYear() + 1);
                current.setMonth(0);
                current.setDate(1);
            }
            
            if (!buckets.has(key)) {
                buckets.set(key, { name: label, ingresos: 0, habituales: 0, presupuestos: 0, total: 0 });
            }
        }

        // Populate buckets
        filteredShipments.forEach(s => {
            const sDate = parseShipmentDate(s);
            let key = '';
            
            if (timeGrouping === 'days') {
                key = `${sDate.getFullYear()}-${String(sDate.getMonth()+1).padStart(2,'0')}-${String(sDate.getDate()).padStart(2,'0')}`;
            } else if (timeGrouping === 'months') {
                key = `${sDate.getFullYear()}-${sDate.getMonth()}`;
            } else if (timeGrouping === 'quarters') {
                const q = Math.floor(sDate.getMonth() / 3) + 1;
                key = `${sDate.getFullYear()}-Q${q}`;
            } else if (timeGrouping === 'years') {
                key = `${sDate.getFullYear()}`;
            }

            const bucket = buckets.get(key);
            if (bucket) {
                const amount = parseFloat(s.amount) || 0;
                
                const remitente = clientsMap.get(normalize(s.client));
                const destinatario = clientsMap.get(normalize(s.destinationName || s.client));
                
                const mainBillingType = normalize(s.billingType || (remitente ? remitente.billingType : ''));
                const destBillingType = normalize(s.destinationBillingType || (destinatario ? destinatario.billingType : ''));
                
                const isPresupuesto = mainBillingType.includes('presupuesto') || destBillingType.includes('presupuesto');
                const isHabitual = ['habitual', 'diar', 'libre', 'contado'].some(t => mainBillingType.includes(t) || destBillingType.includes(t));
                
                if (isPresupuesto) {
                    bucket.presupuestos += amount;
                } else if (isHabitual) {
                    bucket.habituales += amount;
                } else {
                    bucket.ingresos += amount; // Facturación Normal
                }
                bucket.total += amount;
            }
        });

        return Array.from(buckets.values());
    }, [filteredShipments, clientsMap, timeGrouping, startDate, endDate]);

    const loadMargins = useMemo(() => {
        let heavyShipments = 0;
        let lightShipments = 0;

        filteredShipments.forEach(s => {
            let isHeavy = false;
            
            // 1. Verificar si contiene palets
            if (Array.isArray(s.articles)) {
                isHeavy = s.articles.some(art => {
                    const name = (art.name || '').toLowerCase();
                    const unit = (art.unit || '').toLowerCase();
                    return name.includes('palet') || unit.includes('palet');
                });
            }
            
            // 2. Si no es palet, verificar si es un bulto de más de 50kg
            if (!isHeavy) {
                const numPackages = s.packages ? parseInt(s.packages) : (s.articles?.length || 1);
                if (s.weightKg && s.weightKg >= 50 && numPackages === 1) {
                    isHeavy = true;
                }
            }

            if (isHeavy) {
                heavyShipments += 1;
            } else {
                lightShipments += 1;
            }
        });

        const total = Math.max(heavyShipments + lightShipments, 1);
        
        return {
            heavyShipments,
            heavyPercent: Math.round((heavyShipments / total) * 100),
            lightShipments,
            lightPercent: Math.round((lightShipments / total) * 100)
        };
    }, [filteredShipments]);

    const alerts = [
        { id: 1, type: 'warning', title: 'Baja Rentabilidad en Ruta Norte', desc: 'El coste de combustible supera el margen en 15%.', time: 'Hace 2h' },
        { id: 2, type: 'danger', title: 'Exceso de Entregas Aplazadas', desc: 'El cliente Global Tech tiene 4 envíos pendientes recurrentes.', time: 'Hace 5h' },
        { id: 3, type: 'info', title: 'Pico de Volumen Previsto', desc: 'Se esperan +40 envíos a Zona Centro mañana.', time: 'Hace 1 día' },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {stats.map((stat, index) => (
                    <div
                        key={index}
                        onClick={() => {
                            if (stat.filterKey && onNavigate) {
                                onNavigate('shipments', stat.filterKey);
                            }
                        }}
                        className={`bg-white dark:bg-slate-800 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60 hover:shadow-lg hover:border-blue-500/30 transition-all group ${
                            stat.filterKey ? 'cursor-pointer active:scale-[0.97]' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <div className={`${stat.color} p-3 rounded-xl text-white shadow-sm group-hover:scale-110 transition-transform`}>
                                <stat.icon size={24} />
                            </div>
                            {stat.filterKey && (
                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">Ver →</span>
                            )}
                            {stat.trend && (
                            <span className={`text-sm font-bold ${stat.trend.startsWith('+') ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30' : 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30'} px-2.5 py-1 rounded-full`}>
                                {stat.trend}
                            </span>
                            )}
                        </div>
                        <h3 className="text-slate-500 dark:text-slate-400 text-sm font-bold mb-1 uppercase tracking-wider">{stat.title}</h3>
                        <p className="text-3xl font-bold text-slate-800 dark:text-white">{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts & Analytics Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* Main Chart */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60 p-6 flex flex-col">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
                                <Activity className="text-indigo-500" size={20} />
                                Evolución de Ingresos
                            </h3>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Análisis detallado de volúmenes de facturación</p>
                        </div>
                        
                        <div className="flex flex-col gap-2 w-full md:w-auto">
                            <div className="flex flex-wrap gap-2">
                                <select 
                                    value={timeGrouping} 
                                    onChange={(e) => setTimeGrouping(e.target.value)}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white cursor-pointer"
                                >
                                    <option value="days">Por Días</option>
                                    <option value="months">Por Meses</option>
                                    <option value="quarters">Por Trimestres</option>
                                    <option value="years">Por Años</option>
                                </select>
                                
                                <select 
                                    value={dateRange} 
                                    onChange={(e) => setDateRange(e.target.value)}
                                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm font-medium rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white cursor-pointer"
                                >
                                    <option value="7">Últimos 7 días</option>
                                    <option value="30">Últimos 30 días</option>
                                    <option value="90">Últimos 3 meses</option>
                                    <option value="180">Últimos 6 meses</option>
                                    <option value="365">Último Año</option>
                                    <option value="all">Todo el tiempo</option>
                                    <option value="custom">Rango personalizado...</option>
                                </select>
                            </div>
                            
                            {dateRange === 'custom' && (
                                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-lg border border-slate-200">
                                    <input 
                                        type="date" 
                                        value={customStart}
                                        onChange={e => setCustomStart(e.target.value)}
                                        className="text-xs p-1 bg-transparent border-b border-slate-300 outline-none" 
                                    />
                                    <span className="text-slate-400">-</span>
                                    <input 
                                        type="date" 
                                        value={customEnd}
                                        onChange={e => setCustomEnd(e.target.value)}
                                        className="text-xs p-1 bg-transparent border-b border-slate-300 outline-none" 
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                    
                    {/* Toggles Solo Visibles si Ghost Mode Desbloqueado */}
                    {isGhostModeUnlocked && (
                        <div className="flex flex-wrap items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-800">
                            <span className="text-xs font-bold text-slate-400 uppercase mr-2 flex items-center gap-1">
                                <Filter size={14} /> Mostrar Líneas:
                            </span>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={showFacturacion} onChange={e => setShowFacturacion(e.target.checked)} className="rounded text-indigo-500" />
                                <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">Facturación Normal</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={showHabituales} onChange={e => setShowHabituales(e.target.checked)} className="rounded text-emerald-500" />
                                <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Clientes Habituales</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={showPresupuestos} onChange={e => setShowPresupuestos(e.target.checked)} className="rounded text-amber-500" />
                                <span className="text-sm font-bold text-amber-600 dark:text-amber-400">Presupuestos</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer border-l border-slate-300 dark:border-slate-700 pl-3">
                                <input type="checkbox" checked={showTotal} onChange={e => setShowTotal(e.target.checked)} className="rounded text-purple-500" />
                                <span className="text-sm font-bold text-purple-600 dark:text-purple-400">Total General</span>
                            </label>
                        </div>
                    )}

                    <div className="flex-1 min-h-[300px] w-full mt-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={revenueData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                <defs>
                                    <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorCobros" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorPresupuestos" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                                    </linearGradient>
                                    <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="name" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `€${value}`} />
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" strokeOpacity={0.2} />
                                <Tooltip
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: 'var(--tooltip-bg, white)' }}
                                    formatter={(value) => [`€${value.toFixed(2)}`, ""]}
                                />
                                <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                                {(!isGhostModeUnlocked || showFacturacion) && (
                                    <Area type="monotone" dataKey="ingresos" name="Facturación" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorIngresos)" />
                                )}
                                {(isGhostModeUnlocked && showHabituales) && (
                                    <Area type="monotone" dataKey="habituales" name="Clientes Habituales" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorCobros)" />
                                )}
                                {(isGhostModeUnlocked && showPresupuestos) && (
                                    <Area type="monotone" dataKey="presupuestos" name="Presupuestos" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorPresupuestos)" />
                                )}
                                {(isGhostModeUnlocked && showTotal) && (
                                    <Area type="monotone" dataKey="total" name="Total General" stroke="#a855f7" strokeWidth={3} fillOpacity={1} fill="url(#colorTotal)" />
                                )}
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Profitability Alerts */}
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700/60 p-6 flex flex-col">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <AlertCircle className="text-amber-500" size={20} />
                        Alertas de Rentabilidad
                    </h3>

                    <div className="space-y-4 flex-1">
                        {alerts.map((alert) => (
                            <div key={alert.id} className={`p-4 rounded-xl border transition-colors hover:shadow-sm ${alert.type === 'warning' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-100 dark:border-amber-800/50' :
                                    alert.type === 'danger' ? 'bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-800/50' :
                                        'bg-blue-50 dark:bg-blue-900/10 border-blue-100 dark:border-blue-800/50'
                                }`}>
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className={`font-bold text-sm ${alert.type === 'warning' ? 'text-amber-800 dark:text-amber-300' :
                                            alert.type === 'danger' ? 'text-red-800 dark:text-red-300' :
                                                'text-blue-800 dark:text-blue-300'
                                        }`}>
                                        {alert.title}
                                    </h4>
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 bg-white/50 dark:bg-black/20 px-1.5 py-0.5 rounded">{alert.time}</span>
                                </div>
                                <p className={`text-xs mt-1 leading-relaxed ${alert.type === 'warning' ? 'text-amber-600 dark:text-amber-400/80' :
                                        alert.type === 'danger' ? 'text-red-600 dark:text-red-400/80' :
                                            'text-blue-600 dark:text-blue-400/80'
                                    }`}>
                                    {alert.desc}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-slate-100 dark:border-slate-700/50">
                        <h4 className="font-bold text-slate-700 dark:text-slate-300 text-sm mb-4">Márgenes por Tipo de Carga</h4>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className="font-medium text-slate-600 dark:text-slate-400">Carga Pesada / Paletizado</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{loadMargins.heavyShipments} Envíos ({loadMargins.heavyPercent}%)</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-2">
                                    <div className="bg-emerald-500 h-2 rounded-full relative transition-all duration-1000" style={{ width: `${Math.max(loadMargins.heavyPercent, 2)}%` }}>
                                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/30 rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs mb-1.5">
                                    <span className="font-medium text-slate-600 dark:text-slate-400">Paquetería / Mensajería</span>
                                    <span className="font-bold text-amber-600 dark:text-amber-400">{loadMargins.lightShipments} Envíos ({loadMargins.lightPercent}%)</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700/50 rounded-full h-2">
                                    <div className="bg-amber-500 h-2 rounded-full relative transition-all duration-1000" style={{ width: `${Math.max(loadMargins.lightPercent, 2)}%` }}>
                                        <div className="absolute right-0 top-0 bottom-0 w-2 bg-white/30 rounded-full"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
