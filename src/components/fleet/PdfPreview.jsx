import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, ZoomIn, ZoomOut, Maximize2, Copy, Check } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

/**
 * PdfPreview — Renderiza un PDF en un canvas con pdf.js.
 * Se usa en lugar de un <iframe> porque el visor integrado del navegador
 * no muestra los PDF cargados desde data:/blob: (se ve el recuadro en negro).
 *
 * Props:
 *   src: string — data: URL, blob: URL o URL remota del PDF
 */

// Traduce los errores de pdf.js a un motivo entendible
function describeError(err) {
    if (!err) return 'Error desconocido';
    const name = err.name || '';
    const msg  = err.message || '';
    if (/Missing/i.test(name))    return 'No se encuentra el archivo en el servidor (404)';
    if (/Response/i.test(name))   return `El servidor rechazó la descarga${err.status ? ` (error ${err.status})` : ''}`;
    if (/InvalidPDF/i.test(name)) return 'El archivo está dañado o no es un PDF válido';
    if (/Password/i.test(name))   return 'El PDF está protegido con contraseña';
    if (/fetch|network|CORS/i.test(msg)) return 'No se pudo descargar el archivo (bloqueo de red o CORS)';
    // Motivo genérico, sin volcar la URL completa
    return `${name || 'Error'}: ${msg.split(' while ')[0].slice(0, 120)}`.trim();
}

