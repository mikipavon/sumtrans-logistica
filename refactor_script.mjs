import fs from 'fs';

let code = fs.readFileSync('src/App.jsx', 'utf8');

const tLogS = code.indexOf('{/* ⏱️⏱️⏱️ CONTROL HORARIO ⏱️⏱️⏱️ */}');
const backS = code.indexOf('<Database size={24} />');
const backupStart = code.lastIndexOf('<div className="bg-slate-50 border border-slate-200 p-6 rounded-xl">', backS);

const settingsChunk = code.substring(tLogS, backupStart);
code = code.substring(0, tLogS) + code.substring(backupStart);

// Now wrap settingsChunk
const timeLogsCode = settingsChunk.substring(0, settingsChunk.indexOf('{/* ⏱️⏱️⏱️ GPS & ALERTAS ⏱️⏱️⏱️ */}'));
let rest = settingsChunk.substring(settingsChunk.indexOf('{/* ⏱️⏱️⏱️ GPS & ALERTAS ⏱️⏱️⏱️ */}'));
const alertsStart = rest.indexOf('{/* Driver Alerts */}');
const gpsCode = rest.substring(0, alertsStart);
const alertsCode = rest.substring(alertsStart);

const driversBlockTarget = "{currentView === 'drivers' && <Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />}";

const replacement = `{currentView === 'drivers' && (
  <div className="h-full flex flex-col bg-slate-50 w-full overflow-hidden">
    <div className="bg-white border-b border-slate-200 px-6 flex gap-4 shrink-0 overflow-x-auto">
      <button onClick={() => setCurrentTab('directorio')} className={\`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${(!currentTab || currentTab === 'directorio') ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Directorio</button>
      <button onClick={() => setCurrentTab('horario')} className={\`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${currentTab === 'horario' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Control Horario</button>
      <button onClick={() => setCurrentTab('gps')} className={\`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${currentTab === 'gps' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Rastreo GPS</button>
      <button onClick={() => setCurrentTab('alertas')} className={\`py-4 text-sm font-bold border-b-2 transition-colors whitespace-nowrap \${currentTab === 'alertas' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-700'}\`}>Alertas</button>
    </div>
    <div className="flex-1 overflow-auto h-full">
      {(!currentTab || currentTab === 'directorio') && <Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} />}
      {currentTab === 'horario' && <div className="p-6 max-w-6xl mx-auto animate-in fade-in">\n${timeLogsCode}\n</div>}
      {currentTab === 'gps' && <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in">\n${gpsCode}\n</div>}
      {currentTab === 'alertas' && <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in">\n${alertsCode}\n</div>}
    </div>
  </div>
)}`;

code = code.replace(driversBlockTarget, replacement);

fs.writeFileSync('src/App.jsx', code);
console.log('Success!');
