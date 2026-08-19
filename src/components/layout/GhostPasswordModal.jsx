import { useState, useEffect, useRef } from 'react';
import { Shield, X } from 'lucide-react';
import { validarNuevaGhostPassword, LONGITUD_MINIMA_GHOST } from '../../utils/ghostPassword';

/**
 * Pide la contraseña del Modo Fantasma.
 *
 * Tres usos, según `mode`:
 *   'unlock'  → un solo campo, para desbloquear.
 *   'crear'   → dos campos, cuando todavía no hay ninguna configurada.
 *   'cambiar' → pide la actual antes de la nueva (si `tieneActual`).
 *
 * `onSubmit` devuelve el mensaje de error a mostrar, o null si todo fue bien.
 */
export default function GhostPasswordModal({ mode, tieneActual = true, onSubmit, onCancel }) {
    const [actual, setActual] = useState('');
    const [nueva, setNueva] = useState('');
    const [repetida, setRepetida] = useState('');
    const [error, setError] = useState('');
    const [enviando, setEnviando] = useState(false);
    const primerCampoRef = useRef(null);

    const esDesbloqueo = mode === 'unlock';
    const pideActual = esDesbloqueo || (mode === 'cambiar' && tieneActual);

    useEffect(() => { primerCampoRef.current?.focus(); }, []);

    const titulo = esDesbloqueo ? 'Modo Fantasma'
        : mode === 'crear' ? 'Crear contraseña del Modo Fantasma'
        : 'Cambiar contraseña del Modo Fantasma';

    const subtitulo = esDesbloqueo
        ? 'Escribe la contraseña para mostrar los datos confidenciales.'
        : 'Se guardará cifrada: ni siquiera desde la base de datos se puede leer.';

    const enviar = async (e) => {
        e.preventDefault();
        if (enviando) return;
        setError('');

        if (!esDesbloqueo) {
            const fallo = validarNuevaGhostPassword(nueva, repetida);
            if (fallo) return setError(fallo);
        }

        setEnviando(true);
        try {
            const mensaje = await onSubmit({ actual, nueva });
            if (mensaje) {
                setError(mensaje);
                setActual('');
            }
        } catch (err) {
            setError(err?.message || 'Ha ocurrido un error inesperado.');
        } finally {
            setEnviando(false);
        }
    };

    const claseCampo = "w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition";

    return (
        <div
            className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <form
                onSubmit={enviar}
                className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6 animate-in zoom-in-95 duration-200"
            >
                <div className="flex items-start gap-3 mb-5">
                    <div className="p-2.5 bg-slate-900 text-amber-400 rounded-lg shrink-0">
                        <Shield size={20} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-slate-800 leading-tight">{titulo}</h2>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">{subtitulo}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        className="text-slate-400 hover:text-slate-700 transition-colors shrink-0"
                        aria-label="Cerrar"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="space-y-3">
                    {pideActual && (
                        <div>
                            <label className="block text-xs font-bold text-slate-500 mb-1">
                                {esDesbloqueo ? 'Contraseña' : 'Contraseña actual'}
                            </label>
                            <input
                                ref={primerCampoRef}
                                type="password"
                                value={actual}
                                onChange={(e) => setActual(e.target.value)}
                                autoComplete="current-password"
                                className={claseCampo}
                            />
                        </div>
                    )}

                    {!esDesbloqueo && (
                        <>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Contraseña nueva</label>
                                <input
                                    ref={pideActual ? undefined : primerCampoRef}
                                    type="password"
                                    value={nueva}
                                    onChange={(e) => setNueva(e.target.value)}
                                    autoComplete="new-password"
                                    className={claseCampo}
                                />
                                <p className="text-[11px] text-slate-400 mt-1">Mínimo {LONGITUD_MINIMA_GHOST} caracteres.</p>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 mb-1">Repetir contraseña nueva</label>
                                <input
                                    type="password"
                                    value={repetida}
                                    onChange={(e) => setRepetida(e.target.value)}
                                    autoComplete="new-password"
                                    className={claseCampo}
                                />
                            </div>
                        </>
                    )}
                </div>

                {error && (
                    <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                        {error}
                    </p>
                )}

                <div className="flex gap-2 mt-6">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={enviando}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                        {enviando ? 'Comprobando...' : esDesbloqueo ? 'Desbloquear' : 'Guardar'}
                    </button>
                </div>
            </form>
        </div>
    );
}
