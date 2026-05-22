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
                ))}  </div>
</div>

          {/* ══════ BACKUP & DATA (existing) ══════ */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Database size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Copia de Seguridad y Datos</h2>
                <p className="text-slate-500 text-sm">Gestiona el almacenamiento local y exporta tus datos.</p>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-8"> {/* NUEVA SECCIÓN DE COPIA AVANZADA */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* SELECT DIRECTORY */}
                  <div className="flex-1 bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-slate-700">
                        <Folder className="text-blue-600" size={20} />
                        Destino de Copias
                      </div>
                      {backupDirHandle ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">CONFIGURADO</span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">PENDIENTE</span>
                      )}
                    </div>
                    
                    <div className="text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-100 min-h-[40px] flex items-center italic">
                      {backupDirHandle ? `Carpeta: ${backupDirHandle.name}` : 'Ninguna carpeta seleccionada. Las copias se pedirán descargar manualmente.'}
                    </div>

                    <div className="flex gap-2">
                       <button
                        onClick={handleSelectBackupDir}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Settings size={18} />
                        Examinar...
                      </button>
                      <button
                        onClick={() => executeBackup()}
                        disabled={!backupDirHandle}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                          backupStatus === 'success' ? 'bg-emerald-500 text-white' : 
                          backupStatus === 'error' ? 'bg-red-500 text-white' :
                          'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none'
                        }`}
                      >
                        {backupStatus === 'success' ? <CheckCircle size={18} /> : 
                         backupStatus === 'error' ? <AlertCircle size={18} /> : 
                         <Save size={18} />}
                        {backupStatus === 'success' ? '¡Guardado!' : 
                         backupStatus === 'error' ? 'Error' : 
                         'Guardar Ahora'}
                      </button>
                    </div>
                  </div>

                  {/* AUTO-BACKUP SETTINGS */}
                  <div className="flex-1 bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <Clock className="text-indigo-600" size={20} />
                      Auto-guardado
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Intervalo</label>
                      <select 
                        value={autoBackupInterval}
                        onChange={(e) => setAutoBackupInterval(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="0">Desactivado</option>
                        <option value="both">Al entrar y al cerrar</option>
                        <option value="open">Al entrar</option>
                        <option value="close">Al cerrar</option>
                        <option value="15">Cada 15 minutos</option>
                        <option value="60">Cada hora</option>
                        <option value="360">Cada 6 horas</option>
                        <option value="1440">Una vez al día</option>
                      </select>
                    </div>

                    <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                      <span>Última copia:</span>
                      <span className="text-slate-600">
                        {lastBackupTime ? new Date(lastBackupTime).toLocaleString() : 'Nunca'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BOTÓN MANUAL CLÁSICO (Como apoyo) */}
                <button
                  onClick={() => {
                    if (backupDirHandle) {
                      executeBackup();
                    } else {
                      const data = { drivers, shipments, clients, articles, tariffs, vehicles, fuelLogs, defaultCodFee, familyOrder };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const [currentView, setCurrentView] = useState('dashboard')
                      const [currentTab, setCurrentTab] = useState('directorio');
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `copia_sin_carpeta_logistica_${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }
                  }}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200"
                >
                  <Download size={14} />
                  Descargar Copia Manual
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4">
              {/* IMPORT */}
              <div className="relative group">
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      try {
                        const data = JSON.parse(event.target.result);
                        setPendingRestoreData(data);
                        setShowRestoreModal(true);
                      } catch (err) {
                        alert('Error: Archivo dañado o no es un JSON válido de Sumtrans.');
                        console.error(err);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = ''; // Reset file input
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center gap-3 p-8 bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl group-hover:bg-emerald-50 group-hover:border-emerald-200 group-hover:text-emerald-700 transition-all h-full">
                  <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                    <Upload size={32} className="text-slate-400 group-hover:text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">Restaurar Copia</div>
                    <div className="text-xs text-slate-500 mt-1">Subir archivo .json</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ADMIN PASSWORD MANAGEMENT */}
            <div className="mt-8 pt-8 border-t border-slate-100">
               <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                 <Shield size={18} className="text-blue-600" />
                 Acceso de Gestión (Administrador)
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Usuario / Email Administrador</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        value={adminCreds.user}
                        onChange={(e) => setAdminCreds(prev => ({ ...prev, user: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Nueva Contraseña Administración</label>
                      <input 
                        type="password" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        value={adminCreds.pass}
                        onChange={(e) => setAdminCreds(prev => ({ ...prev, pass: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={async () => {
                        try {
                          await supabase.from('settings').upsert([
                            { key: 'admin_user', value: adminCreds.user },
                            { key: 'admin_pass', value: adminCreds.pass }
                          ]);
                          alert('¡Credenciales de Administrador actualizadas con éxito!');
                        } catch (err) {
                          alert('Error al guardar credenciales.');
                        }
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                      Guardar Nuevas Credenciales
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2 italic px-2">
                       Ten cuidado: si cambias estos datos, tendrás que usarlos la próxima vez que inicies sesión.
                    </p>
                  </div>
               </div>
            </div>

            {/* MIKI CLEANUP ZONE */}
            <div className="mt-8 pt-8 border-t border-slate-100">
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Zona de Desarrollo / Pruebas</h3>
               <button
                 onClick={() => handleCleanupDriverData('miki')}
                 className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl hover:bg-red-100 transition-colors font-bold"
               >
                 <Trash2 size={20} />
                 Borrar todos los datos de "Miki"
               </button>
               <p className="text-[11px] text-slate-400 mt-2 text-center">
                 Esta acción borrará conductores, clientes y envíos que contengan el nombre "miki". No se puede deshacer.
               </p>
            </div>

            {/* SECRET HIGH PRIVACY PANEL - ONLY VISIBLE IF GHOST MODE IS UNLOCKED */}
            {isGhostModeUnlocked && (
              <div className="mt-8 pt-8 border-t-2 border-slate-800 bg-slate-900 -mx-8 px-8 pb-8 rounded-b-xl animate-in slide-in-from-bottom-5 duration-500">
                <div className="flex items-center gap-3 mb-6 pt-4">
                  <div className="p-3 bg-red-500/20 text-red-500 rounded-lg">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Panel de Alta Privacidad</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* BOTÓN EXPORTAR EXCEL */}
                  <button
                    onClick={handleExportSecretsCSV}
                    className="w-full bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 p-6 rounded-xl text-lg font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                  >
                    <Download size={24} />
                    Descargar Excel
                  </button>

                  {/* ESPACIO NUCLEAR DE DESTRUCCIÓN */}
                  <div className="relative overflow-hidden rounded-xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-3xl rounded-full pointer-events-none"></div>
                    <button
                      onClick={handleDeleteSecrets}
                      className="w-full relative z-10 bg-red-600 hover:bg-red-700 text-white p-6 rounded-xl text-lg font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-red-900/50 border border-red-500"
                    >
                      <Trash2 size={24} />
                      Eliminar
                    </button>
                  </div>

                  {/* ESPACIO LIMPIEZA DE ARCHIVOS HUÉRFANOS */}
                  <div className="md:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-4 mt-2">
                    <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                      <Database size={16} />
                      Limpieza Selectiva de Archivos en la Nube
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Borra permanentemente fotos y firmas que ya no tienen un envío asociado en tu panel. Puedes filtrar por la fecha en la que se subió la foto.</p>
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 mb-1">Desde la fecha (Opcional)</label>
                        <input
                          type="date"
                          value={orphanStartDate}
                          onChange={(e) => setOrphanStartDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm focus:border-blue-500 outline-none [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 mb-1">Hasta la fecha (Opcional)</label>
                        <input
                          type="date"
                          value={orphanEndDate}
                          onChange={(e) => setOrphanEndDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm focus:border-blue-500 outline-none [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleCleanOrphanedFiles}
                      className="w-full relative z-10 bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-700/50 p-3 rounded-xl text-sm font-bold flex items-center justify-center gap-3 transition-all active:scale-95"
                    >
                      <Trash2 size={18} />
                      Liberar Espacio: Borrar Archivos Huérfanos
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-amber-50 rounded-lg flex items-start gap-3 text-amber-800 text-sm">
              <Database size={16} className="mt-0.5 shrink-0" />
              <p>
                <strong>Nota:</strong> Los datos se guardan automáticamente en este navegador o en la nube (si están sincronizados).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESTAURACIÓN INTELIGENTE */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Database size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Caja Fuerte / Restauración</h3>
              </div>
              <button onClick={() => setShowRestoreModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                 <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                Has cargado un archivo de copia de seguridad. Selecciona qué áreas de Sumtrans deseas restaurar. 
                Tus datos actuales en la Nube se empalmarán, sin borrar lo más nuevo.
              </p>

              <div className="space-y-3">
                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.articles} onChange={(e) => setRestoreOptions(p => ({...p, articles: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Catálogo de Artículos y Servicios</div>
                     <div className="text-xs text-slate-500">Recuperar artículos, precios base e IDs borrados.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.clients} onChange={(e) => setRestoreOptions(p => ({...p, clients: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Cartera Inmensa de Clientes</div>
                     <div className="text-xs text-slate-500">Recuperar cuentas de cliente y validaciones.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.tariffs} onChange={(e) => setRestoreOptions(p => ({...p, tariffs: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Tarifas Pre-asignadas y Clasificación</div>
                     <div className="text-xs text-slate-500">Recuperar los precios fijos del catálogo para los B2B.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.drivers} onChange={(e) => setRestoreOptions(p => ({...p, drivers: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Conductores y Permisos</div>
                     <div className="text-xs text-slate-500">Restaura los carnets, contraseñas y accesos.</div>
                   </div>
                 </label>
                 
                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.vehicles} onChange={(e) => setRestoreOptions(p => ({...p, vehicles: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Registro de Vehículos (Flota)</div>
                     <div className="text-xs text-slate-500">Seguros, ITV y control de la flota.</div>
                   </div>
                 </label>

                 <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${restoreOptions.shipments ? 'bg-red-50 border-red-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                   <input type="checkbox" checked={restoreOptions.shipments} onChange={(e) => setRestoreOptions(p => ({...p, shipments: e.target.checked}))} className={`mt-1 w-5 h-5 rounded ${restoreOptions.shipments ? 'text-red-600' : 'text-slate-400'}`} />
                   <div>
                     <div className={`font-bold text-sm ${restoreOptions.shipments ? 'text-red-700' : 'text-slate-700'}`}>Viajes y Entregas Diarias (¡PELIGRO TÉRMICO!)</div>
                     <div className={`text-xs ${restoreOptions.shipments ? 'text-red-600' : 'text-slate-500'}`}>Si marcas esto, desharás todo el trabajo en la carretera realizado desde que se hizo esta copia... <strong>Eliminarás las entregas de hoy y firmas.</strong></div>
                   </div>
                 </label>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => setShowRestoreModal(false)}
                className="flex-[1] py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmRestore}
                disabled={!restoreOptions.articles && !restoreOptions.clients && !restoreOptions.tariffs && !restoreOptions.drivers && !restoreOptions.vehicles && !restoreOptions.shipments && !restoreOptions.fuelLogs}
                className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                <RotateCcw size={18} />
                Confirmar Restauración (Fusión Nube)
              </button>
            </div>
          </div>
        </div>
      )}

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

    </Layout>
  )
}

export default App
