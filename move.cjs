const fs = require('fs');

const appFile = 'src/App.jsx';
const driversFile = 'src/pages/Drivers.jsx';

let app = fs.readFileSync(appFile, 'utf8');
let drivers = fs.readFileSync(driversFile, 'utf8');

// 1. Extract state from App.jsx
const stateMatch = app.match(/  \/\/ Alert form state \(Settings page\)\r?\n  const \[showNewAlertForm, setShowNewAlertForm\] = useState\(false\);\r?\n  const \[editingAlertId, setEditingAlertId\] = useState\(null\);\r?\n  const \[newAlertForm, setNewAlertForm\] = useState\(\{ title: '', message: '', icon: '🔔', dayOfWeek: undefined, timeFrom: '', timeTo: '', confirmText: '', targetDriverIds: \[\] \}\);\r?\n  const \[alertHistory, setAlertHistory\] = useState\(\[\]\);\r?\n  const \[showAlertHistory, setShowAlertHistory\] = useState\(false\);\r?\n  const \[alertHistoryFilter, setAlertHistoryFilter\] = useState\('all'\); \/\/ 'all' or driverId\r?\n/);

if (!stateMatch) {
    console.error('State not found in App.jsx');
    process.exit(1);
}

app = app.replace(stateMatch[0], '');

// 2. Extract JSX from App.jsx
const jsxStartRegex = /          \{\/\* ══════ GPS & ALERTAS ══════ \*\/\}[\s\S]*?            <div className="mt-8 border-t border-slate-100 pt-8">/g;
const matches = [...app.matchAll(jsxStartRegex)];

if (matches.length === 0) {
    console.error('JSX not found in App.jsx');
    process.exit(1);
}

// We need to cut everything from "GPS & ALERTAS" up to just before the "NUEVA SECCIÓN DE COPIA AVANZADA"
let jsxContent = matches[0][0].replace(/            <div className="mt-8 border-t border-slate-100 pt-8">$/, '');
jsxContent = jsxContent.trim(); // This is the block to move

// Remove the block from App.jsx
app = app.replace(jsxContent, '');

// Clean up remaining empty spaces in App.jsx
app = app.replace(/          \{\/\* ══════ GPS & ALERTAS ══════ \*\/\}[\s\S]*?\{\/\* ══════ BACKUP & DATA \(existing\) ══════ \*\/\}/, '{/* ══════ BACKUP & DATA (existing) ══════ */}');

// 3. Update Drivers.jsx props
drivers = drivers.replace(
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder }) {',
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder, gpsIntervalMinutes, setGpsIntervalMinutes, driverAlerts, setDriverAlerts }) {'
);

// 4. Inject state into Drivers.jsx
drivers = drivers.replace(
    '    const [showInactive, setShowInactive] = useState(false);',
    '    const [showInactive, setShowInactive] = useState(false);\n' + stateMatch[0]
);

// Add missing Settings, Trash2 etc imports in Drivers.jsx
drivers = drivers.replace(
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route } from 'lucide-react';",
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route, Settings } from 'lucide-react';"
);

// Add supabase import to Drivers.jsx if missing
if (!drivers.includes("import { supabase }")) {
    drivers = drivers.replace(
        "import { useState, useMemo } from 'react';",
        "import { useState, useMemo } from 'react';\nimport { supabase } from '../lib/supabase';"
    );
}

// 5. Inject JSX into Drivers.jsx before the grid of drivers
drivers = drivers.replace(
    '            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>',
    '            <div className="mb-8">\n                ' + jsxContent + '\n            </div>\n\n            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>'
);


// 6. Update App.jsx where <Drivers /> is called
app = app.replace(
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />",
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} gpsIntervalMinutes={gpsIntervalMinutes} setGpsIntervalMinutes={setGpsIntervalMinutes} driverAlerts={driverAlerts} setDriverAlerts={setDriverAlerts} />"
);

fs.writeFileSync(appFile, app);
fs.writeFileSync(driversFile, drivers);
console.log('Migration successful');
