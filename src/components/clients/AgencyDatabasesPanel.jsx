import { useMemo, useState } from 'react';
import { Building2, Truck, Home, FileSearch, Trash2, X, AlertTriangle, Check, Loader2 } from 'lucide-react';
import { getAgencies, getClientsOwnedBy, buildOwnershipReport } from '../../utils/agencyOwnership';

// Panel de separación de carteras: la de SUM y la de cada agencia (TSB/TXT/XPO).
// Trabaja siempre sobre `allClients` (la lista completa), nunca sobre la lista
// filtrada de la tabla: un recuento a medias haría creer que se borra menos de
// lo que se borra.
export default function AgencyDatabasesPanel({ allClients, shipments, ownerFilter, onChangeFilter, onAssignOwnerAgency, onDeleteAgencyDatabase }) {
    const [report, setReport] = useState(null);
    const [checkedIds, setCheckedIds] = useState(new Set());
    const [isApplying, setIsApplying] = useState(false);
    const [agencyToClose, setAgencyToClose] = useState(null);
    const [confirmText, setConfirmText] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);

    const agencies = useMemo(() => getAgencies(allClients), [allClients]);

    const buckets = useMemo(() => {
        const own = (allClients || []).filter(c => !c.ownerAgencyId).length;
        return [
            { id: 'own', label: 'Mis clientes', count: own, icon: Home },
            ...agencies.map(a => ({
                id: String(a.id),
                label: a.name || 'Agencia',
                count: getClientsOwnedBy(a.id, allClients).length,
                icon: Truck,
                agency: a,
            })),
        ];
    }, [allClients, agencies]);

    const openReport = () => {
        const result = buildOwnershipReport(allClients, shipments);
        setReport(result);
        setCheckedIds(new Set(result.proposals.map(p => String(p.client.id))));
    };

    const toggleProposal = (clientId) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            const key = String(clientId);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const applyReport = async () => {
        const assignments = report.proposals
            .filter(p => checkedIds.has(String(p.client.id)))
            .map(p => ({ clientId: p.client.id, agencyId: p.agencyId }));
        if (assignments.length === 0) return;

        setIsApplying(true);
        try {
            const { updated, failed } = await onAssignOwnerAgency(assignments);
            alert(failed > 0
                ? `Se han movido ${updated} fichas. ${failed} han fallado (mira la consola).`
                : `✅ Se han movido ${updated} fichas a la base de datos de su agencia.`);
            setReport(null);
        } finally {
            setIsApplying(false);
        }
    };

    const closeAgency = async () => {
        if (!agencyToClose) return;
        setIsDeleting(true);
        try {
            const { deleted } = await onDeleteAgencyDatabase(agencyToClose.id);
            alert(`✅ Base de datos de ${agencyToClose.name} eliminada: ${deleted} fichas borradas.\n\nLa ficha de la agencia y tus clientes siguen intactos.`);
            setAgencyToClose(null);
            setConfirmText('');
        } catch (e) {
            console.error(e);
            alert('Error al borrar la base de datos de la agencia: ' + (e.message || e));
        } finally {
            setIsDeleting(false);
        }
    };

    const pendingCount = agencyToClose ? getClientsOwnedBy(agencyToClose.id, allClients).length : 0;

    return (
        <>
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                        <button
                            onClick={() => onChangeFilter('all')}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                                ownerFilter === 'all'
                                    ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                            }`}
                        >
                            <Building2 size={16} />
                            Todas ({(allClients || []).length})
                        </button>
                        {buckets.map(b => {
                            const Icon = b.icon;
                            const active = ownerFilter === b.id;
                            const isOwn = b.id === 'own';
                            return (
                                <button
                                    key={b.id}
                                    onClick={() => onChangeFilter(b.id)}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-bold border transition-all ${
                                        active
                                            ? (isOwn ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm' : 'bg-amber-500 border-amber-500 text-white shadow-sm')
                                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                    }`}
                                >
                                    <Icon size={16} />
                                    {b.label} ({b.count})
                                </button>
                            );
                        })}
                    </div>

                    <div className="flex gap-2">
                        <button
                            onClick={openReport}
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors font-medium text-sm"
                            title="Analiza los albaranes y propone qué fichas son de cada agencia"
                        >
                            <FileSearch size={18} className="text-indigo-600" />
                            Informe de reparto
                        </button>
                        {agencies.length > 0 && (
                            <select
                                value=""
                                onChange={e => {
                                    const agency = agencies.find(a => String(a.id) === e.target.value);
                                    if (agency) { setAgencyToClose(agency); setConfirmText(''); }
                                }}
                                className="px-4 py-2 bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors font-medium text-sm cursor-pointer"
                            >
                                <option value="">Dar de baja agencia…</option>
                                {agencies.map(a => (
                                    <option key={a.id} value={String(a.id)}>{a.name}</option>
                                ))}
                            </select>
                        )}
                    </div>
                </div>

                {agencies.length === 0 && (
                    <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
                        <AlertTriangle size={12} className="text-amber-400" />
                        Ninguna ficha marcada como agencia todavía. Edita TSB, TXT y XPO y marca "¿Es Agencia de Transporte?" en la pestaña General.
                    </p>
                )}
            </div>

            {/* ─── INFORME DE REPARTO ─── */}
            {report && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh]">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <FileSearch size={20} className="text-indigo-600" />
                                Informe de reparto
                            </h3>
                            <button onClick={() => setReport(null)} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100">
                                <X size={20} />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            <p className="text-sm text-slate-500">
                                Analizados <b>{(shipments || []).length}</b> albaranes. Sólo se propone mover fichas cuyos
                                portes los ha pagado <b>siempre la misma agencia</b>. Nada se guarda hasta que pulses aplicar.
                            </p>

                            {report.proposals.length === 0 ? (
                                <div className="text-center py-8 text-slate-400 text-sm">
                                    No hay ninguna ficha que mover. Toda tu cartera tiene albaranes propios.
                                </div>
                            ) : (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                            Se moverán a la agencia ({checkedIds.size} de {report.proposals.length})
                                        </h4>
                                        <button
                                            onClick={() => setCheckedIds(checkedIds.size === report.proposals.length
                                                ? new Set()
                                                : new Set(report.proposals.map(p => String(p.client.id))))}
                                            className="text-[11px] font-bold text-blue-600 hover:underline"
                                        >
                                            {checkedIds.size === report.proposals.length ? 'Desmarcar todas' : 'Marcar todas'}
                                        </button>
                                    </div>
                                    <div className="border border-slate-100 rounded-lg divide-y divide-slate-50 max-h-64 overflow-y-auto">
                                        {report.proposals.map(p => (
                                            <label key={p.client.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={checkedIds.has(String(p.client.id))}
                                                    onChange={() => toggleProposal(p.client.id)}
                                                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="font-bold text-slate-700 text-sm truncate">{p.client.name}</div>
                                                    <div className="text-[11px] text-slate-400">
                                                        {p.client.city || 'Sin población'} · {p.shipmentCount} albarán(es)
                                                    </div>
                                                </div>
                                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-100 shrink-0">
                                                    {p.agencyName}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {report.skipped.length > 0 && (
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        Se quedan contigo ({report.skipped.length})
                                    </h4>
                                    <div className="border border-emerald-100 bg-emerald-50/40 rounded-lg divide-y divide-emerald-100/50 max-h-48 overflow-y-auto">
                                        {report.skipped.map(s => (
                                            <div key={s.client.id} className="px-3 py-2">
                                                <div className="font-bold text-slate-700 text-sm">{s.client.name}</div>
                                                <div className="text-[11px] text-slate-500">{s.reason}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setReport(null)} className="px-4 py-2 text-slate-600 font-medium text-sm rounded-lg hover:bg-slate-100">
                                Cancelar
                            </button>
                            <button
                                onClick={applyReport}
                                disabled={isApplying || checkedIds.size === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isApplying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                                Aplicar a {checkedIds.size} ficha{checkedIds.size === 1 ? '' : 's'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── BAJA DE AGENCIA ─── */}
            {agencyToClose && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
                        <div className="flex justify-between items-center px-6 py-4 border-b border-red-100 bg-red-50 rounded-t-2xl">
                            <h3 className="font-bold text-red-700 flex items-center gap-2">
                                <AlertTriangle size={20} />
                                Dar de baja {agencyToClose.name}
                            </h3>
                            <button onClick={() => setAgencyToClose(null)} className="text-red-400 hover:text-red-600 p-1 rounded-lg hover:bg-red-100">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-slate-600">
                                Se borrarán <b className="text-red-600">{pendingCount} fichas</b> de la base de datos de {agencyToClose.name}.
                            </p>
                            <ul className="text-xs text-slate-500 space-y-1 bg-slate-50 rounded-lg p-3">
                                <li>✅ Tus clientes propios no se tocan.</li>
                                <li>✅ La ficha de {agencyToClose.name} se conserva (para su facturación).</li>
                                <li>✅ Los albaranes del histórico se conservan.</li>
                                <li>⚠️ Las fichas borradas no se pueden recuperar sin una copia de seguridad.</li>
                            </ul>
                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                    Escribe "{agencyToClose.name}" para confirmar
                                </label>
                                <input
                                    type="text"
                                    value={confirmText}
                                    onChange={e => setConfirmText(e.target.value)}
                                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500"
                                    placeholder={agencyToClose.name}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                            <button onClick={() => setAgencyToClose(null)} className="px-4 py-2 text-slate-600 font-medium text-sm rounded-lg hover:bg-slate-100">
                                Cancelar
                            </button>
                            <button
                                onClick={closeAgency}
                                disabled={isDeleting || pendingCount === 0 || confirmText.trim().toLowerCase() !== String(agencyToClose.name || '').trim().toLowerCase()}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                                Borrar {pendingCount} fichas
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
