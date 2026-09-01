import { X, Clock, Calendar, Edit2, CheckCircle, Trash2, Download, FileSpreadsheet, FileText, AlertTriangle } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

export default function TimeLogsModal({ isOpen, onClose, isGhostModeUnlocked }) {
    const [logs, setLogs] = useState([]);
    const [absences, setAbsences] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
    const [editingLogId, setEditingLogId] = useState(null);
    const [editForm, setEditForm] = useState({ clock_in: '', clock_out: '' });
    const [showToDrivers, setShowToDrivers] = useState(false);
    const [loadingToggle, setLoadingToggle] = useState(true);
    // ─── BORRADO POR FECHA ───
    const [showPurge, setShowPurge] = useState(false);
    const [purgeDate, setPurgeDate] = useState('');
    const [purgeMode, setPurgeMode] = useState('day'); // 'day' = sólo ese día | 'upto' = ese día y anteriores
    const [purgePreview, setPurgePreview] = useState(null);
    const [isPurging, setIsPurging] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchLogs();
            // Load driver visibility setting
            supabase.from('settings').select('value').eq('key', 'showTimeLogsToDrivers').maybeSingle()
                .then(({ data }) => {
                    setShowToDrivers(data?.value === 'true');
                    setLoadingToggle(false);
                })
                .catch(() => setLoadingToggle(false));
        }
    }, [month, isOpen]);

    if (!isOpen) return null;

    const fetchLogs = async () => {
        setIsLoading(true);
        try {
            const startOfMonth = `${month}-01`;
            const endOfMonth = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).toISOString().split('T')[0];
            
            const [{ data: logsData, error }, { data: absData }] = await Promise.all([
                supabase.from('time_logs').select('*').gte('date', startOfMonth).lte('date', endOfMonth).order('date', { ascending: false }).order('clock_in', { ascending: false }),
                supabase.from('driver_absences').select('*').gte('date', startOfMonth).lte('date', endOfMonth).order('date', { ascending: false })
            ]);

            if (error) throw error;
            setLogs(logsData || []);
            setAbsences(absData || []);
        } catch (error) {
            console.error("Error fetching time logs:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (isoString) => {
        if (!isoString) return '--:--';
        return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const formatDateShort = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
    };

    const formatDateFull = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
    };

    const calculateHoursNum = (inStr, outStr) => {
        if (!inStr || !outStr) return 0;
        const diffMs = new Date(outStr) - new Date(inStr);
        return diffMs / (1000 * 60 * 60);
    };

    const calculateHours = (inStr, outStr) => {
        if (!inStr || !outStr) return '-';
        return calculateHoursNum(inStr, outStr).toFixed(1) + 'h';
    };

    const startEdit = (log) => {
        setEditingLogId(log.id);
        const formatForInput = (iso) => {
            if (!iso) return '';
            const d = new Date(iso);
            return new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
        };
        setEditForm({
            clock_in: formatForInput(log.clock_in),
            clock_out: formatForInput(log.clock_out)
        });
    };

    // ─── AUDIT TRAIL ───
    const logAudit = async (action, originalLog, newValues = null) => {
        try {
            const { data: existing } = await supabase.from('settings').select('value').eq('key', 'time_logs_audit').maybeSingle();
            let auditHistory = [];
            if (existing?.value) { try { auditHistory = JSON.parse(existing.value); } catch(e) {} }
            auditHistory.unshift({
                action, // 'edit' or 'delete'
                timestamp: new Date().toISOString(),
                logId: originalLog.id,
                driverName: originalLog.driver_name,
                date: originalLog.date,
                original: {
                    clock_in: originalLog.clock_in,
                    clock_out: originalLog.clock_out
                },
                 ...(newValues ? { modified: newValues } : {})
             });
             // Conservar últimos 2000 registros de auditoría
             if (auditHistory.length > 2000) auditHistory = auditHistory.slice(0, 2000);
             await supabase.from('settings').upsert({ key: 'time_logs_audit', value: JSON.stringify(auditHistory) });
         } catch(e) {
             console.warn('[Audit] Error guardando auditoría:', e);
         }
     };

    const isMonthConfirmed = async (driverId, logDate) => {
        try {
            const logMonth = logDate.slice(0, 7);
            const confirmKey = `timelog_confirm_${driverId}_${logMonth}`;
            
            const { data } = await supabase
                .from('settings')
                .select('value')
                .eq('key', 'timelog_confirmations')
                .maybeSingle();
            
            if (data?.value) {
                const confirmations = JSON.parse(data.value);
                return confirmations.some(c => String(c.key) === String(confirmKey));
            }
        } catch (e) {
            console.error("Error checking log confirmation:", e);
        }
        return false;
    };

    const saveEdit = async (id) => {
        try {
            const originalLog = logs.find(l => l.id === id);
            
            if (originalLog) {
                const confirmed = await isMonthConfirmed(originalLog.driver_id, originalLog.date);
                if (confirmed) {
                    alert("⚠️ OPERACIÓN BLOQUEADA: Este mes está firmado digitalmente por el conductor y se encuentra SELLADO legalmente. No es posible realizar modificaciones.");
                    setEditingLogId(null);
                    return;
                }
            }

            const updates = {
                clock_in: editForm.clock_in ? new Date(editForm.clock_in).toISOString() : null,
                clock_out: editForm.clock_out ? new Date(editForm.clock_out).toISOString() : null,
            };
            // Registrar auditoría ANTES de modificar
            if (originalLog) {
                await logAudit('edit', originalLog, updates);
            }
            await supabase.from('time_logs').update(updates).eq('id', id);
            setEditingLogId(null);
            fetchLogs();
        } catch (e) {
            console.error("Error updating log:", e);
            alert("Error al guardar.");
        }
    };

    const deleteLog = async (id) => {
        try {
            const originalLog = logs.find(l => l.id === id);
            
            if (originalLog) {
                const confirmed = await isMonthConfirmed(originalLog.driver_id, originalLog.date);
                if (confirmed) {
                    alert("⚠️ OPERACIÓN BLOQUEADA: Este mes está firmado digitalmente por el conductor y se encuentra SELLADO legalmente. No es posible borrar este fichaje.");
                    return;
                }
            }

            if (!window.confirm("⚠️ ATENCIÓN: Borrar un fichaje queda registrado en el historial de auditoría.\n\n¿Estás seguro de que quieres borrar este registro?")) return;
            
            // Registrar auditoría ANTES de borrar
            if (originalLog) {
                await logAudit('delete', originalLog);
            }
            await supabase.from('time_logs').delete().eq('id', id);
            fetchLogs();
        } catch (e) {
            console.error("Error deleting:", e);
        }
    };

    // ─── BORRADO POR FECHA ───
    // Devuelve el conjunto de meses ya firmados por los conductores.
    // Devuelve null si no se ha podido comprobar: en ese caso no se borra nada.
    const loadConfirmedKeys = async () => {
        try {
            const { data, error } = await supabase.from('settings').select('value').eq('key', 'timelog_confirmations').maybeSingle();
            if (error) throw error;
            if (!data?.value) return new Set();
            return new Set(JSON.parse(data.value).map(c => String(c.key)));
        } catch (e) {
            console.error("Error leyendo las firmas mensuales:", e);
            return null;
        }
    };

    const logAuditBulk = async (deletedLogs) => {
        try {
            const { data: existing } = await supabase.from('settings').select('value').eq('key', 'time_logs_audit').maybeSingle();
            let auditHistory = [];
            if (existing?.value) { try { auditHistory = JSON.parse(existing.value); } catch(e) {} }
            const now = new Date().toISOString();
            const entries = deletedLogs.map(l => ({
                action: 'delete',
                bulk: true,
                timestamp: now,
                logId: l.id,
                driverName: l.driver_name,
                date: l.date,
                original: { clock_in: l.clock_in, clock_out: l.clock_out }
            }));
            auditHistory = [...entries, ...auditHistory];
            if (auditHistory.length > 2000) auditHistory = auditHistory.slice(0, 2000);
            await supabase.from('settings').upsert({ key: 'time_logs_audit', value: JSON.stringify(auditHistory) });
        } catch(e) {
            console.warn('[Audit] Error guardando auditoría del borrado:', e);
        }
    };

    const previewPurge = async () => {
        if (!purgeDate) return;
        setIsPurging(true);
        setPurgePreview(null);
        try {
            const base = supabase.from('time_logs').select('*');
            const query = purgeMode === 'day' ? base.eq('date', purgeDate) : base.lte('date', purgeDate);
            const [{ data, error }, confirmedKeys] = await Promise.all([query, loadConfirmedKeys()]);
            if (error) throw error;
            if (confirmedKeys === null) {
                alert("No se han podido comprobar las firmas mensuales de los conductores.\n\nPor seguridad no se borra nada. Revisa la conexión e inténtalo de nuevo.");
                return;
            }
            const deletable = [];
            const blocked = [];
            (data || []).forEach(l => {
                const key = `timelog_confirm_${l.driver_id}_${String(l.date).slice(0, 7)}`;
                (confirmedKeys.has(key) ? blocked : deletable).push(l);
            });
            setPurgePreview({ deletable, blocked });
        } catch (e) {
            console.error("Error consultando los fichajes a borrar:", e);
            alert("Error al consultar los fichajes. No se ha borrado nada.");
        } finally {
            setIsPurging(false);
        }
    };

    const runPurge = async () => {
        if (!purgePreview || purgePreview.deletable.length === 0) return;
        const total = purgePreview.deletable.length;
        const rango = purgeMode === 'day'
            ? `del día ${formatDateFull(purgeDate)}`
            : `del ${formatDateFull(purgeDate)} y de todos los días anteriores`;
        if (!window.confirm(`⚠️ Vas a BORRAR ${total} fichaje(s) ${rango}.\n\nEsto no se puede deshacer. Si quieres una copia, cancela y exporta antes a Excel.\n\n¿Continuar?`)) return;
        if (!window.confirm(`Última confirmación:\n\nSe borran ${total} registro(s) de forma permanente.`)) return;
        setIsPurging(true);
        try {
            await logAuditBulk(purgePreview.deletable);
            const ids = purgePreview.deletable.map(l => l.id);
            for (let i = 0; i < ids.length; i += 100) {
                const { error } = await supabase.from('time_logs').delete().in('id', ids.slice(i, i + 100));
                if (error) throw error;
            }
            setPurgePreview(null);
            setPurgeDate('');
            alert(`Hecho. Se han borrado ${total} fichaje(s).`);
        } catch (e) {
            console.error("Error borrando fichajes:", e);
            alert("Error al borrar. Puede que se hayan borrado sólo algunos registros: vuelve a pulsar \"Ver qué se borraría\" antes de repetir.");
        } finally {
            setIsPurging(false);
            fetchLogs();
        }
    };

    // Group logs by driver for summary
    const driverSummary = logs.reduce((acc, log) => {
        const name = log.driver_name || 'Sin nombre';
        if (!acc[name]) acc[name] = { totalHours: 0, days: 0 };
        if (log.clock_in && log.clock_out) {
            acc[name].totalHours += calculateHoursNum(log.clock_in, log.clock_out);
        }
        acc[name].days++;
        return acc;
    }, {});

    const monthLabel = new Date(month + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    // ─── EXPORT EXCEL ───
    const exportExcel = () => {
        if (logs.length === 0 && absences.length === 0) return alert('No hay registros para exportar.');

        const ABSENCE_TYPES_COLOR = { 'Vacaciones': '🏖️', 'Día Libre': '☀️', 'Baja Médica': '🏥', 'Asuntos Propios': '📋' };

        // Sort chronologically for export — merge logs + absences
        const sorted = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
        const sortedAbs = [...absences].sort((a, b) => new Date(a.date) - new Date(b.date));

        // Merge: interleave absences and logs by date
        const allRows = [
            ...sorted.map(l => ({ ...l, _kind: 'log' })),
            ...sortedAbs.map(a => ({ ...a, _kind: 'absence' }))
        ].sort((a, b) => a.date.localeCompare(b.date));

        // Sheet 1: Detalle diario
        const detailRows = allRows.map(row => {
            if (row._kind === 'absence') {
                return {
                    'Fecha': formatDateFull(row.date),
                    'Conductor': row.driver_name || 'Sin nombre',
                    'Tipo': `${ABSENCE_TYPES_COLOR[row.type] || ''} ${row.type}`,
                    'Hora Entrada': '—',
                    'Hora Salida': '—',
                    'Horas Trabajadas': '0',
                    'Observaciones': 'Ausencia programada',
                };
            }
            return {
                'Fecha': formatDateFull(row.date),
                'Conductor': row.driver_name || 'Sin nombre',
                'Tipo': '📅 Jornada',
                'Hora Entrada': formatTime(row.clock_in),
                'Hora Salida': row.clock_out ? formatTime(row.clock_out) : 'Sin fichar salida',
                'Horas Trabajadas': row.clock_in && row.clock_out ? calculateHoursNum(row.clock_in, row.clock_out).toFixed(2) : '0',
                'Observaciones': !row.clock_out ? 'Salida no registrada' : '',
            };
        });

        // Sheet 2: Resumen por conductor
        const summaryRows = Object.entries(driverSummary).map(([name, data]) => ({
            'Conductor': name,
            'Días Trabajados': data.days,
            'Total Horas': data.totalHours.toFixed(2),
            'Media Horas/Día': data.days > 0 ? (data.totalHours / data.days).toFixed(2) : '0'
        }));

        const wb = XLSX.utils.book_new();

        // Detail sheet
        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        // Set column widths
        wsDetail['!cols'] = [
            { wch: 28 }, // Fecha
            { wch: 22 }, // Conductor
            { wch: 20 }, // Tipo
            { wch: 14 }, // Entrada
            { wch: 18 }, // Salida
            { wch: 18 }, // Horas
            { wch: 24 }, // Observaciones
        ];
        XLSX.utils.book_append_sheet(wb, wsDetail, 'Registro Diario');

        // Summary sheet
        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        wsSummary['!cols'] = [
            { wch: 22 },
            { wch: 18 },
            { wch: 14 },
            { wch: 18 },
        ];
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen Mensual');

        const fileName = `Control_Horario_SUMTRANS_${month}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    // ─── EXPORT PDF (via print) ───
    const exportPDF = () => {
        if (logs.length === 0 && absences.length === 0) return alert('No hay registros para exportar.');

        const sorted = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));

        const printWindow = window.open('', '_blank');
        if (!printWindow) return alert('Permite las ventanas emergentes para generar el PDF.');

        const summaryHTML = Object.entries(driverSummary).map(([name, data]) =>
            `<tr>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:bold">${name}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${data.days}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:bold">${data.totalHours.toFixed(2)}h</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center">${data.days > 0 ? (data.totalHours / data.days).toFixed(2) : '0'}h</td>
            </tr>`
        ).join('');

        const ABSENCE_COLORS = { 'Vacaciones': '#dbeafe', 'Día Libre': '#fef3c7', 'Baja Médica': '#fee2e2', 'Asuntos Propios': '#f3e8ff' };
        const ABSENCE_EMOJIS = { 'Vacaciones': '🏖️', 'Día Libre': '☀️', 'Baja Médica': '🏥', 'Asuntos Propios': '📋' };

        // Merge logs + absences sorted by date
        const allRows = [
            ...sorted.map(l => ({ ...l, _kind: 'log' })),
            ...[...absences].sort((a, b) => new Date(a.date) - new Date(b.date)).map(a => ({ ...a, _kind: 'absence' }))
        ].sort((a, b) => a.date.localeCompare(b.date));

        const rowsHTML = allRows.map(row => {
            if (row._kind === 'absence') {
                const bgColor = ABSENCE_COLORS[row.type] || '#f1f5f9';
                const emoji   = ABSENCE_EMOJIS[row.type]  || '🏖️';
                return `<tr style="background:${bgColor}">
                    <td style="padding:6px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${formatDateFull(row.date)}</td>
                    <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:bold">${row.driver_name || 'Sin nombre'}</td>
                    <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:bold" colspan="2">${emoji} ${row.type}</td>
                    <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;color:#94a3b8">—</td>
                </tr>`;
            }
            return `<tr>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-transform:capitalize">${formatDateFull(row.date)}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;font-weight:bold">${row.driver_name || 'Sin nombre'}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;color:#059669;font-weight:bold">${formatTime(row.clock_in)}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;color:${row.clock_out ? '#dc2626' : '#d97706'};font-weight:bold">${row.clock_out ? formatTime(row.clock_out) : 'Sin fichar'}</td>
                <td style="padding:6px 12px;border:1px solid #e2e8f0;text-align:center;font-weight:bold">${calculateHours(row.clock_in, row.clock_out)}</td>
            </tr>`;
        }).join('');

        const totalHoursAll = Object.values(driverSummary).reduce((sum, d) => sum + d.totalHours, 0);

        printWindow.document.write(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Control Horario - SUMTRANS - ${monthLabel}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; color: #1e293b; padding: 40px; font-size: 12px; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        h2 { font-size: 14px; margin-top: 28px; margin-bottom: 8px; color: #475569; border-bottom: 2px solid #e2e8f0; padding-bottom: 4px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; border-bottom: 3px solid #3b82f6; padding-bottom: 16px; }
        .company { font-size: 10px; color: #64748b; }
        .period { font-size: 14px; font-weight: bold; color: #3b82f6; text-transform: capitalize; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #64748b; font-weight: 700; }
        .legal { margin-top: 40px; font-size: 9px; color: #94a3b8; line-height: 1.6; border-top: 1px solid #e2e8f0; padding-top: 12px; }
        .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
        .sig-block { width: 45%; border-top: 1px solid #cbd5e1; padding-top: 8px; text-align: center; font-size: 10px; color: #64748b; }
        .total-row { background: #f0fdf4; font-weight: bold; }
        @media print { body { padding: 20px; } }
    </style>
</head>
<body>
    <div class="header">
        <div>
            <h1>📋 REGISTRO DE JORNADA LABORAL</h1>
            <p class="company">SUMTRANS LOGÍSTICA S.L. — CIF B56131717</p>
        </div>
        <div style="text-align:right">
            <p class="period">${monthLabel}</p>
            <p class="company">Generado: ${new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
        </div>
    </div>

    <h2>📊 RESUMEN POR CONDUCTOR</h2>
    <table>
        <thead>
            <tr>
                <th>Conductor</th>
                <th style="text-align:center">Días Trabajados</th>
                <th style="text-align:center">Total Horas</th>
                <th style="text-align:center">Media Horas/Día</th>
            </tr>
        </thead>
        <tbody>
            ${summaryHTML}
            <tr class="total-row">
                <td style="padding:8px 12px;border:1px solid #e2e8f0">TOTAL EMPRESA</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${Object.values(driverSummary).reduce((s, d) => s + d.days, 0)}</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">${totalHoursAll.toFixed(2)}h</td>
                <td style="padding:8px 12px;border:1px solid #e2e8f0;text-align:center">—</td>
            </tr>
        </tbody>
    </table>

    <h2>📅 DETALLE DIARIO</h2>
    <table>
        <thead>
            <tr>
                <th>Fecha</th>
                <th>Conductor</th>
                <th style="text-align:center">Hora Entrada</th>
                <th style="text-align:center">Hora Salida</th>
                <th style="text-align:center">Horas Trabajadas</th>
            </tr>
        </thead>
        <tbody>
            ${rowsHTML}
        </tbody>
    </table>

    <div class="legal">
        <strong>NOTA LEGAL:</strong> Registro de jornada conforme al artículo 34.9 del Estatuto de los Trabajadores 
        (Real Decreto-ley 8/2019, de 8 de marzo). Este documento debe conservarse durante un período mínimo de 
        cuatro años, permaneciendo a disposición de las personas trabajadoras, de sus representantes legales y de la 
        Inspección de Trabajo y Seguridad Social.
    </div>

    <div class="signatures">
        <div class="sig-block">Firma del Responsable de la Empresa</div>
        <div class="sig-block">Firma del Trabajador (si aplica)</div>
    </div>
</body>
</html>`);

        printWindow.document.close();
        setTimeout(() => printWindow.print(), 500);
    };

    return (
        <div className="fixed inset-0 z-40 flex items-center justify-center sm:p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white sm:rounded-2xl shadow-xl w-full max-w-5xl modal-mobile-full flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                            <Clock size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Control Horario (Fichajes)</h2>
                            <p className="text-sm text-slate-500 font-medium">Registro de entradas y salidas de los conductores.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="month" 
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="px-3 py-2 border border-slate-200 rounded-lg font-bold text-sm text-slate-700 focus:ring-2 focus:ring-blue-500/20 outline-none"
                        />
                        <button
                            onClick={exportExcel}
                            className="px-3 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors flex items-center gap-1.5"
                            title="Exportar a Excel"
                        >
                            <FileSpreadsheet size={15} /> Excel
                        </button>
                        <button
                            onClick={exportPDF}
                            className="px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-bold hover:bg-red-100 transition-colors flex items-center gap-1.5"
                            title="Exportar a PDF (para Inspección)"
                        >
                            <FileText size={15} /> PDF
                        </button>
                        <button
                            onClick={() => { setShowPurge(v => !v); setPurgePreview(null); }}
                            className={`px-3 py-2 border rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 ${showPurge ? 'bg-red-600 text-white border-red-600 hover:bg-red-700' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                            title="Borrar fichajes por fecha"
                        >
                            <Trash2 size={15} /> Borrar
                        </button>
                        <button onClick={onClose} className="p-2 hover:bg-slate-200 text-slate-500 rounded-lg transition-colors">
                            <X size={20} />
                        </button>
                    </div>
                </div>

                {/* Borrado por fecha */}
                {showPurge && (
                <div className="px-6 py-4 border-b border-red-100 bg-red-50/60 shrink-0">
                    <div className="flex items-start gap-2 mb-3">
                        <AlertTriangle size={16} className="text-red-600 mt-0.5 shrink-0" />
                        <div>
                            <p className="text-xs font-bold text-red-800">Borrar fichajes por fecha</p>
                            <p className="text-[10px] text-red-600/90">No se puede deshacer. Los meses ya firmados por el conductor no se borran. Si quieres una copia, exporta antes a Excel.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="date"
                            value={purgeDate}
                            onChange={(e) => { setPurgeDate(e.target.value); setPurgePreview(null); }}
                            className="px-3 py-2 border border-slate-200 rounded-lg font-bold text-sm text-slate-700 focus:ring-2 focus:ring-red-500/20 outline-none"
                        />
                        <select
                            value={purgeMode}
                            onChange={(e) => { setPurgeMode(e.target.value); setPurgePreview(null); }}
                            className="px-3 py-2 border border-slate-200 rounded-lg font-bold text-xs text-slate-700 bg-white focus:ring-2 focus:ring-red-500/20 outline-none"
                        >
                            <option value="day">Sólo ese día</option>
                            <option value="upto">Ese día y todos los anteriores</option>
                        </select>
                        <button
                            onClick={previewPurge}
                            disabled={!purgeDate || isPurging}
                            className="px-3 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            {isPurging ? 'Consultando...' : 'Ver qué se borraría'}
                        </button>
                    </div>

                    {purgePreview && (
                        <div className="mt-3 bg-white border border-red-200 rounded-lg p-3">
                            {purgePreview.deletable.length === 0 && purgePreview.blocked.length === 0 ? (
                                <p className="text-xs font-bold text-slate-500">No hay ningún fichaje en esa fecha.</p>
                            ) : (
                                <>
                                    <p className="text-xs font-bold text-slate-700">
                                        Se van a borrar <span className="text-red-600">{purgePreview.deletable.length}</span> fichaje(s).
                                    </p>
                                    {purgePreview.deletable.length > 0 && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {Object.entries(purgePreview.deletable.reduce((acc, l) => {
                                                const n = l.driver_name || 'Sin nombre';
                                                acc[n] = (acc[n] || 0) + 1;
                                                return acc;
                                            }, {})).map(([n, c]) => (
                                                <span key={n} className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{n}: {c}</span>
                                            ))}
                                        </div>
                                    )}
                                    {purgePreview.blocked.length > 0 && (
                                        <p className="text-[11px] font-bold text-amber-700 mt-2">
                                            🔒 {purgePreview.blocked.length} fichaje(s) NO se borran: su mes está firmado digitalmente por el conductor.
                                        </p>
                                    )}
                                    {purgePreview.deletable.length > 0 && (
                                        <button
                                            onClick={runPurge}
                                            disabled={isPurging}
                                            className="mt-3 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                                        >
                                            <Trash2 size={14} /> {isPurging ? 'Borrando...' : `Borrar ${purgePreview.deletable.length} fichaje(s)`}
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>
                )}

                {/* Driver visibility toggle (Hidden by default, shown in Dev Mode) */}
                {isGhostModeUnlocked && (
                <div className="px-6 py-3 border-b border-slate-100 bg-amber-50/50 shrink-0 flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-slate-700">👁 Visible para conductores</p>
                        <p className="text-[10px] text-slate-500">Si está activado, los conductores ven sus fichajes en su portal y pueden confirmar sus horas.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer shrink-0 ml-4">
                        <input
                            type="checkbox"
                            checked={showToDrivers}
                            onChange={async (e) => {
                                const val = e.target.checked;
                                setShowToDrivers(val);
                                try {
                                    await supabase.from('settings').upsert({ key: 'showTimeLogsToDrivers', value: String(val) });
                                } catch(err) { console.error('Error saving toggle:', err); }
                            }}
                            className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-500"></div>
                    </label>
                </div>
                )}

                {/* Summary Bar */}
                {Object.keys(driverSummary).length > 0 && (
                    <div className="px-6 py-3 border-b border-slate-100 bg-white shrink-0">
                        <div className="flex flex-wrap gap-3">
                            {Object.entries(driverSummary).map(([name, data]) => (
                                <div key={name} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                    <span className="text-xs font-bold text-slate-600">{name}</span>
                                    <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">
                                        {data.totalHours.toFixed(1)}h / {data.days} días
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {isLoading ? (
                        <div className="text-center py-10 text-slate-400 font-bold">Cargando fichajes...</div>
                    ) : (
                        <div className="overflow-x-auto border border-slate-200 rounded-xl">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Fecha</th>
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Conductor</th>
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Entrada</th>
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Salida</th>
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider">Total</th>
                                        <th className="p-3 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {logs.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" className="p-8 text-center text-slate-400">
                                                <p className="text-3xl mb-2">📭</p>
                                                <p className="font-medium">No hay registros para este mes.</p>
                                                <p className="text-xs mt-1">Los fichajes se registran automáticamente cuando los conductores entran en la app.</p>
                                            </td>
                                        </tr>
                                    ) : (() => {
                                        // Merge logs + absences sorted by date DESC for display
                                        const ABSENCE_STYLES = {
                                            'Vacaciones':      'bg-blue-50 border-l-4 border-blue-400',
                                            'Día Libre':       'bg-amber-50 border-l-4 border-amber-400',
                                            'Baja Médica':     'bg-red-50 border-l-4 border-red-400',
                                            'Asuntos Propios': 'bg-purple-50 border-l-4 border-purple-400',
                                        };
                                        const ABSENCE_TEXT = {
                                            'Vacaciones':      'text-blue-700',
                                            'Día Libre':       'text-amber-700',
                                            'Baja Médica':     'text-red-700',
                                            'Asuntos Propios': 'text-purple-700',
                                        };
                                        const ABSENCE_EMOJIS = { 'Vacaciones': '🏖️', 'Día Libre': '☀️', 'Baja Médica': '🏥', 'Asuntos Propios': '📋' };

                                        const allRows = [
                                            ...logs.map(l => ({ ...l, _kind: 'log' })),
                                            ...absences.map(a => ({ ...a, _kind: 'absence' }))
                                        ].sort((a, b) => b.date.localeCompare(a.date) || (a._kind === 'log' && b._kind === 'log' ? new Date(b.clock_in) - new Date(a.clock_in) : 0));

                                        return allRows.map(row => {
                                            if (row._kind === 'absence') {
                                                const rowStyle = ABSENCE_STYLES[row.type] || 'bg-slate-50';
                                                const txtStyle = ABSENCE_TEXT[row.type]  || 'text-slate-700';
                                                const emoji    = ABSENCE_EMOJIS[row.type] || '🏖️';
                                                return (
                                                    <tr key={`abs-${row.id}`} className={`${rowStyle} transition-colors`}>
                                                        <td className="p-3 text-sm font-medium text-slate-700 capitalize">{formatDateShort(row.date)}</td>
                                                        <td className="p-3 text-sm font-bold text-slate-800">{row.driver_name}</td>
                                                        <td className={`p-3 text-sm font-bold ${txtStyle}`} colSpan={2}>
                                                            {emoji} {row.type}
                                                        </td>
                                                        <td className="p-3 text-sm text-slate-400">—</td>
                                                        <td className="p-3" />
                                                    </tr>
                                                );
                                            }
                                            const log = row;
                                            return (
                                                <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                                    <td className="p-3 text-sm font-medium text-slate-700 capitalize">{formatDateShort(log.date)}</td>
                                                    <td className="p-3 text-sm font-bold text-slate-800">{log.driver_name}</td>
                                                    <td className="p-3">
                                                        {editingLogId === log.id ? (
                                                            <input type="datetime-local" value={editForm.clock_in} onChange={e => setEditForm({...editForm, clock_in: e.target.value})} className="text-xs p-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                                        ) : (
                                                            <span className="text-sm text-emerald-600 font-bold bg-emerald-50 px-2 py-1 rounded">{formatTime(log.clock_in)}</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3">
                                                        {editingLogId === log.id ? (
                                                            <input type="datetime-local" value={editForm.clock_out} onChange={e => setEditForm({...editForm, clock_out: e.target.value})} className="text-xs p-1.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none" />
                                                        ) : log.clock_out ? (
                                                            <span className="text-sm text-red-600 font-bold bg-red-50 px-2 py-1 rounded">{formatTime(log.clock_out)}</span>
                                                        ) : (
                                                            <span className="text-xs text-amber-500 font-bold italic">Trabajando...</span>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-sm font-bold text-slate-600">
                                                        {calculateHours(log.clock_in, log.clock_out)}
                                                    </td>
                                                    <td className="p-3 flex justify-end gap-2">
                                                        {editingLogId === log.id ? (
                                                            <button onClick={() => saveEdit(log.id)} className="p-1.5 bg-blue-100 text-blue-600 hover:bg-blue-200 rounded-lg transition-colors"><CheckCircle size={16} /></button>
                                                        ) : (
                                                            <>
                                                                <button onClick={() => startEdit(log)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 rounded-lg transition-colors" title="Editar hora"><Edit2 size={16} /></button>
                                                                <button onClick={() => deleteLog(log.id)} className="p-1.5 bg-slate-100 text-slate-500 hover:bg-red-100 hover:text-red-600 rounded-lg transition-colors" title="Borrar"><Trash2 size={16} /></button>
                                                            </>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        });
                                    })()}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
