import { useState, useMemo } from 'react';
import { CheckCircle, XCircle, Clock, MapPin, Phone, Building2, Tag, User, Calendar, Edit, Mail, Search, Trash2, AlertTriangle, KeyRound, Globe, Merge, Copy } from 'lucide-react';
import CreateClientModal from '../components/clients/CreateClientModal';
import { supabase } from '../lib/supabase';
import { getOwnerLabel } from '../utils/agencyOwnership';
import { buscarFichasParecidas, explicarMotivos, buscarSolicitudesGemelas, loQueAportanLasGemelas, explicarAportacion } from '../utils/duplicadosClientes';
import { esRegistroWeb } from '../utils/altaClientes';

// ── Llama a la Edge Function para enviar email de acceso al cliente ──
async function sendAccessEmail(clientId) {
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
            body: JSON.stringify({ clientId }),
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

export default function ClientValidation({ clients, onValidateClient, onUpdateClient, onDeleteClients, articles, tariffs, allPoblaciones }) {
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

    const filteredClients = searchTerm.trim() === ''
        ? clientesPorOrigen
        : clientesPorOrigen.filter(c => {
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
        // Enviar email automático de confirmación de acceso
        await sendAccessEmail(editingClient.id);
        setEditingClient(null);
        setIsEditModalOpen(false);
    };

    const handleModalClose = () => {
        setIsEditModalOpen(false);
        setEditingClient(null);
    };

    const handleApprove = async (clientId) => {
        if (!confirmarSiEsDuplicado(clientId)) return;
        await onValidateClient(clientId, true);
        // Enviar email automático de confirmación de acceso
        await sendAccessEmail(clientId);
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
                <div className="flex items-center gap-2">
                    {registrosWeb.length > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border border-blue-200 rounded-xl">
                            <Globe size={18} className="text-blue-600" />
                            <span className="font-bold text-blue-700">{registrosWeb.length}</span>
                            <span className="text-blue-600">registrados en la web</span>
                        </div>
                    )}
                    <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-xl">
                        <Clock size={18} className="text-amber-600" />
                        <span className="font-bold text-amber-700">{pendingClients.length}</span>
                        <span className="text-amber-600">pendientes</span>
                    </div>
                    {cuantosRepetidos > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-200 rounded-xl">
                            <Copy size={18} className="text-orange-600" />
                            <span className="font-bold text-orange-700">{cuantosRepetidos}</span>
                            <span className="text-orange-600">repetidos en la lista</span>
                        </div>
                    )}
                    {duplicadosPorCliente.size > 0 && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-xl">
                            <AlertTriangle size={18} className="text-red-600" />
                            <span className="font-bold text-red-700">{duplicadosPorCliente.size}</span>
                            <span className="text-red-600">ya en cartera</span>
                        </div>
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
                            onClick={() => setOrigen(clave)}
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

            {/* Pending Clients Grid */}
            {filteredClients.length > 0 ? (
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
                                <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${client.type === 'Remitente'
                                        ? 'bg-blue-100 text-blue-700'
                                        : 'bg-purple-100 text-purple-700'
                                    }`}>
                                    {client.type}
                                </span>
                            </div>

                            {/* Quién se ha registrado — sólo en los altas de la web */}
                            {esRegistroWeb(client) && (
                                <div className="bg-blue-50/60 border-b border-blue-100 px-4 py-3 space-y-1.5">
                                    <div className="flex items-center gap-2">
                                        <Globe size={13} className="text-blue-600 shrink-0" />
                                        <span className="text-xs font-bold text-blue-800">Se ha registrado en la web</span>
                                    </div>
                                    {client.email && (
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Mail size={13} className="text-blue-400 shrink-0" />
                                            <a href={`mailto:${client.email}`} className="text-xs text-blue-700 font-medium truncate hover:underline" title={client.email}>
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
                            )}

                            {/* Aviso de repetida — la misma empresa, varias veces en esta lista */}
                            {gemelasPorCliente.has(client.id) && (() => {
                                const gemelas = gemelasPorCliente.get(client.id);
                                const aportado = loQueAportanLasGemelas(client, gemelas);
                                const detalle = explicarAportacion(aportado);
                                return (
                                    <div className="bg-orange-50 border-b border-orange-200 px-4 py-3">
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
                                                    onClick={() => handleUnirGemelas(client)}
                                                    disabled={uniendoId === client.id}
                                                    className="mt-2 w-full flex items-center justify-center gap-2 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold rounded-lg text-xs transition-colors"
                                                >
                                                    <Merge size={13} />
                                                    {uniendoId === client.id ? 'Uniendo…' : 'Quedarme con ésta y unir las demás'}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Aviso de duplicado — la empresa ya está en cartera */}
                            {duplicadosPorCliente.has(client.id) && (
                                <div className="bg-red-50 border-b border-red-200 px-4 py-3">
                                    <div className="flex items-start gap-2">
                                        <AlertTriangle size={15} className="text-red-600 mt-0.5 shrink-0" />
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-red-800">Ya parece estar en tu cartera</p>
                                            <ul className="mt-1 space-y-1">
                                                {duplicadosPorCliente.get(client.id).map(({ client: ficha, motivos, yaTieneAcceso }) => (
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
                                                    </li>
                                                ))}
                                            </ul>
                                            <p className="text-[10px] text-red-600 mt-1.5 leading-snug">
                                                Aprobarla crea una segunda ficha, y el cliente entrará a la nueva —vacía—, no a la suya.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Body */}
                            <div className="p-4 space-y-3 text-sm">
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
                        {searchTerm.trim() !== ''
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

