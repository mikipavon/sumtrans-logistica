import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Plus, Trash2, Save, MapPin, Search, Sun, Moon, ChevronDown, ChevronUp, GripVertical, Brain, Copy, RotateCcw, Crown, ChevronRight, Clock } from 'lucide-react';
import {
    normalizarHorarioReparto,
    turnoQueSeRepartaAhora,
    minutosDeHora,
    horaDeMinutos,
    HORARIO_REPARTO_POR_DEFECTO,
    TURNO_TARDE,
} from '../../utils/turnos';
import { BAREMO_1_PUEBLOS, BAREMO_2_PUEBLOS } from '../../data/baremos';
import {
    contarPueblos,
    contarClientes,
    borrarAprendizaje,
    recuperarAprendizaje,
    eliminarDeLaPapelera,
} from '../../utils/routeKnowledge';
import { coincideEnCampos } from '../../utils/busqueda';

const ALL_TOWNS = [
    ...BAREMO_1_PUEBLOS.map(p => ({ ...p, baremoLabel: 'Baremo 1' })),
    ...BAREMO_2_PUEBLOS.map(p => ({ ...p, baremoLabel: 'Baremo 2' }))
].filter((town, index, self) => 
    index === self.findIndex(t => t.name.toLowerCase() === town.name.toLowerCase())
);

