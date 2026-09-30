import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Camera, CheckCircle, ArrowRight, ArrowLeft, Trash2, AlertTriangle, Eye, EyeOff, FileText } from 'lucide-react';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { calcularComisionReembolso } from '../../utils/comisionReembolso';
import { buscarArticuloBadi, baremoDelPunto, precioUnitarioParaCliente, prefijoSerieDelCliente, esPoblacionConocida } from '../../utils/importacionEnvios';
import { hojasDeFichero, leerHoja, miniaturaDeLienzo, cerrarLector } from '../../utils/ocrAlbaran';
import { leerHojaConIA, leerListadoConIA } from '../../utils/iaAlbaran';
import { poblacionSegunCP } from '../../utils/lecturaAlbaranIA';
import { cobraPorKilos, precioPorKilos, tramoDePeso } from '../../utils/precioPorKilos';
import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import PanelConsumoIA from './PanelConsumoIA';

// Importa albaranes de agencia (TXT, TSB, etc.) a partir de fotos o PDF.
//
// Cada hoja la lee primero una IA con visión (iaAlbaran.js → función
// leer-albaran → OpenRouter), que con fotos de móvil torcidas acierta casi
// todo. Si la IA no responde o se acaba el saldo, esa hoja se lee con Tesseract
// en el propio navegador (ocrAlbaran.js), gratis pero bastante peor.
// Sea cual sea el lector, nada se guarda sin pasar por la revisión: cada hoja se
// enseña junto a lo que se ha leído y la oficina corrige antes de crear.
//
// El cliente que se recibe es la AGENCIA, que es quien paga el porte: todo
// albarán de agencia nace con porte Pagado, diga lo que diga el papel y sean
// quienes sean el remitente y el destinatario. El remitente leído del papel
// va a originName (quien entrega la mercancía).
//
// La población leída se cuadra con el CP nada más leer la hoja
// (poblacionSegunCP): las etiquetas ponen "CORDOBA" en la delegación de
// destino y el lector se lo llevaba a la población aunque el CP fuera 14920
// (Aguilar de la Frontera). El cambio se enseña como aviso en la revisión.
//
// Modo listado: algunos clientes (ALMACENES DE FERRETERIA SAN RAFAEL) no dan un
// albarán por envío sino una hoja con una línea por expedición. En ese modo la
// IA devuelve todas las líneas y cada una sale como un envío en la revisión,
// con el cliente elegido como remitente y pagador. Sólo con IA: Tesseract no
// sabe separar las líneas de una tabla fotografiada.

let contadorHojas = 0;

const inputCls = 'w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white';

