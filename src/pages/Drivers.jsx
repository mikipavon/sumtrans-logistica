import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route, Settings } from 'lucide-react';
import { useState, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CreateDriverModal from '../components/drivers/CreateDriverModal';
import DriverProfileModal from '../components/drivers/DriverProfileModal';
import RoutesManagerModal from '../components/drivers/RoutesManagerModal';
import PayrollUploadModal from '../components/drivers/PayrollUploadModal';
import GpsAlertsModal from '../components/drivers/GpsAlertsModal';
import { FileText } from 'lucide-react';

function SortableDriverCard({ id, children, isManualSort }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id, disabled: !isManualSort });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 10 : 1,
        opacity: isDragging ? 0.8 : 1,
        cursor: isManualSort ? (isDragging ? 'grabbing' : 'grab') : 'default',
        height: '100%'
    };

    return (
        <div ref={setNodeRef} style={style} {...(isManualSort ? attributes : {})} {...(isManualSort ? listeners : {})}>
            {children}
        </div>
    );
}

export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder, gpsIntervalMinutes, setGpsIntervalMinutes, driverAlerts, setDriverAlerts }) {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isRoutesModalOpen, setIsRoutesModalOpen] = useState(false);
    const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'manual', direction: 'asc' });
    const [showInactive, setShowInactive] = useState(false);
  // Alert form state (Settings page)
  const [showNewAlertForm, setShowNewAlertForm] = useState(false);
  const [editingAlertId, setEditingAlertId] = useState(null);
  const [newAlertForm, setNewAlertForm] = useState({ title: '', message: '', icon: '🔔', dayOfWeek: undefined, timeFrom: '', timeTo: '', confirmText: '', targetDriverIds: [] });
  const [alertHistory, setAlertHistory] = useState([]);
  const [showAlertHistory, setShowAlertHistory] = useState(false);
  const [alertHistoryFilter, setAlertHistoryFilter] = useState('all'); // 'all' or driverId
    const [isGpsAlertsModalOpen, setIsGpsAlertsModalOpen] = useState(false);


    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = sortedDrivers.findIndex((d) => d.id === active.id);
            const newIndex = sortedDrivers.findIndex((d) => d.id === over.id);
            const newArray = arrayMove(sortedDrivers, oldIndex, newIndex);
            if (onUpdateDriverOrder) {
                onUpdateDriverOrder(newArray.map(d => d.id));
            }
        }
    };


    const driverStatsMap = useMemo(() => {
        const stats = {};
        // Initialize stats for each driver
        (drivers || []).forEach(d => {
            stats[d.id] = { total: 0, delivered: 0, rate: 0 };
        });

        // Single pass over shipments to aggregate stats
        (shipments || []).forEach(s => {
            const drvId = s.assignedDriverId;
            if (drvId && stats[drvId]) {
                stats[drvId].total++;
                if (s.status === 'Entregado') {
                    stats[drvId].delivered++;
                }
            }
        });

        // Calculate final rates
        Object.keys(stats).forEach(id => {
            const s = stats[id];
            s.rate = s.total > 0 ? Math.round((s.delivered / s.total) * 100) : 0;
        });

        return stats;
    }, [drivers, shipments]);

    const sortedDrivers = useMemo(() => {
        let result = [...(drivers || [])];
        if (!showInactive) {
            result = result.filter(d => d.isActive !== false);
        }
        if (sortConfig.key) {
            result.sort((a, b) => {
                if (sortConfig.key === 'manual') {
                    const idxA = driverOrder?.indexOf(a.id);
                    const idxB = driverOrder?.indexOf(b.id);
                    const valA = idxA !== -1 && idxA !== undefined ? idxA : 9999;
                    const valB = idxB !== -1 && idxB !== undefined ? idxB : 9999;
                    return valA - valB;
                }
                if (sortConfig.key === 'rate') {
                    const rA = driverStatsMap[a.id]?.rate || 0;
                    const rB = driverStatsMap[b.id]?.rate || 0;
                    return sortConfig.direction === 'asc' ? rA - rB : rB - rA;
                }
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];
                const sA = String(aVal || '').toLowerCase();
                const sB = String(bVal || '').toLowerCase();
                if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [drivers, sortConfig, driverStatsMap, driverOrder, showInactive]);


    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-4">
                    <h2 className="text-xl font-bold text-slate-800">Plantilla de Conductores</h2>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors">
                        <input 
                            type="checkbox" 
                            checked={showInactive} 
                            onChange={(e) => setShowInactive(e.target.checked)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span>Ver Inactivos</span>
                    </label>
                </div>
                <div className="flex gap-2">
                    <select
                        className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                        value={`${sortConfig.key}-${sortConfig.direction}`}
                        onChange={(e) => {
                            const [key, direction] = e.target.value.split('-');
                            setSortConfig({ key, direction });
                        }}
                    >
                        <option value="manual-asc">Orden Manual (Arrastrar)</option>
                        <option value="name-asc">Nombre (A-Z)</option>
                        <option value="name-desc">Nombre (Z-A)</option>
                        <option value="rate-desc">Mejor Rendimiento</option>
                        <option value="rate-asc">Menor Rendimiento</option>
                    </select>
                    <button
                        onClick={() => setIsCreateModalOpen(true)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                        + Nuevo Conductor
                    </button>
                    <button
                        onClick={() => setIsPayrollModalOpen(true)}
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                        title="Subir y asignar nóminas por lotes"
                    >
                        <FileText size={16} /> Subir Nóminas
                    </button>
                                        <button
                        onClick={() => setIsGpsAlertsModalOpen(true)}
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                        title="Configurar GPS y Alertas"
                    >
                        <Settings size={16} /> GPS / Alertas
                    </button>
<button
                        onClick={() => setIsRoutesModalOpen(true)}
                        className="bg-slate-100 text-slate-700 border border-slate-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-200 transition-colors flex items-center gap-2"
                        title="Administrar Rutas Maestras"
                    >
                        <MapIcon size={16} /> Rutas
                    </button>
                </div>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={sortedDrivers.map(d => d.id)} strategy={rectSortingStrategy}>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                        {(sortedDrivers || []).map((driver) => (
                            <SortableDriverCard key={driver.id} id={driver.id} isManualSort={sortConfig.key === 'manual'}>
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col gap-4 relative group hover:border-blue-200 transition-colors h-full">
                                    <div className="absolute top-4 right-4 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                                onClick={() => {
                                    if (window.confirm(`¿Estás seguro de que quieres eliminar a ${driver.name}? Esta acción no se puede deshacer.`)) {
                                        onDeleteDriver && onDeleteDriver(driver.id);
                                    }
                                }}
                                className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"
                                title="Eliminar Conductor"
                            >
                                <Trash2 size={18} />
                            </button>
                            <button
                                onClick={() => setSelectedDriver(driver)}
                                className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="Ver Perfil Completo"
                            >
                                <User size={18} />
                            </button>
                        </div>
                        <div className="flex justify-between items-start mt-2">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xl group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                    {(driver.name || '?').charAt(0)}
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-800">
                                        {driver.name} {driver.alias && <span className="text-slate-400 font-medium">({driver.alias})</span>}
                                    </h3>
                                    <div className="flex items-center gap-1 text-amber-500 text-sm">
                                        <Star size={14} fill="currentColor" />
                                        <span className="text-slate-600 font-medium">{driver.rating}</span>
                                    </div>
                                </div>
                            </div>
                            <span className={`mt-6 px-2 py-1 rounded-full text-xs font-semibold ${driver.status === 'En Ruta' ? 'bg-blue-50 text-blue-600' :
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

                        {/* Route Assignment */}
                        {(() => {
                            const driverRoute = routes.find(r => String(r.conductorId) === String(driver.id));
                            return driverRoute ? (
                                <div className="mt-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                    <Route size={13} className="text-blue-500 flex-shrink-0" />
                                    <span className="text-xs font-semibold text-blue-700 truncate">{driverRoute.nombre}</span>
                                    <span className="text-[10px] text-blue-400 ml-auto flex-shrink-0">
                                        {(driverRoute.poblacionesManana?.length || 0) + (driverRoute.poblacionesTarde?.length || 0)} pueblos
                                    </span>
                                </div>
                            ) : (
                                <div className="mt-2 bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-1.5 flex items-center gap-2">
                                    <Route size={13} className="text-slate-300" />
                                    <span className="text-xs text-slate-400 italic">Sin ruta asignada</span>
                                </div>
                            );
                        })()}

                        {/* Comparsion Mini-Bar */}
                        <div className="mt-2 text-xs">
                            <div className="flex justify-between text-slate-500 mb-1 items-center">
                                <span className="flex items-center gap-1"><CheckCircle size={12} className={driverStatsMap[driver.id]?.rate > 80 ? 'text-emerald-500' : 'text-slate-400'}/> Tasa de entrega</span>
                                <span className="font-bold text-slate-700">{driverStatsMap[driver.id]?.rate || 0}% ({driverStatsMap[driver.id]?.delivered || 0}/{driverStatsMap[driver.id]?.total || 0})</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-1.5">
                                <div
                                    className={`h-1.5 rounded-full transition-all ${driverStatsMap[driver.id]?.rate > 80 ? 'bg-emerald-500' : driverStatsMap[driver.id]?.rate > 50 ? 'bg-amber-400' : 'bg-red-400'}`}
                                    style={{ width: `${driverStatsMap[driver.id]?.rate || 0}%` }}
                                ></div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-slate-100 mt-auto">
                            <button className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-2 transition-colors">
                                <Phone size={16} /> Llamar
                            </button>
                            <button
                                onClick={() => onNavigate && onNavigate('tracking')}
                                className="text-slate-500 hover:text-blue-600 text-sm font-medium flex items-center gap-2 transition-colors"
                            >
                                <MapIcon size={16} /> Localizar
                            </button>
                            <button
                                onClick={() => onImpersonate && onImpersonate(driver.id)}
                                className="text-blue-600 hover:text-blue-800 text-sm font-bold flex items-center gap-2 transition-colors bg-blue-50 px-3 py-1 rounded-lg"
                            >
                                <User size={16} /> Entrar
                            </button>
                        </div>
                    </div>
                    </SortableDriverCard>
                ))}
            </div>
            </SortableContext>
            </DndContext>

            <CreateDriverModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onAddDriver}
            />

            <DriverProfileModal
                routes={routes}
                onUpdateRoutes={onUpdateRoutes}
                isOpen={!!selectedDriver}
                onClose={() => setSelectedDriver(null)}
                driver={selectedDriver}
                shipments={shipments}
                clients={clients}
                onUpdateDriver={onUpdateDriver}
                isGhostModeUnlocked={isGhostModeUnlocked}
            />

            <RoutesManagerModal
                isOpen={isRoutesModalOpen}
                onClose={() => setIsRoutesModalOpen(false)}
                routes={routes}
                onUpdateRoutes={onUpdateRoutes}
                drivers={drivers}
                routeKnowledge={routeKnowledge}
                onUpdateRouteKnowledge={onUpdateRouteKnowledge}
            />

            <PayrollUploadModal
                isOpen={isPayrollModalOpen}
                onClose={() => setIsPayrollModalOpen(false)}
                drivers={drivers}
                onUpdateDriver={onUpdateDriver}
            />
        </div>
    );
}
