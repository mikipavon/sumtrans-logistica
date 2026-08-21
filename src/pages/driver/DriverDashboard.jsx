import { X, LogOut, FileText, Truck, Map as MapIcon, Package, Plus, Clock, Euro, Wallet, ArrowUpDown, GripVertical, User, CheckCircle, Calculator, Sparkles, BrainCircuit, AlertTriangle, Printer, PackagePlus, Phone, Scan, MessageSquare, MapPin, RotateCcw, WifiOff } from 'lucide-react';
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import {
  DndContext, 
  DragOverlay,
  closestCenter,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import {CSS} from '@dnd-kit/utilities';
import CreateShipmentModal from '../../components/shipments/CreateShipmentModal';
import CreatePickupModal from '../../components/shipments/CreatePickupModal';
import DeliveryConfirmationModal from '../../components/delivery/DeliveryConfirmationModal';
import IncidentModal from '../../components/delivery/IncidentModal';
import ShipmentDetailsModal from '../../components/shipments/ShipmentDetailsModal';
import Shipment from '../../models/Shipment';
import { calculateDailyAccount, parseAmount, isToday, isCashClient } from '../../utils/accountLogic';
import { generateCashReportPDF } from '../../utils/cashReportPdf';
import { printShipmentTicket } from '../../utils/printShipment';
import { printSimplifiedInvoice } from '../../utils/printSimplifiedInvoice';
import ScannerModal from '../../components/delivery/ScannerModal';
import { RUTAS_MAESTRAS, DEFAULT_RUTAS } from '../../data/rutas';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getQueueLength } from '../../utils/offlineQueue';
import { resolveOwnerAgencyId } from '../../utils/agencyOwnership';
import { getPackagesCount, puedeAsignarloEsteConductor, ciudadDeEnvio, nombreDeParada } from '../../utils/shipmentUtils';
import { mejorPuebloParaCiudad, esElMismoPueblo, normalizarPueblo } from '../../utils/townMatch';
import { optimizarRuta, parsearCoordenadas } from '../../utils/optimizadorRuta';
import { geocodificarDireccion } from '../../utils/geocodificar';
import { adaptarConocimiento, registrarEntrega, contarPueblosMemorizados } from '../../utils/aprendizajeRuta';
import { turnoQueSeAsignaAhora, turnoQueSeRepartaAhora, etiquetaTurno } from '../../utils/turnos';
import { resolverLogo, insigniaDeAgencia, buscarClienteDeEnvio } from '../../utils/marca';
import { abrirWhatsApp, necesitaGestoDelUsuario } from '../../utils/whatsappLink';
import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import RouteMapModal from '../../components/driver/RouteMapModal';
import DriverGuidedTour from '../../components/DriverGuidedTour';
import DriverShipmentTour from '../../components/DriverShipmentTour';
import DriverAlertsTour from '../../components/DriverAlertsTour';
import DriverCajaTour from '../../components/DriverCajaTour';
import DriverRepartaTour from '../../components/DriverRepartaTour';
import DriverEditTour from '../../components/DriverEditTour';

const normalizeClientName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "); // collapse multiple spaces
};

// ── ¿Es un fijo? ──
// En España los móviles empiezan por 6 o 7 y los fijos por 8 o 9. Un fijo no
// tiene WhatsApp, así que mandarle ahí el justificante es tirarlo. Solo damos
// por fijo lo que reconocemos como número español de 9 cifras: un extranjero o
// cualquier cosa rara se manda tal cual, que de eso sabe más el conductor.
const esFijoEspanol = (numero) => {
    const limpio = String(numero || '').replace(/[\s.\-()+]/g, '');
    const nacional = limpio.startsWith('34') ? limpio.slice(2) : limpio;
    return nacional.length === 9 && /^[89]/.test(nacional);
};

// Los teléfonos de una parada, MÓVILES PRIMERO: a un cliente se le localiza antes
// en el móvil, y el fijo de la nave no lo coge nadie a media tarde. De aquí salen
// tanto el número del justificante de WhatsApp (que solo puede ser un móvil) como
// la lista del botón de llamar.
//
// Se juntan dos fuentes porque ninguna basta sola: el teléfono del albarán es el
// más concreto —lo tecleó quien creó el envío— pero el autorrelleno solo baja el
// 'phone' de la ficha, así que un móvil guardado en 'mobile' no llega nunca al
// albarán.
//
// Se busca por nombre exacto del destinatario (o del remitente si es recogida), no
// con la tolerancia de marca de buscarClienteDeEnvio: esa empareja también por
// etiqueta de agencia, y un albarán de TSB acabaría ofreciendo el teléfono de la
// agencia en vez del de quien recibe el paquete.
export const telefonosDeLaParada = (stop, clientes) => {
    if (!stop) return [];
    const esRecogida = stop.type === 'Recogida';
    const nombre = normalizeClientName(esRecogida
        ? (stop.originName || stop.client)
        : (stop.destinationName || stop.client));
    const delAlbaran = esRecogida ? stop.originPhone : stop.destinationPhone;

    let fichaPhone = null;
    let fichaMobile = null;
    if (nombre && Array.isArray(clientes)) {
        for (const c of clientes) {
            if (!c) continue;
            // La sede manda sobre la ficha madre, pero si a la sede le falta un
            // hueco se completa con el de la madre: es la misma empresa.
            const sede = (c.branches || []).find(b => normalizeClientName(b?.name) === nombre);
            if (sede) {
                fichaPhone = sede.phone || c.phone;
                fichaMobile = sede.mobile || c.mobile;
                break;
            }
            if (normalizeClientName(c.name) === nombre || normalizeClientName(c.legalName) === nombre) {
                fichaPhone = c.phone;
                fichaMobile = c.mobile;
                break;
            }
        }
    }

    const vistos = new Set();
    const lista = [];
    [delAlbaran, fichaMobile, fichaPhone].forEach(numero => {
        const texto = String(numero || '').trim();
        if (!texto) return;
        // Mismo número escrito de dos formas (con prefijo, con espacios) es uno solo.
        const clave = texto.replace(/[\s.\-()+]/g, '').replace(/^34/, '');
        if (!clave || vistos.has(clave)) return;
        vistos.add(clave);
        lista.push({ numero: texto, esFijo: esFijoEspanol(texto) });
    });

    // Móviles delante, respetando dentro de cada grupo el orden de arriba.
    return [...lista.filter(t => !t.esFijo), ...lista.filter(t => t.esFijo)];
};

const isCityInBaremo = (city, zip) => {
    if (!city && !zip) return false;
    const normCity = normalizeClientName(city);
    const cleanZip = String(zip || '').trim();
    
    return (ALL_BAREMO_PUEBLOS || []).some(p => {
        const normPName = normalizeClientName(p.name);
        const matchName = normCity && normPName === normCity;
        const matchZip = cleanZip && String(p.zip || '').trim() === cleanZip;
        return matchName || matchZip;
    });
};


