import fs from 'fs';

let code = fs.readFileSync('src/App.jsx', 'utf8');

// 1. Añadir estado driversSubTab
code = code.replace(
  "const [currentView, setCurrentView] = useState('dashboard')",
  "const [currentView, setCurrentView] = useState('dashboard')\n  const [driversSubTab, setDriversSubTab] = useState('directorio')"
);

// 2. Encontrar bloque de settings
const settingsStart = code.indexOf("{currentView === 'settings' && (");
const timeLogsStart = code.indexOf("{/* ⏱️⏱️⏱️ CONTROL HORARIO ⏱️⏱️⏱️ */}");
const backupStart = code.indexOf('<div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">\n                <div className="flex items-center gap-3 mb-4">\n                  <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">\n                  <Database size={24} />');

const settingsStringBeforeBackup = code.substring(timeLogsStart, backupStart);

// Remove the extracted UI from settings
code = code.slice(0, timeLogsStart) + code.slice(backupStart);

// 3. Transform the drivers block
const driversBlockTarget = "{currentView === 'drivers' && <Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />}";

let newSettingsBlock = settingsStringBeforeBackup;

newSettingsBlock = newSettingsBlock.replace(
  '<TimeLogsAdmin />',
  "{driversSubTab === 'horario' && <div className=\"animate-in fade-in duration-300\"><TimeLogsAdmin /></div>}"
);

newSettingsBlock = newSettingsBlock.replace(
  '{/* ⏱️⏱️⏱️ GPS & ALERTAS ⏱️⏱️⏱️ */}',
  ''
);

const gpsHeaderIndex = newSettingsBlock.indexOf('<div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">\n                <div className="flex items-center justify-between mb-4">\n                  <div className="flex items-center gap-3">');
// Wait, looking at App.jsx, what is the exact string for GPS?
// In my previous grep it was:
// <div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">
//                 <div className="flex items-center gap-3 mb-4">
//                   <div className="p-2 bg-blue-100 text-blue-600 rounded-lg">
//                     <Settings size={24} />

// I will just use string splitting based on "Driver Alerts" comment
const alertsHeaderIndex = newSettingsBlock.indexOf('              {/* Driver Alerts */}');
const timeLogsRegex = /{driversSubTab === 'horario' && <div className="animate-in fade-in duration-300"><TimeLogsAdmin \/><\/div>}/;

const tMatch = newSettingsBlock.match(timeLogsRegex);
const afterTimeLogs = tMatch.index + tMatch[0].length;

let gpsChunk = newSettingsBlock.substring(afterTimeLogs, alertsHeaderIndex).trim();
let alertsChunk = newSettingsBlock.substring(alertsHeaderIndex).trim();

const fullDriversBlock = `{currentView === 'drivers' && (
  <div className="h-full flex flex-col bg-slate-50">
    <div className="bg-white border-b border-slate-200 px-6 pt-2 flex gap-4 shrink-0 overflow-x-auto">
      <button onClick={() => setDriversSubTab('directorio')} className={\`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${driversSubTab === 'directorio' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Directorio Conductores</button>
      <button onClick={() => setDriversSubTab('horario')} className={\`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${driversSubTab === 'horario' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Control Horario</button>
      <button onClick={() => setDriversSubTab('gps')} className={\`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${driversSubTab === 'gps' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Rastreo GPS</button>
      <button onClick={() => setDriversSubTab('alertas')} className={\`pb-3 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${driversSubTab === 'alertas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Alertas Obligatorias</button>
    </div>
    <div className="flex-1 overflow-auto">
      {driversSubTab === 'directorio' && <Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />}
      
      {driversSubTab !== 'directorio' && (
        <div className="p-6 max-w-4xl mx-auto space-y-6">
            {driversSubTab === 'horario' && <div className="animate-in fade-in duration-300"><TimeLogsAdmin /></div>}
            {driversSubTab === 'gps' && <div className="animate-in fade-in duration-300">\n${gpsChunk}\n</div>}
            {driversSubTab === 'alertas' && <div className="animate-in fade-in duration-300">\n${alertsChunk}\n</div>}
        </div>
      )}
    </div>
  </div>
)}`;

code = code.replace(driversBlockTarget, fullDriversBlock);

fs.writeFileSync('src/App.jsx', code);
console.log('Success!');
