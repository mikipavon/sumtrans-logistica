import { useEffect, useState } from 'react';
import { Sparkles, RefreshCw } from 'lucide-react';
import { consultarSaldoIA } from '../../utils/iaAlbaran';
import { albaranesPorFotoDelMes, nivelDeSaldo } from '../../utils/lecturaAlbaranIA';

// Cuánto queda y cuánto se lleva gastado en la lectura de albaranes con IA.
// OpenRouter cuenta en dólares y así se enseña: pasarlo a euros sería inventar
// un cambio. El saldo es prepagado, así que "queda" es lo máximo que se puede
// gastar hasta que alguien recargue en openrouter.ai.

const URL_RECARGA = 'https://openrouter.ai/settings/credits';

function dolares(n) {
    if (n === null || n === undefined) return '—';
    // Una hoja cuesta unas décimas de céntimo: con dos decimales saldría "0,00 $".
    const decimales = n > 0 && n < 0.01 ? 4 : 2;
    return `${n.toLocaleString('es-ES', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })} $`;
}

const COLORES = {
    verde: { barra: 'bg-emerald-500', texto: 'text-emerald-700' },
    naranja: { barra: 'bg-amber-500', texto: 'text-amber-700' },
    rojo: { barra: 'bg-red-500', texto: 'text-red-700' },
    desconocido: { barra: 'bg-slate-300', texto: 'text-slate-500' },
};

export default function PanelConsumoIA({ allShipments, hojasImportacion = 0, costeImportacion = 0, refresco = 0 }) {
    const [saldo, setSaldo] = useState(null);
    const [error, setError] = useState('');
    const [cargando, setCargando] = useState(false);
    const [pedido, setPedido] = useState(0);

    useEffect(() => {
        let vivo = true;
        setCargando(true);
        consultarSaldoIA()
            .then((s) => { if (vivo) { setSaldo(s); setError(''); } })
            .catch((err) => { if (vivo) setError(err?.message || 'No se pudo consultar el saldo'); })
            .finally(() => { if (vivo) setCargando(false); });
        return () => { vivo = false; };
    }, [refresco, pedido]);

    const nivel = nivelDeSaldo(saldo?.queda);
    const colores = COLORES[nivel];
    const porcentaje = saldo?.cargado > 0 ? Math.max(0, Math.min(100, (saldo.queda / saldo.cargado) * 100)) : 0;
    const albaranesMes = albaranesPorFotoDelMes(allShipments);

    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-bold text-slate-700">
                    <Sparkles size={14} className="text-violet-500" /> Lectura con IA · consumo
                </span>
                <div className="flex items-center gap-3">
                    <a href={URL_RECARGA} target="_blank" rel="noreferrer" className="font-bold text-violet-600 hover:text-violet-800">Recargar</a>
                    <button onClick={() => setPedido(p => p + 1)} disabled={cargando} title="Actualizar" className="text-slate-400 hover:text-slate-600 disabled:opacity-40">
                        <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {error ? (
                <p className="text-red-600 font-bold">No se pudo consultar el saldo: {error}</p>
            ) : (
                <>
                    <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className={`h-full ${colores.barra} transition-all`} style={{ width: `${porcentaje}%` }} />
                        </div>
                        <span className={`font-bold whitespace-nowrap ${colores.texto}`}>
                            Quedan {dolares(saldo?.queda)} de {dolares(saldo?.cargado)}
                        </span>
                    </div>
                    {nivel === 'rojo' && <p className="text-red-600 font-bold">Queda muy poco saldo: cuando se acabe, las fotos se leerán con el lector gratuito, que falla mucho más.</p>}
                    {nivel === 'naranja' && <p className="text-amber-700 font-bold">Conviene recargar pronto.</p>}
                </>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-slate-600">
                <div><span className="block text-[10px] uppercase font-bold text-slate-400">Gastado este mes</span>{dolares(saldo?.gastadoMes)}</div>
                <div><span className="block text-[10px] uppercase font-bold text-slate-400">Albaranes por foto este mes</span>{albaranesMes}</div>
                <div><span className="block text-[10px] uppercase font-bold text-slate-400">Esta importación</span>{hojasImportacion} hoja{hojasImportacion === 1 ? '' : 's'} · {dolares(costeImportacion)}</div>
            </div>
        </div>
    );
}
