import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Add state
const stateTarget = "const [listeningField, setListeningField] = useState(null);";
const stateAdd = "const [listeningField, setListeningField] = useState(null);\n    const [keepOrigin, setKeepOrigin] = useState(false);";
if (content.includes(stateTarget)) {
    content = content.replace(stateTarget, stateAdd);
    console.log("✅ State added");
}

// 2. Modify finalizeSubmit
const submitTarget = `        setSelectedDebtIds([]);
        onSave(finalData);
        onClose();
        setShowPaymentAlert(false);`;

const submitReplace = `        setSelectedDebtIds([]);
        onSave(finalData);
        setShowPaymentAlert(false);
        
        if (keepOrigin) {
            // Reset only destination and specific shipment info
            setFormData(prev => ({
                ...prev,
                destinationName: '',
                destinationAddress: '',
                destinationZip: '',
                destinationCity: '',
                destinationPhone: '',
                destinationCoordinates: '',
                amount: '',
                observations: '',
                hasCod: false,
                codAmount: '',
                codCommission: '',
                hasReturn: false,
                needsSignatureReturn: false
            }));
            setSelectedArticles([]);
            setWeightKg('');
            setMerchandisePhoto(null);
            
            // Show brief visual feedback (could be a toast, but an alert is simple and blocks to avoid double submit)
            // But browser alert breaks flow. We can just let it blank out, the user will see it form cleared except origin.
        } else {
            onClose();
        }`;

if (content.includes(submitTarget)) {
    content = content.replace(submitTarget, submitReplace);
    console.log("✅ finalizeSubmit patched");
}

// 3. Add checkbox UI near the submit buttons
const uiTarget = `                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancelar</button>
                            <button type="submit" className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm"><Package size={18} />Generar Albarán</button>
                    </div>`;

const uiReplace = `                        <div className="px-5 py-3 bg-blue-50/50 border-t border-blue-100 flex items-center gap-3">
                            <input 
                                type="checkbox" 
                                id="keepOriginCheck"
                                checked={keepOrigin}
                                onChange={(e) => setKeepOrigin(e.target.checked)}
                                className="w-5 h-5 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <label htmlFor="keepOriginCheck" className="text-sm font-bold text-blue-800 cursor-pointer select-none">
                                Envío Múltiple (Mantener Remitente / Origen para el siguiente albarán)
                            </label>
                        </div>
                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 rounded-b-2xl">
                            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200 transition-colors text-sm">Cancelar</button>
                            <button type="submit" className="flex-[2] bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 text-sm"><Package size={18} />Generar Albarán</button>
                    </div>`;

if (content.includes(uiTarget)) {
    content = content.replace(uiTarget, uiReplace);
    console.log("✅ UI patched");
} else {
    // If exact whitespace mismatches
    const idx = content.indexOf('Generar Albarán</button>');
    if (idx !== -1) {
        console.log("Found end of form, will insert before it");
    } else {
        console.log("❌ UI string not found!");
    }
}

fs.writeFileSync(path, content, 'utf8');
