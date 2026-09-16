/**
 * Franja que sale cuando el servidor tiene una versión más nueva que la que corre
 * en esta pestaña. Va montada al lado de <App/> en main.jsx, así que la ven
 * clientes, repartidores y oficina por igual, en cualquier pantalla.
 *
 * "Más tarde" la esconde un rato; la recarga automática al volver de segundo plano
 * la decide el hook, no esta franja (ver hooks/useVersionNueva).
 */
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { useVersionNueva } from '../hooks/useVersionNueva';

const POSPONER_MS = 10 * 60 * 1000;

const AvisoVersionNueva = () => {
    const { hayVersionNueva, actualizar } = useVersionNueva();
    const [pospuesta, setPospuesta] = useState(false);

    useEffect(() => {
        if (!pospuesta) return undefined;
        const t = setTimeout(() => setPospuesta(false), POSPONER_MS);
        return () => clearTimeout(t);
    }, [pospuesta]);

    if (!hayVersionNueva || pospuesta) return null;

    return (
        <div
            role="status"
            className="fixed inset-x-0 bottom-0 z-[200] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 pointer-events-none"
        >
            <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-2xl ring-1 ring-white/10">
                <RefreshCw size={20} className="shrink-0 text-blue-300" />
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold leading-tight">Hay una versión nueva de la aplicación</p>
                    <p className="text-xs text-slate-300 leading-tight mt-0.5">Actualiza para seguir con la última versión.</p>
                </div>
                <button
                    type="button"
                    onClick={() => setPospuesta(true)}
                    className="shrink-0 text-xs font-bold text-slate-300 hover:text-white px-2 py-2"
                >
                    Más tarde
                </button>
                <button
                    type="button"
                    onClick={actualizar}
                    className="shrink-0 rounded-xl bg-blue-500 px-4 py-2 text-sm font-black text-white hover:bg-blue-400 active:scale-95 transition"
                >
                    Actualizar
                </button>
            </div>
        </div>
    );
};

export default AvisoVersionNueva;
