import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { X, Camera, RefreshCw, CheckCircle, Package } from 'lucide-react';

const ScannerModal = ({ isOpen, onClose, onScan }) => {
    const scannerRef = useRef(null);
    const containerId = "qr-reader-immune";
    const [isScanning, setIsScanning] = useState(false);
    const [cameras, setCameras] = useState([]);
    const [currentCameraId, setCurrentCameraId] = useState(() => localStorage.getItem('drv_default_camera') || null);
    const [error, setError] = useState(null);
    const [scannedHistory, setScannedHistory] = useState([]);
    const [lastScanFeedback, setLastScanFeedback] = useState(null);
    
    // Lógica para escaneo continuo y natural
    const isMountedRef = useRef(true);
    const onScanRef = useRef(onScan);
    const isProcessingRef = useRef(false);
    
    // Prevención de duplicados sin necesidad de pausar
    const lastScannedBarcode = useRef(null);
    const framesWithoutBarcode = useRef(0);
    
    // Mantener refs sincronizados
    useEffect(() => { onScanRef.current = onScan; }, [onScan]);
    useEffect(() => { isMountedRef.current = true; return () => { isMountedRef.current = false; }; }, []);

    const scannerConfig = {
        fps: 10,
        qrbox: (videoWidth, videoHeight) => {
            const w = videoWidth ? Math.max(videoWidth * 0.95, 250) : 250;
            const h = videoHeight ? Math.max(videoHeight * 0.85, 250) : 250;
            return { width: w, height: h };
        },
        formatsToSupport: [
            Html5QrcodeSupportedFormats.QR_CODE,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_93
        ]
    };

    useEffect(() => {
        let timer;
        if (isOpen) {
            setScannedHistory([]);
            setLastScanFeedback(null);
            setError(null);
            lastScannedBarcode.current = null;
            framesWithoutBarcode.current = 0;
            isProcessingRef.current = false;
            timer = setTimeout(() => initScanner(), 400);
        } else {
            stopScanner();
        }
        
        return () => {
            if (timer) clearTimeout(timer);
            // Solo paramos si se desmonta o se cierra
            stopScanner();
        };
    }, [isOpen]);

    const initScanner = async () => {
        try {
            const devices = await Html5Qrcode.getCameras();
            if (!isMountedRef.current) return;
            setCameras(devices);
            // Si el usuario ya eligió una lente específica antes, la usamos
            if (currentCameraId) {
                startWithId(currentCameraId);
            } else {
                // Por defecto, dejamos que el sistema operativo elija la mejor cámara principal trasera
                startWithFacingMode();
            }
        } catch (err) {
            console.error("Error en initScanner:", err);
            startWithFacingMode();
        }
    };

    const handleScanResult = async (text) => {
        // Prevenir ejecuciones concurrentes mientras se procesa la subida a bbdd
        if (isProcessingRef.current) return;

        // Lógica natural de duplicados:
        // Si es el mismo código que acabamos de escanear, y no hemos tenido al menos
        // 5 frames (~0.5s) sin ver el código, lo ignoramos. 
        // Esto obliga al conductor a apartar la cámara para escanear el siguiente bulto.
        if (text === lastScannedBarcode.current && framesWithoutBarcode.current < 5) {
            return;
        }

        // Nuevo escaneo válido
        isProcessingRef.current = true;
        framesWithoutBarcode.current = 0;
        lastScannedBarcode.current = text;

        // Guardar cámara exitosa
        if (currentCameraId) {
            try { localStorage.setItem('drv_default_camera', currentCameraId); } catch (_) {}
        }

        // Vibración
        if (window.navigator.vibrate) window.navigator.vibrate([100, 50, 100]);

        // Feedback visual inmediato
        const scanEntry = { code: text, time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) };
        setScannedHistory(prev => [scanEntry, ...prev]);
        setLastScanFeedback(text);

        // Enviar al padre (bloqueando temporalmente para evitar que dispare 5 veces seguidas la petición)
        try { 
            await onScanRef.current(text); 
        } catch (e) { 
            console.warn('onScan error:', e); 
        }

        // Liberar procesamiento
        isProcessingRef.current = false;

        // Quitar feedback visual después de 2s
        setTimeout(() => {
            if (isMountedRef.current) setLastScanFeedback(null);
        }, 2000);
    };

    const handleScanFailure = (errorMessage) => {
        // Incrementamos el contador de frames sin código.
        // Capamos en 20 para evitar números enormes
        if (framesWithoutBarcode.current < 20) {
            framesWithoutBarcode.current += 1;
        }
    };

    const startWithId = async (id) => {
        if (!isOpen || !isMountedRef.current) return;
        try {
            // Limpiar instancia anterior si existe
            if (scannerRef.current) {
                try { await scannerRef.current.stop(); } catch(e) {}
                scannerRef.current = null;
            }

            const html5QrCode = new Html5Qrcode(containerId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                id,
                scannerConfig,
                (text) => { if (text) handleScanResult(text); },
                (err) => { handleScanFailure(err); }
            );
            if (isMountedRef.current) setIsScanning(true);
        } catch (err) {
            console.error("Fallo al iniciar con ID:", err);
            startWithFacingMode();
        }
    };

    const startWithFacingMode = async () => {
        if (!isOpen || !isMountedRef.current) return;
        try {
            if (scannerRef.current) {
                try { await scannerRef.current.stop(); } catch(e) {}
                scannerRef.current = null;
            }
            const html5QrCode = new Html5Qrcode(containerId);
            scannerRef.current = html5QrCode;

            await html5QrCode.start(
                { facingMode: "environment" },
                scannerConfig,
                (text) => { if (text) handleScanResult(text); },
                (err) => { handleScanFailure(err); }
            );
            if (isMountedRef.current) setIsScanning(true);
        } catch (err) {
            console.error("Fallo total de cámara:", err);
            if (isMountedRef.current) setError("No se pudo iniciar la cámara. Revisa los permisos.");
        }
    };

    const stopScanner = async () => {
        isProcessingRef.current = false;
        if (scannerRef.current) {
            try {
                await scannerRef.current.stop();
            } catch (err) {
                console.warn("Limpieza silenciosa:", err);
            }
            scannerRef.current = null;
            setIsScanning(false);
        }
    };

    const handleClose = () => {
        stopScanner();
        setScannedHistory([]);
        setLastScanFeedback(null);
        onClose();
    };

    const switchCamera = () => {
        if (cameras.length < 2) return;
        const currentIndex = cameras.findIndex(c => c.id === currentCameraId);
        const nextIndex = (currentIndex + 1) % cameras.length;
        const nextCamera = cameras[nextIndex];
        setCurrentCameraId(nextCamera.id);
        startWithId(nextCamera.id);
    };

    const resetCamera = () => {
        try { localStorage.removeItem('drv_default_camera'); } catch (_) {}
        setCurrentCameraId(null);
        setError(null);
        initScanner();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/90 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative flex flex-col" style={{ maxHeight: '95vh' }}>
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl transition-colors ${lastScanFeedback ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                            {lastScanFeedback ? <CheckCircle size={24} /> : <Camera size={24} />}
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-800 leading-none">Escanear</h2>
                            <p className="text-[10px] text-slate-500 mt-1 uppercase font-bold tracking-widest">
                                {scannedHistory.length > 0 
                                    ? `${scannedHistory.length} bulto${scannedHistory.length > 1 ? 's' : ''} escaneado${scannedHistory.length > 1 ? 's' : ''}` 
                                    : 'Escanea todos los bultos seguidos'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-4 flex flex-col items-center overflow-y-auto">
                    {/* Feedback de escaneo exitoso */}
                    {lastScanFeedback && (
                        <div className="w-full mb-3 p-3 bg-green-50 border-2 border-green-400 rounded-2xl flex items-center gap-3 animate-in slide-in-from-top-2 fade-in duration-300">
                            <div className="p-2 bg-green-500 text-white rounded-full shrink-0">
                                <CheckCircle size={20} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-xs font-bold text-green-800 uppercase tracking-wider">¡Bulto Registrado!</p>
                                <p className="text-sm font-mono text-green-700 truncate">{lastScanFeedback}</p>
                            </div>
                        </div>
                    )}

                    <div className={`w-full aspect-square rounded-2xl overflow-hidden bg-black border-4 shadow-inner relative flex items-center justify-center shrink-0 transition-colors duration-300 ${lastScanFeedback ? 'border-green-500' : 'border-indigo-500'}`}>
                        {/* Elemento puro sin re-renderizado reactivo interno para proteger el DOM de la cámara */}
                        <div id={containerId} className="w-full h-full absolute inset-0"></div>
                    </div>
                    
                    {!isScanning && !error && (
                        <div className="mt-4 flex flex-col items-center gap-2 text-indigo-600">
                            <RefreshCw className="animate-spin" size={24} />
                            <span className="text-xs font-bold uppercase tracking-widest">Iniciando lente...</span>
                        </div>
                    )}

                    {error && (
                        <div className="mt-4 p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold text-center">
                            {error}
                        </div>
                    )}

                    {/* Historial de escaneos de esta sesión */}
                    {scannedHistory.length > 0 && (
                        <div className="mt-4 w-full">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                                <Package size={12} />
                                Escaneados ({scannedHistory.length})
                            </p>
                            <div className="space-y-1.5 max-h-[100px] overflow-y-auto">
                                {scannedHistory.map((entry, i) => (
                                    <div key={i} className="flex items-center gap-2 px-3 py-1.5 bg-green-50 rounded-lg border border-green-100">
                                        <CheckCircle size={14} className="text-green-500 shrink-0" />
                                        <span className="text-xs font-mono font-bold text-green-800 truncate">{entry.code}</span>
                                        <span className="text-[10px] text-green-400 ml-auto shrink-0">{entry.time}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="mt-4 w-full space-y-3">
                        {cameras.length > 1 && (
                            <div className="space-y-2">
                                <button
                                    onClick={switchCamera}
                                    className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-bold transition-all shadow-lg shadow-indigo-200"
                                >
                                    <RefreshCw size={20} />
                                    Cambiar lente
                                </button>
                                <button
                                    onClick={resetCamera}
                                    className="w-full text-[10px] text-slate-400 hover:text-slate-600 uppercase font-bold tracking-widest py-1"
                                >
                                    ¿Lente en negro? Restablecer
                                </button>
                            </div>
                        )}
                        {scannedHistory.length === 0 && (
                            <p className="text-center text-[10px] text-slate-500 px-4 uppercase font-bold leading-relaxed">
                                Escanea todos los bultos seguidos. El escáner se mantiene abierto.
                            </p>
                        )}
                    </div>
                </div>
                
                <div className="p-4 border-t border-slate-50 bg-slate-50 shrink-0">
                    <button 
                         onClick={handleClose}
                         className={`w-full py-3 px-4 font-bold rounded-2xl border transition-colors ${
                            scannedHistory.length > 0 
                                ? 'bg-green-600 text-white border-green-600 hover:bg-green-700 shadow-lg shadow-green-200'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                         }`}
                    >
                        {scannedHistory.length > 0 
                            ? `✓ Listo (${scannedHistory.length} escaneado${scannedHistory.length > 1 ? 's' : ''})` 
                            : 'Cerrar Escáner'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ScannerModal;
