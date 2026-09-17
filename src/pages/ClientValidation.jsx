import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, MapPin, Phone, Building2, Tag, User, Calendar, Edit, Mail, Search, Trash2, AlertTriangle, KeyRound, Globe, Merge, Copy, List, LayoutGrid, Truck, X } from 'lucide-react';
import CreateClientModal from '../components/clients/CreateClientModal';
import { supabase } from '../lib/supabase';
import { getOwnerLabel } from '../utils/agencyOwnership';
import { buscarFichasParecidas, explicarMotivos, buscarSolicitudesGemelas, buscarSolicitudesParecidas, loQueAportanLasGemelas, explicarAportacion } from '../utils/duplicadosClientes';
import { esRegistroWeb } from '../utils/altaClientes';
import { indexarEnviosPorCliente, quienMandoLaMercancia } from '../utils/quienMandoLaMercancia';
import { planDeAcceso, explicarElAcceso } from '../utils/accesoFichaExistente';
import { emailDeAcceso } from '../utils/clientAccess';
// Una ficha puede llevar varios correos separados por ';'. El enlace mailto los
// quiere separados por comas, así que se rearma en vez de meter el campo tal
// cual: con el ';' el gestor de correo abre un destinatario inválido.
import { correosDeFicha } from '../utils/correosDeFicha';

// ── Llama a la Edge Function para enviar email de acceso al cliente ──
// `email` es opcional y sólo se usa cuando el que espera el aviso no es el
// correo principal de la ficha: otra persona de la misma empresa, o el cliente
// de siempre al que se le acaba de dar el acceso a su ficha de toda la vida.
// La función de servidor lo comprueba contra los correos de esa ficha.
async function sendAccessEmail(clientId, email = null) {
    try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
            alert('Tu sesión ha caducado. Vuelve a iniciar sesión para poder activar clientes.');
            return;
        }
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const res = await fetch(`${supabaseUrl}/functions/v1/confirmar-acceso`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Token de la sesión, no la anon key: la función comprueba que
                // quien llama es admin antes de dar acceso al cliente.
                'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ clientId, ...(email ? { email } : {}) }),
        });
        const result = await res.json();
        if (result.ok) {
            console.log(`[Email] Email de acceso enviado a: ${result.emailSentTo}`);
        } else {
            console.warn('[Email] No se pudo enviar el email de acceso:', result.error);
            alert(`El cliente se ha aprobado, pero no se le pudo enviar el email de acceso:\n\n${result.error}`);
        }
    } catch (e) {
        console.warn('[Email] Error al enviar email de acceso:', e);
    }
}

// ── ¿Esta solicitud la ha pedido una empresa, o la ha creado la app sola? ──
//
// En esta pantalla caen dos cosas muy distintas y hasta ahora se veían igual:
//   - fichas que nacen solas al hacer un albarán, una entrega o un reparto
//     (`createdFrom`: 'Albarán', 'Entrega', 'Reparto (Driver)'…). No las ha
//     pedido nadie, son remitentes y destinatarios que se apuntan al vuelo.
//   - empresas que han rellenado el formulario de sumtransportes.com. Ésas SÍ
//     están esperando: traen correo, CIF y contraseña, y al aprobarlas se les
//     abre el portal.
// Mezcladas entre decenas de las primeras, las segundas no se encuentran, y de
// ahí las pestañas de abajo. Quien las distingue es `esRegistroWeb`, que vive en
// utils/altaClientes.js porque el alta a mano también lo necesita: para poder
// decir en qué pestaña de aquí está la ficha que le está bloqueando el número.

// Fecha y hora del registro. El formulario guarda `createdAt` en ISO; las
// fichas creadas en un albarán sólo dejan `lastInteraction` (día suelto).
function cuandoSeRegistro(client) {
    const iso = client?.createdAt;
    if (iso) {
        const fecha = new Date(iso);
        if (!isNaN(fecha.getTime())) {
            return fecha.toLocaleString('es-ES', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });
        }
    }
    return client?.lastInteraction || '';
}

// Para ordenar: lo más reciente arriba, que es lo que se está esperando.
function momentoDeRegistro(client) {
    const t = Date.parse(client?.createdAt || '');
    return isNaN(t) ? 0 : t;
}

// ── Trozos de la ficha que se pintan igual en la tarjeta y en la fila desplegada ──
// `enTarjeta` los apila con una línea abajo; si no, van sueltos con su borde.

function BloqueRegistroWeb({ client, enTarjeta }) {
    return (
        <div className={`bg-blue-50/60 px-4 py-3 space-y-1.5 ${enTarjeta ? 'border-b border-blue-100' : 'rounded-lg border border-blue-100'}`}>
            <div className="flex items-center gap-2">
                <Globe size={13} className="text-blue-600 shrink-0" />
                <span className="text-xs font-bold text-blue-800">Se ha registrado en la web</span>
            </div>
            {client.email && (
                <div className="flex items-center gap-2 min-w-0">
                    <Mail size={13} className="text-blue-400 shrink-0" />
                    <a href={`mailto:${correosDeFicha(client.email).join(",") || client.email}`} className="text-xs text-blue-700 font-medium truncate hover:underline" title={client.email}>
                        {client.email}
                    </a>
                </div>
            )}
            {client.cif && (
                <div className="flex items-center gap-2">
                    <Tag size={13} className="text-blue-400 shrink-0" />
                    <span className="text-xs text-blue-700 font-mono">{client.cif}</span>
                </div>
            )}
            {client.contactPerson && (
                <div className="flex items-center gap-2 min-w-0">
                    <User size={13} className="text-blue-400 shrink-0" />
                    <span className="text-xs text-blue-700 truncate" title={client.contactPerson}>{client.contactPerson}</span>
                </div>
            )}
            {client.legalName && client.legalName !== client.name && (
                <div className="flex items-start gap-2 min-w-0">
                    <Building2 size={13} className="text-blue-400 shrink-0 mt-0.5" />
                    <span className="text-xs text-blue-700 break-words">{client.legalName}</span>
                </div>
            )}
            <div className="flex items-center gap-2">
                <Calendar size={13} className="text-blue-400 shrink-0" />
                <span className="text-xs text-blue-600">{cuandoSeRegistro(client)}</span>
            </div>
        </div>
    );
}

