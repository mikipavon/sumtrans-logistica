import fs from 'fs';

// ---------------------------------------------------------
// 1. RoutesManagerModal.jsx
// ---------------------------------------------------------
let rmPath = 'src/components/drivers/RoutesManagerModal.jsx';
let rmContent = fs.readFileSync(rmPath, 'utf8');

// Replace handleAddRoute definition
rmContent = rmContent.replace(
    /poblaciones: \[\]/g,
    "poblacionesManana: [],\n            poblacionesTarde: []"
);

// Replace handleTownsChange (make it dynamic)
const oldHandleTowns = `    const handleTownsChange = (index, valStr) => {
        const next = [...localRoutes];
        // Split by comma, trim, remove empty
        next[index].poblaciones = valStr.split(',').map(t => t.trim()).filter(t => t);
        setLocalRoutes(next);
    };`;
const newHandleTowns = `    const handleTownsChange = (index, field, valStr) => {
        const next = [...localRoutes];
        // Split by comma, trim, remove empty
        next[index][field] = valStr.split(',').map(t => t.trim()).filter(t => t);
        setLocalRoutes(next);
    };`;
if (rmContent.includes(oldHandleTowns)) {
    rmContent = rmContent.replace(oldHandleTowns, newHandleTowns);
}

// Replace the render of the textareas
const oldTextarea = `                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Pueblos (Separados por coma)</label>
                                    <textarea 
                                        value={route.poblaciones.join(', ')}
                                        onChange={(e) => handleTownsChange(i, e.target.value)}
                                        rows={2}
                                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-none custom-scrollbar"
                                        placeholder="Ej: Córdoba, Lucena, Cabra"
                                    />
                                </div>`;
const newTextareas = `                                <div>
                                    <label className="block text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">☀️ Pueblos de Mañana (Separados por coma)</label>
                                    <textarea 
                                        value={(route.poblacionesManana || route.poblaciones || []).join(', ')}
                                        onChange={(e) => handleTownsChange(i, 'poblacionesManana', e.target.value)}
                                        rows={2}
                                        className="w-full border border-amber-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-shadow resize-none custom-scrollbar"
                                        placeholder="Ej: Córdoba, Lucena, Cabra"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">🌙 Pueblos de Tarde (Separados por coma)</label>
                                    <textarea 
                                        value={(route.poblacionesTarde || []).join(', ')}
                                        onChange={(e) => handleTownsChange(i, 'poblacionesTarde', e.target.value)}
                                        rows={2}
                                        className="w-full border border-indigo-200 rounded-lg px-3 py-2 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow resize-none custom-scrollbar"
                                        placeholder="Ej: Carcabuey, Priego"
                                    />
                                </div>`;
rmContent = rmContent.replace(oldTextarea, newTextareas);

// Replace paragraph
rmContent = rmContent.replace(
    'Estas rutas pueden ser asignadas a cualquier conductor como "Ruta de Mañana" o "Ruta de Tarde".',
    'Las rutas unifican los pueblos que se deben visitar en la mañana y en la tarde.'
);

fs.writeFileSync(rmPath, rmContent, 'utf8');
console.log('✅ RoutesManagerModal updated');


// ---------------------------------------------------------
// 2. DriverProfileModal.jsx
// ---------------------------------------------------------
let dpPath = 'src/components/drivers/DriverProfileModal.jsx';
let dpContent = fs.readFileSync(dpPath, 'utf8');

// Fix form state defaults
dpContent = dpContent.replace(
    /morningRouteId: driver\.morningRouteId \|\| '',\s*afternoonRouteId: driver\.afternoonRouteId \|\| '',/g,
    "routeId: driver.routeId || '',"
);

// Replace the two selects with one
const oldSelects = `<div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-blue-200">
                                <div>
                                    <label className="block text-xs font-bold text-blue-800 mb-1 flex items-center gap-1">
                                        <Sun size={12} /> Ruta de Mañana
                                    </label>
                                    <select
                                        value={formData.morningRouteId}
                                        onChange={(e) => setFormData({ ...formData, morningRouteId: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">(Sin ruta fija)</option>
                                        {activeRoutes.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-blue-800 mb-1 flex items-center gap-1">
                                        <Moon size={12} /> Ruta de Tarde
                                    </label>
                                    <select
                                        value={formData.afternoonRouteId}
                                        onChange={(e) => setFormData({ ...formData, afternoonRouteId: e.target.value })}
                                        className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="">(Sin ruta fija)</option>
                                        {activeRoutes.map(r => (
                                            <option key={r.id} value={r.id}>{r.nombre}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>`;

const newSelect = `<div className="mt-6 pt-4 border-t border-blue-200">
                                <label className="block text-xs font-bold text-blue-800 mb-1 flex items-center gap-1">
                                    <MapPin size={12} /> Ruta Asignada
                                </label>
                                <select
                                    value={formData.routeId}
                                    onChange={(e) => setFormData({ ...formData, routeId: e.target.value })}
                                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                >
                                    <option value="">(Sin ruta asignada)</option>
                                    {activeRoutes.map(r => (
                                        <option key={r.id} value={r.id}>{r.nombre}</option>
                                    ))}
                                </select>
                            </div>`;
if (dpContent.includes(oldSelects)) {
    dpContent = dpContent.replace(oldSelects, newSelect);
}

fs.writeFileSync(dpPath, dpContent, 'utf8');
console.log('✅ DriverProfileModal updated');


// ---------------------------------------------------------
// 3. DriverDashboard.jsx
// ---------------------------------------------------------
let ddbPath = 'src/pages/driver/DriverDashboard.jsx';
let ddbContent = fs.readFileSync(ddbPath, 'utf8');

const oldOptVars = `                        const morningRoute = activeRoutes.find(r => r.id === currentDriver?.morningRouteId);
                        const afternoonRoute = activeRoutes.find(r => r.id === currentDriver?.afternoonRouteId);
                        
                        const driverMorningTowns = (morningRoute?.poblaciones || []).map(t => t.trim().toLowerCase());
                        const driverAfternoonTowns = (afternoonRoute?.poblaciones || []).map(t => t.trim().toLowerCase());`;

const newOptVars = `                        const activeRoute = activeRoutes.find(r => r.id === currentDriver?.routeId);
                        
                        // Fallback on poblaciones for older routes that haven't been migrated
                        const driverMorningTowns = (activeRoute?.poblacionesManana || activeRoute?.poblaciones || []).map(t => t.trim().toLowerCase());
                        const driverAfternoonTowns = (activeRoute?.poblacionesTarde || []).map(t => t.trim().toLowerCase());`;

// First format everything to \n to reliably match
const nDdbContent = ddbContent.replace(/\r\n/g, '\n');
const nOldVars = oldOptVars.replace(/\r\n/g, '\n');
const nNewVars = newOptVars.replace(/\r\n/g, '\n');

if (nDdbContent.includes(nOldVars)) {
    let result = nDdbContent.replace(nOldVars, nNewVars);
    fs.writeFileSync(ddbPath, result.replace(/\n/g, '\r\n'), 'utf8');
    console.log('✅ DriverDashboard optimizer updated');
} else {
    console.log('❌ Failed to update DriverDashboard optimizer');
}
