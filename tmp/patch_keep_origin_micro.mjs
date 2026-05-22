import fs from 'fs';

const path = 'src/components/shipments/CreateShipmentModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                                        <div className="flex justify-between items-center mb-1">
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
                                            <button `;

const replace = `                                        <div className="flex justify-between items-center mb-1">
                                            <label className={labelClass + " !mb-0"}>Cliente</label>
                                            <div className="flex items-center gap-2">
                                                <label className="flex items-center gap-1 cursor-pointer bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full text-[9px] text-blue-700 font-bold transition-colors shadow-sm border border-blue-200" title="Mantener origen para envío múltiple">
                                                    <input 
                                                        type="checkbox" 
                                                        checked={keepOrigin}
                                                        onChange={(e) => setKeepOrigin(e.target.checked)}
                                                        className="w-2.5 h-2.5 rounded-sm border-blue-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                    />
                                                    <span className="select-none uppercase">Envío Múltiple</span>
                                                </label>
                                                <button `;

const normC = content.replace(/\r\n/g, '\n');
const normT = target.replace(/\r\n/g, '\n');

if (normC.includes(normT)) {
    fs.writeFileSync(path, normC.replace(normT, replace.replace(/\r\n/g, '\n')), 'utf8');
    console.log("✅ CreateShipmentModal patched correctly");
} else {
    console.log("❌ Target not found");
}
