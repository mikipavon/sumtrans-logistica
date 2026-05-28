import { X, Save, Plus, Trash2, Settings, Clock } from 'lucide-react';
import React from 'react';
import { supabase } from '../../lib/supabase';

export default function GpsAlertsModal({ 
    isOpen, onClose, drivers, 
    gpsIntervalMinutes, setGpsIntervalMinutes, 
    driverAlerts, setDriverAlerts,
    showNewAlertForm, setShowNewAlertForm,
    editingAlertId, setEditingAlertId,
    newAlertForm, setNewAlertForm,
    alertHistory, setAlertHistory,
    showAlertHistory, setShowAlertHistory,
    alertHistoryFilter, setAlertHistoryFilter
}) {
    if (!isOpen) return null;

    return (
        <>
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <Settings size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">GPS y Alertas de Conductores</h2>
                            <p className="text-sm text-slate-500 font-medium">Configura la frecuencia de rastreo y las notificaciones.</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors">
                        <X size={20} />
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    <div className="max-w-3xl mx-auto space-y-6">

            {/* GPS Interval Configuration */}
            <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-sm">
              <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2 mb-1">
                📡 Frecuencia de Rastreo GPS
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Cada cuántos minutos se envía automáticamente la ubicación del conductor a la oficina.
              </p>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={1}
                  max={60}
                  step={1}
                  value={gpsIntervalMinutes || 15}
                  onChange={(e) => setGpsIntervalMinutes(parseInt(e.target.value))}
                  className="flex-1 h-2 bg-slate-200 rounded-full appearance-none cursor-pointer accent-blue-600"
                />
                <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-w-[100px] justify-center">
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={gpsIntervalMinutes || 15}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      if (val >= 1 && val <= 60) setGpsIntervalMinutes(val);
                    }}
                    className="w-12 text-center font-extrabold text-blue-700 text-lg bg-transparent outline-none"
                  />
                  <span className="text-xs font-bold text-slate-400">min</span>
                </div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 px-1">
                <span>1 min (alta precisión)</span>
                <span>60 min (bajo consumo)</span>
              </div>
              <button
                onClick={async () => {
                  try {
                    await supabase.from('settings').upsert({ key: 'gpsIntervalMinutes', value: String(gpsIntervalMinutes || 15) });
                    alert('✅ Intervalo GPS guardado correctamente');
                  } catch(err) {
                    console.error('Error saving GPS interval:', err);
                    alert('❌ Error al guardar');
                  }
                }}
                className="mt-4 w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20 text-sm flex items-center justify-center gap-2"
              >
                <Save size={16} /> Guardar Intervalo GPS
              </button>
            </div>

            {/* Driver Alerts */}
            <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-700 text-sm flex items-center gap-2">
                  🔔 Alertas Obligatorias para Conductores
                </h3>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      try {
                        const { data } = await supabase.from('settings').select('value').eq('key', 'alert_acknowledgments').maybeSingle();
                        if (data?.value) { setAlertHistory(JSON.parse(data.value)); } else { setAlertHistory([]); }
                      } catch(e) { console.error(e); setAlertHistory([]); }
                      setAlertHistoryFilter('all');
                      setShowAlertHistory(true);
                    }}
                    className="px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200"
                  >
                    📋 Historial
                  </button>
                  <button
                    onClick={() => setShowNewAlertForm(prev => !prev)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all active:scale-95 flex items-center gap-2 ${
                      showNewAlertForm 
                        ? 'bg-slate-200 text-slate-600' 
                        : 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700'
                    }`}
                  >
                    {showNewAlertForm ? '✕ Cancelar' : '+ Nueva Alerta'}
                  </button>
                </div>
              </div>
              <p className="text-xs text-slate-500 mb-4">
                Notificaciones que aparecen al abrir la app. El conductor debe confirmar antes de continuar.
              </p>

              {/* ─── FORMULARIO NUEVA ALERTA ─── */}
              {showNewAlertForm && (
                <div className="bg-white border-2 border-blue-200 rounded-xl p-5 mb-5 space-y-4 animate-in slide-in-from-top-2 duration-200">
                  <h4 className="font-extrabold text-slate-800 text-sm flex items-center gap-2">
                    {editingAlertId ? '✏️ Editar Alerta' : '✨ Crear Nueva Alerta'}
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Título</label>
                      <input
                        type="text"
                        placeholder="Ej: Revisión del vehículo"
                        value={newAlertForm.title}
                        onChange={e => setNewAlertForm(p => ({...p, title: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Icono (emoji)</label>
                      <input
                        type="text"
                        placeholder="🔧"
                        value={newAlertForm.icon}
                        onChange={e => setNewAlertForm(p => ({...p, icon: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                        maxLength={4}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Mensaje</label>
                    <textarea
                      placeholder="Escribe el mensaje que verá el conductor..."
                      value={newAlertForm.message}
                      onChange={e => setNewAlertForm(p => ({...p, message: e.target.value}))}
                      rows={4}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none resize-none"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Día de la semana</label>
                      <select
                        value={newAlertForm.dayOfWeek}
                        onChange={e => setNewAlertForm(p => ({...p, dayOfWeek: e.target.value === 'todos' ? undefined : parseInt(e.target.value)}))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      >
                        <option value="todos">Todos los días</option>
                        <option value="1">Lunes</option>
                        <option value="2">Martes</option>
                        <option value="3">Miércoles</option>
                        <option value="4">Jueves</option>
                        <option value="5">Viernes</option>
                        <option value="6">Sábado</option>
                        <option value="0">Domingo</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hora desde</label>
                      <input
                        type="time"
                        value={newAlertForm.timeFrom || ''}
                        onChange={e => setNewAlertForm(p => ({...p, timeFrom: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Vacío = al abrir la app</p>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Hora hasta</label>
                      <input
                        type="time"
                        value={newAlertForm.timeTo || ''}
                        onChange={e => setNewAlertForm(p => ({...p, timeTo: e.target.value}))}
                        className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                      />
                      <p className="text-[9px] text-slate-400 mt-1">Vacío = todo el día</p>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Texto del botón de confirmar</label>
                    <input
                      type="text"
                      placeholder="Ej: ✅ Confirmo que lo he revisado"
                      value={newAlertForm.confirmText}
                      onChange={e => setNewAlertForm(p => ({...p, confirmText: e.target.value}))}
                      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 outline-none"
                    />
                  </div>
                  {/* Conductores destinatarios */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Dirigida a</label>
                    <div className="bg-white border border-slate-200 rounded-lg p-3 max-h-36 overflow-y-auto space-y-1">
                      <label className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!newAlertForm.targetDriverIds || newAlertForm.targetDriverIds.length === 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewAlertForm(p => ({...p, targetDriverIds: []}));
                            }
                          }}
                          className="w-4 h-4 rounded text-blue-600"
                        />
                        <span className="text-sm font-bold text-slate-700">👥 Todos los conductores</span>
                      </label>
                      {(drivers || []).map(d => (
                        <label key={d.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Array.isArray(newAlertForm.targetDriverIds) && newAlertForm.targetDriverIds.includes(d.id)}
                            onChange={(e) => {
                              setNewAlertForm(p => {
                                let ids = Array.isArray(p.targetDriverIds) ? [...p.targetDriverIds] : [];
                                if (e.target.checked) {
                                  ids.push(d.id);
                                } else {
                                  ids = ids.filter(id => id !== d.id);
                                }
                                return {...p, targetDriverIds: ids};
                              });
                            }}
                            className="w-4 h-4 rounded text-blue-600"
                          />
                          <span className="text-sm text-slate-600">🚛 {d.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[9px] text-slate-400 mt-1">Vacío = todos los conductores</p>
                  </div>
                  <button
                    onClick={async () => {
                      if (!newAlertForm.title.trim()) return alert('El título es obligatorio');
                      if (!newAlertForm.message.trim()) return alert('El mensaje es obligatorio');
                      const alertObj = {
                        id: editingAlertId || `alert_${Date.now()}`,
                        title: newAlertForm.title.trim(),
                        message: newAlertForm.message.trim(),
                        icon: newAlertForm.icon || '🔔',
                        dayOfWeek: newAlertForm.dayOfWeek,
                        timeFrom: newAlertForm.timeFrom || null,
                        timeTo: newAlertForm.timeTo || null,
                        confirmText: newAlertForm.confirmText.trim() || '✅ Entendido, continuar',
                        targetDriverIds: (newAlertForm.targetDriverIds && newAlertForm.targetDriverIds.length > 0) ? newAlertForm.targetDriverIds : null,
                        enabled: true
                      };
                      let updated;
                      if (editingAlertId) {
                        updated = driverAlerts.map(a => a.id === editingAlertId ? alertObj : a);
                      } else {
                        updated = [...(driverAlerts || []), alertObj];
                      }
                      setDriverAlerts(updated);
                      try {
                        await supabase.from('settings').upsert({ key: 'driverAlerts', value: JSON.stringify(updated) });
                      } catch(err) { console.error('Error saving alerts:', err); }
                      setNewAlertForm({ title: '', message: '', icon: '🔔', dayOfWeek: undefined, timeFrom: '', timeTo: '', confirmText: '', targetDriverIds: [] });
                      setEditingAlertId(null);
                      setShowNewAlertForm(false);
                    }}
                    disabled={!newAlertForm.title.trim() || !newAlertForm.message.trim()}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none"
                  >
                    {editingAlertId ? '💾 Guardar Cambios' : '➕ Crear Alerta'}
                  </button>
                </div>
              )}

              {/* ─── LISTA DE ALERTAS EXISTENTES ─── */}
              <div className="space-y-3">
                {(driverAlerts || []).length === 0 && (
                  <div className="text-center py-8 text-slate-400">
                    <p className="text-3xl mb-2">🔕</p>
                    <p className="text-sm font-medium">No hay alertas configuradas</p>
                    <p className="text-xs mt-1">Pulsa "Nueva Alerta" para crear una</p>
                  </div>
                )}
                {(driverAlerts || []).map((alert, idx) => (
                  <div key={alert.id} className={`bg-white border rounded-xl p-4 transition-all ${alert.enabled !== false ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
                    <div className="flex items-start gap-3">
                      <div className="text-2xl mt-0.5">{alert.icon || '🔔'}</div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-slate-700 text-sm">{alert.title}</h4>
                        <div className="flex flex-wrap items-center gap-2 mt-1">
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                            {alert.dayOfWeek === 0 ? '🗓 Dom' : alert.dayOfWeek === 1 ? '🗓 Lun' : alert.dayOfWeek === 2 ? '🗓 Mar' : alert.dayOfWeek === 3 ? '🗓 Mié' : alert.dayOfWeek === 4 ? '🗓 Jue' : alert.dayOfWeek === 5 ? '🗓 Vie' : alert.dayOfWeek === 6 ? '🗓 Sáb' : '🗓 Todos'}
                          </span>
                          {(alert.timeFrom || alert.timeTo) && (
                            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                              🕐 {alert.timeFrom || '00:00'} - {alert.timeTo || '23:59'}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2">{alert.message}</p>
                        {alert.targetDriverIds && alert.targetDriverIds.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {alert.targetDriverIds.map(tid => {
                              const drv = drivers.find(d => d.id === tid);
                              return drv ? (
                                <span key={tid} className="text-[9px] font-bold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">
                                  {drv.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                        {(!alert.targetDriverIds || alert.targetDriverIds.length === 0) && (
                          <span className="text-[9px] font-bold text-slate-400 mt-1 block">👥 Todos los conductores</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Editar */}
                        <button
                          onClick={() => {
                            setNewAlertForm({
                              title: alert.title,
                              message: alert.message,
                              icon: alert.icon || '🔔',
                              dayOfWeek: alert.dayOfWeek,
                              timeFrom: alert.timeFrom || '',
                              timeTo: alert.timeTo || '',
                              confirmText: alert.confirmText || '',
                              targetDriverIds: alert.targetDriverIds || []
                            });
                            setEditingAlertId(alert.id);
                            setShowNewAlertForm(true);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Settings size={14} />
                        </button>
                        {/* Eliminar */}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`¿Eliminar la alerta "${alert.title}"?`)) return;
                            const updated = driverAlerts.filter(a => a.id !== alert.id);
                            setDriverAlerts(updated);
                            try {
                              await supabase.from('settings').upsert({ key: 'driverAlerts', value: JSON.stringify(updated) });
                            } catch(err) { console.error('Error deleting alert:', err); }
                          }}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                        {/* Toggle */}
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={alert.enabled !== false}
                            onChange={async (e) => {
                              const updated = [...driverAlerts];
                              updated[idx] = { ...updated[idx], enabled: e.target.checked };
                              setDriverAlerts(updated);
                              try {
                                await supabase.from('settings').upsert({ key: 'driverAlerts', value: JSON.stringify(updated) });
                              } catch(err) { console.error('Error saving alerts:', err); }
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          
                    </div>
                </div>
            </div>
        </div>
        {/* MODAL DE HISTORIAL DE ALERTAS CONFIRMADAS */}
      {showAlertHistory && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden animate-in zoom-in-95 duration-200 max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">Historial de Confirmaciones</h3>
                  <p className="text-xs text-slate-500">{alertHistory.length} registro{alertHistory.length !== 1 ? 's' : ''} guardado{alertHistory.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button onClick={() => setShowAlertHistory(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X size={24} />
              </button>
            </div>

            {/* Filter */}
            <div className="px-6 py-3 border-b border-slate-100 shrink-0">
              <select
                value={alertHistoryFilter}
                onChange={(e) => setAlertHistoryFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="all">👥 Todos los conductores</option>
                {[...new Map(alertHistory.map(h => [h.driverId, h.driverName])).entries()].map(([id, name]) => (
                  <option key={id} value={id}>🚛 {name}</option>
                ))}
              </select>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-6">
              {alertHistory.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <p className="text-4xl mb-3">📭</p>
                  <p className="font-medium">No hay confirmaciones registradas</p>
                  <p className="text-xs mt-1">Las confirmaciones aparecerán aquí cuando los conductores acepten las alertas</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {alertHistory
                    .filter(h => alertHistoryFilter === 'all' || String(h.driverId) === String(alertHistoryFilter))
                    .map((h, idx) => {
                      const date = new Date(h.timestamp);
                      const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                      const dayName = dayNames[date.getDay()];
                      const dateStr = `${dayName} ${String(date.getDate()).padStart(2,'0')}/${String(date.getMonth()+1).padStart(2,'0')}/${date.getFullYear()}`;
                      const timeStr = `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                      return (
                        <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 transition-colors">
                          <div className="text-xl shrink-0">{h.alertIcon || '🔔'}</div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-sm text-slate-700 truncate">{h.driverName}</span>
                              <span className="text-[10px] font-bold bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0">✓ Confirmado</span>
                            </div>
                            <p className="text-xs text-slate-500 truncate">{h.alertTitle}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-xs font-bold text-slate-600">{dateStr}</p>
                            <p className="text-[10px] text-slate-400 font-bold">{timeStr}h</p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-slate-100 shrink-0">
              <button
                onClick={() => setShowAlertHistory(false)}
                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors text-sm"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
        </>
    );
}
