import { X, Calendar, ChevronLeft, ChevronRight, Trash2, FileWarning, FileCheck2, Upload, Eye, Loader2, Check } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import {
    TIPO_BAJA,
    CAMPO_PARTE,
    CAMPO_PARTE_FECHA,
    CAMPO_PARTE_FICHERO,
    laTablaLlevaParte,
    faltaElParte,
    tieneParteEscaneado,
    tramosSinParte,
    textoDelTramo,
} from '../../utils/partesDeBaja';
import { uploadPrivateFile, getSignedUrlForPath, deletePrivateFile, MEDICAL_NOTES_BUCKET } from '../../utils/storage';
import { diasDeVacaciones, explicacionDeLosDias, SEMANAS_DE_VACACIONES } from '../../utils/vacacionesDelAno';

export const ABSENCE_TYPES = [
    { value: 'Vacaciones',      label: 'Vacaciones',      emoji: '🏖️', color: 'bg-blue-500',   light: 'bg-blue-100 text-blue-700 border-blue-200'    },
    { value: 'Día Libre',       label: 'Día Libre',       emoji: '☀️',  color: 'bg-amber-500',  light: 'bg-amber-100 text-amber-700 border-amber-200'  },
    { value: 'Baja Médica',     label: 'Baja Médica',     emoji: '🏥',  color: 'bg-red-500',    light: 'bg-red-100 text-red-700 border-red-200'        },
    { value: 'Asuntos Propios', label: 'Asuntos Propios', emoji: '📋',  color: 'bg-purple-500', light: 'bg-purple-100 text-purple-700 border-purple-200'},
];

// Cuántos días le tocan sale de `utils/vacacionesDelAno`: cuatro semanas al año,
// a prorrata en el año en que entró (si su ficha tiene fecha de alta).

