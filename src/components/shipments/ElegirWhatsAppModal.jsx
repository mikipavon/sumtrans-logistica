import { useState } from 'react';
import { MessageSquare, PhoneCall } from 'lucide-react';

/**
 * La ventana de "Enviar Justificante": a qué WhatsApp va.
 *
 * Enseña SIEMPRE las dos puntas del albarán. La que tiene móvil sale en verde con
 * el número; la que no, en claro con "Añadir teléfono". Abajo, "Enviar a otro
 * número". Los dos caminos que acaban tecleando llevan a la misma pantalla, que
 * obliga a decir de quién es el número: del remitente, del destinatario o de
 * nadie (un contacto puntual). Sin marcarlo no se envía, y no viene nada marcado
 * de antemano: es la única forma de que un número no se pegue a la ficha
 * equivocada por un toque de más.
 *
 * La misma para el repartidor (tarjeta de la parada) y para la oficina (detalle
 * del albarán en Envíos). Sólo pinta: quién la abre decide qué pasa al elegir.
 *
 * @param prompt  null (cerrada) o { lados, editando, phone, deQuien, saving }.
 *                lados: ver ladosDelEnvio. deQuien: null | 'Remitente' |
 *                'Destinatario' | 'puntual'.
 * @param onChange          setter del prompt (admite función o valor, como setState).
 * @param onElegirOpcion    (opcion) => …  se ha pulsado uno de los móviles conocidos.
 * @param onEnviarTecleado  ({ phone, deQuien }) => …  número tecleado y de quién es.
 */

export const PUNTUAL = 'puntual';

const textoDelDestino = (lado) => {
    switch (lado.destino) {
        case 'nueva': return 'No tiene ficha: se le crea una con este móvil';
        case 'sustituye': return `Ficha llena: sustituye a su móvil ${lado.movilActual}`;
        default: return 'Se guarda en su ficha';
    }
};

const esPunta = (deQuien) => deQuien === 'Remitente' || deQuien === 'Destinatario';

