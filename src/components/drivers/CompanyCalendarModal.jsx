import { X, Calendar, ChevronLeft, ChevronRight, Trash2, Plus } from 'lucide-react';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const SETTINGS_KEY = 'company_blocked_days';

export default function CompanyCalendarModal({ isOpen, onClose }) {
    const [blockedDays, setBlockedDays]   = useState([]); // [{date, reason}]
    const [isLoading, setIsLoading]       = useState(true);
    const [viewDate, setViewDate]         = useState(() => {
        const d = new Date();
        return { year: d.getFullYear(), month: d.getMonth() };
    });
    const [saving, setSaving]             = useState(false);
    const [newReason, setNewReason]       = useState('Festivo');

    useEffect(() => {
        if (isOpen) fetchBlockedDays();
    }, [isOpen]);

    if (!isOpen) return null;

    // ── Data ──────────────────────────────────────────────────────────────────
    const fetchBlockedDays = async () => {
        setIsLoading(true);
        try {
            const { data } = await supabase
                .from('settings')
                .select('value')
                .eq('key', SETTINGS_KEY)
                .maybeSingle();
            if (data?.value) {
                setBlockedDays(JSON.parse(data.value));
            } else {
                setBlockedDays([]);
            }
        } catch (e) {
            console.error('Error fetching blocked days:', e);
        } finally {
            setIsLoading(false);
        }
    };

    const saveBlockedDays = async (days) => {
        await supabase.from('settings').upsert({ key: SETTINGS_KEY, value: JSON.stringify(days) });
    };

    const toggleDay = async (dateStr) => {
        if (saving) return;
        setSaving(true);
        try {
            const existing = blockedDays.find(d => d.date === dateStr);
            let updated;
            if (existing) {
                updated = blockedDays.filter(d => d.date !== dateStr);
            } else {
                updated = [...blockedDays, { date: dateStr, reason: newReason }]
                    .sort((a, b) => a.date.localeCompare(b.date));
            }
            setBlockedDays(updated);
            await saveBlockedDays(updated);
        } catch (e) {
            console.error('Error saving blocked day:', e);
            alert('Error al guardar. Inténtalo de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    const removeDay = async (dateStr) => {
        setSaving(true);
        const updated = blockedDays.filter(d => d.date !== dateStr);
        setBlockedDays(updated);
        await saveBlockedDays(updated);
        setSaving(false);
    };

    // ── Calendar ──────────────────────────────────────────────────────────────
    const firstDay  = new Date(viewDate.year, viewDate.month, 1);
    const lastDay   = new Date(viewDate.year, viewDate.month + 1, 0);
    const startDow  = (firstDay.getDay() + 6) % 7;
    const cells     = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(d);

    const today      = new Date();
    const todayStr   = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
    const monthLabel = new Date(viewDate.year, viewDate.month, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const blockedMap = {};
    blockedDays.forEach(d => { blockedMap[d.date] = d; });

    const monthBlocked = blockedDays.filter(d => d.date.startsWith(`${viewDate.year}-${String(viewDate.month+1).padStart(2,'0')}`));

    const prevMonth = () => setViewDate(p => p.month === 0  ? { year: p.year-1, month: 11 } : { ...p, month: p.month-1 });
    const nextMonth = () => setViewDate(p => p.month === 11 ? { year: p.year+1, month: 0  } : { ...p, month: p.month+1 });

    const QUICK_REASONS = ['Festivo', 'Puente', 'Cierre empresa', 'Semana Santa', 'Navidad'];

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center text-lg">🏛️</div>
                        <div>
                            <h3 className="font-bold text-slate-800">Calendario Laboral de Empresa</h3>
                            <p className="text-xs text-slate-500">Festivos, puentes y días de cierre para todos los conductores</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Info banner */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-start gap-2">
                        <span className="text-slate-500 mt-0.5 text-base">ℹ️</span>
                        <div className="text-[11px] text-slate-600 leading-relaxed">
                            <strong>Sábados y domingos</strong> están bloqueados automáticamente para todos los conductores.<br />
                            Aquí puedes añadir <strong>festivos, puentes o cierres</strong> adicionales que también bloqueen el fichaje.
                        </div>
                    </div>

                    {/* Reason input */}
                    <div>
                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Motivo del día bloqueado</label>
                        <div className="flex flex-wrap gap-2 mb-2">
                            {QUICK_REASONS.map(r => (
                                <button
                                    key={r}
                                    onClick={() => setNewReason(r)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                        newReason === r
                                            ? 'bg-rose-500 text-white border-rose-500'
                                            : 'bg-white text-slate-600 border-slate-200 hover:border-rose-300 hover:text-rose-600'
                                    }`}
                                >
                                    {r}
                                </button>
                            ))}
                        </div>
                        <input
                            type="text"
                            value={newReason}
                            onChange={e => setNewReason(e.target.value)}
                            placeholder="O escribe tu propio motivo..."
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                        />
                    </div>

                    {/* Calendar */}
                    <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between mb-4">
                            <button onClick={prevMonth} className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
                                <ChevronLeft size={18} />
                            </button>
                            <p className="font-bold text-slate-700 capitalize text-sm">{monthLabel}</p>
                            <button onClick={nextMonth} className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-slate-700 transition-colors">
                                <ChevronRight size={18} />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {['L','M','X','J','V','S','D'].map((d, i) => (
                                <div key={d} className={`text-center text-[10px] font-bold py-1 ${i >= 5 ? 'text-rose-400' : 'text-slate-400'}`}>{d}</div>
                            ))}
                        </div>

                        {isLoading ? (
                            <div className="text-center py-8 text-slate-400 text-sm animate-pulse">Cargando...</div>
                        ) : (
                            <div className="grid grid-cols-7 gap-1">
                                {cells.map((day, idx) => {
                                    if (!day) return <div key={idx} />;
                                    const dateStr   = `${viewDate.year}-${String(viewDate.month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                                    const weekday   = new Date(viewDate.year, viewDate.month, day).getDay();
                                    const isWeekend = weekday === 0 || weekday === 6;
                                    const blocked   = blockedMap[dateStr];
                                    const isToday   = dateStr === todayStr;

                                    return (
                                        <button
                                            key={day}
                                            onClick={() => !isWeekend && toggleDay(dateStr)}
                                            disabled={saving || isWeekend}
                                            title={isWeekend ? 'Fin de semana — bloqueado automáticamente' : blocked ? `${blocked.reason} — pulsa para quitar` : `Marcar como ${newReason}`}
                                            className={`relative aspect-square rounded-xl flex flex-col items-center justify-center text-sm font-bold transition-all select-none
                                                ${isWeekend
                                                    ? 'bg-rose-100 text-rose-400 cursor-not-allowed'
                                                    : blocked
                                                        ? 'bg-rose-500 text-white shadow-sm scale-95 hover:scale-100'
                                                        : 'bg-white text-slate-700 hover:bg-rose-50 hover:text-rose-700 shadow-sm cursor-pointer'}
                                                ${isToday && !isWeekend && !blocked ? 'ring-2 ring-rose-400 ring-offset-1' : ''}
                                                ${saving ? 'opacity-50' : ''}
                                            `}
                                        >
                                            {day}
                                            {isWeekend && <span className="text-[7px] leading-none mt-0.5 opacity-60">✗</span>}
                                            {blocked && !isWeekend && <span className="text-[7px] leading-none mt-0.5 opacity-90">🏛️</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                        <p className="text-[10px] text-slate-400 mt-3 text-center">
                            🔴 Rojo claro = fin de semana (automático) · 🔴 Rojo intenso = día bloqueado por empresa
                        </p>
                    </div>

                    {/* Month list */}
                    {monthBlocked.length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 capitalize">Días bloqueados en {monthLabel}</p>
                            <div className="space-y-1.5">
                                {monthBlocked.map(d => {
                                    const label = new Date(d.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
                                    return (
                                        <div key={d.date} className="flex items-center justify-between px-3 py-2 rounded-xl border bg-rose-50 border-rose-200 text-rose-700">
                                            <div className="flex items-center gap-2">
                                                <span className="text-base">🏛️</span>
                                                <div>
                                                    <p className="text-xs font-bold capitalize">{label}</p>
                                                    <p className="text-[10px] opacity-60">{d.reason}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => removeDay(d.date)}
                                                className="p-1.5 hover:bg-red-100 rounded-lg opacity-40 hover:opacity-100 hover:text-red-600 transition-all"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Year summary */}
                    {blockedDays.filter(d => d.date.startsWith(String(viewDate.year))).length > 0 && (
                        <div>
                            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Total bloqueados en {viewDate.year}</p>
                            <div className="grid grid-cols-3 gap-2">
                                <div className="bg-rose-50 rounded-xl p-3 border border-rose-100 text-center">
                                    <p className="text-xl font-black text-rose-600">{blockedDays.filter(d => d.date.startsWith(String(viewDate.year))).length}</p>
                                    <p className="text-[10px] font-bold text-rose-400 uppercase tracking-wide mt-0.5">Días empresa</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                                    <p className="text-xl font-black text-slate-600">104</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Fines de semana</p>
                                </div>
                                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                                    <p className="text-xl font-black text-slate-600">{365 - 104 - blockedDays.filter(d => d.date.startsWith(String(viewDate.year))).length}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Días laborables</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end shrink-0">
                    <button onClick={onClose} className="px-6 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-sm transition-colors shadow-lg shadow-rose-600/20">
                        Cerrar
                    </button>
                </div>
            </div>
        </div>
    );
}
