import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Camera, CheckCircle, ArrowRight, ArrowLeft, Trash2, AlertTriangle, Eye, EyeOff, FileText } from 'lucide-react';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { calcularComisionReembolso } from '../../utils/comisionReembolso';
import { buscarArticuloBadi, baremoDelPunto, precioUnitarioParaCliente, prefijoSerieDelCliente, esPoblacionConocida } from '../../utils/importacionEnvios';
import { hojasDeFichero, leerHoja, miniaturaDeLienzo, cerrarLector } from '../../utils/ocrAlbaran';

// Importa albaranes de agencia (TXT, etc.) a partir de fotos o PDF. La lectura
// se hace en el propio navegador con Tesseract (ver ocrAlbaran.js): no cuesta
// nada y no sale ningún dato de la oficina, a cambio la lectura no es perfecta.
// Por eso nada se guarda sin pasar por la revisión: cada hoja se enseña junto a
// lo que se ha leído y la oficina corrige lo que haga falta antes de crear.
//
// El cliente que se recibe es la AGENCIA, que es quien paga el porte. El
// remitente leído del papel va a originName (quien entrega la mercancía).

let contadorHojas = 0;

const inputCls = 'w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white';

function camposVacios() {
    return { expedicion: '', remitente: '', destinatario: '', direccion: '', poblacion: '', cp: '', telefono: '', bultos: null, kilos: null, porte: '', reembolso: 0 };
}

