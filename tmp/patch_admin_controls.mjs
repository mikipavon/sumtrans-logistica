import fs from 'fs';

const path = 'src/components/shipments/ShipmentDetailsModal.jsx';
let content = fs.readFileSync(path, 'utf8');

const target = `                                        <p className="text-[10px] font-bold text-red-600 drop-shadow-sm mt-1.5 leading-tight">
                                            ⚠️ Advertencia: Revertir la entrega borrará todas las firmas, fotos de evidencia y horas de entrega asociadas al guardado.
                                        </p>
                                    )}
                                </div>
                                <div className="space-y-3 pt-1">`;

const replacement = `                                        <p className="text-[10px] font-bold text-red-600 drop-shadow-sm mt-1.5 leading-tight">
                                            ⚠️ Advertencia: Revertir la entrega borrará todas las firmas, fotos de evidencia y horas de entrega asociadas al guardado.
                                        </p>
                                    )}
                                </div>
                                
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Tipo de Porte (Responsable)</span>
                                    <select 
                                        value={formData.porteType || 'Pagado'}
                                        onChange={(e) => handleChange('porteType', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="Pagado">Pagado (Remitente)</option>
                                        <option value="Debido">Debido (Beneficiario)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Estado Financiero (Caja)</span>
                                    <select 
                                        value={formData.paymentStatus || 'Pending'}
                                        onChange={(e) => {
                                            handleChange('paymentStatus', e.target.value);
                                            if (e.target.value === 'Pending') {
                                                handleChange('portePaid', false);
                                                handleChange('isPaid', false);
                                            }
                                        }}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="Paid">Cobrado / Liquidado</option>
                                        <option value="Pending">Pendiente de Cobro (Deuda)</option>
                                    </select>
                                </div>

                                <div className="space-y-3 pt-1">`;

if (content.includes(target)) {
    content = content.replace(target, replacement);
} else {
    // Normalization fallback
    const normC = content.replace(/\r\n/g, '\n');
    const normT = target.replace(/\r\n/g, '\n');
    if (normC.includes(normT)) {
        content = normC.replace(normT, replacement.replace(/\r\n/g, '\n'));
    } else {
        console.log("❌ Target not found");
        process.exit(1);
    }
}

fs.writeFileSync(path, content, 'utf8');
console.log("✅ ShipmentDetailsModal UI Patched");