// Aviso de repetida — la misma empresa, varias veces en esta lista
function AvisoRepetida({ client, gemelas, uniendo, onUnir, enTarjeta }) {
    const aportado = loQueAportanLasGemelas(client, gemelas);
    const detalle = explicarAportacion(aportado);
    return (
        <div className={`bg-orange-50 px-4 py-3 ${enTarjeta ? 'border-b border-orange-200' : 'rounded-lg border border-orange-200'}`}>
            <div className="flex items-start gap-2">
                <Copy size={15} className="text-orange-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-orange-800">
                        Repetida: {gemelas.length + 1} solicitudes de este mismo cliente
                    </p>
                    <ul className="mt-1 space-y-0.5">
                        {gemelas.map(g => (
                            <li key={g.id} className="text-xs text-orange-700 leading-snug">
                                <span className="break-words">{g.name}</span>
                                <span className="text-orange-500">
                                    {g.createdFrom ? ` — ${g.createdFrom}` : ''}
                                    {g.coordinates ? ' — con coordenadas' : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-[10px] text-orange-600 mt-1.5 leading-snug">
                        {detalle
                            ? `Al unirlas, ésta se queda ${detalle} de las otras.`
                            : 'Las otras no aportan ningún dato que a ésta le falte.'}
                    </p>
                    <button
                        onClick={() => onUnir(client)}
                        disabled={uniendo}
                        className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-lg text-xs transition-colors"
                    >
                        <Merge size={13} />
                        {uniendo ? 'Uniendo…' : 'Quedarme con ésta y unir las demás'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Aviso de parecida — otra solicitud de la lista se llama casi igual
//
// Sin botón de unir, y es a propósito: unir borra la otra ficha, y un nombre
// parecido no da para eso. "Bar Manolo" y "Bar Manolo 2" pueden ser dos locales
// de verdad. Esto pone las dos delante y decide quien las mira; si son la misma,
// con dejarles el mismo nombre pasan a ser repetidas y ya sale el botón.
function AvisoParecida({ parecidas, enTarjeta }) {
    return (
        <div className={`bg-amber-50 px-4 py-3 ${enTarjeta ? 'border-b border-amber-200' : 'rounded-lg border border-amber-200'}`}>
            <div className="flex items-start gap-2">
                <Copy size={15} className="text-amber-600 mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-amber-800">
                        Se llama casi igual que {parecidas.length === 1 ? 'otra de la lista' : `otras ${parecidas.length} de la lista`}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                        {parecidas.map(p => (
                            <li key={p.id} className="text-xs text-amber-700 leading-snug">
                                <span className="break-words font-bold">{p.name}</span>
                                <span className="text-amber-500">
                                    {p.city ? ` — ${p.city}` : ''}
                                    {p.createdFrom ? ` — ${p.createdFrom}` : ''}
                                </span>
                            </li>
                        ))}
                    </ul>
                    <p className="text-[10px] text-amber-600 mt-1.5 leading-snug">
                        Míralas antes de aprobar. Si son la misma empresa, borra la que sobre —o
                        déjales el mismo nombre y podrás unirlas—. Si son dos de verdad, aprueba
                        tranquilo: esto sólo avisa, no toca nada.
                    </p>
                </div>
            </div>
        </div>
    );
}

// Aviso de duplicado — la empresa ya está en cartera
function AvisoDuplicado({ client, parecidas, dandoAcceso, onDarAcceso, enTarjeta }) {
    // Cuando lo único que hay es un nombre parecido, el aviso baja el tono: no
    // es "ya la tienes", es "míralo antes".
    const todoSonParecidos = parecidas.every(p => p.soloPorParecido);
    return (
        <div className={`bg-red-50 px-4 py-3 ${enTarjeta ? 'border-b border-red-200' : 'rounded-lg border border-red-200'}`}>
            <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
                <div className="min-w-0">
                    <p className="text-xs font-bold text-red-800">
                        {todoSonParecidos ? 'Se parece a una ficha que ya tienes' : 'Ya parece estar en tu cartera'}
                    </p>
                    <ul className="mt-1 space-y-2">
                        {parecidas.map(({ client: ficha, motivos, yaTieneAcceso, soloPorParecido }) => (
                            <li key={ficha.id} className="text-xs text-red-700 leading-snug">
                                <span className="font-bold break-words">{ficha.name}</span>
                                {ficha.clientNumber && <span className="text-red-500"> (nº {ficha.clientNumber})</span>}
                                <span className="text-red-600"> — {explicarMotivos(motivos)}</span>
                                {yaTieneAcceso && (
                                    <span className="mt-1 flex items-center gap-1 font-bold text-red-800">
                                        <KeyRound size={11} className="shrink-0" />
                                        Esa ficha ya entra en el portal
                                    </span>
                                )}
                                {/* Lo que casi siempre hay que hacer con un registro web en rojo:
                                    no es un cliente nuevo, es el de siempre pidiendo entrar.
                                    Con un nombre parecido a secas no se ofrece: darle el acceso
                                    a la ficha equivocada mete a una empresa en los envíos de
                                    otra, y eso no se arregla borrando nada. */}
                                {emailDeAcceso(client) && !soloPorParecido && (
                                    <button
                                        onClick={() => onDarAcceso(client, ficha)}
                                        disabled={dandoAcceso}
                                        className="mt-1.5 w-full flex items-center justify-center gap-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold rounded-lg text-xs transition-colors"
                                    >
                                        <KeyRound size={13} />
                                        {dandoAcceso ? 'Dando el acceso…' : 'Dar el acceso a esta ficha'}
                                    </button>
                                )}
                            </li>
                        ))}
                    </ul>
                    <p className="text-[10px] text-red-600 mt-1.5 leading-snug">
                        {todoSonParecidos
                            ? 'Sólo se parecen los nombres, así que no se da por hecho nada: compruébalo tú. Si es la misma empresa, aprobarla crea una segunda ficha y el cliente entrará a la nueva —vacía—, no a la suya.'
                            : emailDeAcceso(client)
                                ? 'Con el botón, la ficha de siempre se queda como está y sólo se le pone el acceso: la solicitud se borra y no queda una segunda ficha. Aprobarla, en cambio, crea la segunda y el cliente entrará a la nueva —vacía—, no a la suya.'
                                : 'Aprobarla crea una segunda ficha, y el cliente entrará a la nueva —vacía—, no a la suya.'}
                    </p>
                </div>
            </div>
        </div>
    );
}

// Dirección, teléfono, GPS y de dónde salió la ficha
function DatosFicha({ client, clients, mando }) {
    return (
        <div className="p-4 space-y-3 text-sm">
            {mando && (
                <div className="flex items-start gap-2 text-xs bg-indigo-50/70 border border-indigo-100 rounded-lg px-3 py-2">
                    <LineaQuienMando mando={mando} />
                </div>
            )}
            {client.address && (
                <div className="flex items-start gap-2">
                    <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                    <span className="text-slate-600">{client.address}</span>
                </div>
            )}
            {client.city && (
                <div className="flex items-center gap-2">
                    <Tag size={14} className="text-slate-400" />
                    <span className="text-slate-600">{client.city} {client.zip && `(${client.zip})`}</span>
                </div>
            )}
            {client.phone && (
                <div className="flex items-center gap-2">
                    <Phone size={14} className="text-slate-400" />
                    <span className="text-slate-600">{client.phone}</span>
                </div>
            )}
            {client.coordinates && (
                <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(client.coordinates).trim())}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    title="Ver ubicación en Google Maps"
                    className="flex items-center gap-2 w-fit"
                >
                    <MapPin size={14} className="text-emerald-500" />
                    <span className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-mono">{client.coordinates}</span>
                </a>
            )}

            {/* Meta info */}
            <div className="pt-2 border-t border-slate-100 space-y-1">
                <div className="flex items-center gap-2 text-xs">
                    <Building2 size={12} className={client.ownerAgencyId ? 'text-amber-500' : 'text-emerald-500'} />
                    <span className={client.ownerAgencyId ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                        {client.ownerAgencyId ? getOwnerLabel(client, clients) : 'Mis clientes'}
                    </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Calendar size={12} />
                    <span>Creado: {client.lastInteraction}</span>
                </div>
                {client.createdFrom && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <Tag size={12} />
                        <span>Desde: {esRegistroWeb(client) ? 'formulario de la web' : client.createdFrom}</span>
                    </div>
                )}
                {client.createdBy && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <User size={12} />
                        <span>Por: {client.createdBy}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── Quién le mandó la mercancía ──
// La línea que dice de dónde venía el paquete que hizo nacer la ficha. Es lo
// que identifica a un destinatario que sólo trae nombre y calle: con el
// remitente delante se sabe si la ficha vale o a quién preguntarle. Cuando el
// albarán ya no está cargado (más de 90 días) no se pinta nada, ver
// utils/quienMandoLaMercancia.js.
function LineaQuienMando({ mando, className = '' }) {
    if (!mando) return null;
    const etiqueta = mando.sentido === 'manda' ? 'Mercancía para' : 'Mercancía de';
    const detalle = [mando.albaran, mando.fecha].filter(Boolean).join(' · ');
    return (
        <span
            className={`inline-flex items-center gap-1 text-indigo-600 font-medium ${className}`}
            title={detalle ? `${etiqueta}: ${mando.nombre} — albarán ${detalle}` : `${etiqueta}: ${mando.nombre}`}
        >
            <Truck size={12} className="text-indigo-400 shrink-0" />
            <span className="break-words">{etiqueta}: <span className="font-bold">{mando.nombre}</span></span>
            {mando.albaran && <span className="font-mono text-indigo-400">{mando.albaran}</span>}
            {mando.otros > 0 && (
                <span className="text-indigo-400">
                    {mando.otros === 1 ? 'y 1 más' : `y ${mando.otros} más`}
                </span>
            )}
        </span>
    );
}

// Chapa Remitente / Destinatario
function ChapaTipo({ client, className = '' }) {
    return (
        <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${className} ${client.type === 'Remitente'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-purple-100 text-purple-700'
            }`}>
            {client.type}
        </span>
    );
}

// Cómo se lee la vista guardada. Si no hay nada, lista: es lo que se está probando.
function vistaGuardada() {
    try {
        const v = localStorage.getItem('validacion-vista');
        return v === 'tarjetas' ? 'tarjetas' : 'lista';
    } catch {
        return 'lista';
    }
}

export default function ClientValidation({ clients, shipments = [], onValidateClient, onUpdateClient, onDeleteClients, onGrantAccessToExisting, articles, tariffs, allPoblaciones }) {
    // Filter only pending clients — exclude test-mode clients (isTest: true)
    // Los registros web van primero, y entre ellos el último de arriba: son los
    // únicos que tienen a alguien esperando al otro lado.
    const pendingClients = useMemo(
        () => clients
            .filter(c => c.status === 'pending' && !c.isTest)
            .sort((a, b) => {
                const web = Number(esRegistroWeb(b)) - Number(esRegistroWeb(a));
                if (web !== 0) return web;
                return momentoDeRegistro(b) - momentoDeRegistro(a);
            }),
        [clients]
    );

    // Cuántos de los pendientes se han registrado ellos por la web.
    const registrosWeb = useMemo(() => pendingClients.filter(esRegistroWeb), [pendingClients]);

    // ── De quién venía el paquete de cada ficha ──
    // Los envíos se recorren una sola vez para montar el índice; buscar dentro
    // de miles de albaranes por cada una de las 500 fichas dejaría la lista
    // pegada al desplazarse.
    const quienMandoPorCliente = useMemo(() => {
        const indice = indexarEnviosPorCliente(shipments);
        const mapa = new Map();
        pendingClients.forEach(p => {
            const mando = quienMandoLaMercancia(p, indice);
            if (mando) mapa.set(p.id, mando);
        });
        return mapa;
    }, [pendingClients, shipments]);

    // ── Fichas de cartera que se parecen a cada solicitud ──
    // El registro web nunca toca una ficha existente, así que la empresa que ya
    // era cliente y sólo quería el acceso entra aquí como si fuera nueva. Si se
    // aprueba a ciegas quedan dos fichas y el portal se ata a la nueva, vacía.
    const duplicadosPorCliente = useMemo(() => {
        const mapa = new Map();
        pendingClients.forEach(p => {
            const parecidas = buscarFichasParecidas(p, clients);
            if (parecidas.length > 0) mapa.set(p.id, parecidas);
        });
        return mapa;
    }, [pendingClients, clients]);

    // ── Solicitudes pendientes que son la misma empresa ──
    // Cada camino de alta creaba la suya sin saber de las demás: el albarán una,
    // la entrega otra, el reparto otra. Salían dos y tres tarjetas del mismo
    // cliente, cada una a medias —ésta con GPS y sin teléfono, aquélla al revés—.
    // Ya no deberían nacer así (ver altaClientes.js), pero las de antes siguen
    // aquí y hay que poder juntarlas sin perder lo que traiga cada una.
    const gemelasPorCliente = useMemo(() => {
        const mapa = new Map();
        pendingClients.forEach(p => {
            const gemelas = buscarSolicitudesGemelas(p, pendingClients);
            if (gemelas.length > 0) mapa.set(p.id, gemelas);
        });
        return mapa;
    }, [pendingClients]);

    // ── Solicitudes que sólo se llaman casi igual ──
    // Aparte de las gemelas, y sin botón de unir: unir borra fichas y para eso
    // hace falta una coincidencia segura, no un parecido. Esto es el aviso de
    // "míralas antes de aprobar", que es justo lo que se escapaba: bastaba con
    // que a una le sobrara el S.L. para que pasaran por dos empresas.
    const parecidasEnLaLista = useMemo(() => {
        const mapa = new Map();
        pendingClients.forEach(p => {
            const parecidas = buscarSolicitudesParecidas(p, pendingClients);
            if (parecidas.length > 0) mapa.set(p.id, parecidas);
        });
        return mapa;
    }, [pendingClients]);

    // Cuántos grupos de nombres parecidos hay, no cuántas tarjetas se señalan.
    const cuantosParecidos = useMemo(() => {
        const vistos = new Set();
        let grupos = 0;
        pendingClients.forEach(p => {
            if (vistos.has(p.id) || !parecidasEnLaLista.has(p.id)) return;
            grupos += 1;
            vistos.add(p.id);
            parecidasEnLaLista.get(p.id).forEach(g => vistos.add(g.id));
        });
        return grupos;
    }, [pendingClients, parecidasEnLaLista]);

    // Cuántos clientes distintos están repetidos (no cuántas tarjetas sobran).
    const cuantosRepetidos = useMemo(() => {
        const vistos = new Set();
        let grupos = 0;
        pendingClients.forEach(p => {
            if (vistos.has(p.id) || !gemelasPorCliente.has(p.id)) return;
            grupos += 1;
            vistos.add(p.id);
            gemelasPorCliente.get(p.id).forEach(g => vistos.add(g.id));
        });
        return grupos;
    }, [pendingClients, gemelasPorCliente]);

    // Unir: la ficha que se está mirando se queda, se le copian los huecos que
    // rellenan las otras y las otras se borran. No se aprueba nada aquí: el
    // administrativo sigue decidiendo después, pero ya sobre una ficha entera.
    const [uniendoId, setUniendoId] = useState(null);

    const handleUnirGemelas = async (client) => {
        const gemelas = gemelasPorCliente.get(client.id);
        if (!gemelas || gemelas.length === 0) return;

        const aportado = loQueAportanLasGemelas(client, gemelas);
        const detalle = explicarAportacion(aportado);

        const confirmado = window.confirm(
            `Se queda esta ficha de «${client.name}» y se borran las otras ${gemelas.length}:\n\n` +
            gemelas.map(g => `   • ${g.name}${g.city ? ` — ${g.city}` : ''}${g.coordinates ? ' — con coordenadas' : ''}`).join('\n') +
            (detalle ? `\n\nAntes de borrarlas se le copia ${detalle}.` : '\n\nNo aportan ningún dato que a ésta le falte.') +
            `\n\n¿Unirlas?`
        );
        if (!confirmado) return;

        setUniendoId(client.id);
        try {
            if (Object.keys(aportado).length > 0 && onUpdateClient) {
                await onUpdateClient(client.id, aportado);
            }
            if (onDeleteClients) {
                await onDeleteClients(gemelas.map(g => g.id));
            }
            // Las que se han borrado no pueden quedar marcadas para el borrado masivo.
            const borradas = gemelas.map(g => g.id);
            setSelectedIds(prev => prev.filter(id => !borradas.includes(id)));
        } finally {
            setUniendoId(null);
        }
    };

    // ── Darle el acceso a la ficha que ya existe, en vez de aprobar otra ──
    //
    // Es el caso de casi todos los registros web que salen en rojo: no es un
    // cliente nuevo, es el de siempre pidiendo entrar en la app. Aprobarlo deja
    // dos fichas y ata el portal a la nueva, que está vacía. Esto se queda con
    // la ficha buena —su número, su tarifa, su histórico—, le pone SÓLO el
    // acceso y borra la solicitud.
    const [dandoAccesoId, setDandoAccesoId] = useState(null);

    const handleDarAcceso = async (solicitud, ficha) => {
        const plan = planDeAcceso(solicitud, ficha);
        if (!plan.posible) {
            alert(`Esta solicitud no trae acceso que dar: ${plan.motivo}.`);
            return;
        }

        if (!window.confirm(explicarElAcceso(solicitud, ficha, plan))) return;

        setDandoAccesoId(solicitud.id);
        try {
            const hecho = await onGrantAccessToExisting?.(solicitud, ficha);
            if (!hecho) return;

            // El aviso va a quien se ha registrado, que puede no ser el correo
            // principal de la ficha si ahí ya entraba otra persona.
            await sendAccessEmail(ficha.id, plan.correo);

            // La solicitud ya no existe: que no se quede marcada para el borrado.
            setSelectedIds(prev => prev.filter(id => id !== solicitud.id));

            alert(
                `✅ «${ficha.name}» ya entra en el portal con ${plan.correo}.\n\n` +
                `Se le ha enviado el email de acceso y la solicitud de la web se ha borrado.`
            );
        } finally {
            setDandoAccesoId(null);
        }
    };

    // Aviso antes de aprobar algo que ya está en cartera. Devuelve true si se
    // puede seguir adelante.
    const confirmarSiEsDuplicado = (clientId) => {
        // Primero lo de casa: si hay más solicitudes de este mismo cliente en la
        // lista, aprobar una deja las otras pendientes y tira lo que trajeran
        // (normalmente las coordenadas, que es lo que menos se puede recuperar).
        const gemelas = gemelasPorCliente.get(clientId);
        if (gemelas && gemelas.length > 0) {
            const seguir = window.confirm(
                `⚠️ Hay ${gemelas.length + 1} solicitudes de este mismo cliente en la lista.\n\n` +
                `Si apruebas sólo ésta, las otras se quedan pendientes y se pierde lo que traigan ` +
                `(coordenadas, teléfono...).\n\n` +
                `Lo suyo es usar antes «Quedarme con ésta y unir las demás».\n\n` +
                `¿Aprobar sólo ésta de todas formas?`
            );
            if (!seguir) return false;
        }

        // Las que sólo se llaman casi igual: aquí no se puede afirmar nada, así
        // que se enseñan los dos nombres y decide el que mira. No se ofrece unir
        // ni borrar: si son la misma, se hace a mano.
        const seParecen = parecidasEnLaLista.get(clientId);
        if (seParecen && seParecen.length > 0) {
            const seguir = window.confirm(
                `⚠️ En la lista hay ${seParecen.length === 1 ? 'otra solicitud que se llama' : `otras ${seParecen.length} solicitudes que se llaman`} casi igual:\n\n` +
                seParecen.map(p => `   • ${p.name}${p.city ? ` — ${p.city}` : ''}`).join('\n') +
                `\n\nPuede ser la misma empresa escrita de otra forma, o pueden ser dos de verdad.\n\n` +
                `¿Aprobar ésta?`
            );
            if (!seguir) return false;
        }

        const parecidas = duplicadosPorCliente.get(clientId);
        if (!parecidas || parecidas.length === 0) return true;

        const lista = parecidas
            .map(p => `   • ${p.client.name}${p.client.clientNumber ? ` (nº ${p.client.clientNumber})` : ''} — ${explicarMotivos(p.motivos)}${p.yaTieneAcceso ? ' — YA ENTRA EN EL PORTAL' : ''}`)
            .join('\n');

        return window.confirm(
            `⚠️ Esta empresa ya parece estar en tu cartera:\n\n${lista}\n\n` +
            `Si la apruebas tendrás DOS fichas de la misma empresa, y su portal quedará atado a esta nueva, ` +
            `que está vacía: el cliente entrará y no verá ninguno de sus envíos.\n\n` +
            `Comprueba antes que quien se ha registrado es de verdad de esa empresa: el CIF es público.\n\n` +
            `¿Aprobar de todas formas?`
        );
    };

    const [searchTerm, setSearchTerm] = useState('');
    const normalize = (val) => String(val || '')
        .toLowerCase()
        .trim()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u');

    // Origen: 'web' | 'app' | 'todos'. Se entra siempre por las fichas que crea
    // la app sola al hacer albaranes, que son las que hay que repasar a diario;
    // los registros de la web son cuatro y se miran cuando toca.
    const [origen, setOrigen] = useState('app');
    const origenActivo = origen;

    const clientesPorOrigen = origenActivo === 'web'
        ? registrosWeb
        : origenActivo === 'app'
            ? pendingClients.filter(c => !esRegistroWeb(c))
            : pendingClients;

    // Aviso activo: null | 'repetidos' | 'parecidos' | 'cartera'. Los avisos de
    // arriba dicen cuántas fichas hay que mirar, pero luego había que buscarlas
    // a mano entre las cuatrocientas y pico: pinchando uno se queda sólo eso.
    const [aviso, setAviso] = useState(null);

    // Los avisos se cuentan sobre TODOS los pendientes, así que al encender uno
    // se abre también el origen: si no, se pincharía «2 repetidos» estando en la
    // pestaña equivocada y saldría la lista vacía.
    const alternarAviso = (cual) => {
        const siguiente = aviso === cual ? null : cual;
        setAviso(siguiente);
        if (siguiente) setOrigen('todos');
    };

    const clientesPorAviso = aviso === 'repetidos'
        ? clientesPorOrigen.filter(c => gemelasPorCliente.has(c.id))
        : aviso === 'parecidos'
            ? clientesPorOrigen.filter(c => parecidasEnLaLista.has(c.id))
            : aviso === 'cartera'
                ? clientesPorOrigen.filter(c => duplicadosPorCliente.has(c.id))
                : clientesPorOrigen;

    // Filtro «Mercancía de»: la empresa que mandó el paquete (o a la que se lo
    // mandó la ficha, si es remitente). Guarda la clave normalizada, para que
    // "TSB" y "T.S.B." cuenten como la misma. '' = todas.
    const [remitenteFiltro, setRemitenteFiltro] = useState('');

    // Las opciones salen de las fichas que ya se ven con el origen y el aviso
    // elegidos, con cuántas lleva cada una: así nunca se ofrece una empresa que
    // dejaría la lista vacía.
    const opcionesRemitente = (() => {
        const cuenta = new Map();
        clientesPorAviso.forEach(c => {
            (quienMandoPorCliente.get(c.id)?.todos || []).forEach(({ clave, nombre }) => {
                const actual = cuenta.get(clave);
                if (actual) actual.total += 1;
                else cuenta.set(clave, { clave, nombre, total: 1 });
            });
        });
        return [...cuenta.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    })();

    const clientesPorRemitente = remitenteFiltro === ''
        ? clientesPorAviso
        : clientesPorAviso.filter(c =>
            (quienMandoPorCliente.get(c.id)?.todos || []).some(r => r.clave === remitenteFiltro));

    // Al cambiar de pestaña la empresa elegida puede no tener fichas en la
    // nueva; se sigue ofreciendo con un 0 para que el desplegable no se quede
    // en blanco mientras filtra por ella.
    const [nombreRemitenteFiltro, setNombreRemitenteFiltro] = useState('');
    const opcionesRemitenteVisibles = remitenteFiltro !== '' && !opcionesRemitente.some(o => o.clave === remitenteFiltro)
        ? [{ clave: remitenteFiltro, nombre: nombreRemitenteFiltro, total: 0 }, ...opcionesRemitente]
        : opcionesRemitente;
    const elegirRemitente = (clave) => {
        setRemitenteFiltro(clave);
        setNombreRemitenteFiltro(opcionesRemitente.find(o => o.clave === clave)?.nombre || '');
    };

    const filteredClients = searchTerm.trim() === ''
        ? clientesPorRemitente
        : clientesPorRemitente.filter(c => {
            const term = normalize(searchTerm);
            // También por correo, CIF y persona de contacto: es lo que se tiene
            // a mano cuando llega el aviso de un registro y se quiere buscar.
            return normalize(c.name).includes(term)
                || normalize(c.city).includes(term)
                || normalize(c.phone).includes(term)
                || normalize(c.address).includes(term)
                || normalize(c.email).includes(term)
                || normalize(c.cif).includes(term)
                || normalize(c.contactPerson).includes(term);
        });

    // Selección múltiple
    const [selectedIds, setSelectedIds] = useState([]);

    // Lista compacta o tarjetas. Se guarda para no tener que elegirlo cada vez.
    const [vista, setVista] = useState(vistaGuardada);
    const cambiarVista = (v) => {
        setVista(v);
        try { localStorage.setItem('validacion-vista', v); } catch { /* sin memoria, da igual */ }
    };


    const toggleSelected = (clientId) => {
        setSelectedIds(prev => prev.includes(clientId) ? prev.filter(id => id !== clientId) : [...prev, clientId]);
    };

    const allFilteredSelected = filteredClients.length > 0 && filteredClients.every(c => selectedIds.includes(c.id));

    const toggleSelectAll = () => {
        if (allFilteredSelected) {
            const filteredIds = filteredClients.map(c => c.id);
            setSelectedIds(prev => prev.filter(id => !filteredIds.includes(id)));
        } else {
            const filteredIds = filteredClients.map(c => c.id);
            setSelectedIds(prev => [...new Set([...prev, ...filteredIds])]);
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0 || !onDeleteClients) return;
        if (!window.confirm(`¿Borrar ${selectedIds.length} cliente${selectedIds.length > 1 ? 's' : ''} pendiente${selectedIds.length > 1 ? 's' : ''} permanentemente? Esta acción no se puede deshacer.`)) return;
        await onDeleteClients(selectedIds);
        setSelectedIds([]);
    };

    // Edit modal state
    const [editingClient, setEditingClient] = useState(null);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);

    const openEditModal = (client) => {
        setEditingClient(client);
        setIsEditModalOpen(true);
    };

    const handleSaveAndApprove = async (clientData) => {
        // Se pregunta antes de guardar nada: si se cancela, la ficha pendiente
        // se queda como estaba y el modal sigue abierto para poder revisarla.
        if (editingClient && !confirmarSiEsDuplicado(editingClient.id)) return;

        if (onUpdateClient && editingClient) {
            // Update client data with everything from the full form
            // ⚠️ await is important: ensures billingType is saved before number assignment
            const { id, ...dataWithoutId } = clientData;
            await onUpdateClient(editingClient.id, dataWithoutId);
        }
        // Auto-approve after editing (billingType ya actualizado → número correcto)
        await onValidateClient(editingClient.id, true);
        const aprobado = editingClient.id;
        setEditingClient(null);
        setIsEditModalOpen(false);
        // El email de acceso, ya con el formulario cerrado y SIN esperarlo. Lo
        // manda una Edge Function que tarda lo suyo en despertar, y esperarla
        // dejaba el botón de guardar dando vueltas un par de segundos con la
        // ficha ya aprobada. Si algo falla, sendAccessEmail avisa igual.
        sendAccessEmail(aprobado);
    };

    const handleModalClose = () => {
        setIsEditModalOpen(false);
        setEditingClient(null);
    };

    const handleApprove = async (clientId) => {
        if (!confirmarSiEsDuplicado(clientId)) return;
        await onValidateClient(clientId, true);
        // El email de acceso va detrás y sin esperarlo: ver handleSaveAndApprove.
        sendAccessEmail(clientId);
    };

    const handleReject = (clientId) => {
        onValidateClient(clientId, false);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Clock className="text-amber-600" />
                        Validar Clientes
                    </h1>
                    <p className="text-slate-500 mt-1">
                        Empresas registradas en la web y fichas creadas solas al hacer albaranes
                    </p>
                </div>
                {/* Los avisos filtran: pinchar uno deja en la lista sólo esas fichas
                    y volver a pincharlo las devuelve todas. */}
                <div className="flex flex-wrap items-center gap-2">
                    {registrosWeb.length > 0 && (
                        <button
                            type="button"
                            onClick={() => { setAviso(null); setOrigen('web'); }}
                            title="Ver sólo los que se han registrado por la web"
                            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors ${aviso === null && origenActivo === 'web'
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-blue-50 border-blue-200 hover:bg-blue-100'
                                }`}
                        >
                            <Globe size={18} className={aviso === null && origenActivo === 'web' ? 'text-white' : 'text-blue-600'} />
                            <span className={`font-bold ${aviso === null && origenActivo === 'web' ? 'text-white' : 'text-blue-700'}`}>{registrosWeb.length}</span>
                            <span className={aviso === null && origenActivo === 'web' ? 'text-white' : 'text-blue-600'}>registrados en la web</span>
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={() => { setAviso(null); setOrigen('todos'); }}
                        title="Ver todos los pendientes, sin filtrar"
                        className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors ${aviso === null && origenActivo === 'todos'
                            ? 'bg-amber-600 border-amber-600 text-white'
                            : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                            }`}
                    >
                        <Clock size={18} className={aviso === null && origenActivo === 'todos' ? 'text-white' : 'text-amber-600'} />
                        <span className={`font-bold ${aviso === null && origenActivo === 'todos' ? 'text-white' : 'text-amber-700'}`}>{pendingClients.length}</span>
                        <span className={aviso === null && origenActivo === 'todos' ? 'text-white' : 'text-amber-600'}>pendientes</span>
                    </button>
                    {cuantosRepetidos > 0 && (
                        <button
                            type="button"
                            onClick={() => alternarAviso('repetidos')}
                            title={aviso === 'repetidos' ? 'Quitar el filtro y ver todos' : 'Ver sólo las fichas repetidas en la lista'}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors ${aviso === 'repetidos'
                                ? 'bg-orange-600 border-orange-600 text-white'
                                : 'bg-orange-50 border-orange-200 hover:bg-orange-100'
                                }`}
                        >
                            <Copy size={18} className={aviso === 'repetidos' ? 'text-white' : 'text-orange-600'} />
                            <span className={`font-bold ${aviso === 'repetidos' ? 'text-white' : 'text-orange-700'}`}>{cuantosRepetidos}</span>
                            <span className={aviso === 'repetidos' ? 'text-white' : 'text-orange-600'}>repetidos en la lista</span>
                            {aviso === 'repetidos' && <X size={15} className="text-white/80" />}
                        </button>
                    )}
                    {cuantosParecidos > 0 && (
                        <button
                            type="button"
                            onClick={() => alternarAviso('parecidos')}
                            title={aviso === 'parecidos' ? 'Quitar el filtro y ver todos' : 'Ver sólo las fichas con un nombre parecido a otra'}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors ${aviso === 'parecidos'
                                ? 'bg-amber-600 border-amber-600 text-white'
                                : 'bg-amber-50 border-amber-200 hover:bg-amber-100'
                                }`}
                        >
                            <Copy size={18} className={aviso === 'parecidos' ? 'text-white' : 'text-amber-600'} />
                            <span className={`font-bold ${aviso === 'parecidos' ? 'text-white' : 'text-amber-700'}`}>{cuantosParecidos}</span>
                            <span className={aviso === 'parecidos' ? 'text-white' : 'text-amber-600'}>con nombre parecido</span>
                            {aviso === 'parecidos' && <X size={15} className="text-white/80" />}
                        </button>
                    )}
                    {duplicadosPorCliente.size > 0 && (
                        <button
                            type="button"
                            onClick={() => alternarAviso('cartera')}
                            title={aviso === 'cartera' ? 'Quitar el filtro y ver todos' : 'Ver sólo las que ya parecen estar en la cartera'}
                            className={`flex items-center gap-2 px-4 py-2 border rounded-xl transition-colors ${aviso === 'cartera'
                                ? 'bg-red-600 border-red-600 text-white'
                                : 'bg-red-50 border-red-200 hover:bg-red-100'
                                }`}
                        >
                            <AlertTriangle size={18} className={aviso === 'cartera' ? 'text-white' : 'text-red-600'} />
                            <span className={`font-bold ${aviso === 'cartera' ? 'text-white' : 'text-red-700'}`}>{duplicadosPorCliente.size}</span>
                            <span className={aviso === 'cartera' ? 'text-white' : 'text-red-600'}>ya en cartera</span>
                            {aviso === 'cartera' && <X size={15} className="text-white/80" />}
                        </button>
                    )}
                </div>
            </div>

            {/* Filtro por origen — separar quién se ha registrado de lo que crea la app sola */}
            {pendingClients.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        { clave: 'app', texto: 'Creados al hacer albaranes', cuantos: pendingClients.length - registrosWeb.length, icono: <Building2 size={15} /> },
                        { clave: 'web', texto: 'Registrados en la web', cuantos: registrosWeb.length, icono: <Globe size={15} /> },
                        { clave: 'todos', texto: 'Todos', cuantos: pendingClients.length, icono: <Clock size={15} /> },
                    ].map(({ clave, texto, cuantos, icono }) => (
                        <button
                            key={clave}
                            onClick={() => { setOrigen(clave); setAviso(null); }}
                            className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-bold border transition-colors ${origenActivo === clave
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                }`}
                        >
                            {icono}
                            {texto}
                            <span className={`px-1.5 rounded-full text-xs ${origenActivo === clave ? 'bg-white/20' : 'bg-slate-100 text-slate-500'}`}>
                                {cuantos}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            {/* Qué se está viendo cuando hay un aviso encendido. Los avisos cuentan
                grupos (dos fichas repetidas son UN repetido), así que a la vista
                salen más fichas que el número del aviso y hay que decirlo. */}
            {aviso && (
                <div className="flex items-center justify-between gap-3 px-4 py-2 bg-slate-800 text-white rounded-xl text-sm">
                    <span>
                        Viendo <strong>{clientesPorAviso.length}</strong> ficha{clientesPorAviso.length === 1 ? '' : 's'}
                        {aviso === 'repetidos' && (clientesPorAviso.length === 1 ? ' repetida en la lista' : ' repetidas en la lista')}
                        {aviso === 'parecidos' && ' con un nombre parecido a otra'}
                        {aviso === 'cartera' && (clientesPorAviso.length === 1 ? ' que ya parece estar en la cartera' : ' que ya parecen estar en la cartera')}
                        .
                    </span>
                    <button
                        type="button"
                        onClick={() => setAviso(null)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-bold transition-colors"
                    >
                        <X size={14} />
                        Ver todas
                    </button>
                </div>
            )}

            {/* Search + Selección masiva */}
            {pendingClients.length > 0 && (
                <div className="flex flex-col md:flex-row md:items-center gap-3">
                    <div className="relative max-w-md flex-1">
                        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar por nombre, correo, CIF, ciudad o teléfono..."
                            className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                        />
                    </div>
                    {opcionesRemitenteVisibles.length > 0 && (
                        <div className="flex items-center gap-1.5 min-w-0 md:max-w-xs">
                            <div className="relative min-w-0 flex-1">
                                <Truck size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
                                <select
                                    value={remitenteFiltro}
                                    onChange={(e) => elegirRemitente(e.target.value)}
                                    title="Enseñar sólo las fichas cuya mercancía mandó esta empresa"
                                    aria-label="Filtrar por quién mandó la mercancía"
                                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm truncate focus:outline-none focus:ring-2 focus:ring-indigo-400 ${remitenteFiltro
                                        ? 'border-indigo-300 bg-indigo-50 text-indigo-700 font-bold'
                                        : 'border-slate-200 bg-white text-slate-600'
                                        }`}
                                >
                                    <option value="">Mercancía de cualquiera</option>
                                    {opcionesRemitenteVisibles.map(o => (
                                        <option key={o.clave} value={o.clave}>{o.nombre} ({o.total})</option>
                                    ))}
                                </select>
                            </div>
                            {remitenteFiltro && (
                                <button
                                    type="button"
                                    onClick={() => elegirRemitente('')}
                                    title="Quitar el filtro de mercancía"
                                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    )}
                    <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl self-start md:self-auto">
                        {[
                            { clave: 'lista', texto: 'Lista', icono: <List size={15} /> },
                            { clave: 'tarjetas', texto: 'Tarjetas', icono: <LayoutGrid size={15} /> },
                        ].map(({ clave, texto, icono }) => (
                            <button
                                key={clave}
                                type="button"
                                onClick={() => cambiarVista(clave)}
                                title={`Ver como ${texto.toLowerCase()}`}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${vista === clave
                                    ? 'bg-white text-slate-800 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                {icono}
                                {texto}
                            </button>
                        ))}
                    </div>
                    {filteredClients.length > 0 && (
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-sm font-medium text-slate-600 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={allFilteredSelected}
                                    onChange={toggleSelectAll}
                                    className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                                />
                                Seleccionar todos
                            </label>
                            {selectedIds.length > 0 && (
                                <button
                                    onClick={handleDeleteSelected}
                                    className="flex items-center gap-2 px-3 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-sm transition-colors"
                                >
                                    <Trash2 size={16} />
                                    Borrar ({selectedIds.length})
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Pendientes — en lista compacta o en tarjetas */}
            {filteredClients.length > 0 && vista === 'lista' ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
                    {filteredClients.map(client => {
                        const web = esRegistroWeb(client);
                        const gemelas = gemelasPorCliente.get(client.id);
                        const parecidas = duplicadosPorCliente.get(client.id);
                        const casiIgual = parecidasEnLaLista.get(client.id);
                        const seleccionado = selectedIds.includes(client.id);
                        const dato = 'flex items-center gap-1 min-w-0';
                        return (
                            <div key={client.id} className={seleccionado ? 'bg-amber-50/60' : ''}>
                                <div className="flex items-start gap-2 md:gap-3 px-3 py-2">
                                    <input
                                        type="checkbox"
                                        checked={seleccionado}
                                        onChange={() => toggleSelected(client.id)}
                                        className="w-4 h-4 mt-1 rounded border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0"
                                    />
                                    <div className={`p-1.5 rounded-lg shrink-0 ${web ? 'bg-blue-100' : 'bg-amber-100'}`}>
                                        {web
                                            ? <Globe size={14} className="text-blue-600" />
                                            : <Building2 size={14} className="text-amber-600" />}
                                    </div>

                                    {/* Todo lo de la ficha, en tres líneas */}
                                    <div className="flex-1 min-w-0 space-y-0.5">
                                        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                                            <span className="font-bold text-slate-800 text-sm break-words" title={client.name}>{client.name}</span>
                                            {client.clientNumber && (
                                                <span className="text-[10px] font-mono text-slate-500 shrink-0">Nº {client.clientNumber}</span>
                                            )}
                                            <ChapaTipo client={client} className="sm:hidden" />
                                            {web && (
                                                <span className="flex items-center gap-1 text-[11px] font-bold text-blue-700 shrink-0">
                                                    <Globe size={11} /> Se ha registrado en la web
                                                </span>
                                            )}
                                            {client.legalName && client.legalName !== client.name && (
                                                <span className="text-xs text-slate-500 break-words">({client.legalName})</span>
                                            )}
                                        </div>

                                        {/* Dónde está y cómo contactar */}
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-600">
                                            {client.address && (
                                                <span className={dato}><MapPin size={12} className="text-slate-400 shrink-0" /><span className="break-words">{client.address}</span></span>
                                            )}
                                            {client.city && (
                                                <span className={dato}><Tag size={12} className="text-slate-400 shrink-0" />{client.city}{client.zip ? ` (${client.zip})` : ''}</span>
                                            )}
                                            {client.phone && (
                                                <span className={dato}><Phone size={12} className="text-slate-400 shrink-0" />{client.phone}</span>
                                            )}
                                            {client.email && (
                                                <a href={`mailto:${correosDeFicha(client.email).join(",") || client.email}`} className={`${dato} text-blue-700 hover:underline`} title={client.email}>
                                                    <Mail size={12} className="text-blue-400 shrink-0" /><span className="truncate">{client.email}</span>
                                                </a>
                                            )}
                                            {client.cif && (
                                                <span className={`${dato} font-mono`}><Tag size={12} className="text-blue-400 shrink-0" />{client.cif}</span>
                                            )}
                                            {client.contactPerson && (
                                                <span className={dato} title={client.contactPerson}><User size={12} className="text-blue-400 shrink-0" /><span className="truncate">{client.contactPerson}</span></span>
                                            )}
                                            {client.coordinates && (
                                                <a
                                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(String(client.coordinates).trim())}`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="Ver ubicación en Google Maps"
                                                    className={`${dato} text-emerald-600 hover:text-emerald-700 hover:underline font-mono`}
                                                >
                                                    <MapPin size={12} className="text-emerald-500 shrink-0" />{client.coordinates}
                                                </a>
                                            )}
                                        </div>

                                        {/* De quién venía el paquete que creó la ficha */}
                                        {quienMandoPorCliente.has(client.id) && (
                                            <div className="text-xs">
                                                <LineaQuienMando mando={quienMandoPorCliente.get(client.id)} />
                                            </div>
                                        )}

                                        {/* De dónde salió, quién la hizo y de quién es */}
                                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-400">
                                            <span className={`${dato} font-bold ${client.ownerAgencyId ? 'text-amber-600' : 'text-emerald-600'}`}>
                                                <Building2 size={12} className="shrink-0" />
                                                {client.ownerAgencyId ? getOwnerLabel(client, clients) : 'Mis clientes'}
                                            </span>
                                            <span className={dato}><Calendar size={12} className="shrink-0" />Creado: {web ? cuandoSeRegistro(client) : client.lastInteraction}</span>
                                            {client.createdFrom && (
                                                <span className={dato}><Tag size={12} className="shrink-0" />Desde: {web ? 'formulario de la web' : client.createdFrom}</span>
                                            )}
                                            {client.createdBy && (
                                                <span className={dato}><User size={12} className="shrink-0" />Por: {client.createdBy}</span>
                                            )}
                                        </div>
                                    </div>

                                    <ChapaTipo client={client} className="hidden sm:inline-block w-24 text-center mt-0.5" />

                                    {/* Acciones */}
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => openEditModal(client)}
                                            title="Editar y Validar"
                                            aria-label="Editar y Validar"
                                            className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white transition-colors"
                                        >
                                            <Edit size={15} />
                                        </button>
                                        <button
                                            onClick={() => handleApprove(client.id)}
                                            title="Aprobar"
                                            aria-label="Aprobar"
                                            className="p-2 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors"
                                        >
                                            <CheckCircle size={15} />
                                        </button>
                                        <button
                                            onClick={() => handleReject(client.id)}
                                            title="Rechazar"
                                            aria-label="Rechazar"
                                            className="p-2 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
                                        >
                                            <XCircle size={15} />
                                        </button>
                                    </div>
                                </div>

                                {/* Avisos, siempre a la vista: son lo que decide qué hacer con la ficha */}
                                {(gemelas || parecidas || casiIgual) && (
                                    <div className="px-3 pb-2 sm:pl-12 grid grid-cols-1 md:grid-cols-2 gap-2">
                                        {gemelas && (
                                            <AvisoRepetida
                                                client={client}
                                                gemelas={gemelas}
                                                uniendo={uniendoId === client.id}
                                                onUnir={handleUnirGemelas}
                                            />
                                        )}
                                        {casiIgual && <AvisoParecida parecidas={casiIgual} />}
                                        {parecidas && (
                                            <AvisoDuplicado
                                                client={client}
                                                parecidas={parecidas}
                                                dandoAcceso={dandoAccesoId === client.id}
                                                onDarAcceso={handleDarAcceso}
                                            />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : filteredClients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredClients.map(client => (
                        <div key={client.id} className={`bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition-shadow ${selectedIds.includes(client.id) ? 'border-amber-400 ring-2 ring-amber-200' : 'border-slate-100'}`}>
                            {/* Header — azul si la empresa se ha registrado ella en la web */}
                            <div className={`px-4 py-3 border-b flex items-center justify-between ${esRegistroWeb(client) ? 'bg-blue-50 border-blue-100' : 'bg-amber-50 border-amber-100'}`}>
                                <div className="flex items-center gap-2 min-w-0">
                                    <input
                                        type="checkbox"
                                        checked={selectedIds.includes(client.id)}
                                        onChange={() => toggleSelected(client.id)}
                                        className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0"
                                    />
                                    <div className={`p-2 rounded-lg shrink-0 ${esRegistroWeb(client) ? 'bg-blue-100' : 'bg-amber-100'}`}>
                                        {esRegistroWeb(client)
                                            ? <Globe size={16} className="text-blue-600" />
                                            : <Building2 size={16} className="text-amber-600" />}
                                    </div>
                                    <div className="min-w-0">
                                        <span className="block font-bold text-slate-800 truncate max-w-[150px]" title={client.name}>
                                            {client.name}
                                        </span>
                                        {/* El número, que estas fichas ya lo tienen cogido aunque no salgan
                                            en el listado de Clientes. Sin verlo aquí no hay manera de saber
                                            cuál es la que bloquea un Nº al dar de alta a mano. */}
                                        {client.clientNumber && (
                                            <span className="block text-[10px] font-mono text-slate-500">Nº {client.clientNumber}</span>
                                        )}
                                    </div>
                                </div>
                                <ChapaTipo client={client} />
                            </div>

                            {/* Quién se ha registrado — sólo en los altas de la web */}
                            {esRegistroWeb(client) && <BloqueRegistroWeb client={client} enTarjeta />}

                            {gemelasPorCliente.has(client.id) && (
                                <AvisoRepetida
                                    client={client}
                                    gemelas={gemelasPorCliente.get(client.id)}
                                    uniendo={uniendoId === client.id}
                                    onUnir={handleUnirGemelas}
                                    enTarjeta
                                />
                            )}

                            {parecidasEnLaLista.has(client.id) && (
                                <AvisoParecida parecidas={parecidasEnLaLista.get(client.id)} enTarjeta />
                            )}

                            {duplicadosPorCliente.has(client.id) && (
                                <AvisoDuplicado
                                    client={client}
                                    parecidas={duplicadosPorCliente.get(client.id)}
                                    dandoAcceso={dandoAccesoId === client.id}
                                    onDarAcceso={handleDarAcceso}
                                    enTarjeta
                                />
                            )}

                            <DatosFicha client={client} clients={clients} mando={quienMandoPorCliente.get(client.id)} />

                            {/* Actions */}
                            <div className="px-4 pb-4 space-y-2">
                                <button
                                    onClick={() => openEditModal(client)}
                                    className="w-full flex items-center justify-center gap-2 py-2 bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-lg transition-colors"
                                >
                                    <Edit size={16} />
                                    Editar y Validar
                                </button>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => handleApprove(client.id)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 font-bold rounded-lg transition-colors text-sm"
                                    >
                                        <CheckCircle size={14} />
                                        Aprobar
                                    </button>
                                    <button
                                        onClick={() => handleReject(client.id)}
                                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-lg transition-colors text-sm"
                                    >
                                        <XCircle size={14} />
                                        Rechazar
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : pendingClients.length > 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Search size={32} className="text-slate-400" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">Sin resultados</h3>
                    <p className="text-slate-500">
                        {remitenteFiltro
                            ? `Ninguna ficha de esta pestaña lleva mercancía de ${nombreRemitenteFiltro || 'esa empresa'}${searchTerm.trim() !== '' ? ` y coincide con "${searchTerm}"` : ''}. Quita el filtro de «Mercancía de» para verlas todas.`
                            : aviso
                            ? `Ninguna ficha de ese aviso queda a la vista${searchTerm.trim() !== '' ? ` buscando "${searchTerm}"` : ' en esta pestaña'}. Vuelve a pinchar el aviso para quitar el filtro.`
                            : searchTerm.trim() !== ''
                            ? `Ningún cliente pendiente${origenActivo === 'web' ? ' registrado en la web' : ''} coincide con "${searchTerm}".`
                            : origenActivo === 'web'
                                ? 'Nadie se ha registrado por la web todavía. En «Todos» tienes las fichas que crea la app sola al hacer albaranes.'
                                : origenActivo === 'app' && registrosWeb.length > 0
                                    ? `No hay fichas pendientes creadas al hacer albaranes. En «Registrados en la web» esperan ${registrosWeb.length}.`
                                    : 'No hay fichas pendientes creadas al hacer albaranes.'}
                    </p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-12 text-center">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-emerald-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-800 mb-2">¡Todo validado!</h3>
                    <p className="text-slate-500">No hay clientes pendientes de aprobación.</p>
                </div>
            )}

            {/* Full Edit Modal — Same as Create Client */}
            <CreateClientModal
                isOpen={isEditModalOpen}
                onClose={handleModalClose}
                onSave={handleSaveAndApprove}
                articles={articles}
                tariffs={tariffs}
                allPoblaciones={allPoblaciones}
                initialData={editingClient}
                allClients={clients}
            />
        </div>
    );
}

