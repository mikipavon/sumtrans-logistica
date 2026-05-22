import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

// 1. Inject state
const stateTarget = `    const [selectedDebtIds, setSelectedDebtIds] = useState([]); // Deudas seleccionadas para cobrar`;
const stateReplace = `    const [selectedDebtIds, setSelectedDebtIds] = useState([]); // Deudas seleccionadas para cobrar
    const [showSuccessFeedback, setShowSuccessFeedback] = useState(false);`;

// 2. Inject success logic
const logicTarget = `        if (keepOrigin) {
            // Reset only destination and specific shipment info`;
const logicReplace = `        if (keepOrigin) {
            setShowSuccessFeedback(true);
            setTimeout(() => setShowSuccessFeedback(false), 3000);
            
            // Reset only destination and specific shipment info`;

// 3. Inject UI
const uiTarget = `                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="overflow-y-auto p-6 custom-scrollbar">`;

const uiReplace = `                    <button onClick={onClose} className="p-1.5 hover:bg-slate-200 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {showSuccessFeedback && (
                    <div className="bg-green-500 text-white px-6 py-3 flex items-center justify-center gap-2 font-bold animate-in slide-in-from-top-2 duration-300 shadow-sm z-50 relative transition-all">
                        <CheckCircle size={20} className="animate-bounce" />
                        ¡Albarán generado correctamente! Registros limpiados para el siguiente paquete.
                    </div>
                )}

                <div className="overflow-y-auto p-6 custom-scrollbar">`;

content = content.replace(stateTarget, stateReplace);
content = content.replace(logicTarget, logicReplace);

// Handle UI line endings just in case
const normC = content.replace(/\r\n/g, '\n');
const normT = uiTarget.replace(/\r\n/g, '\n');
if (normC.includes(normT)) {
    content = normC.replace(normT, uiReplace.replace(/\r\n/g, '\n'));
    fs.writeFileSync(path, content, 'utf8');
    console.log("✅ CreateShipmentModal visual feedback added");
} else {
    console.log("❌ UI Target not found");
}
