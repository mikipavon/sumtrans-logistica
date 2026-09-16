import React, { useMemo, useRef, useState } from 'react';
import { X, Wallet, Camera, Image as ImageIcon, Trash2, Package, Plus } from 'lucide-react';
import { articulosParaCliente, lineaDeArticulo, repreciarLineas, totalDeArticulos } from '../../utils/articulosDeDeuda';
import FiltroClienteBuscable from './FiltroClienteBuscable';
import CameraCaptureModal from '../CameraCaptureModal';
import { SIN_FILTRO } from '../../utils/filtrosEnvios';
import { construirRecibo, fotosDeRecibo, hoyParaElCampo as hoy, MAX_FOTOS_DE_DEUDA, BUCKET_FOTOS_DE_DEUDA } from '../../utils/reciboDeDeuda';
import { uploadProof } from '../../utils/storage';
import { compressImage, esImagenComprimible } from '../../utils/imageCompression';

// ── Apuntar a mano una deuda a un cliente ───────────────────────────────────
// Lo que se guarda y por qué tiene la forma que tiene está en
// utils/reciboDeDeuda.js. Aquí sólo está la ventana: cliente, importe,
// concepto, fecha, quién la cobra y la foto del papel firmado.
//
// La foto se puede hacer con la cámara de dentro de la app o elegir un fichero.
// El <input type="file"> va sin `capture`: con él, en el móvil se cede el turno a
// la app de cámara y Android puede matar la nuestra a medias. Y el fichero va
// DIRECTO al compresor, sin descomprimir la foto entera antes.
//
// Subir y encoger llegan por props (con estos valores por defecto) para que el
// test pueda sustituirlos: los tests comparten entorno sin aislar (ver
// vitest.config.js) y un vi.mock de estos módulos no se aplica si otro fichero
// ya los había cargado de verdad antes.
const subirFotoPorDefecto = (id, dataUrl) => uploadProof(id, dataUrl, BUCKET_FOTOS_DE_DEUDA);
const comprimirFotoPorDefecto = (file) => compressImage(file, 1200, 1200, 0.8);

