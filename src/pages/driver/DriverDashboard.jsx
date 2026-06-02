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
  TouchSensor,
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
import { uploadProof } from '../../utils/storage';
import ScannerModal from '../../components/delivery/ScannerModal';
import { RUTAS_MAESTRAS, DEFAULT_RUTAS } from '../../data/rutas';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { getQueueLength } from '../../utils/offlineQueue';
import { getPackagesCount } from '../../utils/shipmentUtils';
import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import RouteMapModal from '../../components/driver/RouteMapModal';

const normalizeClientName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "); // collapse multiple spaces
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
const ShipmentCardUI = React.memo(({ 
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
    dragOverlay = false
}) => {
    return (
        <div className={`relative ${dragOverlay ? 'w-full' : 'mb-3'} group overflow-hidden rounded-xl`}>
             {!dragOverlay && (
                 <div 
                    className="absolute inset-0 bg-gradient-to-r from-blue-600 to-indigo-700 flex items-center pl-6 transition-all duration-200"
                    style={{ 
                        opacity: isSwiping ? Math.min(swipeX / 100, 1) : 0,
                        transform: isSwiping ? 'scale(1)' : 'scale(0.95)'
                    }}
                >
                    <div className="flex items-center gap-3 text-white">
                        <div className="bg-white/20 p-2 rounded-full animate-spin-slow">
                            <RotateCcw size={22} />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-80">Acción Directa</span>
                            <span className="text-sm font-extrabold uppercase tracking-tight">Devolver a Asignar</span>
                        </div>
                    </div>
                </div>
             )}

            <div
                onClick={(e) => {
                    if (dragOverlay) return;
                    if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT' && e.target.closest('a') === null && e.target.closest('button') === null) {
                        setSelectedShipment(stop);
                        setIsDetailsModalOpen(true);
                    }
                }}
                className={`item-reparto bg-white p-4 rounded-xl shadow-sm border relative mb-0 select-none transition-all duration-200
                    ${isDragging && !dragOverlay ? 'opacity-0' : 'opacity-100'}
                    ${dragOverlay ? 'shadow-2xl ring-1 ring-blue-200 scale-[1.02] bg-white border-blue-200' : 'border-slate-100'}
                    ${isSwiping ? 'shadow-xl ring-1 ring-blue-500/20' : ''}`}
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
                        src={(() => {
                            const normalize = (n) => String(n || '').toLowerCase().trim();
                            const sName = normalize(stop.client);
                            const dName = normalize(stop.destinationName || stop.client);
                            const aLabel = normalize(stop.agencyLabel);
                            if (stop.agencyLogoUrl && stop.agencyLogoUrl !== '/logo-sum.svg') return stop.agencyLogoUrl;
                            if (clients && clients.length > 0) {
                                const clientMatch = clients.find(c => {
                                    const cName = normalize(c.name);
                                    const cLegal = normalize(c.legalName);
                                    const cTag = normalize(c.agencyLabel);
                                    return (cName && (cName === sName || cName === dName)) || 
                                           (cLegal && (cLegal === sName || cLegal === dName)) ||
                                           (aLabel && cTag === aLabel && aLabel !== 'sum especial');
                                });
                                if (clientMatch?.agencyLogoUrl) return clientMatch.agencyLogoUrl;
                            }
                            if (aLabel.includes('tsb') || sName.includes('tsb') || dName.includes('tsb')) return '/logos/tsb_logo.png'; 
                            if (aLabel.includes('xpo') || sName.includes('xpo') || dName.includes('xpo')) return '/logos/xpo_logo.png';
                            if (aLabel.includes('txt') || sName.includes('txt') || dName.includes('txt')) return '/logos/txt_logo.png';
                            return '/logo-sum.svg';
                        })()} 
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
                                        const label = (stop.agencyLabel || '').toUpperCase();
                                        const isTSB = label.includes('TSB') || (stop.client || '').toUpperCase().includes('TSB');
                                        const isXPO = label.includes('XPO') || (stop.client || '').toUpperCase().includes('XPO');
                                        const isTXT = label.includes('TXT') || (stop.client || '').toUpperCase().includes('TXT');
                                        
                                        return (
                                            <>
                                                {isTSB && <span className="text-[9px] font-extrabold bg-blue-600 text-white px-1.5 py-0.5 rounded shadow-sm">AGENCIA TSB</span>}
                                                {isXPO && <span className="text-[9px] font-extrabold bg-amber-400 text-black px-1.5 py-0.5 rounded shadow-sm">AGENCIA XPO</span>}
                                                {isTXT && <span className="text-[9px] font-extrabold bg-red-600 text-white px-1.5 py-0.5 rounded shadow-sm">AGENCIA TXT</span>}
                                                {Array.isArray(stop.scannedPackages) && stop.scannedPackages.length > 0 && (
                                                    <span className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-sm ${
                                                        stop.scannedPackages.length >= getPackagesCount(stop)
                                                            ? 'bg-green-600 text-white'
                                                            : 'bg-orange-500 text-white'
                                                    }`}>
                                                        {stop.scannedPackages.length}/{getPackagesCount(stop)} BULTOS ESCANEADOS
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
                                            href={mapsHref}
                                            target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                            className="p-2.5 bg-white text-blue-600 rounded-xl shadow-md border border-blue-100 hover:bg-blue-50 transition-all active:scale-95 flex items-center justify-center font-bold gap-2 text-xs"
                                            title={hasCoords ? 'Calcular Ruta (GPS exacto)' : 'Buscar dirección en Maps'}
                                        >
                                            <MapPin size={20} />
                                        </a>
                                    );
                                })()}
                                {(stop.type === 'Recogida' ? stop.originPhone : stop.destinationPhone) && (
                                    <a
                                        href={`tel:${stop.type === 'Recogida' ? stop.originPhone : stop.destinationPhone}`}
                                        onClick={(e) => e.stopPropagation()}
                                        className="p-2.5 bg-white text-emerald-600 rounded-xl shadow-md border border-emerald-100 hover:bg-emerald-50 transition-all active:scale-95 flex items-center justify-center"
                                    >
                                        <Phone size={20} />
                                    </a>
                                )}
                                <div className="relative">
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
                                const customAmt = stop.customAmount !== undefined ? stop.customAmount : stop.amount;
                                const porteValNum = parseAmount(customAmt);
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
                                          <span className="text-xs font-extrabold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-100 shadow-sm flex items-center gap-1.5 ring-4 ring-emerald-500/5">
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
    const startX = useRef(0);

    const sortable = useSortable({ id: stop.id, disabled: isSwiping });
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = sortable;

    const handleTouchStart = (e) => { startX.current = e.touches[0].clientX; };
    const handleTouchMove = (e) => {
        const deltaX = e.touches[0].clientX - startX.current;
        if (deltaX > 0 && !isDragging) {
            setIsSwiping(true);
            setSwipeX(deltaX);
        }
    };
    const handleTouchEnd = () => {
        if (swipeX > 150) {
            if (window.navigator.vibrate) window.navigator.vibrate(50);
            props.onUnassign(stop);
        }
        setSwipeX(0);
        setIsSwiping(false);
    };

    const style = {
        transform: isSwiping ? `translateX(${swipeX}px)` : CSS.Transform.toString(transform),
        transition: isDragging || isSwiping ? 'none' : transition,
        zIndex: isDragging ? 2 : undefined,
        willChange: 'transform, opacity',
        touchAction: 'pan-y'
    };

    return (
        <div ref={setNodeRef} style={style} 
             onTouchStart={handleTouchStart} 
             onTouchMove={(e) => { handleTouchMove(e); if (swipeX > 30) e.stopPropagation(); }}
             onTouchEnd={handleTouchEnd}
        >
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



const TimeLogSection = ({ currentDriverId, driverName, handleLogoutWithSafety }) => {
    const [status, setStatus] = useState('loading'); // loading, pending_in, working, finished
    const [logId, setLogId] = useState(null);

    useEffect(() => {
        const checkStatus = async () => {
            if (!currentDriverId) return;
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('time_logs')
                    .select('*')
                    .eq('driver_id', currentDriverId)
                    .eq('date', today)
                    .order('clock_in', { ascending: false })
                    .limit(1);

                if (error) throw error;
                const log = data && data.length > 0 ? data[0] : null;

                if (!log) {
                    setStatus('pending_in');
                } else if (!log.clock_out) {
                    setStatus('working');
                    setLogId(log.id);
                } else {
                    setStatus('finished');
                }
            } catch (e) {
                console.error("Error fetching time log status:", e);
                setStatus('pending_in');
            }
        };
        checkStatus();
    }, [currentDriverId]);

    const handleClockIn = async () => {
        try {
            const today = new Date().toISOString().split('T')[0];
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
        if (!window.confirm('¿Seguro que has terminado tu jornada? Esto registrará tu hora de salida.')) return;
        try {
            if (logId) {
                await supabase.from('time_logs').update({
                    clock_out: new Date().toISOString()
                }).eq('id', logId);
            } else {
                const today = new Date().toISOString().split('T')[0];
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

    if (status === 'finished') {
        return (
            <div className="w-full bg-slate-100 text-slate-500 font-bold py-4 rounded-xl shadow-inner flex flex-col items-center justify-center gap-2 mb-8">
                <CheckCircle size={24} className="text-slate-400" />
                <span>Jornada Finalizada por hoy</span>
                <button onClick={handleLogoutWithSafety} className="mt-2 text-xs text-red-500 hover:underline">Cerrar Sesión</button>
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
                                            const { data: driverRes } = await supabase.from('drivers').select('*').eq('id', currentDriverId).single();
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
                                            const { data: driverRes } = await supabase.from('drivers').select('*').eq('id', currentDriverId).single();
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

function DriverDashboardContent({ onLogout, allShipments, currentDriverId, onAssignShipment, drivers, clients, allPoblaciones, onCreateShipment, onStatusChange, onUpdateShipment, onUpdateClient, onAddClient, tariffs, articles, familyOrder, coverageZones, defaultCodFee, routes, routeKnowledge, onUpdateRouteKnowledge, isInitialLoading, gpsIntervalMinutes, driverAlerts, alertAcknowledgements = [], driverNamePreference = 'both' }) {
    console.log('DriverDashboard Render', { currentDriverId, drivers: drivers?.length, shipments: allShipments?.length, clients: clients?.length });

    const getDriverDisplayName = (driver) => {
        if (!driver) return '';
        const name = driver.name || '';
        const alias = driver.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };


    const [activeTab, setActiveTab] = useState('route');
    const hasClockedInRef = useRef(false);

    // === FICHAJE AUTOMÁTICO AL ENTRAR ===
    useEffect(() => {
        const autoClockIn = async () => {
            if (!currentDriverId || !drivers || drivers.length === 0) return;
            if (hasClockedInRef.current) return;
            hasClockedInRef.current = true;
            try {
                const today = new Date().toISOString().split('T')[0];
                const { data, error } = await supabase
                    .from('time_logs')
                    .select('id')
                    .eq('driver_id', currentDriverId)
                    .eq('date', today)
                    .limit(1);

                if (error) {
                    console.error("Error auto-clock-in check:", error);
                    return;
                }

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
    // ====================================

    const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
    const currentDriver = useMemo(() => 
        drivers?.find(d => String(d.id) === String(currentDriverId)),
    [drivers, currentDriverId]);

    const [gpsStatus, setGpsStatus] = useState('idle'); // 'idle', 'requesting', 'success', 'denied', 'error_unsecure'

    // === RASTREADOR GPS AUTOMÁTICO + BAJO DEMANDA ===
    // Envía GPS automáticamente cada 2 min + al entrar + al volver a la app
    // Así la oficina siempre tiene una posición reciente al pulsar ⚡
    const lastRequestTrigger = useRef(currentDriver?.locationRequestTrigger);
    const [gpsLog, setGpsLog] = useState([]);
    const gpsIntervalRef = useRef(null);
    const gpsDeniedRef = useRef(false); // Evitar alertas repetidas
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
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const { latitude, longitude } = position.coords;
                try {
                    const drv = driversRef.current.find(d => String(d.id) === String(currentDriverId));
                    if (!drv) return;

                    const updatedData = { 
                        ...drv, 
                        currentLat: latitude, 
                        currentLng: longitude, 
                        lastGpsUpdate: new Date().toISOString() 
                    };
                    await supabase.from('drivers').update({
                        data: updatedData
                    }).eq('id', currentDriverId);
                    
                    setGpsStatus('success');
                    if (!silent) addLog("✅ Ubicación enviada con éxito");
                } catch (e) {
                   console.error("Fallo al sincronizar GPS:", e);
                   if (!silent) { setGpsStatus('denied'); addLog("❌ Error al guardar en base de datos"); }
                }
            },
            (error) => {
                console.warn("GPS ERROR:", error.message);
                if (!silent) {
                    setGpsStatus('denied');
                    addLog("❌ Error GPS: " + error.message);
                }
                if (error.code === error.PERMISSION_DENIED && !gpsDeniedRef.current) {
                    gpsDeniedRef.current = true;
                    setGpsStatus('denied');
                    alert("Aviso: Has denegado el permiso de ubicación. El mapa de la oficina no podrá localizarte.");
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 15000,
                maximumAge: 30000 
            }
        );
    }, [currentDriverId]);

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

    useEffect(() => {
        const key = `drv_collections_${currentDriverId}_${todayStr}`;
        try {
            localStorage.setItem(key, JSON.stringify(collectedCollections));
        } catch (e) {
            console.warn("No se pudo guardar la colección localmente por límite de cuota iOS", e);
        }
    }, [collectedCollections, currentDriverId, todayStr]);

    const [isPickupModalOpen, setIsPickupModalOpen] = useState(false);
    const [isIncidentModalOpen, setIsIncidentModalOpen] = useState(false);
    const [incidentInitialReason, setIncidentInitialReason] = useState('');
    const [incidentShipment, setIncidentShipment] = useState(null);
    const [showFabMenu, setShowFabMenu] = useState(false);
    const [showPayrollsModal, setShowPayrollsModal] = useState(false);
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
        localStorage.setItem('drv_zoom', zoom.toString());
    }, [zoom]);

    const [whatsappPrompt, setWhatsappPrompt] = useState(null); // { shipment, phone }
    const [openDeliveredDocMenuId, setOpenDeliveredDocMenuId] = useState(null);
    const [openAssignDocMenuId, setOpenAssignDocMenuId] = useState(null);

    const handleUnassignShipment = async (shipment) => {
        try {
            // Optimistic UI update
            setLocalRoute(prev => prev.filter(s => s.id !== shipment.id));
            
            // Persist the unassignment
            await onUpdateShipment(shipment.id, {
                status: 'Pendiente de asignar',
                assignedDriverId: null,
                updatedAt: new Date().toISOString()
            });

            console.log("Shipment returned to assign pool:", shipment.id);
        } catch (err) {
            console.error("Failed to unassign shipment:", err);
            // Revert on error if needed, but the realtime sync will handle it
        }
    };

    const handleWhatsAppShare = (shipment, manualPhone = null) => {
        // Correct logic: If it's a pickup, use origin phone. If it's a delivery, use destination phone.
        const targetPhone = shipment.type === 'Recogida' ? shipment.originPhone : shipment.destinationPhone;
        const phone = manualPhone || targetPhone;
        
        if (!phone && manualPhone === null) {
            setWhatsappPrompt({ shipment, phone: '' });
            return;
        }

        const cleanPhone = (phone || '').replace(/\s+/g, '').replace('+', '');
        if (!cleanPhone && manualPhone !== null) {
            alert("Por favor, introduce un número de teléfono válido.");
            return;
        }

        // --- PERSISTENCE LOGIC (Background) ---
        if (manualPhone && cleanPhone) {
            (async () => {
                try {
                    const shipmentUpdates = {};
                    if (shipment.type === 'Recogida') shipmentUpdates.originPhone = manualPhone;
                    else shipmentUpdates.destinationPhone = manualPhone;
                    shipmentUpdates.updatedAt = new Date().toISOString();
                    
                    await supabase.from('shipments').update(shipmentUpdates).eq('id', shipment.id);

                    const targetName = (shipment.type === 'Recogida' ? (shipment.originName || shipment.client) : (shipment.destinationName || shipment.client));
                    const normalizedTarget = normalizeClientName(targetName);
                    
                    if (normalizedTarget && clientsMap.size > 0) {
                        const matchedClient = clientsMap.get(normalizedTarget);
                        if (matchedClient) {
                            (async () => {
                                try {
                                    const { id: cid, ...cleanData } = matchedClient;
                                    const updatedData = { ...cleanData };
                                    if (shipment.type === 'Recogida') updatedData.phone = manualPhone;
                                    else updatedData.destinationPhone = manualPhone;
                                    
                                    await supabase.from('clients').update({ data: updatedData }).eq('id', cid);
                                } catch (ce) { console.error("Client phone sync failed:", ce); }
                            })();
                        }
                    }
                } catch (err) {
                    console.error("Persistence background error:", err);
                }
            })();
        }

        // 1. Immediately close prompt modal
        setWhatsappPrompt(null);

        // 2. Prepare message and Trigger Redirect
        const date = shipment.date || new Date().toLocaleDateString('es-ES');
        const origin = shipment.originName || shipment.client;
        const dest = shipment.destinationName || shipment.client;
        const status = shipment.status || 'Pendiente';
        
        const hasReembolso = parseFloat(String(shipment.codAmount || '0').replace(',', '.').replace(/[^0-9.-]/g, '')) > 0;
        const codText = hasReembolso ? `*Reembolso a cobrar:* ${shipment.codAmount} €%0A` : '';

        const normalize = (val) => String(val || '').toLowerCase().trim();
        const originClient = clientsMap?.get(normalizeClientName(shipment.originName || shipment.client));
        const destClient = clientsMap?.get(normalizeClientName(shipment.destinationName || shipment.client));
        
        const mainBillingType = normalize(shipment.billingType || originClient?.billingType || '');
        const destBillingType = normalize(shipment.destinationBillingType || destClient?.billingType || '');
        
        let isSecret = false;
        if (mainBillingType.includes('habitual') || mainBillingType.includes('diar') || mainBillingType.includes('libre') || mainBillingType.includes('contado') || mainBillingType.includes('presupuesto')) isSecret = true;
        if (destBillingType.includes('habitual') || destBillingType.includes('diar') || destBillingType.includes('libre') || destBillingType.includes('contado') || destBillingType.includes('presupuesto')) isSecret = true;

        const titleText = isSecret ? `*JUSTIFICANTE DE ENTREGA*` : `*JUSTIFICANTE SUMTRANS LOGISTICA*`;

        const message = `${titleText}%0A%0A` +
            `*REF:* ${shipment.id}%0A` +
            `*Fecha:* ${date}%0A` +
            `*Remitente:* ${origin}%0A` +
            `*Destinatario:* ${dest}%0A` +
            `*Estado:* ${status}%0A` +
            codText +
            `%0A` +
            `Gracias por su confianza.`;

        let finalPhone = cleanPhone;
        // Si tiene 9 dígitos y empieza por 6, 7 o 9 (típico de España), añadimos el 34 si no lo tiene
        if (cleanPhone.length === 9 && (cleanPhone.startsWith('6') || cleanPhone.startsWith('7') || cleanPhone.startsWith('9'))) {
            finalPhone = `34${cleanPhone}`;
        } else if (cleanPhone.length === 9) {
            // Por si acaso es un fijo u otro no detectado pero de 9 cifras
            finalPhone = `34${cleanPhone}`;
        }
        
        // window.location.assign is very reliable on mobile to trigger app schemes like whatsapp://
        window.location.assign(`https://wa.me/${finalPhone}?text=${message}`);
    };

    // AI / Smart Features State
    const [isOptimizing, setIsOptimizing] = useState(false);
    const [showRouteMap, setShowRouteMap] = useState(false);
    const [routeOptimized, setRouteOptimized] = useState(false);
    const [learningMessage, setLearningMessage] = useState(null);

    // Tracks which collection items are being processed (Optimistic UI)

    // dnd-kit Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 200,
                tolerance: 5,
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
                        .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
                        .label { font-weight: bold; }
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
                            <span class="label">Recibe:</span>
                            <span>${collection.sender || '__________________'}</span>
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
                            <div class="card-row"><span class="lbl">Recibe:</span><span>__________________________</span></div>
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
                    .card-row { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
                    .lbl { font-weight: bold; }
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
    const availableShipments = (allShipments || []).filter(s => 
        s && 
        s.status === 'Pendiente de asignar' && 
        (
            Number(s.createdById) === Number(currentDriverId) ||
            Number(s.pickedUpById) === Number(currentDriverId)
        )
    );
    
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

    // --- APRENDIZAJE POR POSICIÓN MEDIA ---
    // Formato: { "cabra": { "mamaki": { avg: 1.5, count: 10 }, "ferreteria": { avg: 2.3, count: 8 } } }
    const [positionLearning, setPositionLearning] = useState(() => {
        try {
            // 1. Try local cache first
            const saved = localStorage.getItem(`drv_pos_learn_${currentDriverId}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Object.keys(parsed).length > 0) return parsed;
            }
            // 2. Try cloud data for this driver
            const cloudData = routeKnowledge?.byDriver?.[String(currentDriverId)];
            if (cloudData && Object.keys(cloudData).length > 0) {
                localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(cloudData));
                return cloudData;
            }
            // 3. Inherit route master if available
            const activeRoutes = routes && routes.length > 0 ? routes : [];
            const myRoute = activeRoutes.find(r => String(r.conductorId) === String(currentDriverId));
            if (myRoute) {
                const masterData = routeKnowledge?.masterByRoute?.[myRoute.id];
                if (masterData) {
                    const { _setBy, _setAt, ...cleanMaster } = masterData;
                    if (Object.keys(cleanMaster).length > 0) {
                        localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(cleanMaster));
                        console.log('📚 Inherited master knowledge for route:', myRoute.nombre);
                        return cleanMaster;
                    }
                }
            }
            return {};
        } catch { return {}; }
    });
    const deliveredTodayRef = useRef([]); // Track today's deliveries in order for learning
    const syncTimeoutRef = useRef(null); // Debounce cloud sync

    // Called after each delivery to record position
    const recordDeliveryPosition = (shipment) => {
        if (!shipment) return;
        const norm = (v) => String(v || '').trim().toLowerCase();
        const clientName = norm(shipment.destinationName || shipment.client);
        const city = norm(shipment.destinationCity || shipment.originCity || '');
        if (!clientName || !city) return;

        // Add to today's list
        deliveredTodayRef.current.push({ clientName, city });

        // Calculate this client's position within their city today
        const cityDeliveries = deliveredTodayRef.current.filter(d => d.city === city);
        const positionInCity = cityDeliveries.length; // 1-based position

        setPositionLearning(prev => {
            const cityData = prev[city] || {};
            const existing = cityData[clientName] || { avg: positionInCity, count: 0 };
            const newCount = existing.count + 1;
            // Weighted moving average (recent deliveries weigh more)
            const newAvg = existing.avg + (positionInCity - existing.avg) / Math.min(newCount, 20);
            const updated = {
                ...prev,
                [city]: {
                    ...cityData,
                    [clientName]: { avg: Math.round(newAvg * 100) / 100, count: newCount }
                }
            };
            try {
                localStorage.setItem(`drv_pos_learn_${currentDriverId}`, JSON.stringify(updated));
            } catch (e) { console.warn('Position learning save error:', e); }

            // Debounced sync to cloud (every 30 seconds max)
            if (onUpdateRouteKnowledge) {
                clearTimeout(syncTimeoutRef.current);
                syncTimeoutRef.current = setTimeout(() => {
                    const newKnowledge = {
                        ...routeKnowledge,
                        byDriver: {
                            ...(routeKnowledge?.byDriver || {}),
                            [String(currentDriverId)]: updated
                        }
                    };
                    onUpdateRouteKnowledge(newKnowledge);
                    console.log('☁️ Learning synced to cloud');
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

    // Sync learning on unmount (driver closes app)
    useEffect(() => {
        return () => {
            clearTimeout(syncTimeoutRef.current);
            if (onUpdateRouteKnowledge && positionLearning && Object.keys(positionLearning).length > 0) {
                const newKnowledge = {
                    ...routeKnowledge,
                    byDriver: {
                        ...(routeKnowledge?.byDriver || {}),
                        [String(currentDriverId)]: positionLearning
                    }
                };
                onUpdateRouteKnowledge(newKnowledge);
            }
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const getDistance = (lat1, lon1, lat2, lon2) => {
        if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    // ═══════════════════════════════════════════════════════════════════
    // OPTIMIZADOR DE RUTA v4 - Agrupación por pueblos + prioridad + aprendizaje
    // ═══════════════════════════════════════════════════════════════════
    const handleSmartSort = () => {
        setIsOptimizing(true);
        setLearningMessage("Optimizando ruta v4...");

        // Try to get GPS first
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const { latitude, longitude } = pos.coords;
                proceedWithSort(latitude, longitude);
            },
            () => {
                // Fallback if GPS disabled
                proceedWithSort(null, null);
            },
            { timeout: 5000, enableHighAccuracy: true }
        );

        function proceedWithSort(myLat, myLon) {
            setTimeout(() => {
                try {
                    if (!localRoute || localRoute.length === 0) return;

                    const norm = (val) => String(val || '').trim().toLowerCase();

                    // ── Helpers ──
                    const getClientData = (s) => {
                        const targetName = s.type === 'Recogida' ? s.client : (s.destinationName || s.client);
                        if (!targetName) return null;
                        return clientsMap.get(norm(targetName));
                    };

                    const getResolvedCoords = (s, clientRecord) => {
                        if (clientRecord?.coordinates && String(clientRecord.coordinates).trim().length > 0) return clientRecord.coordinates;
                        if (s.deliveryCoordinates) return s.deliveryCoordinates;
                        const sCoords = s.type === 'Recogida' ? s.originCoordinates : s.destinationCoordinates;
                        if (sCoords && String(sCoords).includes(',')) return sCoords;
                        return null;
                    };

                    const parseCoords = (coordStr) => {
                        if (!coordStr || !String(coordStr).includes(',')) return null;
                        const [lat, lon] = String(coordStr).split(',').map(Number);
                        if (isNaN(lat) || isNaN(lon)) return null;
                        return { lat, lon };
                    };

                    const isAgency = (s, clientRecord) => {
                        const label = norm(s.agencyLabel || '');
                        if (label && label !== 'sum especial') return true;
                        if (clientRecord?.priority === 'normal') return true;
                        return false;
                    };

                    // ── Enrich all shipments ──
                    const enriched = localRoute.map(s => {
                        const clientRecord = getClientData(s);
                        const coords = getResolvedCoords(s, clientRecord);
                        return {
                            ...s,
                            _coords: coords,
                            _parsedCoords: parseCoords(coords),
                            _priority: clientRecord?.priority || 'urgent',
                            _isAgency: isAgency(s, clientRecord),
                            _city: norm(s.destinationCity || s.originCity || ''),
                        };
                    });

                    // ── Punto de inicio para nearest-neighbor ──
                    // Si hay GPS del conductor, úsalo. Si no, usa el centroide de todos los puntos GPS de la ruta.
                    const allParsed = enriched.filter(s => s._parsedCoords).map(s => s._parsedCoords);
                    let startLat = myLat;
                    let startLon = myLon;
                    if ((!startLat || !startLon) && allParsed.length > 0) {
                        startLat = allParsed.reduce((s, c) => s + c.lat, 0) / allParsed.length;
                        startLon = allParsed.reduce((s, c) => s + c.lon, 0) / allParsed.length;
                    }

                    // ── FASE 1: Determinar turno y orden de pueblos ──
                    const currentHour = new Date().getHours();
                    const isMorningShift = currentHour < 14;
                    const activeRoutes = routes && routes.length > 0 ? routes : DEFAULT_RUTAS;
                    const activeRoute = activeRoutes.find(r => 
                        String(r.conductorId) === String(currentDriverId) || r.id === currentDriver?.routeId
                    );

                    const morningTowns = (activeRoute?.poblacionesManana || activeRoute?.poblaciones || []).map(t => t.trim());
                    const afternoonTowns = (activeRoute?.poblacionesTarde || []).map(t => t.trim());

                    // Ordered town list: current shift first, then opposite shift
                    const primaryTowns = isMorningShift ? morningTowns : afternoonTowns;
                    const secondaryTowns = isMorningShift ? afternoonTowns : morningTowns;
                    const allRouteTowns = [...primaryTowns, ...secondaryTowns];

                    // Helper: Find which route town a city matches (flexible matching)
                    const matchTown = (city) => {
                        if (!city) return null;
                        const c = norm(city);
                        for (const town of allRouteTowns) {
                            const t = norm(town);
                            if (c === t || c.includes(t) || t.includes(c)) return town;
                        }
                        return null;
                    };

                    // ── FASE 2: Agrupar envíos en buckets por pueblo ──
                    const townBuckets = new Map(); // townName -> [shipments]
                    const orphans = []; // shipments with no matching route town

                    enriched.forEach(s => {
                        const matched = matchTown(s._city);
                        if (matched) {
                            if (!townBuckets.has(matched)) townBuckets.set(matched, []);
                            townBuckets.get(matched).push(s);
                        } else {
                            orphans.push(s);
                        }
                    });

                    // ── FASE 2b: Insert orphan towns by GPS proximity ──
                    // Calculate a "center" GPS for each route town from its shipments
                    const townCenters = new Map(); // townName -> {lat, lon}
                    for (const [town, items] of townBuckets) {
                        const withCoords = items.filter(s => s._parsedCoords);
                        if (withCoords.length > 0) {
                            const avgLat = withCoords.reduce((sum, s) => sum + s._parsedCoords.lat, 0) / withCoords.length;
                            const avgLon = withCoords.reduce((sum, s) => sum + s._parsedCoords.lon, 0) / withCoords.length;
                            townCenters.set(town, { lat: avgLat, lon: avgLon });
                        }
                    }

                    // Group orphans by their own city
                    const orphanGroups = new Map(); // cityName -> [shipments]
                    orphans.forEach(s => {
                        const cityKey = s._city || '__sin_ciudad__';
                        if (!orphanGroups.has(cityKey)) orphanGroups.set(cityKey, []);
                        orphanGroups.get(cityKey).push(s);
                    });

                    // For each orphan group, find best insertion position
                    const orphanInsertions = []; // { afterTownIndex, orphanCity, items, distance }
                    for (const [orphanCity, items] of orphanGroups) {
                        // Try to get GPS center from orphan items
                        const orphanWithCoords = items.filter(s => s._parsedCoords);
                        let orphanCenter = null;
                        if (orphanWithCoords.length > 0) {
                            orphanCenter = {
                                lat: orphanWithCoords.reduce((s, i) => s + i._parsedCoords.lat, 0) / orphanWithCoords.length,
                                lon: orphanWithCoords.reduce((s, i) => s + i._parsedCoords.lon, 0) / orphanWithCoords.length,
                            };
                        }

                        if (orphanCenter && allRouteTowns.length > 0) {
                            // Find the route town it's closest to
                            let bestIdx = allRouteTowns.length; // default: end
                            let bestDist = Infinity;

                            allRouteTowns.forEach((town, idx) => {
                                const center = townCenters.get(town);
                                if (center) {
                                    const dist = getDistance(orphanCenter.lat, orphanCenter.lon, center.lat, center.lon);
                                    if (dist < bestDist) {
                                        bestDist = dist;
                                        // Insert AFTER the closest town if orphan is farther from start,
                                        // or BEFORE if it's closer to start (check driver position)
                                        if (myLat && myLon) {
                                            const distDriverToOrphan = getDistance(myLat, myLon, orphanCenter.lat, orphanCenter.lon);
                                            const distDriverToTown = getDistance(myLat, myLon, center.lat, center.lon);
                                            bestIdx = distDriverToOrphan < distDriverToTown ? idx : idx + 1;
                                        } else {
                                            bestIdx = idx + 1; // After the closest town by default
                                        }
                                        bestDist = dist;
                                    }
                                }
                            });

                            orphanInsertions.push({ afterTownIndex: bestIdx, orphanCity, items, distance: bestDist });
                        } else {
                            // No GPS data for orphan → place at the very end
                            orphanInsertions.push({ afterTownIndex: allRouteTowns.length + 999, orphanCity, items, distance: Infinity });
                        }
                    }

                    // Sort orphan insertions by their position
                    orphanInsertions.sort((a, b) => a.afterTownIndex - b.afterTownIndex || a.distance - b.distance);

                    // ── FASE 3: Ordenar dentro de cada grupo de pueblo ──
                    const sortWithinTown = (items, townName) => {
                        const townKey = norm(townName || '');
                        let townLearn = positionLearning[townKey] || {};
                        
                        // Fallback: if driver has no data for this town, check route masters
                        if (Object.keys(townLearn).length === 0 && routeKnowledge?.masterByRoute) {
                            for (const [, masterData] of Object.entries(routeKnowledge.masterByRoute)) {
                                if (masterData[townKey] && Object.keys(masterData[townKey]).length > 0) {
                                    townLearn = masterData[townKey];
                                    break;
                                }
                            }
                        }
                        // Also check other drivers' knowledge as last resort
                        if (Object.keys(townLearn).length === 0 && routeKnowledge?.byDriver) {
                            for (const [dId, driverData] of Object.entries(routeKnowledge.byDriver)) {
                                if (String(dId) === String(currentDriverId)) continue;
                                if (driverData[townKey] && Object.keys(driverData[townKey]).length > 0) {
                                    townLearn = driverData[townKey];
                                    break;
                                }
                            }
                        }
                        const hasLearning = Object.keys(townLearn).length > 0;

                        // Split: urgent vs agency
                        const urgents = items.filter(s => !s._isAgency);
                        const agencies = items.filter(s => s._isAgency);

                        const smartSort = (list) => {
                            // Separar los que tienen coords GPS de los que no
                            const withCoords = list.filter(s => s._parsedCoords);
                            const withoutCoords = list.filter(s => !s._parsedCoords);

                            if (!hasLearning || list.length <= 1) {
                                // Sin historial: vecino más cercano encadenado desde startLat/startLon
                                // (startLat/startLon = GPS del conductor o centroide de los puntos)
                                if (withCoords.length > 0 && startLat && startLon) {
                                    const result = [];
                                    const remaining = [...withCoords];
                                    let curLat = startLat;
                                    let curLon = startLon;

                                    while (remaining.length > 0) {
                                        let bestIdx = 0;
                                        let bestDist = Infinity;
                                        for (let i = 0; i < remaining.length; i++) {
                                            const d = getDistance(curLat, curLon, remaining[i]._parsedCoords.lat, remaining[i]._parsedCoords.lon);
                                            if (d < bestDist) { bestDist = d; bestIdx = i; }
                                        }
                                        const next = remaining.splice(bestIdx, 1)[0];
                                        result.push(next);
                                        curLat = next._parsedCoords.lat;
                                        curLon = next._parsedCoords.lon;
                                    }

                                    withoutCoords.sort((a, b) => norm(a.destinationAddress || '').localeCompare(norm(b.destinationAddress || '')));
                                    return [...result, ...withoutCoords];
                                }

                                // Sin GPS en absoluto: ordenar alfabéticamente
                                list.sort((a, b) => norm(a.destinationAddress || '').localeCompare(norm(b.destinationAddress || '')));
                                return list;
                            }

                            // Nearest-neighbor encadenado con historial como desempate

                            // Pesos de posición aprendida (normalizar entre 0 y 1 para usar como bonus)
                            const maxLearnPos = Math.max(
                                ...Object.values(townLearn).map(v => v.avg || 0), 1
                            );
                            const learnScore = (s) => {
                                const name = norm(s.destinationName || s.client);
                                const entry = townLearn[name];
                                // Cuanto menor posición aprendida, menor penalización (0 = primero)
                                return entry ? (entry.avg - 1) / maxLearnPos : 0.5; // desconocido = posición media
                            };

                            // Nearest-neighbor greedy con desempate por historial
                            // Usa startLat/startLon (GPS conductor o centroide) como punto de inicio
                            const nnResult = [];
                            const remaining = [...withCoords];
                            let curLat = startLat || null;
                            let curLon = startLon || null;

                            while (remaining.length > 0) {
                                let bestIdx = 0;
                                let bestScore = Infinity;

                                for (let i = 0; i < remaining.length; i++) {
                                    const s = remaining[i];
                                    const distKm = (curLat && curLon)
                                        ? getDistance(curLat, curLon, s._parsedCoords.lat, s._parsedCoords.lon)
                                        : 0;
                                    // Combinar distancia con posición aprendida:
                                    // Si la diferencia de distancia es < 1 km, el historial desempata
                                    const score = distKm + learnScore(s) * 0.8; // 0.8 km máximo de bonus por historial
                                    if (score < bestScore) {
                                        bestScore = score;
                                        bestIdx = i;
                                    }
                                }

                                const next = remaining.splice(bestIdx, 1)[0];
                                nnResult.push(next);
                                if (next._parsedCoords) {
                                    curLat = next._parsedCoords.lat;
                                    curLon = next._parsedCoords.lon;
                                }
                            }

                            // Los sin coordenadas al final, ordenados por posición aprendida o alfabético
                            withoutCoords.sort((a, b) => {
                                const pa = townLearn[norm(a.destinationName || a.client)]?.avg ?? 999;
                                const pb = townLearn[norm(b.destinationName || b.client)]?.avg ?? 999;
                                if (pa !== pb) return pa - pb;
                                return norm(a.destinationAddress || '').localeCompare(norm(b.destinationAddress || ''));
                            });

                            return [...nnResult, ...withoutCoords];
                        };

                        const sortedUrgents = smartSort(urgents);
                        const sortedAgencies = smartSort(agencies);
                        const merged = [...sortedUrgents, ...sortedAgencies];

                        // Final pass: "De camino" — pull items within 500m
                        const DE_CAMINO_THRESHOLD = 0.5;
                        const reordered = [];
                        const remaining = [...merged];

                        while (remaining.length > 0) {
                            const current = remaining.shift();
                            reordered.push(current);

                            if (current._parsedCoords && remaining.length > 0) {
                                let pulledSomething = true;
                                while (pulledSomething) {
                                    pulledSomething = false;
                                    for (let i = 0; i < remaining.length; i++) {
                                        const candidate = remaining[i];
                                        if (candidate._parsedCoords) {
                                            const dist = getDistance(
                                                current._parsedCoords.lat, current._parsedCoords.lon,
                                                candidate._parsedCoords.lat, candidate._parsedCoords.lon
                                            );
                                            if (dist <= DE_CAMINO_THRESHOLD) {
                                                reordered.push(remaining.splice(i, 1)[0]);
                                                pulledSomething = true;
                                                break;
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        return reordered;
                    };

                    // ── FASE 4: Ensamblar la ruta final ──
                    const finalRoute = [];

                    // Build ordered list: route towns + orphans interleaved
                    let orphanIdx = 0;
                    for (let i = 0; i < allRouteTowns.length; i++) {
                        // Insert any orphans that should go BEFORE this town
                        while (orphanIdx < orphanInsertions.length && orphanInsertions[orphanIdx].afterTownIndex <= i) {
                            const orphanGroup = orphanInsertions[orphanIdx];
                            finalRoute.push(...sortWithinTown(orphanGroup.items, orphanGroup.orphanCity));
                            orphanIdx++;
                        }

                        const town = allRouteTowns[i];
                        const bucket = townBuckets.get(town);
                        if (bucket && bucket.length > 0) {
                            finalRoute.push(...sortWithinTown(bucket, town));
                        }
                    }

                    // Add remaining orphans at the end
                    while (orphanIdx < orphanInsertions.length) {
                        const orphanGroup = orphanInsertions[orphanIdx];
                        finalRoute.push(...sortWithinTown(orphanGroup.items, orphanGroup.orphanCity));
                        orphanIdx++;
                    }

                    // Safety: Add any shipments that weren't matched at all (shouldn't happen)
                    const placedIds = new Set(finalRoute.map(s => s.id));
                    const missed = enriched.filter(s => !placedIds.has(s.id));
                    if (missed.length > 0) finalRoute.push(...missed);

                    // ── Guardar resultado ──
                    const cleanedRoute = finalRoute.map(({ _coords, _parsedCoords, _priority, _isAgency, _city, _id, ...rest }) => rest);
                    setLocalRoute(cleanedRoute);

                    // ── Sincronizar orden con Supabase para que el admin lo vea ──
                    if (currentDriverId) {
                        const idsToSave = cleanedRoute.map(s => s.id);
                        try {
                            localStorage.setItem(`drv_route_${currentDriverId}`, JSON.stringify(idsToSave));
                        } catch (e) {}
                        (async () => {
                            try {
                                const { data: drvData } = await supabase.from('drivers').select('data').eq('id', currentDriverId).single();
                                if (drvData) {
                                    await supabase.from('drivers').update({ data: { ...drvData.data, routeOrder: idsToSave } }).eq('id', currentDriverId);
                                    console.log('[SmartSort] routeOrder synced to cloud:', idsToSave.length, 'stops');
                                }
                            } catch (err) {
                                console.warn('[SmartSort] Failed to sync routeOrder to cloud:', err);
                            }
                        })();
                    }

                    const shiftLabel = isMorningShift ? '☀️ Mañana' : '🌙 Tarde';
                    const townCount = [...townBuckets.keys()].length;
                    const orphanCount = orphanInsertions.reduce((s, g) => s + g.items.length, 0);
                    const learnedTowns = Object.keys(positionLearning).length;
                    setRouteOptimized(true);
                    setLearningMessage(
                        `Ruta v4 (${shiftLabel}): ${townCount} pueblo${townCount !== 1 ? 's' : ''} en ruta` +
                        (orphanCount > 0 ? ` + ${orphanCount} extra${orphanCount !== 1 ? 's' : ''}` : '') +
                        (learnedTowns > 0 ? ` · Aprendizaje: ${learnedTowns} pueblos memorizados` : ' · Sin historial aún')
                    );
                    setTimeout(() => {
                        setLearningMessage("");
                        setIsOptimizing(false);
                    }, 3000);
                } catch (error) {
                    console.error("Optimization v4 failed:", error);
                    setIsOptimizing(false);
                }
            }, 800);
        }
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
            const isTargetType = isCashClient(targetName, clientsMap, deliveryModalShipment.billingType);

            if (!isTargetType) return [];

            // 3. Find other shipments for this Entity that are Pending Cobro
            // Pre-normalize target name once
            const targetNameClean = targetName.trim().toLowerCase();
            
            const otherPendingShipments = (allShipments || []).filter(s => {
                if (!s || s.id === deliveryModalShipment.id) return false;

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
                const porteVal = parseAmount(s.amount);
                const codVal = hasCod ? parseAmount(s.codAmount) : 0;

                const payerName = isDebido ? (s.destinationName || s.client) : (s.originName || s.client);
                const isPortePayerCash = isCashClient(payerName, clientsMap, s.billingType);
                const isCodPayerCash = isCashClient(s.destinationName || s.client, clientsMap, s.billingType);

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
                    } else if (isDebido && isPortePayerCash && (s.status === 'Entregado' || s.id === deliveryModalShipment.id)) {
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
    }, [deliveryModalShipment, allShipments]);

    const collectionAlert = useMemo(() => {
        try {
            if (!deliveryModalShipment) return false;

            // En recogidas nunca se gestiona el cobro previo aquí, el flujo salta directamente
            // al proceso de generación de albarán.
            if (deliveryModalShipment.type === 'Recogida') return false;

            console.log("--- Dashboard: Checking Collection Alert Visibility ---", deliveryModalShipment.id);

            let targetName = deliveryModalShipment.destinationName || deliveryModalShipment.client;
            const isTargetCash = isCashClient(targetName, clientsMap, deliveryModalShipment.billingType);
            
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
    const handleDeliveryConfirm = async (id, proof, status, selectedDebtIds = [], customAmounts = {}, generateReturn = false, extraFlags = null) => {
        const currentShip = (allShipments || []).find(s => s.id === id) || deliveryModalShipment;
        if (!currentShip) return;

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
                    agencyLabel: currentShip.agencyLabel || 'SUM ESPECIAL'
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
                const debtKey = `${sid}-${partType}`;
                const originalAmount = isPorte ? ship.amount : ship.codAmount;
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
                if (isPorte) { updated.portePaid = true; updated.paidAt = new Date().toISOString(); }
                else { updated.codPaid = true; updated.paidAt = new Date().toISOString(); }
                updated.updatedAt = new Date().toISOString();
                workingShipments.set(sid, updated);
            }
        }

        // 2. Handle Proof Uploads for the main shipment if needed
        let finalProofForCurrent = { ...proof };
        const pendingUploads = {}; // Holds base64 data to be uploaded when back online
        if (status === 'Entregado' && proof?.type === 'multi') {
            if (!isOnline) {
                // ---- MODO OFFLINE ----
                // Guardamos el base64 puro para que sea inmediatamente visible en la UI
                // (data: URLs son válidas en <img src>). Las subimos a Storage al reconectar.
                if (proof.signatureData) {
                    finalProofForCurrent.signatureUrl = proof.signatureData; // base64 válido para <img>
                    pendingUploads.signatureData = proof.signatureData;       // para el flush al reconectar
                }
                if (proof.photoData) {
                    finalProofForCurrent.photoUrl = proof.photoData;         // base64 válido para <img>
                    pendingUploads.photoData = proof.photoData;              // para el flush al reconectar
                }
                if (proof.photoData2) {
                    finalProofForCurrent.photoUrl2 = proof.photoData2;       // base64 válido para <img>
                    pendingUploads.photoData2 = proof.photoData2;            // para el flush al reconectar
                }
                delete finalProofForCurrent.signatureData;
                delete finalProofForCurrent.photoData;
                delete finalProofForCurrent.photoData2;
                console.log('[Offline] Firma/fotos guardadas como base64 local para', id);
            } else {
                // ---- MODO ONLINE: subir a Supabase Storage normalmente ----
                try {
                    if (proof.signatureData) {
                        finalProofForCurrent.signatureUrl = await uploadProof(id, proof.signatureData, 'signatures');
                    }
                    if (proof.photoData) {
                        finalProofForCurrent.photoUrl = await uploadProof(id, proof.photoData, 'delivery_photos');
                    }
                    if (proof.photoData2) {
                        finalProofForCurrent.photoUrl2 = await uploadProof(id, proof.photoData2, 'delivery_photos');
                    }
                    delete finalProofForCurrent.signatureData;
                    delete finalProofForCurrent.photoData;
                    delete finalProofForCurrent.photoData2;
                } catch (err) { console.error("Proof upload error:", err); }
            } // end isOnline else
        } // end if (status === 'Entregado' && proof?.type === 'multi')

        // ── Auto-aprendizaje de coords del DESTINATARIO en la entrega ──
        // Se ejecuta SIEMPRE que se entrega (independientemente del tipo de proof).
        // La ubicación capturada en el modal de entrega (proof.coordinates) se guarda
        // en la ficha del destinatario si aún no tiene coordenadas.
        if (status === 'Entregado' && proof?.coordinates && currentShip && onUpdateClient) {
            const isPickupType = currentShip.type === 'Recogida';
            const clientName = isPickupType
                ? currentShip.client
                : (currentShip.destinationName || currentShip.client);

            if (clientName) {
                const destClientObj = clientsMap.get(normalizeClientName(clientName));
                if (destClientObj) {
                    if (destClientObj._isBranch) {
                        const branch = destClientObj._branch;
                        if (!(branch.coordinates && String(branch.coordinates).trim().length > 0)) {
                            onUpdateClient(destClientObj.id, { coordinates: proof.coordinates }, branch.id);
                            console.log(`[AutoCoords] Destinatario (Sede) "${clientName}" → ${proof.coordinates}`);
                        }
                    } else {
                        if (!(destClientObj.coordinates && String(destClientObj.coordinates).trim().length > 0)) {
                            onUpdateClient(destClientObj.id, { coordinates: proof.coordinates });
                            console.log(`[AutoCoords] Destinatario "${clientName}" → ${proof.coordinates}`);
                        }
                    }
                } else if (!destClientObj && !isPickupType && onAddClient) {
                    // Destinatario no existe en BD → crear ficha pendiente de validar con GPS incluido
                    onAddClient({
                        name: currentShip.destinationName,
                        address: currentShip.destinationAddress || currentShip.address || '',
                        city: currentShip.destinationCity || '',
                        zip: currentShip.destinationZip || '',
                        phone: currentShip.destinationPhone || '',
                        coordinates: proof.coordinates,
                        type: 'Destinatario',
                        // 'Facturación' para que el albarán no desaparezca en modo oculto
                        // mientras espera validación. El admin asignará el tipo correcto al validar.
                        billingType: 'Facturación',
                        status: 'pending',
                        createdFrom: 'Reparto (Driver)',
                        createdBy: currentDriver?.name || 'Driver',
                    });
                }
            }
        }

        // 3. Persist Collections (Atomic UI update)
        if (newCollectionsBatch.length > 0) {
            setCollectedCollections(prev => [...prev, ...newCollectionsBatch]);
        }

        // 4. Sync each affected shipment to Database
        const affectedIds = Array.from(new Set([...workingShipments.keys(), id]));
        
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
                }
                if (shipData.codPaid && !original?.codPaid) {
                    flags.codPaid = true;
                    flags.codCollectedById = currentDriverId;
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

                let targetStatus = isMain ? status : (shipData.status || original?.status || 'Pendiente');
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
                    return bType.includes('factur') || bType.includes('presupuesto') || bType.includes('habitual') || bType.includes('diar') || bType.includes('libre') || bType.includes('contado');
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
                            <p className="text-sm text-slate-500 mb-6">El cliente no tiene teléfono guardado. Introduce el número de WhatsApp:</p>
                            
                            <input 
                                type="tel"
                                autoFocus
                                value={whatsappPrompt.phone}
                                onChange={(e) => setWhatsappPrompt(prev => ({ ...prev, phone: e.target.value }))}
                                placeholder="Ej: 600123456"
                                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all font-bold text-lg text-slate-700 mb-4"
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleWhatsAppShare(whatsappPrompt.shipment, whatsappPrompt.phone);
                                }}
                            />
                            
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => setWhatsappPrompt(null)}
                                    className="flex-1 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50 rounded-xl transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={() => handleWhatsAppShare(whatsappPrompt.shipment, whatsappPrompt.phone)}
                                    className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2"
                                >
                                    Abrir WhatsApp
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
            <header className={`bg-slate-900 text-white p-4 sticky z-50 shadow-md transition-all duration-300 ${(!isOnline || justReconnected) ? 'top-10' : 'top-0'}`}>
                <div className="flex justify-between items-center mb-4">
                    <div className="flex items-center gap-3">
                        <div 
                            onClick={() => setActiveTab('profile')}
                            className="w-10 h-10 bg-white rounded-xl p-1.5 shadow-inner flex items-center justify-center overflow-hidden relative cursor-pointer hover:shadow-md transition-all active:scale-95"
                            title="Portal del Empleado"
                        >
                            <img src="/logo-sum.svg" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg leading-tight text-white flex items-center gap-2">
                                Hola, {drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name || 'Conductor'}
                                
                                {/* GPS Status Button */}
                                <button 
                                    onClick={(e) => {
                                        e.preventDefault();
                                        if (gpsStatus === 'error_unsecure') {
                                            alert("⚠ GPS BLOQUEADO: Estás usando una conexión 'http://' sin certificado de seguridad válido o 'localhost'. Chrome o Safari no permiten leer antenas de GPS en conexiones inseguras. \nDebes usar tu dominio oficial seguro (HTTPS) para que funcione el GPS.");
                                        } else if (gpsStatus === 'denied') {
                                            alert("⚠ GPS DENEGADO: El móvil denegó el permiso para leer la antena. Revisa los permisos de Chrome/Safari.");
                                        } else {
                                            sendLocation();
                                        }
                                    }}
                                    className={`ml-1 flex items-center justify-center p-1 rounded-full transition-colors ${
                                        gpsStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 
                                        gpsStatus === 'requesting' ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 animate-spin' :
                                        (gpsStatus === 'error_unsecure' || gpsStatus === 'denied') ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 animate-pulse' :
                                        'bg-slate-700 text-slate-400 hover:text-white'
                                    }`}
                                >
                                    <MapPin size={16} />
                                </button>
                            </h1>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
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
                        <button onClick={() => setActiveTab('route')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'route' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Reparto</button>
                        <button onClick={() => setActiveTab('assign')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'assign' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Asignar</button>
                        <button onClick={() => setActiveTab('delivered')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'delivered' ? 'bg-green-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Entregas</button>
                        <button onClick={() => setActiveTab('collections')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'collections' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>C.Pendientes</button>
                        <button onClick={() => setActiveTab('account')} className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${activeTab === 'account' ? 'bg-amber-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-200'}`}>Cuenta</button>
                    </nav>
                </div>
            </header>

            <main className="flex-1 p-0 sm:p-4 max-w-lg mx-auto w-full pb-24 relative">
                
                <DriverTimeLogAlerts currentDriverId={currentDriverId} />

                {/* AI Notification Toast */}
                {learningMessage && (
                    <div className="fixed top-24 left-1/2 -translate-x-1/2 bg-slate-800/90 backdrop-blur-sm text-white px-4 py-2 rounded-full text-xs font-bold shadow-xl animate-in fade-in slide-in-from-top-4 z-50 flex items-center gap-2">
                        <BrainCircuit size={14} className="text-purple-400" />
                        {learningMessage}
                    </div>
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
                        <div className="flex justify-between items-center px-1 mb-2">
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Pendientes</h3>
                                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">{localRoute.length} Envíos</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
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
                            // Filter logic: Only show shipments that are explicitly assigned to this driver,
                            // OR are 'Pendiente de asignar' AND were created by this driver.
                            const availableShipments = (allShipments || []).filter(s =>
                                s &&
                                s.status === 'Pendiente de asignar' &&
                                (
                                    Number(s.createdById) === Number(currentDriverId) ||
                                    Number(s.pickedUpById) === Number(currentDriverId)
                                )
                            );

                            return (
                                <>
                                    {availableShipments.map((shipment) => (
                                        <div 
                                            key={shipment.id}
                                            onClick={() => { setSelectedShipment(shipment); setIsDetailsModalOpen(true); }} 
                                            className={`bg-white px-4 py-2.5 rounded-xl shadow-sm border cursor-pointer transition-colors ${shipment.incidentStatus === 'active' ? 'border-red-400 border-2 shadow-red-100' : 'border-slate-100 hover:border-blue-300'}`}
                                        >
                                            {shipment.incidentStatus === 'active' && (
                                                <div className="w-full bg-red-100 text-red-700 font-extrabold text-[11px] py-1.5 px-2 rounded mb-2 text-center animate-pulse border border-red-300 shadow-sm flex items-center justify-center gap-2">
                                                    <span>⚠️</span>
                                                    <span>EN INCIDENCIA</span>
                                                    <span>⚠️</span>
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
                                                        const normCity = normalizeClientName(cityText);
                                                        const activeR = routes && routes.length > 0 ? routes : [];
                                                        
                                                        const sugs = [];
                                                        activeR.forEach(r => {
                                                            if (!r.conductorId) return;
                                                            const driver = drivers?.find(d => String(d.id) === String(r.conductorId));
                                                            if (!driver) return; // Skip if driver was deleted or not found
                                                            const dName = driver.alias?.trim() || driver.name?.trim().split(' ')[0] || 'Conductor';
                                                            
                                                            const inManana = (r.poblacionesManana || []).some(p => normCity.includes(normalizeClientName(p)));
                                                            if (inManana && !sugs.some(s => s.driverId === r.conductorId && s.turno === 'manana')) {
                                                                sugs.push({ driverId: r.conductorId, turno: 'manana', name: dName });
                                                            }
                                                            
                                                            const inTarde = (r.poblacionesTarde || []).some(p => normCity.includes(normalizeClientName(p)));
                                                            if (inTarde && !sugs.some(s => s.driverId === r.conductorId && s.turno === 'tarde')) {
                                                                sugs.push({ driverId: r.conductorId, turno: 'tarde', name: dName });
                                                            }
                                                        });
                                                        
                                                        const now = new Date();
                                                        const currentHour = now.getHours();
                                                        const currentMinute = now.getMinutes();
                                                        const isMorningNow = currentHour < 15 || (currentHour === 15 && currentMinute <= 30);
                                                        
                                                        return sugs.map((sug, i) => {
                                                            const shouldBlink = (isMorningNow && sug.turno === 'tarde') || (!isMorningNow && sug.turno === 'manana');
                                                            
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
                                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ml-2 shrink-0 ${shipment.type === 'Recibo' ? 'bg-emerald-200 text-emerald-800' : 'bg-green-200 text-green-800'}`}>
                                            {shipment.type === 'Recibo' ? 'Cobrado' : 'Entregado'}
                                        </span>
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

                                    // Create model with enriched billing info
                                    const model = new Shipment({
                                        ...shipment,
                                        billingType: senderClient?.billingType || shipment.billingType || 'Clientes Habituales',
                                        destinationBillingType: destClient?.billingType || shipment.destinationBillingType || null
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
                                                        } else {
                                                            updates.codPaid = true;
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
                                                        // If it was already "Entregado" or becomes one, use onStatusChange
                                                        let success = false;
                                                        if (shipment.status === 'Entregado' || (pf && cf)) {
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
                                            <div key={item.key} className="p-3 flex justify-between items-center">
                                                <div className="flex-1">
                                                    <p className="text-sm font-bold text-slate-700">{item.client}</p>
                                                    <p className="text-[10px] text-slate-400">{item.detail}</p>
                                                    <p className="text-[9px] text-orange-400">Base: {item.base}€ + IVA: {item.iva}€</p>
                                                </div>
                                                <span className="font-mono text-sm font-bold text-orange-600">
                                                    {item.amountDisplay}
                                                </span>
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

                            <TimeLogSection 
                                currentDriverId={currentDriverId} 
                                driverName={drivers?.find(d => Number(d.id) === Number(currentDriverId))?.name} 
                                handleLogoutWithSafety={handleLogoutWithSafety} 
                            />

                            <div className="w-full grid grid-cols-2 gap-3">
                                <button onClick={() => setShowPayrollsModal(true)} className="p-4 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-200 transition-colors rounded-xl flex flex-col items-center justify-center gap-2">
                                    <FileText size={24} className="text-blue-500" />
                                    <span className="font-bold text-slate-700 text-xs">Mis Nóminas</span>
                                    {currentDriver?.payrolls?.length > 0 && (
                                        <span className="text-[9px] font-bold text-white bg-blue-500 px-2 py-0.5 rounded-full">{currentDriver.payrolls.length} disponibles</span>
                                    )}
                                </button>
                                <button disabled className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-col items-center justify-center gap-2 opacity-60 cursor-not-allowed">
                                    <Sparkles size={24} className="text-slate-400" />
                                    <span className="font-bold text-slate-600 text-xs">Mis Vacaciones</span>
                                    <span className="text-[9px] font-bold text-amber-500 bg-amber-100 px-2 py-0.5 rounded-full uppercase tracking-tighter">Próximamente</span>
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
                clients={clients}
                onConfirm={handleDeliveryConfirm}
            />

            {/* Mapa de ruta optimizada */}
            {showRouteMap && (
                <RouteMapModal
                    route={localRoute}
                    driverCoords={(() => {
                        const driver = drivers?.find(d => String(d.id) === String(currentDriverId));
                        if (!driver?.latitude && !driver?.longitude) return null;
                        return { lat: driver.latitude, lon: driver.longitude };
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
                            incidentStatus: 'resolved'
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
