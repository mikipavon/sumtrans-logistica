import { useState, useMemo, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Trash2, Download, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { calcularComisionReembolso } from '../../utils/comisionReembolso';
import { buscarArticuloBadi as findBadiArticle, baremoDelPunto, precioUnitarioParaCliente, prefijoSerieDelCliente } from '../../utils/importacionEnvios';

// ─── Diccionario de sinónimos para mapeo inteligente ───
const FIELD_SYNONYMS = {
    destinationName: ['destinatario', 'nombre', 'receptor', 'consignee', 'name', 'nombre destinatario', 'razon social', 'razón social', 'empresa', 'dest', 'nombre empresa', 'nombre receptor'],
    destinationAddress: ['dirección', 'direccion', 'calle', 'address', 'domicilio', 'dir', 'dirección entrega', 'direccion entrega', 'via', 'calle y numero'],
    destinationCity: ['población', 'poblacion', 'ciudad', 'localidad', 'city', 'municipio', 'pueblo', 'town', 'plaza', 'destino'],
    destinationZip: ['cp', 'código postal', 'codigo postal', 'zip', 'c.p.', 'c.postal', 'cod postal', 'postal', 'postal code', 'cod. postal'],
    destinationPhone: ['teléfono', 'telefono', 'tel', 'phone', 'móvil', 'movil', 'contacto', 'tel.', 'tlf', 'fono', 'cel', 'celular', 'telf'],
    observations: ['observaciones', 'notas', 'nota', 'comentarios', 'obs', 'instrucciones', 'comments', 'notes'],
    codAmount: ['reembolso', 'cod', 'cobro', 'importe cobro', 'cash on delivery', 'contra reembolso', 'importe reembolso'],
    packages: ['bultos', 'paquetes', 'unidades', 'cantidad', 'packages', 'uds', 'cajas', 'bulto', 'paq', 'qty', 'nº bultos', 'num bultos', 'numero bultos'],
    clientReference: ['referencia', 'ref', 'reference', 'codigo', 'código', 'barcode', 'qr', 'sscc', 'codigo barras', 'código barras', 'cod referencia', 'nº referencia', 'num referencia', 'ref cliente', 'referencia cliente', 'tracking', 'id externo'],
};

const FIELD_LABELS = {
    destinationName: '📍 Destinatario',
    destinationAddress: '🏠 Dirección',
    destinationCity: '🏘️ Ciudad/Población',
    destinationZip: '📮 Código Postal',
    destinationPhone: '📞 Teléfono',
    observations: '📝 Observaciones',
    codAmount: '💰 Reembolso (COD)',
    packages: '📦 Nº Bultos',
    clientReference: '🔖 Referencia/QR Cliente',
};

const normalizeHeader = (h) => String(h || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');

function autoMapColumns(headers) {
    const mapping = {};
    const usedHeaders = new Set();

    for (const [field, synonyms] of Object.entries(FIELD_SYNONYMS)) {
        for (const header of headers) {
            if (usedHeaders.has(header)) continue;
            const norm = normalizeHeader(header);
            if (synonyms.some(s => norm === s || norm.includes(s) || s.includes(norm))) {
                mapping[field] = header;
                usedHeaders.add(header);
                break;
            }
        }
    }
    return mapping;
}

export default function ImportExcelShipments({ client, onCreateShipment, allShipments, articles, tariffs, coverageZones, allClients, onClose, isAdmin, selectedClientOverride }) {
    const [step, setStep] = useState(1); // 1=upload, 2=mapping, 3=preview, 4=done
    const [fileName, setFileName] = useState('');
    const [headers, setHeaders] = useState([]);
    const [rows, setRows] = useState([]);
    const [mapping, setMapping] = useState({});
    const [importing, setImporting] = useState(false);
    const [importResults, setImportResults] = useState(null);
    const [dragOver, setDragOver] = useState(false);

    const effectiveClient = selectedClientOverride || client;

    const handleFile = useCallback((file) => {
        if (!file) return;
        setFileName(file.name);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });
                if (!json || json.length === 0) {
                    alert('El archivo está vacío o no tiene datos válidos.');
                    return;
                }
                const hdrs = Object.keys(json[0]);
                setHeaders(hdrs);
                setRows(json);
                const autoMap = autoMapColumns(hdrs);
                setMapping(autoMap);
                setStep(2);
            } catch (err) {
                console.error('Error reading Excel:', err);
                alert('Error al leer el archivo. Asegúrate de que es un Excel válido (.xlsx, .xls, .csv).');
            }
        };
        reader.readAsArrayBuffer(file);
    }, []);

    const handleDrop = (e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); };
    const handleDragOver = (e) => { e.preventDefault(); setDragOver(true); };
    const handleDragLeave = () => setDragOver(false);

    const unmappedHeaders = useMemo(() => {
        const mapped = new Set(Object.values(mapping));
        return headers.filter(h => !mapped.has(h));
    }, [headers, mapping]);

    const mappedRows = useMemo(() => {
        return rows.map((row, i) => {
            const mapped = { _rowNum: i + 2 }; // Excel row number (1-indexed + header)
            for (const [field, header] of Object.entries(mapping)) {
                mapped[field] = row[header] !== undefined ? String(row[header]).trim() : '';
            }
            // Validaciones
            mapped._errors = [];
            if (!mapped.destinationName && !mapped.destinationCity) mapped._errors.push('Sin destinatario ni ciudad');
            if (!mapped.destinationCity && !mapped.destinationZip) mapped._errors.push('Sin ciudad ni CP');
            const numPkg = parseInt(mapped.packages) || 0;
            if (numPkg < 1) mapped._errors.push('Falta nº de bultos');
            // Buscar artículo BADI para vista previa
            const art = numPkg > 0 ? findBadiArticle(articles, numPkg) : null;
            mapped._article = art ? art.name : (numPkg > 0 ? `BLT_${numPkg}` : '—');
            mapped._articlePrice = art ? parseFloat(art.price || 0) : 0;
            return mapped;
        });
    }, [rows, mapping, articles]);

    const validRows = mappedRows.filter(r => r._errors.length === 0);
    const errorRows = mappedRows.filter(r => r._errors.length > 0);

    const getPointBaremo = (city, zip) => baremoDelPunto(city, zip, { tariffs, coverageZones });

    const handleImport = async () => {
        if (validRows.length === 0) return;
        setImporting(true);

        // Determinar prefijo de serie según tipo de cliente
        const prefix = prefijoSerieDelCliente(effectiveClient);

        // Se reserva de una vez el tramo entero de números en el servidor: contar
        // aquí no vale porque el cliente sólo ve sus propios envíos (RLS, fase 04)
        // y la numeración acababa pisando albaranes de otros — ver numeracionAlbaran.js.
        // `primero` es el primer número del tramo, y el bucle va sumando desde ahí.
        const { primero } = await reservarNumerosAlbaran(prefix, validRows.length, {
            enviosLocales: allShipments
        });

        let maxId = primero - 1;

        let created = 0, failed = 0;

        for (const row of validRows) {
            try {
                maxId++;
                const numPkg = parseInt(row.packages) || 1;
                const article = findBadiArticle(articles, numPkg);

                const originBaremo = getPointBaremo(effectiveClient.city, effectiveClient.zip);
                const destBaremo = getPointBaremo(row.destinationCity, row.destinationZip);
                const baremo = (originBaremo === 2 || destBaremo === 2) ? 2 : 1;

                const unitPrice = precioUnitarioParaCliente(article, effectiveClient, baremo);

                const codAmt = parseFloat(row.codAmount) || 0;
                const codFee = calcularComisionReembolso(effectiveClient, codAmt);

                const shipmentData = {
                    id: `${prefix}-${maxId}`,
                    type: 'Entrega',
                    client: effectiveClient.name,
                    clientId: effectiveClient.id,
                    originName: effectiveClient.name,
                    originAddress: effectiveClient.address || effectiveClient.opAddress || '',
                    originZip: effectiveClient.zip || effectiveClient.opZip || '',
                    originCity: effectiveClient.city || effectiveClient.opCity || '',
                    destinationName: row.destinationName || '',
                    destinationAddress: row.destinationAddress || '',
                    destinationZip: row.destinationZip || '',
                    destinationCity: row.destinationCity || '',
                    destinationPhone: row.destinationPhone || '',
                    origin: `${effectiveClient.zip || ''} ${effectiveClient.city || ''}, ES`.trim(),
                    destination: `${row.destinationZip || ''} ${row.destinationCity || ''}, ES`.trim(),
                    date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                    createdAt: new Date().toISOString(),
                    status: 'Pendiente de asignar',
                    packages: numPkg,
                    observations: row.observations || '',
                    articles: article ? [{
                        ...article,
                        uniqueId: Date.now() + maxId,
                        quantity: 1,
                        unitPrice: unitPrice,
                        totalPrice: unitPrice
                    }] : [],
                    amount: unitPrice > 0 ? unitPrice.toFixed(2) : 'Pendiente',
                    customAmount: unitPrice > 0 ? unitPrice : null,
                    billingType: effectiveClient.billingType || 'Clientes Habituales',
                    paymentStatus: 'Pending',
                    porteType: 'Pagado',
                    hasCod: codAmt > 0,
                    codAmount: codAmt,
                    codCommission: codFee,
                    createdBy: isAdmin ? `Admin (Import Excel: ${effectiveClient.name})` : `ClienteWeb: ${effectiveClient.name}`,
                    importedFromExcel: true,
                    excelFileName: fileName,
                    clientReference: row.clientReference ? String(row.clientReference).trim() : null,
                };

                await onCreateShipment(shipmentData);
                created++;
            } catch (err) {
                console.error('Error creating shipment from Excel row:', err);
                failed++;
            }
        }

        setImportResults({ created, failed, total: validRows.length });
        setStep(4);
        setImporting(false);
    };

    const updateMapping = (field, header) => {
        setMapping(prev => {
            const next = { ...prev };
            // Remove old mapping for this field
            delete next[field];
            if (header) next[field] = header;
            return next;
        });
    };

    const resetAll = () => {
        setStep(1); setFileName(''); setHeaders([]); setRows([]); setMapping({}); setImportResults(null);
    };

    // ─── RENDER ───
    const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white';

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden animate-in fade-in slide-in-from-bottom-4">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-xl"><Upload size={20} className="text-blue-600" /></div>
                    <div>
                        <h2 className="font-bold text-slate-800">Importar Envíos desde Excel</h2>
                        <p className="text-xs text-slate-500">Sube tu Excel y el sistema detectará las columnas automáticamente</p>
                    </div>
                </div>
                {/* Progress dots */}
                <div className="flex items-center gap-2">
                    {[1,2,3,4].map(s => (
                        <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all ${step >= s ? 'bg-blue-600 scale-110' : 'bg-slate-200'}`} />
                    ))}
                </div>
            </div>

            <div className="p-6">
                {/* ─── STEP 1: Upload ─── */}
                {step === 1 && (
                    <div
                        onDrop={handleDrop}
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer ${dragOver ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'}`}
                        onClick={() => document.getElementById('excel-file-input')?.click()}
                    >
                        <input
                            id="excel-file-input"
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            className="hidden"
                            onChange={(e) => handleFile(e.target.files[0])}
                        />
                        <Upload size={48} className="mx-auto text-slate-300 mb-4" />
                        <p className="text-lg font-bold text-slate-700 mb-2">Arrastra tu archivo Excel aquí</p>
                        <p className="text-sm text-slate-500 mb-4">o haz clic para seleccionar</p>
                        <p className="text-xs text-slate-400">Formatos: .xlsx, .xls, .csv</p>
                    </div>
                )}

                {/* ─── STEP 2: Column Mapping ─── */}
                {step === 2 && (
                    <div className="space-y-6">
                        <div className="flex items-center gap-3 mb-4">
                            <FileText size={20} className="text-blue-600" />
                            <div>
                                <p className="font-bold text-slate-800">Archivo: {fileName}</p>
                                <p className="text-xs text-slate-500">{rows.length} filas detectadas · {headers.length} columnas</p>
                            </div>
                        </div>

                        <div className="bg-slate-50 rounded-xl p-4">
                            <h3 className="text-sm font-bold text-slate-700 mb-3">📋 Mapeo de Columnas</h3>
                            <p className="text-xs text-slate-500 mb-4">Hemos detectado automáticamente las columnas. Puedes ajustar si algo no es correcto:</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {Object.entries(FIELD_LABELS).map(([field, label]) => (
                                    <div key={field} className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-600 w-36 shrink-0">{label}</span>
                                        <select
                                            className={`${inputCls} ${mapping[field] ? 'border-green-300 bg-green-50' : 'border-amber-300 bg-amber-50'}`}
                                            value={mapping[field] || ''}
                                            onChange={(e) => updateMapping(field, e.target.value)}
                                        >
                                            <option value="">— Sin asignar —</option>
                                            {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                        </select>
                                        {mapping[field] && <CheckCircle size={16} className="text-green-500 shrink-0" />}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {unmappedHeaders.length > 0 && (
                            <div className="bg-amber-50 rounded-xl p-3 border border-amber-200">
                                <p className="text-xs font-bold text-amber-700 mb-1">Columnas no utilizadas:</p>
                                <p className="text-xs text-amber-600">{unmappedHeaders.join(', ')}</p>
                            </div>
                        )}

                        <div className="flex justify-between pt-4">
                            <button onClick={resetAll} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2">
                                <ArrowLeft size={16} /> Volver
                            </button>
                            <button onClick={() => setStep(3)} disabled={!mapping.destinationName && !mapping.destinationCity}
                                className="px-6 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-40 flex items-center gap-2">
                                Vista Previa <ArrowRight size={16} />
                            </button>
                            {!mapping.packages && (
                                <p className="text-xs text-amber-600 font-bold mt-1">⚠️ No has asignado la columna de Bultos. Es obligatorio para asignar artículos.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* ─── STEP 3: Preview ─── */}
                {step === 3 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between mb-2">
                            <div>
                                <p className="font-bold text-slate-800">Vista Previa — {validRows.length} envíos válidos</p>
                                {errorRows.length > 0 && (
                                    <p className="text-xs text-red-600 font-bold">⚠️ {errorRows.length} filas con errores (se omitirán)</p>
                                )}
                            </div>
                            <span className="text-xs text-slate-400">Remitente: {effectiveClient?.name}</span>
                        </div>

                        <div className="overflow-x-auto rounded-xl border border-slate-200 max-h-[400px] overflow-y-auto">
                            <table className="w-full text-xs">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">#</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">Destinatario</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">Ciudad</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">CP</th>
                                        <th className="px-3 py-2 text-center font-bold text-slate-600">Bultos</th>
                                        <th className="px-3 py-2 text-left font-bold text-blue-600">Artículo</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">Ref</th>
                                        <th className="px-3 py-2 text-left font-bold text-slate-600">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {mappedRows.map((row, i) => (
                                        <tr key={i} className={`border-t border-slate-100 ${row._errors.length > 0 ? 'bg-red-50' : 'hover:bg-blue-50/50'}`}>
                                            <td className="px-3 py-2 text-slate-400">{row._rowNum}</td>
                                            <td className="px-3 py-2 font-medium text-slate-800">{row.destinationName || '—'}</td>
                                            <td className="px-3 py-2 text-slate-600">{row.destinationCity || '—'}</td>
                                            <td className="px-3 py-2 text-slate-600">{row.destinationZip || '—'}</td>
                                            <td className="px-3 py-2 text-center font-bold">{row.packages || '—'}</td>
                                            <td className="px-3 py-2">
                                                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${row._article !== '—' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-600'}`}>
                                                    {row._article}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2 text-slate-500 font-mono text-[10px]">{row.clientReference || '—'}</td>
                                            <td className="px-3 py-2">
                                                {row._errors.length > 0 ? (
                                                    <span className="text-red-600 font-bold">❌ {row._errors[0]}</span>
                                                ) : (
                                                    <span className="text-green-600 font-bold">✅</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between pt-4">
                            <button onClick={() => setStep(2)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2">
                                <ArrowLeft size={16} /> Ajustar Mapeo
                            </button>
                            <button onClick={handleImport} disabled={importing || validRows.length === 0}
                                className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-emerald-500/30">
                                {importing ? (
                                    <><span className="animate-spin">⏳</span> Importando...</>
                                ) : (
                                    <><CheckCircle size={18} /> Crear {validRows.length} envíos</>
                                )}
                            </button>
                        </div>
                    </div>
                )}

                {/* ─── STEP 4: Done ─── */}
                {step === 4 && importResults && (
                    <div className="text-center py-8 space-y-4">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle size={32} className="text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">¡Importación Completada!</h3>
                        <div className="text-sm text-slate-600 space-y-1">
                            <p>✅ <strong>{importResults.created}</strong> envíos creados correctamente</p>
                            {importResults.failed > 0 && (
                                <p>❌ <strong>{importResults.failed}</strong> fallidos</p>
                            )}
                        </div>
                        <div className="flex justify-center gap-3 pt-4">
                            <button onClick={resetAll} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">
                                Importar otro Excel
                            </button>
                            {onClose && (
                                <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors">
                                    Cerrar
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
