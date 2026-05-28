import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Clock, Calendar, Search, Edit2, CheckCircle, Trash2 } from 'lucide-react';

export default function TimeLogsAdmin() {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7)); // YYYY-MM
    const [editingLogId, setEditingLogId] = useState(null);
    const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '' });

    useEffect(() => {
        fetchLogs();
    }, [month]);

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const startOfMonth = `${month}-01`;
            const endOfMonth = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).toISOString().split('T')[0];
            
            const { data, error } = await supabase
                .from('time_logs')
                .select('*')
                .gte('date', startOfMonth)
                .lte('date', endOfMonth)
                .order('date', { ascending: false })
                .order('clock_in', { ascending: false });

            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error("Error fetching time logs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
    };

    const calculateHours = (inStr, outStr) => {
        if (!inStr || !outStr) return '-';
        const diffMs = new Date(outStr) - new Date(inStr);
        const hours = diffMs / (1000 * 60 * 60);
        return hours.toFixed(1) + 'h';
    };

    const startEdit = (log) => {
        setEditingLogId(log.id);
        // Transform full ISO strings to local datetime-local format for inputs (YYYY-MM-DDThh:mm)
        const formatForInput = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        };
        setEditForm({
            clock_in: formatForInput(log.clock_in),
            clock_out: formatForInput(log.clock_out)
        });
    };

    const saveEdit = async (id) => {
        try {
            // Convert back to UTC ISO string for DB
            const updates = {
                clock_in: editForm.clock_in ? new Date(editForm.clock_in).toISOString() : null,
                clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : null,
            };
            
            await supabase.from('time_logs').update(updates).eq('id', id);
            
            // Add an alert for the driver
            const log = logs.find(l => l.id === id);
            if (log) {
                const { data: existing } = await supabase.from('settings').select('value').eq('key', 'pending_timelog_alerts').maybeSingle();
                let alerts = [];
                if (existing?.value) { try { alerts = JSON.parse(existing.value); } catch(e) {} }
                
                // Add the new alert
                alerts.push({
                    id: Date.now().toString(),
                    logId: id,
                    driverId: log.driver_id,
                    date: log.date,
                    clock_in: updates.clock_in,
                    clock_out: updates.clock_out,
                    timestamp: new Date().toISOString()
                });
                await supabase.from('settings').upsert({ key: 'pending_timelog_alerts', value: JSON.stringify(alerts) });
            }

            setEditingLogId(null);
            fetchLogs();
        } catch (e) {
            console.error("Error updating log:", e);
            alert("Error al guardar.");
        }
    };

    const deleteLog = async (id) => {
        if(!window.confirm("¿Borrar este registro horario?")) return;
        try {
            await supabase.from('time_logs').delete().eq('id', id);
            fetchLogs();
        } catch (e) {
            console.error("Error deleting:", e);
        }
    };

    return (
        <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Clock size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Control Horario (Fichajes)</h2>
                        <p className="text-slate-500 text-sm">Registro de entradas y salidas de los conductores.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <input 
                        type="month" 
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="px-3 py-2 border border-slate-200 rounded-lg font-bold text-sm text-slate-700"
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="text-center py-10 text-slate-400 font-bold">Cargando fichajes...</div>
            ) : (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Conductor</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entrada</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Salida</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {logs.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="p-6 text-center text-slate-400">No hay registros para este mes.</td>
                                </tr>
                            ) : logs.map(log => (
                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                    <td className="p-3 text-sm font-medium text-slate-700 capitalize">{formatDate(log.date)}</td>
                                    <td className="p-3 text-sm font-bold text-slate-800">{log.driver_name}</td>
                                    <td className="p-3">
                                        {editingLogId === log.id ? (
                                            <input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm({...editForm, clock_in: e.target.value})} className="text-xs p-1 border rounded" />
                                        ) : (
                                            <span className="text-sm text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">{formatTime(log.clock_in)}</span>
                                        )}
                                    </td>
                                    <td className="p-3">
                                        {editingLogId === log.id ? (
                                            <input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm({...editForm, clock_out: e.target.value})} className="text-xs p-1 border rounded" />
                                        ) : log.clock_out ? (
                                            <span className="text-sm text-red-600 font-bold bg-red-50 px-2 py-1 rounded">{formatTime(log.clock_out)}</span>
                                        ) : (
                                            <span className="text-xs text-amber-500 font-bold italic">Trabajando...</span>
                                        )}
                                    </td>
                                    <td className="p-3 text-sm font-bold text-slate-600">
                                        {calculateHours(log.clock_in, log.clock_out)}
                                    </td>
                                    <td className="p-3 flex justify-end gap-2">
                                        {editingLogId === log.id ? (
                                            <button onClick={() => saveEdit(log.id)} className="p-1.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg"><CheckCircle size={16} /></button>
                                        ) : (
                                            <>
                                                <button onClick={() => startEdit(log)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-lg" title="Editar hora"><Edit2 size={16} /></button>
                                                <button onClick={() => deleteLog(log.id)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 rounded-lg" title="Borrar"><Trash2 size={16} /></button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