/** Kilos tecleados o leídos ("47", "12,5") → número, o null si no hay. */
function kilosDe(valor) {
    const n = parseFloat(String(valor ?? '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
}

function camposVacios() {
    return { expedicion: '', remitente: '', destinatario: '', direccion: '', poblacion: '', cp: '', telefono: '', coordenadas: '', bultos: null, kilos: null, reembolso: 0, devolverFirmado: false };
}

/** Igual que el buscador del alta: sin acentos, sin puntuación y sin "S.L."/"S.A.". */
function normalizarBusqueda(texto) {
    if (!texto) return '';
    return String(texto)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[.,;:]/g, '')
        .replace(/\b(s\.?l\.?u?|s\.?a\.?|sociedad limitada|sociedad anonima)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Fichas (y sus sedes) cuyo nombre contiene lo tecleado, como en el destinatario
 * del alta. Fuera las pendientes de validar. Cada resultado trae ya los campos de
 * la hoja que rellena al elegirlo.
 */
function fichasQueCasan(clients, texto, max = 8) {
    const buscado = normalizarBusqueda(texto);
    if (buscado.length < 2) return [];
    const resultados = [];
    const fichas = (clients || []).filter(c => c && c.status !== 'pending')
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const c of fichas) {
        const nombreCasa = normalizarBusqueda(c.name).includes(buscado);
        if (nombreCasa) {
            resultados.push({
                id: String(c.id), nombre: c.name,
                campos: { destinatario: c.name || '', direccion: c.opAddress || c.address || '', poblacion: c.opCity || c.city || '', cp: c.opZip || c.zip || '', telefono: c.phone || '', coordenadas: c.coordinates || '' },
            });
        }
        for (const b of (Array.isArray(c.branches) ? c.branches : [])) {
            if (!nombreCasa && !normalizarBusqueda(b.name).includes(buscado) && !normalizarBusqueda(b.city).includes(buscado)) continue;
            resultados.push({
                id: `${c.id}_${b.id}`, nombre: b.name || c.name, sede: true,
                campos: { destinatario: b.name || c.name || '', direccion: b.address || c.opAddress || c.address || '', poblacion: b.city || c.opCity || c.city || '', cp: b.zip || c.opZip || c.zip || '', telefono: b.phone || c.phone || '', coordenadas: b.coordinates || c.coordinates || '' },
            });
        }
        if (resultados.length >= max) break;
    }
    return resultados.slice(0, max);
}

export default function ImportarAlbaranesAgencia({ client, clients, onCreateShipment, allShipments, articles, tariffs, coverageZones, onClose, isAdmin }) {
    const [step, setStep] = useState(1); // 1=subir y leer, 2=revisar, 3=hecho
    const [hojas, setHojas] = useState([]);
    const [leyendo, setLeyendo] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [importando, setImportando] = useState(false);
    const [resultado, setResultado] = useState(null);
    const [hojaAmpliada, setHojaAmpliada] = useState(null);
    const [textoVisible, setTextoVisible] = useState(null);
    // Hoja cuyo destinatario enseña ahora la lista de fichas.
    const [buscandoDestino, setBuscandoDestino] = useState(null);
    const colaRef = useRef(Promise.resolve());
    // Sin saldo no tiene sentido seguir llamando a la IA hoja por hoja: el resto
    // de la importación va directa al lector gratuito.
    const iaSinSaldoRef = useRef(false);
    const [avisoIA, setAvisoIA] = useState('');
    const [consumo, setConsumo] = useState({ hojas: 0, coste: 0 });
    const [refrescoSaldo, setRefrescoSaldo] = useState(0);
    // 'albaran' = cada hoja es un envío; 'listado' = cada línea de la hoja es un envío.
    // Por defecto lo que diga la ficha (interruptor "Sus fotos son listados").
    const [tipoHoja, setTipoHoja] = useState(client?.fotosComoListado ? 'listado' : 'albaran');
    useEffect(() => { setTipoHoja(client?.fotosComoListado ? 'listado' : 'albaran'); }, [client?.id, client?.fotosComoListado]);
    const tipoHojaRef = useRef(tipoHoja);
    tipoHojaRef.current = tipoHoja;

    useEffect(() => () => { cerrarLector(); }, []);

    const actualizarHoja = useCallback((id, cambios) => {
        setHojas(prev => prev.map(h => (h.id === id ? { ...h, ...(typeof cambios === 'function' ? cambios(h) : cambios) } : h)));
    }, []);

    // Pueblos con su CP para cuadrar la población leída: las zonas de cobertura
    // de Ajustes (que la oficina mantiene) y, por si faltara alguno, el maestro.
    const pueblos = useMemo(() => [...(coverageZones || []), ...ALL_BAREMO_PUEBLOS], [coverageZones]);
    const pueblosRef = useRef(pueblos);
    pueblosRef.current = pueblos;

    // Una hoja-listado se sustituye por tantas filas como envíos traiga, todas
    // con la misma foto para que la oficina compare cada línea con el papel.
    const leerListado = useCallback(async (id, lienzo) => {
        const grande = miniaturaDeLienzo(lienzo, 1400);
        if (iaSinSaldoRef.current) {
            actualizarHoja(id, { estado: 'error', error: 'Sin saldo de IA: un listado sólo se puede leer con IA', grande });
            return;
        }
        try {
            actualizarHoja(id, { progreso: 0.5 });
            const { lineas, coste } = await leerListadoConIA(lienzo);
            setConsumo(c => ({ hojas: c.hojas + 1, coste: c.coste + (coste || 0) }));
            if (lineas.length === 0) {
                actualizarHoja(id, { estado: 'error', error: 'No se ha encontrado ninguna línea de envío en la hoja', grande });
                return;
            }
            setHojas(prev => prev.flatMap(h => (h.id !== id ? [h] : lineas.map((leidos, k) => {
                const { campos, correccion } = poblacionSegunCP(leidos, pueblosRef.current);
                return { ...h, id: `${id}-${k + 1}`, linea: k + 1, campos, correccion, texto: '', lector: 'ia', estado: 'leida', progreso: 1, grande };
            }))));
        } catch (err) {
            console.error('La IA no pudo leer el listado', err);
            if (err?.sinSaldo) iaSinSaldoRef.current = true;
            actualizarHoja(id, { estado: 'error', error: `La IA no pudo leer el listado (${err?.message || 'error'}). Vuelve a subir la foto.`, grande });
        }
    }, [actualizarHoja]);

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

                    if (tipoHojaRef.current === 'listado') {
                        await leerListado(id, lienzo);
                        continue;
                    }

                    if (!iaSinSaldoRef.current) {
                        try {
                            // La IA no avisa del avance: media barra mientras piensa.
                            actualizarHoja(id, { progreso: 0.5 });
                            const { campos: leidos, coste } = await leerHojaConIA(lienzo);
                            const { campos, correccion } = poblacionSegunCP(leidos, pueblosRef.current);
                            actualizarHoja(id, { campos, correccion, texto: '', lector: 'ia', estado: 'leida', progreso: 1, grande: miniaturaDeLienzo(lienzo, 1400) });
                            setConsumo(c => ({ hojas: c.hojas + 1, coste: c.coste + (coste || 0) }));
                            continue;
                        } catch (err) {
                            console.error('La IA no pudo leer la hoja; se lee con el lector gratuito', fichero.name, err);
                            if (err?.sinSaldo) iaSinSaldoRef.current = true;
                            setAvisoIA(err?.sinSaldo
                                ? 'Se ha acabado el saldo de la IA: el resto de hojas se lee con el lector gratuito, que falla más. Recarga en openrouter.ai y vuelve a subirlas.'
                                : `La IA no ha podido leer alguna hoja (${err?.message || 'error'}); esas se han leído con el lector gratuito. Revísalas con cuidado.`);
                            actualizarHoja(id, { progreso: 0 });
                        }
                    }

                    try {
                        const { campos: leidos, texto, lienzo: leido } = await leerHoja(lienzo, (p) => actualizarHoja(id, { progreso: p }));
                        const { campos, correccion } = poblacionSegunCP(leidos, pueblosRef.current);
                        // Si hubo que girar la foto, la miniatura enseña la hoja tal y como se ha leído.
                        actualizarHoja(id, { campos, correccion, texto, lector: 'tesseract', estado: 'leida', progreso: 1, miniatura: miniaturaDeLienzo(leido), grande: miniaturaDeLienzo(leido, 1400) });
                    } catch (err) {
                        console.error('Error leyendo la hoja', fichero.name, err);
                        actualizarHoja(id, { estado: 'error', error: 'No se pudo leer la hoja', grande: miniaturaDeLienzo(lienzo, 1400) });
                    }
                }
            }
        }).finally(() => { setLeyendo(false); setRefrescoSaldo(n => n + 1); });
    }, [actualizarHoja, leerListado]);

    const handleDrop = (e) => { e.preventDefault(); setDragOver(false); leerFicheros(e.dataTransfer.files); };

    const editarCampo = (id, campo, valor) => actualizarHoja(id, h => ({ campos: { ...h.campos, [campo]: valor } }));
    const quitarHoja = (id) => setHojas(prev => prev.filter(h => h.id !== id));
    // Elegir una ficha pisa lo leído del papel con lo de la ficha; lo que la
    // ficha no tenga (sin teléfono, p. ej.) se queda como lo leyó la IA.
    const elegirDestino = (id, ficha) => {
        actualizarHoja(id, h => {
            const campos = { ...h.campos };
            for (const [k, v] of Object.entries(ficha.campos)) if (v || k === 'coordenadas') campos[k] = v;
            return { campos, correccion: null };
        });
        setBuscandoDestino(null);
    };

    const hojasRevisadas = useMemo(() => hojas.map(h => {
        const c = h.campos;
        const errores = [];
        const avisos = [];
        if (h.estado === 'error') errores.push(h.error || 'No se pudo leer');
        if (!c.destinatario) errores.push('Falta el destinatario');
        if (!c.poblacion && !c.cp) errores.push('Falta la población o el CP');
        const bultos = parseInt(c.bultos) || 0;
        if (bultos < 1) errores.push('Faltan los bultos');
        // Lo que se cambió al leer (la población por el CP) se enseña para que la
        // oficina lo vea junto a la foto, aunque después lo edite.
        if (h.correccion) avisos.push(h.correccion);
        // La misma hoja subida dos veces (o dos fotos del mismo listado) crearía
        // el envío repetido: se avisa si la expedición ya existe para este cliente.
        const exp = String(c.expedicion || '').trim();
        if (exp) {
            const yaCreado = (allShipments || []).find(s => String(s?.clientReference || '').trim() === exp && String(s?.clientId) === String(client?.id));
            if (yaCreado) avisos.push(`Expedición ${exp} ya importada en ${yaCreado.id}`);
            else if (hojas.some(o => o.id !== h.id && String(o.campos?.expedicion || '').trim() === exp)) avisos.push(`Expedición ${exp} repetida en esta importación`);
        }
        if ((c.poblacion || c.cp) && !esPoblacionConocida(c.poblacion, c.cp, { tariffs, coverageZones })) avisos.push('Población fuera del baremo: revisa el nombre');
        // Sin kilos, a una agencia que cobra por peso el porte le saldría a 0.
        const kilos = kilosDe(c.kilos);
        const porKilos = cobraPorKilos(client);
        if (porKilos && !kilos) errores.push('Faltan los kilos (esta agencia cobra por kilos)');
        const porteKilos = porKilos && kilos ? { precio: precioPorKilos(kilos, client), tramo: tramoDePeso(kilos, client) } : null;
        const articulo = bultos > 0 ? buscarArticuloBadi(articles, bultos) : null;
        return { ...h, errores, avisos, articulo, porteKilos };
    }), [hojas, articles, tariffs, coverageZones, client, allShipments]);

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
                    // Agencia "Por Kilos": el porte sale del peso y el artículo va a 0,
                    // igual que en el alta (el artículo sólo dice cuántos bultos son).
                    const porKilos = cobraPorKilos(client);
                    const kilos = kilosDe(c.kilos);
                    const unitPrice = porKilos ? 0 : precioUnitarioParaCliente(article, client, baremo);
                    const porte = unitPrice + (porKilos ? precioPorKilos(kilos, client) : 0);
                    const codAmt = parseFloat(String(c.reembolso || 0).replace(',', '.')) || 0;
                    const codFee = calcularComisionReembolso(client, codAmt);

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
                        // Sólo si se eligió la ficha del destinatario: el papel no trae GPS.
                        destinationCoordinates: c.coordenadas || '',
                        origin: `${client.zip || ''} ${client.city || ''}, ES`.trim(),
                        destination: `${c.cp || ''} ${c.poblacion || ''}, ES`.trim(),
                        date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
                        createdAt: new Date().toISOString(),
                        status: 'Pendiente de asignar',
                        packages: bultos,
                        // Vacías a propósito: la agencia y la expedición ya van en su sitio
                        // (cliente y referencia) y los kilos en su casilla. Lo que se ponía
                        // aquí ("Albarán agencia TXT · Exp. … · 47 kg") le llegaba al
                        // repartidor como si fuera una indicación de la entrega.
                        observations: '',
                        weightKg: kilos,
                        weightBracket: porKilos ? (tramoDePeso(kilos, client) || null) : null,
                        articles: article ? [{ ...article, uniqueId: Date.now() + numero, quantity: 1, unitPrice, totalPrice: unitPrice }] : [],
                        // La comisión del reembolso va dentro del porte, como en el alta de la oficina.
                        amount: porte > 0 ? (porte + codFee).toFixed(2) : 'Pendiente',
                        customAmount: porte > 0 ? Math.round((porte + codFee) * 100) / 100 : null,
                        billingType: client.billingType || 'Clientes Habituales',
                        paymentStatus: 'Pending',
                        // Siempre Pagado: el porte de un albarán de agencia lo paga la agencia.
                        porteType: 'Pagado',
                        hasCod: codAmt > 0,
                        codAmount: codAmt,
                        codCommission: codFee,
                        createdBy: isAdmin ? `Admin (Import Fotos: ${client.name})` : `ClienteWeb: ${client.name}`,
                        importedFromExcel: true,
                        excelFileName: hoja.fichero,
                        clientReference: (c.expedicion || '').trim() || null,
                        // Al repartidor le sale "Recoger firma de vuelta" y se le pide la foto del papel firmado.
                        needsSignatureReturn: !!c.devolverFirmado,
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

    const reiniciar = () => {
        setHojas([]); setResultado(null); setStep(1);
        setConsumo({ hojas: 0, coste: 0 }); setAvisoIA(''); iaSinSaldoRef.current = false;
    };

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
                        <p className="text-xs text-slate-500">Fotos o PDF de los albaranes. Los lee una IA y tú revisas antes de crear.</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {[1, 2, 3].map(s => <div key={s} className={`w-2.5 h-2.5 rounded-full transition-all ${step >= s ? 'bg-emerald-600 scale-110' : 'bg-slate-200'}`} />)}
                </div>
            </div>

            <div className="p-6 space-y-4">
                {step !== 3 && (
                    <PanelConsumoIA allShipments={allShipments} hojasImportacion={consumo.hojas} costeImportacion={consumo.coste} refresco={refrescoSaldo} />
                )}
                {avisoIA && step !== 3 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-800 flex items-start gap-2">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {avisoIA}
                    </div>
                )}
                {step === 1 && (
                    <div className="space-y-4">
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="font-bold text-slate-500">Cada hoja es:</span>
                            <div className="flex bg-slate-100 rounded-lg p-0.5">
                                <button onClick={() => setTipoHoja('albaran')} disabled={leyendo}
                                    className={`px-3 py-1 rounded-md font-bold transition-colors ${tipoHoja === 'albaran' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Un albarán</button>
                                <button onClick={() => setTipoHoja('listado')} disabled={leyendo}
                                    className={`px-3 py-1 rounded-md font-bold transition-colors ${tipoHoja === 'listado' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>Un listado (cada línea, un envío)</button>
                            </div>
                            {tipoHoja === 'listado' && <span className="text-slate-400">Remitente y pagador: <b className="text-slate-600">{client?.name}</b></span>}
                        </div>
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
                            <p className="text-sm text-slate-500">Puedes soltar muchos a la vez. {tipoHoja === 'listado' ? 'Cada línea del listado será un albarán.' : 'Cada hoja será un albarán.'}</p>
                            <p className="text-xs text-slate-400 mt-2">Cada hoja tarda unos segundos en leerse.</p>
                        </div>

                        {hojas.length > 0 && (
                            <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                                {hojas.map(h => (
                                    <div key={h.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                                        {h.miniatura ? <img src={h.miniatura} alt="" className="w-10 h-14 object-cover rounded border border-slate-200" /> : <FileText size={20} className="text-slate-300" />}
                                        <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-700 truncate">{h.fichero}{h.pagina > 1 ? ` · pág. ${h.pagina}` : ''}{h.linea ? ` · línea ${h.linea}` : ''}</p>
                                            {h.estado === 'leyendo' && (
                                                <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                                                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${Math.round((h.progreso || 0) * 100)}%` }} />
                                                </div>
                                            )}
                                            {h.estado === 'leida' && <p className="text-emerald-600">Leída{h.lector === 'tesseract' ? ' (lector gratuito)' : ''}: {h.campos.destinatario || 'sin destinatario'}{h.campos.poblacion ? ` · ${h.campos.poblacion}` : ''}</p>}
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
                            <span className="text-xs text-slate-400">Paga el porte: <b>{client?.name}</b></span>
                        </div>

                        <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                            {hojasRevisadas.map((h, i) => (
                                <div key={h.id} className={`rounded-xl border p-3 flex gap-3 ${h.errores.length > 0 ? 'border-red-200 bg-red-50/40' : 'border-slate-200'}`}>
                                    <div className="w-24 shrink-0 flex flex-col items-center gap-1">
                                        <span className="text-[10px] font-bold text-slate-400">#{i + 1}{h.linea ? ` · lín. ${h.linea}` : ''}</span>
                                        {h.miniatura && (
                                            <img src={h.miniatura} alt="" className="w-24 rounded border border-slate-200 cursor-zoom-in" onClick={() => setHojaAmpliada(h)} title="Ver en grande" />
                                        )}
                                        {h.lector === 'tesseract' ? (
                                            <>
                                                <span className="text-[10px] font-bold text-amber-600" title="La IA no pudo leer esta hoja">lector gratuito</span>
                                                <button onClick={() => setTextoVisible(textoVisible === h.id ? null : h.id)} className="text-[10px] text-slate-400 hover:text-slate-600 flex items-center gap-1">
                                                    {textoVisible === h.id ? <EyeOff size={10} /> : <Eye size={10} />} texto leído
                                                </button>
                                            </>
                                        ) : h.lector === 'ia' && (
                                            <span className="text-[10px] font-bold text-violet-500">leído con IA</span>
                                        )}
                                        <button onClick={() => quitarHoja(h.id)} className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={10} /> quitar</button>
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                            {campo(h, 'remitente', 'Remitente (quien entrega)', { ancho: 'col-span-2', placeholder: client?.name || '' })}
                                            {campo(h, 'expedicion', 'Expedición / Ref.', { ancho: 'col-span-2' })}
                                            <div className="relative col-span-2 flex flex-col gap-0.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-500">Destinatario</span>
                                                <input type="text" className={inputCls} placeholder="Escribe para buscar en tus clientes"
                                                    aria-label="Destinatario"
                                                    value={h.campos.destinatario ?? ''}
                                                    onFocus={() => setBuscandoDestino(h.id)}
                                                    onBlur={() => setBuscandoDestino(b => (b === h.id ? null : b))}
                                                    onKeyDown={(e) => { if (e.key === 'Escape') setBuscandoDestino(null); }}
                                                    onChange={(e) => { editarCampo(h.id, 'destinatario', e.target.value); setBuscandoDestino(h.id); }} />
                                                {buscandoDestino === h.id && (() => {
                                                    const fichas = fichasQueCasan(clients, h.campos.destinatario);
                                                    return fichas.length > 0 && (
                                                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto">
                                                            {fichas.map(f => (
                                                                // onMouseDown: el blur del input cerraría la lista antes del click.
                                                                <button key={f.id} type="button"
                                                                    onMouseDown={(e) => { e.preventDefault(); elegirDestino(h.id, f); }}
                                                                    className="w-full text-left px-3 py-1.5 hover:bg-emerald-50 border-b border-slate-50 last:border-0">
                                                                    <div className="text-xs font-bold text-slate-800">{f.sede && <span className="text-blue-500 text-[10px]">📍 </span>}{f.nombre}</div>
                                                                    <div className="text-[10px] text-slate-500 truncate">{[f.campos.direccion, f.campos.poblacion].filter(Boolean).join(' · ')}</div>
                                                                </button>
                                                            ))}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                            {campo(h, 'direccion', 'Dirección', { ancho: 'col-span-2' })}
                                            {campo(h, 'poblacion', 'Población')}
                                            {campo(h, 'cp', 'C.P.')}
                                            {campo(h, 'telefono', 'Teléfono')}
                                            {campo(h, 'bultos', 'Bultos', { tipo: 'number' })}
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-500">Porte</span>
                                                <span className="px-2 py-1.5 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700" title={`El porte lo paga ${client?.name || 'el cliente elegido'}`}>Pagado (lo paga {h.linea ? 'el cliente' : 'la agencia'})</span>
                                            </div>
                                            {campo(h, 'reembolso', 'Reembolso €', { placeholder: '0' })}
                                            {campo(h, 'kilos', 'Kilos', { placeholder: '—' })}
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-[10px] font-bold uppercase text-slate-500">Artículo</span>
                                                <span className={`px-2 py-1.5 rounded-lg text-xs font-bold ${h.articulo ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>{h.articulo?.name || '—'}</span>
                                            </div>
                                            {h.porteKilos && (
                                                <div className="col-span-2 md:col-span-4 text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-1.5">
                                                    Porte por kilos: {h.porteKilos.precio.toFixed(2)} €{h.porteKilos.tramo ? ` · ${h.porteKilos.tramo}` : ''}
                                                </div>
                                            )}
                                            {/* DAC en TXT, "devolver albarán firmado" en XPO. Es el mismo aviso
                                                "Recoger firma de vuelta" que se marca a mano en el alta. */}
                                            <label className={`col-span-2 md:col-span-4 flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-xs font-bold ${h.campos.devolverFirmado ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-white border-slate-200 text-slate-500'}`}>
                                                <input type="checkbox" className="w-4 h-4 rounded border-slate-300 text-emerald-600"
                                                    checked={!!h.campos.devolverFirmado}
                                                    onChange={(e) => editarCampo(h.id, 'devolverFirmado', e.target.checked)} />
                                                <FileText size={14} className={h.campos.devolverFirmado ? 'text-emerald-600' : 'text-slate-300'} />
                                                Devolver albarán firmado a la agencia (DAC en TXT, «devolver albarán firmado» en XPO)
                                            </label>
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
