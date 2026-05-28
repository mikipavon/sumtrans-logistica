const fs = require('fs');

let oldApp = fs.readFileSync('temp_app_old.jsx', 'utf8');

// 1. Extract GPS & ALERTAS
const jsxStartRegex = /          \{\/\* ══════ GPS & ALERTAS ══════ \*\/\}[\s\S]*?\{\/\* ══════ BACKUP & DATA \(existing\) ══════ \*\/\}/;
const match1 = oldApp.match(jsxStartRegex);
let gpsBlock = match1[0].replace('          {/* ══════ BACKUP & DATA (existing) ══════ */}', '').trim();

gpsBlock = gpsBlock.replace(/\{\/\* ══════ GPS & ALERTAS ══════ \*\/\}/, '');
gpsBlock = gpsBlock.replace(/<div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">/, '');
gpsBlock = gpsBlock.replace(/<div className="flex items-center gap-3 mb-6">[\s\S]*?<\/div>\r?\n              <\/div>\r?\n            <\/div>/, '');
const lastDivIndex = gpsBlock.lastIndexOf('</div>');
gpsBlock = gpsBlock.substring(0, lastDivIndex) + gpsBlock.substring(lastDivIndex + 6);

// 2. Extract HISTORIAL
const modalRegex = /      \{\/\* MODAL DE HISTORIAL DE ALERTAS CONFIRMADAS \*\/\}[\s\S]*?      \)\}/;
const match2 = oldApp.match(modalRegex);
let historyBlock = match2[0];

const modalStart = `import { X, Save, Plus, Trash2, Settings, Clock } from 'lucide-react';
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
`;

const modalEnd = `
                    </div>
                </div>
            </div>
        </div>
        ${historyBlock}
        </>
    );
}
`;

fs.writeFileSync('src/components/drivers/GpsAlertsModal.jsx', modalStart + gpsBlock + modalEnd, 'utf8');
console.log('Fixed GpsAlertsModal.jsx');
