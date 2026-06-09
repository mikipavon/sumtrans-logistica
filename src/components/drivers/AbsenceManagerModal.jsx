import { X, Calendar, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

export const ABSENCE_TYPES = [
    { value: 'Vacaciones',      label: 'Vacaciones',      emoji: '🏖️', color: 'bg-blue-500',   light: 'bg-blue-100 text-blue-700 border-blue-200'    },
    { value: 'Día Libre',       label: 'Día Libre',       emoji: '☀️',  color: 'bg-amber-500',  light: 'bg-amber-100 text-amber-700 border-amber-200'  },
    { value: 'Baja Médica',     label: 'Baja Médica',     emoji: '🏥',  color: 'bg-red-500',    light: 'bg-red-100 text-red-700 border-red-200'        },
    { value: 'Asuntos Propios', label: 'Asuntos Propios', emoji: '📋',  color: 'bg-purple-500', light: 'bg-purple-100 text-purple-700 border-purple-200'},
];

const VACATION_DAYS_PER_YEAR = 22;

export default function AbsenceManagerModal({ isOpen, onClose, driver, drivers }) {
    const [absences, setAbsences]         = useState([]);
    const [isLoading, setIsLoading]       = useState(false);
    const [selectedType, setSelectedType] = useState('Vacaciones');
    const [saving, setSaving]             = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [viewDate, setViewDate]         = useState(() => {
        const d = new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    });

    useEffect(() => {
        if (isOpen) {
            const initial = driver || (drivers && drivers[0]) || null;
            setSelectedDriver(initial);
        }
    }, [isOpen, driver]);

    useEffect(() => {
        if (isOpen && selectedDriver) fetchAbsences();
    }, [selectedDriver, viewDate.year, isOpen]);

    if (!isOpen) return null;

    // ── Data ──────────────────────────────────────────────────────────────────
    const fetchAbsences = async () => {
        if (!selectedDriver) return;
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('driver_absences')
                .select('*')
                .eq('driver_id', String(selectedDriver.id))
                .gte('date', `${viewDate.year}-01-01`)
                .lte('date', `${viewDate.year}-12-31`)
                .order('date', { ascending: true });
            if (error) throw error;
            setAbsences(data || []);
        } catch (e) {
            console.error('Error fetching absences:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleDay = async (dateStr) => {
        if (!selectedDriver || saving) return;
        setSaving(true);
        try {
            const existing = absences.find(a => a.date === dateStr);
            if (existing) {
                await supabase.from('driver_absences').delete().eq('id', existing.id);
                setAbsences(prev => prev.filter(a => a.id !== existing.id));
            } else {
                const { data, error } = await supabase
                    .from('driver_absences')
                    .insert([{
                        driver_id:   String(selectedDriver.id),
                        driver_name: selectedDriver.name || 'Conductor',
                        date:        dateStr,
                        type:        selectedType,
                        approved:    true,
                    }])
                    .select()
                    .single();
                if (error) throw error;
                setAbsences(prev => [...prev, data].sort((a, b) => a.date.localeCompare(b.date)));
            }
        } catch (e) {
            console.error('Error toggling absence:', e);
            const msg = e?.message || e?.error_description || e?.code || JSON.stringify(e);
            alert(`❌ Error Supabase:\n\n${msg}\n\nCódigo: ${e?.code || 'desconocido'}`);
        } finally {
            setSaving(false);
        }
    };

    const deleteAbsence = async (id) => {
        setSaving(true);
        try {
            await supabase.from('driver_absences').delete().eq('id', id);
            setAbsences(prev => prev.filter(a => a.id !== id));
        } finally {
            setSaving(false);
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getTypeConf = (type) => ABSENCE_TYPES.find(t => t.value === type) || ABSENCE_TYPES[0];

    const monthAbsences = absences.filter(a => {
        const d = new Date(a.date + 'T12:00:00');
        return d.getFullYear() === viewDate.year && d.getMonth() === viewDate.month;
    });

    const absenceMap = {};
    monthAbsences.forEach(a => { absenceMap[a.date] = a; });

    const vacDaysUsed  = absences.filter(a => a.type === 'Vacaciones').length;
    const vacRemaining = VACATION_DAYS_PER_YEAR - vacDaysUsed;

    // ── Calendar cells ────────────────────────────────────────────────────────
    const firstDay  = new Date(viewDate.year, viewDate.month, 1);
    const lastDay   = new Date(viewDate.year, viewDate.month + 1, 0);
    const startDow  = (firstDay.getDay() + 6) % 7; // Monday = 0
    const cells     = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

    const today    = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const monthLabel = new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const prevMonth = () => setViewDate(p => p.month === 0  ? { year: p.year - 1, month: 11 } : { ...p, month: p.month - 1 });
    const nextMonth = () => setViewDate(p => p.month === 11 ? { year: p.year + 1, month: 0  } : { ...p, month: p.month + 1 });

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                            <Calendar size={20} />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Gestión de Ausencias</h3>
                            <p className="text-xs text-slate-500">Vacaciones · Libranzas · Bajas · Asuntos Propios</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors p-1 rounded-lg hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Driver selector */}
                    {!driver && drivers && drivers.length > 1 && (
                        <div>
                            <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Conductor</label>
                            <select
                                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                value={selectedDriver?.id || ''}
                                onChange={e => setSelectedDriver(drivers.find(d => String(d.id) === e.target.value) || null)}
                            >
                                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                        </div>
                    )}

                    {/* Vacation counter */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 text-center">
                            <p className="text-2xl font-black text-blue-600">{vacDaysUsed}</p>
                            <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mt-0.5">Vacaciones usadas</p>
                        </div>
                        <div className={`rounded-xl p-3 border text-center ${vacRemaining >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                            <p className={`text-2xl font-black ${vacRemaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Math.max(0, vacRemaining)}</p>
                            <p className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${vacRemaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Días restantes</p>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                            <p className="text-2xl font-black text-slate-600">{VACATION_DAYS_PER_YEAR}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Total año {viewDate.year}</p>
                        </div>
                    </div>

                    {/* Type selector */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tipo de ausencia a marcar</label>
                        <div className="grid grid-cols-2 gap-2">
                            {ABSENCE_TYPES.map(type => (
                                <button
                                    key={type.value}
                                    onClick={() => setSelectedType(type.value)}
                                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-bold transition-all ${
                                        selectedType === type.value
                                            ? `${type.light} ring-2 ring-offset-1`
                                            : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                                >
                                    <span className="text-base">{type.emoji}</span>
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Calendar */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-slate-700">
                                <ChevronLeft size={18} />
                            </button>
                            <p className="font-bold text-slate-700 capitalize text-sm">{monthLabel}</p>
                            <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg transition-colors text-slate-500 hover:text-slate-700">
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                                <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">{d}</div>
                            ))}
                        </div>

                        {isLoading ? (
                            <div className="text-center py-8 text-slate-400 text-sm animate-pulse">Cargando...</div>
                        ) : (
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((day, idx) => {
                                    if (!day) return <div key={idx} />;
                                    const dateStr  = `${viewDate.year}-${String(viewDate.month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    const absence  = absenceMap[dateStr];
                                    const isToday  = dateStr === todayStr;
                                    const weekday  = new Date(viewDate.year, viewDate.month, day).getDay();
                                    const isWeekend = weekday === 0 || weekday === 6;
                                    const tc       = absence ? getTypeConf(absence.type) : null;

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => toggleDay(dateStr)}
                                            disabled={saving}
                                            title={absence ? `${absence.type} — pulsa para quitar` : `Marcar como ${selectedType}`}
                                            className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all select-none
                                                ${absence
                                                    ? `${tc.color} text-white shadow-sm scale-95 hover:scale-100`
                                                    : isWeekend
                                                        ? 'bg-slate-200/60 text-slate-400 hover:bg-slate-300/60'
                                                        : 'bg-white text-slate-700 hover:bg-blue-50 hover:text-blue-700 shadow-sm'}
                                                ${isToday && !absence ? 'ring-2 ring-blue-400 ring-offset-1' : ''}
                                                ${saving ? 'opacity-50 cursor-wait' : 'cursor-pointer'}
                                            `}
                                        >
                                            {day}
                                            {absence && <span className="text-[8px] leading-none mt-0.5 opacity-90">{tc.emoji}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        <p className="text-[10px] text-slate-400 mt-3 text-center">
                            Pulsa en un día para marcarlo/desmarcarlo · Los fines de semana están atenuados
                        </p>
                    </div>

                    {/* Month absence list */}
                    {monthAbsences.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 capitalize">Ausencias en {monthLabel}</p>
                            <div className="space-y-1.5">
                                {monthAbsences.map(a => {
                                    const conf  = getTypeConf(a.type);
                                    const label = new Date(a.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
                                    return (
                                        <div key={a.id} className={`flex items-center justify-between px-3 py-2 rounded-xl border ${conf.light}`}>
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">{conf.emoji}</span>
                                                <div>
                                                    <p className="text-xs font-bold capitalize">{label}</p>
                                                    <p className="text-[10px] opacity-60">{a.type}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => deleteAbsence(a.id)}
                                                className="p-1.5 hover:bg-red-100 rounded-lg text-current opacity-40 hover:opacity-100 hover:text-red-600 transition-all"
                                                title="Eliminar ausencia"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Legend */}
                    <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 flex items-start gap-2">
                        <span className="text-amber-500 mt-0.5">⚠️</span>
                        <p className="text-[11px] text-amber-700 leading-relaxed">
                            <strong>Las ausencias bloquean el fichaje automáticamente.</strong> El conductor verá un aviso
                            en su app ese día y no podrá iniciar jornada. Si es un error, elimina la ausencia desde aquí.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end shrink-0">
                    <button onClick={onClose} className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition-colors shadow-lg shadow-blue-600/20">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