export default function RoutesManagerModal({ isOpen, onClose, routes = [], onUpdateRoutes, horarioReparto = null, onUpdateHorarioReparto, drivers = [], routeKnowledge = {}, onUpdateRouteKnowledge }) {
    const [localRoutes, setLocalRoutes] = useState([]);
    // Programador de turnos: se edita aquí y se guarda con "Guardar Rutas".
    const [localHorario, setLocalHorario] = useState({ ...HORARIO_REPARTO_POR_DEFECTO });
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRoute, setExpandedRoute] = useState(null);
    const [activeSlot, setActiveSlot] = useState(null);
    const [showKnowledge, setShowKnowledge] = useState(false);
    const [knowledgeRoute, setKnowledgeRoute] = useState(null); // route id
    const [copyFromDriver, setCopyFromDriver] = useState('');
    const [copyToDriver, setCopyToDriver] = useState('');
    const [borrarDriver, setBorrarDriver] = useState('');
    const dragItem = useRef(null);
    const dragOverItem = useRef(null);
    
    useEffect(() => {
        if (isOpen) {
            const initial = routes && routes.length > 0 ? routes : [];
            setLocalRoutes(JSON.parse(JSON.stringify(initial)));
            setLocalHorario(normalizarHorarioReparto(horarioReparto));
            setExpandedRoute(initial.length > 0 ? 0 : null);
            setActiveSlot(null);
            setSearchTerm('');
        }
    }, [isOpen, routes, horarioReparto]);

    const nombreDeConductor = (id) => drivers.find(d => String(d.id) === String(id))?.name || `Conductor ${id}`;
    const plural = (n, singular, plural_) => `${n} ${n === 1 ? singular : plural_}`;

    // Busca pueblo o CP ignorando tildes: "cordoba" encuentra "Priego de Córdoba"
    const filteredTowns = useMemo(
        () => ALL_TOWNS.filter(t => coincideEnCampos([t.name, t.zip], searchTerm)),
        [searchTerm]
    );

    const baremo1Towns = useMemo(() => filteredTowns.filter(t => t.baremo === 1), [filteredTowns]);
    const baremo2Towns = useMemo(() => filteredTowns.filter(t => t.baremo === 2), [filteredTowns]);

    // Track which towns are assigned to any route/slot
    const assignedTownsMap = useMemo(() => {
        const map = {};
        localRoutes.forEach((route, ri) => {
            (route.poblacionesManana || []).forEach(name => {
                const key = name.toLowerCase();
                if (!map[key]) map[key] = [];
                map[key].push({ routeIndex: ri, turno: 'manana', routeName: route.nombre });
            });
            (route.poblacionesTarde || []).forEach(name => {
                const key = name.toLowerCase();
                if (!map[key]) map[key] = [];
                map[key].push({ routeIndex: ri, turno: 'tarde', routeName: route.nombre });
            });
        });
        return map;
    }, [localRoutes]);

    const handleAddRoute = () => {
        const newRoute = {
            id: 'ruta-' + Date.now(),
            nombre: 'Nueva Ruta',
            conductorId: null,
            poblacionesManana: [],
            poblacionesTarde: []
        };
        const next = [...localRoutes, newRoute];
        setLocalRoutes(next);
        setExpandedRoute(next.length - 1);
        setActiveSlot({ routeIndex: next.length - 1, turno: 'manana' });
    };

    const handleRemoveRoute = (index) => {
        if (window.confirm('¿Eliminar esta ruta y todas sus asignaciones?')) {
            const next = [...localRoutes];
            next.splice(index, 1);
            setLocalRoutes(next);
            if (expandedRoute === index) setExpandedRoute(null);
            if (expandedRoute > index) setExpandedRoute(expandedRoute - 1);
            setActiveSlot(null);
        }
    };

    const handleUpdateRoute = (index, field, value) => {
        const next = [...localRoutes];
        next[index] = { ...next[index], [field]: value };
        setLocalRoutes(next);
    };

    const handleAddTown = (townName) => {
        if (!activeSlot) return;
        const { routeIndex, turno } = activeSlot;
        const field = turno === 'manana' ? 'poblacionesManana' : 'poblacionesTarde';
        const next = [...localRoutes];
        const current = [...(next[routeIndex][field] || [])];
        // Allow duplicates across routes but not within the same slot
        if (!current.some(n => n.toLowerCase() === townName.toLowerCase())) {
            current.push(townName);
            next[routeIndex] = { ...next[routeIndex], [field]: current };
            setLocalRoutes(next);
        }
    };

    const handleRemoveTown = (routeIndex, turno, townIndex) => {
        const field = turno === 'manana' ? 'poblacionesManana' : 'poblacionesTarde';
        const next = [...localRoutes];
        const current = [...(next[routeIndex][field] || [])];
        current.splice(townIndex, 1);
        next[routeIndex] = { ...next[routeIndex], [field]: current };
        setLocalRoutes(next);
    };

    const handleMoveTown = (routeIndex, turno, fromIndex, direction) => {
        const field = turno === 'manana' ? 'poblacionesManana' : 'poblacionesTarde';
        const next = [...localRoutes];
        const current = [...(next[routeIndex][field] || [])];
        const toIndex = fromIndex + direction;
        if (toIndex < 0 || toIndex >= current.length) return;
        [current[fromIndex], current[toIndex]] = [current[toIndex], current[fromIndex]];
        next[routeIndex] = { ...next[routeIndex], [field]: current };
        setLocalRoutes(next);
    };

    const handleDragStart = (routeIndex, turno, index) => {
        dragItem.current = { routeIndex, turno, index };
    };

    const handleDragEnter = (routeIndex, turno, index) => {
        dragOverItem.current = { routeIndex, turno, index };
    };

    const handleDragEnd = () => {
        if (!dragItem.current || !dragOverItem.current) { dragItem.current = null; dragOverItem.current = null; return; }
        const from = dragItem.current;
        const to = dragOverItem.current;
        // Only allow reorder within same slot
        if (from.routeIndex !== to.routeIndex || from.turno !== to.turno) { dragItem.current = null; dragOverItem.current = null; return; }
        if (from.index === to.index) { dragItem.current = null; dragOverItem.current = null; return; }
        const field = from.turno === 'manana' ? 'poblacionesManana' : 'poblacionesTarde';
        const next = [...localRoutes];
        const current = [...(next[from.routeIndex][field] || [])];
        const [movedItem] = current.splice(from.index, 1);
        current.splice(to.index, 0, movedItem);
        next[from.routeIndex] = { ...next[from.routeIndex], [field]: current };
        setLocalRoutes(next);
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const handleSave = () => {
        onUpdateRoutes(localRoutes);
        // El horario solo se sube si ha cambiado: así no se escribe una fila en la
        // nube (ni se avisa a todos los móviles) por guardar unos pueblos.
        const horarioLimpio = normalizarHorarioReparto(localHorario);
        const horarioActual = normalizarHorarioReparto(horarioReparto);
        if (onUpdateHorarioReparto &&
            (horarioLimpio.mananaDesde !== horarioActual.mananaDesde ||
             horarioLimpio.tardeDesde !== horarioActual.tardeDesde)) {
            onUpdateHorarioReparto(horarioLimpio);
        }
        onClose();
    };

    // El horario tal y como quedará guardado (con lo que no se entiende ya
    // sustituido por lo de fábrica) y lo que eso significa ahora mismo.
    const horarioEnLimpio = normalizarHorarioReparto(localHorario);
    const horarioInvalido =
        minutosDeHora(localHorario.mananaDesde) === null ||
        minutosDeHora(localHorario.tardeDesde) === null ||
        minutosDeHora(localHorario.mananaDesde) === minutosDeHora(localHorario.tardeDesde);
    const turnoAhora = turnoQueSeRepartaAhora(new Date(), horarioEnLimpio);
    const finDeVentana = (desde) => horaDeMinutos(minutosDeHora(desde) - 1);

    const getDriverName = (id) => {
        const d = drivers.find(d => d.id === id || String(d.id) === String(id));
        return d ? d.name : null;
    };

    if (!isOpen) return null;

    const isSlotActive = (ri, turno) => activeSlot?.routeIndex === ri && activeSlot?.turno === turno;

    const TownChip = ({ name, routeIndex, turno, index, total }) => (
        <div 
            draggable
            onDragStart={() => handleDragStart(routeIndex, turno, index)}
            onDragEnter={() => handleDragEnter(routeIndex, turno, index)}
            onDragEnd={handleDragEnd}
            onDragOver={(e) => e.preventDefault()}
            className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-lg px-1.5 py-1 text-xs font-semibold text-slate-700 group/chip hover:border-blue-300 transition-colors cursor-grab active:cursor-grabbing active:shadow-md active:scale-105 active:z-10"
        >
            <GripVertical size={10} className="text-slate-300 group-hover/chip:text-slate-500 shrink-0" />
            <span className="select-none">{name}</span>
            <button onClick={(e) => { e.stopPropagation(); handleRemoveTown(routeIndex, turno, index); }} className="p-0.5 text-slate-300 hover:text-red-500 shrink-0" title="Quitar">
                <X size={11} />
            </button>
        </div>
    );

    const TownSlot = ({ routeIndex, turno, label, icon, colorClass, borderColor }) => {
        const field = turno === 'manana' ? 'poblacionesManana' : 'poblacionesTarde';
        const towns = localRoutes[routeIndex]?.[field] || [];
        const active = isSlotActive(routeIndex, turno);

        return (
            <div 
                className={`rounded-xl p-3 cursor-pointer transition-all ${active ? `ring-2 ${borderColor} bg-white shadow-sm` : 'bg-slate-50 hover:bg-slate-100'}`}
                onClick={() => setActiveSlot({ routeIndex, turno })}
            >
                <div className="flex items-center gap-2 mb-2">
                    {icon}
                    <span className={`text-xs font-black uppercase tracking-wider ${colorClass}`}>{label}</span>
                    <span className="text-[10px] text-slate-400 font-medium">{towns.length} pueblos</span>
                    {active && <span className="ml-auto text-[9px] bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full font-bold animate-pulse">SELECCIONADO</span>}
                </div>
                <div className="flex flex-wrap gap-1.5 min-h-[32px]">
                    {towns.length === 0 ? (
                        <span className="text-xs text-slate-400 italic py-1">{active ? 'Pulsa un pueblo abajo para añadirlo' : 'Haz clic aquí y luego selecciona pueblos'}</span>
                    ) : (
                        towns.map((name, i) => (
                            <TownChip key={`${name}-${i}`} name={name} routeIndex={routeIndex} turno={turno} index={i} total={towns.length} />
                        ))
                    )}
                </div>
                {towns.length > 1 && <p className="text-[9px] text-slate-400 mt-1.5 italic">Arrastra los pueblos para cambiar el orden</p>}
            </div>
        );
    };

    const TownButton = ({ town }) => {
        const assignments = assignedTownsMap[town.name.toLowerCase()] || [];
        const isInActiveSlot = activeSlot && assignments.some(a => a.routeIndex === activeSlot.routeIndex && a.turno === activeSlot.turno);
        const usedCount = assignments.length;
        return (
            <button
                onClick={() => handleAddTown(town.name)}
                disabled={!activeSlot || isInActiveSlot}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                    isInActiveSlot
                        ? 'bg-emerald-50 text-emerald-400 border-emerald-200 cursor-not-allowed'
                        : !activeSlot
                        ? 'bg-slate-50 text-slate-400 border-slate-100 cursor-not-allowed'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 active:scale-95'
                }`}
                title={isInActiveSlot ? 'Ya en este turno' : usedCount > 0 ? `En ${usedCount} turno(s) - pulsa para añadir aquí también` : `Añadir ${town.name}`}
            >
                {town.name}
                {isInActiveSlot && <span className="ml-1 text-emerald-500">✓</span>}
                {usedCount > 0 && !isInActiveSlot && <span className="ml-1 text-[9px] text-blue-400 font-bold">{usedCount}</span>}
            </button>
        );
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[60] p-3 backdrop-blur-sm animate-in fade-in">
            <div className="bg-slate-50 rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ maxHeight: '92vh' }}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white rounded-t-2xl">
                    <div>
                        <h2 className="text-lg font-black flex items-center gap-2 text-slate-800">
                            <MapPin className="text-blue-600" size={20} />
                            Gestor de Rutas
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">Define qué pueblos visita cada conductor por la mañana y por la tarde</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
                    {/* Programador de turnos: desde qué hora manda cada orden al pulsar Optimizar */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3">
                        <div className="flex items-center gap-2 mb-2">
                            <Clock className="text-blue-600" size={16} />
                            <span className="text-sm font-bold text-slate-800">Programador de turnos</span>
                            <span className="text-[11px] text-slate-400">Qué orden usa el móvil al pulsar Optimizar, según la hora</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                <Sun size={14} className="text-amber-500" />
                                Orden de la mañana desde las
                                <input
                                    type="time"
                                    value={localHorario.mananaDesde}
                                    onChange={(e) => setLocalHorario(h => ({ ...h, mananaDesde: e.target.value }))}
                                    className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:border-blue-400"
                                />
                                <span className="text-slate-400 font-normal">hasta las {finDeVentana(horarioEnLimpio.tardeDesde)}</span>
                            </label>
                            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                <Moon size={14} className="text-indigo-500" />
                                Orden de la tarde desde las
                                <input
                                    type="time"
                                    value={localHorario.tardeDesde}
                                    onChange={(e) => setLocalHorario(h => ({ ...h, tardeDesde: e.target.value }))}
                                    className="border border-slate-200 rounded-lg px-2 py-1 text-sm font-mono focus:outline-none focus:border-blue-400"
                                />
                                <span className="text-slate-400 font-normal">hasta las {finDeVentana(horarioEnLimpio.mananaDesde)}</span>
                            </label>
                            <button
                                type="button"
                                onClick={() => setLocalHorario({ ...HORARIO_REPARTO_POR_DEFECTO })}
                                className="text-[11px] text-slate-500 hover:text-blue-600 underline underline-offset-2"
                                title={`Mañana desde las ${HORARIO_REPARTO_POR_DEFECTO.mananaDesde}, tarde desde las ${HORARIO_REPARTO_POR_DEFECTO.tardeDesde}`}
                            >
                                Volver a lo de fábrica
                            </button>
                        </div>
                        <p className={`text-[11px] mt-2 ${horarioInvalido ? 'text-red-600' : 'text-slate-500'}`}>
                            {horarioInvalido
                                ? `Las dos horas tienen que ser válidas y distintas. Se guardará: mañana desde las ${horarioEnLimpio.mananaDesde}, tarde desde las ${horarioEnLimpio.tardeDesde}.`
                                : `Ahora mismo, si un repartidor pulsa Optimizar, le sale primero el orden de la ${turnoAhora === TURNO_TARDE ? 'TARDE' : 'MAÑANA'}. Se guarda con "Guardar Rutas" y llega a los móviles al momento.`}
                        </p>
                    </div>

                    {/* Routes List */}
                    {localRoutes.map((route, i) => (
                        <div key={route.id} className={`bg-white rounded-xl border transition-all ${expandedRoute === i ? 'border-blue-200 shadow-md' : 'border-slate-200 shadow-sm'}`}>
                            {/* Route Header */}
                            <div 
                                className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 rounded-t-xl transition-colors"
                                onClick={() => { setExpandedRoute(expandedRoute === i ? null : i); if (expandedRoute !== i) setActiveSlot(null); }}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${expandedRoute === i ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                    {i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <input
                                        type="text"
                                        value={route.nombre}
                                        onChange={(e) => { e.stopPropagation(); handleUpdateRoute(i, 'nombre', e.target.value); }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="font-bold text-slate-800 bg-transparent border-none outline-none w-full text-sm focus:bg-blue-50 focus:px-2 rounded transition-all"
                                        placeholder="Nombre de la ruta..."
                                    />
                                </div>
                                <select
                                    value={route.conductorId != null ? String(route.conductorId) : ''}
                                    onChange={(e) => { e.stopPropagation(); handleUpdateRoute(i, 'conductorId', e.target.value || null); }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs font-semibold bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-400 min-w-[140px]"
                                >
                                    <option value="">Sin conductor</option>
                                    {drivers.filter(d => d.isActive !== false || String(d.id) === String(route.conductorId)).map(d => (
                                        <option key={d.id} value={String(d.id)}>{d.name}</option>
                                    ))}
                                </select>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <span>{(route.poblacionesManana || []).length + (route.poblacionesTarde || []).length} pueblos</span>
                                    {expandedRoute === i ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                </div>
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleRemoveRoute(i); }}
                                    className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>

                            {/* Route Body (expanded) */}
                            {expandedRoute === i && (
                                <div className="px-4 pb-4 space-y-2 border-t border-slate-100 pt-3">
                                    <TownSlot 
                                        routeIndex={i} turno="manana" label="Mañana" 
                                        icon={<Sun size={14} className="text-amber-500" />}
                                        colorClass="text-amber-600" borderColor="ring-amber-400"
                                    />
                                    <TownSlot 
                                        routeIndex={i} turno="tarde" label="Tarde" 
                                        icon={<Moon size={14} className="text-indigo-500" />}
                                        colorClass="text-indigo-600" borderColor="ring-indigo-400"
                                    />
                                </div>
                            )}
                        </div>
                    ))}

                    {/* Add Route Button */}
                    <button
                        onClick={handleAddRoute}
                        className="w-full py-3 border-2 border-dashed border-slate-300 rounded-xl text-slate-500 font-bold flex items-center justify-center gap-2 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/50 transition-all active:scale-[0.99]"
                    >
                        <Plus size={18} /> Nueva Ruta
                    </button>

                    {/* Towns Catalog */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 mt-2">
                        <div className="flex items-center gap-3 mb-3">
                            <h3 className="text-xs font-black text-slate-600 uppercase tracking-wider">Pueblos Disponibles</h3>
                            <div className="flex-1 relative">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Buscar pueblo o CP..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400/20"
                                />
                            </div>
                            {!activeSlot && (
                                <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-1 rounded-full font-bold">
                                    ⚠ Selecciona un turno arriba
                                </span>
                            )}
                        </div>

                        {baremo1Towns.length > 0 && (
                            <div className="mb-3">
                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    Baremo 1 — Córdoba / Subbética ({baremo1Towns.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {baremo1Towns.map(t => <TownButton key={t.name + t.zip} town={t} />)}
                                </div>
                            </div>
                        )}

                        {baremo2Towns.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black text-purple-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                    Baremo 2 — Estepa / Antequera ({baremo2Towns.length})
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {baremo2Towns.map(t => <TownButton key={t.name + t.zip} town={t} />)}
                                </div>
                            </div>
                        )}

                        {filteredTowns.length === 0 && (
                            <p className="text-xs text-slate-400 italic text-center py-4">No se encontraron pueblos con "{searchTerm}"</p>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-200 flex justify-between items-center bg-white rounded-b-2xl">
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{localRoutes.length} rutas definidas</span>
                        <button
                            onClick={() => setShowKnowledge(!showKnowledge)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg flex items-center gap-1.5 transition-colors ${
                                showKnowledge ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                            }`}
                        >
                            <Brain size={14} /> Conocimiento
                        </button>
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                            Cancelar
                        </button>
                        <button onClick={handleSave} className="px-5 py-2 text-sm font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 shadow-sm shadow-blue-200 active:scale-[0.97]">
                            <Save size={16} /> Guardar Rutas
                        </button>
                    </div>
                </div>

                {/* Knowledge Management Panel */}
                {showKnowledge && (
                    <div className="border-t border-amber-200 bg-amber-50/50 px-6 py-4 rounded-b-2xl">
                        <h4 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
                            <Brain size={16} /> Gestión del Conocimiento de Rutas
                        </h4>
                        <p className="text-xs text-amber-600 mb-4">
                            El sistema aprende el orden de entrega de cada conductor. Puedes copiar ese conocimiento a conductores nuevos o establecer el de un veterano como "maestro" de la ruta.
                        </p>

                        {/* Select route to manage */}
                        <div className="mb-4">
                            <label className="text-xs font-semibold text-slate-600 mb-1 block">Seleccionar Ruta:</label>
                            <div className="flex flex-wrap gap-2">
                                {localRoutes.map(r => {
                                    const master = routeKnowledge?.masterByRoute?.[r.id];
                                    return (
                                        <button
                                            key={r.id}
                                            onClick={() => setKnowledgeRoute(knowledgeRoute === r.id ? null : r.id)}
                                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                                                knowledgeRoute === r.id
                                                    ? 'bg-amber-500 text-white border-amber-600'
                                                    : 'bg-white border-slate-200 hover:border-amber-300'
                                            }`}
                                        >
                                            {r.nombre}
                                            {master && <Crown size={10} className="inline ml-1 text-yellow-300" />}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {knowledgeRoute && (() => {
                            const route = localRoutes.find(r => r.id === knowledgeRoute);
                            const master = routeKnowledge?.masterByRoute?.[knowledgeRoute];
                            const driversWithKnowledge = Object.entries(routeKnowledge?.byDriver || {})
                                .filter(([, data]) => Object.keys(data).length > 0)
                                .map(([dId]) => ({ id: dId, driver: drivers.find(d => String(d.id) === String(dId)) }))
                                .filter(x => x.driver);
                            const routeDriverId = route?.conductorId;
                            const routeDriver = drivers.find(d => String(d.id) === String(routeDriverId));

                            // Los mismos contadores que la papelera. Contando a mano se
                            // colaban `_setBy` y `_setAt` como si fueran pueblos, y como
                            // sus valores son texto, `Object.keys` de una fecha sumaba
                            // una veintena de "clientes" inventados.
                            const masterTownCount = contarPueblos(master);
                            const masterClientCount = contarClientes(master);

                            return (
                                <div className="space-y-4">
                                    {/* Master status */}
                                    <div className="bg-white rounded-xl p-3 border border-slate-200">
                                        <p className="text-xs font-bold text-slate-700 mb-2 flex items-center gap-1">
                                            <Crown size={14} className="text-yellow-500" /> Conocimiento Maestro
                                        </p>
                                        {master ? (
                                            <div className="text-xs text-slate-600">
                                                <p>📊 <strong>{masterTownCount}</strong> pueblos · <strong>{masterClientCount}</strong> clientes memorizados</p>
                                                {master._setBy && (
                                                    <p className="text-slate-400 mt-1">
                                                        Establecido por: {drivers.find(d => String(d.id) === String(master._setBy))?.name || master._setBy}
                                                        {master._setAt && ` · ${new Date(master._setAt).toLocaleDateString('es')}`}
                                                    </p>
                                                )}
                                            </div>
                                        ) : (
                                            <p className="text-xs text-slate-400 italic">Sin maestro definido. Selecciona un conductor experimentado.</p>
                                        )}
                                    </div>

                                    {/* Set as Master */}
                                    <div className="bg-white rounded-xl p-3 border border-slate-200">
                                        <p className="text-xs font-bold text-slate-700 mb-2">🏆 Establecer Maestro</p>
                                        <p className="text-xs text-slate-500 mb-2">El conocimiento de este conductor se usará como base para todos los nuevos.</p>
                                        <div className="flex gap-2 items-center">
                                            <select
                                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1"
                                                value={copyFromDriver}
                                                onChange={e => setCopyFromDriver(e.target.value)}
                                            >
                                                <option value="">Seleccionar conductor veterano...</option>
                                                {driversWithKnowledge.map(({ id, driver }) => (
                                                    <option key={id} value={id}>{driver.name}</option>
                                                ))}
                                                {routeDriver && !driversWithKnowledge.find(x => String(x.id) === String(routeDriverId)) && (
                                                    <option value={routeDriverId}>{routeDriver.name} (asignado)</option>
                                                )}
                                            </select>
                                            <button
                                                disabled={!copyFromDriver}
                                                onClick={() => {
                                                    const driverData = routeKnowledge?.byDriver?.[copyFromDriver];
                                                    if (!driverData || Object.keys(driverData).length === 0) {
                                                        alert('Este conductor aún no tiene datos de aprendizaje.');
                                                        return;
                                                    }
                                                    if (!confirm(`¿Establecer el conocimiento de ${drivers.find(d => String(d.id) === String(copyFromDriver))?.name} como maestro de "${route?.nombre}"?`)) return;
                                                    const updated = {
                                                        ...routeKnowledge,
                                                        masterByRoute: {
                                                            ...(routeKnowledge?.masterByRoute || {}),
                                                            [knowledgeRoute]: { ...driverData, _setBy: copyFromDriver, _setAt: new Date().toISOString() }
                                                        }
                                                    };
                                                    onUpdateRouteKnowledge(updated);
                                                    alert('✅ Maestro establecido correctamente.');
                                                }}
                                                className="px-3 py-2 text-xs font-bold bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                            >
                                                <Crown size={12} /> Establecer
                                            </button>
                                        </div>
                                    </div>

                                    {/* Copy knowledge */}
                                    <div className="bg-white rounded-xl p-3 border border-slate-200">
                                        <p className="text-xs font-bold text-slate-700 mb-2">📋 Copiar Conocimiento</p>
                                        <p className="text-xs text-slate-500 mb-2">Copia el aprendizaje de un conductor a otro directamente.</p>
                                        <div className="flex gap-2 items-center flex-wrap">
                                            <select
                                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[120px]"
                                                value={copyFromDriver}
                                                onChange={e => setCopyFromDriver(e.target.value)}
                                            >
                                                <option value="">De (origen)...</option>
                                                {driversWithKnowledge.map(({ id, driver }) => (
                                                    <option key={id} value={id}>{driver.name}</option>
                                                ))}
                                            </select>
                                            <ChevronRight size={14} className="text-slate-300" />
                                            <select
                                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1 min-w-[120px]"
                                                value={copyToDriver}
                                                onChange={e => setCopyToDriver(e.target.value)}
                                            >
                                                <option value="">A (destino)...</option>
                                                {drivers.filter(d => d.isActive !== false).map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                            <button
                                                disabled={!copyFromDriver || !copyToDriver || copyFromDriver === copyToDriver}
                                                onClick={() => {
                                                    const fromData = routeKnowledge?.byDriver?.[copyFromDriver];
                                                    if (!fromData) { alert('El conductor origen no tiene datos.'); return; }
                                                    const fromName = drivers.find(d => String(d.id) === String(copyFromDriver))?.name;
                                                    const toName = drivers.find(d => String(d.id) === String(copyToDriver))?.name;
                                                    if (!confirm(`¿Copiar conocimiento de ${fromName} → ${toName}?`)) return;
                                                    const updated = {
                                                        ...routeKnowledge,
                                                        byDriver: {
                                                            ...(routeKnowledge?.byDriver || {}),
                                                            [copyToDriver]: { ...fromData }
                                                        }
                                                    };
                                                    onUpdateRouteKnowledge(updated);
                                                    alert(`✅ Conocimiento copiado de ${fromName} a ${toName}.`);
                                                }}
                                                className="px-3 py-2 text-xs font-bold bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                            >
                                                <Copy size={12} /> Copiar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Reset to master */}
                                    {master && (
                                        <div className="bg-white rounded-xl p-3 border border-red-100">
                                            <p className="text-xs font-bold text-slate-700 mb-2">🔄 Resetear al Maestro</p>
                                            <p className="text-xs text-slate-500 mb-2">Devuelve el aprendizaje de un conductor al conocimiento maestro de esta ruta.</p>
                                            <div className="flex gap-2 items-center">
                                                <select
                                                    className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1"
                                                    value={copyToDriver}
                                                    onChange={e => setCopyToDriver(e.target.value)}
                                                >
                                                    <option value="">Seleccionar conductor...</option>
                                                    {drivers.filter(d => d.isActive !== false).map(d => (
                                                        <option key={d.id} value={d.id}>{d.name}</option>
                                                    ))}
                                                </select>
                                                <button
                                                    disabled={!copyToDriver}
                                                    onClick={() => {
                                                        const toName = drivers.find(d => String(d.id) === String(copyToDriver))?.name;
                                                        if (!confirm(`¿Resetear ${toName} al conocimiento maestro de "${route?.nombre}"?`)) return;
                                                        const { _setBy, _setAt, ...masterData } = master;
                                                        const updated = {
                                                            ...routeKnowledge,
                                                            byDriver: {
                                                                ...(routeKnowledge?.byDriver || {}),
                                                                [copyToDriver]: { ...masterData }
                                                            }
                                                        };
                                                        onUpdateRouteKnowledge(updated);
                                                        alert(`✅ ${toName} reseteado al maestro.`);
                                                    }}
                                                    className="px-3 py-2 text-xs font-bold bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                                >
                                                    <RotateCcw size={12} /> Resetear
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Borrar aprendizaje */}
                                    <div className="bg-white rounded-xl p-3 border border-red-100">
                                        <p className="text-xs font-bold text-slate-700 mb-2">🗑️ Borrar Aprendizaje</p>
                                        <p className="text-xs text-slate-500 mb-2">
                                            Deja a cero el aprendizaje del conductor, también en su móvil. Se guarda una copia en la papelera por si te arrepientes.
                                        </p>
                                        <div className="flex gap-2 items-center">
                                            <select
                                                className="text-xs border border-slate-200 rounded-lg px-3 py-2 flex-1"
                                                value={borrarDriver}
                                                onChange={e => setBorrarDriver(e.target.value)}
                                            >
                                                <option value="">Seleccionar conductor...</option>
                                                {driversWithKnowledge.map(({ id, driver }) => (
                                                    <option key={id} value={id}>
                                                        {driver.name} ({plural(contarPueblos(routeKnowledge?.byDriver?.[id]), 'pueblo', 'pueblos')})
                                                    </option>
                                                ))}
                                            </select>
                                            <button
                                                disabled={!borrarDriver}
                                                onClick={() => {
                                                    const datos = routeKnowledge?.byDriver?.[borrarDriver];
                                                    if (!datos || Object.keys(datos).length === 0) {
                                                        alert('Este conductor no tiene aprendizaje que borrar.');
                                                        return;
                                                    }
                                                    const nombre = nombreDeConductor(borrarDriver);
                                                    if (!confirm(
                                                        `¿Borrar el aprendizaje de ${nombre}?\n\n` +
                                                        `Se perderán ${plural(contarPueblos(datos), 'pueblo', 'pueblos')} y ${plural(contarClientes(datos), 'cliente', 'clientes')} memorizados.\n` +
                                                        `Podrás recuperarlo desde la papelera.`
                                                    )) return;

                                                    // Sin fusionar: es una orden, no una sincronización
                                                    onUpdateRouteKnowledge(borrarAprendizaje(routeKnowledge, borrarDriver), { fusionar: false });
                                                    setBorrarDriver('');
                                                    alert(`🗑️ Aprendizaje de ${nombre} borrado. Está en la papelera.`);
                                                }}
                                                className="px-3 py-2 text-xs font-bold bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                                            >
                                                <Trash2 size={12} /> Borrar
                                            </button>
                                        </div>
                                    </div>

                                    {/* Papelera */}
                                    {Object.keys(routeKnowledge?.trashByDriver || {}).length > 0 && (
                                        <div className="bg-white rounded-xl p-3 border border-slate-200">
                                            <p className="text-xs font-bold text-slate-700 mb-2">♻️ Papelera</p>
                                            <p className="text-xs text-slate-500 mb-2">Aprendizajes borrados. Recuperarlos los devuelve al conductor tal y como estaban.</p>
                                            <div className="space-y-2">
                                                {Object.entries(routeKnowledge.trashByDriver).map(([id, entrada]) => (
                                                    <div key={id} className="flex items-center gap-2 bg-slate-50 rounded-lg p-2 border border-slate-100">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-xs font-bold text-slate-700 truncate">{nombreDeConductor(id)}</p>
                                                            <p className="text-[10px] text-slate-400">
                                                                {plural(contarPueblos(entrada?.datos), 'pueblo', 'pueblos')} · {plural(contarClientes(entrada?.datos), 'cliente', 'clientes')}
                                                                {entrada?.borradoEl && ` · borrado el ${new Date(entrada.borradoEl).toLocaleDateString('es')}`}
                                                            </p>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                const nombre = nombreDeConductor(id);
                                                                if (!confirm(`¿Devolver a ${nombre} el aprendizaje borrado?\n\nSustituirá a lo que haya aprendido desde entonces.`)) return;
                                                                onUpdateRouteKnowledge(recuperarAprendizaje(routeKnowledge, id), { fusionar: false });
                                                                alert(`♻️ Aprendizaje de ${nombre} recuperado.`);
                                                            }}
                                                            className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-1 whitespace-nowrap"
                                                        >
                                                            <RotateCcw size={12} /> Recuperar
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                const nombre = nombreDeConductor(id);
                                                                if (!confirm(`¿Eliminar definitivamente el aprendizaje de ${nombre}?\n\nEsto ya no tiene vuelta atrás.`)) return;
                                                                onUpdateRouteKnowledge(eliminarDeLaPapelera(routeKnowledge, id), { fusionar: false });
                                                            }}
                                                            title="Eliminar definitivamente"
                                                            className="p-1.5 text-slate-300 hover:text-red-500 transition-colors"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>
        </div>
    );
}
