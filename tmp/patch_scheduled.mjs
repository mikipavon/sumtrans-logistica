import fs from 'fs';

const path = 'src/components/shipments/ShipmentDetailsModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                                        <option value="Paid">Cobrado / Liquidado</option>
                                        <option value="Pending">Pendiente de Cobro (Deuda)</option>
                                    </select>
                                </div>

                                <div className="space-y-3 pt-1">`;

const replace = `                                        <option value="Paid">Cobrado / Liquidado</option>
                                        <option value="Pending">Pendiente de Cobro (Deuda)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Conductor Asignado</span>
                                    <select 
                                        value={formData.assignedDriverId || ''}
                                        onChange={(e) => handleChange('assignedDriverId', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="">Sin Asignar</option>
                                        {drivers.map(d => (
                                            <option key={d.id} value={d.id}>{d.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Fecha Programada (Mañana, etc.)</span>
                                    <input 
                                        type="date"
                                        value={formData.scheduledDate || ''}
                                        onChange={(e) => handleChange('scheduledDate', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold"
                                    />
                                </div>

                                <div className="space-y-3 pt-1">`;

const normC = content.replace(/\r\n/g, '\n');
const normT = target.replace(/\r\n/g, '\n');

if (normC.includes(normT)) {
    fs.writeFileSync(path, normC.replace(normT, replace.replace(/\r\n/g, '\n')), 'utf8');
    console.log("✅ ShipmentDetailsModal Admin controls added");
} else {
    // try finding just the end
    console.log("❌ Target not found");
}
