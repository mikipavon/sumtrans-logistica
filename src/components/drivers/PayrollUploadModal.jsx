import React, { useState } from 'react';
import { X, Upload, CheckCircle, AlertTriangle, Loader2, FileText, FolderOpen, User } from 'lucide-react';
import { uploadFileToBucket, initStorageBuckets } from '../../utils/storage';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

const normalizeName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ' ')
        .replace(/\s+/g, " ")
        .trim();
};

const extractTextFromPDF = async (file) => {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + ' ';
        }
        return fullText;
    } catch (e) {
        console.error("Error leyendo PDF:", e);
        return '';
    }
};

const SPANISH_MONTHS = [
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'
];

const detectMonth = (text) => {
    if (!text) return null;
    const lowerText = String(text).toLowerCase();
    
    // Buscar mención explícita del mes
    for (let i = 0; i < SPANISH_MONTHS.length; i++) {
        if (lowerText.includes(SPANISH_MONTHS[i])) {
            const yearMatch = lowerText.match(/\b(202[0-9])\b/);
            const year = yearMatch ? yearMatch[1] : new Date().getFullYear();
            const capitalizedMonth = SPANISH_MONTHS[i].charAt(0).toUpperCase() + SPANISH_MONTHS[i].slice(1);
            return `Nómina ${capitalizedMonth} ${year}`;
        }
    }
    
    // Buscar formato dd/mm/yyyy
    const dateRegex = /\b\d{1,2}\/(\d{2})\/(202[0-9])\b/;
    const dateMatch = lowerText.match(dateRegex);
    if (dateMatch) {
        const monthIndex = parseInt(dateMatch[1], 10) - 1;
        const year = dateMatch[2];
        if (monthIndex >= 0 && monthIndex < 12) {
            const capitalizedMonth = SPANISH_MONTHS[monthIndex].charAt(0).toUpperCase() + SPANISH_MONTHS[monthIndex].slice(1);
            return `Nómina ${capitalizedMonth} ${year}`;
        }
    }
    
    return null;
};

const matchNameInText = (name, text) => {
    if (!name || name.length < 4) return -1;
    
    // Intento de coincidencia exacta primero
    const exactIdx = text.indexOf(name);
    if (exactIdx !== -1) return exactIdx;
    
    // Búsqueda independiente del orden (para casos de "Apellidos, Nombre")
    const parts = name.split(' ').filter(p => p.length > 2);
    if (parts.length < 2) return -1;
    
    const indices = parts.map(part => text.indexOf(part));
    if (indices.includes(-1)) return -1; // Falta alguna parte del nombre
    
    const minIdx = Math.min(...indices);
    const maxIdx = Math.max(...indices);
    
    // Si todas las partes del nombre están a menos de 150 caracteres de distancia entre sí,
    // asumimos que es la misma persona escrita en otro orden.
    if (maxIdx - minIdx < 150) {
        return minIdx;
    }
    
    return -1;
};