export default function AbsenceManagerModal({ isOpen, onClose, driver, drivers }) {
    const [absences, setAbsences]         = useState([]);
    const [isLoading, setIsLoading]       = useState(false);
    const [selectedType, setSelectedType] = useState('Vacaciones');
    const [saving, setSaving]             = useState(false);
    const [selectedDriver, setSelectedDriver] = useState(null);
    const [subiendo, setSubiendo]         = useState(null);   // ids del tramo que se está subiendo
    const ficheroRef                      = useRef(null);
    const tramoDelFichero                 = useRef(null);
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
                // Una Baja Médica nace PENDIENTE de parte, pero eso no se manda desde
                // aquí: lo pone el DEFAULT false de la columna (migración 24). Así, si
                // el script todavía no se ha pasado, marcar ausencias sigue funcionando
                // igual que siempre en vez de reventar por una columna que no existe.
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
            const borrada = absences.find(a => a.id === id);
            await supabase.from('driver_absences').delete().eq('id', id);
            const quedan = absences.filter(a => a.id !== id);
            setAbsences(quedan);

            // El parte escaneado lo comparten todos los días de la baja. Sólo se retira
            // del almacén cuando se borra el ÚLTIMO día que lo usaba; si no, se estaría
            // dejando sin papel a los días que siguen en pie.
            const ruta = borrada?.[CAMPO_PARTE_FICHERO];
            if (ruta && !quedan.some(a => a[CAMPO_PARTE_FICHERO] === ruta)) {
                try { await deletePrivateFile(MEDICAL_NOTES_BUCKET, ruta); }
                catch (err) { console.warn('No se pudo retirar el parte de una baja borrada:', err); }
            }
        } finally {
            setSaving(false);
        }
    };

    /**
     * Apunta (o desapunta) el parte de una baja. Se le pasan los ids de TODO el tramo
     * -una baja de dos semanas son catorce filas y un solo papel- y se marcan de una vez.
     */
    const marcarParte = async (ids, recibido) => {
        if (!ids || ids.length === 0 || saving) return;
        setSaving(true);
        try {
            const cambio = {
                [CAMPO_PARTE]:       recibido,
                [CAMPO_PARTE_FECHA]: recibido ? new Date().toISOString() : null,
            };
            const { error } = await supabase.from('driver_absences').update(cambio).in('id', ids);
            if (error) throw error;
            setAbsences(prev => prev.map(a => (ids.includes(a.id) ? { ...a, ...cambio } : a)));
        } catch (e) {
            console.error('Error marcando el parte:', e);
            const msg = e?.message || e?.error_description || e?.code || JSON.stringify(e);
            alert(`❌ No se ha podido apuntar el parte:\n\n${msg}`);
        } finally {
            setSaving(false);
        }
    };

    /** Abre el selector de ficheros apuntando a este tramo. */
    const pedirFichero = (tramo) => {
        if (saving || subiendo) return;
        tramoDelFichero.current = tramo;
        if (ficheroRef.current) {
            ficheroRef.current.value = '';   // así vuelve a disparar si eligen el mismo fichero
            ficheroRef.current.click();
        }
    };

    /**
     * Guarda el parte escaneado. El fichero se sube UNA vez y su ruta se apunta en
     * todos los días del tramo: un parte del 7 al 18 es un papel, no diez.
     *
     * Subirlo da la baja por justificada sin tener que pulsar además "Parte recibido":
     * el papel está, que es de lo que se trataba.
     */
    const guardarParteEscaneado = async (e) => {
        const fichero = e.target.files && e.target.files[0];
        const tramo   = tramoDelFichero.current;
        if (!fichero || !tramo || !selectedDriver) return;

        setSubiendo(tramo.ids);
        try {
            const nombre = `${textoDelTramo(tramo).replace(/ /g, '_')}_${fichero.name}`;
            const ruta   = await uploadPrivateFile(nombre, fichero, MEDICAL_NOTES_BUCKET, String(selectedDriver.id));

            const cambio = {
                [CAMPO_PARTE]:         true,
                [CAMPO_PARTE_FECHA]:   new Date().toISOString(),
                [CAMPO_PARTE_FICHERO]: ruta,
            };
            const { error } = await supabase.from('driver_absences').update(cambio).in('id', tramo.ids);
            if (error) throw error;

            setAbsences(prev => prev.map(a => (tramo.ids.includes(a.id) ? { ...a, ...cambio } : a)));

            // Si había un parte anterior en estos mismos días, se retira del almacén:
            // ya no hay forma de abrirlo desde la ficha y no se dejan papeles médicos
            // sueltos por ahí. Si falla, no se le echa atrás el trabajo a nadie.
            const anterior = absences.find(a => tramo.ids.includes(a.id) && a[CAMPO_PARTE_FICHERO]);
            const rutaVieja = anterior?.[CAMPO_PARTE_FICHERO];
            if (rutaVieja && rutaVieja !== ruta) {
                try { await deletePrivateFile(MEDICAL_NOTES_BUCKET, rutaVieja); }
                catch (errBorrado) { console.warn('No se pudo retirar el parte anterior:', errBorrado); }
            }
        } catch (err) {
            console.error('Error subiendo el parte:', err);
            alert(`❌ No se ha podido guardar el parte:\n\n${err?.message || err}`);
        } finally {
            setSubiendo(null);
            tramoDelFichero.current = null;
        }
    };

    /** Abre el parte en una pestaña con un enlace que caduca al minuto. */
    const verParte = async (ruta) => {
        try {
            const url = await getSignedUrlForPath(MEDICAL_NOTES_BUCKET, ruta);
            if (url) window.open(url, '_blank', 'noopener');
        } catch (err) {
            alert(`❌ ${err?.message || err}`);
        }
    };

    // ── Helpers ───────────────────────────────────────────────────────────────
    const getTypeConf = (type) => ABSENCE_TYPES.find(t => t.value === type) || ABSENCE_TYPES[0];

    // El control del parte sólo se enciende si la migración 24 ya está pasada.
    const llevaParte    = laTablaLlevaParte(absences);
    const sinParte      = llevaParte ? tramosSinParte(absences) : [];
    const diasSinParte  = sinParte.reduce((n, t) => n + t.dias.length, 0);
    const partePendiente = (a) => llevaParte && faltaElParte(a);

    const monthAbsences = absences.filter(a => {
        const d = new Date(a.date + 'T12:00:00');
        return d.getFullYear() === viewDate.year && d.getMonth() === viewDate.month;
    });

    const absenceMap = {};
    monthAbsences.forEach(a => { absenceMap[a.date] = a; });

    const vacDaysUsed  = absences.filter(a => a.type === 'Vacaciones').length;
    const vacTotal     = diasDeVacaciones(selectedDriver?.hireDate, viewDate.year);
    const vacRemaining = vacTotal.dias - vacDaysUsed;

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
                            <p className="text-2xl font-black text-slate-600">{vacTotal.dias}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">Total año {viewDate.year}</p>
                        </div>
                    </div>

                    {/* De dónde sale ese total: cuatro semanas, o la parte que haya generado */}
                    <p className="text-[11px] text-slate-400 -mt-2 text-center">
                        {vacTotal.prorrateado
                            ? <>Le tocan {vacTotal.dias} días: {explicacionDeLosDias(selectedDriver?.hireDate, viewDate.year)}.</>
                            : <>{SEMANAS_DE_VACACIONES} semanas al año{!selectedDriver?.hireDate && ' · sin fecha de alta en su ficha'}.</>}
                    </p>

                    {/* Bajas pendientes de parte — de todo el año, no sólo del mes a la vista */}
                    {sinParte.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <FileWarning size={16} className="text-amber-600 shrink-0" />
                                <p className="text-xs font-black text-amber-800 uppercase tracking-wide">
                                    {diasSinParte === 1 ? '1 día de baja sin parte médico' : `${diasSinParte} días de baja sin parte médico`}
                                </p>
                            </div>
                            <div className="space-y-1.5">
                                {sinParte.map(tramo => (
                                    <div key={tramo.desde} className="flex items-center justify-between gap-2 bg-white border border-amber-200 rounded-xl px-3 py-2">
                                        <button
                                            onClick={() => setViewDate({
                                                year:  Number(tramo.desde.slice(0, 4)),
                                                month: Number(tramo.desde.slice(5, 7)) - 1,
                                            })}
                                            className="text-left min-w-0 group"
                                            title="Ver en el calendario"
                                        >
                                            <p className="text-xs font-bold text-slate-700 first-letter:uppercase truncate group-hover:text-amber-700 transition-colors">
                                                {textoDelTramo(tramo)}
                                            </p>
                                            <p className="text-[10px] text-slate-400">
                                                {tramo.dias.length === 1 ? '1 día' : `${tramo.dias.length} días`} · pendiente de papel
                                            </p>
                                        </button>
                                        <div className="shrink-0 flex items-center gap-1">
                                            <button
                                                onClick={() => pedirFichero(tramo)}
                                                disabled={saving || !!subiendo}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[11px] font-bold rounded-lg transition-colors"
                                                title="Subir el parte escaneado o una foto del papel"
                                            >
                                                {subiendo && subiendo.includes(tramo.ids[0])
                                                    ? <Loader2 size={13} className="animate-spin" />
                                                    : <Upload size={13} />}
                                                Subir parte
                                            </button>
                                            <button
                                                onClick={() => marcarParte(tramo.ids, true)}
                                                disabled={saving || !!subiendo}
                                                className="p-1.5 bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50 disabled:opacity-50 rounded-lg transition-colors"
                                                title="El parte está en mano pero no se escanea: darlo por justificado sin fichero"
                                            >
                                                <Check size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <p className="text-[10px] text-amber-700/70 mt-2.5 leading-relaxed">
                                La baja bloquea el fichaje desde que se marca, con parte o sin él. Esto es sólo el recordatorio del papel.
                                Subir el parte lo da por justificado; el <Check size={10} className="inline -mt-0.5" /> es para cuando lo tienes en mano pero no lo escaneas.
                            </p>
                        </div>
                    )}

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
                                            title={absence
                                                ? `${absence.type}${partePendiente(absence) ? ' (falta el parte)' : ''} — pulsa para quitar`
                                                : `Marcar como ${selectedType}`}
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
                                            {partePendiente(absence) && (
                                                <span
                                                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 border-2 border-white text-[8px] font-black text-amber-900 flex items-center justify-center leading-none"
                                                    title="Falta el parte médico"
                                                >!</span>
                                            )}
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
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-base">{conf.emoji}</span>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-bold capitalize">{label}</p>
                                                    <p className="text-[10px] opacity-60">{a.type}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {tieneParteEscaneado(a) && (
                                                    <button
                                                        onClick={() => verParte(a[CAMPO_PARTE_FICHERO])}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                                                        title="Ver el parte escaneado"
                                                    >
                                                        <Eye size={12} />
                                                        Ver parte
                                                    </button>
                                                )}
                                                {llevaParte && a.type === TIPO_BAJA && faltaElParte(a) && (
                                                    <button
                                                        onClick={() => pedirFichero({ desde: a.date, hasta: a.date, dias: [a.date], ids: [a.id] })}
                                                        disabled={saving || !!subiendo}
                                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-all"
                                                        title="Subir el parte de este día"
                                                    >
                                                        {subiendo && subiendo.includes(a.id)
                                                            ? <Loader2 size={12} className="animate-spin" />
                                                            : <Upload size={12} />}
                                                        Subir
                                                    </button>
                                                )}
                                                {llevaParte && a.type === TIPO_BAJA && (
                                                    <button
                                                        onClick={() => marcarParte([a.id], faltaElParte(a))}
                                                        disabled={saving}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all disabled:opacity-50 ${
                                                            faltaElParte(a)
                                                                ? 'bg-amber-400 text-amber-900 hover:bg-amber-500'
                                                                : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                                        }`}
                                                        title={faltaElParte(a)
                                                            ? 'Pulsa cuando llegue el parte de este día'
                                                            : 'Parte en mano — pulsa si te lo tienes que volver a pedir'}
                                                    >
                                                        {faltaElParte(a) ? <FileWarning size={12} /> : <FileCheck2 size={12} />}
                                                        {faltaElParte(a) ? 'Falta parte' : 'Parte OK'}
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteAbsence(a.id)}
                                                    className="p-1.5 hover:bg-red-100 rounded-lg text-current opacity-40 hover:opacity-100 hover:text-red-600 transition-all"
                                                    title="Eliminar ausencia"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
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

                {/* El selector de ficheros del parte: uno para todos los botones de subir */}
                <input
                    ref={ficheroRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={guardarParteEscaneado}
                    className="hidden"
                />

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
