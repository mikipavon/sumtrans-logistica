const fs = require('fs');

const appFile = 'src/App.jsx';
const driversFile = 'src/pages/Drivers.jsx';
const modalFile = 'src/components/drivers/GpsAlertsModal.jsx';

let app = fs.readFileSync(appFile, 'utf8');
let drivers = fs.readFileSync(driversFile, 'utf8');

// 1. Extract state from App.jsx
const stateMatch = app.match(/  \/\/ Alert form state \(Settings page\)\r?\n  const \[showNewAlertForm, setShowNewAlertForm\] = useState\(false\);\r?\n  const \[editingAlertId, setEditingAlertId\] = useState\(null\);\r?\n  const \[newAlertForm, setNewAlertForm\] = useState\(\{ title: '', message: '', icon: '🔔', dayOfWeek: undefined, timeFrom: '', timeTo: '', confirmText: '', targetDriverIds: \[\] \}\);\r?\n  const \[alertHistory, setAlertHistory\] = useState\(\[\]\);\r?\n  const \[showAlertHistory, setShowAlertHistory\] = useState\(false\);\r?\n  const \[alertHistoryFilter, setAlertHistoryFilter\] = useState\('all'\); \/\/ 'all' or driverId\r?\n/);
app = app.replace(stateMatch[0], '');

// 2. Extract JSX from App.jsx
const jsxStartRegex = /          \{\/\* ══════ GPS & ALERTAS ══════ \*\/\}[\s\S]*?\{\/\* ══════ BACKUP & DATA \(existing\) ══════ \*\/\}/;
const match = app.match(jsxStartRegex);
let jsxContent = match[0].replace('          {/* ══════ BACKUP & DATA (existing) ══════ */}', '').trim();

// Remove from App.jsx
app = app.replace(match[0], '          {/* ══════ BACKUP & DATA (existing) ══════ */}');

// 3. Update Drivers props in App.jsx
app = app.replace(
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />",
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} gpsIntervalMinutes={gpsIntervalMinutes} setGpsIntervalMinutes={setGpsIntervalMinutes} driverAlerts={driverAlerts} setDriverAlerts={setDriverAlerts} />"
);

// 4. Create GpsAlertsModal.jsx
jsxContent = jsxContent.replace(/\{\/\* ══════ GPS & ALERTAS ══════ \*\/\}/, '');
jsxContent = jsxContent.replace(/<div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">/, '');
jsxContent = jsxContent.replace(/<div className="flex items-center gap-3 mb-6">[\s\S]*?<\/div>\r?\n              <\/div>\r?\n            <\/div>/, '');
const lastDivIndex = jsxContent.lastIndexOf('</div>');
jsxContent = jsxContent.substring(0, lastDivIndex) + jsxContent.substring(lastDivIndex + 6);

const modalStart = `import { X, Save, Plus, Trash2, Settings } from 'lucide-react';
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
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
`;

const modalEnd = `
                    </div>
                </div>
            </div>
        </div>
    );
}
`;

fs.writeFileSync(modalFile, modalStart + jsxContent + modalEnd, 'utf8');

// 5. Update Drivers.jsx
drivers = drivers.replace(
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder }) {',
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder, gpsIntervalMinutes, setGpsIntervalMinutes, driverAlerts, setDriverAlerts }) {'
);

drivers = drivers.replace(
    '    const [showInactive, setShowInactive] = useState(false);',
    '    const [showInactive, setShowInactive] = useState(false);\n' + stateMatch[0] + '    const [isGpsAlertsModalOpen, setIsGpsAlertsModalOpen] = useState(false);\n'
);

const routesBtnRegex = /(<button\r?\n\s+onClick=\{\(\) => setIsRoutesModalOpen\(true\)\}[\s\S]*?<\/button>)/;
const newBtn = `                    <button
                        onClick={() => setIsGpsAlertsModalOpen(true)}
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                        title="Configurar GPS y Alertas"
                    >
                        <Settings size={16} /> GPS / Alertas
                    </button>`;
drivers = drivers.replace(routesBtnRegex, newBtn + '\n' + '$1');

drivers = drivers.replace(
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route } from 'lucide-react';",
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route, Settings } from 'lucide-react';"
);

drivers = drivers.replace(
    "import PayrollUploadModal from '../components/drivers/PayrollUploadModal';",
    "import PayrollUploadModal from '../components/drivers/PayrollUploadModal';\nimport GpsAlertsModal from '../components/drivers/GpsAlertsModal';"
);

if (!drivers.includes("import { supabase }")) {
    drivers = drivers.replace(
        "import { useState, useMemo } from 'react';",
        "import { useState, useMemo } from 'react';\nimport { supabase } from '../lib/supabase';"
    );
}

const modalComponentCall = `
            <GpsAlertsModal
                isOpen={isGpsAlertsModalOpen}
                onClose={() => setIsGpsAlertsModalOpen(false)}
                drivers={drivers}
                gpsIntervalMinutes={gpsIntervalMinutes}
                setGpsIntervalMinutes={setGpsIntervalMinutes}
                driverAlerts={driverAlerts}
                setDriverAlerts={setDriverAlerts}
                showNewAlertForm={showNewAlertForm}
                setShowNewAlertForm={setShowNewAlertForm}
                editingAlertId={editingAlertId}
                setEditingAlertId={setEditingAlertId}
                newAlertForm={newAlertForm}
                setNewAlertForm={setNewAlertForm}
                alertHistory={alertHistory}
                setAlertHistory={setAlertHistory}
                showAlertHistory={showAlertHistory}
                setShowAlertHistory={setShowAlertHistory}
                alertHistoryFilter={alertHistoryFilter}
                setAlertHistoryFilter={setAlertHistoryFilter}
            />
`;

drivers = drivers.replace(
    '        </div>\n    );\n}',
    '        </div>\n' + modalComponentCall + '    );\n}'
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(driversFile, drivers);
console.log('Migration successful');
