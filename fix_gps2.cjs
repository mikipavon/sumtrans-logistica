const fs = require('fs');

let drivers = fs.readFileSync('src/pages/Drivers.jsx', 'utf8');

const jsxRegex = /            <div className="mb-8">\r?\n(                \{\/\* â• â• â• â• â• â•  GPS & ALERTAS[\s\S]*?)            <\/div>\r?\n\r?\n            <DndContext/;
const match = drivers.match(jsxRegex) || drivers.match(/            <div className="mb-8">\r?\n(                \{\/\* [\s\S]*?)            <\/div>\r?\n\r?\n            <DndContext/);

if (!match) {
    console.error('JSX block not found in Drivers.jsx');
    process.exit(1);
}

let jsxContent = match[1];

// Fix the encoding
jsxContent = jsxContent.replace(/SeÃ±al/g, 'Señal');
jsxContent = jsxContent.replace(/AutomÃ¡tica/g, 'Automática');
jsxContent = jsxContent.replace(/cuÃ¡nto/g, 'cuánto');
jsxContent = jsxContent.replace(/mÃ³vil/g, 'móvil');
jsxContent = jsxContent.replace(/envÃ­a/g, 'envía');
jsxContent = jsxContent.replace(/ubicaciÃ³n/g, 'ubicación');
jsxContent = jsxContent.replace(/automÃ¡ticamente/g, 'automáticamente');
jsxContent = jsxContent.replace(/posiciÃ³n/g, 'posición');
jsxContent = jsxContent.replace(/mÃ¡s/g, 'más');
jsxContent = jsxContent.replace(/baterÃ­a/g, 'batería');
jsxContent = jsxContent.replace(/ðŸ“ /g, '📍');
jsxContent = jsxContent.replace(/âš¡/g, '⚡');
jsxContent = jsxContent.replace(/ðŸ””/g, '🔔');
jsxContent = jsxContent.replace(/ðŸ“‹/g, '📋');
jsxContent = jsxContent.replace(/âœ /g, '✏️');
jsxContent = jsxContent.replace(/âœ¨/g, '✨');
jsxContent = jsxContent.replace(/TÃ­tulo/g, 'Título');

// Remove wrapper
jsxContent = jsxContent.replace(/\{\/\* .* GPS & ALERTAS .* \*\/\}/g, '');
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

fs.writeFileSync('src/components/drivers/GpsAlertsModal.jsx', modalStart + jsxContent + modalEnd, 'utf8');

drivers = drivers.replace(match[0], '            <DndContext');

const routesBtnRegex = /(<button\r?\n\s+onClick=\{\(\) => setIsRoutesModalOpen\(true\)\}[\s\S]*?<\/button>)/;
const newBtn = `                    <button
                        onClick={() => setIsGpsAlertsModalOpen(true)}
                        className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-bold hover:bg-indigo-100 transition-colors flex items-center gap-2"
                        title="Configurar GPS y Alertas"
                    >
                        <Settings size={16} /> GPS / Alertas
                    </button>`;
drivers = drivers.replace(routesBtnRegex, newBtn + '\n' + '$1');

if (!drivers.includes("import GpsAlertsModal")) {
    drivers = drivers.replace(
        "import PayrollUploadModal from '../components/drivers/PayrollUploadModal';",
        "import PayrollUploadModal from '../components/drivers/PayrollUploadModal';\nimport GpsAlertsModal from '../components/drivers/GpsAlertsModal';"
    );
}

if (!drivers.includes("isGpsAlertsModalOpen")) {
    drivers = drivers.replace(
        'const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);',
        'const [isPayrollModalOpen, setIsPayrollModalOpen] = useState(false);\n    const [isGpsAlertsModalOpen, setIsGpsAlertsModalOpen] = useState(false);'
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

fs.writeFileSync('src/pages/Drivers.jsx', drivers, 'utf8');
console.log('done');
