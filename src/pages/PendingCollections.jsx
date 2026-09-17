import React, { useState, useMemo } from 'react';
import { Wallet, Filter, Search, User, Calendar, Truck, Euro, AlertTriangle, CheckCircle, ArrowRight, Pencil, X, FileText, ChevronUp, ChevronDown, Plus, Camera } from 'lucide-react';
import ShipmentDetailsModal from '../components/shipments/ShipmentDetailsModal';
import NuevaDeudaModal from '../components/shipments/NuevaDeudaModal';
import { utils, writeFile } from 'xlsx';
import { lineasDeCobro, needsDriverAfterCollecting } from '../utils/pendingCollections';
import { coincideBusqueda } from '../utils/busqueda';

// Valor del desplegable para ver el dinero que no lleva nadie.
const SIN_REPARTIDOR = 'unassigned';
const sinRepartidor = (v) => v === null || v === undefined || v === '';

export default function PendingCollections({ shipments, drivers, clients, onAssignDriver, onReassignCollection, onReassignCollections, onUpdateShipment, onCreateShipment, articles = [], driverNamePreference = 'both', isGhostModeUnlocked = true }) {
    const getDriverDisplayName = (driver) => {
        if (!driver) return '';
        const name = driver.name || '';
        const alias = driver.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };
    // Quién lleva ahora mismo el cobro de esta fila. Las líneas de deuda ya tienen
    // aplicado el traspaso manual, así que basta con mirar la primera.
    const cobroActual = (item) => item?.collectionTypes?.[0]?.responsibleDriverId ?? '';

    const [filterType, setFilterType] = useState('all'); // 'all', 'shipping_fee', 'reimbursement'
    const [filterDriver, setFilterDriver] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [tempDriverId, setTempDriverId] = useState('');
    // Repartidor elegido en la barra "Pasar todos los cobros de X a…".
    const [bulkDriverId, setBulkDriverId] = useState('');
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    // Albarán que acaba de quedar cobrado y todavía no lo lleva nadie.
    const [assignPrompt, setAssignPrompt] = useState(null);
    const [promptDriverId, setPromptDriverId] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });
    // Ventana "Añadir deuda": apuntar a un cliente dinero que no viene de ningún albarán.
    const [nuevaDeudaAbierta, setNuevaDeudaAbierta] = useState(false);

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const SortIcon = ({ column }) => {
        if (sortConfig.key !== column) return <div className="w-4 h-4 opacity-10 group-hover:opacity-30"><ChevronUp size={14} /></div>;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="text-indigo-600" /> : <ChevronDown size={14} className="text-indigo-600" />;
    };


    const startEditing = (itemId, currentDriverId) => {
        setEditingId(itemId);
        setTempDriverId(currentDriverId || '');
    };

    const cancelEditing = () => {
        setEditingId(null);
        setTempDriverId('');
    };

    // Traspasar el cobro, no el reparto. Se guarda a quién le toca cobrarlo y se
    // deja en paz el estado del albarán: uno ya entregado tiene que seguir aquí,
    // en los cobros pendientes del compañero, no volver a su lista de entregas.
    const saveDriver = (itemId) => {
        if (onReassignCollection) {
            onReassignCollection(itemId, tempDriverId);
        }
        setEditingId(null);
        setTempDriverId('');
    };

    // Las líneas de deuda salen de lineasDeCobro, la MISMA regla que usa el
    // repartidor en la pestaña Cobros de su móvil. Esta lista es, por
    // construcción, la suma de las pestañas de todos los repartidores.
    const pendingItems = useMemo(() => {
        if (!Array.isArray(shipments)) return [];
        return shipments
            .map(s => ({ ...s, collectionTypes: lineasDeCobro(s, clients) }))
            .filter(item => item.collectionTypes.length > 0);
    }, [shipments, clients]);

    const idsConFicha = useMemo(
        () => new Set((Array.isArray(drivers) ? drivers : []).map(d => String(d.id))),
        [drivers]
    );

    // ── Los filtros recortan las LÍNEAS, no sólo las filas ───────────────────
    // Un mismo albarán puede tener dos deudas de dueños distintos: el porte
    // pagado en origen lo cobra quien lo dio de alta y el reembolso quien lo
    // entrega. Antes bastaba con que UNA de sus líneas fuera del repartidor
    // filtrado para que pasara el albarán entero, y el total sumaba las dos: el
    // mismo albarán se contaba completo en el filtro de cada uno de los dos, así
    // que la suma de los repartidores no cuadraba con el total de «Todos».
    // Un cobro «de nadie» no es sólo el que no tiene repartidor: también el que
    // va a nombre de un id que no está en la lista de repartidores. Pasa con los
    // albaranes dados de alta desde el portal del cliente (se graba el id del
    // cliente, no el de un repartidor) y con los repartidores borrados. En la
    // columna Repartidor ya salen como «Sin Asignar»; si no cayeran también en
    // este filtro, su dinero contaría en «Todos» y en el de nadie.
    const cobroDeNadie = (t) => sinRepartidor(t.responsibleDriverId)
        || !idsConFicha.has(String(t.responsibleDriverId));

    const lineaVisible = (t) => {
        if (filterType === 'shipping_fee' && !t.type.startsWith('Portes')) return false;
        if (filterType === 'reimbursement' && t.type !== 'Reembolso') return false;
        if (filterDriver === SIN_REPARTIDOR) return cobroDeNadie(t);
        if (filterDriver !== 'all') return String(t.responsibleDriverId) === String(filterDriver);
        return true;
    };

    const filteredItems = pendingItems
        .map(item => ({ ...item, collectionTypes: item.collectionTypes.filter(lineaVisible) }))
        .filter(item => item.collectionTypes.length > 0)
        // Búsqueda: remitente y destinatario a la vez, sin depender de quién paga
        .filter(item => coincideBusqueda(item, searchTerm));

    // Quién sale en el desplegable de repartidores. Un repartidor dado de baja
    // que todavía tenga dinero por cobrar tiene que poder elegirse, y los cobros
    // que no lleva nadie tienen su propia opción: si no, ese dinero cuenta en el
    // total de «Todos» y no aparece en el filtro de nadie.
    const { opcionesDeRepartidor, hayCobrosSinRepartidor } = useMemo(() => {
        const conCobro = new Set();
        let huerfanos = false;
        pendingItems.forEach(item => item.collectionTypes.forEach(t => {
            if (cobroDeNadie(t)) huerfanos = true;
            else conCobro.add(String(t.responsibleDriverId));
        }));
        return {
            opcionesDeRepartidor: (Array.isArray(drivers) ? drivers : [])
                .filter(d => d.isActive !== false || conCobro.has(String(d.id))),
            hayCobrosSinRepartidor: huerfanos
        };
    }, [pendingItems, drivers, idsConFicha]);

    const sortedItems = useMemo(() => {
        let result = [...filteredItems];
        if (sortConfig.key) {
            result.sort((a, b) => {
                let aVal = a[sortConfig.key];
                let bVal = b[sortConfig.key];

                if (sortConfig.key === 'amount') {
                    // Las líneas que no tocan ya vienen quitadas por los filtros.
                    const getSum = (item) => item.collectionTypes.reduce((s, t) => s + t.amount, 0);
                    return sortConfig.direction === 'asc' ? getSum(a) - getSum(b) : getSum(b) - getSum(a);
                }

                if (sortConfig.key === 'date') {
                    return sortConfig.direction === 'asc' 
                        ? new Date(aVal) - new Date(bVal)
                        : new Date(bVal) - new Date(aVal);
                }

                const sA = String(aVal || '').toLowerCase();
                const sB = String(bVal || '').toLowerCase();
                if (sA < sB) return sortConfig.direction === 'asc' ? -1 : 1;
                if (sA > sB) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [filteredItems, sortConfig, filterType]);


    // El total es exactamente la suma de lo que se ve: con el filtro puesto en un
    // repartidor, sólo su dinero. Así la suma de todos los repartidores (más los
    // cobros sin repartidor) cuadra con el total de «Todos».
    const totalPending = filteredItems.reduce(
        (sum, item) => sum + item.collectionTypes.reduce((subSum, t) => subSum + t.amount, 0),
        0
    );

    // ── Cambio de transportista en una zona ─────────────────────────────────
    // Con el filtro puesto en un repartidor, todos los cobros que se ven pasan
    // de golpe a otro. Es el mismo traspaso que "Pasar cobro" fila a fila: sólo
    // cambia quién cobra, ni el estado ni el reparto. Al terminar, el filtro
    // salta al repartidor que los recibe, para ver que han llegado.
    const repartidorFiltrado = Array.isArray(drivers) ? drivers.find(d => String(d.id) === String(filterDriver)) : null;
    const nombreDelFiltro = filterDriver === SIN_REPARTIDOR
        ? 'los cobros sin repartidor'
        : (getDriverDisplayName(repartidorFiltrado) || 'este repartidor');
    const pasarTodosLosCobros = () => {
        if (!bulkDriverId || filteredItems.length === 0) return;
        const destino = Array.isArray(drivers) ? drivers.find(d => String(d.id) === String(bulkDriverId)) : null;
        const aviso = '¿Pasar los ' + filteredItems.length + ' cobros de ' + nombreDelFiltro
            + ' a ' + getDriverDisplayName(destino) + '?\n\n'
            + 'Sólo cambia quién los cobra. El reparto y el estado de los albaranes no se tocan.';
        if (!window.confirm(aviso)) return;
        const ids = filteredItems.map(item => item.id);
        if (onReassignCollections) {
            onReassignCollections(ids, bulkDriverId);
        } else if (onReassignCollection) {
            ids.forEach(id => onReassignCollection(id, bulkDriverId));
        }
        setFilterDriver(String(bulkDriverId));
        setBulkDriverId('');
    };

    const handleExportToExcel = () => {
        if (filteredItems.length === 0) {
            alert("No hay datos para exportar.");
            return;
        }

        const data = filteredItems.flatMap(item => {
            return item.collectionTypes.map(t => {
                const driver = Array.isArray(drivers) ? drivers.find(d => String(d.id) === String(t.responsibleDriverId)) : null;
                return {
                    'ID Envío': item.id,
                    'Fecha': item.date,
                    'Remitente': item.client,
                    'Destinatario': item.destinationName || 'N/A',
                    'Pagador': t.payerName,
                    'Concepto': item.type === 'Recibo' ? `Recibo: ${item.observations || ''}` : t.type,
                    'Importe': typeof t.amountDisplay !== 'undefined' ? t.amountDisplay : t.amount,
                    'Conductor': driver ? getDriverDisplayName(driver) : 'Sin Asignar',
                    'Estado Envío': item.status
                };
            });
        });

        const ws = utils.json_to_sheet(data);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Cobros Pendientes");
        writeFile(wb, `Cobros_Pendientes_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // ── Cobrar no es entregar ────────────────────────────────────────────────
    // Al marcar el porte como cobrado el albarán deja de ser un cobro pendiente
    // y su fila desaparece de esta pantalla. Si además todavía no tiene
    // repartidor, se perdía de vista justo cuando faltaba lo más importante:
    // que alguien lo entregue (seguía en Envíos › Pendiente de asignar, pero
    // aquí ya no había manera de asignarlo). Antes de que la fila se vaya, se
    // pregunta a quién se le da.
    const handleDetailsUpdate = async (idOrObject, maybeUpdates) => {
        const isObjectCall = typeof idOrObject === 'object' && !maybeUpdates;
        const id = isObjectCall ? idOrObject.id : idOrObject;
        const updates = isObjectCall ? idOrObject : (maybeUpdates || {});
        const before = (Array.isArray(shipments) ? shipments : []).find(s => s.id === id);

        const result = onUpdateShipment ? await onUpdateShipment(idOrObject, maybeUpdates) : undefined;

        if (before) {
            const after = { ...before, ...updates };
            if (needsDriverAfterCollecting(before, after, clients)) {
                setPromptDriverId('');
                setAssignPrompt(after);
            }
        }

        return result;
    };

    const confirmAssignPrompt = () => {
        if (assignPrompt && promptDriverId && onAssignDriver) {
            onAssignDriver(assignPrompt.id, promptDriverId);
        }
        setAssignPrompt(null);
        setPromptDriverId('');
    };

    const dismissAssignPrompt = () => {
        setAssignPrompt(null);
        setPromptDriverId('');
    };


    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => { setIsDetailsModalOpen(false); setSelectedShipment(null); }}
                shipment={selectedShipment}
                onUpdate={handleDetailsUpdate}
            />
            <NuevaDeudaModal
                isOpen={nuevaDeudaAbierta}
                onClose={() => setNuevaDeudaAbierta(false)}
                clients={clients}
                drivers={drivers}
                articles={articles}
                shipments={shipments}
                onCreateShipment={onCreateShipment}
                getDriverDisplayName={getDriverDisplayName}
            />

            {/* Aviso: cobrado pero sin repartidor. Se muestra al cerrar la ficha
                para no tapar el modal de detalles. */}
            {assignPrompt && !isDetailsModalOpen && (
                <div className="fixed inset-0 bg-slate-900/70 z-[110] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
                        <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                <AlertTriangle size={20} />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 leading-tight">Cobrado, pero nadie lo lleva</h3>
                                <p className="text-sm text-slate-500 mt-1">
                                    El albarán <span className="font-mono font-bold text-slate-700">{assignPrompt.id}</span> ya está cobrado, así que sale de Cobros Pendientes.
                                    Todavía no tiene repartidor asignado: asígnalo ahora para que no se quede parado.
                                </p>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="assign-prompt-driver" className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Repartidor</label>
                            <select
                                id="assign-prompt-driver"
                                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                value={promptDriverId}
                                onChange={(e) => setPromptDriverId(e.target.value)}
                                autoFocus
                            >
                                <option value="">Sin asignar</option>
                                {Array.isArray(drivers) && drivers.filter(d => d.isActive !== false).map(d => (
                                    <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                                ))}
                            </select>
                        </div>

                        <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end pt-1">
                            <button
                                onClick={dismissAssignPrompt}
                                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                            >
                                Ahora no · queda en Envíos › Pendiente de asignar
                            </button>
                            <button
                                onClick={confirmAssignPrompt}
                                disabled={!promptDriverId}
                                className="px-4 py-2 rounded-lg text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                            >
                                Asignar reparto
                            </button>
                        </div>
                    </div>
                </div>
            )}
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
                        <Wallet className="text-indigo-600" />
                        Cobros Pendientes
                    </h1>
                    <p className="text-slate-500">Gestión de Porte Debido y Reembolsos en poder de repartidores</p>
                </div>

                <div className="flex gap-4">
                    {/* Con el candado del Modo Fantasma echado la oficina no ve ningún cobro
                        de Cliente Habitual, y una deuda apuntada a mano es justo eso: se
                        guardaría y desaparecería de la lista en el acto. Sin candado, no hay botón. */}
                    {onCreateShipment && isGhostModeUnlocked && (
                        <button
                            onClick={() => setNuevaDeudaAbierta(true)}
                            title="Apuntar a un cliente una deuda que no viene de ningún albarán de la app"
                            className="flex items-center gap-2 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors font-bold text-sm shadow-sm"
                        >
                            <Plus size={18} />
                            Añadir deuda
                        </button>
                    )}
                    <button
                        onClick={handleExportToExcel}
                        title="Exportar a Excel"
                        className="flex items-center justify-center p-4 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition-colors border border-emerald-200"
                    >
                        <FileText size={24} />
                    </button>
                    <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 min-w-[200px]">
                        <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-1">Total Pendiente</p>
                        <p className="text-2xl font-bold text-slate-800">€{totalPending.toFixed(2)}</p>
                    </div>
                </div>
            </header>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por cliente, destinatario, referencia..."
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="flex items-center gap-2 w-full md:w-auto">
                    <Filter size={20} className="text-slate-400" />
                    <select
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                    >
                        <option value="all">Todos los Tipos</option>
                        <option value="shipping_fee">Solo Porte (Nuevos/Diarios)</option>
                        <option value="reimbursement">Solo Reembolsos</option>
                    </select>

                    <select
                        className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        value={filterDriver}
                        onChange={(e) => setFilterDriver(e.target.value)}
                    >
                        <option value="all">Todos los Repartidores</option>
                        {opcionesDeRepartidor.map(d => (
                            <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                        ))}
                        {hayCobrosSinRepartidor && <option value={SIN_REPARTIDOR}>Sin asignar</option>}
                    </select>
                </div>
            </div>

            {/* Cambio de transportista: pasar todos los cobros del filtrado a otro */}
            {filterDriver !== 'all' && filteredItems.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-amber-900">
                        Pasar los <strong>{filteredItems.length}</strong> cobros de <strong>{nombreDelFiltro}</strong> a
                    </span>
                    <select
                        aria-label="Repartidor que se queda todos los cobros"
                        className="bg-white border border-amber-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 min-w-[180px]"
                        value={bulkDriverId}
                        onChange={(e) => setBulkDriverId(e.target.value)}
                    >
                        <option value="">Elige repartidor…</option>
                        {Array.isArray(drivers) && drivers.filter(d => d.isActive !== false && String(d.id) !== String(filterDriver)).map(d => (
                            <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                        ))}
                    </select>
                    <button
                        onClick={pasarTodosLosCobros}
                        disabled={!bulkDriverId}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold bg-amber-600 text-white hover:bg-amber-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                        title="Traspasa todos los cobros de la lista. No cambia el reparto ni el estado de los albaranes."
                    >
                        <ArrowRight size={14} />
                        Pasar todos los cobros
                    </button>
                </div>
            )}

            {/* List */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '18%' }} />
                            <col style={{ width: '14%' }} />
                            <col style={{ width: '12%' }} />
                            <col style={{ width: '26%' }} />
                            <col style={{ width: '16%' }} />
                        </colgroup>
                        <thead className="bg-slate-50 text-left">
                            <tr>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('date')}>
                                    <div className="flex items-center gap-1">
                                        Fecha / Ref
                                        <SortIcon column="date" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('client')}>
                                    <div className="flex items-center gap-1">
                                        Clientes (Rem/Des)
                                        <SortIcon column="client" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Concepto</th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('amount')}>
                                    <div className="flex items-center justify-end gap-1">
                                        Importe
                                        <SortIcon column="amount" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('assignedDriverId')}>
                                    <div className="flex items-center gap-1">
                                        Repartidor
                                        <SortIcon column="assignedDriverId" />
                                    </div>
                                </th>
                                <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider cursor-pointer group hover:bg-slate-100 transition-colors" onClick={() => requestSort('status')}>
                                    <div className="flex items-center gap-1">
                                        Estado
                                        <SortIcon column="status" />
                                    </div>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {sortedItems.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-12 text-center text-slate-400">
                                        <div className="flex flex-col items-center gap-2">
                                            <CheckCircle size={32} className="text-slate-200" />
                                            <p>No hay cobros pendientes con estos filtros.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : sortedItems.map((item) => {
                                const hasPorte = item.collectionTypes.some(t => t.type.startsWith('Portes'));
                                const hasReembolso = item.collectionTypes.some(t => t.type === 'Reembolso');

                                // Logic: Receiver pays Reimbursement always. 
                                // For Porte, it depends on porteType (Debido = Receiver, Pagado = Sender)
                                const isReceiverPayer = hasReembolso || (hasPorte && item.porteType === 'Debido');
                                const isSenderPayer = hasPorte && item.porteType !== 'Debido';
                                // Un Recibo (cierre de presupuestos o deuda apuntada a mano) no tiene
                                // destinatario: en su lugar se enseña el concepto de la deuda.
                                const esRecibo = item.type === 'Recibo';

                                return (
                                    <tr key={item.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setSelectedShipment(item); setIsDetailsModalOpen(true); }}>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col truncate">
                                                <span className="font-bold text-slate-700 text-sm truncate">{item.date}</span>
                                                <span className="text-xs text-slate-400 font-mono truncate">{item.id}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col truncate">
                                                <span
                                                    className={`truncate ${isSenderPayer ? 'font-bold text-slate-900 text-sm' : 'text-slate-500 text-[11px]'}`}
                                                    title={`Remitente: ${item.client}`}
                                                >
                                                    {isSenderPayer && <span className="mr-1 text-[10px] text-indigo-500">◆</span>}
                                                    {item.client}
                                                </span>
                                                <span
                                                    className={`truncate mt-0.5 ${isReceiverPayer ? 'font-bold text-slate-900 text-sm' : 'text-slate-500 text-[11px]'}`}
                                                    title={esRecibo ? `Concepto: ${item.observations || ''}` : `Destinatario: ${item.destinationName || 'Destinatario'}`}
                                                >
                                                    {isReceiverPayer && <span className="mr-1 text-[10px] text-amber-500">◆</span>}
                                                    {esRecibo && item.deliveryPhoto && <Camera size={10} className="inline mr-1 text-emerald-600" aria-label="Con foto del papel firmado" />}
                                                    {esRecibo ? (item.observations || 'Recibo de oficina') : (item.destinationName || 'Destinatario')}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" style={{ overflow: 'hidden' }}>
                                            <div className="flex flex-col gap-1 truncate">
                                                {item.collectionTypes.map((t, idx) => (
                                                    <span
                                                        key={idx}
                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold w-fit truncate
                                                    ${t.type === 'Reembolso' ? 'bg-purple-50 text-purple-700 border border-purple-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}
                                                    >
                                                        {t.type === 'Reembolso' ? <Euro size={12} className="shrink-0" /> : <Truck size={12} className="shrink-0" />}
                                                        <span className="truncate">{t.type === 'Reembolso' ? 'Reembolso' : (esRecibo ? 'Recibo (oficina)' : t.type)}</span>
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex flex-col items-end gap-1">
                                                {item.collectionTypes.map((t, idx) => {
                                                    const displayVal = typeof t.amountDisplay !== 'undefined' ? t.amountDisplay : t.amount;
                                                    return (
                                                        <span key={idx} className="font-bold text-slate-700 block whitespace-nowrap">
                                                            {typeof displayVal === 'number' ? `€${displayVal.toFixed(2)}` : displayVal}
                                                        </span>
                                                    );
                                                })}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                            {editingId === item.id ? (
                                                <div className="flex items-center gap-2">
                                                    <select
                                                        aria-label="Repartidor que se queda el cobro"
                                                        className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
                                                        value={tempDriverId}
                                                        onChange={(e) => setTempDriverId(e.target.value)}
                                                        autoFocus
                                                    >
                                                        <option value="">Sin Asignar</option>
                                                        {Array.isArray(drivers) && drivers.filter(d => d.isActive !== false || String(d.id) === String(cobroActual(item))).map(d => (
                                                            <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); saveDriver(item.id); }}
                                                        className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                                                        title="Guardar"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); cancelEditing(); }}
                                                        className="p-1.5 bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition-colors"
                                                        title="Cancelar"
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-2">
                                                    {item.collectionTypes.map((t, idx) => {
                                                        const driver = Array.isArray(drivers) ? drivers.find(d => String(d.id) === String(t.responsibleDriverId)) : null;
                                                        return (
                                                            <div key={idx} className="flex items-center gap-2">
                                                                <span className="text-[10px] text-slate-400 w-12 font-medium truncate shrink-0">{t.type === 'Reembolso' ? 'Reemb.' : 'Porte'}</span>
                                                                {driver ? (
                                                                    <>
                                                                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                                                                            {driver.alias && driverNamePreference === 'alias'
                                                                                ? driver.alias.substring(0, 2).toUpperCase()
                                                                                : driver.name ? driver.name.substring(0, 2).toUpperCase() : '??'}
                                                                        </div>
                                                                        <span className="text-xs text-slate-600 truncate max-w-[80px]" title={getDriverDisplayName(driver)}>
                                                                            {getDriverDisplayName(driver)}
                                                                        </span>
                                                                    </>
                                                                ) : (
                                                                    <span className="text-[10px] text-slate-400 italic">Sin Asignar</span>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                    <div className="mt-1 flex justify-start">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); startEditing(item.id, cobroActual(item)); }}
                                                            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-indigo-600 font-medium transition-colors"
                                                            title="Pasar este cobro a otro repartidor (no cambia el reparto ni el estado del albarán)"
                                                        >
                                                            <Pencil size={10} />
                                                            Pasar cobro
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                {item.status === 'Entregado' ? (
                                                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-green-100 text-green-700">
                                                        <Wallet size={12} />
                                                        Cobrado (Conductor)
                                                    </span>
                                                ) : (
                                                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${item.status === 'En reparto' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
                                                        <Truck size={12} />
                                                        {item.status === 'En reparto' ? 'En Reparto' : item.status}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