function dataUrlToBytes(dataUrl) {
    const base64 = dataUrl.split(',')[1] || '';
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

export default function PdfPreview({ src }) {
    const canvasRef    = useRef(null);
    const containerRef = useRef(null);
    const docRef       = useRef(null);

    const [status, setStatus]     = useState('loading'); // loading | ready | error | fallback
    const [errorMsg, setErrorMsg] = useState('');
    const [errorDetail, setErrorDetail] = useState('');
    const [copied, setCopied]     = useState(false);
    const [numPages, setNumPages] = useState(0);
    const [page, setPage]         = useState(1);
    const [zoom, setZoom]         = useState(1);
    const [width, setWidth]       = useState(0);

    // Ancho disponible (para ajustar el PDF al contenedor)
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setWidth(el.clientWidth);
        const ro = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Cargar el documento
    useEffect(() => {
        if (!src) return;
        let cancelled = false;
        setStatus('loading'); setErrorMsg(''); setErrorDetail(''); setCopied(false);
        setNumPages(0); setPage(1); setZoom(1);
        const task = pdfjsLib.getDocument(
            src.startsWith('data:') ? { data: dataUrlToBytes(src) } : { url: src }
        );
        task.promise
            .then(pdf => {
                if (cancelled) return;
                docRef.current = pdf;
                setNumPages(pdf.numPages);
                setStatus('ready');
            })
            .catch(err => {
                if (cancelled) return;
                const detail = `${err?.name || 'Error'}: ${err?.message || ''}\nOrigen: ${src.startsWith('data:') ? `archivo subido a la app (${src.slice(0, 40)}…, ${Math.round(src.length / 1365)} KB aprox.)` : src}`;
                console.error('[PdfPreview] No se pudo abrir el PDF:', detail);
                setErrorMsg(describeError(err));
                setErrorDetail(detail);
                // Si el PDF viene de una URL, el visor del navegador aún puede mostrarlo
                // (no necesita CORS), así que lo usamos como plan B.
                setStatus(src.startsWith('data:') ? 'error' : 'fallback');
            });
        return () => {
            cancelled = true;
            docRef.current = null;
            task.destroy();
        };
    }, [src]);

    // Pintar la página actual
    useEffect(() => {
        if (status !== 'ready' || !docRef.current || !width) return;
        let cancelled = false;
        let renderTask = null;
        docRef.current.getPage(page)
            .then(pdfPage => {
                const canvas = canvasRef.current;
                if (cancelled || !canvas) return null;
                const dpr  = window.devicePixelRatio || 1;
                const base = pdfPage.getViewport({ scale: 1 });
                // Ajuste al ancho del contenedor (menos el padding) por el zoom del usuario
                const scale    = ((width - 32) / base.width) * zoom;
                const viewport = pdfPage.getViewport({ scale: scale * dpr });
                canvas.width  = Math.floor(viewport.width);
                canvas.height = Math.floor(viewport.height);
                canvas.style.width  = `${Math.floor(viewport.width / dpr)}px`;
                canvas.style.height = `${Math.floor(viewport.height / dpr)}px`;
                const ctx = canvas.getContext('2d');
                renderTask = pdfPage.render({ canvas, canvasContext: ctx, viewport });
                return renderTask.promise;
            })
            .catch(err => {
                if (!cancelled && err?.name !== 'RenderingCancelledException') setStatus('error');
            });
        return () => { cancelled = true; renderTask?.cancel(); };
    }, [status, page, zoom, width]);

    // Copia el detalle técnico para poder pegarlo en una consulta de soporte
    const copyDetail = async () => {
        let ok = false;
        try {
            await navigator.clipboard.writeText(errorDetail);
            ok = true;
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = errorDetail;
                document.body.appendChild(ta);
                ta.select();
                ok = document.execCommand('copy');
                ta.remove();
            } catch { /* el navegador no permite copiar: el detalle se ve en pantalla */ }
        }
        if (!ok) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const CopyDetailButton = ({ subtle }) => (
        <button
            type="button"
            onClick={copyDetail}
            className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg border transition-colors ${
                subtle
                    ? 'border-amber-300 text-amber-700 hover:bg-amber-100'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-100 bg-white'
            }`}
        >
            {copied ? <><Check size={12} /> Copiado</> : <><Copy size={12} /> Copiar detalle del error</>}
        </button>
    );

    // Plan B: visor integrado del navegador (solo sirve con URLs, no con data:)
    if (status === 'fallback') {
        return (
            <div className="flex-1 min-h-0 flex flex-col">
                <div className="px-3 py-2 bg-amber-50 border-b border-amber-200 text-xs text-amber-700 font-medium flex items-center justify-between gap-2 shrink-0 flex-wrap">
                    <span className="flex items-center gap-2">
                        <AlertTriangle size={14} className="shrink-0" />
                        Mostrando el documento con el visor del navegador{errorMsg ? ` — ${errorMsg}` : ''}
                    </span>
                    <CopyDetailButton subtle />
                </div>
                <iframe src={src} title="Documento PDF" className="flex-1 min-h-0 w-full bg-white" />
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Barra de herramientas */}
            {status === 'ready' && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 bg-white border-b border-slate-200 shrink-0">
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page <= 1}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Página anterior"
                        ><ChevronLeft size={18} /></button>
                        <span className="text-xs font-bold text-slate-600 tabular-nums px-1">
                            {page} / {numPages}
                        </span>
                        <button
                            onClick={() => setPage(p => Math.min(numPages, p + 1))}
                            disabled={page >= numPages}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                            title="Página siguiente"
                        ><ChevronRight size={18} /></button>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setZoom(z => Math.max(0.5, +(z - 0.25).toFixed(2)))}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                            title="Reducir"
                        ><ZoomOut size={18} /></button>
                        <span className="text-xs font-bold text-slate-600 tabular-nums w-10 text-center">{Math.round(zoom * 100)}%</span>
                        <button
                            onClick={() => setZoom(z => Math.min(4, +(z + 0.25).toFixed(2)))}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                            title="Ampliar"
                        ><ZoomIn size={18} /></button>
                        <button
                            onClick={() => setZoom(1)}
                            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
                            title="Ajustar al ancho"
                        ><Maximize2 size={16} /></button>
                    </div>
                </div>
            )}

            {/* Lienzo */}
            <div ref={containerRef} className="flex-1 min-h-0 overflow-auto bg-slate-200/60 p-4">
                {status === 'loading' && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-2">
                        <Loader2 size={28} className="animate-spin" />
                        <p className="text-sm font-medium">Cargando documento…</p>
                    </div>
                )}
                {status === 'error' && (
                    <div className="h-full flex flex-col items-center justify-center text-center text-slate-500 gap-2 px-4">
                        <div className="bg-red-50 text-red-500 p-3 rounded-full"><AlertTriangle size={26} /></div>
                        <p className="font-medium text-slate-600">No se ha podido mostrar el PDF</p>
                        {errorMsg && (
                            <p className="text-sm font-bold text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5 max-w-md break-words">
                                {errorMsg}
                            </p>
                        )}
                        <p className="text-sm text-slate-400">Puedes descargarlo o abrirlo en una pestaña nueva</p>
                        {errorDetail && (
                            <>
                                <pre className="text-[10px] text-left text-slate-500 bg-white border border-slate-200 rounded-lg p-2 max-w-md max-h-24 overflow-auto whitespace-pre-wrap break-all select-all">
                                    {errorDetail}
                                </pre>
                                <CopyDetailButton />
                            </>
                        )}
                    </div>
                )}
                <canvas
                    ref={canvasRef}
                    className={`mx-auto bg-white shadow-lg rounded ${status === 'ready' ? '' : 'hidden'}`}
                />
            </div>
        </div>
    );
}