export default function PayrollUploadModal({ isOpen, onClose, drivers = [], onUpdateDriver }) {
    const [isScanning, setIsScanning] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [matchedFiles, setMatchedFiles] = useState([]); // { file, fileHandle, driverId, driverName, status }
    const [unmatchedFiles, setUnmatchedFiles] = useState([]); // { file, fileHandle, selectedDriverId, status }
    const [dirHandle, setDirHandle] = useState(null);

    const handleFolderScan = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setDirHandle(handle);
            setIsScanning(true);
            
            const newMatched = [];
            const newUnmatched = [];

            for await (const entry of handle.values()) {
                if (entry.kind !== 'file') continue;
                if (!entry.name.toLowerCase().match(/\.(pdf|jpe?g|png)$/)) continue;
                
                const file = await entry.getFile();
                const normalizedFileName = normalizeName(file.name);

                // Try to find a matching driver by filename
                let matchedDriver = null;
                for (const driver of drivers) {
                    const normName = normalizeName(driver.name);
                    const normAlias = normalizeName(driver.alias);
                    
                    if ((normName && normName.length > 3 && normalizedFileName.includes(normName)) || 
                        (normAlias && normAlias.length > 3 && normalizedFileName.includes(normAlias))) {
                        matchedDriver = driver;
                        break;
                    }
                }

                // If not matched by filename and is a PDF, read the PDF content
                let pdfText = '';
                if (file.name.toLowerCase().endsWith('.pdf')) {
                    pdfText = await extractTextFromPDF(file);
                    
                    if (!matchedDriver) {
                        const normalizedPdfText = normalizeName(pdfText);
                        let bestMatch = null;
                        let bestMatchIndex = Infinity;
                        
                        for (const driver of drivers) {
                            const normName = normalizeName(driver.name);
                            const normAlias = normalizeName(driver.alias);
                            
                            // Comprobamos si el nombre está en el PDF (soportando orden inverso)
                            const idxName = matchNameInText(normName, normalizedPdfText);
                            if (idxName !== -1 && idxName < bestMatchIndex) {
                                bestMatchIndex = idxName;
                                bestMatch = driver;
                            }
                            
                            // Hacemos lo mismo con el alias
                            const idxAlias = matchNameInText(normAlias, normalizedPdfText);
                            if (idxAlias !== -1 && idxAlias < bestMatchIndex) {
                                bestMatchIndex = idxAlias;
                                bestMatch = driver;
                            }
                        }
                        
                        matchedDriver = bestMatch;
                    }
                }
                
                // Detectar el mes (ya sea por el nombre del archivo o el texto del PDF)
                const textToAnalyzeForMonth = `${file.name} ${pdfText}`;
                const detectedMonth = detectMonth(textToAnalyzeForMonth);

                if (matchedDriver) {
                    newMatched.push({
                        id: Math.random().toString(36).substr(2, 9),
                        file,
                        fileHandle: entry,
                        driverId: matchedDriver.id,
                        driverName: matchedDriver.name,
                        detectedMonth,
                        status: 'ready'
                    });
                } else {
                    newUnmatched.push({
                        id: Math.random().toString(36).substr(2, 9),
                        file,
                        fileHandle: entry,
                        selectedDriverId: '',
                        detectedMonth,
                        status: 'ready'
                    });
                }
            }

            setMatchedFiles(newMatched);
            setUnmatchedFiles(newUnmatched);
            setIsScanning(false);

        } catch (err) {
            console.error(err);
            if (err.name !== 'AbortError') {
                alert('No se pudo acceder a la carpeta. Asegúrate de dar permisos de edición.');
            }
            setIsScanning(false);
        }
    };

    const handleRemoveFile = (id, isMatched) => {
        if (isMatched) {
            setMatchedFiles(prev => prev.filter(f => f.id !== id));
        } else {
            setUnmatchedFiles(prev => prev.filter(f => f.id !== id));
        }
    };

    const handleUpload = async () => {
        // Collect all ready items (matched + unmatched with selected driver)
        const validUnmatched = unmatchedFiles.filter(uf => uf.selectedDriverId && uf.status === 'ready');
        const validMatched = matchedFiles.filter(mf => mf.status === 'ready');
        const allToUpload = [...validMatched, ...validUnmatched];

        if (allToUpload.length === 0) {
            alert('No hay nóminas listas para subir.');
            return;
        }

        setIsUploading(true);
        
        // Ensure bucket exists before uploading (in case app wasn't hard-reloaded)
        try {
            await initStorageBuckets();
        } catch (e) {
            console.error("Error initializing buckets:", e);
        }

        let successCount = 0;
        let errorCount = 0;
        let lastErrorMessage = '';

        const updateStatus = (id, isMatched, newStatus) => {
            if (isMatched) {
                setMatchedFiles(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
            } else {
                setUnmatchedFiles(prev => prev.map(item => item.id === id ? { ...item, status: newStatus } : item));
            }
        };

        for (const item of allToUpload) {
            const isMatched = !!item.driverName;
            try {
                updateStatus(item.id, isMatched, 'uploading');
                
                // Subir archivo a Supabase
                const url = await uploadFileToBucket(item.file.name, item.file, 'payrolls');
                
                if (url && onUpdateDriver) {
                    const targetDriverId = item.driverId || item.selectedDriverId;
                    const driver = drivers.find(d => d.id === targetDriverId);
                    
                    if (driver) {
                        const existingPayrolls = Array.isArray(driver.payrolls) ? driver.payrolls : [];
                        const newPayroll = {
                            date: new Date().toISOString(),
                            url: url,
                            fileName: item.detectedMonth ? item.detectedMonth : item.file.name
                        };
                        
                        await onUpdateDriver(driver.id, {
                            ...driver, // <- Mantener el resto de propiedades
                            payrolls: [...existingPayrolls, newPayroll]
                        });
                        
                        updateStatus(item.id, isMatched, 'done');
                        successCount++;
                        
                        // Delete local file
                        if (dirHandle && item.fileHandle) {
                            try {
                                await dirHandle.removeEntry(item.fileHandle.name);
                            } catch (e) {
                                console.error("Failed to delete local file:", e);
                            }
                        }
                    } else {
                        throw new Error("Conductor no encontrado");
                    }
                }
            } catch (err) {
                console.error(`Error uploading payroll ${item.file.name}:`, err);
                updateStatus(item.id, isMatched, 'error');
                errorCount++;
                if (!lastErrorMessage) lastErrorMessage = err.message || "Error desconocido";
            }
        }

        setIsUploading(false);
        alert(`✅ ${successCount} nóminas subidas y asignadas correctamente.${errorCount > 0 ? `\n⚠️ ${errorCount} fallaron.\nMotivo: ${lastErrorMessage}` : ''}`);
    };

    if (!isOpen) return null;

    const readyCount = matchedFiles.filter(f => f.status === 'ready').length + 
                      unmatchedFiles.filter(f => f.selectedDriverId && f.status === 'ready').length;

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-center justify-center sm:p-4 backdrop-blur-md">
            <div className="bg-white sm:rounded-2xl w-full max-w-2xl modal-mobile-full flex flex-col shadow-2xl">
                <div className="border-b border-gray-100 p-4 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                            <FileText size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800">Subir Nóminas</h2>
                            <p className="text-xs text-gray-500">
                                Asignación masiva desde carpeta
                            </p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto bg-slate-50/50">
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-2xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-white rounded-xl shadow-sm">
                                <FolderOpen size={20} className="text-blue-600" />
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-bold text-blue-800">Cargar desde Carpeta</p>
                                <p className="text-[10px] text-blue-500">Selecciona la carpeta con las nóminas (PDF, JPG, PNG). El sistema intentará emparejarlas por el nombre del archivo.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleFolderScan}
                            disabled={isScanning}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            {isScanning ? (
                                <><Loader2 size={16} className="animate-spin" /> Buscando archivos...</>
                            ) : (
                                <><FolderOpen size={16} /> Seleccionar Carpeta</>
                            )}
                        </button>
                    </div>

                    {matchedFiles.length > 0 && (
                        <div>
                            <h3 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2 flex items-center gap-1">
                                <CheckCircle size={14} /> Emparejados automáticamente ({matchedFiles.length})
                            </h3>
                            <div className="space-y-2">
                                {matchedFiles.map(item => (
                                    <div key={item.id} className="bg-white border border-emerald-100 rounded-lg p-3 flex items-center justify-between">
                                        <div className="min-w-0 flex-1 pr-4">
                                            <p className="text-xs font-bold text-slate-700 truncate">{item.file.name}</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                Asignado a: <span className="font-bold text-blue-600">{item.driverName}</span>
                                                {item.detectedMonth && <span className="ml-2 font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">[{item.detectedMonth}]</span>}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            {item.status === 'ready' && <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-1 rounded font-bold">Listo</span>}
                                            {item.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                                            {item.status === 'done' && <CheckCircle size={14} className="text-emerald-500" />}
                                            {item.status === 'error' && <AlertTriangle size={14} className="text-red-500" />}
                                            
                                            {item.status === 'ready' && (
                                                <button onClick={() => handleRemoveFile(item.id, true)} className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Quitar de la lista">
                                                    <X size={16} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {unmatchedFiles.length > 0 && (
                        <div>
                            <h3 className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-2 mt-4 flex items-center gap-1">
                                <AlertTriangle size={14} /> Requieren asignación manual ({unmatchedFiles.length})
                            </h3>
                            <div className="space-y-2">
                                {unmatchedFiles.map(item => (
                                    <div key={item.id} className="bg-white border border-amber-200 rounded-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-bold text-slate-700 truncate">{item.file.name}</p>
                                            {item.detectedMonth && <p className="text-[10px] mt-0.5 font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded inline-block">[{item.detectedMonth}]</p>}
                                        </div>
                                        <div className="flex items-center gap-2 w-full sm:w-auto">
                                            <User size={14} className="text-slate-400" />
                                            <select 
                                                className="flex-1 sm:w-48 text-xs border border-slate-200 rounded-lg p-1.5 focus:ring-blue-500 focus:border-blue-500 bg-slate-50"
                                                value={item.selectedDriverId}
                                                onChange={(e) => {
                                                    setUnmatchedFiles(prev => prev.map(f => f.id === item.id ? { ...f, selectedDriverId: e.target.value } : f));
                                                }}
                                                disabled={item.status === 'done' || item.status === 'uploading'}
                                            >
                                                <option value="">-- Seleccionar Conductor --</option>
                                                {drivers.filter(d => d.isActive !== false).map(d => (
                                                    <option key={d.id} value={d.id}>{d.name}</option>
                                                ))}
                                            </select>
                                            <div className="w-6 flex justify-center items-center">
                                                {item.status === 'uploading' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                                                {item.status === 'done' && <CheckCircle size={14} className="text-emerald-500" />}
                                                {item.status === 'error' && <AlertTriangle size={14} className="text-red-500" />}
                                                {item.status === 'ready' && (
                                                    <button onClick={() => handleRemoveFile(item.id, false)} className="text-slate-300 hover:text-red-500 transition-colors" title="Quitar de la lista">
                                                        <X size={16} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t border-gray-100 p-4 flex items-center justify-between shrink-0">
                    <button
                        onClick={onClose}
                        className="px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
                    >
                        Cerrar
                    </button>
                    {readyCount > 0 && (
                        <button
                            onClick={handleUpload}
                            disabled={isUploading}
                            className="px-6 py-2.5 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg"
                        >
                            {isUploading ? (
                                <><Loader2 size={16} className="animate-spin" /> Subiendo...</>
                            ) : (
                                <><Upload size={16} /> Subir {readyCount} Nóminas</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
