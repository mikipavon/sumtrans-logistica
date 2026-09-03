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
            {/* Tope a la altura de la pantalla: cabecera y botones fijos, el centro hace scroll si no cabe */}
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[calc(100dvh-2rem)] flex flex-col overflow-hidden">

                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50 shrink-0">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-blue-100 rounded-lg">
                            <Printer size={16} className="text-blue-600" />
                        </div>
                        <div>
                            <h3 className="font-bold text-slate-800 text-sm leading-tight">Imprimir Etiqueta</h3>
                            <p className="text-[11px] text-slate-500">{shipment.id} · {totalLabels} bulto{totalLabels !== 1 ? 's' : ''}</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                        <X size={18} />
                    </button>
                </div>

                <div className="p-4 space-y-3 flex-1 min-h-0 overflow-y-auto">

                    {/* Paso 1: selección de modo */}
                    <div>
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">Modo de Impresión</p>
                        <div className="grid grid-cols-2 gap-2">
                            {/* A6 */}
                            <button
                                onClick={() => handleSelectMode('a6')}
                                className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                                    mode === 'a6'
                                        ? 'border-blue-500 bg-blue-50 shadow-md shadow-blue-500/10'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {client?.labelPrintMode === 'a6' && (
                                    <span className="absolute top-1.5 right-1.5 text-[9px] font-black text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded-full uppercase">Por defecto</span>
                                )}
                                <Tag size={18} className={mode === 'a6' ? 'text-blue-600' : 'text-slate-400'} />
                                <p className="font-bold text-slate-800 mt-1.5 text-sm">Etiquetadora A6</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">Impresión directa 105×148mm. Para impresoras térmicas o configuradas en A6.</p>
                            </button>

                            {/* A4 */}
                            <button
                                onClick={() => handleSelectMode('a4')}
                                className={`relative p-3 rounded-xl border-2 text-left transition-all ${
                                    mode === 'a4'
                                        ? 'border-emerald-500 bg-emerald-50 shadow-md shadow-emerald-500/10'
                                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                }`}
                            >
                                {client?.labelPrintMode === 'a4' && (
                                    <span className="absolute top-1.5 right-1.5 text-[9px] font-black text-emerald-600 bg-emerald-100 px-1.5 py-0.5 rounded-full uppercase">Por defecto</span>
                                )}
                                <FileText size={18} className={mode === 'a4' ? 'text-emerald-600' : 'text-slate-400'} />
                                <p className="font-bold text-slate-800 mt-1.5 text-sm">Folio A4</p>
                                <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">4 etiquetas por folio (2×2). Elige la posición para aprovechar el papel.</p>
                            </button>
                        </div>
                    </div>

                    {/* Paso 2A: opciones A6 */}
                    {mode === 'a6' && (
                        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
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
                        <div className="animate-in fade-in slide-in-from-bottom-2 duration-200 space-y-3">

                            {/* Info folio actual */}
                            {posInfo.isNewSheet ? (
                                <div className="flex items-center gap-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-200">
                                    <RotateCcw size={12} className="shrink-0 text-slate-400" />
                                    <span>Folio nuevo sugerido (última posición fue la 4, o es el primer uso hoy)</span>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-200">
                                    <Info size={12} className="shrink-0 text-amber-500" />
                                    <span>Última posición usada: <strong>{posInfo.next - 1 || 4}</strong>. Siguiente sugerida: <strong>{posInfo.next}</strong></span>
                                </div>
                            )}

                            {/* Grid visual del folio + resumen, en una sola fila para no alargar el modal */}
                            <div>
                                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                                    Posición de inicio en el folio
                                </p>

                                <div className="flex gap-3 items-stretch">
                                    <div className="shrink-0">
                                        {/* Folio A4 mini */}
                                        <div className="relative border-2 border-slate-300 rounded-lg overflow-hidden shadow-inner"
                                            style={{ width: '132px', height: '186px', background: '#f8fafc' }}>

                                            {/* Línea de corte horizontal */}
                                            <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-slate-300 z-10" />
                                            {/* Línea de corte vertical */}
                                            <div className="absolute top-0 bottom-0 left-1/2 border-l border-dashed border-slate-300 z-10" />

                                            {[1, 2, 3, 4].map(pos => {
                                                const isStart = pos === a4Position;
                                                const isUsed = usedPositions.includes(pos);
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
                                                        className={`absolute w-[50%] h-[50%] flex flex-col items-center justify-center gap-0.5 transition-all z-20 ${posStyle} ${
                                                            isStart
                                                                ? 'bg-emerald-500 text-white'
                                                                : isUsed
                                                                ? 'bg-emerald-100 text-emerald-700'
                                                                : 'bg-transparent text-slate-400 hover:bg-slate-200'
                                                        }`}
                                                    >
                                                        <span className="font-black text-base leading-none">{pos}</span>
                                                        <span className="text-[7px] font-bold uppercase leading-none opacity-80">{POS_LABELS[pos]}</span>
                                                        {isStart && <span className="text-[7px] font-black uppercase opacity-90">INICIO</span>}
                                                        {isUsed && !isStart && <span className="text-[7px] font-bold uppercase opacity-80">usada</span>}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Leyenda */}
                                        <div className="flex items-center justify-center gap-2.5 mt-1.5">
                                            <div className="flex items-center gap-1">
                                                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                                                <span className="text-[10px] text-slate-500">Inicio</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-300" />
                                                <span className="text-[10px] text-slate-500">Usada</span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <div className="w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-300" />
                                                <span className="text-[10px] text-slate-500">Libre</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Resumen */}
                                    <div className="flex-1 min-w-0 bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-col justify-center gap-2">
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Etiquetas a imprimir</p>
                                            <p className="text-xs font-bold text-slate-800">{totalLabels}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Posición de inicio</p>
                                            <p className="text-xs font-bold text-slate-800">{a4Position} — {POS_LABELS[a4Position]}</p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Folios necesarios</p>
                                            <p className="text-xs font-bold text-slate-800">
                                                {foldersNeeded === 1 ? '1 (folio actual)' : `${foldersNeeded} (1 parcial + ${foldersNeeded - 1} nuevo${foldersNeeded - 1 !== 1 ? 's' : ''})`}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-[10px] text-slate-500 uppercase tracking-wide">Posición final</p>
                                            <p className="text-xs font-bold text-slate-800">{usedPositions[usedPositions.length - 1]} — {POS_LABELS[usedPositions[usedPositions.length - 1]]}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Guardar preferencia */}
                    {mode && (
                        <label className="flex items-center gap-3 cursor-pointer px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors">
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
                <div className="p-3 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handlePrint}
                        disabled={!mode}
                        className={`flex-1 py-2.5 text-sm font-bold text-white rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg ${
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
