// La barra que sube mientras se pone el FACT a lo exportado a Factusol. Vive
// fuera de la pantalla de Envíos para que se vea aunque se cambie de pestaña o
// la app se haya recargado y esté siguiendo por donde iba.
export default function BarraFact({ estado, onReintentar, onDescartar }) {
    if (!estado) return null;
    const { hechos, total, faltan = [], enMarcha } = estado;
    const porcentaje = total > 0 ? Math.round((hechos / total) * 100) : 0;
    const terminado = !enMarcha && faltan.length === 0;

    return (
        <div className="fixed bottom-4 right-4 z-[120] w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 p-4" role="status">
            <div className="flex justify-between items-baseline gap-2 mb-2">
                <span className="text-sm font-bold text-slate-800">
                    {enMarcha ? 'Poniendo el FACT…' : terminado ? 'FACT puesto' : 'FACT a medias'}
                </span>
                <span className="text-xs font-semibold text-slate-500">{hechos} de {total}</span>
            </div>
            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={porcentaje} aria-valuemin={0} aria-valuemax={100}>
                <div
                    className={`h-full rounded-full transition-all duration-300 ${!enMarcha && !terminado ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${porcentaje}%` }}
                />
            </div>
            {enMarcha && (
                <p className="text-[11px] text-slate-500 mt-2">Puedes seguir trabajando. Si la página se recarga, sigue por donde iba.</p>
            )}
            {!enMarcha && !terminado && (
                <>
                    <p className="text-[11px] text-slate-600 mt-2">
                        Faltan {faltan.length} por marcar: {faltan.slice(0, 6).join(', ')}{faltan.length > 6 ? '…' : ''}
                    </p>
                    <div className="flex gap-2 mt-3">
                        <button onClick={onReintentar} className="flex-1 py-2 text-xs font-bold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">Reintentar</button>
                        <button onClick={onDescartar} className="py-2 px-3 text-xs font-bold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50">Dejarlo</button>
                    </div>
                </>
            )}
        </div>
    );
}