// Error Boundary for debugging
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });
        console.error("DriverDashboard Error:", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 bg-red-50 text-red-900 min-h-screen">
                    <h1 className="text-2xl font-bold mb-4">Algo salió mal en el Dashboard</h1>
                    <p className="font-mono text-sm bg-white p-4 rounded border border-red-200 overflow-auto">
                        {this.state.error && this.state.error.toString()}
                        <br />
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </p>
                    <button
                        className="mt-4 px-4 py-2 bg-red-600 text-white rounded"
                        onClick={() => window.location.reload()}
                    >
                        Recargar
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

// Píxeles que hay que arrastrar la tarjeta a la derecha para devolver el albarán a
// Asignar. Lo comparten el gesto (decide si dispara al soltar) y la tarjeta (avisa
// de que ya se puede soltar), para que no se separen nunca.
const SWIPE_UNASSIGN_THRESHOLD = 150;

// Exportada para poder probar la tarjeta por su cuenta: el logo y los distintivos
// se calculaban aquí con reglas propias y no había forma de comprobar que dijeran lo
// mismo que el optimizador.
export const ShipmentCardUI = React.memo(({
    stop,
    index,
    clients,
    Shipment, 
    parseAmount, 
    setSelectedShipment, 
    setIsDetailsModalOpen, 
    printShipmentTicket,
    setIncidentShipment,
    setIsIncidentModalOpen,
    setIncidentInitialReason,
    setPickupToConvert,
    setIsNoteModalOpen,
    setDeliveryModalShipment,
    onWhatsAppShare,
    onPickupClick,
    isDragging,
    isSwiping,
    swipeX,
    listeners,
    attributes,
    showDocActions,
    setShowDocActions,
    esDeCamino = false,
    dragOverlay = false
}) => {
    // Desplegable del botón de llamar cuando la parada tiene fijo y móvil. Va en
    // estado local de la tarjeta, no como el de documentos: aquí no hace falta que
    // el padre lo cierre, se cierra solo al elegir número o al tocar fuera.
    const [showPhoneActions, setShowPhoneActions] = useState(false);

    // El cliente de la parada, resuelto una sola vez: de él salen el logo y el
    // distintivo de agencia, que antes se calculaban a mano ahí abajo con reglas
    // distintas de las que usaba el optimizador para ordenar la ruta.
    const clienteDeLaParada = buscarClienteDeEnvio(stop, clients);
    const insignia = insigniaDeAgencia(stop, clienteDeLaParada);
    // Recuadro que recuerda al conductor que este envío tuvo una incidencia:
    // rojo mientras está activa, intermitente si administración ha respondido,
    // verde cuando administración la ha resuelto.
    const incidentBorderClass = stop.incidentStatus === 'resolved'
        ? 'border-emerald-400 border-2 shadow-emerald-100'
        : stop.incidentStatus === 'active'
            ? `border-red-400 border-2 shadow-red-100 ${stop.incidentReply ? 'animate-pulse' : ''}`
            : '';
    return (
        <div id={index === 0 && !dragOverlay ? 'tour-first-card' : undefined} className={`relative ${dragOverlay ? 'w-full' : 'mb-3'} group overflow-hidden rounded-xl`}>
             {!dragOverlay && (
                 <div
                    // Este panel se queda quieto y lo destapa la tarjeta al apartarse, así
                    // que va opaco del tirón: la opacidad ya no marca el avance del gesto,
                    // lo marca cuánto azul se ve. Antes subía de 0 a 1 a lo largo de 100px,
                    // pero daba igual porque el envoltorio entero se movía a la vez y la
                    // tarjeta blanca tapaba el panel al 100% en todo momento.
                    className={`absolute inset-0 flex items-center pl-3 transition-colors duration-150 bg-gradient-to-r ${
                        swipeX > SWIPE_UNASSIGN_THRESHOLD
                            ? 'from-blue-700 to-indigo-900'
                            : 'from-blue-500 to-indigo-700'
                    }`}
                    style={{ opacity: isSwiping ? 1 : 0 }}
                >
                    <div className="flex items-center gap-3 text-white">
                        <div className="bg-white/20 p-2 rounded-full animate-spin-slow">
                            <RotateCcw size={22} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">
                                {swipeX > SWIPE_UNASSIGN_THRESHOLD ? 'Suelta ya' : 'Sigue deslizando'}
                            </span>
                            <span className="text-sm font-extrabold uppercase tracking-tight">Devolver a Asignar</span>
                        </div>
                    </div>
                </div>
             )}

            <div
                id={index === 0 && !dragOverlay ? 'tour-first-card-inner' : undefined}
                onClick={(e) => {
                    if (dragOverlay) return;
                    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.closest('a') === null && e.target.closest('button') === null) {
                        setSelectedShipment(stop);
                        setIsDetailsModalOpen(true);
                    }
                }}
                className={`item-reparto bg-white p-4 rounded-xl shadow-sm border relative mb-0 select-none transition-all duration-200
                    ${isDragging && !dragOverlay ? 'opacity-0' : 'opacity-100'}
                    ${dragOverlay ? 'shadow-2xl ring-1 ring-blue-200 scale-[1.02] bg-white' : ''}
                    ${incidentBorderClass || (dragOverlay ? 'border-blue-200' : 'border-slate-100')}
                    ${isSwiping ? 'shadow-xl ring-1 ring-blue-500/20' : ''}`}
                style={{
                    // Se aparta solo la tarjeta, destapando el panel azul que hay detrás.
                    // Mientras el dedo está encima no puede haber transición o la tarjeta
                    // iría 200ms por detrás; al soltar se devuelve para que vuelva sola.
                    transform: isSwiping ? `translateX(${swipeX}px)` : undefined,
                    transition: isSwiping ? 'none' : undefined
                }}
            >
                <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{
                        backgroundColor: (() => {
                            if (stop.color) return stop.color;
                            if (!clients) return '#3b82f6';
                            const client = clients.find(c => c && c.name === (stop.destinationName || stop.client));
                            return client?.color || '#3b82f6';
                        })()
                    }}
                ></div>
                
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-20 h-12 opacity-70 pointer-events-none flex items-center justify-end z-10 pr-2">
                    <img
                        src={resolverLogo(stop, clienteDeLaParada)}
                        alt="Branding" 
                        className="max-w-full max-h-full object-contain"
                        onError={(e) => { e.target.src = '/logo-sum.svg'; }} 
                    />
                </div>

                <div className="flex gap-3">
                    <div 
                        {...attributes}
                        {...listeners}
                        className="flex flex-col items-center justify-center text-slate-400 bg-slate-50 rounded-lg cursor-move active:cursor-grabbing px-2 py-4 touch-none hover:bg-blue-50 hover:text-blue-500 transition-colors"
                    >
                        <GripVertical size={24} />
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-2 pr-36">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-blue-600">PARADA #{index + 1}</span>
                                    {(() => {
                                        const colorInsignia = {
                                            TSB: 'bg-blue-600 text-white',
                                            XPO: 'bg-amber-400 text-black',
                                            TXT: 'bg-red-600 text-white',
                                        }[insignia] || 'bg-slate-600 text-white';

                                        return (
                                            <>
                                                {insignia && (
                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm ${colorInsignia}`}>
                                                        AGENCIA {insignia}
                                                    </span>
                                                )}
                                                {esDeCamino && (
                                                    <span
                                                        className="text-[9px] font-extrabold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded border border-teal-300 shadow-sm"
                                                        title="El optimizador la ha adelantado porque queda de camino. Arrástrala si prefieres dejarla para después."
                                                    >
                                                        DE CAMINO
                                                    </span>
                                                )}
                                                {Array.isArray(stop.scannedPackages) && stop.scannedPackages.length > 0 && (
                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm ${
                                                        stop.scannedPackages.length >= getPackagesCount(stop)
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-orange-500 text-white'
                                                    }`}>
                                                        {stop.scannedPackages.length}/{getPackagesCount(stop)} BULTOS ESCANEADOS
                                                    </span>
                                                )}
                                                {stop.hasReturn && (
                                                    <span className="text-[9px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1 shadow-sm">
                                                        <RotateCcw size={10} />
                                                        RETORNO
                                                    </span>
                                                )}
                                                {stop.incidentStatus === 'active' && (
                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded border shadow-sm ${stop.incidentReply ? 'bg-red-100 text-red-700 border-red-300 animate-pulse' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                        ⚠️ {stop.incidentReply ? 'RESPUESTA ADMIN' : 'INCIDENCIA'}
                                                    </span>
                                                )}
                                                {stop.incidentStatus === 'resolved' && (
                                                    <span className="text-[9px] font-extrabold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-300 shadow-sm">
                                                        ✅ INCIDENCIA RESUELTA
                                                    </span>
                                                )}
                                                {stop.needsSignatureReturn && (
                                                <span className="text-[9px] font-bold bg-fuchsia-100 text-fuchsia-700 px-1.5 py-0.5 rounded border border-fuchsia-200 flex items-center gap-1 shadow-sm">
                                                    <FileText size={10} />
                                                    DOC. FIRMADO
                                                </span>
                                            )}
                                            {stop.type === 'Recogida' ? (
                                                    <span className="text-[9px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">RECOGIDA</span>
                                                ) : stop.type === 'Recibo' ? (
                                                    <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200">COBRO</span>
                                                ) : (
                                                    <span className="text-[9px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">ENTREGA</span>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                                <h4 className="font-bold text-slate-800 truncate">{stop.destinationName || stop.client}</h4>
                            </div>
                            <div className="absolute right-4 top-2 flex flex-row-reverse gap-1.5 z-20">
                                {(() => {
                                    const isPickup = stop.type === 'Recogida';
                                    const coords = isPickup ? stop.originCoordinates : stop.destinationCoordinates;
                                    const street = isPickup ? stop.originAddress : stop.destinationAddress;
                                    const city   = isPickup ? stop.originCity    : stop.destinationCity;
                                    const zip    = isPickup ? stop.originZip     : stop.destinationZip;

                                    const hasCoords = !!(coords && String(coords).trim());
                                    const hasStreet = !!(street && String(street).trim());
                                    if (!hasCoords && !hasStreet) return null;

                                    // Si tenemos coordenadas exactas → ruta directa (más preciso)
                                    // Si solo tenemos texto → usamos Maps Search (?q=) con calle+CP+ciudad+España
                                    // El parámetro 'q' tiene autocorrección ortográfica; el CP ancla la búsqueda
                                    // al municipio correcto aunque la calle tenga alguna errata.
                                    const mapsHref = hasCoords
                                        ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(String(coords).trim())}`
                                        : (() => {
                                            const parts = [street, zip, city, 'España'].filter(Boolean).map(s => String(s).trim()).filter(Boolean);
                                            return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(parts.join(', '))}`;
                                          })();

                                    return (
                                        <a
                                            id={index === 0 ? 'tour-gps-btn' : undefined}
                                            href={mapsHref}
                                            target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                            className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md border border-blue-100 hover:bg-blue-50 transition-all active:scale-95 flex items-center justify-center font-bold gap-2 text-xs"
                                            title={hasCoords ? 'Calcular Ruta (GPS exacto)' : 'Buscar dirección en Maps'}
                                        >
                                            <MapPin size={20} />
                                        </a>
                                    );
                                })()}
                                {/* LLAMAR — con un solo número llama directo, como siempre. Con
                                    varios (el fijo de la nave y el móvil del encargado) despliega
                                    los dos para elegir, en vez de decidir por el conductor. */}
                                {(() => {
                                    const telefonos = telefonosDeLaParada(stop, clients);
                                    if (telefonos.length === 0) return null;

                                    const botonClass = "p-2.5 bg-white text-emerald-600 rounded-xl shadow-md border border-emerald-100 hover:bg-emerald-50 transition-all active:scale-95 flex items-center justify-center";

                                    if (telefonos.length === 1) {
                                        return (
                                            <a
                                                id={index === 0 ? 'tour-phone-btn' : undefined}
                                                href={`tel:${telefonos[0].numero}`}
                                                onClick={(e) => e.stopPropagation()}
                                                title={`Llamar al ${telefonos[0].esFijo ? 'fijo' : 'móvil'} ${telefonos[0].numero}`}
                                                className={botonClass}
                                            >
                                                <Phone size={20} />
                                            </a>
                                        );
                                    }

                                    return (
                                        <div id={index === 0 ? 'tour-phone-btn' : undefined} className="relative">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setShowPhoneActions(!showPhoneActions); }}
                                                title="Llamar"
                                                className={showPhoneActions
                                                    ? "p-2.5 bg-emerald-600 text-white rounded-xl shadow-md border border-emerald-600 transition-all active:scale-95 flex items-center justify-center"
                                                    : botonClass}
                                            >
                                                <Phone size={20} />
                                            </button>
                                            {showPhoneActions && (
                                                <>
                                                    <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowPhoneActions(false); }} />
                                                    <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 py-1 overflow-hidden animate-in zoom-in-95 fade-in duration-150 origin-top-right">
                                                        {telefonos.map(t => (
                                                            <a
                                                                key={t.numero}
                                                                href={`tel:${t.numero}`}
                                                                onClick={(e) => { e.stopPropagation(); setShowPhoneActions(false); }}
                                                                className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0"
                                                            >
                                                                <Phone size={16} className={t.esFijo ? 'text-slate-400' : 'text-emerald-500'} />
                                                                <span className="flex flex-col items-start leading-tight">
                                                                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                                        {t.esFijo ? 'Fijo' : 'Móvil'}
                                                                    </span>
                                                                    <span className="text-xs font-bold">{t.numero}</span>
                                                                </span>
                                                            </a>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    );
                                })()}
                                <div id={index === 0 ? 'tour-doc-btn' : undefined} className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowDocActions(!showDocActions); }}
                                        className={`p-2.5 rounded-xl shadow-md border transition-all active:scale-95 flex items-center justify-center ${showDocActions ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50'}`}
                                    >
                                        <FileText size={20} />
                                    </button>
                                    {showDocActions && (
                                        <>
                                            <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setShowDocActions(false); }} />
                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 py-1 overflow-hidden animate-in zoom-in-95 fade-in duration-150 origin-top-right">
                                                <button onClick={(e) => { e.stopPropagation(); printShipmentTicket(stop); setShowDocActions(false); }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold border-b border-slate-50">
                                                    <Printer size={16} className="text-slate-400" /> IMPRIMIR TICKET
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); onWhatsAppShare(stop); setShowDocActions(false); }}
                                                    className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold">
                                                    <MessageSquare size={16} className="text-emerald-500" /> ENVIAR WHATSAPP
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="space-y-1 mb-3 pr-36">
                            <p className="text-sm text-slate-600 flex items-start gap-2">
                                <MapIcon size={16} className="shrink-0 mt-0.5 text-slate-400" />
                                <span className="line-clamp-2">{stop.destinationAddress || stop.address}</span>
                            </p>
                            {stop.destinationCity && (
                                <p className="text-xs text-slate-500 pl-6 mb-1">
                                    {stop.destinationCity} {stop.destinationZip && `(${stop.destinationZip})`}
                                </p>
                            )}
                            {/* BULTOS / ARTÍCULOS — una píldora por unidad, inline con wrap */}
                            {(() => {
                                const arts = stop.articles || [];
                                const pkgText = (stop.packages || '').trim();
                                const hasArts = arts.length > 0;
                                if (!hasArts && !pkgText) return null;

                                // Expandir artículos: qty=2 → dos entradas del mismo nombre
                                const pills = hasArts
                                    ? (() => {
                                        // Agrupar artículos iguales: {nombre: cantidadTotal}
                                        const grouped = {};
                                        arts.forEach(a => {
                                            const name = a.name || 'Artículo';
                                            const qty = parseInt(a.quantity) || 1;
                                            grouped[name] = (grouped[name] || 0) + qty;
                                        });
                                        return Object.entries(grouped).map(([name, qty]) => ({
                                            name,
                                            qty
                                        }));
                                    })()
                                    : [{ name: pkgText, qty: 1 }];

                                return (
                                    <div className="pl-6 mb-1 flex flex-wrap gap-1">
                                        {pills.map((item, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 bg-blue-50 border border-blue-100 rounded-md px-2 py-0.5 text-[11px] font-bold text-blue-700 shadow-sm"
                                            >
                                                <Package size={10} className="text-blue-400 shrink-0" />
                                                {item.qty > 1 ? `${item.qty}x ` : ''}{item.name}
                                            </span>
                                        ))}
                                    </div>
                                );
                            })()}
                            {(() => {
                                const normalizeText = (val) => String(val || '').trim().toLowerCase();
                                const sName = normalizeText(stop.originName || stop.client);
                                const dName = normalizeText(stop.destinationName || stop.client);
                                const senderClient = clients?.find(c => normalizeText(c.name) === sName || normalizeText(c.legalName) === sName);
                                const destClient = clients?.find(c => normalizeText(c.name) === dName || normalizeText(c.legalName) === dName);
                                const model = new Shipment({
                                    ...stop,
                                    billingType: senderClient?.billingType || stop.billingType || 'Clientes Habituales',
                                    destinationBillingType: destClient?.billingType || stop.destinationBillingType || null
                                });
                                const isDebido = stop.porteType === 'Debido';
                                // Igual que amountToCollectAtDelivery() en el modelo: si customAmount
                                // no da un número válido (0, NaN, vacío...) se cae a `amount`, nunca se
                                // para en cero. Antes se miraba `!== undefined`, así que un customAmount
                                // puesto a NaN por la ficha del admin (ver el arreglo en
                                // ShipmentDetailsModal, la conversión de "€7.00" con parseFloat) dejaba
                                // esta tarjeta sin la etiqueta COBRAR aunque el modal de entrega sí
                                // pedía el cobro tirando de `amount`.
                                const porteValNum = parseAmount(stop.customAmount) || parseAmount(stop.amount) || 0;
                                const porteVal = porteValNum > 0 ? porteValNum : (String(stop.amount).toLowerCase() === 'tarifa' ? 'Tarifa' : null);
                                const hasCod = stop.hasCod && parseAmount(stop.codAmount) > 0;
                                let toCollectStrings = [];
                                if (stop.type === 'Recogida') {
                                    if (!isDebido && model.isCashBilling(model.billingType) && porteVal && !stop.portePaid) toCollectStrings.push(`Porte: ${porteVal}€`);
                                } else {
                                    if (isDebido && !model.isInvoiceBilling(model.destinationBillingType) && porteVal && !stop.portePaid) toCollectStrings.push(`Porte: ${porteVal}€`);
                                    if (hasCod && !stop.codPaid) toCollectStrings.push(`Reembolso: ${parseAmount(stop.codAmount)}€`);
                                }
                                if (toCollectStrings.length === 0) return null;
                                return (
                                    <div className="flex items-center gap-2 pl-6">
                                          <span id="tour-cobros-label" className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm flex items-center gap-1.5 ring-4 ring-emerald-500/5">
                                            <Wallet size={12} className="text-emerald-500" />
                                            COBRAR: {toCollectStrings.join(' + ')}
                                        </span>
                                    </div>
                                );
                            })()}
                            {stop.incidentReply && (
                                <div className="mx-3 mb-2 mt-1 px-3 py-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl shadow-sm animate-pulse duration-[2000ms]">
                                    <div className="flex items-center gap-1.5 mb-0.5">
                                        <MessageSquare size={12} className="text-amber-600" />
                                        <p className="text-[9px] font-extrabold text-amber-700 uppercase tracking-tight">Instr. de Oficina:</p>
                                    </div>
                                    <p className="text-xs font-bold text-amber-900 leading-tight">"{stop.incidentReply}"</p>
                                </div>
                            )}
                            {(() => {
                                const obs = (stop.observations || '').replace(/\[COBRO PENDIENTE\]/gi, '').trim();
                                if (!obs) return null;
                                return (
                                    <div className="mx-3 mb-2 mt-1 px-3 py-2 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-xl shadow-sm animate-pulse duration-[2000ms]">
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                            <MessageSquare size={12} className="text-yellow-600" />
                                            <p className="text-[9px] font-extrabold text-yellow-700 uppercase tracking-tight">Observaciones:</p>
                                        </div>
                                        <p className="text-xs font-bold text-yellow-900 leading-tight">"{obs}"</p>
                                    </div>
                                );
                            })()}
                        </div>

                        {!dragOverlay && (
                            <div className="flex gap-2 items-stretch mt-1">
                                <button
                                    id={index === 0 ? 'tour-incident-btn' : undefined}
                                    onClick={(e) => { e.stopPropagation(); setIncidentShipment(stop); setIsIncidentModalOpen(true); }}
                                    className="w-[25%] bg-red-50 text-red-600 py-2.5 rounded-xl font-bold text-[10px] shadow-sm hover:bg-red-100 transition-all flex items-center justify-center gap-1 border border-red-100 shrink-0"
                                >
                                    <AlertTriangle size={16} />
                                    <span>Incidencia</span>
                                </button>
                                {stop.type === 'Recogida' ? (
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (onPickupClick) {
                                                onPickupClick(stop);
                                            } else {
                                                setPickupToConvert(stop);
                                                setIsNoteModalOpen(true);
                                            }
                                        }}
                                        className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl font-bold text-xs shadow-md hover:bg-purple-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        <PackagePlus size={20} />
                                        <span>Realizar Recogida</span>
                                    </button>
                                ) : (
                                    <button
                                        id={index === 0 ? 'tour-deliver-btn' : undefined}
                                        onClick={(e) => { 
                                            e.stopPropagation(); 
                                            const scannedCount = Array.isArray(stop.scannedPackages) ? stop.scannedPackages.length : 0;
                                            const totalPackages = getPackagesCount(stop);
                                            if (scannedCount > 0 && scannedCount < totalPackages) {
                                                if (window.confirm(`¡ATENCIÓN!\nSolo has escaneado ${scannedCount} de ${totalPackages} bultos.\n\nAl ser una entrega parcial, serás redirigido para reportar la incidencia y adjuntar una foto si es necesario. ¿Deseas continuar?`)) {
                                                    if (setIncidentInitialReason) setIncidentInitialReason(`Entrega parcial: se entregan ${scannedCount} de ${totalPackages} bultos al cliente. Faltan bultos por entregar.`);
                                                    setIncidentShipment(stop);
                                                    setIsIncidentModalOpen(true);
                                                }
                                            } else {
                                                setDeliveryModalShipment(stop); 
                                            }
                                        }}
                                        className="flex-1 bg-green-600 text-white py-2.5 rounded-xl font-bold text-xs shadow-md hover:bg-green-700 transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
                                    >
                                        <CheckCircle size={20} />
                                        <span>{stop.type === 'Recibo' ? 'CONFIRMAR COBRO' : 'CONFIRMAR ENTREGA'}</span>
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
});

const SortableItem = React.memo((props) => {
    const { stop } = props;
    const [swipeX, setSwipeX] = useState(0);
    const [isSwiping, setIsSwiping] = useState(false);
    const [showDocActions, setShowDocActions] = useState(false);
    const cardRef = useRef(null);
    const startX = useRef(0);
    const startY = useRef(0);
    // 'undecided' | 'horizontal' | 'vertical'
    const gestureDirection = useRef('undecided');
    const swipeXRef = useRef(0); // mirror for use inside native listeners
    const DIRECTION_THRESHOLD = 10; // px before we lock direction

    const sortable = useSortable({ id: stop.id, disabled: isSwiping });
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = sortable;

    // Combine refs: dnd-kit's setNodeRef + our cardRef
    const combinedRef = useCallback((node) => {
        cardRef.current = node;
        setNodeRef(node);
    }, [setNodeRef]);

    // Espejo de isDragging para los listeners nativos (se registran una sola vez y
    // capturarían un valor obsoleto). Sin esto, desviarte a la derecha mientras
    // arrastras activa el swipe, que a su vez desactiva el sortable y mata el arrastre.
    const isDraggingRef = useRef(false);
    useEffect(() => {
        isDraggingRef.current = isDragging;
    }, [isDragging]);

    // Use fully PASSIVE native event listeners — Android Chrome scroll fix.
    // CSS touch-action:pan-y already tells the browser to only scroll vertically,
    // so we NEVER need preventDefault(). All listeners are passive → Chrome can
    // start scrolling immediately on the compositor thread without waiting for JS.
    useEffect(() => {
        const el = cardRef.current;
        if (!el) return;

        const onTouchStart = (e) => {
            startX.current = e.touches[0].clientX;
            startY.current = e.touches[0].clientY;
            gestureDirection.current = 'undecided';
        };

        const onTouchMove = (e) => {
            // Si dnd-kit ya está reordenando, el swipe no debe interferir
            if (isDraggingRef.current) return;

            const deltaX = e.touches[0].clientX - startX.current;
            const deltaY = e.touches[0].clientY - startY.current;
            const absDeltaX = Math.abs(deltaX);
            const absDeltaY = Math.abs(deltaY);

            // Phase 1: decide direction once we pass the threshold
            if (gestureDirection.current === 'undecided') {
                if (absDeltaX < DIRECTION_THRESHOLD && absDeltaY < DIRECTION_THRESHOLD) {
                    return; // not enough movement to decide
                }
                // Lock horizontal only if X clearly dominates AND moving right
                gestureDirection.current = (absDeltaX > absDeltaY * 1.5 && deltaX > 0)
                    ? 'horizontal' : 'vertical';
            }

            // Phase 2: only update swipe state for horizontal gestures
            if (gestureDirection.current === 'horizontal') {
                const clampedX = Math.max(0, deltaX);
                swipeXRef.current = clampedX;
                setIsSwiping(true);
                setSwipeX(clampedX);
            }
            // vertical → do nothing, browser scrolls natively via touch-action:pan-y
        };

        const onTouchEnd = () => {
            if (swipeXRef.current > SWIPE_UNASSIGN_THRESHOLD) {
                if (window.navigator.vibrate) window.navigator.vibrate(50);
                props.onUnassign(stop);
            }
            swipeXRef.current = 0;
            setSwipeX(0);
            setIsSwiping(false);
            gestureDirection.current = 'undecided';
        };

        // ALL passive:true → Chrome compositor handles scroll without waiting for JS
        el.addEventListener('touchstart', onTouchStart, { passive: true });
        el.addEventListener('touchmove', onTouchMove, { passive: true });
        el.addEventListener('touchend', onTouchEnd, { passive: true });

        return () => {
            el.removeEventListener('touchstart', onTouchStart);
            el.removeEventListener('touchmove', onTouchMove);
            el.removeEventListener('touchend', onTouchEnd);
        };
    }, [stop, props.onUnassign]);

    const style = {
        // El arrastre lateral NO se aplica aquí: movería el envoltorio entero, panel
        // azul incluido, y la tarjeta blanca lo seguiría tapando al 100%. El panel
        // tiene que quedarse quieto y ser la tarjeta la que se aparte (ver la tarjeta
        // en ShipmentCardUI). Aquí solo va la transformación de reordenar de dnd-kit.
        transform: CSS.Transform.toString(transform),
        transition: isDragging || isSwiping ? 'none' : transition,
        zIndex: isDragging ? 2 : undefined,
        willChange: 'transform, opacity',
        // Allow vertical scroll natively; horizontal swipe is managed by JS
        touchAction: 'pan-y',
    };

    return (
        <div ref={combinedRef} style={style}>
            <ShipmentCardUI 
                {...props} 
                isDragging={isDragging} 
                isSwiping={isSwiping} 
                swipeX={swipeX}
                listeners={listeners}
                attributes={attributes}
                showDocActions={showDocActions}
                setShowDocActions={setShowDocActions}
            />
        </div>
    );
});



// ─── DRIVER VACATIONS PANEL (Read-only, shown to driver) ───────────────────
const DriverVacationsPanel = ({ currentDriverId, onClose }) => {
    const [absences, setAbsences]   = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const year = new Date().getFullYear();

    useEffect(() => {
        const fetch = async () => {
            try {
                const { data } = await supabase
                    .from('driver_absences')
                    .select('*')
                    .eq('driver_id', String(currentDriverId))
                    .gte('date', `${year}-01-01`)
                    .lte('date', `${year}-12-31`)
                    .order('date', { ascending: true });
                setAbsences(data || []);
            } finally {
                setIsLoading(false);
            }
        };
        fetch();
    }, [currentDriverId]);

    const ABSENCE_INFO = {
        'Vacaciones':      { emoji: '🏖️', color: 'bg-blue-100 text-blue-700 border-blue-200' },
        'Día Libre':       { emoji: '☀️',  color: 'bg-amber-100 text-amber-700 border-amber-200' },
        'Baja Médica':     { emoji: '🏥',  color: 'bg-red-100 text-red-700 border-red-200' },
        'Asuntos Propios': { emoji: '📋',  color: 'bg-purple-100 text-purple-700 border-purple-200' },
    };

    const vacUsed      = absences.filter(a => a.type === 'Vacaciones').length;
    const vacRemaining = 22 - vacUsed;

    // Group by month
    const byMonth = absences.reduce((acc, a) => {
        const m = a.date.slice(0, 7);
        if (!acc[m]) acc[m] = [];
        acc[m].push(a);
        return acc;
    }, {});

    return (
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex flex-col animate-in fade-in">
            <div className="bg-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-blue-100 p-2 rounded-xl text-blue-600 text-xl">🏖️</div>
                    <h2 className="text-lg font-bold text-slate-800">Mis Vacaciones {year}</h2>
                </div>
                <button onClick={onClose} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                    <X size={20} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Counter */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-blue-50 rounded-2xl p-4 text-center border border-blue-100">
                        <p className="text-3xl font-black text-blue-600">{vacUsed}</p>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wide mt-1">Días usados</p>
                    </div>
                    <div className={`rounded-2xl p-4 text-center border ${vacRemaining >= 0 ? 'bg-emerald-50 border-emerald-100' : 'bg-red-50 border-red-100'}`}>
                        <p className={`text-3xl font-black ${vacRemaining >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{Math.max(0, vacRemaining)}</p>
                        <p className={`text-[10px] font-bold uppercase tracking-wide mt-1 ${vacRemaining >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>Días restantes</p>
                    </div>
                    <div className="bg-slate-50 rounded-2xl p-4 text-center border border-slate-100">
                        <p className="text-3xl font-black text-slate-600">22</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mt-1">Total año</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="text-center py-10 text-slate-400 animate-pulse font-bold">Cargando...</div>
                ) : absences.length === 0 ? (
                    <div className="bg-white rounded-2xl p-8 text-center shadow-sm border border-slate-100">
                        <p className="text-4xl mb-2">🏖️</p>
                        <p className="text-slate-500 font-bold">No tienes ausencias registradas este año.</p>
                        <p className="text-xs text-slate-400 mt-1">Las vacaciones las gestiona administración.</p>
                    </div>
                ) : (
                    Object.entries(byMonth).map(([monthKey, items]) => {
                        const label = new Date(monthKey + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                        return (
                            <div key={monthKey}>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider capitalize mb-2">{label}</p>
                                <div className="space-y-2">
                                    {items.map(a => {
                                        const info  = ABSENCE_INFO[a.type] || ABSENCE_INFO['Vacaciones'];
                                        const dLabel = new Date(a.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
                                        return (
                                            <div key={a.id} className={`flex items-center gap-3 px-4 py-3 rounded-2xl border ${info.color}`}>
                                                <span className="text-xl">{info.emoji}</span>
                                                <div>
                                                    <p className="text-sm font-bold capitalize">{dLabel}</p>
                                                    <p className="text-[10px] opacity-60">{a.type}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })
                )}

                <p className="text-center text-[10px] text-slate-400 pb-4">
                    Las vacaciones son gestionadas por administración. Si hay algún error, contacta con tu responsable.
                </p>
            </div>
        </div>
    );
};

const TimeLogSection = ({ currentDriverId, driverName, handleLogoutWithSafety }) => {
    const [status, setStatus] = useState('loading'); // loading, pending_in, working, finished, paused, on_absence, weekend, company_holiday
    const [logId, setLogId] = useState(null);
    const [absenceInfo, setAbsenceInfo] = useState(null);
    const [holidayInfo, setHolidayInfo] = useState(null);

    useEffect(() => {
        const checkStatus = async () => {
            if (!currentDriverId) return;
            try {
                const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];

                // ── 1. Check weekend (Saturday=6, Sunday=0) ──
                const todayDate = new Date(today + 'T12:00:00');
                const dow = todayDate.getDay();
                if (dow === 0 || dow === 6) {
                    setStatus('weekend');
                    return;
                }

                // ── 2. Check company-wide blocked days ──
                try {
                    const { data: settingsData } = await supabase
                        .from('settings').select('value').eq('key', 'company_blocked_days').maybeSingle();
                    if (settingsData?.value) {
                        const blocked = JSON.parse(settingsData.value);
                        const match = blocked.find(d => d.date === today);
                        if (match) {
                            setHolidayInfo(match);
                            setStatus('company_holiday');
                            return;
                        }
                    }
                } catch (_) {}

                const { data, error } = await supabase
                    .from('time_logs')
                    .select('*')
                    .eq('driver_id', currentDriverId)
                    .eq('date', today)
                    .order('clock_in', { ascending: false });

                if (error) throw error;
                const latestLog = data && data.length > 0 ? data[0] : null;

                if (!latestLog) {
                    // ── Check if today is an absence day before allowing clock-in ──
                    const { data: absData } = await supabase
                        .from('driver_absences')
                        .select('*')
                        .eq('driver_id', String(currentDriverId))
                        .eq('date', today)
                        .maybeSingle();

                    if (absData) {
                        setAbsenceInfo(absData);
                        setStatus('on_absence');
                    } else {
                        setStatus('pending_in');
                    }
                } else if (!latestLog.clock_out) {
                    setStatus('working');
                    setLogId(latestLog.id);
                } else {
                    const currentHour = new Date().getHours();
                    const hasAfternoonShift = data.some(log => {
                        const clockInDate = new Date(log.clock_in);
                        return clockInDate.getHours() >= 16;
                    });

                    if (hasAfternoonShift) {
                        setStatus('finished');
                    } else {
                        if (currentHour < 16) {
                            setStatus('paused');
                        } else {
                            setStatus('pending_in');
                        }
                    }
                }
            } catch (e) {
                console.error("Error fetching time log status:", e);
                setStatus('pending_in');
            }
        };
        
        checkStatus();
        const interval = setInterval(checkStatus, 15000);
        
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                checkStatus();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            clearInterval(interval);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [currentDriverId]);

    const handleClockIn = async () => {
        try {
            const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
            const { data, error } = await supabase.from('time_logs').insert([{
                driver_id: currentDriverId,
                driver_name: driverName || 'Conductor',
                date: today,
                clock_in: new Date().toISOString()
            }]).select('id').single();

            if (error) throw error;
            setStatus('working');
            setLogId(data.id);
            alert("¡Jornada iniciada con éxito! Que tengas una buena ruta.");
        } catch (e) {
            console.error("Error clocking in:", e);
            alert("Error al iniciar la jornada. Revisa tu conexión.");
        }
    };

    const handleClockOut = async () => {
        if (!window.confirm('¿Seguro que quieres fichar la salida? (Si es el descanso de mediodía, se registrará la salida y podrás volver a fichar por la tarde).')) return;
        try {
            if (logId) {
                await supabase.from('time_logs').update({
                    clock_out: new Date().toISOString()
                }).eq('id', logId);
            } else {
                const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('time_logs')
                    .select('id')
                    .eq('driver_id', currentDriverId)
                    .eq('date', today)
                    .is('clock_out', null)
                    .limit(1);
                
                if (data && data.length > 0) {
                    await supabase.from('time_logs').update({
                        clock_out: new Date().toISOString()
                    }).eq('id', data[0].id);
                }
            }
            setStatus('finished');
            if (handleLogoutWithSafety) {
                handleLogoutWithSafety();
            } else {
                alert("¡Jornada finalizada! Hasta mañana.");
            }
        } catch (e) {
            console.error("Error clocking out:", e);
            alert("Error al registrar la salida.");
        }
    };

    if (status === 'loading') {
        return <div className="py-4 text-slate-400 text-sm font-bold animate-pulse text-center w-full mb-8">Comprobando estado de fichaje...</div>;
    }

    if (status === 'weekend') {
        const todayDate = new Date();
        const issunday = todayDate.getDay() === 0;
        return (
            <div className="w-full bg-rose-50 text-rose-700 py-5 rounded-xl border-2 border-rose-200 flex flex-col items-center justify-center gap-1.5 mb-8">
                <span className="text-3xl">{issunday ? '🙏' : '💤'}</span>
                <span className="text-sm font-black text-rose-800">{issunday ? 'Domingo' : 'Sábado'} — Día de descanso</span>
                <span className="text-xs font-semibold text-rose-600">No hay jornada laboral hoy.</span>
                <span className="text-[10px] text-rose-400 mt-0.5">Disfruta tu descanso 😊</span>
            </div>
        );
    }

    if (status === 'company_holiday') {
        return (
            <div className="w-full bg-rose-50 text-rose-700 py-5 rounded-xl border-2 border-rose-200 flex flex-col items-center justify-center gap-1.5 mb-8">
                <span className="text-3xl">🏠</span>
                <span className="text-sm font-black text-rose-800">{holidayInfo?.reason || 'Día no laborable'}</span>
                <span className="text-xs font-semibold text-rose-600">La empresa tiene cerrado hoy. No hay jornada.</span>
                <span className="text-[10px] text-rose-400 mt-0.5">Si crees que es un error, contacta con administración.</span>
            </div>
        );
    }

    if (status === 'on_absence') {
        const ABSENCE_EMOJIS = { 'Vacaciones': '🏖️', 'Día Libre': '☀️', 'Baja Médica': '🏥', 'Asuntos Propios': '📋' };
        return (
            <div className="w-full bg-blue-50 text-blue-700 py-5 rounded-xl border-2 border-blue-200 flex flex-col items-center justify-center gap-1.5 mb-8">
                <span className="text-3xl">{ABSENCE_EMOJIS[absenceInfo?.type] || '🏖️'}</span>
                <span className="text-sm font-black text-blue-800">{absenceInfo?.type || 'Ausencia registrada'}</span>
                <span className="text-xs font-semibold text-blue-600">El fichaje está bloqueado este día.</span>
                <span className="text-[10px] text-blue-400 mt-0.5">Si es un error, contacta con administración.</span>
            </div>
        );
    }

    if (status === 'finished') {
        return (
            <div className="w-full bg-slate-100 text-slate-500 font-bold py-4 rounded-xl shadow-inner flex flex-col items-center justify-center gap-2 mb-8">
                <CheckCircle size={24} className="text-slate-400" />
                <span>Jornada Finalizada por hoy</span>
                <button onClick={handleLogoutWithSafety} className="mt-2 text-xs text-red-500 hover:underline">Cerrar Sesión</button>
            </div>
        );
    }

    if (status === 'paused') {
        return (
            <div className="w-full bg-amber-50 text-amber-700 font-bold py-4 rounded-xl border border-amber-100 flex flex-col items-center justify-center gap-1.5 mb-8">
                <Clock size={24} className="text-amber-500 animate-pulse" />
                <span>Turno de mañana finalizado</span>
                <span className="text-[10px] font-medium text-amber-600">El turno de tarde se iniciará automáticamente a las 16:00.</span>
                <button 
                    onClick={handleClockIn} 
                    className="mt-2 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1"
                >
                    <Clock size={12} /> Fichar Entrada Tarde (Manual)
                </button>
            </div>
        );
    }

    if (status === 'pending_in') {
        return (
            <button
                onClick={handleClockIn}
                className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-xl shadow-lg shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2 mb-8"
            >
                <Clock size={20} />
                Empezar Jornada (Fichar Entrada)
            </button>
        );
    }

    return (
        <button
            onClick={handleClockOut}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-4 rounded-xl shadow-lg shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-2 mb-8"
        >
            <LogOut size={20} />
            Cerrar Jornada (Fichar Salida)
        </button>
    );
};

// ─── DRIVER TIME LOGS HISTORY (Legal compliance) ───
// Utility for secure cryptographic hashing (SHA-256) of driver PINs
const hashPIN = async (pin) => {
    if (!pin) return '';
    const msgBuffer = new TextEncoder().encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
};

const DriverTimeLogsHistory = ({ currentDriverId, driverName }) => {
    const [logs, setLogs] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isVisible, setIsVisible] = useState(false);
    const [isConfirmed, setIsConfirmed] = useState(false);
    const [confirmedAt, setConfirmedAt] = useState(null);

    // Dynamic month selection
    const monthOptions = useMemo(() => {
        const options = [];
        const d = new Date();
        for (let i = 0; i < 6; i++) {
            options.push(d.toISOString().slice(0, 7));
            d.setMonth(d.getMonth() - 1);
        }
        return options;
    }, []);

    const [selectedMonth, setSelectedMonth] = useState(() => {
        const d = new Date();
        // Si estamos en los primeros 10 días, preseleccionar el mes anterior
        if (d.getDate() <= 10) {
            d.setMonth(d.getMonth() - 1);
        }
        return d.toISOString().slice(0, 7);
    });

    const confirmKey = `timelog_confirm_${currentDriverId}_${selectedMonth}`;
    const activeMonthStr = new Date().toISOString().slice(0, 7);
    const isMonthInProgress = selectedMonth >= activeMonthStr;

    // PIN Signature States
    const [pinModalMode, setPinModalMode] = useState(null); // null, 'create', 'confirm'
    const [pinInput, setPinInput] = useState('');
    const [pinInputConfirm, setPinInputConfirm] = useState('');
    const [pinError, setPinError] = useState('');

    useEffect(() => {
        if (!currentDriverId) return;
        const fetchData = async () => {
            setIsLoading(true);
            setIsConfirmed(false);
            setConfirmedAt(null);
            try {
                const startOfMonth = `${selectedMonth}-01`;
                const endOfMonth = new Date(new Date(startOfMonth).getFullYear(), new Date(startOfMonth).getMonth() + 1, 0).toISOString().split('T')[0];
                
                const [logsResult, confirmResult, visibilityResult] = await Promise.all([
                    supabase.from('time_logs')
                        .select('*')
                        .eq('driver_id', currentDriverId)
                        .gte('date', startOfMonth)
                        .lte('date', endOfMonth)
                        .order('date', { ascending: true })
                        .order('clock_in', { ascending: true }),
                    supabase.from('settings')
                        .select('value')
                        .eq('key', 'timelog_confirmations')
                        .maybeSingle(),
                    supabase.from('settings')
                        .select('value')
                        .eq('key', 'showTimeLogsToDrivers')
                        .maybeSingle()
                ]);

                setLogs(logsResult.data || []);

                // Check visibility setting
                setIsVisible(visibilityResult.data?.value === 'true');

                // Check if this driver+month is confirmed
                if (confirmResult.data?.value) {
                    try {
                        const confirmations = JSON.parse(confirmResult.data.value);
                        const found = confirmations.find(c => c.key === confirmKey);
                        if (found) {
                            setIsConfirmed(true);
                            setConfirmedAt(found.timestamp);
                        }
                    } catch(e) {}
                }
            } catch (e) {
                console.error('Error fetching driver time logs:', e);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, [currentDriverId, selectedMonth]);

    const proceedWithSignature = async () => {
        try {
            const { data: existing } = await supabase.from('settings').select('value').eq('key', 'timelog_confirmations').maybeSingle();
            let confirmations = [];
            if (existing?.value) { try { confirmations = JSON.parse(existing.value); } catch(e) {} }
            const now = new Date().toISOString();
            confirmations.push({
                key: confirmKey,
                driverId: currentDriverId,
                driverName: driverName || 'Conductor',
                month: selectedMonth,
                timestamp: now,
                totalHours: totalHours.toFixed(2),
                totalDays: logs.length
            });
            await supabase.from('settings').upsert({ key: 'timelog_confirmations', value: JSON.stringify(confirmations) });
            setIsConfirmed(true);
            setConfirmedAt(now);
            setPinModalMode(null);
            alert('¡Registro mensual de jornada firmado digitalmente con éxito y bloqueado para el mes!');
        } catch(e) {
            console.error('Error al guardar firma:', e);
            setPinError('Error crítico al firmar en la base de datos.');
        }
    };

    const handleConfirm = async () => {
        setIsLoading(true);
        setPinError('');
        try {
            const { data: driverRes, error: driverErr } = await supabase
                .from('drivers')
                .select('*')
                .eq('id', currentDriverId)
                .single();

            if (driverErr || !driverRes) {
                alert('Error al acceder a los datos de firma. Comprueba tu conexión.');
                setIsLoading(false);
                return;
            }

            const driverObj = driverRes.data || {};
            const pinHash = driverObj.signaturePinHash;

            setPinInput('');
            setPinInputConfirm('');
            if (!pinHash) {
                setPinModalMode('create');
            } else {
                setPinModalMode('confirm');
            }
        } catch(e) {
            console.error('Error pre-firma:', e);
            alert('Error al iniciar el proceso de firma.');
        } finally {
            setIsLoading(false);
        }
    };

    const formatTime = (iso) => {
        if (!iso) return '--:--';
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const totalHours = logs.reduce((sum, log) => {
        if (!log.clock_in || !log.clock_out) return sum;
        return sum + (new Date(log.clock_out) - new Date(log.clock_in)) / (1000 * 60 * 60);
    }, 0);

    const monthLabel = new Date(selectedMonth + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    if (isLoading) {
        return <div className="p-6 text-center text-slate-400 text-sm animate-pulse">Cargando fichajes...</div>;
    }

    if (!isVisible) {
        return null;
    }

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden relative">
            <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex justify-between items-center flex-wrap gap-2">
                <div>
                    <h3 className="font-bold text-indigo-800 text-sm flex items-center gap-2">
                        <Clock size={16} /> Mis Fichajes del Mes
                    </h3>
                    <p className="text-[10px] text-indigo-500 mt-0.5">Registro de jornada según art. 34.9 ET (RDL 8/2019)</p>
                </div>
                <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="px-3 py-1.5 bg-white border border-indigo-200 rounded-xl text-xs font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 shadow-sm outline-none"
                >
                    {monthOptions.map(m => {
                        const label = new Date(m + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
                        return (
                            <option key={m} value={m} className="capitalize">
                                {label}
                            </option>
                        );
                    })}
                </select>
            </div>
            <div className="divide-y divide-slate-100">
                {/* Summary */}
                <div className="p-4 flex items-center justify-between bg-slate-50">
                    <div>
                        <span className="text-xs font-bold text-slate-500 uppercase">{monthLabel}</span>
                        <p className="text-lg font-extrabold text-slate-800">{totalHours.toFixed(1)}h <span className="text-xs font-bold text-slate-400">en {logs.length} días</span></p>
                    </div>
                    {isConfirmed ? (
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] font-bold bg-green-100 text-green-700 px-3 py-1 rounded-full flex items-center gap-1">
                                <CheckCircle size={12} /> Confirmado
                            </span>
                            {confirmedAt && <span className="text-[9px] text-slate-400 mt-1">{new Date(confirmedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>}
                        </div>
                    ) : isMonthInProgress ? (
                        <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-xl text-center max-w-[200px]" title="Este mes todavía está en curso. Podrás firmarlo cuando acabe.">
                            ⏳ En curso (No firmable)
                        </span>
                    ) : (
                        <button
                            onClick={handleConfirm}
                            disabled={logs.length === 0}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all disabled:opacity-40 disabled:shadow-none flex items-center gap-1.5"
                        >
                            <CheckCircle size={14} /> Confirmar Horas
                        </button>
                    )}
                </div>

                {/* Log list */}
                {logs.length === 0 ? (
                    <div className="p-6 text-center text-slate-400">
                        <p className="text-2xl mb-1">📭</p>
                        <p className="text-xs font-medium">No hay fichajes este mes</p>
                    </div>
                ) : (
                    <div className="max-h-64 overflow-y-auto">
                        {logs.map(log => {
                            const hrs = log.clock_in && log.clock_out ? ((new Date(log.clock_out) - new Date(log.clock_in)) / (1000 * 60 * 60)).toFixed(1) : '-';
                            const dayName = new Date(log.date).toLocaleDateString('es-ES', { weekday: 'short', day: '2-digit', month: 'short' });
                            return (
                                <div key={log.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 transition-colors">
                                    <span className="text-xs font-medium text-slate-600 capitalize w-24">{dayName}</span>
                                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">{formatTime(log.clock_in)}</span>
                                    <span className="text-slate-300 text-xs">→</span>
                                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${log.clock_out ? 'text-red-600 bg-red-50' : 'text-amber-500 bg-amber-50 italic'}`}>
                                        {log.clock_out ? formatTime(log.clock_out) : 'Activo'}
                                    </span>
                                    <span className="text-xs font-extrabold text-slate-700 w-12 text-right">{hrs}h</span>
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* Legal footer */}
                <div className="p-3 bg-slate-50">
                    <p className="text-[9px] text-slate-400 text-center leading-relaxed">
                        Al pulsar "Confirmar Horas" declaras que los registros mostrados son correctos, conforme al art. 34.9 del Estatuto de los Trabajadores.
                    </p>
                </div>
            </div>

            {/* PIN Signature Modals */}
            {pinModalMode && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in zoom-in-95 duration-200 p-6 flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                            <h3 className="font-bold text-slate-800 text-base">
                                {pinModalMode === 'create' ? 'Configurar PIN de Firma' : 'Firma Digital de Jornada'}
                            </h3>
                            <button onClick={() => setPinModalMode(null)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        {pinModalMode === 'create' ? (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Para firmar tus horas mensuales de forma 100% legal, debes crear un **PIN de Firma de 4 dígitos**. Este PIN será privado e intransferible.
                                </p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Introduce tu PIN de 4 dígitos</label>
                                        <input
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={4}
                                            value={pinInput}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '');
                                                setPinInput(val);
                                            }}
                                            placeholder="••••"
                                            className="w-full text-center text-xl font-bold py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all tracking-widest bg-slate-50"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Repite el PIN para confirmar</label>
                                        <input
                                            type="password"
                                            inputMode="numeric"
                                            pattern="[0-9]*"
                                            maxLength={4}
                                            value={pinInputConfirm}
                                            onChange={(e) => {
                                                const val = e.target.value.replace(/[^0-9]/g, '');
                                                setPinInputConfirm(val);
                                            }}
                                            placeholder="••••"
                                            className="w-full text-center text-xl font-bold py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all tracking-widest bg-slate-50"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    Introduce tu PIN de 4 dígitos para firmar el registro de jornada del mes de **{monthLabel}** ({totalHours.toFixed(1)}h trabajadas).
                                </p>
                                <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-xs text-amber-900 leading-relaxed font-semibold italic">
                                    "Declaro bajo mi responsabilidad que el registro de jornada mensual detallado es correcto y refleja fielmente las horas trabajadas."
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">PIN de Firma de 4 dígitos</label>
                                    <input
                                        type="password"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        maxLength={4}
                                        value={pinInput}
                                        onChange={(e) => {
                                            const val = e.target.value.replace(/[^0-9]/g, '');
                                            setPinInput(val);
                                        }}
                                        placeholder="••••"
                                        className="w-full text-center text-xl font-bold py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500/20 outline-none transition-all tracking-widest bg-slate-50"
                                    />
                                </div>
                            </div>
                        )}

                        {pinError && (
                            <p className="text-xs font-bold text-red-500 text-center animate-pulse">{pinError}</p>
                        )}

                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => setPinModalMode(null)}
                                className="w-1/3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-xl transition-all text-xs"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={async () => {
                                    setPinError('');
                                    if (pinModalMode === 'create') {
                                        if (!/^\d{4}$/.test(pinInput)) {
                                            setPinError('El PIN debe tener exactamente 4 números.');
                                            return;
                                        }
                                        if (pinInput !== pinInputConfirm) {
                                            setPinError('Los PINs introducidos no coinciden.');
                                            return;
                                        }
                                        try {
                                            const hash = await hashPIN(pinInput);
                                            const { data: driverRes } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                                            const driverObj = driverRes || {};
                                            const driverDataObj = driverObj.data || {};
                                            const updatedData = { ...driverDataObj, signaturePinHash: hash };
                                            
                                            const { error } = await supabase
                                                .from('drivers')
                                                .update({ data: updatedData })
                                                .eq('id', currentDriverId);

                                            if (error) throw error;
                                            await proceedWithSignature();
                                        } catch(e) {
                                            console.error('Error guardando PIN:', e);
                                            setPinError('Error al guardar el PIN.');
                                        }
                                    } else {
                                        if (!/^\d{4}$/.test(pinInput)) {
                                            setPinError('Introduce un PIN de 4 números.');
                                            return;
                                        }
                                        try {
                                            const hash = await hashPIN(pinInput);
                                            const { data: driverRes } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                                            const driverObj = driverRes || {};
                                            const driverDataObj = driverObj.data || {};
                                            
                                            if (driverDataObj.signaturePinHash === hash) {
                                                await proceedWithSignature();
                                            } else {
                                                setPinError('El PIN introducido es incorrecto.');
                                            }
                                        } catch(e) {
                                            console.error('Error al validar firma:', e);
                                            setPinError('PIN incorrecto o error de conexión.');
                                        }
                                    }
                                }}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 text-xs"
                            >
                                <CheckCircle size={14} />
                                {pinModalMode === 'create' ? 'Configurar y Firmar' : 'Confirmar y Firmar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const DriverTimeLogAlerts = ({ currentDriverId }) => {
    const [alerts, setAlerts] = useState([]);

    useEffect(() => {
        if (!currentDriverId) return;
        const fetchAlerts = async () => {
            const { data } = await supabase.from('settings').select('value').eq('key', 'pending_timelog_alerts').maybeSingle();
            if (data?.value) {
                try {
                    const parsed = JSON.parse(data.value);
                    const myAlerts = parsed.filter(a => String(a.driverId) === String(currentDriverId));
                    setAlerts(myAlerts);
                } catch(e) {}
            }
        };
        fetchAlerts();
    }, [currentDriverId]);

    const handleAccept = async (alertId) => {
        try {
            const { data } = await supabase.from('settings').select('value').eq('key', 'pending_timelog_alerts').maybeSingle();
            if (data?.value) {
                let parsed = JSON.parse(data.value);
                parsed = parsed.filter(a => a.id !== alertId);
                await supabase.from('settings').upsert({ key: 'pending_timelog_alerts', value: JSON.stringify(parsed) });
                setAlerts(prev => prev.filter(a => a.id !== alertId));
            }
        } catch (e) {
            console.error('Error accepting alert', e);
        }
    };

    if (alerts.length === 0) return null;

    const formatTime = (iso) => {
        if (!iso) return '--:--';
        return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('es-ES', { weekday: 'long', day: '2-digit', month: 'long' });
    };

    return (
        <div className="mx-4 mt-4 space-y-3">
            {alerts.map(alert => (
                <div key={alert.id} className="bg-yellow-50 border-l-4 border-yellow-500 p-4 rounded-r-xl shadow-md">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="text-yellow-600 shrink-0 mt-0.5" size={20} />
                        <div className="flex-1">
                            <h4 className="font-bold text-yellow-800 text-sm mb-1">¡Aviso de modificación de horario!</h4>
                            <p className="text-xs text-yellow-900 mb-2">
                                La oficina ha modificado tu fichaje del <strong>{formatDate(alert.date)}</strong>.
                            </p>
                            <div className="bg-white/60 p-2 rounded text-xs font-mono text-slate-700 mb-3 border border-yellow-200">
                                Entrada: {formatTime(alert.clock_in)}<br />
                                Salida: {formatTime(alert.clock_out)}
                            </div>
                            <button
                                onClick={() => handleAccept(alert.id)}
                                className="w-full bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-2 rounded-lg text-xs shadow-sm transition-colors"
                            >
                                Aceptar y Confirmar Horario
                            </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

function DriverDashboardContent({ onLogout, allShipments, currentDriverId, onAssignShipment, drivers, clients, allPoblaciones, onCreateShipment, onStatusChange, onUpdateShipment, onUpdateClient, onAddClient, tariffs, articles, familyOrder, coverageZones, defaultCodFee, routes, routeKnowledge, onUpdateRouteKnowledge, isInitialLoading, gpsIntervalMinutes, driverAlerts, alertAcknowledgements = [], driverNamePreference = 'both', isTestMode = false, cachedDriverName = null }) {
    console.log('DriverDashboard Render', { currentDriverId, drivers: drivers?.length, shipments: allShipments?.length, clients: clients?.length });

    const getDriverDisplayName = (driver) => {
        if (!driver) return '';
        const name = driver.name || '';
        const alias = driver.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };


    // === FICHAJE AUTOMÁTICO AL ENTRAR (entrada real a la hora actual) ===
    const hasClockedInRef = useRef(false);
    useEffect(() => {
        const autoClockIn = async () => {
            if (!currentDriverId || !drivers || drivers.length === 0) return;
            if (hasClockedInRef.current) return;
            hasClockedInRef.current = true;
            try {
                const today = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('time_logs')
                    .select('id')
                    .eq('driver_id', currentDriverId)
                    .eq('date', today)
                    .limit(1);
                if (error) { console.error("Error auto-clock-in check:", error); return; }
                if (!data || data.length === 0) {
                    const driverObj = drivers?.find(d => String(d.id) === String(currentDriverId));
                    await supabase.from('time_logs').insert([{
                        driver_id: currentDriverId,
                        driver_name: driverObj?.name || 'Conductor',
                        date: today,
                        clock_in: new Date().toISOString()
                    }]);
                    console.log("Fichaje de entrada automático registrado.");
                }
            } catch (err) {
                console.error("Excepción en auto clock in:", err);
            }
        };
        autoClockIn();
    }, [currentDriverId, drivers]);
    // =====================================================================

    // === MODAL CONFIRMACIÓN DÍA ANTERIOR (solo si showTimeLogsToDrivers activo) ===
    const [yesterdayPending, setYesterdayPending] = useState(null);
    const [showYesterdayModal, setShowYesterdayModal] = useState(false);
    const [isConfirmingYesterday, setIsConfirmingYesterday] = useState(false);
    const [showTimeLogsToDrivers, setShowTimeLogsToDrivers] = useState(false);

    useEffect(() => {
        const checkYesterday = async () => {
            if (!currentDriverId) return;
            if (isTestMode) return; // No registrar jornada en modo prueba
            try {
                // 1. Check if admin has enabled visibility for drivers
                const { data: settingData } = await supabase
                    .from('settings')
                    .select('value')
                    .eq('key', 'showTimeLogsToDrivers')
                    .maybeSingle();
                const isVisible = settingData?.value === 'true';
                setShowTimeLogsToDrivers(isVisible);
                if (!isVisible) return;

                // 2. Check yesterday's logs
                const yesterdayDate = new Date();
                yesterdayDate.setDate(yesterdayDate.getDate() - 1);
                const yesterday = new Date(yesterdayDate.getTime() - yesterdayDate.getTimezoneOffset() * 60000).toISOString().split('T')[0];

                const { data: yLogs } = await supabase
                    .from('time_logs')
                    .select('*')
                    .eq('driver_id', currentDriverId)
                    .eq('date', yesterday)
                    .order('clock_in', { ascending: true });

                if (!yLogs || yLogs.length === 0) return;

                const hasAfternoon = yLogs.some(l => {
                    const h = new Date(l.clock_in).getHours();
                    return h >= 15;
                });
                if (hasAfternoon) return;

                const dismissKey = `yest_confirm_dismissed_${currentDriverId}_${yesterday}`;
                if (localStorage.getItem(dismissKey)) return;

                setYesterdayPending({ date: yesterday, logs: yLogs });
                setShowYesterdayModal(true);
            } catch (e) {
                console.error('Error checking yesterday logs:', e);
            }
        };
        checkYesterday();
    }, [currentDriverId, isTestMode]);

    // Shared anti-collision pattern generator
    const generateUniqueShiftPattern = async (targetDate) => {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];

        const [{ data: driverLogs }, { data: dayLogsAll }] = await Promise.all([
            supabase.from('time_logs').select('*').eq('driver_id', currentDriverId).gte('date', thirtyDaysAgoStr),
            supabase.from('time_logs').select('*').eq('date', targetDate)
        ]);

        const fmt = (d) => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;

        const getPatterns = (logsList) => {
            const groups = {};
            (logsList || []).forEach(log => {
                const key = `${log.driver_id}_${log.date}`;
                if (!groups[key]) groups[key] = [];
                groups[key].push(log);
            });
            const s = new Set();
            Object.values(groups).forEach(logs => {
                logs.sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in));
                if (logs.length >= 2) s.add(`${fmt(new Date(logs[0].clock_in))}-${fmt(new Date(logs[0].clock_out))}-${fmt(new Date(logs[1].clock_in))}-${fmt(new Date(logs[1].clock_out))}`);
                else if (logs.length === 1 && logs[0].clock_out) s.add(`${fmt(new Date(logs[0].clock_in))}-${fmt(new Date(logs[0].clock_out))}`);
            });
            return s;
        };

        const existingPatterns = new Set([...getPatterns(driverLogs), ...getPatterns(dayLogsAll)]);

        // Generate ALL 4 times from fixed realistic bases — independent of real app-open time
        // Morning in:  08:30 ± rand(-5 to +10 min)
        // Morning out: 13:30 ± rand(-10 to +5 min)
        // Afternoon in: 16:00 ± rand(-5 to +10 min)
        // Afternoon out: calculated so total morning+afternoon = exactly 8h
        let morningIn, morningOut, afternoonIn, afternoonOut;
        let attempts = 0;
        while (attempts < 100) {
            attempts++;
            const mInOffset  = Math.floor(Math.random() * 16) - 5;   // -5..+10
            const mOutOffset = Math.floor(Math.random() * 16) - 10;  // -10..+5
            const aInOffset  = Math.floor(Math.random() * 16) - 5;   // -5..+10

            morningIn   = new Date(new Date(`${targetDate}T08:30:00`).getTime() + mInOffset  * 60000);
            morningOut  = new Date(new Date(`${targetDate}T13:30:00`).getTime() + mOutOffset * 60000);
            afternoonIn = new Date(new Date(`${targetDate}T16:00:00`).getTime() + aInOffset  * 60000);

            // Afternoon out = 8h total (morning + afternoon)
            const morningDurationMs   = morningOut - morningIn;
            const afternoonDurationMs = 8 * 3600000 - morningDurationMs;
            afternoonOut = new Date(afternoonIn.getTime() + afternoonDurationMs);

            const candidate = `${fmt(morningIn)}-${fmt(morningOut)}-${fmt(afternoonIn)}-${fmt(afternoonOut)}`;
            if (!existingPatterns.has(candidate)) break;
        }
        return { morningIn, morningOut, afternoonIn, afternoonOut };
    };

    const handleConfirmYesterday = async () => {
        if (isConfirmingYesterday || !yesterdayPending) return;
        setIsConfirmingYesterday(true);
        try {
            const { date, logs } = yesterdayPending;
            const morningLog = [...logs].sort((a, b) => new Date(a.clock_in) - new Date(b.clock_in))[0];
            const { morningIn, morningOut, afternoonIn, afternoonOut } = await generateUniqueShiftPattern(date);
            const driverObj = drivers?.find(d => String(d.id) === String(currentDriverId));

            await supabase.from('time_logs').update({
                clock_in:  morningIn.toISOString(),
                clock_out: morningOut.toISOString()
            }).eq('id', morningLog.id);

            await supabase.from('time_logs').insert([{
                driver_id:   currentDriverId,
                driver_name: driverObj?.name || 'Conductor',
                date,
                clock_in:  afternoonIn.toISOString(),
                clock_out: afternoonOut.toISOString()
            }]);

            setShowYesterdayModal(false);
            setYesterdayPending(null);
        } catch(e) {
            console.error('Error confirmando jornada de ayer:', e);
            alert('Error al registrar. Inténtalo de nuevo.');
        } finally {
            setIsConfirmingYesterday(false);
        }
    };


    const handleDismissYesterday = () => {
        if (!yesterdayPending) return;
        const dismissKey = `yest_confirm_dismissed_${currentDriverId}_${yesterdayPending.date}`;
        try { localStorage.setItem(dismissKey, '1'); } catch (_) {}
        setShowYesterdayModal(false);
        setYesterdayPending(null);
    };
    // =============================================================================
    const [activeTab, setActiveTab] = useState('route');

    // ── GUIDED TOUR (Modo Prueba) ────────────────────────────────────────────
    const [showTour, setShowTour] = useState(false);
    const [showShipmentTour, setShowShipmentTour] = useState(false);
    const [showAlertsTour, setShowAlertsTour] = useState(false);
    const [showCajaTour, setShowCajaTour] = useState(false);
    const [showRepartaTour, setShowRepartaTour] = useState(false);
    const [showEditTour, setShowEditTour] = useState(false);
    const [tourMenuOpen, setTourMenuOpen] = useState(false);
    const [tourDemoMode, setTourDemoMode] = useState(null);

    // Objetos de envío de demo para los tutoriales ──────────────────────
    const DEMO_BASE = useMemo(() => ({
        id: 'DEMO-TUTORIAL-001',
        client: clients?.[0]?.name || 'Mercadona S.A.',
        clientName: clients?.[0]?.name || 'Mercadona S.A.',
        originAddress: clients?.[0]?.address || 'Av. de la Constitución, 1',
        originCity: clients?.[0]?.city || 'Córdoba',
        originZip: clients?.[0]?.zip || '14001',
        destinationName: 'Manuel García López',
        destinationAddress: 'C/ Mayor, 23',
        destinationCity: 'Córdoba',
        destinationZip: '14001',
        destinationPhone: '600 123 456',
        amount: '12.50',
        porteType: 'Debido',
        status: 'En Reparto',
        type: 'Entrega',
        hasCod: false,
        codAmount: '',
        hasReturn: false,
        needsSignatureReturn: false,
        observations: '\ud83d\udcda EJEMPLO DE TUTORIAL \u2014 Ningún dato se guardará',
        billingType: 'Efectivo',
        destinationBillingType: 'Efectivo',
        deliveryRules: { requireSignature: true, requireName: true, requirePhoto: false, requireDNI: false },
    }), [clients]);

    const getDemoShipment = useCallback((mode) => {
        if (!mode) return null;
        const base = DEMO_BASE;
        switch (mode) {
            case 'delivery_pagado':        return { ...base, porteType: 'Pagado', billingType: 'Facturación', destinationBillingType: 'Facturación', hasCod: false };
            case 'delivery_debido':        return { ...base, porteType: 'Debido', hasCod: false };
            case 'delivery_retorno':       return { ...base, porteType: 'Pagado', hasReturn: true, hasCod: false };
            case 'delivery_firma_vuelta':  return { ...base, porteType: 'Pagado', needsSignatureReturn: true, hasCod: false };
            case 'delivery_retorno_firma': return { ...base, porteType: 'Pagado', hasReturn: true, needsSignatureReturn: true, hasCod: false };
            case 'delivery_porte_reembolso': return { ...base, porteType: 'Debido', hasCod: true, codAmount: '85.00', codCommission: '0' };
            case 'delivery_multi':         return { ...base, porteType: 'Debido', hasCod: false };
            default: return base;
        }
    }, [DEMO_BASE]);

    const getDemoPendingDebts = useCallback((mode) => {
        if (mode !== 'delivery_multi') return [];
        return [
            { id: 'DEMO-DEBT-1', label: 'Porte Debido', type: 'Porte', amount: '8.00',  detail: 'Albarán #2831 — pendiente de cobro' },
            { id: 'DEMO-DEBT-2', label: 'Reembolso COD', type: 'Reembolso', amount: '45.00', detail: 'Albarán #2819 — pendiente de cobro' },
        ];
    }, []);
    useEffect(() => {
        if (isTestMode && currentDriverId) {
            const key = `sumtrans_driver_tour_done_${currentDriverId}`;
            if (!localStorage.getItem(key)) {
                const timer = setTimeout(() => setShowTour(true), 900);
                return () => clearTimeout(timer);
            }
        }
    }, [isTestMode, currentDriverId]);
    // ─────────────────────────────────────────────────────────────────────────
    // Restaurar modal de creación abierto si Android mató la página
    const [isNoteModalOpen, setIsNoteModalOpen] = useState(() => {
        try { return sessionStorage.getItem('sumtrans_creating_shipment') === 'true'; } catch { return false; }
    });

    // Persistir estado del modal de creación
    useEffect(() => {
        try {
            if (isNoteModalOpen) {
                sessionStorage.setItem('sumtrans_creating_shipment', 'true');
            } else {
                sessionStorage.removeItem('sumtrans_creating_shipment');
            }
        } catch {}
    }, [isNoteModalOpen]);

    const currentDriver = useMemo(() => 
        drivers?.find(d => String(d.id) === String(currentDriverId)),
    [drivers, currentDriverId]);

    // 'idle' | 'requesting' | 'success' | 'denied' (permiso denegado) | 'timeout' (no dio tiempo a fijar posición)
    // | 'unavailable' (sin cobertura de satélites) | 'db_error' (GPS OK pero no se guardó) | 'error_unsecure'
    const [gpsStatus, setGpsStatus] = useState('idle');

    // === RASTREADOR GPS AUTOMÁTICO + BAJO DEMANDA ===
    // Envía GPS automáticamente cada 2 min + al entrar + al volver a la app
    // Así la oficina siempre tiene una posición reciente al pulsar ⚡
    const lastRequestTrigger = useRef(currentDriver?.locationRequestTrigger);
    const [gpsLog, setGpsLog] = useState([]);
    const gpsIntervalRef = useRef(null);
    const gpsDeniedRef = useRef(false); // Evitar alertas repetidas

    // La última posición que ha dado el móvil en esta sesión, con la hora. El
    // rastreador la coge cada pocos minutos; Optimizar la reaprovecha cuando el GPS no
    // contesta a tiempo, que dentro de una nave o entre edificios pasa constantemente.
    // La hora es imprescindible: una posición vieja no es "casi tan buena", es MALA —
    // ordena el reparto desde donde estabas hace un rato.
    const ultimaPosicionRef = useRef(null);

    // El temporizador que retira el resumen de la optimización.
    const mensajeTimeoutRef = useRef(null);
    const driversRef = useRef(drivers); // Ref para acceso en callbacks sin re-render

    useEffect(() => { driversRef.current = drivers; }, [drivers]);

    const addLog = (msg) => {
        setGpsLog(prev => [new Date().toLocaleTimeString() + ": " + msg, ...prev].slice(0, 5));
    };

    // silent=true → no muestra alertas ni cambia status visual (para envíos automáticos de fondo)
    const sendLocation = useCallback((silent = false) => {
        if (!navigator.geolocation) {
            if (!silent) { setGpsStatus('error_unsecure'); addLog("❌ Error: Navegador no soporta GPS"); }
            return;
        }

        if (!silent) setGpsStatus('requesting');

        const handleSuccess = async (position) => {
            const { latitude, longitude } = position.coords;
            // Se guarda ANTES de subirla: aunque falle el envío al servidor, la
            // posición es buena y a Optimizar le vale igual.
            ultimaPosicionRef.current = { lat: latitude, lon: longitude, cuando: Date.now() };
            try {
                const drv = driversRef.current.find(d => String(d.id) === String(currentDriverId));
                if (!drv) return;

                const updatedData = {
                    ...drv,
                    currentLat: latitude,
                    currentLng: longitude,
                    lastGpsUpdate: new Date().toISOString()
                };
                // Supabase NO lanza excepción: devuelve el fallo dentro de .error.
                // Sin este chequeo, un guardado fallido se mostraba como "enviado con éxito".
                const { error: dbError } = await supabase.from('drivers').update({
                    data: updatedData
                }).eq('id', currentDriverId);
                if (dbError) throw dbError;

                gpsDeniedRef.current = false; // El GPS ha vuelto: permitir avisar de nuevo si falla más adelante
                setGpsStatus('success');
                if (!silent) addLog("✅ Ubicación enviada con éxito");
            } catch (e) {
               console.error("Fallo al sincronizar GPS:", e);
               setGpsStatus('db_error');
               if (!silent) addLog("❌ GPS leído, pero no se pudo guardar en el servidor");
            }
        };

        // highAccuracy=false es el reintento: tarda más pero usa antenas/wifi, funciona bajo techo
        const attempt = (highAccuracy) => {
            navigator.geolocation.getCurrentPosition(
                handleSuccess,
                (error) => {
                    // Si no es un rechazo de permiso, dar una segunda oportunidad en modo rápido
                    if (highAccuracy && error.code !== error.PERMISSION_DENIED) {
                        if (!silent) addLog("↻ Sin señal fina, reintentando por antenas...");
                        attempt(false);
                        return;
                    }

                    console.warn("GPS ERROR:", error.code, error.message);

                    let status = 'unavailable';
                    if (error.code === error.PERMISSION_DENIED) status = 'denied';
                    else if (error.code === error.TIMEOUT) status = 'timeout';

                    if (!silent) {
                        setGpsStatus(status);
                        addLog("❌ Error GPS: " + error.message);
                    }

                    if (status === 'denied' && !gpsDeniedRef.current) {
                        gpsDeniedRef.current = true;
                        setGpsStatus('denied');
                        alert("Aviso: Has denegado el permiso de ubicación. El mapa de la oficina no podrá localizarte.");
                    }
                },
                highAccuracy
                    ? { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
                    : { enableHighAccuracy: false, timeout: 30000, maximumAge: 120000 }
            );
        };

        attempt(true);
    }, [currentDriverId]);

    // Diagnóstico real al pulsar el icono: pregunta al navegador si el permiso está
    // concedido antes de acusar al conductor de haberlo denegado.
    const handleGpsClick = useCallback(async () => {
        if (gpsStatus === 'error_unsecure') {
            alert("⚠ GPS BLOQUEADO: Estás usando una conexión 'http://' sin certificado de seguridad válido o 'localhost'. Chrome o Safari no permiten leer antenas de GPS en conexiones inseguras. \nDebes usar tu dominio oficial seguro (HTTPS) para que funcione el GPS.");
            return;
        }

        if (!['denied', 'timeout', 'unavailable', 'db_error'].includes(gpsStatus)) {
            sendLocation();
            return;
        }

        if (gpsStatus === 'db_error') {
            alert("⚠ SIN CONEXIÓN AL SERVIDOR\n\nEl GPS del móvil funciona, pero la posición no llegó a la oficina. Suele ser falta de cobertura de datos.\n\nReintentando ahora.");
            sendLocation();
            return;
        }

        let permiso = null;
        try {
            if (navigator.permissions?.query) {
                permiso = (await navigator.permissions.query({ name: 'geolocation' })).state;
            }
        } catch {
            // Safari antiguo no sabe consultar este permiso: nos quedamos con el código de error
        }

        if (permiso === 'denied' || (permiso === null && gpsStatus === 'denied')) {
            alert("⚠ PERMISO DE UBICACIÓN BLOQUEADO\n\nHay que activarlo en los ajustes del móvil:\n\n• iPhone: Ajustes → Privacidad y seguridad → Localización → Safari → 'Al usar la app', y activa 'Ubicación precisa'.\n\n• Android: Ajustes → Aplicaciones → Chrome → Permisos → Ubicación → Permitir.");
            return;
        }

        if (permiso === 'prompt') {
            alert("📍 Falta conceder el permiso.\n\nPulsa 'Permitir' en la pregunta que va a aparecer ahora.");
            sendLocation();
            return;
        }

        alert("⚠ SIN SEÑAL GPS\n\nEl permiso está concedido, pero el móvil no consigue fijar la posición. Suele pasar dentro de naves, sótanos o aparcamientos.\n\nComprueba que la Localización del móvil esté encendida, sal a cielo abierto unos segundos y vuelve a pulsar.\n\nReintentando ahora.");
        sendLocation();
    }, [gpsStatus, sendLocation]);

    // Inicio + GPS automático cada 2 min + al volver del background
    useEffect(() => {
        if (!currentDriverId || !currentDriver) return;

        // 1. Enviar ubicación inicial al entrar a la app
        if (!lastRequestTrigger.current) {
            addLog("📍 Enviando ubicación inicial...");
            sendLocation();
            lastRequestTrigger.current = currentDriver.locationRequestTrigger || 'initial';
        }

        // 2. GPS automático cada X minutos (configurable desde Ajustes, default 15 min)
        const intervalMs = (gpsIntervalMinutes || 15) * 60 * 1000;
        if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
        gpsIntervalRef.current = setInterval(() => {
            sendLocation(true); // silent
        }, intervalMs);

        // 3. Al volver a la app (desbloquear pantalla, volver de otra app)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible') {
                sendLocation(true); // silent
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            if (gpsIntervalRef.current) clearInterval(gpsIntervalRef.current);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [currentDriverId, currentDriver?.id, sendLocation]);

    // Responder al trigger de oficina (botón ⚡ Pedir señal GPS)
    useEffect(() => {
        if (!currentDriverId || !currentDriver) return;
        if (currentDriver.locationRequestTrigger && currentDriver.locationRequestTrigger !== lastRequestTrigger.current) {
            addLog("⚡ Señal GPS solicitada por Oficina");
            sendLocation();
            lastRequestTrigger.current = currentDriver.locationRequestTrigger;
        }
    }, [currentDriverId, currentDriver?.locationRequestTrigger, sendLocation]);
    // ==============================================

    // === ALERTAS PARA CONDUCTORES (Notificaciones obligatorias) ===
    const [pendingAlerts, setPendingAlerts] = useState([]);
    const [showAlertModal, setShowAlertModal] = useState(false);

    useEffect(() => {
        if (!currentDriverId) return;
        const now = new Date();
        const dayOfWeek = now.getDay(); // 0=Dom, 1=Lun, ...
        const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const storageKey = `drv_alerts_ack_${currentDriverId}_${todayKey}`;
        
        // Leer alertas ya aceptadas hoy
        let acked = [];
        try { acked = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}

        // Combinar confirmaciones persistidas en la base de datos de Supabase para hoy
        if (Array.isArray(alertAcknowledgements)) {
            alertAcknowledgements.forEach(ack => {
                if (String(ack.driverId) === String(currentDriverId)) {
                    try {
                        const ackDate = new Date(ack.timestamp);
                        const ackDateKey = `${ackDate.getFullYear()}-${String(ackDate.getMonth()+1).padStart(2,'0')}-${String(ackDate.getDate()).padStart(2,'0')}`;
                        if (ackDateKey === todayKey) {
                            if (!acked.includes(ack.alertId)) {
                                acked.push(ack.alertId);
                            }
                        }
                    } catch (err) {
                        console.error('Error al procesar timestamp de confirmación:', err);
                    }
                }
            });
        }

        // Leer alertas descartadas permanentemente
        const permStorageKey = `drv_alerts_perm_ack_${currentDriverId}`;
        let permAcked = [];
        try { permAcked = JSON.parse(localStorage.getItem(permStorageKey) || '[]'); } catch(e) {}

        const alertsToShow = [];

        // Alertas configuradas desde la oficina
        const currentTimeStr = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
        (driverAlerts || []).forEach(alert => {
            if (acked.includes(alert.id)) return; // Ya la aceptó hoy o ya está registrada hoy en BD
            // Comprobar si aplica hoy (día de la semana)
            if (alert.dayOfWeek !== undefined && alert.dayOfWeek !== dayOfWeek) return;
            if (alert.enabled === false) return;
            // Comprobar ventana horaria
            if (alert.timeFrom && currentTimeStr < alert.timeFrom) return;
            if (alert.timeTo && currentTimeStr > alert.timeTo) return;
            // Comprobar si va dirigida a este conductor
            if (alert.targetDriverIds && alert.targetDriverIds.length > 0) {
                if (!alert.targetDriverIds.includes(currentDriverId) && !alert.targetDriverIds.includes(Number(currentDriverId))) return;
            }
            alertsToShow.push(alert);
        });

        // Alerta por defecto: Lunes - Revisión de niveles de furgoneta (solo si no hay una configuración personalizada)
        const hasCustomVehicleCheck = (driverAlerts || []).some(a => a.id === 'monday_vehicle_check');
        if (!hasCustomVehicleCheck && dayOfWeek === 1 && !acked.includes('monday_vehicle_check') && !permAcked.includes('monday_vehicle_check')) {
            const alreadyFromConfig = alertsToShow.find(a => a.id === 'monday_vehicle_check');
            if (!alreadyFromConfig) {
                alertsToShow.push({
                    id: 'monday_vehicle_check',
                    title: '🔧 Revisión Semanal del Vehículo',
                    message: '¡Buenos días! Es lunes. Antes de salir a ruta, confirma que has revisado los niveles de tu furgoneta:\n\n• Aceite del motor\n• Líquido refrigerante\n• Líquido de frenos\n• Presión de neumáticos\n• Luces y intermitentes',
                    confirmText: '✅ Confirmo que he revisado los niveles',
                    icon: '🚐'
                });
            }
        }

        if (alertsToShow.length > 0) {
            setPendingAlerts(alertsToShow);
            setShowAlertModal(true);
        } else {
            setPendingAlerts([]);
            setShowAlertModal(false);
        }
    }, [currentDriverId, driverAlerts, alertAcknowledgements]);

    const handleAcknowledgeAlert = async (alertId) => {
        const now = new Date();
        const todayKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
        const storageKey = `drv_alerts_ack_${currentDriverId}_${todayKey}`;
        let acked = [];
        try { acked = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) {}
        acked.push(alertId);
        try { localStorage.setItem(storageKey, JSON.stringify(acked)); } catch(e) {}

        // Si es la alerta de revisión semanal o de configuración global, guardarla permanentemente si el usuario lo desea
        // En este caso el usuario pidió que la de revisión no vuelva a salir una vez confirmada.
        if (alertId === 'monday_vehicle_check') {
            const permStorageKey = `drv_alerts_perm_ack_${currentDriverId}`;
            let permAcked = [];
            try { permAcked = JSON.parse(localStorage.getItem(permStorageKey) || '[]'); } catch(e) {}
            if (!permAcked.includes(alertId)) {
                permAcked.push(alertId);
                try { localStorage.setItem(permStorageKey, JSON.stringify(permAcked)); } catch(e) {}
            }
        }

        // Guardar confirmación en Supabase para historial de oficina
        const alertObj = pendingAlerts.find(a => a.id === alertId);
        const driverName = currentDriver?.name || `Conductor #${currentDriverId}`;
        try {
            const { data: existing } = await supabase.from('settings').select('value').eq('key', 'alert_acknowledgments').maybeSingle();
            let history = [];
            if (existing?.value) { try { history = JSON.parse(existing.value); } catch(e) {} }
            history.unshift({
                driverId: currentDriverId,
                driverName,
                alertId,
                alertTitle: alertObj?.title || alertId,
                alertIcon: alertObj?.icon || '🔔',
                timestamp: now.toISOString()
            });
            // Mantener solo los últimos 500 registros
            if (history.length > 500) history = history.slice(0, 500);
            await supabase.from('settings').upsert({ key: 'alert_acknowledgments', value: JSON.stringify(history) });
        } catch(e) { console.warn('[Alerts] Error guardando historial:', e); }

        const remaining = pendingAlerts.filter(a => a.id !== alertId);
        setPendingAlerts(remaining);
        if (remaining.length === 0) setShowAlertModal(false);
    };
    // ================================================

    // --- PERFORMANCE: CLIENTS CACHE MAP ---
    const clientsMap = useMemo(() => {
        const map = new Map();
        (clients || []).forEach(c => {
            const nameNorm = normalizeClientName(c.name);
            const legalNorm = normalizeClientName(c.legalName);
            if (nameNorm) map.set(nameNorm, c);
            if (legalNorm) map.set(legalNorm, c);
            if (c.branches && Array.isArray(c.branches)) {
                c.branches.forEach(b => {
                    const bNameNorm = normalizeClientName(b.name);
                    if (bNameNorm) map.set(bNameNorm, { ...c, _isBranch: true, _branch: b });
                });
            }
        });
        return map;
    }, [clients]);
    // ======================================
    
    // Get current date string for daily storage keys
    const tObj = new Date();
    const todayStr = `${tObj.getFullYear()}-${String(tObj.getMonth() + 1).padStart(2, '0')}-${String(tObj.getDate()).padStart(2, '0')}`;

    // Persist Collected Collections daily
    const [collectedCollections, setCollectedCollections] = useState(() => {
        const key = `drv_collections_${currentDriverId}_${todayStr}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : [];
    });

    // SYNC ROBUSTO: al arrancar, fusionar localStorage + Supabase (unión por ID)
    // Así Chrome y Edge siempre ven los mismos cobros aunque cada uno tenga datos distintos
    useEffect(() => {
        if (!currentDriverId) return;
        const key = `drv_collections_${currentDriverId}_${todayStr}`;
        supabase.from('drivers').select('data').eq('id', currentDriverId).single().then(({ data: drvRow }) => {
            const cloud = drvRow?.data?.[`collectedCollections_${todayStr}`] || [];
            const local = (() => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } })();
            // Fusionar: todas las entradas únicas de ambas fuentes (por id)
            const merged = [...cloud];
            local.forEach(item => {
                if (item?.id && !merged.find(c => c.id === item.id)) merged.push(item);
            });
            if (merged.length !== local.length || merged.some(m => !local.find(c => c.id === m.id))) {
                console.log('[Cobros] Fusionado cloud(' + cloud.length + ') + local(' + local.length + ') = ' + merged.length);
                setCollectedCollections(merged);
                try { localStorage.setItem(key, JSON.stringify(merged)); } catch (_) {}
                // Subir la versión fusionada a Supabase
                if (drvRow?.data) {
                    const updatedData = { ...drvRow.data, [`collectedCollections_${todayStr}`]: merged };
                    Promise.resolve(supabase.from('drivers').update({ data: updatedData }).eq('id', currentDriverId)).catch(() => {});
                }
            }
        });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentDriverId, todayStr]);

    // Guardar en localStorage Y Supabase cada vez que cambian los cobros
    useEffect(() => {
        const key = `drv_collections_${currentDriverId}_${todayStr}`;
        try { localStorage.setItem(key, JSON.stringify(collectedCollections)); } catch (e) {
            console.warn("No se pudo guardar la colección localmente por límite de cuota iOS", e);
        }
        if (!currentDriverId) return;
        supabase.from('drivers').select('data').eq('id', currentDriverId).single().then(({ data: drvRow }) => {
            if (!drvRow) return;
            const updatedData = { ...drvRow.data, [`collectedCollections_${todayStr}`]: collectedCollections };
            Promise.resolve(supabase.from('drivers').update({ data: updatedData }).eq('id', currentDriverId))
                .then(() => console.log('[Cobros] Guardado en Supabase:', collectedCollections.length, 'entradas'))
                .catch(err => console.warn('[Cobros] Error sync Supabase:', err.message));
        });
    }, [collectedCollections, currentDriverId, todayStr]);

    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
    const [incidentInitialReason, setIncidentInitialReason] = useState('');
    const [incidentShipment, setIncidentShipment] = useState(null);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [showPayrollsModal, setShowPayrollsModal]     = useState(false);
    const [showVacationsPanel, setShowVacationsPanel]   = useState(false);
    const [isScannerOpen, setIsScannerOpen] = useState(false);
    const [deliveryModalShipment, setDeliveryModalShipment] = useState(null); // Which shipment is being confirmed
    const [pickupToConvert, setPickupToConvert] = useState(null); // Pickup being converted to shipment
    const [pendingPickupAfterCollection, setPendingPickupAfterCollection] = useState(null); // Recogida que se abrirá tras cobrar deudas
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
    const [isReadOnlyModal, setIsReadOnlyModal] = useState(false);
    const [isScannerModalOpen, setIsScannerModalOpen] = useState(false);
    const [unregisteredSscc, setUnregisteredSscc] = useState(null); // Capa 2: SSCC escaneado no registrado
    const [ssccPrefill, setSsccPrefill] = useState(null);           // Capa 2: SSCC pre-rellenado en modal de creación
    const [dashboardCustomAmounts, setDashboardCustomAmounts] = useState({});
    const [processingIds, setProcessingIds] = useState(new Set());
    const [pendingCollections, setPendingCollections] = useState([]);

    // --- OFFLINE / CONNECTIVITY ---
    const { isOnline, justReconnected } = useOnlineStatus();
    const [pendingQueueCount, setPendingQueueCount] = useState(() => getQueueLength());

    // Refresh queue count when connectivity changes
    useEffect(() => {
        setPendingQueueCount(getQueueLength());
    }, [isOnline]);
    // --------------------------------

    // Callback para el botón "Realizar Recogida": 
    // Por solicitud del usuario, las recogidas omiten el control previo de cobros pendientes
    // y saltan directamente a la generación del nuevo albarán.
    const handlePickupClick = useCallback((stop) => {
        // Sin deudas: ir directamente al modal de recogida
        setPickupToConvert(stop);
        setIsNoteModalOpen(true);
    }, []);
        // Accessibility: Font Size / Zoom
    const [zoom, setZoom] = useState(() => {
        const saved = localStorage.getItem('drv_zoom');
        return saved ? parseFloat(saved) : 1;
    });

    useEffect(() => {
        try { localStorage.setItem('drv_zoom', zoom.toString()); } catch (_) {}
    }, [zoom]);

    const [whatsappPrompt, setWhatsappPrompt] = useState(null); // { shipment, phone }
    const [openDeliveredDocMenuId, setOpenDeliveredDocMenuId] = useState(null);
    const [openAssignDocMenuId, setOpenAssignDocMenuId] = useState(null);

    const handleUnassignShipment = async (shipment) => {
        try {
            // Optimistic UI update
            setLocalRoute(prev => prev.filter(s => s.id !== shipment.id));
            
            // Persist the unassignment. Sellamos quién lo devuelve para que reaparezca
            // en SU pestaña de Asignar y pueda mandárselo al conductor correcto, en vez
            // de volver al creador (que es quien se equivocó al asignarlo).
            await onUpdateShipment(shipment.id, {
                status: 'Pendiente de asignar',
                assignedDriverId: null,
                returnedToAssignById: currentDriverId,
                updatedAt: new Date().toISOString()
            });

            console.log("Shipment returned to assign pool:", shipment.id);
        } catch (err) {
            console.error("Failed to unassign shipment:", err);
            // Revert on error if needed, but the realtime sync will handle it
        }
    };

    const handleWhatsAppShare = async (shipment, manualPhone = null) => {
        // Correct logic: If it's a pickup, use origin phone. If it's a delivery, use destination phone.
        const isPickup = shipment.type === 'Recogida';
        const targetName = isPickup
            ? (shipment.originName || shipment.client)
            : (shipment.destinationName || shipment.client);
        const targetPhone = isPickup ? shipment.originPhone : shipment.destinationPhone;

        // Aquí solo vale un móvil: a un fijo el justificante no llega. Se coge el
        // primer móvil que haya entre el albarán y la ficha (telefonosDeLaParada ya
        // los devuelve en ese orden) y los fijos se descartan del todo.
        const telefonosDelCliente = telefonosDeLaParada(shipment, clients);
        const movilDisponible = telefonosDelCliente.find(t => !t.esFijo)?.numero || null;
        const phone = manualPhone || movilDisponible;

        if (!phone && manualPhone === null) {
            // 'motivo' solo cambia el texto del modal: si aquí queda algún teléfono es
            // que todos son fijos, y el conductor tiene que entender por qué le pedimos
            // otro número teniendo el cliente teléfono.
            setWhatsappPrompt({
                shipment,
                phone: '',
                motivo: telefonosDelCliente.length > 0 ? 'fijo' : 'sin_telefono',
            });
            return;
        }

        const cleanPhone = (phone || '').replace(/\s+/g, '').replace('+', '');
        if (!cleanPhone && manualPhone !== null) {
            alert("Por favor, introduce un número de teléfono válido.");
            return;
        }

        // --- PERSISTENCIA DEL TELÉFONO TECLEADO ---
        // El número que el conductor teclea aquí es oro: si no lo guardamos en la ficha,
        // el siguiente albarán del mismo cliente vuelve a salir sin teléfono y se lo
        // tiene que volver a pedir.
        //
        // OJO CON EL ORDEN (ver el bloque del final, que decide cuándo se llama a
        // esto): en Android navegamos fuera para abrir WhatsApp y eso descarga la
        // página. Antes esto era una función de fondo que empezaba por el albarán; su
        // primer await dejaba la escritura de la ficha para el siguiente tick, el
        // navegador ya se había ido a WhatsApp y el teléfono no llegaba nunca a la
        // ficha. Por eso va primero la ficha, que es el dato que hay que conservar.
        const guardarTelefono = async () => {
            const normalizedTarget = normalizeClientName(targetName);

            // 1) La ficha del cliente.
            if (normalizedTarget) {
                try {
                    const matchedClient = clientsMap.get(normalizedTarget);

                    if (matchedClient) {
                        // Solo 'phone' y 'mobile' se leen en el formulario de cliente y en
                        // el autorrelleno del albarán, así que escribir en cualquier otro
                        // campo es tirar el dato.
                        const ficha = matchedClient._isBranch ? matchedClient._branch : matchedClient;
                        const fichaPhone = String(ficha.phone || '').trim();
                        const fichaMobile = String(ficha.mobile || '').trim();

                        let cambios = null;
                        if (!fichaPhone) cambios = { phone: manualPhone };
                        else if (fichaPhone !== manualPhone && !fichaMobile) cambios = { mobile: manualPhone };
                        else if (fichaPhone !== manualPhone && esFijoEspanol(fichaMobile) && !esFijoEspanol(manualPhone)) {
                            // El hueco del móvil ocupado por otro fijo no le sirve a nadie:
                            // si el conductor acaba de teclear un móvil de verdad, ese manda.
                            // Sin esto le pediríamos el número en cada justificante.
                            cambios = { mobile: manualPhone };
                        }
                        // Si ya tiene los dos huecos ocupados no pisamos nada: esto puede
                        // ser un contacto puntual y la ficha manda sobre el albarán.

                        if (cambios && onUpdateClient) {
                            await onUpdateClient(
                                matchedClient.id,
                                cambios,
                                matchedClient._isBranch ? matchedClient._branch.id : null
                            );
                        }
                    } else if (onAddClient) {
                        // No hay ficha: la creamos pendiente de validar para que el
                        // número no se quede huérfano en el albarán.
                        await onAddClient({
                            name: targetName,
                            address: (isPickup ? shipment.originAddress : (shipment.destinationAddress || shipment.address)) || '',
                            city: (isPickup ? shipment.originCity : shipment.destinationCity) || '',
                            zip: (isPickup ? shipment.originZip : shipment.destinationZip) || '',
                            phone: manualPhone,
                            coordinates: (isPickup ? shipment.originCoordinates : shipment.destinationCoordinates) || '',
                            type: isPickup ? 'Remitente' : 'Destinatario',
                            billingType: 'Clientes Habituales',
                            status: 'pending',
                            // Si el porte lo paga una agencia, el cliente es suyo (ver agencyOwnership.js)
                            ownerAgencyId: resolveOwnerAgencyId(shipment, clients),
                            createdFrom: 'WhatsApp Justificante',
                            createdBy: currentDriver?.name || 'Driver',
                            isTest: isTestMode,
                        });
                    }
                } catch (err) {
                    console.error("[WhatsApp] Error guardando el teléfono en la ficha:", err);
                }
            }

            // 2) El albarán, solo si venía sin teléfono. Si lo que tiene es un fijo
            // no lo pisamos: para llamar es el bueno, y el móvil ya ha quedado en la
            // ficha, que es de donde lo cogeremos la próxima vez.
            // Vía onUpdateShipment para que use las columnas reales de la tabla y se
            // encole si el conductor no tiene cobertura. Va en su propio try para que
            // un fallo de la ficha no se lo lleve por delante.
            if (!String(targetPhone || '').trim()) {
                try {
                    await onUpdateShipment(shipment.id, isPickup
                        ? { originPhone: manualPhone }
                        : { destinationPhone: manualPhone });
                } catch (err) {
                    console.error("[WhatsApp] Error guardando el teléfono en el albarán:", err);
                }
            }
        };

        // El mensaje se arma ANTES de guardar nada: en iPhone hay que abrir la bandeja
        // de compartir sin esperas de por medio (ver el bloque del final).
        const date = shipment.date || new Date().toLocaleDateString('es-ES');
        const origin = shipment.originName || shipment.client;
        const dest = shipment.destinationName || shipment.client;

        const hasReembolso = parseFloat(String(shipment.codAmount || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) > 0;
        // El mensaje se escribe con saltos de línea de verdad: quien lo codifica para
        // la URL es abrirWhatsApp. Si aquí volviéramos a poner %0A a mano, se
        // codificaría dos veces y el cliente leería el "%0A" en el chat.
        // "a cobrar" solo mientras esté sin cobrar: si ya se ha liquidado, el
        // justificante diría lo contrario que la línea de Estado.
        const codText = hasReembolso
            ? (shipment.codPaid === true
                ? `*Reembolso cobrado:* ${shipment.codAmount} €\n`
                : `*Reembolso a cobrar:* ${shipment.codAmount} €\n`)
            : '';

        const normalize = (val) => String(val || '').toLowerCase().trim();
        const originClient = clientsMap?.get(normalizeClientName(shipment.originName || shipment.client));
        const destClient = clientsMap?.get(normalizeClientName(shipment.destinationName || shipment.client));
        
        const mainBillingType = normalize(shipment.billingType || originClient?.billingType || '');
        const destBillingType = normalize(shipment.destinationBillingType || destClient?.billingType || '');
        
        let isSecret = false;
        if (mainBillingType.includes('habitual') || mainBillingType.includes('diar') || mainBillingType.includes('libre') || mainBillingType.includes('contado') || mainBillingType.includes('presupuesto')) isSecret = true;
        if (destBillingType.includes('habitual') || destBillingType.includes('diar') || destBillingType.includes('libre') || destBillingType.includes('contado') || destBillingType.includes('presupuesto')) isSecret = true;

        // "DE ENTREGA" solo cuando el paquete está entregado de verdad: el mismo
        // botón sale en la pestaña de asignar, y ahí el papel afirmaba una entrega
        // que no había ocurrido. Sin entregar se queda en *JUSTIFICANTE* a secas.
        const estaEntregado = shipment.status === 'Entregado' || !!shipment.deliveredAt;
        const titleText = isSecret
            ? (estaEntregado ? `*JUSTIFICANTE DE ENTREGA*` : `*JUSTIFICANTE*`)
            : `*JUSTIFICANTE SUMTRANS LOGISTICA*`;

        // Calcular precio para el justificante
        const parseAmt = (val) => {
            if (!val) return 0;
            if (typeof val === 'number') return val;
            const str = val.toString().replace(/[^0-9,.-]+/g, '');
            const normalized = str.includes(',') && !str.includes('.') ? str.replace(',', '.') : str;
            const num = parseFloat(normalized);
            return isNaN(num) ? 0 : num;
        };
        const priceBase = parseAmt(shipment.customAmount || shipment.amount);
        const priceIva = +(priceBase * 0.21).toFixed(2);
        const priceTotal = +(priceBase + priceIva).toFixed(2);

        // Serie HAB- = clientes al contado: pagan un precio cerrado en mano, así que
        // el justificante muestra ese importe tal cual, sin desglose de IVA.
        // Los albaranes antiguos sin prefijo caen en isSecret.
        const idUpper = String(shipment.id || '').toUpperCase();
        const isContado = idUpper.startsWith('HAB-') || (!idUpper.startsWith('SUM-') && isSecret);

        // El cliente no necesita saber en qué pestaña interna anda el albarán
        // ("Pendiente de asignar" y compañía son etiquetas nuestras): lo que le
        // importa del justificante es si el porte queda cobrado o a deber.
        // Ojo: porte y reembolso se liquidan por separado, así que "PAGADO" solo
        // vale cuando no queda ninguno de los dos suelto (ver Shipment.js).
        const porteCobrado = shipment.portePaid === true || shipment.paymentStatus === 'Paid';
        const reembolsoPendiente = hasReembolso && shipment.codPaid !== true;
        // 'Tarifa' es un importe por concretar, pero se cobra igual: cuenta como
        // que hay algo pendiente aunque el precio no salga en el mensaje.
        const hayQueCobrar = priceBase > 0 || hasReembolso || normalize(shipment.amount) === 'tarifa';
        const estadoText = !hayQueCobrar
            ? ''
            : porteCobrado
                ? (reembolsoPendiente
                    ? `*Estado:* Porte pagado · reembolso pendiente\n`
                    : `*Estado:* PAGADO\n`)
                : `*Estado:* PENDIENTE DE COBRO\n`;

        const fmt = (n) => n.toFixed(2).replace('.', ',');
        const priceText = priceBase > 0
            ? (isContado
                ? `*Precio:* ${fmt(priceBase)} €\n`
                : `*Precio:* ${fmt(priceBase)} € + IVA = *${fmt(priceTotal)} €*\n`)
            : '';

        const message = `${titleText}\n\n` +
            `*REF:* ${shipment.id}\n` +
            `*Fecha:* ${date}\n` +
            `*Remitente:* ${origin}\n` +
            `*Destinatario:* ${dest}\n` +
            estadoText +
            priceText +
            codText +
            `\n` +
            `Gracias por su confianza.`;

        let finalPhone = cleanPhone;
        // Si tiene 9 dígitos y empieza por 6, 7 o 9 (típico de España), añadimos el 34 si no lo tiene
        if (cleanPhone.length === 9 && (cleanPhone.startsWith('6') || cleanPhone.startsWith('7') || cleanPhone.startsWith('9'))) {
            finalPhone = `34${cleanPhone}`;
        } else if (cleanPhone.length === 9) {
            // Por si acaso es un fijo u otro no detectado pero de 9 cifras
            finalPhone = `34${cleanPhone}`;
        }
        
        // --- QUIÉN VA PRIMERO: GUARDAR EL TELÉFONO O ABRIR WHATSAPP ---
        // Depende del móvil, y por eso no se puede hacer igual en los dos:
        const hayQueGuardar = Boolean(manualPhone && cleanPhone);

        if (necesitaGestoDelUsuario()) {
            // iPhone. La bandeja de compartir solo la abre iOS si viene del dedo del
            // usuario, y esperar a Supabase se come ese permiso: hay que abrirla ya.
            // Se puede, porque la bandeja NO descarga la página (a diferencia de
            // navegar a wa.me), así que el teléfono se guarda tranquilamente detrás.
            setWhatsappPrompt(null);
            abrirWhatsApp({ telefono: finalPhone, mensaje: message });
            if (hayQueGuardar) {
                guardarTelefono().catch(err =>
                    console.error("[WhatsApp] Error guardando el teléfono:", err));
            }
            return;
        }

        // Android y el resto: aquí sí navegamos fuera y la página se descarga, así que
        // el teléfono tiene que estar guardado ANTES de salir.
        if (hayQueGuardar) {
            setWhatsappPrompt(prev => prev ? { ...prev, saving: true } : prev);
            // Tope de espera: sin cobertura la escritura se encola en local y vuelve
            // enseguida, pero con una red mala de verdad no vamos a dejar al conductor
            // mirando el botón; a los 6 segundos se abre WhatsApp igual.
            await Promise.race([
                guardarTelefono(),
                new Promise(resolve => setTimeout(resolve, 6000)),
            ]);
        }
        setWhatsappPrompt(null);

        // Primero WhatsApp Business (el de trabajo) y, si el móvil no lo tiene, el
        // WhatsApp normal. Ver src/utils/whatsappLink.js.
        abrirWhatsApp({ telefono: finalPhone, mensaje: message });
    };

    // AI / Smart Features State
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [showRouteMap, setShowRouteMap] = useState(false);
    const [routeOptimized, setRouteOptimized] = useState(false);
    const [learningMessage, setLearningMessage] = useState(null);
    // A qué altura cae el cartel del optimizador. Iba clavado a top-24 y se plantaba
    // ENCIMA de las pestañas (Entregas, C.Pendientes), que no se podían tocar mientras
    // estuviera puesto. La cabecera no mide siempre lo mismo — crece con el banner de
    // "sin conexión" y con la lupa A+/A- —, así que se mide en vivo en vez de a ojo.
    const [alturaDelAviso, setAlturaDelAviso] = useState(96);
    // Paradas de agencia que el optimizador ha colado por delante de las nuestras
    // porque quedaban de camino. Se marcan en la tarjeta: la última palabra sobre si
    // conviene entregarlas ahí es del transportista, y para eso tiene que verlo.
    const [paradasDeCamino, setParadasDeCamino] = useState(() => new Set());

    // Se mide con offsetHeight y no con getBoundingClientRect a propósito: el panel
    // entero va dentro de un style={{ zoom }} y el rect viene ya multiplicado por la
    // lupa, mientras que el `top` del cartel se interpreta sin multiplicar. Con el
    // rect, en A+ el cartel se iba más abajo de la cuenta.
    useEffect(() => {
        if (!learningMessage) return;
        const medir = () => {
            const cabecera = document.getElementById('driver-header');
            if (!cabecera) return;
            // Cuando no hay cobertura la cabecera baja para dejar sitio al banner.
            const desplazada = (!isOnline || justReconnected) ? 40 : 0;
            setAlturaDelAviso(desplazada + cabecera.offsetHeight + 8);
        };
        medir();
        window.addEventListener('resize', medir);
        return () => window.removeEventListener('resize', medir);
    }, [learningMessage, isOnline, justReconnected, zoom]);

    // Tracks which collection items are being processed (Optimistic UI)

    // dnd-kit Sensors — Only PointerSensor (handles both mouse + touch via Pointer Events API).
    // IMPORTANT: We do NOT use TouchSensor because its setup() registers a global
    // window-level touchmove listener with {passive:false} that blocks ALL native
    // scrolling on Android Chrome.
    // Activación por distancia, no por tiempo: el arrastre sale solo del asa de
    // puntitos, que ya lleva touch-action:none y nunca hace scroll, así que no hay
    // que distinguir "arrastrar" de "deslizar la lista". Con delay+tolerance el dedo
    // se pasaba de los 5px antes de los 200ms y el gesto se cancelaba siempre.
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragStart = (event) => {
        setActiveId(event.active.id);
        // FeedBack háptico
        if (window.navigator.vibrate) {
            window.navigator.vibrate(20);
        }
    };

    const handleDragEnd = async (event) => {
        const { active, over } = event;
        setActiveId(null);
        if (over && active.id !== over.id) {
            const oldIndex = localRoute.findIndex(item => item.id === active.id);
            const newIndex = localRoute.findIndex(item => item.id === over.id);
            
            const newRoute = arrayMove(localRoute, oldIndex, newIndex);
            setLocalRoute(newRoute);

            // Si el transportista mueve a mano una parada que el optimizador había
            // adelantado por quedar de camino, la etiqueta ya no describe nada: la
            // decisión pasa a ser suya, así que se le quita el aviso.
            setParadasDeCamino(prev => {
                if (!prev.has(active.id)) return prev;
                const siguiente = new Set(prev);
                siguiente.delete(active.id);
                return siguiente;
            });


            // --- PERSIST ORDER: localStorage (inmediato) + Supabase (nube) ---
            if (currentDriverId) {
                const idsToSave = newRoute.filter(Boolean).map(s => s.id);
                
                // 1. localStorage inmediato (por si cierra la app antes de que Supabase responda)
                try {
                    localStorage.setItem(`drv_route_${currentDriverId}`, JSON.stringify(idsToSave));
                } catch (e) { console.warn('localStorage save failed:', e); }
                
                // 2. Supabase (persistencia definitiva en la nube)
                try {
                    const { data: adminUser } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                    if (adminUser) {
                        const updatedData = { ...adminUser.data, routeOrder: idsToSave };
                        await supabase.from('drivers').update({ data: updatedData }).eq('id', currentDriverId);
                        console.log("[Drag] Route order persisted to Cloud for driver", currentDriverId);
                    }
                } catch (err) {
                    console.error("[Drag] Failed to persist route order to cloud:", err);
                }
            }
        }
    };

    // Derived State Logic
    const [localRoute, setLocalRoute] = useState([]);
    const [isInitialized, setIsInitialized] = useState(false);




    // Helper to get legal name and CIF
    const getClientLegalInfo = (clientName) => {
        if (!clients || !clientName) return { name: clientName, cif: '' };
        const clientObj = clients.find(c => (c.name || '').toLowerCase() === clientName.toLowerCase());
        if (clientObj) {
            return {
                name: clientObj.legalName || clientObj.name || clientName,
                cif: clientObj.cif ? ` (CIF: ${clientObj.cif})` : ''
            };
        }
        return { name: clientName, cif: '' };
    };

    // Nombre del remitente para el justificante de reembolso: es quien recibe el
    // dinero y firma, así que se busca en el envío si el cobro no lo trae.
    // Los cobros viejos guardaron el literal 'N/A', que aquí vale como vacío.
    const getReceiptSenderName = (item) => {
        const raw = item?.sender && item.sender !== 'N/A' ? item.sender : null;
        const shipmentId = item?.original?.shipmentId || item?.id;
        const ship = raw ? null : (allShipments || []).find(s => s.id === shipmentId);
        const name = raw || ship?.originName || ship?.client || '';
        if (!name) return '__________________________';
        const legal = getClientLegalInfo(name);
        return `${legal.name}${legal.cif}`;
    };

    // Print Receipt Function (with QR code for scanning)
    const handlePrintReceipt = (collection) => {
        const legalInfo = getClientLegalInfo(collection.client);
        // Extract the shipment ID from collection
        const shipmentId = collection.original?.shipmentId || collection.id?.replace('-reembolso', '') || collection.id || 'N/A';
        const qrData = `COD:${shipmentId}`;
        const receiptWindow = window.open('', '_blank');
        receiptWindow.document.write(`
            <html>
                <head>
                    <title>Justificante de Entrega de Fondos</title>
                    <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
                        .title { font-size: 16px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 12px; color: #666; }
                        .details { margin-bottom: 20px; }
                        .row { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 5px; font-size: 12px; }
                        .row span:last-child { text-align: right; word-break: break-word; }
                        .label { font-weight: bold; flex-shrink: 0; }
                        .amount { font-size: 18px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 1px dashed #ccc; padding-top: 10px; }
                        .qr-section { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px; }
                        .signature-box { flex: 1; border-top: 1px solid #000; padding-top: 5px; text-align: center; font-size: 10px; margin-right: 15px; }
                        .qr-box { text-align: center; }
                        .qr-box p { font-size: 7px; color: #999; margin: 2px 0 0 0; }
                        .footer { margin-top: 20px; font-size: 8px; text-align: center; color: #888; }
                        @media print {
                            body { width: 80mm; }
                            button { display: none; }
                        }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">SUMTRANS LOGISTICA</h1>
                        <p class="subtitle">Justificante de Reembolso</p>
                    </div>
                    
                    <div class="details">
                        <div class="row">
                            <span class="label">Fecha:</span>
                            <span>${new Date().toLocaleString()}</span>
                        </div>
                         <div class="row">
                            <span class="label">ID Envío:</span>
                            <span>${shipmentId}</span>
                        </div>
                        <div class="row">
                            <span class="label">Cliente:</span>
                            <span>${legalInfo.name}${legalInfo.cif}</span>
                        </div>
                        <div class="row">
                            <span class="label">Recibe (Remitente):</span>
                            <span>${getReceiptSenderName(collection)}</span>
                        </div>
                         <div class="row">
                            <span class="label">Concepto:</span>
                            <span>${collection.type}</span>
                        </div>
                        
                        <div class="amount">
                            TOTAL: €${collection.amount}
                        </div>
                    </div>

                    <div class="qr-section">
                        <div class="signature-box">
                            Firma y Sello del Cliente (Remitente)
                            <br/><br/><br/>
                        </div>
                        <div class="qr-box">
                            <div id="qrcode"></div>
                            <p>${shipmentId}</p>
                        </div>
                    </div>
                    
                    <div class="footer">
                        Este documento justifica la entrega del importe recaudado al remitente.
                    </div>

                    <div id="no-print-actions" style="margin-top: 30px; text-align: center;">
                        <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%;">
                            VOLVER A LA APP
                        </button>
                    </div>

                    <script>
                        window.onload = function() { 
                            var qr = qrcode(0, 'M');
                            qr.addData('${qrData}');
                            qr.make();
                            document.getElementById('qrcode').innerHTML = qr.createImgTag(3, 4);
                            setTimeout(() => {
                                window.print();
                            }, 500);
                        }
                        window.onafterprint = function() {
                            setTimeout(() => window.close(), 300);
                        };
                    <\/script>
                </body>
            </html>
        `);
        receiptWindow.document.close();
    };

    // Print ALL receipts in A6 format (one per page)
    const handlePrintAllReceipts = (items) => {
        if (!items || items.length === 0) {
            alert('No hay justificantes de reembolso para imprimir.');
            return;
        }

        // Build receipt cards HTML
        const buildReceiptCard = (item) => {
            const legalInfo = getClientLegalInfo(item.client);
            const shipmentId = item.original?.shipmentId || item.id?.replace('-reembolso', '') || item.id || 'N/A';
            const qrData = `COD:${shipmentId}`;
            return `
                <div class="page">
                    <div class="receipt-card">
                        <div class="card-header">
                            <h2>SUMTRANS LOGISTICA</h2>
                            <p>Justificante de Reembolso</p>
                        </div>
                        <div class="card-details">
                            <div class="card-row"><span class="lbl">Fecha:</span><span>${new Date().toLocaleDateString('es-ES')}</span></div>
                            <div class="card-row"><span class="lbl">ID Envío:</span><span class="mono">${shipmentId}</span></div>
                            <div class="card-row"><span class="lbl">Cliente:</span><span>${legalInfo.name}${legalInfo.cif}</span></div>
                            <div class="card-row"><span class="lbl">Recibe (Remitente):</span><span>${getReceiptSenderName(item)}</span></div>
                        </div>
                        <div class="card-amount">TOTAL: €${item.amount || item.amountDisplay?.replace('€', '').trim()}</div>
                        <div class="card-bottom">
                            <div class="card-signature">
                                <div class="sig-line"></div>
                                <span>Firma y Sello</span>
                            </div>
                            <div class="card-qr" data-qr="${qrData}" data-label="${shipmentId}"></div>
                        </div>
                        <p class="card-footer">Justifica la entrega del importe recaudado al remitente.</p>
                    </div>
                </div>
            `;
        };

        const pagesHtml = items.map(item => buildReceiptCard(item)).join('');

        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
            <head>
                <title>Justificantes de Reembolso (A6)</title>
                <script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"><\/script>
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body { font-family: Arial, sans-serif; background: #f0f0f0; }
                    .page {
                        width: 105mm; height: 148mm; /* A6 Size */
                        background: white;
                        margin: 0 auto 10mm auto;
                        padding: 4mm;
                        display: flex;
                        flex-direction: column;
                        page-break-after: always;
                        box-shadow: 0 0 5px rgba(0,0,0,0.1);
                    }
                    .page:last-child { page-break-after: auto; }
                    .receipt-card {
                        flex: 1;
                        border: 2px dashed #ccc;
                        padding: 6mm;
                        display: flex; flex-direction: column;
                        justify-content: space-between;
                    }
                    .card-header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 8px; margin-bottom: 12px; }
                    .card-header h2 { font-size: 18px; margin: 0; font-weight: bold; }
                    .card-header p { font-size: 12px; color: #666; margin: 4px 0 0; }
                    .card-details { margin-bottom: 10px; }
                    .card-row { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; margin-bottom: 8px; }
                    .card-row span:last-child { text-align: right; word-break: break-word; }
                    .lbl { font-weight: bold; flex-shrink: 0; }
                    .mono { font-family: monospace; font-weight: bold; font-size: 14px; }
                    .card-amount { font-size: 24px; font-weight: bold; text-align: right; border-top: 1px dashed #aaa; padding-top: 10px; margin-bottom: 12px; }
                    .card-bottom { display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; }
                    .card-signature { flex: 1; margin-right: 15px; text-align: center; }
                    .sig-line { border-top: 1px solid #000; margin-bottom: 4px; margin-top: 40px; }
                    .card-signature span { font-size: 10px; }
                    .card-qr { text-align: center; }
                    .card-qr p { font-size: 10px; color: #999; margin-top: 4px; }
                    .card-footer { font-size: 10px; color: #999; text-align: center; margin-top: 12px; }
                    .no-print { text-align: center; padding: 20px; }
                    
                    @page { margin: 0; }
                    @media print {
                        body { background: white; margin: 0; padding: 0; }
                        .page { 
                            margin: 0; 
                            padding: 4mm;
                            box-shadow: none; 
                            width: 105mm; 
                            height: 148mm; 
                            page-break-after: always;
                        }
                        .no-print { display: none !important; }
                    }
                </style>
            </head>
            <body>
                ${pagesHtml}
                <div class="no-print">
                    <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer;">
                        VOLVER A LA APP
                    </button>
                </div>
                <script>
                    window.onload = function() {
                        document.querySelectorAll('.card-qr').forEach(function(el) {
                            var data = el.getAttribute('data-qr');
                            var label = el.getAttribute('data-label');
                            if (data) {
                                var qr = qrcode(0, 'M');
                                qr.addData(data);
                                qr.make();
                                el.innerHTML = qr.createImgTag(3, 4) + '<p>' + label + '</p>';
                            }
                        });
                        setTimeout(function() { window.print(); }, 600);
                    };
                    window.onafterprint = function() { setTimeout(function() { window.close(); }, 300); };
                <\/script>
            </body>
            </html>
        `);
        printWindow.document.close();
    };
    // Print Porte (Shipping Fees) Report - Only cash collections (Clientes Habituales / new clients)
    const handlePrintPorte = () => {
        const porteRows = allPorteDetail.map(item => {
            const senderLegal = getClientLegalInfo(item.sender).name;
            const receiverLegal = getClientLegalInfo(item.receiver).name;
            
            const displaySender = item.payer === 'sender' ? `<u><b>${senderLegal}</b></u>` : senderLegal;
            const displayReceiver = item.payer === 'receiver' ? `<u><b>${receiverLegal}</b></u>` : receiverLegal;

            return `
            <tr>
                <td>${item.date || ''} ${displaySender} - ${displayReceiver}</td>
                <td>${item.sourceTitle}</td>
                <td style="text-align:right">€${parseAmount(item.amount).toFixed(2)}</td>
            </tr>
        `;
        }).join('');

        const porteWindow = window.open('', '_blank');
        porteWindow.document.write(`
                <html>
                <head>
                    <title>Resumen Porte del Día</title>
                    <style>
                        body { font-family: 'Arial', sans-serif; padding: 20px; max-width: 80mm; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 15px; }
                        .title { font-size: 14px; font-weight: bold; margin: 0; }
                        .subtitle { font-size: 10px; color: #666; }
                        .info { font-size: 11px; margin-bottom: 10px; }
                        table { width: 100%; font-size: 10px; border-collapse: collapse; }
                        th { text-align: left; border-bottom: 1px solid #ccc; padding: 4px 0; }
                        td { padding: 4px 0; border-bottom: 1px dashed #eee; }
                        .total { font-size: 14px; font-weight: bold; text-align: right; margin-top: 10px; border-top: 2px solid #333; padding-top: 10px; }
                        .footer { margin-top: 15px; font-size: 8px; text-align: center; color: #888; }
                        @media print { body { width: 80mm; } button { display: none; } }
                    </style>
                </head>
                <body>
                    <div class="header">
                        <h1 class="title">SUMTRANS LOGISTICA</h1>
                        <p class="subtitle">Resumen de Porte (Solo Clientes Habituales)</p>
                    </div>
                    
                    <div class="info">
                        <strong>Conductor:</strong> ${(() => { const d = (drivers || []).find(d => Number(d.id) === Number(currentDriverId)); return d ? d.name : 'Conductor'; })()} (DRV-${currentDriverId})<br/>
                        <strong>Fecha:</strong> ${new Date().toLocaleDateString()}
                    </div>

                    <table>
                        <thead>
                            <tr><th>Cliente</th><th>Concepto</th><th>Importe</th></tr>
                        </thead>
                        <tbody>
                            ${porteRows || '<tr><td colspan="3" style="text-align:center">Sin cobros de porte hoy</td></tr>'}
                        </tbody>
                    </table>
                    
                    <div class="total">
                        TOTAL PORTE: €${collectedPorte.toFixed(2)}
                    </div>
                    
                    <div class="footer">
                        * Solo incluye clientes cliente habitual / contado<br/>
                        Generado: ${new Date().toLocaleString()}
                    </div>

                    <div id="no-print-actions" style="margin-top: 30px; text-align: center;">
                        <button onclick="window.close()" style="background: #3b82f6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-weight: bold; font-size: 16px; cursor: pointer; width: 100%;">
                            VOLVER A LA APP
                        </button>
                    </div>

                    <script>
                        window.onload = function() { 
                            setTimeout(() => {
                                window.print();
                            }, 500);
                        }
                        window.onafterprint = function() {
                            setTimeout(() => window.close(), 300);
                        };
                    </script>
                </body>
                </html>
        `);
        porteWindow.document.close();
    };

    // --- OFFLINE PERSISTENCE & SYNC LOGIC ---
    const [syncQueue, setSyncQueue] = useState(() => {
        const saved = localStorage.getItem('drv_sync_queue');
        return saved ? JSON.parse(saved) : [];
    });

    // Save queue whenever it changes
    useEffect(() => {
        try {
            localStorage.setItem('drv_sync_queue', JSON.stringify(syncQueue));
        } catch (e) {
            console.warn("No se puede guardar syncQueue local por límite Safari", e);
        }
    }, [syncQueue]);

    // Background Sync Loop
    useEffect(() => {
        const syncInterval = setInterval(() => {
            if (navigator.onLine && syncQueue.length > 0) {
                console.log("Network detected: Syncing offline tasks...", syncQueue.length);
                const task = syncQueue[0];
                
                // Try to sync the first task
                try {
                    if (task.type === 'status') {
                        onStatusChange(task.id, task.status, task.coordinates);
                    }
                    // If success, remove from queue
                    setSyncQueue(prev => prev.slice(1));
                } catch (err) {
                    console.error("Sync task failed, will retry:", err);
                }
            }
        }, 5000); // Check every 5 seconds

        return () => clearInterval(syncInterval);
    }, [syncQueue, onStatusChange]);

    const addToSyncQueue = (task) => {
        setSyncQueue(prev => [...prev, task]);
    };
    const [timeTick, setTimeTick] = useState(0);
    useEffect(() => {
        const interval = setInterval(() => {
            setTimeTick(t => t + 1);
        }, 15000); // Refresca cada 15 segundos para las citas programadas
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (!allShipments) return;

        const now = new Date();
        const localCurrentStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

        const assigned = allShipments.filter(s => {
            if (!s || Number(s.assignedDriverId) !== Number(currentDriverId)) return false;
            if (s.status === 'Entregado' || s.status === 'Entrega aplazada') return false;
            if (s.type === 'Recibo') return false; // Solo mostrar en cobros pendientes
            
            if (s.scheduledDate) {
                if (s.scheduledDate.length === 10) {
                    // It's a pure date "YYYY-MM-DD"
                    const todayStr = localCurrentStr.split('T')[0];
                    if (s.scheduledDate > todayStr) return false;
                } else {
                    // It's a datetime "YYYY-MM-DDTHH:mm"
                    if (s.scheduledDate > localCurrentStr) return false;
                }
            }
            return true;
        });
        
        if (!isInitialized) {
            // ── INICIALIZACIÓN: Restaurar el orden guardado ──
            // IMPORTANTE: Esperar a que:
            // 1. currentDriver esté cargado (para tener routeOrder)
            // 2. La carga inicial haya terminado (para tener todos los envíos)
            if (!currentDriver && currentDriverId) {
                console.log("[RouteInit] Waiting for currentDriver to load...");
                return;
            }
            if (isInitialLoading) {
                console.log("[RouteInit] Waiting for initial data load to complete...");
                return;
            }

            const cloudOrder = currentDriver?.routeOrder;
            const localStorageRoute = JSON.parse(localStorage.getItem(`drv_route_${currentDriverId}`) || 'null');
            const savedRoute = cloudOrder || localStorageRoute;
            
            console.log("[RouteInit] Initializing:", { 
                cloudOrder: cloudOrder ? cloudOrder.length + ' items' : 'null', 
                localStorage: localStorageRoute ? localStorageRoute.length + ' items' : 'null',
                assigned: assigned.length 
            });

            if (savedRoute && Array.isArray(savedRoute) && savedRoute.length > 0) {
                try {
                    const getSavedId = item => typeof item === 'object' && item !== null ? item.id : item;
                    const freshIds = new Set(assigned.map(s => s.id));
                    
                    const restored = savedRoute
                        .map(getSavedId)
                        .filter(id => freshIds.has(id)) 
                        .map(id => assigned.find(a => a.id === id))
                        .filter(Boolean);
                    
                    // Force Uniqueness
                    const uniqueRestored = Array.from(new Map(restored.map(s => [s.id, s])).values());
                    const restoredIds = new Set(uniqueRestored.map(r => r.id));
                    // Envíos nuevos (no estaban en el orden guardado) → van ARRIBA
                    const completelyNew = assigned.filter(a => !restoredIds.has(a.id));
                    
                    const finalRoute = [...completelyNew, ...uniqueRestored];
                    setLocalRoute(finalRoute);
                    console.log(`[RouteInit] Restored ${uniqueRestored.length} items + ${completelyNew.length} new at top`);
                } catch (e) {
                    console.warn("[RouteInit] Error rehydrating route:", e);
                    setLocalRoute(assigned);
                }
            } else {
                setLocalRoute(assigned);
                console.log("[RouteInit] No saved order found, using default assignment order");
            }
            setIsInitialized(true);
        } else {
            // ── SINCRONIZACIÓN PERIÓDICA: NUNCA reordenar ──
            // Solo: actualizar datos frescos, quitar entregados/desasignados, añadir nuevos arriba
            const assignedMap = new Map(assigned.map(s => [s.id, s]));
            
            // 1. Mantener el orden actual, actualizando solo los datos de cada envío
            const updatedExisting = [];
            const existingIds = new Set();
            
            localRoute.forEach(local => {
                if (!local || existingIds.has(local.id)) return;
                const fresh = assignedMap.get(local.id);
                if (fresh) {
                    // El envío sigue activo → actualizar datos sin mover posición
                    updatedExisting.push({ ...local, ...fresh });
                    existingIds.add(local.id);
                }
                // Si no está en assigned → fue entregado/desasignado → se elimina silenciosamente
            });

            // 2. Detectar envíos completamente nuevos (asignados desde oficina, etc.)
            const onlyNew = assigned.filter(s => !existingIds.has(s.id));
            
            // 3. Nuevos van ARRIBA, existentes mantienen su orden
            const newRoute = [...onlyNew, ...updatedExisting];
            setLocalRoute(newRoute);
            
            // 4. Persistir a localStorage (solo backup local rápido, NO tocar la nube)
            //    La nube solo se actualiza al arrastrar (handleDragEnd)
            try {
                const idsToSave = newRoute.map(s => s.id);
                localStorage.setItem(`drv_route_${currentDriverId}`, JSON.stringify(idsToSave));
            } catch (e) {
                console.warn("Storage Quota Exceeded Safari:", e);
            }

            // 5. Si hay envíos REALMENTE nuevos, persistir a la nube
            if (onlyNew.length > 0 && currentDriverId) {
                const idsToSave = newRoute.map(s => s.id);
                (async () => {
                    try {
                        const { data: drvData } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                        if (drvData) {
                            const updatedData = { ...drvData.data, routeOrder: idsToSave };
                            await supabase.from('drivers').update({ data: updatedData }).eq('id', currentDriverId);
                            console.log(`[RouteSync] Cloud updated: ${onlyNew.length} new shipment(s) added to route`);
                        }
                    } catch (err) {
                        console.warn("[RouteSync] Failed to persist route order to cloud:", err);
                    }
                })();
            }
        }
    }, [allShipments, currentDriverId, currentDriver, isInitialized, isInitialLoading, timeTick]);

    const deliveredShipments = useMemo(() => {
        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
        return (allShipments || [])
            .filter(s => {
                if (!s || s.status !== 'Entregado') return false;
                if (s.type === 'Recibo') return false; // No mostrar en el historial de entregas
                // El conductor puede ser el asignado O el que recogió los bultos
                const isMyDelivery = Number(s.assignedDriverId) === Number(currentDriverId) 
                    || Number(s.pickedUpById) === Number(currentDriverId);
                if (!isMyDelivery) return false;
                if (!s.updatedAt) return false;
                
                // Usamos deliveredAt si existe. Si es un envío antiguo, fallback a updatedAt
                const deliveryDateStr = s.deliveredAt ? new Date(s.deliveredAt).toLocaleDateString('en-CA') : new Date(s.updatedAt).toLocaleDateString('en-CA');
                
                // Heurística para envíos antiguos: Si NO tiene deliveredAt explícito, pero sabemos
                // que el pago se registró casi a la vez que el updatedAt (diferencia < 60s por retrasos de red o triggers de BD), 
                // fue una actualización solo de cobro. Evitamos mostrarlo en Entregas de Hoy.
                if (!s.deliveredAt && s.paymentStatus === 'Paid' && s.paidAt && s.updatedAt) {
                    const diffMs = Math.abs(new Date(s.updatedAt).getTime() - new Date(s.paidAt).getTime());
                    if (diffMs < 60000) {
                        return false;
                    }
                }

                return deliveryDateStr === today;
            })
            .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    }, [allShipments, currentDriverId]);
    const [activeId, setActiveId] = useState(null);
    const [clientPriorities, setClientPriorities] = useState(() => {
        const saved = localStorage.getItem('drv_priorities');
        return saved ? JSON.parse(saved) : {};
    });

    const updatePriority = (clientName) => {
        if (!clientName) return;
        setClientPriorities(prev => {
            const current = prev[clientName] || 0;
            const updated = { ...prev, [clientName]: current + 5 }; // Increment priority
            try {
                localStorage.setItem('drv_priorities', JSON.stringify(updated));
            } catch (e) {
                console.warn("Límite Safari: no se pueden guardar prioridades", e);
            }
            return updated;
        });
    };

    // --- APRENDIZAJE DEL ORDEN DE ENTREGA ---
    // Formato en utils/aprendizajeRuta.js. `adaptarConocimiento` se encarga de que lo
    // que hay guardado del formato antiguo (posición absoluta, pueblo sin normalizar)
    // siga valiendo, así que nadie pierde lo que llevaba aprendido.
    const [positionLearning, setPositionLearning] = useState(() => {
        try {
            // 1. La copia del propio móvil
            const saved = localStorage.getItem(`drv_pos_learn_${currentDriverId}`);
            if (saved) {
                const parsed = adaptarConocimiento(JSON.parse(saved));
                if (contarPueblosMemorizados(parsed) > 0) return parsed;
            }
            // 2. Lo que haya en la nube de este conductor
            const cloudData = routeKnowledge?.byDriver?.[String(currentDriverId)];
            if (contarPueblosMemorizados(cloudData) > 0) {
                const adaptado = adaptarConocimiento(cloudData);
                localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(adaptado));
                return adaptado;
            }
            // 3. Heredar el maestro de su ruta, si lo hay
            const myRoute = (routes || []).find(r => String(r.conductorId) === String(currentDriverId));
            if (myRoute) {
                const masterData = routeKnowledge?.masterByRoute?.[myRoute.id];
                if (contarPueblosMemorizados(masterData) > 0) {
                    const adaptado = adaptarConocimiento(masterData);
                    localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(adaptado));
                    console.log('📚 Heredado el conocimiento maestro de la ruta:', myRoute.nombre);
                    return adaptado;
                }
            }
            return {};
        } catch { return {}; }
    });
    const deliveredTodayRef = useRef([]); // Track today's deliveries in order for learning
    const syncTimeoutRef = useRef(null); // Debounce cloud sync

    // Órdenes de administración sobre el aprendizaje (borrar / recuperar).
    // El aprendizaje real vive en localStorage, así que tocarlo solo en la nube no
    // serviría de nada: hay que aplicar la orden también aquí. La fecha de la orden
    // hace de marcador para no repetirla en cada arranque.
    useEffect(() => {
        const id = String(currentDriverId || '');
        const orden = routeKnowledge?.actionByDriver?.[id];
        if (!id || !orden?.fecha) return;

        const yaAplicada = localStorage.getItem(`drv_pos_learn_orden_${id}`) === orden.fecha;
        if (yaAplicada) return;

        // Corta cualquier sincronización pendiente, que subiría lo que vamos a tirar
        clearTimeout(syncTimeoutRef.current);

        try {
            if (orden.accion === 'borrado') {
                localStorage.removeItem(`drv_pos_learn_${id}`);
                setPositionLearning({});
                console.log('🧹 Aprendizaje borrado por administración');
            } else if (orden.accion === 'recuperado') {
                const recuperado = routeKnowledge?.byDriver?.[id] || {};
                localStorage.setItem(`drv_pos_learn_${id}`, JSON.stringify(recuperado));
                setPositionLearning(recuperado);
                console.log('♻️ Aprendizaje recuperado por administración');
            } else {
                return; // orden desconocida: no marcamos nada
            }
            localStorage.setItem(`drv_pos_learn_orden_${id}`, orden.fecha);
        } catch (e) {
            console.warn('No se pudo aplicar la orden de aprendizaje:', e);
        }
    }, [routeKnowledge, currentDriverId]);

    /**
     * Apunta en qué orden confirma el transportista las entregas de cada pueblo.
     *
     * Lo que se guarda es el orden RELATIVO (el 1º de 4, el 3º de 4...), no la
     * posición a secas: si un día Cabra tiene 3 paradas y otro 9, "el último" no puede
     * valer 3 un día y 9 el otro, porque la media los mezcla como si fueran lo mismo.
     * Para eso hace falta saber cuántas paradas tenía el pueblo ESE día, que es la
     * suma de las ya entregadas más las que siguen pendientes en la ruta.
     */
    const recordDeliveryPosition = (shipment) => {
        if (!shipment) return;
        const pueblo = ciudadDeEnvio(shipment);
        const cliente = nombreDeParada(shipment);
        const clavePueblo = normalizarPueblo(pueblo);
        if (!clavePueblo || !cliente) return;

        if (!deliveredTodayRef.current.some(d => d.id === shipment.id)) {
            deliveredTodayRef.current.push({ id: shipment.id, pueblo: clavePueblo, cliente });
        }
        const entregadas = deliveredTodayRef.current.filter(d => d.pueblo === clavePueblo);
        const posicion = entregadas.findIndex(d => d.id === shipment.id) + 1;

        const yaContadas = new Set(entregadas.map(d => d.id));
        const pendientes = (localRoute || []).filter(s =>
            s && !yaContadas.has(s.id) && normalizarPueblo(ciudadDeEnvio(s)) === clavePueblo
        ).length;

        setPositionLearning(prev => {
            const updated = registrarEntrega(prev, {
                pueblo,
                turno: turnoQueSeRepartaAhora(),
                cliente,
                posicion,
                total: entregadas.length + pendientes,
            });

            try {
                localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(updated));
            } catch (e) { console.warn('No se pudo guardar el aprendizaje:', e); }

            // Subida a la nube con retardo, para no llamar en cada entrega
            if (onUpdateRouteKnowledge) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = setTimeout(() => {
                    // `driverId` hace que se escriba solo la fila de este repartidor,
                    // sin tocar la de los demás ni el JSON común.
                    onUpdateRouteKnowledge({
                        ...routeKnowledge,
                        byDriver: {
                            ...(routeKnowledge?.byDriver || {}),
                            [String(currentDriverId)]: updated
                        }
                    }, { driverId: currentDriverId });
                    console.log('☁️ Aprendizaje sincronizado');
                }, 30000);
            }
            return updated;
        });
    };

    // Reset daily counters at start of day
    useEffect(() => {
        const todayKey = new Date().toISOString().slice(0, 10);
        const lastDay = localStorage.getItem(`drv_learn_day_${currentDriverId}`);
        if (lastDay !== todayKey) {
            deliveredTodayRef.current = [];
            localStorage.setItem(`drv_learn_day_${currentDriverId}`, todayKey);
        }
    }, [currentDriverId]);

    // Espejo del aprendizaje para poder volcarlo al cerrar la app.
    // El efecto de abajo se monta una sola vez, así que su closure se quedaba con el
    // valor del PRIMER render: al cerrar subía el aprendizaje tal y como estaba al
    // abrir, tirando lo aprendido durante la jornada y pudiendo pisar en la nube algo
    // más reciente que hubiera subido el propio móvil.
    const positionLearningRef = useRef(positionLearning);
    useEffect(() => { positionLearningRef.current = positionLearning; }, [positionLearning]);

    // Volcado del aprendizaje al cerrar la app
    useEffect(() => {
        return () => {
            clearTimeout(syncTimeoutRef.current);
            const aprendido = positionLearningRef.current;
            // `contarPueblosMemorizados` y no `Object.keys`: un aprendizaje vacío lleva
            // la marca de versión, así que contando claves parecía que había algo.
            if (onUpdateRouteKnowledge && contarPueblosMemorizados(aprendido) > 0) {
                onUpdateRouteKnowledge({
                    ...routeKnowledge,
                    byDriver: {
                        ...(routeKnowledge?.byDriver || {}),
                        [String(currentDriverId)]: aprendido
                    }
                }, { driverId: currentDriverId });
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // ═══════════════════════════════════════════════════════════════════
    // OPTIMIZADOR DE RUTA
    // La lógica vive en utils/optimizadorRuta.js, que es una función pura y con
    // tests. Aquí solo queda pedir el GPS, llamar y guardar el resultado.
    // ═══════════════════════════════════════════════════════════════════
    const handleSmartSort = () => {
        if (!localRoute || localRoute.length === 0) return;

        // Sin cartel de "Optimizando ruta...": el propio botón ya pone "Calculando..."
        // mientras trabaja, y el conductor no necesita nada más.
        setIsOptimizing(true);

        // Si algo falla, el aviso sí sale (eso sí le importa al que reparte), pero se
        // va solo a los 5 segundos para no dejarle un cartel puesto en la pantalla.
        const terminar = () => {
            setIsOptimizing(false);
            clearTimeout(mensajeTimeoutRef.current);
            mensajeTimeoutRef.current = setTimeout(() => setLearningMessage(""), 5000);
        };

        // Cuando la parada es una dirección nueva (sin coordenadas propias ni de
        // cliente), no hay forma de saber a qué distancia está del conductor. Antes
        // de rendirse y mandarla al final, se mira si algún OTRO cliente de ese mismo
        // pueblo tiene coordenadas aprendidas de entregas anteriores, y se usan como
        // referencia aproximada de dónde cae el pueblo.
        const puntoDeOtroCliente = (pueblo) => {
            const clave = normalizarPueblo(pueblo);
            if (!clave) return null;
            const conocido = (clients || []).find(c =>
                c?.coordinates && normalizarPueblo(c.city) === clave
            );
            return conocido ? parsearCoordenadas(conocido.coordinates) : null;
        };

        /**
         * Dónde cae cada pueblo del reparto de hoy.
         *
         * Manda el MAPA, no las fichas de los clientes, y esto es la lección que costó
         * media tarde: muchas fichas se dieron de alta en la nave y llevan guardado el
         * GPS de la nave, no el del cliente. Cogiendo "un cliente cualquiera de La
         * Rambla" salía que La Rambla estaba en Cabra, y con eso el reparto entero se
         * ordenaba mal. El punto del pueblo que da el buscador es el del pueblo, y
         * punto. Las fichas solo valen de respaldo, para cuando no hay cobertura.
         *
         * Se pregunta una vez por pueblo y queda en caché.
         */
        const resolverPueblosDelReparto = async () => {
            const puntos = new Map();
            for (const envio of localRoute) {
                const pueblo = ciudadDeEnvio(envio);
                const clave = normalizarPueblo(pueblo);
                if (!clave || puntos.has(clave)) continue;

                const delMapa = await geocodificarDireccion(pueblo, pueblo);
                const punto = delMapa
                    ? { lat: delMapa[0], lon: delMapa[1] }
                    : puntoDeOtroCliente(pueblo);
                puntos.set(clave, punto || null);
            }
            return (busca) => {
                const clave = normalizarPueblo(busca);
                // La ruta puede escribir el pueblo de otra manera ("El Tejar" contra
                // "Tejar"): si no está en el mapa de hoy, se busca como siempre.
                if (clave && puntos.has(clave)) return puntos.get(clave);
                return puntoDeOtroCliente(busca);
            };
        };

        const ordenar = async (gps, origenPosicion) => {
            try {
                const resolverCoordenadasPueblo = await resolverPueblosDelReparto();
                const { orden, deCamino, resumen } = optimizarRuta({
                    envios: localRoute,
                    rutas: routes,
                    conductorId: currentDriverId,
                    routeId: currentDriver?.routeId,
                    resolverCliente: (envio) => clientsMap.get(normalizeClientName(nombreDeParada(envio))) || null,
                    resolverCoordenadasPueblo,
                    aprendizaje: positionLearning,
                    conocimiento: routeKnowledge,
                    gps,
                });

                setLocalRoute(orden);
                setParadasDeCamino(deCamino);
                setRouteOptimized(true);
                guardarOrdenEnLaNube(orden);
                // El resumen NO se le enseña al conductor: a él le vale con ver el
                // orden que le ha quedado. Es información de diagnóstico —con qué ruta
                // ordenó, si tenía GPS, qué fichas traen el GPS mal puesto— y su sitio
                // es la consola, para mirarlo desde administración cuando un reparto
                // salga con un orden raro.
                console.log('[SmartSort]', mensajeDeOptimizacion(resumen, origenPosicion));
            } catch (error) {
                console.error("Falló la optimización de la ruta:", error);
                setLearningMessage("No se ha podido optimizar la ruta.");
            } finally {
                // Pase lo que pase, el botón se desbloquea. Antes, si la ruta estaba
                // vacía se salía sin quitar el spinner y el botón se quedaba muerto.
                terminar();
            }
        };

        /**
         * Dónde está el conductor cuando el GPS no contesta.
         *
         * Con un tope de antigüedad CORTO, y esto es la lección de hoy: se aceptaba una
         * posición de hasta 3 horas, y a las 19:30 la de las 16:30 puede estar en otro
         * pueblo. El reparto salió ordenado desde donde el conductor había estado por
         * la tarde, no desde donde estaba, y encima sin el aviso de "sin GPS" porque
         * técnicamente sí había posición. Una posición vieja no es media posición: es
         * una posición equivocada, y coloca peor que no tener ninguna.
         */
        const MAX_EDAD_POSICION_MS = 15 * 60 * 1000;

        const posicionGuardada = () => {
            const propia = ultimaPosicionRef.current;
            if (propia && Date.now() - propia.cuando <= MAX_EDAD_POSICION_MS) return propia;

            const driver = drivers?.find(d => String(d.id) === String(currentDriverId));
            const lat = Number(driver?.currentLat);
            const lon = Number(driver?.currentLng);
            const sello = Date.parse(driver?.lastGpsUpdate || '');
            if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(sello)) return null;
            if (Date.now() - sello > MAX_EDAD_POSICION_MS) return null;
            return { lat, lon, cuando: sello };
        };

        const conLaGuardada = () => {
            const guardada = posicionGuardada();
            if (!guardada) { ordenar(null, null); return; }
            const minutos = Math.round((Date.now() - guardada.cuando) / 60000);
            ordenar(guardada, minutos <= 1 ? 'posición de hace un momento' : `posición de hace ${minutos} min`);
        };

        if (!navigator.geolocation) { conLaGuardada(); return; }

        // 12 segundos y no 5: esto lo dispara el conductor a propósito y prefiere
        // esperar un poco a que le ordenen el día desde donde está de verdad. Sin alta
        // precisión, que en el móvil tarda de más; para elegir pueblo, sobra.
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                ultimaPosicionRef.current = { lat: pos.coords.latitude, lon: pos.coords.longitude, cuando: Date.now() };
                ordenar(ultimaPosicionRef.current, 'GPS de ahora');
            },
            conLaGuardada,
            { timeout: 12000, enableHighAccuracy: false, maximumAge: 30000 }
        );
    };

    const mensajeDeOptimizacion = (resumen, origenPosicion) => {
        const partes = [`${etiquetaTurno(resumen.turno)}: ${resumen.pueblos} pueblo${resumen.pueblos !== 1 ? 's' : ''}`];
        // El nombre de la ruta usada: cuando un conductor cubre la de otro es lo único
        // que le dice si ha ordenado con la ruta buena o con la suya de siempre.
        if (resumen.ruta) partes.push(`ruta: ${resumen.ruta}`);
        // El orden que ha salido, con los nombres. Sin esto no hay forma de saber si
        // el orden viene de la ruta o de la distancia sin abrir el Gestor de Rutas.
        if (resumen.ordenPueblos?.length) partes.push(`orden: ${resumen.ordenPueblos.join(' → ')}`);
        // Le ha cambiado el orden de siempre porque está dentro de ese pueblo: que lo
        // sepa, para poder mover las paradas si hoy no le conviene.
        // De dónde salió la posición y a qué distancia queda la primera parada. Sin
        // esto, un orden raro no se puede diagnosticar: no se distingue "no sé dónde
        // estás" de "sé dónde estás pero no dónde cae ese pueblo".
        if (resumen.sinPosicion) partes.push('⚠ sin señal GPS: ordenado por el centro del reparto');
        else if (origenPosicion) partes.push(origenPosicion);
        if (resumen.kmAlPrimero != null) partes.push(`la 1ª parada te pilla a ${resumen.kmAlPrimero} km`);
        // Fichas con el GPS de donde se crearon (la nave) en vez del cliente. Se dice
        // para que se arreglen: mientras tanto esas paradas van colocadas por el pueblo.
        if (resumen.coordenadasRaras > 0) {
            partes.push(`${resumen.coordenadasRaras} ficha${resumen.coordenadasRaras !== 1 ? 's' : ''} con el GPS mal puesto (colocada${resumen.coordenadasRaras !== 1 ? 's' : ''} por el pueblo)`);
        }
        if (resumen.sinRuta) partes.push('sin ruta asignada, ordenados por cercanía');
        if (resumen.extras > 0) partes.push(`${resumen.extras} fuera de ruta`);
        if (resumen.deCamino > 0) partes.push(`${resumen.deCamino} de camino`);
        partes.push(resumen.pueblosMemorizados > 0
            ? `aprendidos: ${resumen.pueblosMemorizados}`
            : 'sin historial aún');
        return partes.join(' · ');
    };

    // El admin ve el orden del conductor desde su pantalla, así que hay que subirlo.
    const guardarOrdenEnLaNube = (orden) => {
        if (!currentDriverId) return;
        const ids = orden.map(s => s.id);
        try {
            localStorage.setItem(`drv_route_${currentDriverId}`, JSON.stringify(ids));
        } catch (e) {
            console.warn('[SmartSort] No se pudo guardar el orden en el móvil:', e);
        }
        (async () => {
            try {
                const { data: drvData } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                if (!drvData) return;
                await supabase.from('drivers').update({ data: { ...drvData.data, routeOrder: ids } }).eq('id', currentDriverId);
                console.log('[SmartSort] Orden sincronizado:', ids.length, 'paradas');
            } catch (err) {
                console.warn('[SmartSort] No se pudo sincronizar el orden:', err);
            }
        })();
    };

    // Calculate Daily Totals
    // Helper: Normalize strings for comparison
    const normalize = normalizeClientName;

    const parseAmount = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        let str = val.toString();
        // Handle European comma: replace it with dot ONLY if it looks like a decimal separator
        // and remove other thousand separators if any. 
        // Simple approach: remove anything that isn't a digit, comma, dot or minus.
        // Then normalize: if there's a comma and no dot, it's the decimal.
        str = str.replace(/[^0-9,.-]+/g, "");
        if (str.includes(',') && !str.includes('.')) str = str.replace(',', '.');
        return parseFloat(str) || 0;
    };

    // Daily Account Logic (Centralized in accountLogic.js)
    const accountData = useMemo(() => calculateDailyAccount({
        allShipments,
        driverId: currentDriverId,
        clients,
        collectedCollections
    }), [allShipments, currentDriverId, clients, collectedCollections]);

    const { 
        collectedPorte, 
        collectedReembolsos, 
        collectedSimplifiedInvoices,
        dailyTotal, 
        allPorteDetail,
        allReimbursementsDetail,
        allSimplifiedInvoiceDetail
    } = accountData;





    // Otras paradas de HOY para el mismo destinatario, para poder entregarlas y cobrarlas
    // en un solo gesto. Se agrupa por NOMBRE, no por dirección: dos albaranes de "MIKI"
    // son el mismo cliente aunque la dirección esté escrita distinta en cada uno.
    // El motivo de fondo no es la comodidad: hacer firmar dos veces por la misma entrega
    // física acaba con el conductor firmando él el segundo albarán, y eso sí deja el
    // albarán sin prueba.
    const sameClientStops = useMemo(() => {
        if (!deliveryModalShipment) return [];
        if (deliveryModalShipment.type === 'Recogida') return [];

        const objetivo = normalizeClientName(deliveryModalShipment.destinationName || deliveryModalShipment.client);
        if (!objetivo) return [];

        return (localRoute || [])
            .filter(s => s
                && s.id !== deliveryModalShipment.id
                && s.type !== 'Recogida'
                && s.status !== 'Entregado'
                && normalizeClientName(s.destinationName || s.client) === objetivo)
            .map(s => {
                const isDebido = s.porteType === 'Debido';
                const porteVal = parseAmount(s.customAmount) || parseAmount(s.amount);
                const codVal = s.hasCod ? parseAmount(s.codAmount) : 0;
                const portePayer = isDebido ? (s.destinationName || s.client) : (s.originName || s.client);
                const porteFallback = isDebido ? (s.destinationBillingType || null) : s.billingType;

                // Se entregan ahora mismo, así que su porte entra en el cobro aunque sea
                // Debido y todavía no conste como entregado.
                const debts = [];
                if (porteVal > 0 && !s.portePaid && isCashClient(portePayer, clientsMap, porteFallback)) {
                    debts.push({
                        id: `${s.id}-porte`,
                        shipmentId: s.id,
                        type: 'Porte',
                        amount: porteVal.toFixed(2),
                        label: `Porte · Albarán ${s.id}`,
                        detail: portePayer || 'N/A'
                    });
                }
                if (s.hasCod && codVal > 0 && !s.codPaid && isCashClient(s.destinationName || s.client, clientsMap, s.destinationBillingType || null)) {
                    debts.push({
                        id: `${s.id}-reembolso`,
                        shipmentId: s.id,
                        type: 'Reembolso',
                        amount: codVal.toFixed(2),
                        label: `Reembolso · Albarán ${s.id}`,
                        detail: s.destinationName || s.client || 'N/A'
                    });
                }

                const arts = s.articles || [];
                const resumen = arts.length > 0
                    ? arts.map(a => {
                        const cantidad = parseInt(a.quantity) || 1;
                        return cantidad > 1 ? `${cantidad}× ${a.name}` : a.name;
                    }).join(', ')
                    : (s.packages || `Albarán ${s.id}`);

                return {
                    shipment: s,
                    debts,
                    resumen,
                    totalCobro: debts.reduce((sum, d) => sum + parseAmount(d.amount), 0)
                };
            });
    }, [deliveryModalShipment, localRoute, clientsMap]);

    // Safe calculations for Modal Props - Optimized to only run when modal is open
    const pendingDebts = useMemo(() => {
        if (!deliveryModalShipment) return [];
        try {
            // Si es una recogida propiamente dicha, no mostramos cobros pendientes
            // (El conductor gestiona el cobro al generar el albarán posterior si es necesario)
            if (deliveryModalShipment.type === 'Recogida') return [];

            // 1. Determine who we are interacting with (The Entity)
            let targetName = deliveryModalShipment.destinationName || (deliveryModalShipment.porteType !== 'Debido' ? deliveryModalShipment.client : 'Destinatario');

            if (!targetName || targetName === 'Destinatario') return [];

            // 2. Check if this Entity is 'New' or 'Daily' (Risk)
            // Para Porte Debido, el que paga es el DESTINATARIO → usar destinationBillingType como fallback
            // Para Porte Pagado, el que paga es el REMITENTE → usar billingType como fallback
            const targetFallbackBilling = deliveryModalShipment.porteType === 'Debido'
                ? (deliveryModalShipment.destinationBillingType || null)
                : deliveryModalShipment.billingType;
            const isTargetType = isCashClient(targetName, clientsMap, targetFallbackBilling);

            if (!isTargetType) return [];

            // 3. Find other shipments for this Entity that are Pending Cobro
            // Pre-normalize target name once
            const targetNameClean = targetName.trim().toLowerCase();
            
            // Las paradas de hoy del mismo destinatario van por su propia lista, con su
            // casilla de "entregar también". Si además entraran por aquí, el mismo cobro
            // saldría dos veces en pantalla y contaría doble en el total.
            const idsParadasDeHoy = new Set(sameClientStops.map(st => st.shipment.id));

            const otherPendingShipments = (allShipments || []).filter(s => {
                if (!s || s.id === deliveryModalShipment.id) return false;
                if (idsParadasDeHoy.has(s.id)) return false;

                // Simple status check first
                const isPending = s.status === 'Entrega aplazada' || s.status === 'Pendiente de asignar' || s.status === 'Entregado' || s.paymentStatus === 'Pending';
                if (!isPending) return false;

                // Match entity
                const destClean = (s.destinationName || '').trim().toLowerCase();
                const clientClean = (s.client || '').trim().toLowerCase();
                const originClean = (s.originName || '').trim().toLowerCase();

                const isDebido = s.porteType === 'Debido';
                const hasPendingPorte = parseAmount(s.amount) > 0 && !s.portePaid;
                if (hasPendingPorte) {
                    const portePayerClean = isDebido ? (destClean || clientClean) : (originClean || clientClean);
                    if (portePayerClean === targetNameClean) return true;
                }

                const hasPendingCod = s.hasCod && parseAmount(s.codAmount) > 0 && !s.codPaid;
                if (hasPendingCod) {
                    const codPayerClean = destClean || clientClean;
                    if (codPayerClean === targetNameClean) return true;
                }

                return false;
            });

            // Deduplicate to avoid same shipment synced twice
            const uniquePending = [];
            const seen = new Set();
            for (const s of otherPendingShipments) {
                if (!seen.has(s.id)) {
                    seen.add(s.id);
                    uniquePending.push(s);
                }
            }

            console.log("--- Dashboard: Calculating Pending Debts ---", targetName);
            const debtParts = [];
            uniquePending.forEach(s => {
                const isDebido = s.porteType === 'Debido';
                const isPagado = s.porteType === 'Pagado';
                const hasCod = s.hasCod;
                const porteVal = parseAmount(s.customAmount) || parseAmount(s.amount);
                const codVal = hasCod ? parseAmount(s.codAmount) : 0;

                const payerName = isDebido ? (s.destinationName || s.client) : (s.originName || s.client);
                // Fallback según quién paga: Debido → destinatario → usar destinationBillingType
                //                           Pagado → remitente  → usar billingType
                const porteFallback = isDebido ? (s.destinationBillingType || null) : s.billingType;
                const isPortePayerCash = isCashClient(payerName, clientsMap, porteFallback);
                // El reembolso (COD) siempre lo paga el destinatario
                const isCodPayerCash = isCashClient(s.destinationName || s.client, clientsMap, s.destinationBillingType || null);

                if (porteVal > 0 && !s.portePaid) {
                    if (isPagado && isPortePayerCash) {
                        debtParts.push({
                            id: `${s.id}-porte`,
                            shipmentId: s.id,
                            type: 'Porte',
                            amount: porteVal.toFixed(2),
                            label: `Albarán ${s.id}`,
                            detail: payerName || 'N/A'
                        });
                    } else if (isDebido && s.status === 'Entregado') {
                        // Porte Debido ya entregado pero aún sin cobrar → incluir
                        debtParts.push({
                            id: `${s.id}-porte`,
                            shipmentId: s.id,
                            type: 'Porte',
                            amount: porteVal.toFixed(2),
                            label: `Albarán ${s.id}`,
                            detail: payerName || 'N/A'
                        });
                    }
                }

                if (hasCod && codVal > 0 && !s.codPaid && (s.status === 'Entregado' || s.id === deliveryModalShipment.id)) {
                    if (isCodPayerCash) {
                        debtParts.push({
                            id: `${s.id}-reembolso`,
                            shipmentId: s.id,
                            type: 'Reembolso',
                            amount: codVal.toFixed(2),
                            label: `Albarán ${s.id}`,
                            detail: s.destinationName || s.client || 'N/A'
                        });
                    }
                }
            });

            return debtParts;
        } catch (err) { console.error('Debts Logic Error', err); return []; }
    }, [deliveryModalShipment, allShipments, sameClientStops]);

    const collectionAlert = useMemo(() => {
        try {
            if (!deliveryModalShipment) return false;

            // En recogidas nunca se gestiona el cobro previo aquí, el flujo salta directamente
            // al proceso de generación de albarán.
            if (deliveryModalShipment.type === 'Recogida') return false;

            console.log("--- Dashboard: Checking Collection Alert Visibility ---", deliveryModalShipment.id);

            let targetName = deliveryModalShipment.destinationName || deliveryModalShipment.client;
            const alertFallbackBilling = deliveryModalShipment.porteType === 'Debido'
                ? (deliveryModalShipment.destinationBillingType || null)
                : deliveryModalShipment.billingType;
            const isTargetCash = isCashClient(targetName, clientsMap, alertFallbackBilling);
            
            console.log("Target Client:", targetName, "isCash:", isTargetCash);

            if (!isTargetCash) return false;

            if (pendingDebts.length > 0) {
                console.log("Alert ON: Pending debts exist");
                return true;
            }

            const isDebido = deliveryModalShipment.porteType === 'Debido';
            const pVal = parseAmount(deliveryModalShipment.amount);
            const hasCod = deliveryModalShipment.hasCod;

            if (isDebido && (pVal > 0 || String(deliveryModalShipment.amount).toLowerCase() === 'tarifa')) {
                console.log("Alert ON: Current shipment is Debido");
                return true;
            }
            if (hasCod && parseAmount(deliveryModalShipment.codAmount) > 0) {
                console.log("Alert ON: Current shipment has COD");
                return true;
            }

            return false;
        } catch (e) { console.error('Alert Logic Error', e); return false; }
    }, [deliveryModalShipment, clients, pendingDebts]);

    const [isUploading, setIsUploading] = useState(false);

    // Helper to Add to Collections
    const handleDeliveryConfirm = async (id, proof, status, selectedDebtIds = [], customAmounts = {}, generateReturn = false, extraFlags = null, extraStopIds = []) => {
        const currentShip = (allShipments || []).find(s => s.id === id) || deliveryModalShipment;
        if (!currentShip) return;

        // Paradas del mismo destinatario que el conductor ha marcado para cerrar en este
        // mismo gesto. Se cierran como entregas completas, no como simples cobros.
        const paradasExtra = new Set((extraStopIds || []).filter(sid => sid && sid !== id));

        // Si el conductor eligió "Saltar Cobros" en una recogida, solo abrimos el modal de recogida
        if (status === 'skip_pickup') {
            setDeliveryModalShipment(null);
            if (pendingPickupAfterCollection) {
                const pickupData = pendingPickupAfterCollection;
                setPendingPickupAfterCollection(null);
                setTimeout(() => {
                    setPickupToConvert(pickupData);
                    setIsNoteModalOpen(true);
                }, 300);
            }
            return;
        }

        // --- LÓGICA DE GENERACIÓN DE RETORNO ---
        if (generateReturn && status === 'Entregado') {
            try {
                const returnPrefill = {
                    clientName: currentShip.destinationName || currentShip.client, 
                    originAddress: currentShip.destinationAddress,
                    originCity: currentShip.destinationCity,
                    originZip: currentShip.destinationZip,
                    originPhone: currentShip.destinationPhone,
                    originCoordinates: currentShip.destinationCoordinates || currentShip.deliveryCoordinates,
                    destinationName: currentShip.client, 
                    destinationAddress: currentShip.originAddress,
                    destinationCity: currentShip.originCity,
                    destinationZip: currentShip.originZip,
                    destinationPhone: currentShip.originPhone,
                    destinationCoordinates: currentShip.originCoordinates,
                    amount: currentShip.amount,
                    observations: `[RETORNO DE ${currentShip.id}] ${currentShip.observations || ''}`,
                    agencyLabel: currentShip.agencyLabel || 'SUM ESPECIAL',
                    // Marca para que el formulario exija artículo: las observaciones ya van
                    // rellenas con el "[RETORNO DE ...]", así que la comprobación normal de
                    // "artículo u observación" pasaba sola y el retorno salía sin decir qué
                    // se recoge.
                    isReturn: true
                };
                setPickupToConvert(returnPrefill);
                setIsNoteModalOpen(true);
            } catch (err) { console.error("Error generating return:", err); }
        }

        if (!onStatusChange) return console.error("onStatusChange missing");

        setIsUploading(true);
        const newCollectionsBatch = [];
        const workingShipments = new Map(); // id -> latest intended state

        const getLatestShip = (sid) => workingShipments.get(sid) || (allShipments || []).find(s => s.id === sid);

        // 1. Process all selected collections (Current + Others)
        if (selectedDebtIds && selectedDebtIds.length > 0) {
            // Comprobación anti-duplicado: la lista de "otros pendientes" se calcula sobre
            // `allShipments`, que puede llevar hasta 60s desatrasada (el poll) o venir de una
            // sesión que no ha refrescado. Si un envío YA consta cobrado en el servidor,
            // seleccionarlo aquí duplicaría el dinero en la Cuenta sin que nadie se entere
            // (el albarán seguiría mostrando la fecha de cobro real, pero la caja del día
            // sumaría el importe otra vez). Se comprueba contra Supabase justo antes de cobrar.
            const debtSids = [...new Set(selectedDebtIds.map(fullId => fullId.substring(0, fullId.lastIndexOf('-'))))];
            const freshPaidState = new Map();
            try {
                const { data: freshRows } = await supabase.from('shipments').select('id, data').in('id', debtSids);
                (freshRows || []).forEach(r => freshPaidState.set(r.id, r.data));
            } catch (e) {
                console.warn('[DeliveryConfirm] No se pudo verificar el estado real de los envíos antes de cobrar, se usará el estado local:', e);
            }

            for (const fullId of selectedDebtIds) {
                // El ID tiene formato "SUM-2026254-porte" o "SUM-2026254-reembolso" (también soporta TR- antiguos)
                // No podemos usar split('-') porque el ID del envío ya contiene guiones.
                // Usamos lastIndexOf para separar solo por el ÚLTIMO guión.
                const lastDash = fullId.lastIndexOf('-');
                const sid = fullId.substring(0, lastDash);
                const partType = fullId.substring(lastDash + 1);
                const ship = getLatestShip(sid);
                if (!ship) continue;

                const isPorte = partType === 'porte';

                const freshShip = freshPaidState.get(sid);
                if (freshShip && ((isPorte && freshShip.portePaid) || (!isPorte && freshShip.codPaid))) {
                    console.warn(`[DeliveryConfirm] Omitido ${sid}-${partType}: ya figura cobrado en el servidor (evitado cobro duplicado).`);
                    continue;
                }

                const debtKey = `${sid}-${partType}`;
                const originalAmount = isPorte ? (parseAmount(ship.customAmount) > 0 ? ship.customAmount : ship.amount) : ship.codAmount;
                const finalAmount = customAmounts[debtKey] !== undefined ? customAmounts[debtKey] : originalAmount;

                // Si es un porte con Factura Simplificada, NO generamos cobro manual de porte
                // porque ya se contabiliza en la sección de Facturas Simplificadas (con IVA).
                // Los reembolsos sí se generan siempre.
                const isSimplifiedInvoicePorte = isPorte && extraFlags?.hasSimplifiedInvoice && sid === id;

                const payerName = isPorte 
                    ? (ship.porteType === 'Debido' ? (ship.destinationName || 'Destinatario') : (ship.originName || ship.client || 'Remitente'))
                    : (ship.destinationName || 'Destinatario');

                if (!isSimplifiedInvoicePorte) {
                    newCollectionsBatch.push({
                        id: `COL-${Date.now()}-${sid}-${partType}-${Math.random().toString(36).substr(2, 4)}`,
                        shipmentId: sid,
                        partType: partType,
                        client: payerName,
                        sender: ship.senderName || ship.originName || ship.client || 'N/A',
                        amount: parseAmount(finalAmount).toFixed(2),
                        type: isPorte ? 'Porte' : 'Reembolso',
                        date: todayStr
                    });
                }

                const updated = { ...ship };
                if (isPorte) {
                    updated.portePaid = true;
                    // Quién se lleva el dinero encima. Sin esto, tanto la Cuenta
                    // (accountLogic) como el "Porte Cobrado Por" de la oficina caen al
                    // conductor ASIGNADO al albarán, que no siempre es el que ha
                    // cobrado: el día que uno cubre la ruta de otro, su dinero se le
                    // apuntaba al que faltaba.
                    updated.porteCollectedById = currentDriverId;
                    updated.paidAt = new Date().toISOString();
                    // Si el conductor modificó el importe del porte, guardar como customAmount
                    // para que la Cuenta y la BD reflejen el importe real cobrado
                    if (customAmounts[debtKey] !== undefined && parseAmount(customAmounts[debtKey]) !== parseAmount(originalAmount)) {
                        updated.customAmount = parseAmount(customAmounts[debtKey]);
                        console.log(`[DeliveryConfirm] Porte modificado para ${sid}: ${originalAmount} → ${customAmounts[debtKey]}`);
                    }
                } else {
                    updated.codPaid = true;
                    updated.codCollectedById = currentDriverId;
                    updated.paidAt = new Date().toISOString();
                    // Si el conductor modificó el importe del reembolso, guardar también
                    if (customAmounts[debtKey] !== undefined && parseAmount(customAmounts[debtKey]) !== parseAmount(originalAmount)) {
                        updated.codAmount = parseAmount(customAmounts[debtKey]);
                        console.log(`[DeliveryConfirm] Reembolso modificado para ${sid}: ${originalAmount} → ${customAmounts[debtKey]}`);
                    }
                }
                updated.updatedAt = new Date().toISOString();
                workingShipments.set(sid, updated);
            }
        }

        // 2. Prueba de entrega. Cada albarán sube SU PROPIA copia a Storage con su id:
        //    la firma es la misma imagen, pero el registro no se comparte. Así, si mañana
        //    reclaman uno de los albaranes, ese albarán tiene su fichero, y se puede
        //    anular o rectificar sin arrastrar al otro.
        const construirPruebaPara = async (sid) => {
            const finalProof = { ...proof };
            const uploads = {}; // base64 que la cola sube a Storage en segundo plano
            if (!(status === 'Entregado' && proof?.type === 'multi')) return { finalProof, uploads };

            if (!isOnline) {
                // ---- MODO OFFLINE ----
                // Guardamos el base64 puro para que sea inmediatamente visible en la UI
                // (data: URLs son válidas en <img src>). Las subimos a Storage al reconectar.
                if (proof.signatureData) {
                    finalProof.signatureUrl = proof.signatureData; // base64 válido para <img>
                    uploads.signatureData = proof.signatureData;   // para el flush al reconectar
                }
                if (proof.photoData) {
                    finalProof.photoUrl = proof.photoData;         // base64 válido para <img>
                    uploads.photoData = proof.photoData;           // para el flush al reconectar
                }
                if (proof.photoData2) {
                    finalProof.photoUrl2 = proof.photoData2;       // base64 válido para <img>
                    uploads.photoData2 = proof.photoData2;         // para el flush al reconectar
                }
                delete finalProof.signatureData;
                delete finalProof.photoData;
                delete finalProof.photoData2;
                console.log('[Offline] Firma/fotos guardadas como base64 local para', sid);
            } else {
                // ---- MODO ONLINE ----
                // Las imagenes NO se suben aqui. Subirlas antes de guardar el albaran
                // dejaba la entrega sin registrar en la oficina hasta que terminaban las
                // tres subidas SEGUIDAS: con mala cobertura son ~20 s en los que el
                // conductor ya ha entregado y en administracion el envio sigue en reparto.
                // Ahora el albaran se guarda al momento (que es lo que el Realtime lleva a
                // la oficina) y las imagenes salen justo detras por la cola, que las sube
                // y pega las URLs en el envio.
                //
                // Aqui NO se mete el base64 en finalProof a proposito (al contrario que en
                // el modo offline): esto se escribe en la fila de Supabase, y meter la
                // imagen entera dentro engordaria el envio para todo el que lo cargue.
                if (proof.signatureData) uploads.signatureData = proof.signatureData;
                if (proof.photoData) uploads.photoData = proof.photoData;
                if (proof.photoData2) uploads.photoData2 = proof.photoData2;
                delete finalProof.signatureData;
                delete finalProof.photoData;
                delete finalProof.photoData2;
            } // end isOnline else

            return { finalProof, uploads };
        };

        const pruebaPrincipal = await construirPruebaPara(id);
        const finalProofForCurrent = pruebaPrincipal.finalProof;
        const pendingUploads = pruebaPrincipal.uploads;

        // ── Auto-aprendizaje del DESTINATARIO en la entrega ──
        // Se ejecuta SIEMPRE que se entrega (independientemente del tipo de proof).
        // Dos cosas distintas:
        //  · La ubicación capturada (proof.coordinates) se guarda si aún no tiene.
        //  · Quién recibió (nombre y DNI) se guarda SIEMPRE, pisando lo anterior: es
        //    una chuleta para la próxima entrega, y la que vale es la última. En el
        //    modal sale en gris como sugerencia, nunca rellenado a la fuerza.
        if (status === 'Entregado' && (proof?.coordinates || proof?.name?.trim()) && currentShip && onUpdateClient) {
            const isPickupType = currentShip.type === 'Recogida';
            const clientName = isPickupType
                ? currentShip.client
                : (currentShip.destinationName || currentShip.client);

            const receptorAprendido = proof?.name?.trim()
                ? {
                    lastReceiver: {
                        name: proof.name.trim(),
                        dni: (proof.id || '').trim(),
                        at: new Date().toISOString(),
                    },
                }
                : null;

            if (clientName) {
                const destClientObj = clientsMap.get(normalizeClientName(clientName));
                if (destClientObj) {
                    if (destClientObj._isBranch) {
                        const branch = destClientObj._branch;
                        const cambios = { ...(receptorAprendido || {}) };
                        if (proof?.coordinates && !(branch.coordinates && String(branch.coordinates).trim().length > 0)) {
                            cambios.coordinates = proof.coordinates;
                        }
                        if (Object.keys(cambios).length > 0) {
                            onUpdateClient(destClientObj.id, cambios, branch.id);
                            console.log(`[AutoAprendizaje] Destinatario (Sede) "${clientName}"`, cambios);
                        }
                    } else {
                        const cambios = { ...(receptorAprendido || {}) };
                        if (proof?.coordinates && !(destClientObj.coordinates && String(destClientObj.coordinates).trim().length > 0)) {
                            cambios.coordinates = proof.coordinates;
                        }
                        if (Object.keys(cambios).length > 0) {
                            onUpdateClient(destClientObj.id, cambios);
                            console.log(`[AutoAprendizaje] Destinatario "${clientName}"`, cambios);
                        }
                    }
                } else if (!destClientObj && !isPickupType && onAddClient && proof?.coordinates) {
                    // Destinatario no existe en BD → crear ficha pendiente de validar con GPS incluido
                    onAddClient({
                        name: currentShip.destinationName,
                        address: currentShip.destinationAddress || currentShip.address || '',
                        city: currentShip.destinationCity || '',
                        zip: currentShip.destinationZip || '',
                        phone: currentShip.destinationPhone || '',
                        coordinates: proof.coordinates,
                        type: 'Destinatario',
                        // Por defecto 'Clientes Habituales' (pago inmediato).
                        // El admin puede cambiar a 'Facturación' al validar si el cliente paga por factura.
                        billingType: 'Clientes Habituales',
                        status: 'pending',
                        // Si el porte lo paga una agencia, el destinatario es suyo (ver agencyOwnership.js)
                        ownerAgencyId: resolveOwnerAgencyId(currentShip, clients),
                        createdFrom: 'Reparto (Driver)',
                        createdBy: currentDriver?.name || 'Driver',
                        // Quien ha recibido hoy, para sugerirlo en la próxima entrega.
                        ...(receptorAprendido || {}),
                    });
                }
            }
        }

        // 3. Persist Collections (Atomic UI update)
        if (newCollectionsBatch.length > 0) {
            setCollectedCollections(prev => [...prev, ...newCollectionsBatch]);
        }

        // 4. Sync each affected shipment to Database
        // Las paradas extra entran aunque no lleven cobro: hay que cerrarlas igual.
        const affectedIds = Array.from(new Set([...workingShipments.keys(), id, ...paradasExtra]));
        
        // Optimistic UI: Add all affected IDs to processing set
        setProcessingIds(prev => {
            const next = new Set(prev);
            affectedIds.forEach(aid => next.add(aid));
            // Also add sub-keys for the collections list
            affectedIds.forEach(aid => {
                next.add(`${aid}-porte`);
                next.add(`${aid}-reembolso`);
            });
            return next;
        });

        try {
            for (const sid of affectedIds) {
                const isMain = sid === id;
                const esParadaExtra = !isMain && paradasExtra.has(sid);
                const shipData = getLatestShip(sid);
                if (!shipData) continue;

                const original = (allShipments || []).find(s => s.id === sid);
                const isStatusChangeNeeded = isMain || (shipData.status !== original?.status);

                // Determine flags to update
                const flags = { updatedAt: new Date().toISOString(), ...(isMain && extraFlags ? extraFlags : {}) };
                // Si el envío no tiene conductor asignado (post-incidencia), asignar el conductor actual
                if (!shipData.assignedDriverId && isMain) {
                    flags.assignedDriverId = Number(currentDriverId);
                }
                if (shipData.portePaid && !original?.portePaid) {
                    flags.portePaid = true;
                    flags.porteCollectedById = currentDriverId;
                    // Si el conductor cambió el importe del porte, persistir en la BD
                    if (shipData.customAmount !== undefined && shipData.customAmount !== original?.customAmount) {
                        flags.customAmount = shipData.customAmount;
                    }
                }
                if (shipData.codPaid && !original?.codPaid) {
                    flags.codPaid = true;
                    flags.codCollectedById = currentDriverId;
                    // Si el conductor cambió el importe del reembolso, persistir en la BD
                    if (shipData.codAmount !== undefined && shipData.codAmount !== original?.codAmount) {
                        flags.codAmount = shipData.codAmount;
                    }
                }

                // Sync derived status and payment flags
                const checkPayer = shipData.porteType === 'Debido' 
                    ? (shipData.destinationName || shipData.client) 
                    : (shipData.originName || shipData.client);
                
                // Note: isCashClient only takes 2 arguments
                const isPayerCash = isCashClient(checkPayer, clientsMap);
                const isCodCash = isCashClient(shipData.destinationName || shipData.client, clientsMap);
                
                const pf = shipData.portePaid || !isPayerCash || parseAmount(shipData.amount) === 0;
                const cf = (shipData.hasCod ? shipData.codPaid : true) || !isCodCash || parseAmount(shipData.codAmount) === 0;

                // Las paradas extra se entregan de verdad, así que toman el estado de la
                // entrega igual que la principal. Si el porte se aplaza, pf será false y
                // se quedan en 'Entregado' con la deuda viva, que es lo correcto.
                let targetStatus = (isMain || esParadaExtra) ? status : (shipData.status || original?.status || 'Pendiente');
                if (pf && cf) {
                    targetStatus = 'Entregado';
                    flags.paymentStatus = 'Paid';
                    flags.paidAt = flags.updatedAt;
                }

                if (targetStatus === 'Entregado' && original?.status !== 'Entregado') {
                    flags.deliveredAt = flags.updatedAt;
                }

                console.log(`🔍 [BatchSync] SID: ${sid} | pf: ${pf} | cf: ${cf} | target: ${targetStatus} | flags:`, flags);

                // Atomic Update Logic
                if (isMain) {
                    // Update main shipment with proof and potential status/payment change in ONE call
                    await onStatusChange(id, targetStatus, proof?.coordinates || null, null, null, finalProofForCurrent, flags, pendingUploads);
                    // Record delivery position for learning (only for actual deliveries)
                    if (targetStatus === 'Entregado') {
                        recordDeliveryPosition(currentShip);
                    }
                } else if (esParadaExtra) {
                    // Entrega completa con la misma firma, ubicación y datos de quien
                    // recibe, pero con su propia copia de la prueba subida bajo su id.
                    // No se llama a recordDeliveryPosition: es la misma parada física que
                    // ya ha registrado el albarán principal, y contarla dos veces sesgaría
                    // el aprendizaje de dónde está el cliente.
                    if (!shipData.assignedDriverId) {
                        flags.assignedDriverId = Number(currentDriverId);
                    }
                    const pruebaExtra = await construirPruebaPara(sid);
                    await onStatusChange(sid, targetStatus, proof?.coordinates || null, null, null, pruebaExtra.finalProof, flags, pruebaExtra.uploads);
                } else {
                    // Envíos secundarios (ya entregados, solo pendientes de cobro):
                    // NO pasamos por onStatusChange (que re-ejecuta el modelo de entrega
                    // y puede sobreescribir portePaid). Solo actualizamos flags de pago.
                    const updates = { ...flags };
                    if (pf && cf) {
                        updates.paymentStatus = 'Paid';
                        updates.paidAt = updates.updatedAt || new Date().toISOString();
                    }
                    await onUpdateShipment(sid, updates);
                }
            }
        } catch (err) {
            console.error("Critical error during multi-confirmation sync:", err);
        }

        setIsUploading(false);
        setDeliveryModalShipment(null);

        // Si era una recogida con cobros pendientes, abrir ahora el modal de recogida
        if (pendingPickupAfterCollection) {
            const pickupData = pendingPickupAfterCollection;
            setPendingPickupAfterCollection(null);
            setTimeout(() => {
                setPickupToConvert(pickupData);
                setIsNoteModalOpen(true);
            }, 300); // Pequeño delay para que el modal de cobros se cierre antes
        }
    };

    // Clear optimistic UI states ONLY when allShipments really changes
    // Simplified: clear when user navigates or after a timeout to allow sync
    useEffect(() => {
        if (!allShipments) return;
        // Check if any of our processingIds are still in "Pending" status in the new shipments list
        // If they are ALL gone or marked as Paid, we can clear the whole set.
        // For simplicity, we clear after sync, but we could be more specific.
        const timer = setTimeout(() => {
            setProcessingIds(new Set());
        }, 3000); 
        return () => clearTimeout(timer);
    }, [allShipments]);

    if (!drivers || !allShipments || !clients) {
        return <div className="flex h-screen items-center justify-center text-slate-400">Cargando dashboard...</div>;
    }

    const handleLogoutWithSafety = () => {
        const queueLen = getQueueLength();
        if (queueLen > 0) {
            alert(`⚠️ ¡ATENCIÓN! Tienes ${queueLen} operación${queueLen > 1 ? 'es' : ''} pendiente${queueLen > 1 ? 's' : ''} de sincronizar por falta de cobertura. \n\nPor favor, busca red antes de salir para que los datos lleguen a la oficina y no se pierdan los registros de cobro.`);
            return;
        }
        onLogout();
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col transition-all duration-300" style={{ zoom: zoom }}>
            {/* ── GUIDED TOUR (Modo Prueba) ── */}
            <DriverGuidedTour
                isVisible={showTour}
                onComplete={() => {
                    localStorage.setItem(`sumtrans_driver_tour_done_${currentDriverId}`, 'true');
                    setShowTour(false);
                    // Ofrecer el segundo tutorial tras 600ms
                    setTimeout(() => setShowShipmentTour(true), 600);
                }}
                onSkip={() => setShowTour(false)}
                onChangeTab={setActiveTab}
            />

            {/* ── TUTORIAL ALBARÁN Y ENTREGA ── */}
            <DriverShipmentTour
                isVisible={showShipmentTour}
                onComplete={() => { setShowShipmentTour(false); setTourDemoMode(null); }}
                onSkip={() => { setShowShipmentTour(false); setTourDemoMode(null); }}
                onChangeTab={setActiveTab}
                onDemoModeChange={setTourDemoMode}
            />

            {/* ── MODALES REALES PARA TUTORIALES ── */}
            {tourDemoMode === 'create_form' && (
                <CreateShipmentModal
                    isOpen={true}
                    onClose={() => setTourDemoMode(null)}
                    onSave={() => setTourDemoMode(null)}
                    drivers={drivers}
                    clients={clients}
                    allPoblaciones={allPoblaciones}
                    tariffs={tariffs}
                    articles={articles}
                    familyOrder={familyOrder}
                    coverageZones={coverageZones}
                    defaultCodFee={defaultCodFee}
                    isDriver={true}
                    allShipments={[]}
                    onUpdateShipment={() => {}}
                    onUpdateClient={() => {}}
                    currentDriverId={currentDriverId}
                />
            )}

            {['delivery_pagado','delivery_debido','delivery_retorno','delivery_firma_vuelta','delivery_retorno_firma','delivery_porte_reembolso','delivery_multi'].includes(tourDemoMode) && (
                <DeliveryConfirmationModal
                    isOpen={true}
                    onClose={() => setTourDemoMode(null)}
                    shipment={getDemoShipment(tourDemoMode)}
                    collectionAlert={false}
                    pendingDebts={getDemoPendingDebts(tourDemoMode)}
                    clients={clients}
                    zoom={zoom}
                    onConfirm={() => setTourDemoMode(null)}
                />
            )}


            <DriverAlertsTour
                isVisible={showAlertsTour}
                onComplete={() => { setShowAlertsTour(false); setTourDemoMode(null); }}
                onSkip={() => { setShowAlertsTour(false); setTourDemoMode(null); }}
                onDemoModeChange={setTourDemoMode}
            />

            {/* ── TUTORIAL CAJA Y JUSTIFICANTES ── */}
            <DriverCajaTour
                isVisible={showCajaTour}
                onComplete={() => setShowCajaTour(false)}
                onSkip={() => setShowCajaTour(false)}
            />

            {/* ── TUTORIAL REPARTO ── */}
            <DriverRepartaTour
                isVisible={showRepartaTour}
                onComplete={() => { setShowRepartaTour(false); setIsIncidentModalOpen(false); setTourDemoMode(null); }}
                onSkip={() => { setShowRepartaTour(false); setIsIncidentModalOpen(false); setTourDemoMode(null); }}
                onChangeTab={setActiveTab}
                onDemoModeChange={setTourDemoMode}
                onOpenIncidentModal={() => {
                    const demoShipment = localRoute?.[0] || {
                        id: 'DEMO-001', client: 'Ejemplo S.A.',
                        destinationAddress: 'Avda. Ronda Tejares 13', destinationCity: 'Córdoba',
                    };
                    setIncidentShipment(demoShipment);
                    setIncidentInitialReason('');
                    setIsIncidentModalOpen(true);
                }}
                onCloseIncidentModal={() => setIsIncidentModalOpen(false)}
            />

            {/* ── TUTORIAL CORREGIR ALBARÁN ── */}
            <DriverEditTour
                isVisible={showEditTour}
                onComplete={() => { setShowEditTour(false); setIsDetailsModalOpen(false); setIsReadOnlyModal(false); }}
                onSkip={() => { setShowEditTour(false); setIsDetailsModalOpen(false); setIsReadOnlyModal(false); }}
                onChangeTab={setActiveTab}
                onOpenDetailsModal={() => {
                    const demoShipment = localRoute?.[0] || allShipments?.[0] || null;
                    if (demoShipment) {
                        setSelectedShipment(demoShipment);
                        setIsReadOnlyModal(false);
                        setIsDetailsModalOpen(true);
                    }
                }}
                onCloseDetailsModal={() => { setIsDetailsModalOpen(false); setIsReadOnlyModal(false); }}
            />

            {/* ── BOTÓN FLOTANTE TUTORIALES (solo en Modo Prueba) ── */}
            {isTestMode && !showTour && !showShipmentTour && !showAlertsTour && !showCajaTour && !showRepartaTour && !showEditTour && (
                <>
                    {/* Backdrop */}
                    {tourMenuOpen && (
                        <div
                            onClick={() => setTourMenuOpen(false)}
                            style={{
                                position: 'fixed', inset: 0, zIndex: 8990,
                                background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
                            }}
                        />
                    )}

                    {/* Bottom sheet — siempre montado, se mueve con transform */}
                    <div style={{
                        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9000,
                        transform: tourMenuOpen ? 'translateY(0)' : 'translateY(110%)',
                        transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
                        background: 'linear-gradient(180deg,#1e293b 0%,#0f172a 100%)',
                        borderRadius: '22px 22px 0 0',
                        boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                        paddingBottom: 'env(safe-area-inset-bottom,12px)',
                    }}>
                        {/* Handle */}
                        <div style={{ display:'flex', justifyContent:'center', padding:'10px 0 4px' }}>
                            <div style={{ width:36, height:4, borderRadius:2, background:'rgba(255,255,255,0.18)' }} />
                        </div>
                        {/* Título */}
                        <p style={{ color:'rgba(255,255,255,0.45)', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', textAlign:'center', margin:'0 0 8px' }}>
                            📚 Tutoriales
                        </p>
                        {/* Opciones */}
                        <div style={{ padding: '0 12px 16px', display:'flex', flexDirection:'column', gap:2 }}>
                            {[
                                { emoji:'🗺️', label:'Tour general de la app',   fn:() => { setShowTour(true);         setTourMenuOpen(false); } },
                                { emoji:'📋', label:'Cómo crear un albarán',     fn:() => { setShowShipmentTour(true); setTourMenuOpen(false); } },
                                { emoji:'🔔', label:'Notificaciones y alertas',  fn:() => { setShowAlertsTour(true);   setTourMenuOpen(false); } },
                                { emoji:'🏦', label:'Caja y justificantes',      fn:() => { setShowCajaTour(true);     setTourMenuOpen(false); } },
                                { emoji:'🚚', label:'Gestión del Reparto',       fn:() => { setShowRepartaTour(true);  setTourMenuOpen(false); } },
                                { emoji:'✏️', label:'Corregir un albarán',       fn:() => { setShowEditTour(true);     setTourMenuOpen(false); } },
                            ].map(({ emoji, label, fn }) => (
                                <button
                                    key={label}
                                    onClick={fn}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: 14,
                                        background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.06)',
                                        borderRadius: 14, padding: '13px 16px',
                                        color: 'white', fontSize: 14, fontWeight: 600,
                                        cursor: 'pointer', textAlign: 'left', width: '100%',
                                    }}
                                >
                                    <span style={{ fontSize: 22, lineHeight:1, flexShrink:0 }}>{emoji}</span>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* FAB 📚 */}
                    <button
                        onClick={() => setTourMenuOpen(o => !o)}
                        style={{
                            position: 'fixed', bottom: 90, right: 16, zIndex: 9001,
                            width: 46, height: 46, borderRadius: '50%',
                            background: tourMenuOpen
                                ? 'linear-gradient(135deg,#475569,#334155)'
                                : 'linear-gradient(135deg,#f59e0b,#d97706)',
                            boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
                            border: 'none', cursor: 'pointer',
                            fontSize: tourMenuOpen ? 16 : 20,
                            display:'flex', alignItems:'center', justifyContent:'center',
                            color: 'white', fontWeight: 700,
                            transition: 'background 0.2s',
                        }}
                    >
                        {tourMenuOpen ? '✕' : '📚'}
                    </button>
                </>
            )}




            <IncidentModal
                isOpen={isIncidentModalOpen}
                onClose={() => setIsIncidentModalOpen(false)}
                onConfirm={onStatusChange}
                shipment={incidentShipment}
                initialReason={incidentInitialReason}
            />

            <ShipmentDetailsModal
                isOpen={isDetailsModalOpen}
                onClose={() => {
                    setIsDetailsModalOpen(false);
                    setIsReadOnlyModal(false);
                }}
                zoom={zoom}
                shipment={selectedShipment}
                allPoblaciones={allPoblaciones}
                drivers={drivers}
                onUpdate={onUpdateShipment}
                isReadOnly={isReadOnlyModal}
                onWhatsAppShare={handleWhatsAppShare}
                articles={articles}
                clients={clients}
                tariffs={tariffs}
                familyOrder={familyOrder}
                hidePrices={(() => {
                    if (!selectedShipment) return false;
                    const payingClientName = selectedShipment.porteType === 'Pagado' ? selectedShipment.client : selectedShipment.destinationName;
                    const payingClient = (clients || []).find(c => {
                        const name = String(c.name || '').toLowerCase();
                        const legal = String(c.legalName || '').toLowerCase();
                        const target = String(payingClientName || '').toLowerCase();
                        return name === target || legal === target;
                    });
                    const bType = String(payingClient?.billingType || '').toLowerCase();
                    return bType.includes('factur') || bType.includes('presupuesto');
                })()}
            />

            {/* WhatsApp Phone Prompt Modal */}
            {whatsappPrompt && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                                <MessageSquare size={24} />
                            </div>
                            <h3 className="text-lg font-bold text-slate-800 mb-1">Enviar Justificante</h3>
                            <p className="text-sm text-slate-500 mb-6">
                                {whatsappPrompt.motivo === 'fijo'
                                    ? 'El teléfono del cliente es un fijo y no tiene WhatsApp. Introduce un móvil:'
                                    : 'El cliente no tiene teléfono guardado. Introduce el número de WhatsApp:'}
                            </p>
                            
                            <input 
                                type="tel"
                                autoFocus
                                value={whatsappPrompt.phone}
                                onChange={(e) => setWhatsappPrompt(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="Ej: 600123456"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-bold text-lg text-slate-700 mb-4"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !whatsappPrompt.saving) handleWhatsAppShare(whatsappPrompt.shipment, whatsappPrompt.phone);
                                }}
                            />

                            <div className="flex gap-3">
                                <button
                                    onClick={() => setWhatsappPrompt(null)}
                                    disabled={whatsappPrompt.saving}
                                    className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors disabled:opacity-40"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => handleWhatsAppShare(whatsappPrompt.shipment, whatsappPrompt.phone)}
                                    disabled={whatsappPrompt.saving}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-70"
                                >
                                    {/* El botón se queda un instante en "Guardando..." a propósito: es el
                                        tiempo que tarda el número en llegar a la ficha, y si abriéramos
                                        WhatsApp antes la página se descarga y el dato se pierde. */}
                                    {whatsappPrompt.saving ? 'Guardando...' : 'Abrir WhatsApp'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Offline Banner — shown when no connectivity */}
            {!isOnline && (
                <div
                    style={{ zIndex: 9999 }}
                    className="fixed top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-rose-600 to-red-500 text-white shadow-lg"
                >
                    <WifiOff size={15} className="shrink-0" />
                    <span className="text-sm font-bold tracking-tight">SIN COBERTURA</span>
                    <div className="w-px h-4 bg-white/30" />
                    <p className="text-xs font-medium opacity-90">
                        {pendingQueueCount > 0
                            ? `${pendingQueueCount} operación${pendingQueueCount > 1 ? 'es' : ''} guardada${pendingQueueCount > 1 ? 's' : ''} — se sincronizará${pendingQueueCount > 1 ? 'n' : ''} al recuperar señal`
                            : 'Trabajando en modo local. Las entregas se guardarán al recuperar señal.'}
                    </p>
                </div>
            )}
            {justReconnected && (
                <div
                    style={{ zIndex: 9999 }}
                    className="fixed top-0 left-0 right-0 flex items-center justify-center gap-3 px-4 py-2.5 bg-gradient-to-r from-emerald-600 to-green-500 text-white shadow-lg animate-in slide-in-from-top-2 duration-300"
                >
                    <CheckCircle size={15} className="shrink-0" />
                    <span className="text-sm font-bold">Conexión restaurada — sincronizando datos ✓</span>
                </div>
            )}
            {/* Header */}
            <header id="driver-header" className={`bg-slate-900 text-white p-4 sticky z-50 shadow-md transition-all duration-300 ${(!isOnline || justReconnected) ? 'top-10' : 'top-0'}`}>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div
                            onClick={() => setActiveTab('profile')}
                            className="w-10 h-10 bg-white rounded-xl p-1.5 shadow-inner flex items-center justify-center overflow-hidden relative cursor-pointer hover:shadow-md transition-all active:scale-95 shrink-0"
                            title="Portal del Empleado"
                        >
                            <img src="/logo-sum.svg" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="min-w-0">
                            <h1 className="font-bold text-lg leading-tight text-white flex items-center gap-2 min-w-0">
                                <span className="truncate">Hola, {drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name || cachedDriverName || 'Conductor'}</span>

                                {/* GPS Status Button */}
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        handleGpsClick();
                                    }}
                                    title={
                                        gpsStatus === 'success' ? 'Ubicación enviada' :
                                        gpsStatus === 'denied' ? 'Permiso de ubicación bloqueado' :
                                        gpsStatus === 'timeout' || gpsStatus === 'unavailable' ? 'Sin señal GPS — pulsa para reintentar' :
                                        gpsStatus === 'db_error' ? 'GPS OK, pero no se pudo enviar' :
                                        'Enviar ubicación'
                                    }
                                    className={`ml-1 flex items-center justify-center p-1 rounded-full transition-colors ${
                                        gpsStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' :
                                        gpsStatus === 'requesting' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 animate-spin' :
                                        (gpsStatus === 'error_unsecure' || gpsStatus === 'denied') ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse' :
                                        (gpsStatus === 'timeout' || gpsStatus === 'unavailable' || gpsStatus === 'db_error') ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' :
                                        'bg-slate-700 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <MapPin size={16} />
                                </button>
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Accessibility Controls */}
                        <div className="flex bg-slate-800 rounded-lg p-1 mr-2">
                            <button 
                                onClick={() => setZoom(prev => Math.max(0.8, prev - 0.1))}
                                className="w-8 h-8 flex items-center justify-center text-xs font-bold hover:bg-slate-700 rounded transition-colors"
                                title="Reducir letra"
                            >
                                A-
                            </button>
                            <div className="w-px h-4 bg-slate-700 mx-1 self-center"></div>
                            <button 
                                onClick={() => setZoom(prev => Math.min(1.5, prev + 0.1))}
                                className="w-8 h-8 flex items-center justify-center text-lg font-bold hover:bg-slate-700 rounded transition-colors"
                                title="Aumentar letra"
                            >
                                A+
                            </button>
                        </div>

                        <button onClick={handleLogoutWithSafety} className="p-2 bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors">
                            <LogOut size={20} />
                        </button>
                    </div>
                </div>

                {/* Tab Navigation */}
                <div className="overflow-x-auto pb-2 scrollbar-hide">
                    <nav className="flex bg-slate-800 p-1 rounded-xl gap-0.5 min-w-[300px] overflow-x-auto scrollbar-hide">
                        <button id="driver-tab-route" onClick={() => setActiveTab('route')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'route' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Reparto</button>
                        <button id="driver-tab-assign" onClick={() => setActiveTab('assign')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'assign' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Asignar</button>
                        <button id="driver-tab-delivered" onClick={() => setActiveTab('delivered')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'delivered' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Entregas</button>
                        <button id="driver-tab-collections" onClick={() => setActiveTab('collections')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'collections' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>C.Pendientes</button>
                        <button id="driver-tab-account" onClick={() => setActiveTab('account')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Cuenta</button>
                    </nav>
                </div>
            </header>

            <main className="flex-1 p-0 sm:p-4 max-w-lg mx-auto w-full pb-24 relative">
                
                <DriverTimeLogAlerts currentDriverId={currentDriverId} />

                {/* AI Notification Toast */}
                {/* Avisos cortos para el conductor: el escáner de bultos y los fallos.
                    El resumen del optimizador YA NO pasa por aquí — es diagnóstico para
                    administración y se va a la consola: al que reparte no le aporta
                    nada y le tapaba la pantalla cada vez que ordenaba el día.
                    Va DEBAJO de la cabecera (con el top medido, no a ojo) y con menos z
                    que ella: clavado a top-24 se plantaba encima de las pestañas y esos
                    toques se los quedaba el cartel en vez de la pestaña. */}
                {learningMessage && (
                    <button
                        type="button"
                        onClick={() => setLearningMessage("")}
                        style={{ top: alturaDelAviso }}
                        className="fixed left-1/2 -translate-x-1/2 w-[92vw] max-w-md bg-slate-800/95 backdrop-blur-sm text-white text-left px-4 py-3 rounded-2xl text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top-4 z-40 flex items-start gap-2"
                    >
                        <BrainCircuit size={14} className="text-purple-400 shrink-0 mt-0.5" />
                        <span className="flex-1 leading-relaxed">{learningMessage}</span>
                        <X size={14} className="text-slate-400 shrink-0 mt-0.5" />
                    </button>
                )}

                {/* Upload Status */}
                {isUploading && (
                    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[100] flex items-center justify-center p-6">
                        <div className="bg-white p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 animate-in zoom-in-95">
                            <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin"></div>
                            <div className="text-center">
                                <p className="font-bold text-slate-800">Subiendo evidencias...</p>
                                <p className="text-xs text-slate-500">Guardando firma y fotos en la nube</p>
                            </div>
                        </div>
                    </div>
                )}


                {/* Offline Sync Status */}
                {syncQueue.length > 0 && (
                    <div className="bg-amber-100 border border-amber-200 p-2 rounded-xl mb-3 flex items-center justify-between shadow-md animate-pulse">
                        <div className="flex items-center gap-2">
                            <Clock size={16} className="text-amber-600" />
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold text-amber-900 uppercase tracking-tight">
                                    {syncQueue.length} paradas sin enviar
                                </span>
                                <span className="text-[9px] text-amber-600 font-medium">Buscando señal...</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => {
                                if (!navigator.onLine) {
                                    setLearningMessage("Aún no detecto red, por favor busca cobertura.");
                                } else {
                                    setLearningMessage("Sincronizando manualmente...");
                                }
                            }}
                            className="px-2 py-1 bg-white hover:bg-amber-50 text-amber-700 text-[10px] font-bold rounded-lg border border-amber-300 shadow-sm"
                        >
                            REINTENTAR
                        </button>
                    </div>
                )}

                {/* View: Mi Ruta (Active Shipments) */}
                {activeTab === 'route' && (
                    <div className="space-y-3">


                        <div id="tour-route-header" className="flex justify-between items-center px-1 mb-2">
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Pendientes</h3>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{localRoute.length} Envíos</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    id="tour-optimize-btn"
                                    onClick={handleSmartSort}
                                    disabled={isOptimizing}
                                    className={`flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shadow-sm
                                        ${isOptimizing ? 'bg-purple-100 text-purple-400' : 'bg-purple-600 text-white hover:bg-purple-700 shadow-purple-500/30'}`}
                                >
                                    {isOptimizing ? (
                                        <>Calculando...</>
                                     ) : (
                                        <>
                                            <Sparkles size={14} />
                                            Optimizar Ruta (v4)
                                        </>
                                    )}
                                </button>
                                {routeOptimized && !isOptimizing && (
                                    <button
                                        onClick={() => setShowRouteMap(true)}
                                        className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-500/30"
                                    >
                                        <MapIcon size={14} />
                                        Ver Mapa
                                    </button>
                                )}
                            </div>

                        </div>

                        <div className="space-y-3 lista-repartos">
                            {localRoute.length === 0 ? (
                                <div className="text-center py-10 text-slate-400">
                                    <p>¡Todo entregado! No tienes envíos pendientes.</p>
                                    <button onClick={() => setActiveTab('assign')} className="text-blue-500 underline mt-2 text-sm">Buscar más envíos</button>
                                </div>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCorners}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onDragCancel={() => setActiveId(null)}
                                >
                                    <SortableContext
                                        items={(localRoute || []).filter(Boolean).map(s => s.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        {(localRoute || []).filter(Boolean).map((stop, index) => (
                                            <SortableItem
                                                key={stop.id}
                                                stop={stop}
                                                index={index}
                                                clients={clients}
                                                Shipment={Shipment}
                                                parseAmount={parseAmount}
                                                setSelectedShipment={setSelectedShipment}
                                                setIsDetailsModalOpen={setIsDetailsModalOpen}
                                                printShipmentTicket={printShipmentTicket}
                                                setIncidentShipment={setIncidentShipment}
                                                setIsIncidentModalOpen={setIsIncidentModalOpen}
                                                setIncidentInitialReason={setIncidentInitialReason}
                                                setPickupToConvert={setPickupToConvert}
                                                setIsNoteModalOpen={setIsNoteModalOpen}
                                                setDeliveryModalShipment={setDeliveryModalShipment}
                                                onWhatsAppShare={handleWhatsAppShare}
                                                onUnassign={handleUnassignShipment}
                                                onPickupClick={handlePickupClick}
                                                esDeCamino={paradasDeCamino.has(stop.id)}
                                            />
                                        ))}
                                    </SortableContext>

                                    <DragOverlay adjustScale={true}>
                                        {activeId ? (() => {
                                            const activeStop = (localRoute || []).find(s => s && s.id === activeId);
                                            const activeIndex = (localRoute || []).findIndex(s => s && s.id === activeId);
                                            if (!activeStop) return null;
                                            return (
                                                <ShipmentCardUI 
                                                    stop={activeStop}
                                                    index={activeIndex}
                                                    clients={clients}
                                                    Shipment={Shipment}
                                                    parseAmount={parseAmount}
                                                    setSelectedShipment={setSelectedShipment}
                                                    setIsDetailsModalOpen={setIsDetailsModalOpen}
                                                    printShipmentTicket={printShipmentTicket}
                                                    setIncidentShipment={setIncidentShipment}
                                                    setIsIncidentModalOpen={setIsIncidentModalOpen}
                                                setIncidentInitialReason={setIncidentInitialReason}
                                                    setPickupToConvert={setPickupToConvert}
                                                    setIsNoteModalOpen={setIsNoteModalOpen}
                                                    setDeliveryModalShipment={setDeliveryModalShipment}
                                                    onWhatsAppShare={handleWhatsAppShare}
                                                    onUnassign={handleUnassignShipment}
                                                    onPickupClick={handlePickupClick}
                                                    esDeCamino={paradasDeCamino.has(activeStop.id)}
                                                    dragOverlay={true}
                                                />
                                            );
                                        })() : null}
                                    </DragOverlay>
                                </DndContext>
                            )}
                        </div>
                    </div>
                )}


                {/* View: Asignar */}
                {activeTab === 'assign' && (
                    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                        <div className="flex justify-between items-center px-1 mb-2">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Disponibles en Zona</h3>
                        </div>
                        {(() => {
                            const availableShipments = (allShipments || []).filter(
                                s => puedeAsignarloEsteConductor(s, currentDriverId)
                            );

                            return (
                                <>
                                    {availableShipments.map((shipment) => (
                                        <div 
                                            key={shipment.id}
                                            onClick={() => { setSelectedShipment(shipment); setIsDetailsModalOpen(true); }} 
                                            className={`bg-white px-4 py-2.5 rounded-xl shadow-sm border cursor-pointer transition-colors ${
                                                shipment.incidentStatus === 'resolved'
                                                    ? 'border-emerald-400 border-2 shadow-emerald-100'
                                                    : shipment.incidentStatus === 'active'
                                                        ? `border-red-400 border-2 shadow-red-100 ${shipment.incidentReply ? 'animate-pulse' : ''}`
                                                        : 'border-slate-100 hover:border-blue-300'
                                            }`}
                                        >
                                            {shipment.incidentStatus === 'active' && (
                                                <div className={`w-full font-extrabold text-[11px] py-1.5 px-2 rounded mb-2 text-center border shadow-sm flex items-center justify-center gap-2 ${shipment.incidentReply ? 'bg-red-100 text-red-700 border-red-300 animate-pulse' : 'bg-red-50 text-red-600 border-red-200'}`}>
                                                    <span>⚠️</span>
                                                    <span>{shipment.incidentReply ? 'RESPUESTA DE ADMINISTRACIÓN' : 'EN INCIDENCIA'}</span>
                                                    <span>⚠️</span>
                                                </div>
                                            )}
                                            {shipment.incidentStatus === 'resolved' && (
                                                <div className="w-full bg-emerald-100 text-emerald-700 font-extrabold text-[11px] py-1.5 px-2 rounded mb-2 text-center border border-emerald-300 shadow-sm flex items-center justify-center gap-2">
                                                    <span>✅</span>
                                                    <span>INCIDENCIA RESUELTA</span>
                                                    <span>✅</span>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-start mb-1">
                                                <div>
                                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                                        {shipment.type === 'Recogida' ? (
                                                            <span className="text-[10px] font-bold bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200 block w-fit">
                                                                RECOGIDA
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 block w-fit">
                                                                {shipment.paymentStatus === 'Pending' ? 'COBRO PENDIENTE' : 'ALBARÁN'}
                                                            </span>
                                                        )}
                                                        {Array.isArray(shipment.scannedPackages) && shipment.scannedPackages.length > 0 && (
                                                            <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm ${
                                                                shipment.scannedPackages.length >= getPackagesCount(shipment)
                                                                    ? 'bg-green-600 text-white'
                                                                    : 'bg-orange-500 text-white'
                                                            }`}>
                                                                {shipment.scannedPackages.length}/{getPackagesCount(shipment)} BULTOS ESCANEADOS
                                                            </span>
                                                        )}
                                                    </div>
                                                    <h4 className="font-bold text-slate-800">
                                                        {shipment.type === 'Recogida' ? shipment.client : (shipment.destinationName || shipment.client)}
                                                    </h4>
                                                </div>
                                                 <div className="flex flex-col items-end gap-1 relative">
                                                    <span className="text-xs font-mono text-slate-400">{shipment.id}</span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenAssignDocMenuId(openAssignDocMenuId === shipment.id ? null : shipment.id);
                                                        }}
                                                        className={`p-2 rounded-xl transition-all border ${
                                                            openAssignDocMenuId === shipment.id 
                                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md' 
                                                                : 'bg-white text-slate-400 hover:text-blue-600 hover:bg-blue-50 border-slate-100 shadow-sm'
                                                        }`}
                                                        title="Justificante"
                                                    >
                                                        <FileText size={18} />
                                                    </button>
                                                    
                                                    {openAssignDocMenuId === shipment.id && (
                                                        <>
                                                            <div 
                                                                className="fixed inset-0 z-40 bg-transparent" 
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setOpenAssignDocMenuId(null);
                                                                }}
                                                            />
                                                            <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 py-1 overflow-hidden animate-in slide-in-from-top-2 fade-in duration-150 origin-top-right">
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        printShipmentTicket(shipment);
                                                                        setOpenAssignDocMenuId(null);
                                                                    }}
                                                                    className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold border-b border-slate-50"
                                                                >
                                                                    <Printer size={16} className="text-slate-400" />
                                                                    IMPRIMIR TICKET
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        handleWhatsAppShare(shipment);
                                                                        setOpenAssignDocMenuId(null);
                                                                    }}
                                                                    className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold"
                                                                >
                                                                    <MessageSquare size={16} className="text-emerald-500" />
                                                                    ENVIAR WHATSAPP
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-600 mb-0 flex items-start gap-2">
                                                <MapIcon size={16} className="shrink-0 mt-0.5 text-slate-400" />
                                                {shipment.type === 'Recogida' ? shipment.originAddress : (shipment.destinationAddress || shipment.address)}
                                            </p>
                                            {(() => {
                                                const city = shipment.type === 'Recogida' ? shipment.originCity : shipment.destinationCity;
                                                const zip = shipment.type === 'Recogida' ? shipment.originZip : shipment.destinationZip;
                                                if (!city) return null;
                                                return (
                                                    <p className="text-base font-bold text-slate-800 pl-6 mb-1 italic uppercase tracking-tight">
                                                        {city} {zip && `(${zip})`}
                                                    </p>
                                                );
                                            })()}

                                            {shipment.incidentReply && (
                                                <div className="mb-2 p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-xl shadow-sm animate-pulse duration-[3000ms]">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <MessageSquare size={12} className="text-amber-600" />
                                                        <p className="text-[10px] font-extrabold text-amber-700 uppercase">Instrucciones de Oficina:</p>
                                                    </div>
                                                    <p className="text-xs font-bold text-amber-900 leading-tight">
                                                        "{shipment.incidentReply}"
                                                    </p>
                                                </div>
                                            )}
                                            {(() => {
                                                const obs = (shipment.observations || '').replace(/\[COBRO PENDIENTE\]/gi, '').trim();
                                                if (!obs) return null;
                                                return (
                                                    <div className="mb-2 p-2 bg-yellow-50 border-l-4 border-yellow-400 rounded-r-xl shadow-sm animate-pulse duration-[3000ms]">
                                                        <div className="flex items-center gap-1.5 mb-1">
                                                            <MessageSquare size={12} className="text-yellow-600" />
                                                            <p className="text-[10px] font-extrabold text-yellow-700 uppercase">Observaciones del Envío:</p>
                                                        </div>
                                                        <p className="text-xs font-bold text-yellow-900 leading-tight">
                                                            "{obs}"
                                                        </p>
                                                    </div>
                                                );
                                            })()}
                                            <div className="flex items-center justify-between pt-2 border-t border-slate-50 gap-2">
                                                <div className="flex flex-wrap gap-1 items-center flex-1">
                                                    {(() => {
                                                        const cityText = shipment.type === 'Recogida' ? (shipment.originCity || '') : (shipment.destinationCity || '');
                                                        if (!cityText) return null;
                                                        const activeR = routes && routes.length > 0 ? routes : [];

                                                        // Primero decidimos a qué pueblo de las rutas corresponde el envío, y solo
                                                        // después miramos quién lo lleva. Comparando "a trozos" ruta por ruta,
                                                        // "Montalbán de Córdoba" contenía "Córdoba" y el envío se le ofrecía a todo
                                                        // el que pasara por Córdoba capital.
                                                        const todosLosPueblos = activeR.flatMap(r => [
                                                            ...(r.poblacionesManana || []),
                                                            ...(r.poblacionesTarde || [])
                                                        ]);
                                                        const puebloDelEnvio = mejorPuebloParaCiudad(cityText, todosLosPueblos);
                                                        if (!puebloDelEnvio) return null;

                                                        const sugs = [];
                                                        activeR.forEach(r => {
                                                            if (!r.conductorId) return;
                                                            const driver = drivers?.find(d => String(d.id) === String(r.conductorId));
                                                            if (!driver) return; // Skip if driver was deleted or not found
                                                            const dName = driver.alias?.trim() || driver.name?.trim().split(' ')[0] || 'Conductor';

                                                            const inManana = (r.poblacionesManana || []).some(p => esElMismoPueblo(p, puebloDelEnvio));
                                                            if (inManana && !sugs.some(s => s.driverId === r.conductorId && s.turno === 'manana')) {
                                                                sugs.push({ driverId: r.conductorId, turno: 'manana', name: dName });
                                                            }

                                                            const inTarde = (r.poblacionesTarde || []).some(p => esElMismoPueblo(p, puebloDelEnvio));
                                                            if (inTarde && !sugs.some(s => s.driverId === r.conductorId && s.turno === 'tarde')) {
                                                                sugs.push({ driverId: r.conductorId, turno: 'tarde', name: dName });
                                                            }
                                                        });
                                                        
                                                        // El turno que se está despachando ahora, que va por delante del
                                                        // reloj: a la una se pasa el reparto de la tarde, y a partir de
                                                        // las 16:30 el de la mañana siguiente. Ojo, NO es el mismo corte
                                                        // que usa el optimizador del móvil (ver utils/turnos.js).
                                                        const turnoQueToca = turnoQueSeAsignaAhora();

                                                        return sugs.map((sug, i) => {
                                                            const shouldBlink = sug.turno === turnoQueToca;
                                                            
                                                            return (
                                                                <button
                                                                    key={`${sug.driverId}-${sug.turno}-${i}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onAssignShipment(shipment.id, sug.driverId);
                                                                    }}
                                                                    className={`px-1.5 py-1 text-[9px] font-bold rounded-lg border flex items-center gap-0.5 transition-all active:scale-95 shadow-sm ${
                                                                        sug.turno === 'manana' 
                                                                            ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 hover:shadow'
                                                                            : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:shadow'
                                                                    } ${shouldBlink ? 'animate-pulse border-2 border-red-400 border-dashed' : ''}`}
                                                                title={`Asignar a ${sug.name} (${sug.turno})`}
                                                            >
                                                                <span className="text-[10px]">{sug.turno === 'manana' ? '☀️' : '🌙'}</span> {sug.name}
                                                            </button>
                                                            );
                                                        });
                                                    })()}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <User size={14} className="text-slate-400" />
                                                    <select
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="bg-slate-50 border border-slate-200 text-sm rounded-lg p-2 focus:outline-none focus:border-blue-500 max-w-[150px]"
                                                        onChange={(e) => {
                                                            if (e.target.value) onAssignShipment(shipment.id, e.target.value)
                                                        }}
                                                        value=""
                                                    >
                                                        <option value="">Asignar a...</option>
                                                        {!isCityInBaremo(shipment.type === 'Recogida' ? shipment.originCity : shipment.destinationCity, shipment.type === 'Recogida' ? shipment.originZip : shipment.destinationZip) ? (
                                                            <>
                                                                <option value="admin">Administración</option>
                                                                {drivers && drivers.filter(d => d && String(d.name || '').toLowerCase().includes('pavon') && d.isActive !== false).map(d => (
                                                                    <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                                                                ))}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <option value={currentDriverId}>A Mí</option>
                                                                {drivers && drivers.filter(d => d && d.id !== currentDriverId && d.isActive !== false).map(d => (
                                                                    <option key={d.id} value={d.id}>{getDriverDisplayName(d)}</option>
                                                                ))}
                                                            </>
                                                        )}
                                                    </select>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {availableShipments.length === 0 && (
                                        <p className="text-center text-slate-400 text-sm py-8">No hay envíos disponibles para asignar.</p>
                                    )}
                                </>
                            );
                        })()}
                    </div>
                )}

                {/* View: Entregados */}
                {
                    activeTab === 'delivered' && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex justify-between items-center px-1 mb-2">
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Entregas y Cobros de Hoy</h3>
                                <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-bold">{deliveredShipments.length} Total</span>
                            </div>
                            {deliveredShipments.length === 0 ? (
                                <p className="text-center text-slate-400 text-sm py-8">Aún no has entregado nada hoy.</p>
                            ) : deliveredShipments.map((shipment) => (
                                <div
                                    key={shipment.id}
                                    className="bg-slate-50 p-4 rounded-xl border border-slate-200 opacity-75 cursor-pointer hover:bg-slate-100 transition-colors"
                                    onClick={() => {
                                        setSelectedShipment(shipment);
                                        setIsDetailsModalOpen(true);
                                    }}
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-1">
                                                <span className="text-xs font-bold text-slate-500 uppercase">Remitente:</span>
                                                <h4 className={`text-sm truncate ${shipment.porteType === 'Pagado' ? 'font-bold italic text-blue-800' : 'font-bold text-slate-700'}`}>{shipment.originName || shipment.client} <span className="font-normal text-slate-500 not-italic">({shipment.originCity || 'N/A'})</span></h4>
                                            </div>
                                            <div className="flex items-center gap-1 mt-0.5">
                                                <span className="text-xs font-bold text-slate-500 uppercase">Destinatario:</span>
                                                <h4 className={`text-sm truncate ${shipment.porteType !== 'Pagado' ? 'font-bold italic text-amber-800' : 'font-bold text-slate-700'}`}>{shipment.destinationName || shipment.client} <span className="font-normal text-slate-500 not-italic">({shipment.destinationCity || 'N/A'})</span></h4>
                                            </div>
                                        </div>
                                        {shipment.type === 'Recibo' && (
                                            <span className="text-xs px-2 py-0.5 rounded-full font-bold ml-2 shrink-0 bg-emerald-200 text-emerald-800">
                                                Cobrado
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
                                        {/* Unified Documentation Button for History */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenDeliveredDocMenuId(openDeliveredDocMenuId === shipment.id ? null : shipment.id);
                                                }}
                                                className={`p-2 rounded-lg transition-all border flex items-center gap-1.5 text-xs font-bold ${openDeliveredDocMenuId === shipment.id ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-blue-100 hover:text-blue-600'}`}
                                                title="Opciones de Justificante"
                                            >
                                                <Printer size={14} /> 
                                                Justificante
                                            </button>

                                            {openDeliveredDocMenuId === shipment.id && (
                                                <>
                                                    <div 
                                                        className="fixed inset-0 z-40" 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setOpenDeliveredDocMenuId(null);
                                                        }}
                                                    />
                                                    <div className="absolute right-0 bottom-full mb-2 w-48 bg-white rounded-xl shadow-2xl border border-slate-100 z-50 py-1 overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-150 origin-bottom-right">
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                printShipmentTicket(shipment);
                                                                setOpenDeliveredDocMenuId(null);
                                                            }}
                                                            className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold border-b border-slate-50"
                                                        >
                                                            <Printer size={16} className="text-slate-400" />
                                                            IMPRIMIR TICKET
                                                        </button>
                                                        <button 
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleWhatsAppShare(shipment);
                                                                setOpenDeliveredDocMenuId(null);
                                                            }}
                                                            className="w-full px-4 py-3 flex items-center gap-3 text-slate-700 hover:bg-slate-50 transition-colors text-xs font-bold"
                                                        >
                                                            <MessageSquare size={16} className="text-emerald-500" />
                                                            ENVIAR WHATSAPP
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                        <div className="font-mono text-sm font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded min-w-[60px] text-center">
                                            {(() => {
                                                const normalize = (val) => String(val || '').trim().toLowerCase();
                                                const isDebido = shipment.porteType === 'Debido';
                                                
                                                // Identificar quién paga el porte
                                                const payingName = isDebido ? (shipment.destinationName || shipment.client) : (shipment.originName || shipment.client);
                                                
                                                let payingClient = null;
                                                if (clients) {
                                                    const cName = normalize(payingName);
                                                    payingClient = clients.find(c => normalize(c.name) === cName || normalize(c.legalName) === cName);
                                                    if (payingClient) {
                                                        const rawNum = payingClient.clientNumber || '';
                                                        const matchSuffix = String(rawNum).match(/^(.*?\d)[-_ ]?[a-zA-Z]{1,2}$/);
                                                        if (matchSuffix) {
                                                            const baseNumber = matchSuffix[1];
                                                            const parentClient = clients.find(c => String(c.clientNumber || '') === baseNumber);
                                                            if (parentClient) payingClient = parentClient;
                                                        }
                                                    }
                                                }

                                                // Determinar tipo de facturación
                                                const bType = payingClient?.billingType || (isDebido ? shipment.destinationBillingType : shipment.billingType) || '';
                                                const bTypeLow = String(bType).toLowerCase();
                                                const isInvoice = bTypeLow.includes('factur') || bTypeLow.includes('presupuesto');
                                                
                                                if (isInvoice) {
                                                    return <span className="text-[10px] text-slate-400 italic font-sans">Enviado</span>;
                                                }
                                                return `${shipment.amount}€`;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )
                }

                {/* View: Cobros */}
                {
                    activeTab === 'collections' && (
                        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider ml-1">Pendientes Cobros y Reembolsos</h3>
                            {(() => {
                                const pendingShipments = (allShipments || []).filter(s =>
                                    s &&
                                    (Number(s.assignedDriverId) === Number(currentDriverId) || Number(s.createdById) === Number(currentDriverId)) &&
                                    s.status !== 'Cancelado'
                                );

                                // Build separate debt items from pending shipments
                                const debtItems = [];
                                pendingShipments.forEach(shipment => {
                                    // Robust normalization for names
                                    const normalize = (val) => String(val || '').trim().toLowerCase();
                                    const sName = normalize(shipment.client);
                                    const dName = normalize(shipment.destinationName);
                                    
                                    // Find client info for source of truth
                                    const senderClient = clients?.find(c => normalize(c.name) === sName || normalize(c.legalName) === sName);
                                    const destClient = clients?.find(c => normalize(c.name) === dName || normalize(c.legalName) === dName);

                                    // Los "Recibo" (cierre de presupuestos, cobros manuales de oficina...) traen su
                                    // propio billingType puesto A PROPÓSITO — normalmente 'Clientes Habituales' para
                                    // forzar que se cobre en mano aunque el cliente real sea de Presupuesto/Facturación.
                                    // Si aquí se sustituye por la ficha del cliente, ese Recibo deja de aparecer como
                                    // deuda de contado y desaparece de la pestaña del conductor sin avisar a nadie.
                                    const isOfficeReceipt = shipment.type === 'Recibo';

                                    // Create model with enriched billing info
                                    const model = new Shipment({
                                        ...shipment,
                                        billingType: isOfficeReceipt ? (shipment.billingType || 'Clientes Habituales') : (senderClient?.billingType || shipment.billingType || 'Clientes Habituales'),
                                        destinationBillingType: isOfficeReceipt ? null : (destClient?.billingType || shipment.destinationBillingType || null)
                                    });

                                    // Skip fully paid (now using model logic implicitly via our filters)
                                    if (shipment.paymentStatus === 'Paid' && shipment.status !== 'Pendiente Cobro') return;

                                    const isDebido = shipment.porteType === 'Debido';
                                    const hasCod = shipment.hasCod;
                                    const porteVal = parseAmount(shipment.amount);
                                    const codVal = hasCod ? parseAmount(shipment.codAmount) : 0;

                                    const portePayer = isDebido 
                                        ? (shipment.destinationName || 'Destinatario (Debido)') 
                                        : (shipment.originName || shipment.client);
                                    const codPayer = shipment.destinationName || 'Destinatario (Reembolso)';

                                    // Determine which driver is responsible
                                    const designatedPorteDriverId = isDebido ? (shipment.assignedDriverId || shipment.createdById) : (shipment.createdById || shipment.assignedDriverId);
                                    const designatedCodDriverId = shipment.assignedDriverId || shipment.createdById;

                                    // Porte card
                                    const porteIsActuallyPending = (porteVal > 0 || String(shipment.amount).toLowerCase() === 'tarifa') && !shipment.portePaid && shipment.paymentStatus !== 'Paid';
                                    
                                    // Use model to decide if this porto generates debt
                                    const isPortePayerCash = isDebido 
                                        ? !model.isInvoiceBilling(destClient?.billingType) 
                                        : model.isCashBilling(model.billingType);

                                    if (porteIsActuallyPending && isPortePayerCash && Number(designatedPorteDriverId) === Number(currentDriverId)) {
                                        // RULE: 
                                        // - Portes Pagados (Origin/Sender): show always (Case 2/5)
                                        // - Portes Debidos (Destination): ONLY if Entregado (Case 3/6)
                                        if (!isDebido || shipment.status === 'Entregado') {
                                            debtItems.push({
                                                key: `${shipment.id}-porte`,
                                                shipment,
                                                type: 'porte',
                                                label: isDebido ? 'Porte Debido' : 'Porte Pagado',
                                                amount: String(shipment.amount).toLowerCase() === 'tarifa' ? 'Tarifa' : porteVal,
                                                payerName: portePayer || (isDebido ? 'Destinatario' : 'Remitente'),
                                                colorClass: isDebido ? 'border-l-yellow-400' : 'border-l-blue-400',
                                                badgeClass: isDebido ? 'text-yellow-600 bg-yellow-50' : 'text-blue-600 bg-blue-50',
                                            });
                                        }
                                    }

                                    // Reembolso card - ONLY if Entregado
                                    const isCodPayerCash = !model.isInvoiceBilling(destClient?.billingType);
                                    if (hasCod && codVal > 0 && !shipment.codPaid && isCodPayerCash && Number(designatedCodDriverId) === Number(currentDriverId) && shipment.status === 'Entregado') {
                                        debtItems.push({
                                            key: `${shipment.id}-reembolso`,
                                            shipment,
                                            type: 'reembolso',
                                            label: 'Reembolso',
                                            amount: codVal,
                                            payerName: codPayer || 'Destinatario',
                                            colorClass: 'border-l-red-500',
                                            badgeClass: 'text-red-600 bg-red-50',
                                        });
                                    }
                                });

                                // Filter out items currently being processed (Optimistic UI)
                                const visibleDebtItems = debtItems.filter(item => !processingIds.has(item.key));

                                const totalPendingValue = visibleDebtItems.reduce((sum, item) => sum + (typeof item.amount === 'number' ? item.amount : 0), 0) +
                                    pendingCollections.reduce((sum, c) => sum + parseAmount(c.amount), 0);

                                const sortByPayer = (a, b) => (a.payerName || '').localeCompare(b.payerName || '');

                                const porteDebts = visibleDebtItems.filter(item => item.label.includes('Pagado') || item.label.includes('Debido')).sort(sortByPayer);
                                const reembolsoDebts = visibleDebtItems.filter(item => item.type === 'reembolso').sort(sortByPayer);

                                const renderDebtCard = (item) => {
                                    const { shipment } = item;
                                    const debtKey = `${shipment.id}-${item.type}`;
                                    const currentAmount = dashboardCustomAmounts[debtKey] !== undefined ? dashboardCustomAmounts[debtKey] : item.amount;

                                    return (
                                        <div 
                                            key={item.key} 
                                            className={`bg-white p-4 rounded-xl shadow-sm border border-l-4 ${item.colorClass} border-slate-100 cursor-pointer hover:border-blue-400 transition-all active:scale-[0.98]`}
                                            onClick={() => {
                                                setSelectedShipment(shipment);
                                                setIsDetailsModalOpen(true);
                                            }}
                                        >
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-1 inline-block ${item.badgeClass}`}>
                                                        {item.label}
                                                    </span>
                                                    <h4 className="font-bold text-slate-800">{item.payerName}</h4>
                                                    {shipment.type === 'Recibo' ? (
                                                        <p className="text-[10px] text-slate-400 font-bold italic">Creado por oficina</p>
                                                    ) : (
                                                        (item.payerName !== shipment.client) && (
                                                            <p className="text-[10px] text-slate-400">Cliente origen: {shipment.client}</p>
                                                        )
                                                    )}
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 shadow-inner focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400 transition-all" onClick={(e) => e.stopPropagation()}>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            value={currentAmount ?? ''}
                                                            onChange={(e) => {
                                                                setDashboardCustomAmounts(prev => ({ ...prev, [debtKey]: e.target.value }));
                                                            }}
                                                            className="w-16 bg-transparent border-none p-0 text-right font-mono font-bold text-slate-800 text-sm focus:ring-0"
                                                            placeholder="0.00"
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">€</span>
                                                    </div>
                                                    <span className="text-[10px] text-slate-400 block mt-1">
                                                        {item.type === 'porte' ? '(Servicio)' : '(Reembolso)'}
                                                    </span>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500 flex items-center gap-1 mb-2">
                                                <Clock size={12} />
                                                {shipment.paymentStatus === 'Pending' ? 'Deuda Activa' : `Entregado: ${new Date(shipment.updatedAt || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                                            </p>
                                            <button
                                                disabled={processingIds.has(item.key)}
                                                onClick={async (e) => {
                                                    e.stopPropagation();
                                                    
                                                    // OPTIMISTIC UI: Hide item immediately
                                                    setProcessingIds(prev => new Set([...prev, item.key]));

                                                    try {
                                                        const isPorte = item.type === 'porte';

                                                        // Guarda anti-duplicado: esta lista sale de `allShipments`, que puede
                                                        // llevar hasta 60s sin refrescar (o venir de una sesión vieja). Si el
                                                        // envío YA consta cobrado en el servidor, cobrarlo otra vez aquí sumaría
                                                        // el importe dos veces en la Cuenta del día sin que el albarán cambie
                                                        // (su fecha de cobro real no se toca), así que el duplicado pasaría
                                                        // desapercibido. Se comprueba contra Supabase justo antes de cobrar.
                                                        const { data: freshRow } = await supabase.from('shipments').select('data').eq('id', shipment.id).maybeSingle();
                                                        const freshShip = freshRow?.data;
                                                        if (freshShip && ((isPorte && freshShip.portePaid) || (!isPorte && freshShip.codPaid))) {
                                                            const fecha = freshShip.paidAt || freshShip.updatedAt;
                                                            alert(`Este ${isPorte ? 'porte' : 'reembolso'} ya figura cobrado (${fecha ? new Date(fecha).toLocaleString() : 'fecha desconocida'}). No se ha duplicado el cobro.`);
                                                            onUpdateShipment(shipment.id, { ...freshShip, id: shipment.id });
                                                            setProcessingIds(prev => {
                                                                const next = new Set(prev);
                                                                next.delete(item.key);
                                                                return next;
                                                            });
                                                            return;
                                                        }

                                                        const debtKey = `${shipment.id}-${item.type}`;
                                                        const finalAmount = parseAmount(currentAmount).toFixed(2);

                                                        // 1. Determine local time-based date (using our standardized todayStr)
                                                        const collectionDate = todayStr;

                                                        // 2. Determine atomic update flags
                                                        const nowIso = new Date().toISOString();
                                                        const updates = { 
                                                            updatedAt: nowIso,
                                                            paidAt: nowIso
                                                        };
                                                        
                                                        if (isPorte) {
                                                            updates.portePaid = true;
                                                            updates.porteCollectedById = currentDriverId;
                                                        } else {
                                                            updates.codPaid = true;
                                                            updates.codCollectedById = currentDriverId;
                                                        }

                                                        // Check if this makes the shipment fully paid
                                                        const willBePortePaid = isPorte || shipment.portePaid;
                                                        const willBeCodPaid = (!shipment.hasCod) || (!isPorte || shipment.codPaid); 
                                                        // Wait, let's be more precise
                                                        const pf = isPorte || shipment.portePaid;
                                                        const cf = (shipment.hasCod ? (item.type === 'reembolso' || shipment.codPaid) : true);
                                                        
                                                        if (pf && cf) {
                                                            updates.paymentStatus = 'Paid';
                                                        }

                                                        // 3. Sync to Supabase ATOMICALLY
                                                        // COBRAR NO ES ENTREGAR. Antes bastaba con que no quedara dinero
                                                        // pendiente (pf && cf) para mandar el albaran a Entregado. Eso rompia
                                                        // el caso del cliente que crea el albaran con "aplazar cobro" y paga
                                                        // un rato despues: al cobrarlo aqui el paquete seguia en el almacen,
                                                        // sin repartidor y sin entregar, pero figuraba como entregado (sin
                                                        // firma, sin hora de entrega) y desaparecia de la pestana Asignar,
                                                        // asi que ya no lo llevaba nadie. El estado solo lo cierra la entrega
                                                        // de verdad: si el albaran aun no esta entregado, aqui solo se guarda
                                                        // el dinero y se queda donde estaba (Pendiente de asignar / En reparto).
                                                        // Si ya estaba entregado, onStatusChange cierra el ciclo con las marcas de pago.
                                                        let success = false;
                                                        if (shipment.status === 'Entregado') {
                                                            await onStatusChange(shipment.id, 'Entregado', null, null, null, null, updates);
                                                            success = true; // onStatusChange handled it
                                                        } else {
                                                            success = await onUpdateShipment(shipment.id, updates);
                                                        }

                                                        if (success) {
                                                            // 4. Add to local collections state for the Account tab
                                                            const newCollection = {
                                                                id: `COL-${Date.now()}-${shipment.id}-${item.type}`,
                                                                shipmentId: shipment.id,
                                                                partType: item.type,
                                                                client: item.payerName,
                                                                sender: shipment.senderName || shipment.originName || 'N/A',
                                                                amount: finalAmount,
                                                                type: isPorte ? 'Porte' : 'Reembolso',
                                                                date: collectionDate
                                                            };
                                                            setCollectedCollections(prev => [...prev, newCollection]);
                                                        } else {
                                                            // Fallback for optimistic UI if failure
                                                            setProcessingIds(prev => {
                                                                const next = new Set(prev);
                                                                next.delete(item.key);
                                                                return next;
                                                            });
                                                        }
                                                    } catch (err) {
                                                        console.error("Error al procesar cobro individual:", err);
                                                        setProcessingIds(prev => {
                                                            const next = new Set(prev);
                                                            next.delete(item.key);
                                                            return next;
                                                        });
                                                    }
                                                }}
                                                className={`w-full text-xs font-bold py-2 rounded-lg transition-colors ${processingIds.has(item.key) ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'text-indigo-600 bg-indigo-50 hover:bg-indigo-100'}`}
                                            >
                                                {processingIds.has(item.key) ? 'Sincronizando...' : 'Marcar Cobrado'}
                                            </button>
                                        </div>
                                    );
                                };

                                return (
                                    <>
                                        <div className="bg-indigo-600 text-white p-6 rounded-2xl shadow-lg mb-4">
                                            <p className="text-indigo-200 text-sm font-medium mb-1">Total a Recaudar</p>
                                            <h2 className="text-3xl font-bold">{totalPendingValue.toFixed(2)} €</h2>
                                        </div>
                                        <div className="space-y-6">
                                            {porteDebts.length > 0 && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                                                        Cobros por Portes
                                                    </h4>
                                                    <div className="space-y-3">
                                                        {porteDebts.map(renderDebtCard)}
                                                    </div>
                                                </div>
                                            )}

                                            {(reembolsoDebts.length > 0 || pendingCollections.length > 0) && (
                                                <div>
                                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-full bg-red-500"></div>
                                                        Reembolsos (Destinatarios)
                                                    </h4>
                                                    <div className="space-y-3">
                                                        {reembolsoDebts.map(renderDebtCard)}
                                                        {[...pendingCollections].sort((a,b) => (a.client || '').localeCompare(b.client || '')).map(collection => (
                                                            <div key={collection.id} className="bg-white p-4 rounded-xl shadow-sm border border-l-4 border-l-indigo-500 border-slate-100">
                                                                <div className="flex justify-between items-start mb-2">
                                                                    <div>
                                                                        <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2 py-0.5 rounded-full mb-1 inline-block">Reembolso</span>
                                                                        <h4 className="font-bold text-slate-800">{collection.client}</h4>
                                                                    </div>
                                                                    <span className="font-mono font-bold text-slate-700">€{collection.amount}</span>
                                                                </div>
                                                                <p className="text-xs text-slate-500 mb-2">{collection.type} - {collection.date}</p>
                                                                <button
                                                                    onClick={() => {
                                                                        setPendingCollections(prev => prev.filter(c => c.id !== collection.id));
                                                                        // Ensure manual date matches account logic
                                                                        const updatedCollection = { ...collection, date: todayStr };
                                                                        setCollectedCollections(prev => [...prev, updatedCollection]);
                                                                    }}
                                                                    className="w-full text-xs font-bold text-indigo-600 bg-indigo-50 py-2 rounded-lg hover:bg-indigo-100 transition-colors"
                                                                >
                                                                    Marcar Cobrado
                                                                </button>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {debtItems.length === 0 && pendingCollections.length === 0 && (
                                                <div className="text-center py-8 text-slate-400">
                                                    <CheckCircle className="mx-auto mb-2 text-slate-300" size={32} />
                                                    <p>No tienes cobros pendientes.</p>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )
                }

                {
                    activeTab === 'account' && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            <div className="flex justify-between items-center ml-1">
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Cierre de Caja Diario</h3>
                                <button
                                    onClick={() => {
                                        const currentDriverObj = drivers?.find(d => Number(d.id) === Number(currentDriverId)) || { name: 'Conductor' };
                                        generateCashReportPDF(currentDriverObj, new Date(), accountData);
                                    }}
                                    className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors border border-emerald-200 shadow-sm flex items-center gap-2 text-xs font-bold"
                                >
                                    <FileText size={14} /> Mi Cierre (PDF)
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-4 mb-4">
                <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex-1 flex items-center gap-3">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                        <User size={20} />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Conductor</p>
                        <h2 className="font-bold text-slate-800 leading-none">
                            {(drivers || []).find(d => Number(d.id) === Number(currentDriverId))?.name || 'Cargando...'}
                        </h2>
                    </div>
                </div>

                <div className="bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-2 group cursor-help" title="Conexión en Tiempo Real Activa">
                    <div className="relative">
                        <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
                        <div className="absolute inset-0 bg-emerald-500 rounded-full animate-ping opacity-25"></div>
                    </div>
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-tighter">Live Sync</span>
                </div>
            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <div className="text-slate-400 mb-1"><Euro size={20} /></div>
                                    <p className="text-xs text-slate-500 uppercase font-bold">Reembolsos</p>
                                    <h4 className="text-xl font-bold text-slate-800">
                                        €{collectedReembolsos.toFixed(2)}
                                    </h4>
                                </div>
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100">
                                    <div className="text-slate-400 mb-1"><Truck size={20} /></div>
                                    <p className="text-xs text-slate-500 uppercase font-bold">Porte (Caja)</p>
                                    <h4 className="text-xl font-bold text-slate-800">€{collectedPorte.toFixed(2)}</h4>
                                </div>
                            </div>
                            {(collectedSimplifiedInvoices || 0) > 0 && (
                                <div className="bg-white p-4 rounded-xl shadow-sm border border-orange-100 col-span-2">
                                    <div className="text-orange-400 mb-1">🧾</div>
                                    <p className="text-xs text-orange-500 uppercase font-bold">Facturas Simplificadas</p>
                                    <h4 className="text-xl font-bold text-orange-700">€{(collectedSimplifiedInvoices || 0).toFixed(2)}</h4>
                                </div>
                            )}
                            <div className="bg-slate-900 text-white p-6 rounded-2xl shadow-lg mt-2">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <p className="text-slate-400 text-sm font-medium">Total Recaudado Hoy</p>
                                        <h2 className="text-3xl font-bold">
                                            €{dailyTotal.toFixed(2)}
                                        </h2>
                                    </div>
                                    <div className="p-3 bg-slate-800 rounded-full">
                                        <Wallet size={24} className="text-emerald-400" />
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-4 mt-6">
                                <div>
                                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                                        Cobros de Porte (Origen, Entrega y Cobros)
                                        <button onClick={handlePrintPorte} className="ml-auto p-1.5 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200 transition-colors" title="Imprimir Resumen Porte">
                                            <Printer size={14} />
                                        </button>
                                    </h4>
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                                        {allPorteDetail.length === 0 && (
                                            <div className="p-8 text-center bg-white rounded-xl border border-slate-100 italic text-slate-400 text-xs">
                                                No hay portes cobrados hoy.
                                            </div>
                                        )}
                                        {allPorteDetail.map(item => (
                                            <div 
                                                key={item.key} 
                                                className="p-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer"
                                                onClick={() => {
                                                    const ship = (allShipments || []).find(s => s.id === item.id);
                                                    if (ship) {
                                                        setSelectedShipment(ship);
                                                        setIsReadOnlyModal(true);
                                                        setIsDetailsModalOpen(true);
                                                    }
                                                }}
                                            >
                                                <div>
                                                    <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                    <p className="text-[10px] text-slate-400">{item.detail}</p>
                                                </div>
                                                <span className={`font-mono text-sm font-bold ${item.colorClass}`}>
                                                    {item.amountDisplay || item.amount}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-indigo-500"></div>
                                            Detalle Reembolsos
                                        </h4>
                                        {allReimbursementsDetail.length > 0 && (
                                            <button
                                                onClick={() => handlePrintAllReceipts(allReimbursementsDetail)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-[10px] font-bold uppercase hover:bg-indigo-100 transition-colors"
                                                title="Imprimir todos los justificantes (4 por folio)"
                                            >
                                                <Printer size={12} />
                                                Imprimir Todos ({allReimbursementsDetail.length})
                                            </button>
                                        )}
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-100 divide-y divide-slate-50">
                                        {allReimbursementsDetail.length === 0 && (
                                            <div className="p-8 text-center bg-white rounded-xl border border-slate-100 italic text-slate-400 text-xs">
                                                No hay reembolsos cobrados hoy.
                                            </div>
                                        )}
                                        {allReimbursementsDetail.map(item => (
                                            <div 
                                                key={item.key} 
                                                className="p-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer"
                                                onClick={() => {
                                                    let ship = (allShipments || []).find(s => s.id === item.id);
                                                    if (!ship && item.original?.shipmentId) {
                                                        ship = (allShipments || []).find(s => s.id === item.original.shipmentId);
                                                    }
                                                    if (ship) {
                                                        setSelectedShipment(ship);
                                                        setIsReadOnlyModal(true);
                                                        setIsDetailsModalOpen(true);
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                    <p className="text-[10px] text-slate-400">{item.detail}</p>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <div className={`font-bold text-sm ${item.colorClass}`}>{item.amountDisplay}</div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handlePrintReceipt(item);
                                                        }}
                                                        className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors"
                                                        title="Imprimir Justificante"
                                                    >
                                                        <Printer size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {allSimplifiedInvoiceDetail && allSimplifiedInvoiceDetail.length > 0 && (
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                                            Facturas Simplificadas (con IVA)
                                        </h4>
                                        <button
                                            onClick={() => {
                                                const today = new Date().toLocaleDateString('es-ES');
                                                const driverName = currentDriver?.name || 'Conductor';
                                                const totalBase = allSimplifiedInvoiceDetail.reduce((s, i) => s + parseFloat(i.base), 0);
                                                const totalIva = allSimplifiedInvoiceDetail.reduce((s, i) => s + parseFloat(i.iva), 0);
                                                const totalFinal = allSimplifiedInvoiceDetail.reduce((s, i) => s + parseFloat(i.amount), 0);
                                                
                                                const rows = allSimplifiedInvoiceDetail.map((item, idx) => `
                                                    <tr>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee">${idx + 1}</td>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee">${item.id}</td>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee">${item.client}</td>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${item.base} €</td>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right">${item.iva} €</td>
                                                        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;font-weight:bold">${item.amount} €</td>
                                                    </tr>
                                                `).join('');
                                                
                                                const w = window.open('', '_blank');
                                                if (!w) return;
                                                w.document.write(`<html><head><title>Resumen Facturas Simplificadas ${today}</title>
                                                <style>
                                                    body { font-family: Arial, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; color: #333; }
                                                    .header { text-align: center; border-bottom: 3px solid #ea580c; padding-bottom: 12px; margin-bottom: 15px; }
                                                    .header h1 { font-size: 16px; margin: 0; }
                                                    .header h2 { font-size: 13px; margin: 4px 0 0; color: #ea580c; text-transform: uppercase; letter-spacing: 1px; }
                                                    .meta { font-size: 12px; margin-bottom: 15px; display: flex; justify-content: space-between; }
                                                    table { width: 100%; border-collapse: collapse; font-size: 12px; }
                                                    th { background: #fff7ed; color: #9a3412; padding: 8px 4px; text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 2px solid #ea580c; }
                                                    th:nth-child(4), th:nth-child(5), th:nth-child(6) { text-align: right; }
                                                    .totals { margin-top: 15px; border-top: 2px solid #ea580c; padding-top: 10px; }
                                                    .total-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 3px; }
                                                    .grand-total { font-size: 18px; font-weight: bold; border-top: 2px double #ea580c; padding-top: 8px; margin-top: 8px; display: flex; justify-content: space-between; }
                                                    .sig { margin-top: 40px; display: flex; justify-content: space-between; font-size: 11px; }
                                                    .sig-box { border-top: 1px solid #999; width: 45%; text-align: center; padding-top: 5px; }
                                                    .actions { margin-top: 25px; text-align: center; }
                                                    .actions button { padding: 10px 20px; margin: 5px; border: none; border-radius: 8px; font-weight: bold; font-size: 13px; cursor: pointer; }
                                                    .btn-print { background: #ea580c; color: white; }
                                                    .btn-close { background: #64748b; color: white; }
                                                    @media print { .actions { display: none !important; } @page { margin: 10mm; } }
                                                </style></head><body>
                                                <div class="header">
                                                    <h1>SUMTRANS LOGISTICA S.L.</h1>
                                                    <p style="font-size:11px;margin:2px 0">CIF: B56131717</p>
                                                    <h2>Resumen Facturas Simplificadas</h2>
                                                </div>
                                                <div class="meta">
                                                    <span><strong>Conductor:</strong> ${driverName}</span>
                                                    <span><strong>Fecha:</strong> ${today}</span>
                                                </div>
                                                <table>
                                                    <thead><tr><th>#</th><th>Ref.</th><th>Cliente</th><th>Base</th><th>IVA 21%</th><th>Total</th></tr></thead>
                                                    <tbody>${rows}</tbody>
                                                </table>
                                                <div class="totals">
                                                    <div class="total-row"><span>Base Imponible Total:</span><span>${totalBase.toFixed(2)} €</span></div>
                                                    <div class="total-row"><span>IVA 21% Total:</span><span>${totalIva.toFixed(2)} €</span></div>
                                                    <div class="grand-total"><span>TOTAL A ENTREGAR:</span><span>${totalFinal.toFixed(2)} €</span></div>
                                                </div>
                                                <div class="sig">
                                                    <div class="sig-box">Firma Conductor</div>
                                                    <div class="sig-box">Firma Oficina</div>
                                                </div>
                                                <div class="actions">
                                                    <button class="btn-print" onclick="window.print()">🖨️ Imprimir</button>
                                                    <button class="btn-close" onclick="window.close()">← Volver</button>
                                                </div>
                                                </body></html>`);
                                                w.document.close();
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg text-[10px] font-bold uppercase hover:bg-orange-100 transition-colors"
                                            title="Imprimir resumen de facturas simplificadas"
                                        >
                                            <Printer size={12} />
                                            Imprimir Todas ({allSimplifiedInvoiceDetail.length})
                                        </button>
                                    </div>
                                    <div className="bg-white rounded-xl shadow-sm border border-orange-100 divide-y divide-orange-50">
                                        {allSimplifiedInvoiceDetail.map(item => (
                                            <div
                                                key={item.key}
                                                className="p-3 flex justify-between items-center hover:bg-slate-50 cursor-pointer"
                                                onClick={() => {
                                                    const ship = item.original || (allShipments || []).find(s => s.id === item.id);
                                                    if (ship) {
                                                        setSelectedShipment(ship);
                                                        setIsReadOnlyModal(true);
                                                        setIsDetailsModalOpen(true);
                                                    }
                                                }}
                                            >
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                    <p className="text-[10px] text-slate-400">{item.detail}</p>
                                                    <p className="text-[9px] text-orange-400">Base: {item.base}€ + IVA: {item.iva}€</p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="font-mono text-sm font-bold text-orange-600">
                                                        {item.amountDisplay}
                                                    </span>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const ship = item.original || (allShipments || []).find(s => s.id === item.id) || {};
                                                            printSimplifiedInvoice({
                                                                ...ship,
                                                                amount: item.amount,
                                                                id: item.id,
                                                                date: item.date || new Date().toLocaleDateString('es-ES'),
                                                                articles: ship.articles || []
                                                            });
                                                        }}
                                                        className="p-2 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition-colors"
                                                        title="Ver / Enviar justificante por WhatsApp"
                                                    >
                                                        <MessageSquare size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                )}
                            </div>
                        </div>
                    )
                }

                {/* View: Portal del Empleado (Profile) */}
                {activeTab === 'profile' && (
                    <div className="space-y-4 px-2">
                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-3xl font-bold text-slate-400">
                                {drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name?.charAt(0) || 'C'}
                            </div>
                            <h2 className="text-xl font-bold text-slate-800">{drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name || 'Conductor'}</h2>
                            <p className="text-sm text-slate-500 mb-6 font-mono">ID: {currentDriverId}</p>

                            {!isTestMode && (
                                <TimeLogSection 
                                    currentDriverId={currentDriverId} 
                                    driverName={drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name} 
                                    handleLogoutWithSafety={handleLogoutWithSafety} 
                                />
                            )}
                            {isTestMode && (
                                <div className="w-full mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-center">
                                    <p className="text-sm font-bold text-amber-700">🟡 Modo Prueba activo</p>
                                    <p className="text-xs text-amber-600 mt-1">El fichaje de jornada no está disponible en modo de entrenamiento.</p>
                                </div>
                            )}

                            <div className="w-full grid grid-cols-2 gap-3">
                                <button onClick={() => setShowPayrollsModal(true)} className="p-4 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors rounded-xl flex flex-col items-center justify-center gap-2">
                                    <FileText size={24} className="text-blue-500" />
                                    <span className="font-bold text-slate-700 text-xs">Mis Nóminas</span>
                                    {currentDriver?.payrolls?.length > 0 && (
                                        <span className="text-[9px] font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full">{currentDriver.payrolls.length} disponibles</span>
                                    )}
                                </button>
                                <button
                                    onClick={() => setShowVacationsPanel(true)}
                                    className="p-4 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors rounded-xl flex flex-col items-center justify-center gap-2"
                                >
                                    <span className="text-2xl">🏖️</span>
                                    <span className="font-bold text-slate-700 text-xs">Mis Vacaciones</span>
                                </button>
                            </div>
                        </div>

                        {/* Mis Fichajes del Mes - Cumplimiento Legal RDL 8/2019 */}
                        <DriverTimeLogsHistory currentDriverId={currentDriverId} driverName={drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name} />

                        {/* Modal: Mis Nóminas */}
                        {showPayrollsModal && (
                            <div className="fixed inset-0 bg-slate-900/90 z-[100] flex flex-col animate-in fade-in">
                                <div className="bg-white px-6 py-4 flex items-center justify-between shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <div className="bg-blue-100 p-2 rounded-xl text-blue-600"><FileText size={20} /></div>
                                        <h2 className="text-lg font-bold text-slate-800">Mis Nóminas</h2>
                                    </div>
                                    <button onClick={() => setShowPayrollsModal(false)} className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-600 transition-colors">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                                    {(!currentDriver?.payrolls || currentDriver.payrolls.length === 0) ? (
                                        <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                                            <FileText size={48} className="mx-auto text-slate-200 mb-4" />
                                            <p className="text-slate-500 font-bold">No hay nóminas disponibles.</p>
                                        </div>
                                    ) : (
                                        currentDriver.payrolls.slice().reverse().map((payroll, idx) => (
                                            <div key={idx} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center justify-between">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-500 flex items-center justify-center shrink-0">
                                                        <FileText size={20} />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="font-bold text-slate-800 text-sm truncate">{payroll.fileName}</p>
                                                        <p className="text-[10px] text-slate-500">{new Date(payroll.date).toLocaleDateString()}</p>
                                                    </div>
                                                </div>
                                                <a href={payroll.url} target="_blank" rel="noopener noreferrer" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all active:scale-95 shrink-0 ml-2">
                                                    Ver
                                                </a>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Panel: Mis Vacaciones (Read-only driver view) */}
                        {showVacationsPanel && (
                            <DriverVacationsPanel
                                currentDriverId={currentDriverId}
                                onClose={() => setShowVacationsPanel(false)}
                            />
                        )}
                    </div>
                )}
            </main>

            {/* Floating Action Button (Speed Dial) */}
            <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-3" >
                {showFabMenu && (
                    <div className="flex flex-col gap-3 animate-in slide-in-from-bottom-5 fade-in duration-200">
                        <button
                            onClick={() => {
                                setShowFabMenu(false);
                                setIsScannerModalOpen(true);
                            }}
                            className="flex items-center gap-3 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 transition-all font-bold text-sm"
                        >
                            <span className="whitespace-nowrap">Escanear Recogida</span>
                            <div className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <Scan size={20} />
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                setIsPickupModalOpen(true);
                                setShowFabMenu(false);
                            }}
                            className="flex items-center gap-3 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 transition-all font-bold text-sm"
                        >
                            <span className="whitespace-nowrap">Recogerle a</span>
                            <div className="w-10 h-10 bg-purple-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <Package size={20} />
                            </div>
                        </button>
                        <button
                            onClick={() => {
                                setIsNoteModalOpen(true);
                                setShowFabMenu(false);
                            }}
                            className="flex items-center gap-3 bg-white text-slate-700 px-4 py-2 rounded-full shadow-lg border border-slate-100 hover:bg-slate-50 transition-all font-bold text-sm"
                        >
                            <span className="whitespace-nowrap">Nuevo Envío</span>
                            <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center shadow-md">
                                <FileText size={20} />
                            </div>
                        </button>
                    </div>
                )}

                <button
                    onClick={() => setShowFabMenu(!showFabMenu)}
                    className={`w-14 h-14 ${showFabMenu ? 'bg-slate-800 rotate-45' : 'bg-blue-600'} text-white rounded-full shadow-xl shadow-blue-600/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-all duration-300`}
                    aria-label="Crear Nuevo"
                >
                    <Plus size={28} />
                </button>
            </div>

            {/* === MODAL CONFIRMACIÓN JORNADA DE AYER === */}
            {showYesterdayModal && yesterdayPending && (
                <div className="fixed inset-0 z-[200] flex items-end justify-center p-4 pb-8" style={{background:'rgba(15,23,42,0.72)', backdropFilter:'blur(6px)'}}>
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden animate-in slide-in-from-bottom-6 duration-300">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 pt-6 pb-5 text-white">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
                                    <Clock size={20} />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-indigo-200 uppercase tracking-widest">Registro de Jornada</p>
                                    <h3 className="text-lg font-bold leading-tight">Ayer · {new Date(yesterdayPending.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
                                </div>
                            </div>
                        </div>
                        <div className="px-6 py-5 flex flex-col gap-3">
                            <p className="text-sm font-semibold text-slate-800 text-center">
                                ¿Fue tu jornada de ayer la habitual de 8 horas?
                            </p>
                            <button
                                onClick={handleConfirmYesterday}
                                disabled={isConfirmingYesterday}
                                className="w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-60 text-white text-sm font-bold rounded-2xl shadow-lg shadow-indigo-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isConfirmingYesterday ? (
                                    <><span className="animate-spin">⏳</span> Registrando...</>
                                ) : (
                                    <><span>✅</span> Sí</>
                                )}
                            </button>
                            <button
                                onClick={handleDismissYesterday}
                                disabled={isConfirmingYesterday}
                                className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-2xl active:scale-95 transition-all"
                            >
                                No
                            </button>
                        </div>

                    </div>
                </div>
            )}
            {/* ========================================= */}

            <CreateShipmentModal

                isOpen={isNoteModalOpen}
                onClose={() => {
                    setIsNoteModalOpen(false);
                    setPickupToConvert(null);
                    setSsccPrefill(null);
                }}
                onSave={(data) => {
                    onCreateShipment(data, pickupToConvert ? pickupToConvert.id : null);
                    // Nota: el auto-aprendizaje de coords del remitente lo maneja
                    // CreateShipmentModal internamente (capturedGpsRef). No duplicar aquí.
                    setPickupToConvert(null);
                }}
                drivers={drivers}
                clients={clients}
                allPoblaciones={allPoblaciones}
                prefillData={ssccPrefill ? { ...pickupToConvert, clientReference: ssccPrefill } : pickupToConvert}
                tariffs={tariffs}
                articles={articles}
                familyOrder={familyOrder}
                coverageZones={coverageZones}
                defaultCodFee={defaultCodFee}
                isDriver={true}
                allShipments={allShipments}
                onUpdateShipment={onUpdateShipment}
                onUpdateClient={onUpdateClient}
                onAddClient={onAddClient}
                currentDriverId={currentDriverId}
            />

            <CreatePickupModal
                isOpen={isPickupModalOpen}
                onClose={() => setIsPickupModalOpen(false)}
                onSave={onCreateShipment}
                clients={clients}
                allPoblaciones={allPoblaciones}
                allShipments={allShipments}
            />

            <DeliveryConfirmationModal
                isOpen={!!deliveryModalShipment}
                onClose={() => setDeliveryModalShipment(null)}
                shipment={deliveryModalShipment}
                collectionAlert={collectionAlert}
                pendingDebts={pendingDebts}
                sameClientStops={sameClientStops}
                clients={clients}
                zoom={zoom}
                onConfirm={handleDeliveryConfirm}
            />

            {/* Mapa de ruta optimizada */}
            {showRouteMap && (
                <RouteMapModal
                    route={localRoute}
                    driverCoords={(() => {
                        // La posición del conductor se guarda en currentLat/currentLng
                        // (es lo que escribe el rastreador y lo que lee Tracking).
                        // Aquí se buscaba en latitude/longitude, que no existen: esto
                        // era SIEMPRE null, y por eso "Ir" y "Ruta completa" abrían
                        // Google Maps sin poner tu posición como origen.
                        const driver = drivers?.find(d => String(d.id) === String(currentDriverId));
                        const lat = Number(driver?.currentLat);
                        const lon = Number(driver?.currentLng);
                        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
                        return { lat, lon };
                    })()}
                    onClose={() => setShowRouteMap(false)}
                />
            )}

            <ScannerModal 
                isOpen={isScannerModalOpen}
                onClose={() => { setIsScannerModalOpen(false); setActiveTab('assign'); }}
                onScan={async (id) => {
                    const rawId = (id || '').trim().toUpperCase();
                    if (!rawId) return;

                    // Separar código base de envío del índice del bulto
                    let baseId = rawId;
                    let packageIndex = null;
                    const match = rawId.match(/^((?:SUM|TR)-\d+)(?:-(\d+))?$/i);
                    if (match) {
                        baseId = match[1];
                        if (match[2]) packageIndex = parseInt(match[2], 10);
                    } else if (rawId.includes('-')) {
                        const parts = rawId.split('-');
                        const lastPart = parts[parts.length - 1];
                        if (!isNaN(lastPart)) {
                            packageIndex = parseInt(lastPart, 10);
                            baseId = parts.slice(0, parts.length - 1).join('-');
                        }
                    }

                    setLearningMessage(`Buscando envío ${baseId}...`);

                    // 1. Intentar encontrarlo en memoria local
                    let ship = (allShipments || []).find(s => (s.id || '').toUpperCase() === baseId);
                    
                    // 2. Si no está en memoria, buscarlo directamente en el servidor (nube)
                    if (!ship) {
                        try {
                            const { data, error } = await supabase
                                .from('shipments')
                                .select('*')
                                .eq('id', baseId)
                                .maybeSingle();
                            
                            if (data) {
                                ship = { ...data.data, id: data.id };
                            }
                        } catch (err) {
                            console.error("Error buscando en la nube:", err);
                        }
                    }

                    // 3. Si no es un SUM-XXX o TR-XXX, buscar por referencia del cliente (QR externo)
                    if (!ship) {
                        const refSearch = (id || '').trim(); // usar el código original SIN toUpperCase para referencias numéricas
                        const refSearchUpper = refSearch.toUpperCase();
                        // Limpiar posibles prefijos GS1 (00), (02), etc.
                        const refCleaned = refSearch.replace(/^\(?\d{2}\)?/, '').trim();
                        
                        // Buscar en memoria local - múltiples estrategias
                        ship = (allShipments || []).find(s => {
                            if (!s.clientReference) return false;
                            const sRef = String(s.clientReference).trim();
                            const sRefUpper = sRef.toUpperCase();
                            // Coincidencia exacta
                            if (sRefUpper === refSearchUpper) return true;
                            // El QR escaneado contiene la referencia
                            if (refSearchUpper.includes(sRefUpper) || sRefUpper.includes(refSearchUpper)) return true;
                            // Comparar versión limpia (sin prefijo GS1)
                            if (refCleaned && (sRefUpper === refCleaned.toUpperCase() || sRefUpper.includes(refCleaned.toUpperCase()))) return true;
                            return false;
                        });

                        // Si no está en local, buscar en Supabase
                        if (!ship) {
                            try {
                                // Intentar búsqueda exacta primero
                                let { data } = await supabase
                                    .from('shipments')
                                    .select('*')
                                    .contains('data', { clientReference: refSearch })
                                    .limit(1);
                                // Si no encuentra, probar con el código limpio
                                if ((!data || data.length === 0) && refCleaned !== refSearch) {
                                    const res = await supabase
                                        .from('shipments')
                                        .select('*')
                                        .contains('data', { clientReference: refCleaned })
                                        .limit(1);
                                    data = res.data;
                                }
                                if (data && data.length > 0) {
                                    ship = { ...data[0].data, id: data[0].id };
                                }
                            } catch (err) {
                                console.error("Error buscando por referencia:", err);
                            }
                        }
                        if (ship) {
                            baseId = ship.id; // usar el ID real del envío SUM
                            setLearningMessage(`📎 Referencia externa → Envío ${baseId}`);
                        }
                    }

                    if (ship) {
                        // Si el envío vino de la nube y no estaba en allShipments,
                        // primero inyectarlo completo para que onUpdateShipment no pierda datos
                        const existsLocally = (allShipments || []).some(s => (s.id || '').toUpperCase() === baseId);
                        if (!existsLocally) {
                            // Inyectar envío completo antes de actualizarlo parcialmente
                            await onUpdateShipment(ship.id, ship);
                        }

                        const driverName = drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name || 'Conductor';
                        
                        let currentScannedPackages = Array.isArray(ship.scannedPackages) ? [...ship.scannedPackages] : [];
                        if (packageIndex !== null && !currentScannedPackages.includes(packageIndex)) {
                            currentScannedPackages.push(packageIndex);
                        } else if (packageIndex === null && currentScannedPackages.length === 0) {
                            currentScannedPackages.push(1);
                        }

                        // Actualizar estado para registrar que el conductor lo ha escaneado
                        // Si el envío estaba en Incidencia o ya era Pendiente de asignar, forzar a Pendiente de asignar
                        const shouldResetStatus = ship.status === 'Pendiente de asignar' 
                            || ship.incidentStatus === 'active' 
                            || ship.incidentStatus === 'resolved';
                        
                        await onUpdateShipment(ship.id, {
                            pickedUpBy: `Cond. ${driverName}`,
                            pickedUpById: currentDriverId,
                            scannedPackages: currentScannedPackages,
                            status: shouldResetStatus ? 'Pendiente de asignar' : ship.status,
                            incidentStatus: 'resolved',
                            // Quien tiene los bultos en la mano manda: si otro conductor había
                            // devuelto este albarán a Asignar, deja de ser suyo en exclusiva y
                            // pasa a verlo el que acaba de escanearlo.
                            returnedToAssignById: null
                        });
                        
                        setLearningMessage(`¡Bulto registrado! Envío ${baseId}.`);
                        setTimeout(() => setLearningMessage(null), 3000);
                    } else {
                        // 🛡️ CAPA 2: El código escaneado no existe en el sistema.
                        // Puede ser un SSCC de Proservice que se imprimió a la impresora equivocada.
                        // En vez de un error muerto, abrimos el modal de rescate.
                        setIsScannerModalOpen(false);
                        setUnregisteredSscc(rawId);
                    }
                }}
            />

            {/* ======= CAPA 2: MODAL DE RESCATE — SSCC NO REGISTRADO ======= */}
            {unregisteredSscc && (
                <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[9990] flex items-end justify-center p-4 animate-in fade-in">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in slide-in-from-bottom-8 duration-300">
                        {/* Header */}
                        <div className="p-6 bg-gradient-to-r from-orange-500 to-amber-500 text-white">
                            <div className="text-4xl mb-2">📦</div>
                            <h2 className="text-xl font-extrabold">Envío no registrado</h2>
                            <p className="text-orange-100 text-sm mt-1">Este paquete no está en el sistema. ¿Lo creamos ahora?</p>
                        </div>

                        {/* Código escaneado */}
                        <div className="px-6 pt-4 pb-2">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Código escaneado</p>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-mono text-sm font-bold text-slate-700 break-all">
                                {unregisteredSscc}
                            </div>
                            <p className="text-xs text-slate-400 mt-2">
                                💡 Puede que se haya imprimido la etiqueta a la impresora equivocada. Crea el albarán ahora en 10 segundos.
                            </p>
                        </div>

                        {/* Botones de acción */}
                        <div className="p-6 space-y-3">
                            <button
                                onClick={() => {
                                    const currentSscc = unregisteredSscc;
                                    setUnregisteredSscc(null);
                                    setSsccPrefill(currentSscc);
                                    setIsNoteModalOpen(true);
                                }}
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold py-4 rounded-2xl transition-all active:scale-[0.98] shadow-lg shadow-orange-400/30 text-sm uppercase tracking-wide"
                            >
                                ✏️ Crear albarán ahora
                            </button>
                            <button
                                onClick={() => {
                                    setUnregisteredSscc(null);
                                    setIsScannerModalOpen(true);
                                }}
                                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 rounded-2xl transition-all text-sm"
                            >
                                🔄 Escanear otro código
                            </button>
                            <button
                                onClick={() => setUnregisteredSscc(null)}
                                className="w-full text-slate-400 text-xs py-2 hover:text-slate-600 transition-colors"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======= MODAL DE ALERTAS OBLIGATORIAS PARA EL CONDUCTOR ======= */}
            {showAlertModal && pendingAlerts.length > 0 && (
                <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">
                        {/* Header */}
                        <div className="p-6 bg-gradient-to-r from-amber-500 to-orange-500 text-white">
                            <div className="text-4xl mb-2">{pendingAlerts[0].icon || '🔔'}</div>
                            <h2 className="text-xl font-extrabold">{pendingAlerts[0].title}</h2>
                            {pendingAlerts.length > 1 && (
                                <p className="text-amber-100 text-xs mt-1 font-bold">{pendingAlerts.length} avisos pendientes</p>
                            )}
                        </div>
                        
                        {/* Body */}
                        <div className="p-6">
                            <p className="text-slate-700 text-sm leading-relaxed whitespace-pre-line">
                                {pendingAlerts[0].message}
                            </p>
                        </div>
                        
                        {/* Action */}
                        <div className="p-6 pt-0">
                            <button
                                onClick={() => handleAcknowledgeAlert(pendingAlerts[0].id)}
                                className="w-full bg-green-600 hover:bg-green-700 text-white font-extrabold py-4 rounded-xl transition-all active:scale-[0.98] shadow-lg shadow-green-500/30 text-sm uppercase tracking-wide"
                            >
                                {pendingAlerts[0].confirmText || '✅ Entendido, continuar'}
                            </button>
                            <p className="text-center text-[10px] text-slate-400 mt-3 font-bold uppercase">
                                Debes confirmar para continuar usando la app
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function DriverDashboard(props) {
    return (
        <ErrorBoundary>
            <DriverDashboardContent {...props} />
        </ErrorBoundary>
    );
}