export default function ElegirWhatsAppModal({ prompt, onChange, onElegirOpcion, onEnviarTecleado }) {
    const [error, setError] = useState(null);
    if (!prompt) return null;

    const lados = prompt.lados || [];
    const hayMoviles = lados.some(l => l.moviles?.length > 0);

    const irAlTeclado = () => {
        setError(null);
        onChange(prev => ({ ...prev, editando: true, phone: '', deQuien: null }));
    };

    const enviarTecleado = () => {
        if (prompt.saving) return;
        if (!String(prompt.phone || '').trim()) {
            setError('Escribe el número de WhatsApp.');
            return;
        }
        if (!prompt.deQuien) {
            setError('Indica de quién es el número antes de enviar.');
            return;
        }
        setError(null);
        onEnviarTecleado({ phone: prompt.phone, deQuien: prompt.deQuien });
    };

    const elegirDeQuien = (deQuien) => {
        setError(null);
        onChange(prev => ({ ...prev, deQuien }));
    };

    const etiquetaImportes = (paga) => paga ? ' · PAGA EL PORTE' : ' · SIN IMPORTES';

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 max-h-[92dvh] overflow-y-auto">
                <div className="p-6">
                    <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                        <MessageSquare size={24} />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-1">Enviar Justificante</h3>

                    {!prompt.editando ? (
                        <>
                            <p className="text-sm text-slate-500 mb-5">¿A qué WhatsApp lo mando?</p>

                            <div className="space-y-2 mb-4">
                                {lados.map((lado) => (
                                    lado.moviles?.length > 0 ? (
                                        lado.moviles.map((opcion) => (
                                            <button
                                                key={`${opcion.papel}-${opcion.numero}`}
                                                onClick={() => onElegirOpcion(opcion)}
                                                className="w-full px-4 py-3 text-left text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20 transition-all"
                                            >
                                                {/* El papel va delante del número a propósito: nadie reconoce
                                                    un teléfono de memoria, pero sí sabe si se lo quiere mandar
                                                    a quien recibe o a quien lo mandó. */}
                                                <span className="block text-[10px] font-bold uppercase tracking-wider text-white/70">
                                                    {opcion.papel}{etiquetaImportes(opcion.paga)}
                                                </span>
                                                {opcion.nombre && (
                                                    <span className="block text-sm font-semibold truncate">{opcion.nombre}</span>
                                                )}
                                                <span className="block font-bold text-lg tracking-wide">{opcion.numero}</span>
                                            </button>
                                        ))
                                    ) : (
                                        <button
                                            key={`${lado.papel}-sin-movil`}
                                            onClick={irAlTeclado}
                                            className="w-full px-4 py-3 text-left bg-white border-2 border-dashed border-slate-300 hover:border-emerald-400 hover:bg-emerald-50 rounded-xl transition-all"
                                        >
                                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                {lado.papel}{etiquetaImportes(lado.paga)}
                                            </span>
                                            {lado.nombre && (
                                                <span className="block text-sm font-semibold text-slate-700 truncate">{lado.nombre}</span>
                                            )}
                                            <span className="flex items-center gap-1.5 text-sm font-bold text-amber-600 mt-0.5">
                                                <PhoneCall size={15} />
                                                {lado.tieneFijo ? `Sin móvil (${lado.fijo} es un fijo)` : 'Sin móvil'} · Añadir teléfono
                                            </span>
                                        </button>
                                    )
                                ))}
                            </div>

                            <button
                                onClick={irAlTeclado}
                                className="w-full py-3 text-sm font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors"
                            >
                                Enviar a otro número
                            </button>
                            <button
                                onClick={() => { setError(null); onChange(null); }}
                                className="w-full py-3 mt-2 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm text-slate-500 mb-4">Escribe el número de WhatsApp:</p>

                            <input
                                type="tel"
                                autoFocus
                                value={prompt.phone}
                                onChange={(e) => { setError(null); onChange(prev => ({ ...prev, phone: e.target.value })); }}
                                placeholder="Ej: 600123456"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-bold text-lg text-slate-700 mb-4"
                                onKeyDown={(e) => { if (e.key === 'Enter') enviarTecleado(); }}
                            />

                            <p className="text-sm font-semibold text-slate-700 mb-2">¿De quién es este número?</p>
                            <div className="space-y-2 mb-4" role="radiogroup" aria-label="De quién es este número">
                                {lados.map((lado) => {
                                    const marcado = prompt.deQuien === lado.papel;
                                    return (
                                        <button
                                            key={lado.papel}
                                            type="button"
                                            role="radio"
                                            aria-checked={marcado}
                                            onClick={() => elegirDeQuien(lado.papel)}
                                            className={`w-full px-4 py-2.5 text-left rounded-xl border-2 transition-all ${marcado
                                                ? 'border-emerald-600 bg-emerald-50'
                                                : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                                        >
                                            <span className={`block text-[10px] font-bold uppercase tracking-wider ${marcado ? 'text-emerald-700' : 'text-slate-400'}`}>
                                                {lado.papel}{etiquetaImportes(lado.paga)}
                                            </span>
                                            {lado.nombre && (
                                                <span className="block text-sm font-semibold text-slate-700 truncate">{lado.nombre}</span>
                                            )}
                                            <span className={`block text-xs ${lado.destino === 'sustituye' ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
                                                {textoDelDestino(lado)}
                                            </span>
                                        </button>
                                    );
                                })}
                                <button
                                    type="button"
                                    role="radio"
                                    aria-checked={prompt.deQuien === PUNTUAL}
                                    onClick={() => elegirDeQuien(PUNTUAL)}
                                    className={`w-full px-4 py-2.5 text-left rounded-xl border-2 transition-all ${prompt.deQuien === PUNTUAL
                                        ? 'border-emerald-600 bg-emerald-50'
                                        : 'border-slate-200 bg-white hover:border-emerald-300'}`}
                                >
                                    <span className={`block text-[10px] font-bold uppercase tracking-wider ${prompt.deQuien === PUNTUAL ? 'text-emerald-700' : 'text-slate-400'}`}>
                                        Sólo este envío
                                    </span>
                                    <span className="block text-xs text-slate-500">Un vecino, el encargado de turno. No se guarda en ninguna ficha.</span>
                                </button>
                            </div>

                            {error && (
                                <p className="text-sm font-semibold text-red-600 mb-3" role="alert">{error}</p>
                            )}

                            <div className="flex gap-3">
                                <button
                                    onClick={() => {
                                        setError(null);
                                        onChange(prev => (hayMoviles ? { ...prev, editando: false, deQuien: null } : null));
                                    }}
                                    disabled={prompt.saving}
                                    className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-40"
                                >
                                    {hayMoviles ? 'Volver' : 'Cancelar'}
                                </button>
                                <button
                                    onClick={enviarTecleado}
                                    disabled={prompt.saving}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {/* El botón se queda un instante en "Guardando..." a propósito: es el
                                        tiempo que tarda el número en llegar a la ficha del cliente (sólo el
                                        repartidor), y si abriéramos WhatsApp antes la página se descarga y
                                        el dato se pierde. */}
                                    {prompt.saving ? 'Guardando...' : (esPunta(prompt.deQuien) ? 'Guardar y abrir WhatsApp' : 'Abrir WhatsApp')}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
