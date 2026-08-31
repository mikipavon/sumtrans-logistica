import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Camera, X, RefreshCw, Check, Smartphone } from 'lucide-react';

/**
 * Cámara DENTRO de la app.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────────────
 * El `<input type="file" capture>` de siempre le pasa el turno a la aplicación de
 * cámara del móvil. Mientras esa cámara está delante, la nuestra queda en segundo
 * plano y Android la mata para darle memoria: al confirmar la foto, el repartidor se
 * encuentra la app cerrada y el albarán a medias perdido. Le pasó a Javi y a Francis.
 *
 * Aquí la foto se hace sin salir de la app (`getUserMedia`, igual que el escáner de
 * bultos), así que Android no tiene ocasión de matarla.
 *
 * Si la cámara de dentro no arranca (permisos, móvil raro), queda el botón de
 * respaldo que abre la del móvil: es mejor arriesgarse que quedarse sin poder hacer
 * la foto.
 *
 * Nota: va en un portal a propósito. El panel del repartidor se dibuja dentro de un
 * `style={{ zoom }}` (la lupa A+/A-) y el zoom de CSS no ajusta las unidades de
 * pantalla, así que un modal medido en vh se descuadra. Fuera del zoom y midiendo
 * con `inset-0`, ocupa exactamente lo que mide la pantalla.
 *
 * Y va POR ENCIMA DE TODO. La cámara se abre desde dentro de otros modales: el del
 * albarán está en la capa 9999 y el tutorial guiado llega a 10001, así que con una
 * capa normal la cámara se abría por detrás y no se podía hacer la foto.
 */
const CameraCaptureModal = ({
    isOpen,
    onClose,
    onCapture,
    onFallback,
    titulo = 'Hacer foto',
    maxLado = 1600,
    calidad = 0.8
}) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [error, setError] = useState(null);
    const [preview, setPreview] = useState(null);
    const [listo, setListo] = useState(false);

    const pararCamara = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        setListo(false);
    }, []);

    const arrancarCamara = useCallback(async () => {
        setError(null);
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('sin-soporte');
            }
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: { ideal: 'environment' },
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                // play() a propósito SIN esperar: su promesa puede no resolverse nunca
                // (pasa con cámaras lentas), y esperándola el botón de disparar se
                // quedaba deshabilitado para siempre. Quien dice que hay imagen es el
                // propio vídeo, con onLoadedMetadata.
                videoRef.current.play().catch(() => {});
                if (videoRef.current.readyState >= 2) setListo(true);
            }
        } catch (err) {
            console.error('[Cámara] No se pudo abrir:', err);
            pararCamara();
            setError(
                err?.name === 'NotAllowedError'
                    ? 'No has dado permiso para usar la cámara.'
                    : err?.name === 'NotFoundError'
                        ? 'Este móvil no tiene cámara disponible.'
                        : 'No se ha podido abrir la cámara.'
            );
        }
    }, [pararCamara]);

    // Abrir y cerrar con el modal.
    useEffect(() => {
        if (!isOpen) {
            pararCamara();
            setPreview(null);
            setError(null);
            return;
        }
        arrancarCamara();
        return pararCamara;
    }, [isOpen, arrancarCamara, pararCamara]);

    // Si el repartidor se va a otra app (una llamada, WhatsApp), Android le quita la
    // cámara y al volver se quedaría el vídeo en negro. Se suelta y se vuelve a pedir.
    useEffect(() => {
        if (!isOpen) return;
        const alCambiarVisibilidad = () => {
            if (document.visibilityState === 'hidden') {
                pararCamara();
            } else if (!preview) {
                arrancarCamara();
            }
        };
        document.addEventListener('visibilitychange', alCambiarVisibilidad);
        return () => document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    }, [isOpen, preview, arrancarCamara, pararCamara]);

    const disparar = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;

        // Se encoge aquí mismo: lo que sale del canvas ya es la foto definitiva.
        const escala = Math.min(1, maxLado / Math.max(video.videoWidth, video.videoHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * escala);
        canvas.height = Math.round(video.videoHeight * escala);
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
        setPreview(canvas.toDataURL('image/jpeg', calidad));
        canvas.width = 0;
        canvas.height = 0;
    };

    const repetir = () => {
        setPreview(null);
        if (!streamRef.current) arrancarCamara();
    };

    const usarFoto = () => {
        const foto = preview;
        pararCamara();
        setPreview(null);
        onCapture(foto);
    };

    const cerrar = () => {
        pararCamara();
        setPreview(null);
        onClose();
    };

    const irALaDelMovil = () => {
        pararCamara();
        setPreview(null);
        onClose();
        onFallback?.();
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[10050] bg-black flex flex-col">
            <div className="flex items-center justify-between p-4 bg-slate-900 text-white shrink-0">
                <div className="flex items-center gap-2">
                    <Camera size={20} className="text-blue-400" />
                    <span className="font-bold">{titulo}</span>
                </div>
                <button
                    type="button"
                    onClick={cerrar}
                    className="p-2 rounded-full hover:bg-white/10"
                    aria-label="Cerrar"
                >
                    <X size={24} />
                </button>
            </div>

            <div className="flex-1 min-h-0 relative flex items-center justify-center">
                {error ? (
                    <div className="p-6 text-center text-white max-w-sm">
                        <p className="font-bold text-lg mb-2">{error}</p>
                        <p className="text-sm text-white/70 mb-6">
                            Puedes usar la cámara del móvil, pero al volver la app puede cerrarse
                            y perderse lo que hayas escrito.
                        </p>
                        <div className="flex flex-col gap-3">
                            <button
                                type="button"
                                onClick={arrancarCamara}
                                className="w-full py-3 bg-blue-600 rounded-xl font-bold flex items-center justify-center gap-2"
                            >
                                <RefreshCw size={18} /> Reintentar
                            </button>
                            {onFallback && (
                                <button
                                    type="button"
                                    onClick={irALaDelMovil}
                                    className="w-full py-3 bg-white/10 rounded-xl font-bold flex items-center justify-center gap-2"
                                >
                                    <Smartphone size={18} /> Usar la cámara del móvil
                                </button>
                            )}
                        </div>
                    </div>
                ) : preview ? (
                    <img src={preview} alt="Foto hecha" className="max-w-full max-h-full object-contain" />
                ) : (
                    <>
                        <video
                            ref={videoRef}
                            playsInline
                            muted
                            autoPlay
                            onLoadedMetadata={() => setListo(true)}
                            className="w-full h-full object-contain"
                        />
                        {!listo && (
                            <p className="absolute text-white/80 text-sm font-bold uppercase tracking-widest">
                                Abriendo la cámara...
                            </p>
                        )}
                    </>
                )}
            </div>

            {!error && (
                <div className="p-6 bg-slate-900 shrink-0">
                    {preview ? (
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={repetir}
                                className="flex-1 py-4 bg-white/10 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                            >
                                <RefreshCw size={20} /> Repetir
                            </button>
                            <button
                                type="button"
                                onClick={usarFoto}
                                className="flex-1 py-4 bg-green-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                            >
                                <Check size={20} /> Usar foto
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={disparar}
                            disabled={!listo}
                            className="w-full py-5 bg-white text-slate-900 rounded-2xl font-black text-lg flex items-center justify-center gap-2 active:scale-95 transition-transform disabled:opacity-40"
                        >
                            <Camera size={24} /> HACER FOTO
                        </button>
                    )}
                </div>
            )}
        </div>,
        document.body
    );
};

export default CameraCaptureModal;
