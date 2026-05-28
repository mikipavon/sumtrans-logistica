const fs = require('fs');

const appFile = 'src/App.jsx';
const driversFile = 'src/pages/Drivers.jsx';

let app = fs.readFileSync(appFile, 'utf8');
let drivers = fs.readFileSync(driversFile, 'utf8');

const stateBlock = fs.readFileSync('app_state_block.txt', 'utf8');
const jsxBlock = fs.readFileSync('app_jsx_block.txt', 'utf8');

// 1. Remove from App.jsx
app = app.replace(stateBlock, '');
app = app.replace(jsxBlock, '');

// 2. Update Drivers props in App.jsx
app = app.replace(
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />",
    "<Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} gpsIntervalMinutes={gpsIntervalMinutes} setGpsIntervalMinutes={setGpsIntervalMinutes} driverAlerts={driverAlerts} setDriverAlerts={setDriverAlerts} />"
);

// 3. Inject state into Drivers.jsx
drivers = drivers.replace(
    '    const [showInactive, setShowInactive] = useState(false);',
    '    const [showInactive, setShowInactive] = useState(false);\n\n' + stateBlock
);

// 4. Inject JSX into Drivers.jsx
drivers = drivers.replace(
    '            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>',
    '            <div className="mb-8">\n' + jsxBlock + '\n            </div>\n\n            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>'
);

// 5. Update props of Drivers.jsx
drivers = drivers.replace(
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder }) {',
    'export default function Drivers({ drivers, onAddDriver, onUpdateDriver, onDeleteDriver, shipments, clients, onImpersonate, onNavigate, isGhostModeUnlocked, routes = [], onUpdateRoutes, routeKnowledge = {}, onUpdateRouteKnowledge, driverOrder = [], onUpdateDriverOrder, gpsIntervalMinutes, setGpsIntervalMinutes, driverAlerts, setDriverAlerts }) {'
);

// 6. Update imports in Drivers.jsx
drivers = drivers.replace(
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route } from 'lucide-react';",
    "import { User, Phone, Star, Map as MapIcon, Clock, Truck, Trash2, CheckCircle, Route, Settings, Database, Folder } from 'lucide-react';"
);

if (!drivers.includes("import { supabase }")) {
    drivers = drivers.replace(
        "import { useState, useMemo } from 'react';",
        "import { useState, useMemo } from 'react';\nimport { supabase } from '../lib/supabase';"
    );
}

fs.writeFileSync(appFile, app);
fs.writeFileSync(driversFile, drivers);
console.log('Migration successful');