export default function NuevaDeudaModal({
    isOpen, onClose, clients, drivers, articles = [], onCreateShipment, getDriverDisplayName,
    subirFoto = subirFotoPorDefecto, comprimirFoto = comprimirFotoPorDefecto
}) {
    const [clienteNombre, setClienteNombre] = useState(SIN_FILTRO);
    const [importe, setImporte] = useState('');
    // Desglose en artículos (opcional). Al cambiar, el importe se rellena con su
    // total; luego se puede corregir a mano. El precio es el del alta: tarifa
    // del cliente, B2 si la deuda es de pueblos de Baremo 2, o el precio base.
    const [lineas, setLineas] = useState([]);
    const [baremo, setBaremo] = useState(1);
    const [articuloElegido, setArticuloElegido] = useState('');
    const [cantidad, setCantidad] = useState(1);
    const [concepto, setConcepto] = useState('');
    const [fecha, setFecha] = useState(hoy);
    const [driverId, setDriverId] = useState('');
    // Fotos del papel firmado, ya encogidas, en base64. Se suben al guardar.
    const [fotos, setFotos] = useState([]);
    const [camaraAbierta, setCamaraAbierta] = useState(false);
    const [guardando, setGuardando] = useState(false);
    const [aviso, setAviso] = useState('');
    const inputFoto = useRef(null);

    const nombres = useMemo(
        () => (Array.isArray(clients) ? clients : [])
            .map(c => c.name)
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b, 'es')),
        [clients]
    );
    // La ficha del cliente elegido o, si el nombre se escribió a mano y no tiene
    // ficha, un cliente de paso con sólo el nombre: la deuda se guarda igual.
    const fichaDe = (nombre) => {
        if (!nombre || nombre === SIN_FILTRO) return null;
        return (clients || []).find(c => c.name === nombre) || { id: null, name: nombre, sinFicha: true };
    };
    const cliente = fichaDe(clienteNombre);
    const nombreDe = (d) => (getDriverDisplayName ? getDriverDisplayName(d) : d.name);
    const cabenMasFotos = fotos.length < MAX_FOTOS_DE_DEUDA;
    const catalogo = useMemo(() => articulosParaCliente(articles, cliente), [articles, cliente]);

    if (!isOpen) return null;

    // Cambiar las líneas y arrastrar el importe con ellas.
    const ponerLineas = (nuevas) => {
        setLineas(nuevas);
        if (nuevas.length > 0) setImporte(totalDeArticulos(nuevas).toFixed(2));
    };
    // Otro cliente u otro baremo: las líneas ya puestas cambian de precio.
    const elegirCliente = (nombre) => {
        setClienteNombre(nombre);
        if (lineas.length > 0) ponerLineas(repreciarLineas(lineas, { cliente: fichaDe(nombre), baremo }));
    };
    const elegirBaremo = (b) => {
        setBaremo(Number(b));
        if (lineas.length > 0) ponerLineas(repreciarLineas(lineas, { cliente, baremo: Number(b) }));
    };
    // Con botón, no en el onChange del desplegable: con las flechas del teclado un
    // select nativo dispara change en cada opción y metía el mismo artículo varias veces.
    const anadirArticulo = () => {
        const articulo = catalogo.find(a => String(a.id) === String(articuloElegido));
        const linea = lineaDeArticulo(articulo, cantidad, { cliente, baremo });
        if (!linea) return;
        ponerLineas([...lineas, linea]);
        setArticuloElegido('');
        setCantidad(1);
    };
    const quitarArticulo = (uniqueId) => ponerLineas(lineas.filter(l => l.uniqueId !== uniqueId));

    const limpiar = () => {
        setClienteNombre(SIN_FILTRO);
        setLineas([]);
        setBaremo(1);
        setArticuloElegido('');
        setCantidad(1);
        setImporte('');
        setConcepto('');
        setFecha(hoy());
        setDriverId('');
        setFotos([]);
        setAviso('');
    };

    const cerrar = () => {
        if (guardando) return;
        limpiar();
        onClose();
    };

    const anadirFoto = (dataUrl) => {
        if (!dataUrl) return;
        setFotos(prev => (prev.length < MAX_FOTOS_DE_DEUDA ? [...prev, dataUrl] : prev));
    };

    const elegirFichero = async (e) => {
        const file = e.target.files && e.target.files[0];
        e.target.value = ''; // Permite repetir la misma foto y suelta el fichero
        if (!file) return;
        if (!esImagenComprimible(file)) { setAviso('Sólo se admiten imágenes (JPG, PNG…).'); return; }
        if (file.size > 20 * 1024 * 1024) { setAviso('La imagen es demasiado grande. Máximo 20MB.'); return; }
        try {
            anadirFoto(await comprimirFoto(file));
            setAviso('');
        } catch (err) {
            console.error('[NuevaDeuda] No se pudo procesar la foto:', err);
            setAviso('No se ha podido procesar la foto. Vuelve a intentarlo.');
        }
    };

    const quitarFoto = (idx) => setFotos(prev => prev.filter((_, i) => i !== idx));

    const guardar = async (e) => {
        e.preventDefault();
        if (!cliente) { setAviso('Elige el cliente al que se le apunta la deuda, o escribe su nombre.'); return; }
        const total = Number(String(importe).replace(',', '.'));
        if (!Number.isFinite(total) || total <= 0) { setAviso('El importe tiene que ser mayor que cero.'); return; }
        if (!concepto.trim()) { setAviso('Escribe el concepto: qué se debe (por ejemplo, "Albaranes de agosto").'); return; }
        setAviso('');
        setGuardando(true);
        try {
            const recibo = construirRecibo({ cliente, importe: total, concepto: concepto.trim(), fecha, driverId, articulos: lineas });

            // Las fotos se suben ANTES de dar de alta el recibo, para que nazca ya
            // con sus URL: así vale también si el alta se queda en la cola sin
            // cobertura. Si una foto no sube, no se crea nada y se avisa.
            const urls = [];
            for (const foto of fotos) {
                try {
                    urls.push(await subirFoto(recibo.id, foto));
                } catch (err) {
                    console.error('[NuevaDeuda] No se pudo subir la foto:', err);
                    setAviso('No se ha podido subir la foto del papel firmado (' + (err?.message || 'error de red') + '). La deuda no se ha guardado.');
                    return;
                }
            }

            // El mismo recibo (mismo número) con el que se nombraron las fotos.
            const creado = await onCreateShipment({ ...recibo, ...fotosDeRecibo(urls) });
            if (!creado) {
                setAviso('No se ha podido guardar la deuda. Inténtalo otra vez.');
                return;
            }
            limpiar();
            onClose();
        } finally {
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/70 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
            <CameraCaptureModal
                isOpen={camaraAbierta}
                onClose={() => setCamaraAbierta(false)}
                onCapture={(foto) => { anadirFoto(foto); setCamaraAbierta(false); }}
                onFallback={() => inputFoto.current?.click()}
                titulo="Foto del papel firmado"
                maxLado={1200}
                calidad={0.8}
            />
            <form onSubmit={guardar} className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 max-h-[95vh] overflow-y-auto">
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Wallet size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-bold text-slate-800 leading-tight">Añadir deuda a un cliente</h3>
                            <p className="text-sm text-slate-500 mt-1">
                                Para dinero que no viene de ningún albarán de la app: albaranes en papel, portes sin grabar.
                                Le saldrá al repartidor en su pestaña Cobros y aquí, en Cobros Pendientes.
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={cerrar} className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600" title="Cerrar">
                        <X size={18} />
                    </button>
                </div>

                <div>
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Cliente</label>
                    <FiltroClienteBuscable
                        value={clienteNombre}
                        onChange={elegirCliente}
                        opciones={nombres}
                        textoTodo="Escribe para buscar el cliente…"
                        permitirLibre
                    />
                    {cliente?.sinFicha && (
                        <p className="text-[11px] text-amber-700 mt-1">
                            Cliente sin ficha: la deuda se guarda con este nombre, sin tarifa especial.
                        </p>
                    )}
                </div>

                {/* Desglose en artículos (opcional) */}
                {catalogo.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                <Package size={12} /> Artículos <span className="font-normal normal-case text-slate-400">(opcional)</span>
                            </span>
                            <select
                                aria-label="Baremo de los artículos"
                                className="bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={baremo}
                                onChange={(e) => elegirBaremo(e.target.value)}
                                title="Los pueblos de Baremo 2 tienen precio B2"
                            >
                                <option value={1}>Baremo 1</option>
                                <option value={2}>Baremo 2</option>
                            </select>
                        </div>
                        <div className="flex gap-2 items-end">
                            <div className="flex-1">
                                <label htmlFor="nueva-deuda-articulo" className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Artículo</label>
                                <select
                                    id="nueva-deuda-articulo"
                                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={articuloElegido}
                                    onChange={(e) => setArticuloElegido(e.target.value)}
                                >
                                    <option value="">Elige artículo…</option>
                                    {catalogo.map(a => (
                                        <option key={a.id} value={a.id}>{a.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="w-16">
                                <label htmlFor="nueva-deuda-cantidad" className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Cant.</label>
                                <input
                                    id="nueva-deuda-cantidad"
                                    type="number"
                                    min="1"
                                    className="w-full bg-white border border-slate-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    value={cantidad}
                                    onChange={(e) => setCantidad(e.target.value)}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={anadirArticulo}
                                disabled={!articuloElegido}
                                className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                title="Añadir este artículo al desglose"
                            >
                                <Plus size={14} /> Añadir
                            </button>
                        </div>
                        {lineas.length > 0 && (
                            <div className="bg-white rounded-lg border border-slate-200 p-2 space-y-1">
                                {lineas.map(l => (
                                    <div key={l.uniqueId} className="flex justify-between items-center text-sm px-1">
                                        <div className="flex gap-2 items-center min-w-0">
                                            <span className="font-bold text-slate-700 shrink-0">{l.quantity}x</span>
                                            <span className="text-slate-600 truncate">{l.name}</span>
                                        </div>
                                        <div className="flex gap-3 items-center shrink-0">
                                            <span className="font-bold text-slate-700 font-mono">{Number(l.totalPrice).toFixed(2)}€</span>
                                            <button type="button" onClick={() => quitarArticulo(l.uniqueId)} className="text-red-400 hover:text-red-600" title="Quitar" aria-label={'Quitar ' + l.name}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                <div className="border-t border-slate-200 mt-1 pt-1 flex justify-between items-center px-1">
                                    <span className="font-bold text-slate-500 text-[10px] uppercase">Total artículos</span>
                                    <span className="font-bold text-indigo-600 font-mono">{totalDeArticulos(lineas).toFixed(2)}€</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label htmlFor="nueva-deuda-importe" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Importe (€)</label>
                        <input
                            id="nueva-deuda-importe"
                            type="number"
                            step="0.01"
                            min="0.01"
                            inputMode="decimal"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={importe}
                            onChange={(e) => setImporte(e.target.value)}
                            placeholder="0.00"
                        />
                    </div>
                    <div>
                        <label htmlFor="nueva-deuda-fecha" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Fecha</label>
                        <input
                            id="nueva-deuda-fecha"
                            type="date"
                            className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            value={fecha}
                            onChange={(e) => setFecha(e.target.value)}
                        />
                    </div>
                </div>

                <div>
                    <label htmlFor="nueva-deuda-concepto" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Concepto</label>
                    <input
                        id="nueva-deuda-concepto"
                        type="text"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={concepto}
                        onChange={(e) => setConcepto(e.target.value)}
                        placeholder="Albaranes de agosto (SUM-401, SUM-410)"
                        maxLength={200}
                    />
                </div>

                <div>
                    <label htmlFor="nueva-deuda-repartidor" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Quién la cobra</label>
                    <select
                        id="nueva-deuda-repartidor"
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={driverId}
                        onChange={(e) => setDriverId(e.target.value)}
                    >
                        <option value="">Sin asignar (se le pasa luego con «Pasar cobro»)</option>
                        {(Array.isArray(drivers) ? drivers : []).filter(d => d.isActive !== false).map(d => (
                            <option key={d.id} value={d.id}>{nombreDe(d)}</option>
                        ))}
                    </select>
                </div>

                {/* Foto del papel firmado */}
                <div>
                    <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Foto del papel firmado <span className="font-normal normal-case text-slate-400">(opcional, hasta {MAX_FOTOS_DE_DEUDA})</span>
                        </span>
                        {cabenMasFotos && (
                            <div className="flex gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setCamaraAbierta(true)}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 transition-colors"
                                    title="Hacer la foto con la cámara, sin salir de la app"
                                >
                                    <Camera size={12} /> Hacer foto
                                </button>
                                <button
                                    type="button"
                                    onClick={() => inputFoto.current?.click()}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 transition-colors"
                                    title="Elegir una imagen ya hecha"
                                >
                                    <ImageIcon size={12} /> Elegir imagen
                                </button>
                            </div>
                        )}
                    </div>
                    <input
                        ref={inputFoto}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        aria-label="Elegir imagen del papel firmado"
                        onChange={elegirFichero}
                    />
                    {fotos.length === 0 ? (
                        <p className="text-xs text-slate-400 italic bg-slate-50 border border-dashed border-slate-200 rounded-lg px-3 py-2">
                            Sin foto. Se verá en la ficha del recibo como justificante de entrega.
                        </p>
                    ) : (
                        <div className="flex gap-3">
                            {fotos.map((foto, idx) => (
                                <div key={idx} className="relative w-24 h-24 rounded-lg overflow-hidden border border-slate-200 bg-slate-50 shrink-0">
                                    <img src={foto} alt={'Papel firmado ' + (idx + 1)} className="w-full h-full object-cover" />
                                    <button
                                        type="button"
                                        onClick={() => quitarFoto(idx)}
                                        className="absolute top-1 right-1 p-1 rounded-md bg-white/90 text-red-600 hover:bg-red-50 shadow"
                                        title="Quitar esta foto"
                                        aria-label={'Quitar la foto ' + (idx + 1)}
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {aviso && (
                    <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{aviso}</p>
                )}

                <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                    <button
                        type="button"
                        onClick={cerrar}
                        disabled={guardando}
                        className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={guardando}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        {guardando ? (fotos.length ? 'Subiendo foto…' : 'Guardando…') : 'Apuntar deuda'}
                    </button>
                </div>
            </form>
        </div>
    );
}
