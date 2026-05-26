import { useState, useEffect } from 'react';
import { X, Printer, Tag, FileText, ChevronRight, RotateCcw, Info } from 'lucide-react';
import {
    printLabelA6,
    printLabelA4,
    getNextA4Position,
    saveA4Position,
    getLabelCount,
} from '../../utils/printLabel';

/**
 * LabelPrintModal
 *
 * Props:
 *   isOpen        - boolean
 *   onClose       - fn
 *   shipment      - object
 *   client        - object (puede tener client.labelPrintMode = 'a6' | 'a4')
 *   onUpdateClient - fn(clientId, updates) — para guardar preferencia
 */
export default function LabelPrintModal({ isOpen, onClose, shipment, client, onUpdateClient }) {
    // Modo: null (sin seleccionar), 'a6', 'a4'
    const [mode, setMode] = useState(null);
    // Posición A4 seleccionada (1-4)
    const [a4Position, setA4Position] = useState(1);
    // Si guardar la preferencia
    const [savePreference, setSavePreference] = useState(false);
    // Información sobre el folio actual
    const [posInfo, setPosInfo] = useState({ next: 1, isNewSheet: true });

    const totalLabels = shipment ? getLabelCount(shipment) : 1;

    // Al abrir el modal, inicializar con la preferencia del cliente
    useEffect(() => {
        if (!isOpen) { setMode(null); return; }
        const preferred = client?.labelPrintMode;
        if (preferred === 'a6' || preferred === 'a4') {
            setMode(preferred);
        } else {
            setMode(null);
        }
        // Leer posición sugerida del localStorage
        const next = getNextA4Position();
        const isNew = next === 1;
        setPosInfo({ next, isNewSheet: isNew });
        setA4Position(next);
        setSavePreference(!!preferred);
    }, [isOpen, client?.labelPrintMode]);

    if (!isOpen || !shipment) return null;

    const handleSelectMode = (m) => setMode(m);

    const handlePrint = () => {
        if (mode === 'a6') {
            if (savePreference && onUpdateClient) {
                onUpdateClient(client.id, { labelPrintMode: 'a6' });
            }
            printLabelA6(shipment, client);
            onClose();
        } else if (mode === 'a4') {
            if (savePreference && onUpdateClient) {
                onUpdateClient(client.id, { labelPrintMode: 'a4' });
            }
            const lastPos = printLabelA4(shipment, client, a4Position);
            saveA4Position(lastPos);
            onClose();
        }
    };

    // Calcula qué posiciones se van a usar para este envío
    const getUsedPositions = () => {
        const used = [];
        let pos = a4Position;
        for (let i = 0; i < totalLabels; i++) {
            used.push(pos);
            pos = pos >= 4 ? 1 : pos + 1;
        }
        return used;
    };

    const usedPositions = mode === 'a4' ? getUsedPositions() : [];
    // ¿Cuántos folios necesita?
    const foldersNeeded = mode === 'a4'
        ? Math.ceil((a4Position - 1 + totalLabels) / 4)
        : totalLabels;

    // Posición visual de cada celda del grid A4
    const POS_LABELS = { 1: 'Arriba Izq.', 2: 'Arriba Der.', 3: 'Abajo Izq.', 4: 'Abajo Der.' };

    return (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 rounded-xl">
                            <Printer size={18} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800">Imprimir Etiqueta</h3>
                            <p className="text-xs text-slate-500">{shipment.id} · {totalLabels} bulto{totalLabels !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-5 space-y-5">

                    {/* Paso 1: selección de modo */}
                    <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Modo de Impresión</p>
                        <div className="grid grid-cols-2 gap-3">
                            {/* A6 */}
                            <button
                                onClick={() => handleSelectMode('a6')}
                                className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                                    mode === 'a6'
                                        ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {client?.labelPrintMode === 'a6' && (
                                    <span className="absolute top-2 right-2 text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full uppercase">Por defecto</span>
                                )}
                                <Tag size={22} className={mode === 'a6' ? 'text-blue-600' : 'text-slate-400'} />
                                <p className="font-bold text-slate-800 mt-2 text-sm">Etiquetadora A6</p>
                                <p className="text-xs text-slate-500 mt-1 leading-snug">Impresión directa 105×148mm. Para impresoras térmicas o configuradas en A6.</p>
                            </button>

                            {/* A4 */}
                            <button
                                onClick={() => handleSelectMode('a4')}
                                className={`relative p-4 rounded-2xl border-2 text-left transition-all ${
                                    mode === 'a4'
                                        ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {client?.labelPrintMode === 'a4' && (
                                    <span className="absolute top-2 right-2 text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase">Por defecto</span>
                                )}
                                <FileText size={22} className={mode === 'a4' ? 'text-emerald-600' : 'text-slate-400'} />
                                <p className="font-bold text-slate-800 mt-2 text-sm">Folio A4</p>
                                <p className="text-xs text-slate-500 mt-1 leading-snug">4 etiquetas por folio (2×2). Elige la posición para aprovechar el papel.</p>
                            </button>
                        </div>
                    </div>

                    {/* Paso 2A: opciones A6 */}
                    {mode === 'a6' && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                                <Info size={12} /> Impresión directa A6
                            </p>
                            <p className="text-xs text-blue-600 leading-relaxed">
                                Se imprimirán <strong>{totalLabels} etiqueta{totalLabels !== 1 ? 's' : ''}</strong>, una por página A6.
                                Asegúrate de que tu impresora está configurada en tamaño <strong>A6</strong> o <strong>"Sin márgenes"</strong>.
                            </p>
                        </div>
                    )}

                    {/* Paso 2B: selector visual A4 */}
                    {mode === 'a4' && (
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-4">

                            {/* Info folio actual */}
                            {posInfo.isNewSheet ? (
                                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-200">
                                    <RotateCcw size={12} className="shrink-0 text-slate-400" />
                                    <span>Folio nuevo sugerido (última posición fue la 4, o es el primer uso hoy)</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                                    <Info size={12} className="shrink-0 text-amber-500" />
                                    <span>Última posición usada: <strong>{posInfo.next - 1 || 4}</strong>. Siguiente sugerida: <strong>{posInfo.next}</strong></span>
                                </div>
                            )}

                            {/* Grid visual del folio */}
                            <div>
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Posición de inicio en el folio
                                </p>

                                {/* Folio A4 mini */}
                                <div className="relative mx-auto border-2 border-slate-300 rounded-lg overflow-hidden shadow-inner"
                                    style={{ width: '180px', height: '254px', background: '#f8fafc' }}>

                                    {/* Línea de corte horizontal */}
                                    <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-300 z-10" />
                                    {/* Línea de corte vertical */}
                                    <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-slate-300 z-10" />

                                    {[1, 2, 3, 4].map(pos => {
                                        const isStart = pos === a4Position;
                                        const isUsed = usedPositions.includes(pos);
                                        const isFirstPage = usedPositions.slice(0, 4 - (a4Position - 1)).includes(pos);
                                        const posStyle = {
                                            1: 'top-0 left-0',
                                            2: 'top-0 right-0',
                                            3: 'bottom-0 left-0',
                                            4: 'bottom-0 right-0',
                                        }[pos];

                                        return (
                                            <button
                                                key={pos}
                                                onClick={() => setA4Position(pos)}
                                                title={`Posición ${pos}: ${POS_LABELS[pos]}`}
                                                className={`absolute w-[50%] h-[50%] flex flex-col items-center justify-center gap-1 transition-all z-20 ${posStyle} ${
                                                    isStart
                                                        ? 'bg-emerald-500 text-white'
                                                        : isUsed
                                                        ? 'bg-emerald-100 text-emerald-700'
                                                        : 'bg-transparent text-slate-400 hover:bg-slate-200'
                                                }`}
                                            >
                                                <span className="font-black text-lg leading-none">{pos}</span>
                                                <span className="text-[8px] font-bold uppercase leading-none opacity-80">{POS_LABELS[pos]}</span>
                                                {isStart && <span className="text-[7px] font-black uppercase opacity-90">INICIO</span>}
                                                {isUsed && !isStart && <span className="text-[7px] font-bold uppercase opacity-80">usada</span>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Leyenda */}
                                <div className="flex items-center justify-center gap-4 mt-2">
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                                        <span className="text-[10px] text-slate-500">Inicio</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-sm bg-emerald-100 border border-emerald-300" />
                                        <span className="text-[10px] text-slate-500">Usada</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-3 h-3 rounded-sm bg-slate-100 border border-slate-300" />
                                        <span className="text-[10px] text-slate-500">Libre</span>
                                    </div>
                                </div>
                            </div>

                            {/* Resumen */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Etiquetas a imprimir:</span>
                                    <span className="font-bold text-slate-800">{totalLabels}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Posición de inicio:</span>
                                    <span className="font-bold text-slate-800">{a4Position} — {POS_LABELS[a4Position]}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Folios necesarios:</span>
                                    <span className="font-bold text-slate-800">
                                        {foldersNeeded === 1 ? '1 (folio actual)' : `${foldersNeeded} (1 parcial + ${foldersNeeded - 1} nuevo${foldersNeeded - 1 !== 1 ? 's' : ''})`}
                                    </span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">Posición final:</span>
                                    <span className="font-bold text-slate-800">{usedPositions[usedPositions.length - 1]} — {POS_LABELS[usedPositions[usedPositions.length - 1]]}</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Guardar preferencia */}
                    {mode && (
                        <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
                            <input
                                type="checkbox"
                                checked={savePreference}
                                onChange={e => setSavePreference(e.target.checked)}
                                className="w-4 h-4 rounded text-blue-600 border-slate-300 focus:ring-blue-500"
                            />
                            <div>
                                <p className="text-xs font-bold text-slate-700">Recordar como modo por defecto</p>
                                <p className="text-[10px] text-slate-400">Se pre-seleccionará automáticamente la próxima vez</p>
                            </div>
                        </label>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={!mode}
                        className={`flex-1 py-3 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg ${
                            mode === 'a6'
                                ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20'
                                : mode === 'a4'
                                ? 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/20'
                                : 'bg-slate-300 cursor-not-allowed shadow-none'
                        }`}
                    >
                        <Printer size={16} />
                        {mode === 'a4'
                            ? `Imprimir en pos. ${a4Position}`
                            : mode === 'a6'
                            ? 'Imprimir A6'
                            : 'Selecciona modo'
                        }
                        {mode && <ChevronRight size={14} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
