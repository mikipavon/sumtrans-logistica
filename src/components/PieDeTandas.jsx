// Pie de un listado pintado por tandas (ver usePorTandas): cuántas se ven de
// cuántas hay y el botón para la siguiente tanda.
export default function PieDeTandas({ tandas, nombre, className = '' }) {
    return (
        <div className={`bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500 ${className}`}>
            <span>Mostrando {tandas.visibles.length} de {tandas.total} {nombre}</span>
            {tandas.quedan > 0 && (
                <button
                    type="button"
                    className="px-3 py-1 border border-slate-200 rounded hover:bg-white font-medium text-slate-700"
                    onClick={tandas.verMas}
                >
                    Ver {tandas.siguiente} más
                </button>
            )}
        </div>
    );
}
