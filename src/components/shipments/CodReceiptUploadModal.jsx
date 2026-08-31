import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, Camera, CheckCircle, AlertTriangle, Loader2, FileText, Trash2, FolderOpen, Image as ImageIcon, Search, Euro } from 'lucide-react';
import jsQR from 'jsqr';
import { uploadProof } from '../../utils/storage';
import { compressImage } from '../../utils/imageCompression';
import CameraCaptureModal from '../CameraCaptureModal';

/**
 * Modal for managing and uploading COD receipt photos.
 * Shows a list of all COD shipments pending receipt upload.
 * Supports individual photo upload per shipment AND batch folder scan with QR auto-match.
 */
export default function CodReceiptUploadModal({ isOpen, onClose, shipments = [], onUpdate }) {
    const [pendingPhotos, setPendingPhotos] = useState({}); // { shipmentId: { preview, file, status } }
    const [isScanning, setIsScanning] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');
    const [unmatchedFiles, setUnmatchedFiles] = useState([]); // Files from folder scan that couldn't be matched
    const [dirHandle, setDirHandle] = useState(null);
    const individualInputRefs = useRef({});
    // Justificante hecho con la cámara de dentro de la app. Guarda de qué envío es:
    // salir a la cámara del móvil deja que Android mate la app a media tanda.
    const [camaraEnvioId, setCamaraEnvioId] = useState(null);

    // COD shipments that need receipt upload
    const pendingShipments = (shipments || []).filter(s => 
        s.hasCod && s.codPaid && !s.codReceiptPhoto
    );

    // Already uploaded (for reference)
    const uploadedShipments = (shipments || []).filter(s => 
        s.hasCod && s.codPaid && s.codReceiptPhoto
    );

    // Apply search filter
    const filteredPending = pendingShipments.filter(s => {
        if (!searchFilter) return true;
        const q = searchFilter.toLowerCase();
        return (s.id || '').toLowerCase().includes(q) ||
            (s.client || '').toLowerCase().includes(q) ||
            (s.originName || '').toLowerCase().includes(q) ||
            (s.destinationName || '').toLowerCase().includes(q);
    });

    // Read QR from an image data URL
    const readQRFromImage = useCallback((imageData) => {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                // Scale down for faster processing if image is very large
                const maxDim = 1200;
                let w = img.width, h = img.height;
                if (w > maxDim || h > maxDim) {
                    const scale = maxDim / Math.max(w, h);
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                const imgData = ctx.getImageData(0, 0, w, h);
                const code = jsQR(imgData.data, imgData.width, imgData.height);
                if (code && code.data && code.data.startsWith('COD:')) {
                    resolve(code.data.replace('COD:', ''));
                } else {
                    resolve(null);
                }
            };
            img.onerror = () => resolve(null);
            img.src = imageData;
        });
    }, []);

    // Handle individual photo selection for a specific shipment
    const handleIndividualPhoto = async (shipmentId, e) => {
        const file = e.target.files[0];
        e.target.value = ''; // Permite repetir la misma foto y suelta el fichero
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            alert('La imagen es demasiado grande. Máximo 20MB.');
            return;
        }
        // El fichero va DIRECTO al compresor: descomprimir la foto entera dejaba
        // sin memoria al móvil y Android cerraba la app.
        try {
            const compressed = await compressImage(file, 1200, 1200, 0.8);
            setPendingPhotos(prev => ({
                ...prev,
                [shipmentId]: { preview: compressed, file, status: 'ready' }
            }));
        } catch (err) {
            console.error('[Justificante] No se pudo comprimir la foto:', err);
            alert('No se ha podido procesar la foto. Vuelve a intentarlo.');
        }
    };

    // Handle folder/batch scan — select folder via File System Access API, read QR codes, auto-match
    const handleFolderScan = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setDirHandle(handle);
            setIsScanning(true);
            
            const newPending = { ...pendingPhotos };
            const newUnmatched = [];
            let matchCount = 0;
            let total = 0;

            for await (const entry of handle.values()) {
                if (entry.kind !== 'file') continue;
                if (!entry.name.toLowerCase().match(/\.(jpe?g|png)$/)) continue;
                
                total++;
                const file = await entry.getFile();
                const preview = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result);
                    reader.readAsDataURL(file);
                });

                const shipmentId = await readQRFromImage(preview);

                if (shipmentId) {
                    const exists = pendingShipments.find(s => s.id === shipmentId);
                    if (exists) {
                        newPending[shipmentId] = { preview, file, fileHandle: entry, status: 'ready' };
                        matchCount++;
                    } else {
                        newUnmatched.push({ preview, fileName: file.name, detectedId: shipmentId, reason: 'Ya tiene justificante o no existe' });
                    }
                } else {
                    newUnmatched.push({ preview, fileName: file.name, detectedId: null, reason: 'QR no detectado' });
                }
            }

            setPendingPhotos(newPending);
            setUnmatchedFiles(prev => [...prev, ...newUnmatched]);
            setIsScanning(false);

            alert(`📊 Resultado del escaneo:\n✅ ${matchCount} vinculados automáticamente\n⚠️ ${total - matchCount} no reconocidos\n\nTotal imágenes procesadas: ${total}`);
        } catch (err) {
            console.error(err);
            if (err.name !== 'AbortError') {
                alert('No se pudo acceder a la carpeta. Asegúrate de usar Chrome/Edge y dar permisos de edición.');
            }
            setIsScanning(false);
        }
    };

    // Remove a pending photo
    const removePendingPhoto = (shipmentId) => {
        setPendingPhotos(prev => {
            const copy = { ...prev };
            delete copy[shipmentId];
            return copy;
        });
    };

    // Upload ALL ready photos
    const handleUploadAll = async () => {
        const readyEntries = Object.entries(pendingPhotos).filter(([, v]) => v.status === 'ready');
        if (readyEntries.length === 0) {
            alert('No hay justificantes listos para subir.');
            return;
        }

        setIsUploading(true);
        let successCount = 0;
        let errorCount = 0;

        for (const [shipmentId, photoData] of readyEntries) {
            try {
                setPendingPhotos(prev => ({ ...prev, [shipmentId]: { ...prev[shipmentId], status: 'uploading' } }));
                // Utilizamos el bucket 'delivery_photos' que ya existe y tiene permisos configurados
                const url = await uploadProof(shipmentId, photoData.preview, 'delivery_photos');
                if (url && onUpdate) {
                    await onUpdate(shipmentId, { codReceiptPhoto: url });
                    setPendingPhotos(prev => ({ ...prev, [shipmentId]: { ...prev[shipmentId], status: 'done' } }));
                    successCount++;
                    
                    // --- Auto Delete Local File ---
                    if (dirHandle && photoData.fileHandle) {
                        try {
                            await dirHandle.removeEntry(photoData.fileHandle.name);
                        } catch (e) {
                            console.error("Failed to delete local file:", e);
                        }
                    }
                }
            } catch (err) {
                console.error(`Error uploading receipt for ${shipmentId}:`, err);
                setPendingPhotos(prev => ({ ...prev, [shipmentId]: { ...prev[shipmentId], status: 'error' } }));
                errorCount++;
            }
        }

        setIsUploading(false);
        alert(`✅ ${successCount} justificantes subidos y borrados de tu carpeta correctamente.${errorCount > 0 ? `\n⚠️ ${errorCount} fallaron.` : ''}`);

        if (errorCount === 0 && successCount > 0) {
            // Clean up done entries
            setPendingPhotos(prev => {
                const copy = { ...prev };
                Object.keys(copy).forEach(k => { if (copy[k].status === 'done') delete copy[k]; });
                return copy;
            });
        }
    };

    const readyCount = Object.values(pendingPhotos).filter(v => v.status === 'ready').length;
    const doneCount = Object.values(pendingPhotos).filter(v => v.status === 'done').length;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between z-10 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-100 text-indigo-600">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 leading-tight">Justificantes de Reembolso</h2>
                            <p className="text-xs text-gray-500">
                                {pendingShipments.length} pendientes · {uploadedShipments.length} subidos
                            </p>
                        </div>
                    </div>
                    <button onClick={() => { setPendingPhotos({}); setUnmatchedFiles([]); setDirHandle(null); onClose(); }} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto bg-slate-50/50">
                    {/* Batch Scan Area */}
                    <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-2xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-white rounded-xl shadow-sm">
                                <FolderOpen size={20} className="text-indigo-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-indigo-800">Escaneo Inteligente desde Carpeta</p>
                                <p className="text-[10px] text-indigo-500">Selecciona la carpeta donde el escáner guarda las imágenes (Solo JPG/PNG)</p>
                            </div>
                        </div>
                        <button
                            onClick={handleFolderScan}
                            disabled={isScanning}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                        >
                            {isScanning ? (
                                <><Loader2 size={16} className="animate-spin" /> Leyendo QR de imágenes...</>
                            ) : (
                                <><FolderOpen size={16} /> Seleccionar Carpeta / Archivos</>
                            )}
                        </button>
                    </div>

                    {/* Unmatched files from scan */}
                    {unmatchedFiles.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5">
                                    <AlertTriangle size={12} /> {unmatchedFiles.length} archivos no reconocidos
                                </p>
                                <button onClick={() => setUnmatchedFiles([])} className="text-[10px] font-bold text-amber-600 hover:text-amber-800">Limpiar</button>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                                {unmatchedFiles.map((uf, i) => (
                                    <div key={i} className="shrink-0 w-16 h-16 rounded-lg border border-amber-300 overflow-hidden relative group">
                                        <img src={uf.preview} alt="" className="w-full h-full object-cover" />
                                        <div className="absolute inset-0 bg-amber-900/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <p className="text-[7px] text-white font-bold text-center px-1">{uf.reason}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Search */}
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Buscar por ID, cliente..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:outline-none"
                        />
                    </div>

                    {/* Pending Shipments List */}
                    <div className="space-y-2">
                        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1">
                            Envíos pendientes de justificante ({filteredPending.length})
                        </h3>

                        {filteredPending.length === 0 && (
                            <div className="bg-white rounded-xl border border-slate-100 p-8 text-center">
                                <CheckCircle size={32} className="mx-auto text-emerald-400 mb-2" />
                                <p className="text-sm font-bold text-emerald-700">¡Todo al día!</p>
                                <p className="text-xs text-slate-400 mt-1">No hay reembolsos pendientes de justificante</p>
                            </div>
                        )}

                        {filteredPending.map(shipment => {
                            const photo = pendingPhotos[shipment.id];
                            const hasPhoto = !!photo;
                            const isDone = photo?.status === 'done';
                            const isUploadingThis = photo?.status === 'uploading';

                            return (
                                <div
                                    key={shipment.id}
                                    className={`bg-white rounded-xl border p-3 transition-all ${
                                        isDone ? 'border-emerald-200 bg-emerald-50/50 opacity-60' :
                                        hasPhoto ? 'border-indigo-200 ring-2 ring-indigo-100' :
                                        'border-slate-100 hover:border-slate-200'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        {/* Photo preview / placeholder */}
                                        <div className="w-14 h-14 rounded-lg border border-slate-200 overflow-hidden shrink-0 bg-slate-50 flex items-center justify-center">
                                            {hasPhoto ? (
                                                <img src={photo.preview} alt="" className="w-full h-full object-cover" />
                                            ) : (
                                                <ImageIcon size={20} className="text-slate-300" />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-mono font-black text-slate-700">{shipment.id}</span>
                                                {isDone && <span className="px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded text-[8px] font-black">SUBIDO ✓</span>}
                                                {isUploadingThis && <Loader2 size={12} className="animate-spin text-indigo-500" />}
                                            </div>
                                            <p className="text-[11px] text-slate-500 truncate">{shipment.client || shipment.originName || 'N/A'}</p>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <Euro size={10} className="text-red-400" />
                                                <span className="text-xs font-bold text-red-600">{shipment.codAmount} €</span>
                                                <span className="text-[9px] text-slate-400">· {shipment.destinationName || ''}</span>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {!isDone && (
                                                <>
                                                    <input
                                                        type="file"
                                                        ref={el => individualInputRefs.current[shipment.id] = el}
                                                        className="hidden"
                                                        accept="image/*"
                                                        capture="environment"
                                                        onChange={(e) => handleIndividualPhoto(shipment.id, e)}
                                                    />
                                                    {/* Camera / Photo button */}
                                                    <button
                                                        onClick={() => setCamaraEnvioId(shipment.id)}
                                                        className={`p-2.5 rounded-xl transition-colors text-xs font-bold flex items-center gap-1.5 ${
                                                            hasPhoto 
                                                                ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                                                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                                        }`}
                                                        title="Hacer la foto del justificante"
                                                    >
                                                        <Camera size={14} />
                                                        {hasPhoto ? 'Cambiar' : 'Foto'}
                                                    </button>
                                                    {/* Remove if has photo */}
                                                    {hasPhoto && (
                                                        <button
                                                            onClick={() => removePendingPhoto(shipment.id)}
                                                            className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="Quitar foto"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-white border-t border-gray-100 p-4 flex items-center justify-between shrink-0">
                    <div className="text-xs text-slate-400">
                        {readyCount > 0 && <span className="font-bold text-indigo-600">{readyCount} listos para subir</span>}
                        {doneCount > 0 && <span className="font-bold text-emerald-600 ml-2">· {doneCount} subidos</span>}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => { setPendingPhotos({}); setUnmatchedFiles([]); setDirHandle(null); onClose(); }}
                            className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                        >
                            Cerrar
                        </button>
                        {readyCount > 0 && (
                            <button
                                onClick={handleUploadAll}
                                disabled={isUploading}
                                className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg shadow-indigo-500/20"
                            >
                                {isUploading ? (
                                    <><Loader2 size={16} className="animate-spin" /> Subiendo...</>
                                ) : (
                                    <><Upload size={16} /> Subir {readyCount} Justificantes</>
                                )}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <CameraCaptureModal
                isOpen={camaraEnvioId !== null}
                onClose={() => setCamaraEnvioId(null)}
                onCapture={(foto) => {
                    setPendingPhotos(prev => ({
                        ...prev,
                        [camaraEnvioId]: { preview: foto, status: 'ready' }
                    }));
                    setCamaraEnvioId(null);
                }}
                onFallback={() => individualInputRefs.current[camaraEnvioId]?.click()}
                titulo="Foto del justificante"
                maxLado={1200}
                calidad={0.8}
            />
        </div>
    );
}