export default function ImportarAlbaranesAgencia({ client, onCreateShipment, allShipments, articles, tariffs, coverageZones, onClose, isAdmin }) {
    const [step, setStep] = useState(1); // 1=subir y leer, 2=revisar, 3=hecho
    const [hojas, setHojas] = useState([]);
    const [leyendo, setLeyendo] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [importando, setImportando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [hojaAmpliada, setHojaAmpliada] = useState(null);
    const [textoVisible, setTextoVisible] = useState(null);
    const colaRef = useRef(Promise.resolve());

    useEffect(() => () => { cerrarLector(); }, []);

    const actualizarHoja = useCallback((id, cambios) => {
        setHojas(prev => prev.map(h => (h.id === id ? { ...h, ...(typeof cambios === 'function' ? cambios(h) : cambios) } : h)));
    }, []);

    const leerFicheros = useCallback((ficheros) => {
        const lista = Array.from(ficheros || []).filter(f => /^image\//.test(f.type) || f.type === 'application/pdf' || /\.(pdf|jpe?g|png|webp|bmp|gif)$/i.test(f.name));
        if (lista.length === 0) return;
        setLeyendo(true);
        // Una cola: el motor sólo lee una hoja a la vez y así el progreso se entiende.
        colaRef.current = colaRef.current.then(async () => {
            for (const fichero of lista) {
                let lienzos = [];
                try {
                    lienzos = await hojasDeFichero(fichero);
                } catch (err) {
                    console.error('No se pudo abrir el fichero', fichero.name, err);
                    const id = `h${++contadorHojas}`;
                    setHojas(prev => [...prev, { id, fichero: fichero.name, pagina: 1, miniatura: null, campos: camposVacios(), texto: '', estado: 'error', progreso: 0, error: 'No se pudo abrir el fichero' }]);
                    continue;
                }
                for (let i = 0; i < lienzos.length; i++) {
                    const lienzo = lienzos[i];
                    const id = `h${++contadorHojas}`;
                    setHojas(prev => [...prev, { id, fichero: fichero.name, pagina: i + 1, miniatura: miniaturaDeLienzo(lienzo), grande: null, campos: camposVacios(), texto: '', estado: 'leyendo', progreso: 0 }]);
                    try {
                        const { campos, texto, lienzo: leido } = await leerHoja(lienzo, (p) => actualizarHoja(id, { progreso: p }));
                        // Si hubo que girar la foto, la miniatura enseña la hoja tal y como se ha leído.
                        actualizarHoja(id, { campos, texto, estado: 'leida', progreso: 1, miniatura: miniaturaDeLienzo(leido), grande: miniaturaDeLienzo(leido, 1400) });
                    } catch (err) {
                        console.error('Error leyendo la hoja', fichero.name, err);
                        actualizarHoja(id, { estado: 'error', error: 'No se pudo leer la hoja', grande: miniaturaDeLienzo(lienzo, 1400) });
                    }
                }
            }
        }).finally(() => setLeyendo(false));
    }, [actualizarHoja]);

    const handleDrop = (e) => { e.preventDefault(); setDragOver(false); leerFicheros(e.dataTransfer.files); };

    const editarCampo = (id, campo, valor) => actualizarHoja(id, h => ({ campos: { ...h.campos, [campo]: valor } }));
    const quitarHoja = (id) => setHojas(prev => prev.filter(h => h.id !== id));

    const hojasRevisadas = useMemo(() => hojas.map(h => {
        const c = h.campos;
        const errores = [];
        const avisos = [];
        if (h.estado === 'error') errores.push(h.error || 'No se pudo leer');
        if (!c.destinatario) errores.push('Falta el destinatario');
        if (!c.poblacion && !c.cp) errores.push('Falta la población o el CP');
        const bultos = parseInt(c.bultos) || 0;
        if (bultos < 1) errores.push('Faltan los bultos');
        if (c.porte !== 'Pagado' && c.porte !== 'Debido') errores.push('Elige si el porte es pagado o debido');
        if ((c.poblacion || c.cp) && !esPoblacionConocida(c.poblacion, c.cp, { tariffs, coverageZones })) avisos.push('Población fuera del baremo: revisa el nombre');
        const articulo = bultos > 0 ? buscarArticuloBadi(articles, bultos) : null;
        return { ...h, errores, avisos, articulo };
    }), [hojas, articles, tariffs, coverageZones]);

    const validas = hojasRevisadas.filter(h => h.errores.length === 0);
    const conErrores = hojasRevisadas.filter(h => h.errores.length > 0);
    const todasLeidas = hojas.length > 0 && !leyendo && hojas.every(h => h.estado !== 'leyendo');

    const crearEnvios = async () => {
        if (validas.length === 0 || !client) return;
        setImportando(true);
        const prefix = prefijoSerieDelCliente(client);
        let creados = 0, fallidos = 0;
        try {
            const { primero } = await reservarNumerosAlbaran(prefix, validas.length, { enviosLocales: allShipments });
            let numero = primero - 1;
            for (const hoja of validas) {
                const c = hoja.campos;
                try {
                    numero++;
                    const bultos = parseInt(c.bultos) || 1;
                    const article = buscarArticuloBadi(articles, bultos);
                    const originBaremo = baremoDelPunto(client.city, client.zip, { tariffs, coverageZones });
                    const destBaremo = baremoDelPunto(c.poblacion, c.cp, { tariffs, coverageZones });
                    const baremo = (originBaremo === 2 || destBaremo === 2) ? 2 : 1;
                    const unitPrice = precioUnitarioParaCliente(article, client, baremo);
                    const codAmt = parseFloat(String(c.reembolso || 0).replace(',', '.')) || 0;
                    const codFee = calcularComisionReembolso(client, codAmt);
                    const notas = [
                        `Albarán agencia ${client.name}`,
                        c.expedicion ? `Exp. ${c.expedicion}` : '',
                        c.kilos ? `${c.kilos} kg` : '',
                    ].filter(Boolean).join(' · ');

                    const shipmentData = {
                        id: `${prefix}-${numero}`,
                        type: 'Entrega',
                        client: client.name,
                        clientId: client.id,
                        originName: (c.remitente || '').trim() || client.name,
                        originAddress: client.address || client.opAddress || '',
                        originZip: client.zip || client.opZip || '',
                        originCity: client.city || client.opCity || '',
                        destinationName: (c.destinatario || '').trim(),
                        destinationAddress: (c.direccion || '').trim(),
                        destinationZip: (c.cp || '').trim(),
                        destinationCity: (c.poblacion || '').trim(),
                        destinationPhone: (c.telefono || '').trim(),
                        origin: `${client.zip || ''} ${client.city || ''}, ES`.trim(),
                        destination: `${c.cp || ''} ${c.poblacion || ''}, ES`.trim(),
                        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                        createdAt: new Date().toISOString(),
                        status: 'Pendiente de asignar',
                        packages: bultos,
                        observations: notas,
                        articles: article ? [{ ...article, uniqueId: Date.now() + numero, quantity: 1, unitPrice, totalPrice: unitPrice }] : [],
                        amount: unitPrice > 0 ? unitPrice.toFixed(2) : 'Pendiente',
                        customAmount: unitPrice > 0 ? unitPrice : null,
                        billingType: client.billingType || 'Clientes Habituales',
                        paymentStatus: 'Pending',
                        porteType: c.porte,
                        hasCod: codAmt > 0,
                        codAmount: codAmt,
                        codCommission: codFee,
                        createdBy: isAdmin ? `Admin (Import Fotos: ${client.name})` : `ClienteWeb: ${client.name}`,
                        importedFromExcel: true,
                        excelFileName: hoja.fichero,
                        clientReference: (c.expedicion || '').trim() || null,
                    };
                    await onCreateShipment(shipmentData);
                    creados++;
                } catch (err) {
                    console.error('Error creando el envío desde la hoja', hoja.fichero, err);
                    fallidos++;
                }
            }
        } catch (err) {
            console.error('No se pudieron reservar los números de albarán', err);
            alert('No se pudo reservar la numeración. No se ha creado ningún envío.');
            setImportando(false);
            return;
        }
        setResultado({ creados, fallidos, total: validas.length });
        setStep(3);
        setImportando(false);
    };

    const reiniciar = () => { setHojas([]); setResultado(null); setStep(1); };

    // Función de pintado, no componente: si fuera un componente definido aquí
    // dentro, React lo daría por nuevo en cada render y el input perdería el
    // foco a cada tecla.
    const campo = (hoja, nombre, etiqueta, { ancho = '', tipo = 'text', placeholder = '' } = {}) => (
        <label key={nombre} className={`flex flex-col gap-0.5 ${ancho}`}>
            <span className="text-[10px] font-bold uppercase text-slate-500">{etiqueta}</span>
            <input type={tipo} className={inputCls} placeholder={placeholder}
                value={hoja.campos[nombre] ?? ''}
                onChange={(e) => editarCampo(hoja.id, nombre, e.target.value)} />
        </label>
    );

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-xl"><Camera size={20} className="text-emerald-600" /></div>
                    <div>
                        <h2 className="font-bold text-slate-800">Importar albaranes de agencia</h2>
                        <p className="text-xs text-slate-500">Fotos o PDF de los albaranes. La app los lee aquí mismo y tú revisas antes de crear.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {[1, 2, 3].map(s => <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all ${step >= s ? 'bg-emerald-600 scale-110' : 'bg-slate-200'}`} />)}
                </div>
            </div>

            <div className="p-6">
                {step === 1 && (
                    <div className="space-y-4">
                        <div
                            onDrop={handleDrop}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onClick={() => document.getElementById('agencia-file-input')?.click()}
                            className={`border-2 border-dashed rounded-2xl p-10 text-center transition-all cursor-pointer ${dragOver ? 'border-emerald-500 bg-emerald-50' : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50'}`}
                        >
                            <input id="agencia-file-input" type="file" multiple accept="image/*,.pdf" className="hidden"
                                onChange={(e) => { leerFicheros(e.target.files); e.target.value = ''; }} />
                            <Camera size={44} className="mx-auto text-slate-300 mb-3" />
                            <p className="text-lg font-bold text-slate-700 mb-1">Arrastra aquí las fotos o PDF de los albaranes</p>
                            <p className="text-sm text-slate-500">Puedes soltar muchos a la vez. Cada hoja será un albarán.</p>
                            <p className="text-xs text-slate-400 mt-2">La primera vez tarda unos segundos en descargar el lector.</p>
                        </div>

                        {hojas.length > 0 && (
                            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                                {hojas.map(h => (
                                    <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                        {h.miniatura ? <img src={h.miniatura} alt="" className="w-10 h-14 object-cover rounded border border-slate-200" /> : <FileText size={20} className="text-slate-300" />}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-700 truncate">{h.fichero}{h.pagina > 1 ? ` · pág. ${h.pagina}` : ''}</p>
                                            {h.estado === 'leyendo' && (
                                                <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((h.progreso || 0) * 100)}%` }} />
                                                </div>
                                            )}
                                            {h.estado === 'leida' && <p className="text-emerald-600">Leída: {h.campos.destinatario || 'sin destinatario'}{h.campos.poblacion ? ` · ${h.campos.poblacion}` : ''}</p>}
                                            {h.estado === 'error' && <p className="text-red-600">{h.error}</p>}
                                        </div>
                                        <button onClick={() => quitarHoja(h.id)} className="text-slate-300 hover:text-red-500" title="Quitar"><Trash2 size={14} /></button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end pt-2">
                            <button onClick={() => setStep(2)} disabled={!todasLeidas}
                                className="px-6 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center gap-2">
                                {leyendo ? 'Leyendo…' : `Revisar ${hojas.length} albar${hojas.length === 1 ? 'án' : 'anes'}`} <ArrowRight size={16} />
                            </button>
                        </div>
                    </div>
                )}

                {step === 2 && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-bold text-slate-800">Revisa lo leído — {validas.length} listos para crear</p>
                                {conErrores.length > 0 && <p className="text-xs text-red-600 font-bold">{conErrores.length} con datos que faltan (no se crearán hasta que los completes)</p>}
                            </div>
                            <span className="text-xs text-slate-400">Agencia que paga: <b>{client?.name}</b></span>
                        </div>

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                            {hojasRevisadas.map((h, i) => (
                                <div key={h.id} className={`rounded-xl border p-3 flex gap-3 ${h.errores.length > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
                                    <div className="w-24 shrink-0 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-400">#{i + 1}</span>
                                        {h.miniatura && (
                                            <img src={h.miniatura} alt="" className="w-24 rounded border border-slate-200 cursor-zoom-in" onClick={() => setHojaAmpliada(h)} title="Ver en grande" />
                                        )}
                                        <button onClick={() => setTextoVisible(textoVisible === h.id ? null : h.id)} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1">
                                            {textoVisible === h.id ? <EyeOff size={10} /> : <Eye size={10} />} texto leído
                                        </button>
                                        <button onClick={() => quitarHoja(h.id)} className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={10} /> quitar</button>
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {campo(h, 'remitente', 'Remitente (quien entrega)', { ancho: 'col-span-2' })}
                                            {campo(h, 'expedicion', 'Expedición / Ref.', { ancho: 'col-span-2' })}
                                            {campo(h, 'destinatario', 'Destinatario', { ancho: 'col-span-2' })}
                                            {campo(h, 'direccion', 'Dirección', { ancho: 'col-span-2' })}
                                            {campo(h, 'poblacion', 'Población')}
                                            {campo(h, 'cp', 'C.P.')}
                                            {campo(h, 'telefono', 'Teléfono')}
                                            {campo(h, 'bultos', 'Bultos', { tipo: 'number' })}
                                            <label className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-500">Porte</span>
                                                <select className={inputCls} value={h.campos.porte || ''} onChange={(e) => editarCampo(h.id, 'porte', e.target.value)}>
                                                    <option value="">— Elegir —</option>
                                                    <option value="Pagado">Pagado (remitente)</option>
                                                    <option value="Debido">Debido (destinatario)</option>
                                                </select>
                                            </label>
                                            {campo(h, 'reembolso', 'Reembolso €', { placeholder: '0' })}
                                            {campo(h, 'kilos', 'Kilos', { placeholder: '—' })}
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-500">Artículo</span>
                                                <span className={`px-2 py-1.5 rounded-lg text-xs font-bold ${h.articulo ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{h.articulo?.name || '—'}</span>
                                            </div>
                                        </div>
                                        {(h.errores.length > 0 || h.avisos.length > 0) && (
                                            <div className="flex flex-wrap gap-2">
                                                {h.errores.map(e => <span key={e} className="text-[11px] font-bold text-red-600 flex items-center gap-1"><AlertTriangle size={11} /> {e}</span>)}
                                                {h.avisos.map(a => <span key={a} className="text-[11px] font-bold text-amber-600 flex items-center gap-1"><AlertTriangle size={11} /> {a}</span>)}
                                            </div>
                                        )}
                                        {textoVisible === h.id && (
                                            <pre className="text-[10px] bg-slate-50 border border-slate-200 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre-wrap">{h.texto || '(sin texto)'}</pre>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-between pt-2">
                            <button onClick={() => setStep(1)} className="px-4 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors flex items-center gap-2">
                                <ArrowLeft size={16} /> Añadir más
                            </button>
                            <button onClick={crearEnvios} disabled={importando || validas.length === 0}
                                className="px-6 py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-40 flex items-center gap-2 shadow-lg shadow-emerald-500/30">
                                {importando ? <><span className="animate-spin">⏳</span> Creando…</> : <><CheckCircle size={18} /> Crear {validas.length} envíos</>}
                            </button>
                        </div>
                    </div>
                )}

                {step === 3 && resultado && (
                    <div className="text-center py-8 space-y-4">
                        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                            <CheckCircle size={32} className="text-emerald-600" />
                        </div>
                        <h3 className="text-xl font-bold text-slate-800">Albaranes creados</h3>
                        <div className="text-sm text-slate-600 space-y-1">
                            <p>✅ <strong>{resultado.creados}</strong> envíos creados</p>
                            {resultado.fallidos > 0 && <p>❌ <strong>{resultado.fallidos}</strong> fallidos</p>}
                        </div>
                        <div className="flex justify-center gap-3 pt-4">
                            <button onClick={reiniciar} className="px-5 py-2 text-sm font-bold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors">Importar más</button>
                            {onClose && <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors">Cerrar</button>}
                        </div>
                    </div>
                )}
            </div>

            {hojaAmpliada && (
                <div className="fixed inset-0 bg-slate-900/80 z-[200] flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setHojaAmpliada(null)}>
                    <img src={hojaAmpliada.grande || hojaAmpliada.miniatura} alt="" className="max-h-full max-w-full rounded-lg shadow-2xl" />
                </div>
            )}
        </div>
    );
}
