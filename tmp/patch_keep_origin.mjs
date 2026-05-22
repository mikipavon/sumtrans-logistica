import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const targetLabel = `                                        <div className="flex justify-between items-center mb-1">
                                            <label className={labelClass + " !mb-0"}>Cliente</label>
                                            <button 
                                                type="button"
                                                onClick={() => startListening('sender', 'clientName')}`;

const replaceLabel = `                                        <div className="flex justify-between items-center mb-1">
                                            <div className="flex items-center gap-3">
                                                <label className={labelClass + " !mb-0"}>Cliente</label>
                                                <label className="flex items-center gap-1.5 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full text-[10px] text-blue-700 font-bold transition-colors shadow-sm border border-blue-100" title="Al guardar, mantendrá los datos del remitente para que puedas meter otro paquete más rápido">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={keepOrigin}
                                                        onChange={(e) => setKeepOrigin(e.target.checked)}
                                                        className="w-3 h-3 rounded border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="select-none">Fijar Remitente (Múltiple)</span>
                                                </label>
                                            </div>
                                            <button 
                                                type="button"
                                                onClick={() => startListening('sender', 'clientName')}`;

const targetBottom = `                        <div className="px-5 py-3 bg-blue-50/50 border-t border-blue-100 flex items-center gap-3">
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
                        </div>`;

const normC = content.replace(/\r\n/g, '\n');
const normT1 = targetLabel.replace(/\r\n/g, '\n');
let replaced1 = false;
let replaced2 = false;

if (normC.includes(normT1)) {
    content = normC.replace(normT1, replaceLabel.replace(/\r\n/g, '\n'));
    replaced1 = true;
}

const normC2 = content.replace(/\r\n/g, '\n');
const normT2 = targetBottom.replace(/\r\n/g, '\n');

if (normC2.includes(normT2)) {
    content = normC2.replace(normT2, '');
    replaced2 = true;
}

if (replaced1 && replaced2) {
    fs.writeFileSync(path, content, 'utf8');
    console.log("✅ CreateShipmentModal keepOrigin relocated");
} else {
    console.log("❌ Target not found. Replaced1:", replaced1, "Replaced2:", replaced2);
}
