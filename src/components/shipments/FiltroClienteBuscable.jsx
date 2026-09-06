import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { normalizarTexto } from '../../utils/busqueda';
import { SIN_FILTRO } from '../../utils/filtrosEnvios';

/**
 * Filtro de cliente en el que se escribe para buscar.
 *
 * El desplegable nativo obligaba a bajar por cientos de nombres con la rueda.
 * Aquí se teclea un trozo ("lekue") y la lista se va quedando con los que lo
 * contienen; con las flechas y Enter se elige, con Escape se cierra y la X
 * vuelve a "Todos los Clientes". El valor elegido es siempre un nombre entero
 * de la lista (o SIN_FILTRO): el filtrado exacto lo sigue haciendo el listado.
 */
export default function FiltroClienteBuscable({ value, onChange, opciones = [], textoTodo = 'Todos los Clientes', title }) {
    const activo = value && value !== SIN_FILTRO;
    const [abierto, setAbierto] = useState(false);
    const [texto, setTexto] = useState('');
    const [resaltado, setResaltado] = useState(0);
    const contenedor = useRef(null);
    const input = useRef(null);
    const lista = useRef(null);

    const visibles = useMemo(() => {
        const buscado = normalizarTexto(texto);
        const coinciden = buscado
            ? opciones.filter((o) => normalizarTexto(o).includes(buscado))
            : opciones;
        return [SIN_FILTRO].concat(coinciden.slice(0, 300));
    }, [opciones, texto]);

    useEffect(() => { setResaltado(0); }, [texto, abierto]);

    // Mantener a la vista la opción resaltada al moverse con las flechas.
    useEffect(() => {
        if (!abierto || !lista.current) return;
        const fila = lista.current.children[resaltado];
        if (fila && fila.scrollIntoView) fila.scrollIntoView({ block: 'nearest' });
    }, [resaltado, abierto]);

    useEffect(() => {
        if (!abierto) return undefined;
        const fuera = (e) => {
            if (contenedor.current && !contenedor.current.contains(e.target)) cerrar();
        };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('touchstart', fuera);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('touchstart', fuera);
        };
    });

    const abrir = () => { setTexto(''); setAbierto(true); };
    const cerrar = () => { setAbierto(false); setTexto(''); };
    const elegir = (opcion) => {
        onChange(opcion);
        cerrar();
        if (input.current) input.current.blur();
    };
    const limpiar = (e) => {
        e.stopPropagation();
        onChange(SIN_FILTRO);
        cerrar();
    };

    const teclas = (e) => {
        if (!abierto && (e.key === 'ArrowDown' || e.key === 'Enter')) { abrir(); e.preventDefault(); return; }
        if (!abierto) return;
        if (e.key === 'ArrowDown') { setResaltado((i) => Math.min(i + 1, visibles.length - 1)); e.preventDefault(); }
        else if (e.key === 'ArrowUp') { setResaltado((i) => Math.max(i - 1, 0)); e.preventDefault(); }
        else if (e.key === 'Enter') { if (visibles[resaltado] !== undefined) elegir(visibles[resaltado]); e.preventDefault(); }
        else if (e.key === 'Escape') { cerrar(); e.preventDefault(); }
    };

    const etiqueta = (opcion) => (opcion === SIN_FILTRO ? textoTodo : opcion);

    return (
        <div ref={contenedor} className="relative" title={title}>
            <input
                ref={input}
                type="text"
                autoComplete="off"
                spellCheck={false}
                className={`w-full pl-4 pr-9 py-2.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm transition-all ${
                    activo ? 'border-blue-400 text-blue-700 bg-blue-50 placeholder-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 placeholder-slate-600'
                }`}
                placeholder={activo ? value : textoTodo}
                value={abierto ? texto : (activo ? value : '')}
                onChange={(e) => { setTexto(e.target.value); if (!abierto) setAbierto(true); }}
                onFocus={abrir}
                onClick={() => { if (!abierto) abrir(); }}
                onKeyDown={teclas}
            />
            {activo ? (
                <button
                    type="button"
                    onMouseDown={limpiar}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-blue-600 hover:bg-blue-100"
                    title="Quitar el filtro de cliente"
                >
                    <X size={14} />
                </button>
            ) : (
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            )}
            {abierto && (
                <div
                    ref={lista}
                    className="absolute left-0 right-0 mt-1 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg z-50"
                    style={{ minWidth: '100%', width: 'max-content', maxWidth: '32rem' }}
                >
                    {visibles.map((opcion, idx) => (
                        <div
                            key={opcion}
                            onMouseDown={(e) => { e.preventDefault(); elegir(opcion); }}
                            onMouseEnter={() => setResaltado(idx)}
                            className={`px-3 py-2 text-sm cursor-pointer whitespace-nowrap ${
                                idx === resaltado ? 'bg-blue-600 text-white' : opcion === value ? 'bg-blue-50 text-blue-700' : 'text-slate-700'
                            } ${opcion === SIN_FILTRO ? 'font-semibold border-b border-slate-100' : ''}`}
                        >
                            {etiqueta(opcion)}
                        </div>
                    ))}
                    {visibles.length === 1 && (
                        <div className="px-3 py-2 text-sm text-slate-400 italic">Ningún cliente contiene "{texto}"</div>
                    )}
                </div>
            )}
        </div>
    );
}
