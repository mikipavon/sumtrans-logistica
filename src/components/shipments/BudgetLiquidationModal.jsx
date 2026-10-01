import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Calculator, CheckCircle, ChevronDown, User, FileText, DownloadCloud, Printer, Clock, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { generateDeliveryPDFBlob } from '../../utils/deliveryPdf';
import { printBudgetSummary, printBudgetSummaries } from '../../utils/printBudgetSummary';
import { porteDelEnvio } from '../../utils/shipmentUtils';
import { mesDelPresupuesto } from '../../utils/reciboDeDeuda';
import { albaranesPorCerrar } from '../../utils/cierreDePresupuestos';
import { entraEnElCierre, nombreDelPeriodo, mesDelCierre, mesPorDefectoDelCierre } from '../../utils/mesesDelCierre';
import { coincideEnCampos } from '../../utils/busqueda';

export default function BudgetLiquidationModal({ isOpen, onClose, shipments, clients, drivers, onCreateShipment, onUpdateMultipleShipments }) {
    // YYYY-MM. Hasta el día 10 abre en el mes anterior (ver utils/mesesDelCierre.js).
    const [selectedMonth, setSelectedMonth] = useState(() => mesPorDefectoDelCierre());
    // Buscador por nombre de cliente: filtra las dos pestañas.
    const [busqueda, setBusqueda] = useState('');
    // En el ordenador la ventana mide lo que su lista y va centrada: al filtrar
    // encogía y la caja se iba de debajo del cursor. Mientras se busca se queda
    // con el alto que tenía al empezar a teclear.
    const ventanaRef = useRef(null);
    const [altoAlBuscar, setAltoAlBuscar] = useState(null);
    const cambiarBusqueda = (texto) => {
        if (!texto) {
            setAltoAlBuscar(null);
        } else if (!busqueda && ventanaRef.current && window.matchMedia?.('(min-width: 640px)')?.matches) {
            setAltoAlBuscar(ventanaRef.current.offsetHeight);
        }
        setBusqueda(texto);
    };
    // La ventana vive montada dentro de Envíos, que puede quedarse abierto días:
    // el mes se vuelve a calcular cada vez que se abre, no sólo al cargar, y la
    // búsqueda de la vez anterior no se queda escondiendo clientes.
    useEffect(() => {
        if (isOpen) {
            setSelectedMonth(mesPorDefectoDelCierre());
            setBusqueda('');
            setAltoAlBuscar(null);
            setSeleccionados(new Set());
        }
    }, [isOpen]);
    // Clientes marcados para imprimir o cerrar de un golpe. Cada pestaña marca
    // con su clave (cliente o recibo), así que no se mezclan.
    const [seleccionados, setSeleccionados] = useState(() => new Set());
    const alternarSeleccion = (clave) => setSeleccionados(prev => {
        const next = new Set(prev);
        if (next.has(clave)) next.delete(clave); else next.add(clave);
        return next;
    });
    const [selectedDriverId, setSelectedDriverId] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [viewTab, setViewTab] = useState('pending'); // 'pending' | 'liquidated'
    // Sumar también lo que quedó sin cerrar de meses anteriores (ver utils/mesesDelCierre.js).
    const [arrastrarAnteriores, setArrastrarAnteriores] = useState(true);

    // Lo que paga un cliente de Presupuesto y sigue sin liquidar, de cualquier mes
    // (ver utils/cierreDePresupuestos.js: manda la ficha de quien paga el porte).
    const porCerrar = useMemo(
        () => (isOpen ? albaranesPorCerrar(shipments, clients) : []),
        [shipments, clients, isOpen]
    );

    // Una fila por cliente con lo del mes seleccionado. Una deuda apuntada a mano
    // cuenta en el mes de su fecha escrita (fechaContable), no en el del día en
    // que se tecleó.
    const budgetData = useMemo(() => {
        const dataByClient = new Map();

        porCerrar.forEach(({ envio, clave, clientId, clientName, mes, importe }) => {
            if (!entraEnElCierre(mes, selectedMonth, arrastrarAnteriores)) return;

            if (!dataByClient.has(clave)) {
                dataByClient.set(clave, {
                    clave: `p:${clave}`,
                    clientId: clientId,
                    clientName: clientName,
                    shipments: [],
                    meses: new Set(),
                    totalAmount: 0
                });
            }

            const clientData = dataByClient.get(clave);
            clientData.shipments.push(envio);
            clientData.meses.add(mes);
            clientData.totalAmount += importe;
        });

        return Array.from(dataByClient.values())
            .map(d => ({ ...d, meses: [...d.meses].sort(), periodo: nombreDelPeriodo([...d.meses]) }))
            .sort((a, b) => b.totalAmount - a.totalAmount);
    }, [porCerrar, selectedMonth, arrastrarAnteriores]);

    // Albaranes de meses anteriores que quedaron sin cerrar. Se cuentan siempre,
    // con la casilla marcada o no, para que se sepa que existen.
    const deMesesAnteriores = useMemo(
        () => porCerrar.filter(({ mes }) => mes < selectedMonth).length,
        [porCerrar, selectedMonth]
    );

    // Presupuestos ya cerrados este mes: para saber a quién se le asignó cada cobro
    // y si ya lo cobró o sigue pendiente, sin tener que recordarlo de memoria.
    const liquidatedData = useMemo(() => {
        if (!isOpen) return [];

        const byReceipt = new Map();

        shipments.forEach(s => {
            if (!s.budgetLiquidated || !s.linkedReceiptId) return;
            if (s.type === 'Recibo' || s.type === 'Cobro') return;

            if (!byReceipt.has(s.linkedReceiptId)) {
                byReceipt.set(s.linkedReceiptId, []);
            }
            byReceipt.get(s.linkedReceiptId).push(s);
        });

        // Un recibo sale en el mes en que se cerró: el de su albarán más reciente.
        // Así un cierre de agosto y septiembre juntos se ve entero en septiembre.
        const groups = Array.from(byReceipt.entries())
            .filter(([, groupShipments]) => mesDelCierre(groupShipments.map(mesDelPresupuesto)) === selectedMonth)
            .map(([receiptId, groupShipments]) => {
            const receipt = shipments.find(s => s.id === receiptId);
            const driver = receipt ? (drivers || []).find(d => String(d.id) === String(receipt.assignedDriverId)) : null;
            const totalAmount = receipt
                ? (parseFloat(receipt.customAmount) > 0 ? parseFloat(receipt.customAmount) : parseFloat(receipt.amount)) || 0
                : groupShipments.reduce((sum, s) => sum + porteDelEnvio(s), 0);

            return {
                clave: `l:${receiptId}`,
                receiptId,
                // El recibo lleva el nombre de quien paga; en un porte debido el
                // `client` del albarán es el remitente.
                clientName: receipt?.client || groupShipments[0]?.client || 'Desconocido',
                shipments: groupShipments,
                periodo: nombreDelPeriodo(groupShipments.map(mesDelPresupuesto)),
                totalAmount,
                receipt,
                driverName: driver?.name || (receipt?.assignedDriverId ? 'Conductor desconocido' : 'Sin asignar'),
                isCollected: !!receipt?.portePaid,
                liquidatedAt: receipt?.paidAt || null,
            };
        });

        return groups.sort((a, b) => a.clientName.localeCompare(b.clientName));
    }, [shipments, drivers, isOpen, selectedMonth]);

    // Lo que se pinta. Las pestañas siguen contando todo lo que hay, no lo filtrado.
    const pendientesALaVista = useMemo(
        () => budgetData.filter(d => coincideEnCampos(d.clientName, busqueda)),
        [budgetData, busqueda]
    );
    const liquidadosALaVista = useMemo(
        () => liquidatedData.filter(d => coincideEnCampos(d.clientName, busqueda)),
        [liquidatedData, busqueda]
    );

    const sinCoincidencias = (
        <div className="text-center py-12 px-4">
            <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                <Search size={32} />
            </div>
            <h3 className="text-lg font-bold text-slate-800">Ningún cliente con ese nombre</h3>
            <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No hay nada para «{busqueda.trim()}» en el mes seleccionado.</p>
            <button
                onClick={() => cambiarBusqueda('')}
                className="mt-4 px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-sm font-bold rounded-lg border border-slate-200 transition-colors"
            >
                Quitar búsqueda
            </button>
        </div>
    );

    const handlePrintBudget = (clientData, statusInfo = null) => {
        printBudgetSummary(clientData, selectedMonth, statusInfo);
    };

    const estadoDelCobro = (data) => ({
        driverName: data.driverName,
        isCollected: data.isCollected,
        liquidatedAt: data.liquidatedAt,
    });

    // La selección cuenta sobre toda la pestaña, aunque el buscador esconda
    // alguno de los marcados; «Seleccionar todos» marca sólo lo que se ve.
    const enPendientes = viewTab === 'pending';
    const todosDeLaPestana = enPendientes ? budgetData : liquidatedData;
    const aLaVista = enPendientes ? pendientesALaVista : liquidadosALaVista;
    const marcados = todosDeLaPestana.filter(d => seleccionados.has(d.clave));
    const todosALaVistaMarcados = aLaVista.length > 0 && aLaVista.every(d => seleccionados.has(d.clave));
    const alternarTodos = () => setSeleccionados(prev => {
        const next = new Set(prev);
        aLaVista.forEach(d => (todosALaVistaMarcados ? next.delete(d.clave) : next.add(d.clave)));
        return next;
    });
    const handlePrintSelected = () => {
        printBudgetSummaries(
            marcados.map(d => ({ clientData: d, status: enPendientes ? null : estadoDelCobro(d) })),
            selectedMonth
        );
    };
    const casilla = (data) => (
        <input
            type="checkbox"
            className="w-5 h-5 shrink-0 accent-indigo-600 cursor-pointer"
            checked={seleccionados.has(data.clave)}
            onChange={() => alternarSeleccion(data.clave)}
            aria-label={`Seleccionar ${data.clientName}`}
        />
    );

    // Cierra un cliente: crea su recibo de cobro y marca sus albaranes. No
    // pregunta ni avisa, para servir igual a un cierre suelto que a una tanda.
    // Devuelve 'ok', 'sin-recibo' (no se ha tocado nada) o 'sin-marcar' (el
    // recibo existe pero los albaranes no han quedado liquidados).
    const cerrarCliente = async (clientData, newShipmentId) => {
        const dummyShipment = {
            id: newShipmentId,
            type: 'Recibo',
            client: clientData.clientName,
            clientId: clientData.clientId,
            originName: clientData.clientName,
            destinationName: clientData.clientName,
            destination: 'Cobro de Presupuesto',
            amount: clientData.totalAmount.toFixed(2),
            customAmount: clientData.totalAmount,
            billingType: 'Clientes Habituales', // CRÍTICO: Esto hace que se le pida el dinero al conductor
            porteType: 'Pagado',
            paymentStatus: 'Pending',
            portePaid: false,
            hasCod: false,
            codAmount: 0,
            assignedDriverId: selectedDriverId,
            status: 'Pendiente de asignar',
            observations: `Cobro mensual presupuestos acumulados (${clientData.periodo || selectedMonth}). Incluye ${clientData.shipments.length} envíos.`,
        };

        const created = await onCreateShipment(dummyShipment);
        if (!created) return 'sin-recibo';

        // La fecha es la que enseña la etiqueta PRESP de la lista de Envíos.
        const cerradoEl = new Date().toISOString();
        const updatesArray = clientData.shipments.map(s => ({
            id: s.id,
            updates: { budgetLiquidated: true, linkedReceiptId: newShipmentId, budgetLiquidatedAt: cerradoEl }
        }));

        const updated = await onUpdateMultipleShipments(updatesArray);
        return updated ? 'ok' : 'sin-marcar';
    };

    // Seis cifras del reloj; en una tanda se suma la posición para que dos
    // recibos seguidos no salgan con el mismo número.
    const numeroDeRecibo = (posicion = 0) => `RC-${(Date.now() + posicion).toString().slice(-6)}`;

    const handleLiquidate = async (clientData) => {
        if (!selectedDriverId) {
            alert('Por favor, selecciona un repartidor al que asignar el cobro.');
            return;
        }

        if (!window.confirm(`¿Estás seguro de que quieres cerrar ${clientData.periodo || 'el mes'} para ${clientData.clientName} por €${clientData.totalAmount.toFixed(2)}?\n\nSe asignará el cobro a este conductor y los albaranes seleccionados se marcarán como liquidados.`)) {
            return;
        }

        setIsProcessing(true);

        try {
            const resultado = await cerrarCliente(clientData, numeroDeRecibo());
            if (resultado === 'sin-recibo') {
                alert('No se pudo crear el recibo de cobro.');
            } else if (resultado === 'sin-marcar') {
                alert('Atención: El recibo se creó pero hubo un error al marcar los albaranes antiguos. Contacta a soporte.');
            } else {
                alert(`¡Mes cerrado con éxito para ${clientData.clientName}!\nEl conductor ahora lo tiene en sus cobros pendientes.`);
            }
        } catch (error) {
            console.error('Error al liquidar presupuesto:', error);
            alert('Ha ocurrido un error inesperado al procesar la liquidación.');
        } finally {
            setIsProcessing(false);
        }
    };

    // Todos los marcados al mismo conductor, uno detrás de otro. Si un recibo
    // se queda sin sus albaranes marcados se para ahí: seguir sería amontonar
    // cierres a medias.
    const handleLiquidateSelected = async () => {
        if (marcados.length === 0) return;
        if (!selectedDriverId) {
            alert('Por favor, selecciona un repartidor al que asignar el cobro.');
            return;
        }
        const conductor = (drivers || []).find(d => String(d.id) === String(selectedDriverId))?.name || 'el conductor elegido';
        const total = marcados.reduce((sum, d) => sum + d.totalAmount, 0);
        const lista = marcados.map(d => `· ${d.clientName}: €${d.totalAmount.toFixed(2)}`).join('\n');
        if (!window.confirm(`¿Cerrar ${marcados.length} ${marcados.length === 1 ? 'cliente' : 'clientes'} por €${total.toFixed(2)} y asignar el cobro a ${conductor}?\n\n${lista}`)) {
            return;
        }

        setIsProcessing(true);
        const cerrados = [];
        const sinRecibo = [];
        let aMedias = null;
        try {
            for (let i = 0; i < marcados.length; i++) {
                const clientData = marcados[i];
                const resultado = await cerrarCliente(clientData, numeroDeRecibo(i));
                if (resultado === 'ok') cerrados.push(clientData);
                else if (resultado === 'sin-recibo') sinRecibo.push(clientData);
                else { aMedias = clientData; break; }
            }
        } catch (error) {
            console.error('Error al liquidar presupuestos:', error);
            alert('Ha ocurrido un error inesperado y el cierre se ha parado. Revisa la lista antes de repetirlo.');
        } finally {
            setIsProcessing(false);
            setSeleccionados(prev => {
                const next = new Set(prev);
                cerrados.forEach(d => next.delete(d.clave));
                return next;
            });
        }

        const lineas = [`Cerrados: ${cerrados.length} de ${marcados.length}. ${conductor} ya los tiene en sus cobros pendientes.`];
        if (sinRecibo.length > 0) lineas.push(`No se pudo crear el recibo de: ${sinRecibo.map(d => d.clientName).join(', ')}. Siguen pendientes.`);
        if (aMedias) lineas.push(`Atención: el recibo de ${aMedias.clientName} se creó pero hubo un error al marcar sus albaranes. El cierre se ha parado ahí; contacta a soporte.`);
        alert(lineas.join('\n\n'));
    };

    const handleExportExcel = (clientData) => {
        const rows = clientData.shipments.map(s => {
            const date = s.createdAt ? new Date(s.createdAt).toLocaleDateString('es-ES') : (s.date || '');
            const origin = s.originName ? s.originName : (s.originCity ? `${s.originCity} (${s.originZip || ''})` : (s.origin || ''));
            const dest = s.destinationName ? s.destinationName : (s.destinationCity ? `${s.destinationCity} (${s.destinationZip || ''})` : (s.destination || ''));
            const amount = porteDelEnvio(s);
            const articlesInfo = Array.isArray(s.articles) 
                ? s.articles.map(a => `${a.quantity}x ${a.description}`).join(' | ') 
                : '';

            return {
                'ID Envío': s.id,
                'Fecha': date,
                'Remitente': origin,
                'Destinatario': dest,
                'Artículos': articlesInfo,
                'Bultos': s.packages || 1,
                'Kilos': s.weightKg || '',
                'Importe (€)': amount,
                'Observaciones': s.observations || ''
            };
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Styling widths
        ws['!cols'] = [
            { wch: 12 }, // ID Envío
            { wch: 12 }, // Fecha
            { wch: 25 }, // Remitente
            { wch: 25 }, // Destinatario
            { wch: 30 }, // Artículos
            { wch: 8 },  // Bultos
            { wch: 8 },  // Kilos
            { wch: 12 }, // Importe
            { wch: 30 }  // Observaciones
        ];

        XLSX.utils.book_append_sheet(wb, ws, "Detalles Presupuesto");
        const fileName = `Detalle_${clientData.clientName.substring(0, 15).replace(/\s+/g, '_')}_${selectedMonth}.xlsx`;
        XLSX.writeFile(wb, fileName);
    };

    const handleDownloadZip = async (clientData) => {
        setIsProcessing(true);
        try {
            const zip = new JSZip();
            const safeClientName = clientData.clientName.substring(0, 20).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
            const folderName = `Albaranes_${safeClientName}_${selectedMonth}`;
            const folder = zip.folder(folderName);

            let count = 0;
            for (const s of clientData.shipments) {
                const blob = await generateDeliveryPDFBlob(s);
                if (blob) {
                    const fileName = `POD_${s.id}_${s.destinationName || 'Envio'}.pdf`.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '');
                    folder.file(fileName, blob);
                    count++;
                }
            }

            if (count === 0) {
                alert("No se pudo generar ningún PDF válido para descargar.");
                return;
            }

            const content = await zip.generateAsync({ type: "blob" });
            saveAs(content, `${folderName}.zip`);
            
        } catch (error) {
            console.error('Error generando ZIP:', error);
            alert('Error al descargar los PDFs en ZIP.');
        } finally {
            setIsProcessing(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center sm:p-4">
            <div
                ref={ventanaRef}
                style={altoAlBuscar ? { minHeight: altoAlBuscar } : undefined}
                className="bg-white sm:rounded-2xl w-full max-w-4xl modal-mobile-full flex flex-col shadow-xl overflow-hidden animate-in fade-in zoom-in-95"
            >
                
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                            <Calculator size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-800">Cierre de Presupuestos</h2>
                            <p className="text-xs text-slate-500">Liquidar envíos sin IVA y asignar cobro al conductor</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors">
                        <X size={20} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="px-6 pt-4 bg-white flex gap-2 border-b border-slate-100">
                    <button
                        onClick={() => setViewTab('pending')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                            viewTab === 'pending' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        Pendientes de Liquidar {budgetData.length > 0 && `(${budgetData.length})`}
                    </button>
                    <button
                        onClick={() => setViewTab('liquidated')}
                        className={`px-4 py-2 text-sm font-bold rounded-t-lg border-b-2 transition-colors ${
                            viewTab === 'liquidated' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'
                        }`}
                    >
                        Ya Liquidados {liquidatedData.length > 0 && `(${liquidatedData.length})`}
                    </button>
                </div>

                {/* Controls */}
                <div className={`p-6 border-b border-slate-100 bg-white grid grid-cols-1 gap-4 ${viewTab === 'pending' ? 'md:grid-cols-2' : ''}`}>
                    <div>
                        <label className="block text-sm font-bold text-slate-700 mb-1">Mes a Liquidar</label>
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none"
                        />
                    </div>
                    {viewTab === 'pending' && (
                        <div>
                            <label className="block text-sm font-bold text-slate-700 mb-1">Conductor para el Cobro</label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <select
                                    value={selectedDriverId}
                                    onChange={(e) => setSelectedDriverId(e.target.value)}
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none appearance-none cursor-pointer"
                                >
                                    <option value="">-- Selecciona un repartidor --</option>
                                    {(drivers || []).map(d => (
                                        <option key={d.id} value={d.id}>{d.name}</option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={18} />
                            </div>
                        </div>
                    )}
                    <div className={viewTab === 'pending' ? 'md:col-span-2' : ''}>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                            <input
                                type="search"
                                value={busqueda}
                                onChange={(e) => cambiarBusqueda(e.target.value)}
                                placeholder="Buscar cliente por nombre..."
                                aria-label="Buscar cliente por nombre"
                                className="w-full pl-10 pr-10 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 font-medium text-slate-700 outline-none [&::-webkit-search-cancel-button]:appearance-none"
                            />
                            {busqueda && (
                                <button
                                    type="button"
                                    onClick={() => cambiarBusqueda('')}
                                    title="Quitar búsqueda"
                                    aria-label="Quitar búsqueda"
                                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-full transition-colors"
                                >
                                    <X size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {viewTab === 'pending' && deMesesAnteriores > 0 && (
                    <label className="mx-6 -mt-2 mb-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 cursor-pointer">
                        <input
                            type="checkbox"
                            className="mt-0.5 accent-indigo-600"
                            checked={arrastrarAnteriores}
                            onChange={(e) => setArrastrarAnteriores(e.target.checked)}
                        />
                        <span>
                            Sumar también lo que quedó sin cerrar de meses anteriores
                            <span className="font-bold"> ({deMesesAnteriores} {deMesesAnteriores === 1 ? 'albarán' : 'albaranes'})</span>.
                            Se cobra todo junto en este cierre.
                        </span>
                    </label>
                )}

                {aLaVista.length > 0 && (
                    <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center justify-between gap-3 flex-wrap">
                        <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                            <input
                                type="checkbox"
                                className="w-5 h-5 accent-indigo-600 cursor-pointer"
                                checked={todosALaVistaMarcados}
                                onChange={alternarTodos}
                            />
                            Seleccionar todos
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                            <button
                                onClick={handlePrintSelected}
                                disabled={marcados.length === 0}
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                                title="Imprimir de un golpe el detalle de los clientes marcados, cada uno en su hoja"
                            >
                                <Printer size={18} />
                                Imprimir seleccionados{marcados.length > 0 ? ` (${marcados.length})` : ''}
                            </button>
                            {enPendientes && (
                                <button
                                    onClick={handleLiquidateSelected}
                                    disabled={marcados.length === 0 || isProcessing}
                                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
                                    title="Cerrar el mes de los clientes marcados y asignar todos los cobros al conductor elegido arriba"
                                >
                                    <CheckCircle size={18} />
                                    {isProcessing ? 'Cerrando...' : `Cerrar seleccionados${marcados.length > 0 ? ` (${marcados.length})` : ''}`}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
                    {viewTab === 'pending' ? (
                        budgetData.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <CheckCircle size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Todo al día</h3>
                                <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No hay presupuestos pendientes de liquidar para el mes seleccionado.</p>
                            </div>
                        ) : pendientesALaVista.length === 0 ? sinCoincidencias : (
                            <div className="space-y-4">
                                {pendientesALaVista.map((data) => (
                                    <div key={data.clave} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                              {casilla(data)}
                                              <div>
                                                <h3 className="text-lg font-bold text-slate-800">{data.clientName}</h3>
                                                <div className="flex items-center gap-3 mt-1">
                                                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">Presupuesto</span>
                                                    <span className="text-sm text-slate-500">{data.shipments.length} envíos acumulados</span>
                                                    {data.meses.length > 1 && (
                                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">{data.periodo}</span>
                                                    )}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex flex-col md:flex-row items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total Acumulado</p>
                                                    <p className="text-2xl font-black text-slate-900">€{data.totalAmount.toFixed(2)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto">
                                                    <button
                                                        onClick={() => handlePrintBudget(data)}
                                                        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                                        title="Imprimir detalle para el cliente"
                                                    >
                                                        <Printer size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportExcel(data)}
                                                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                                                        title="Descargar detalle en Excel"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDownloadZip(data)}
                                                        disabled={isProcessing}
                                                        className="px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-blue-200 disabled:opacity-50"
                                                        title="Descargar PDFs en ZIP"
                                                    >
                                                        {isProcessing ? <span className="animate-pulse">...</span> : <DownloadCloud size={18} />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleLiquidate(data)}
                                                        disabled={isProcessing}
                                                        className="flex-1 md:flex-none px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                                                    >
                                                        Cerrar Mes
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        liquidatedData.length === 0 ? (
                            <div className="text-center py-12 px-4">
                                <div className="bg-slate-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                                    <Clock size={32} />
                                </div>
                                <h3 className="text-lg font-bold text-slate-800">Nada liquidado todavía</h3>
                                <p className="text-slate-500 text-sm mt-1 max-w-sm mx-auto">No se ha cerrado ningún presupuesto para el mes seleccionado.</p>
                            </div>
                        ) : liquidadosALaVista.length === 0 ? sinCoincidencias : (
                            <div className="space-y-4">
                                {liquidadosALaVista.map((data) => (
                                    <div key={data.receiptId} className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-center gap-3">
                                              {casilla(data)}
                                              <div>
                                                <h3 className="text-lg font-bold text-slate-800">{data.clientName}</h3>
                                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                    <span className="text-xs font-bold px-2 py-0.5 bg-amber-100 text-amber-700 rounded-md">Presupuesto</span>
                                                    <span className="text-sm text-slate-500">{data.shipments.length} envíos · {data.receiptId}</span>
                                                    {data.periodo && data.periodo.includes(' y ') && (
                                                        <span className="text-xs font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md">{data.periodo}</span>
                                                    )}
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                                                        data.isCollected ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'
                                                    }`}>
                                                        {data.isCollected ? '✓ Cobrado' : '⏳ Pendiente de cobro'}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                                    <User size={12} /> Asignado a: <span className="font-semibold text-slate-500">{data.driverName}</span>
                                                </p>
                                              </div>
                                            </div>
                                            <div className="flex flex-col md:flex-row items-center gap-4">
                                                <div className="text-right">
                                                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-0.5">Total</p>
                                                    <p className="text-2xl font-black text-slate-900">€{data.totalAmount.toFixed(2)}</p>
                                                </div>
                                                <div className="flex items-center gap-2 w-full md:w-auto">
                                                    <button
                                                        onClick={() => handlePrintBudget(data, estadoDelCobro(data))}
                                                        className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-600 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-slate-200"
                                                        title="Imprimir detalle para el cliente"
                                                    >
                                                        <Printer size={18} />
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportExcel(data)}
                                                        className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-sm font-bold rounded-lg transition-colors flex items-center justify-center gap-2 border border-emerald-200"
                                                        title="Descargar detalle en Excel"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )
                    )}
                </div>

            </div>
        </div>
    );
}
