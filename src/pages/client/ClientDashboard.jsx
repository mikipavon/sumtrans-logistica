import React, { useState, useMemo, useEffect } from 'react';
import { LogOut, Package, Plus, MapPin, Truck, CheckCircle, Clock, FileText, Download, FileDown, Loader2, Printer, Settings as SettingsIcon, Upload, Trash2, Tag } from 'lucide-react';
import ShipmentDetailsModal from '../../components/shipments/ShipmentDetailsModal';
import { printShipmentTicket } from '../../utils/printShipment';
import { generateDeliveryPDF, generateDeliveryNotesPDF } from '../../utils/deliveryPdf';
import LabelPrintModal from '../../components/clients/LabelPrintModal';

import { ALL_BAREMO_PUEBLOS } from '../../data/baremos';
import { getPackagesCount } from '../../utils/shipmentUtils';
import ImportExcelShipments from '../../components/clients/ImportExcelShipments';
import { reservarNumerosAlbaran } from '../../utils/numeracionAlbaran';
import { avisarAlPadre, estamosEmbebidos } from '../../utils/ventanaPadre';

export default function ClientDashboard({
    client,
    onLogout,
    allShipments,
    drivers,
    allClients,
    articles,
    tariffs,
    coverageZones,
    onCreateShipment,
    onUpdateClient,
    onDeleteShipment,
    pendingQueueCount = 0,
    isSyncingQueue = false
}) {
    const [activeTab, setActiveTab] = useState('shipments'); // 'shipments', 'create'
    const [selectedShipment, setSelectedShipment] = useState(null);
    const [labelPrintShipment, setLabelPrintShipment] = useState(null);

    // Notificar a la web padre que el dashboard del cliente está listo y renderizado
    useEffect(() => {
        if (estamosEmbebidos()) {
            avisarAlPadre({ type: 'SUM_CLIENT_DASHBOARD_READY' });
            console.log('📡 [ClientDashboard] Dashboard montado — notificando a web padre');
        }
    }, []);
    
    // Filtros de fecha
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    
    // Estado de ordenación
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

    // Filter shipments belonging to this client (by Name or by matching logic) + Date Filter
    const clientShipments = useMemo(() => {
        let filtered = (allShipments || []).filter(s => {
            const clientNameLower = (client.name || '').toLowerCase();
            return (s.client && s.client.toLowerCase() === clientNameLower) || 
                   (s.originName && s.originName.toLowerCase() === clientNameLower) ||
                   (s.clientId === client.id);
        });

        if (dateFrom) {
            const from = new Date(dateFrom);
            filtered = filtered.filter(s => new Date(s.createdAt || s.date) >= from);
        }
        if (dateTo) {
            const to = new Date(dateTo);
            to.setHours(23, 59, 59, 999);
            filtered = filtered.filter(s => new Date(s.createdAt || s.date) <= to);
        }

        return filtered.sort((a,b) => {
            const getVal = (s, key) => {
                if (key === 'id') {
                    const match = String(s.id).match(/\d+/);
                    return match ? parseInt(match[0], 10) : s.id;
                }
                if (key === 'date') return new Date(s.createdAt || s.date).getTime();
                if (key === 'destinationName') return (s.destinationName || '').toLowerCase();
                if (key === 'destination') return (s.destinationCity || s.destination || '').toLowerCase();
                if (key === 'status') return (s.status || '').toLowerCase();
                return '';
            };

            const aVal = getVal(a, sortConfig.key);
            const bVal = getVal(b, sortConfig.key);

            if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [allShipments, client, dateFrom, dateTo, sortConfig]);

    // Albaranes descargables del rango de fechas filtrado (los entregados ya tienen POD)
    const albaranesDelFiltro = useMemo(
        () => clientShipments.filter(s => s.status === 'Entregado'),
        [clientShipments]
    );

    const [descargandoAlbaranes, setDescargandoAlbaranes] = useState(false);

    const descargarAlbaranesDelFiltro = async () => {
        if (descargandoAlbaranes || albaranesDelFiltro.length === 0) return;
        setDescargandoAlbaranes(true);
        try {
            const tramo = [dateFrom, dateTo].filter(Boolean).join('_a_') || 'todos';
            await generateDeliveryNotesPDF(
                albaranesDelFiltro,
                'Albaranes_' + (client.name || 'Cliente') + '_' + tramo
            );
        } catch (err) {
            alert('Error al descargar los albaranes: ' + err.message);
        } finally {
            setDescargandoAlbaranes(false);
        }
    };

    const requestSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const activeCount = clientShipments.filter(s => s.status !== 'Entregado').length;
    const deliveredCount = clientShipments.filter(s => s.status === 'Entregado').length;

    // --- Create Shipment Form State ---
    const [newOrigin, setNewOrigin] = useState(client.address || '');
    const [newOriginZip, setNewOriginZip] = useState(client.zip || '');
    const [newOriginCity, setNewOriginCity] = useState(client.city || '');
    const [newDestination, setNewDestination] = useState('');
    const [newDestinationZip, setNewDestinationZip] = useState('');
    const [newDestinationCity, setNewDestinationCity] = useState('');
    const [newDestinationName, setNewDestinationName] = useState('');
    const [selectedArticleId, setSelectedArticleId] = useState('');
    const [observations, setObservations] = useState('');
    const [clientReference, setClientReference] = useState('');
    const [porteType, setPorteType] = useState('Pagado');
    const [codAmount, setCodAmount] = useState('');
    const [showDestSuggestions, setShowDestSuggestions] = useState(false);
    const [showDestCitySuggestions, setShowDestCitySuggestions] = useState(false);
    const [showOriginCitySuggestions, setShowOriginCitySuggestions] = useState(false);

    // Poblaciones únicas de baremos para autocompletado de ciudades
    const uniquePoblaciones = useMemo(() => {
        const seen = new Set();
        const result = [];
        (ALL_BAREMO_PUEBLOS || []).forEach(p => {
            const key = p.name.toLowerCase();
            if (!seen.has(key)) {
                seen.add(key);
                result.push(p);
            }
        });
        // También añadir ciudades de clientes existentes que no estén ya
        (allClients || []).forEach(c => {
            if (c.city) {
                const key = c.city.toLowerCase();
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push({ name: c.city, zip: c.zip || '', baremo: 0 });
                }
            }
        });
        return result.sort((a, b) => a.name.localeCompare(b.name));
    }, [allClients]);

    const filteredDestCities = useMemo(() => {
        if (!newDestinationCity || newDestinationCity.length < 2) return [];
        const q = newDestinationCity.toLowerCase();
        return uniquePoblaciones.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    }, [uniquePoblaciones, newDestinationCity]);

    const filteredOriginCities = useMemo(() => {
        if (!newOriginCity || newOriginCity.length < 2) return [];
        const q = newOriginCity.toLowerCase();
        return uniquePoblaciones.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);
    }, [uniquePoblaciones, newOriginCity]);

    // Available articles for clients: los asignados en su ficha (allowedArticles);
    // si no tiene ninguno configurado, se cae al default histórico BADI (Bultos) y MYM (Palets).
    const availableArticles = useMemo(() => {
        if (!articles) return [];
        const allowedIds = client?.allowedArticles;
        const allowed = (allowedIds && allowedIds.length > 0)
            ? articles.filter(a => allowedIds.includes(a.id) || allowedIds.includes(String(a.id)))
            : articles.filter(a => a.category === 'BADI' || a.category === 'MYM');
        return allowed.sort((a,b) => {
            if (a.category === 'BADI' && b.category === 'MYM') return -1;
            if (a.category === 'MYM' && b.category === 'BADI') return 1;
            if (a.category === 'BADI') {
                const numA = parseInt(a.name.replace(/\D/g, '')) || 0;
                const numB = parseInt(b.name.replace(/\D/g, '')) || 0;
                return numA - numB;
            }
            return a.name.localeCompare(b.name);
        });
    }, [articles]);

    // Build the client's own private address book from the shared DB
    // Only contacts that were created by this client (creatorId matches) or matched in past shipments
    const myContacts = useMemo(() => {
        if (!allClients) return [];
        // Past destination names from MY shipments
        const myDestNames = new Set(
            clientShipments.map(s => (s.destinationName || '').toLowerCase()).filter(Boolean)
        );
        return allClients.filter(c =>
            c.id !== client.id &&
            (
                Number(c.creatorId) === Number(client.id) ||
                myDestNames.has((c.name || '').toLowerCase())
            )
        );
    }, [allClients, client, clientShipments]);

    const filteredContacts = useMemo(() => {
        if (!newDestinationName) return myContacts.slice(0, 8);
        return myContacts.filter(c =>
            c.name.toLowerCase().includes(newDestinationName.toLowerCase())
        ).slice(0, 8);
    }, [myContacts, newDestinationName]);

    const handleSelectContact = (contact) => {
        setNewDestinationName(contact.name || '');
        setNewDestination(contact.address || '');
        setNewDestinationZip(contact.zip || '');
        setNewDestinationCity(contact.city || '');
        setShowDestSuggestions(false);
    };

    const handleCreateSubmit = async (e) => {
        e.preventDefault();

        // Prefijo según tipo de cliente: HAB- para habituales/presupuesto, SUM- para el resto
        const clientBillingType = String(client.billingType || '').toLowerCase();
        const isHabClient = clientBillingType.includes('habitual') || clientBillingType.includes('diar') ||
                            clientBillingType.includes('libre') || clientBillingType.includes('contado') ||
                            clientBillingType.includes('presupuesto');
        const clientPrefix = isHabClient ? 'HAB' : 'SUM';

        // El número lo reserva el servidor. Contarlo aquí no vale: el cliente sólo
        // ve SUS envíos (RLS, fase 04), así que su máximo va por detrás del real y
        // el id acababa pisando el albarán de otro cliente — ver numeracionAlbaran.js.
        const { primero: numeroAlbaran } = await reservarNumerosAlbaran(clientPrefix, 1, {
            enviosLocales: allShipments
        });

        const selectedArticle = availableArticles.find(a => String(a.id) === String(selectedArticleId));
        let numPackages = 1;
        if (selectedArticle && selectedArticle.category === 'BADI') {
            const parsed = parseInt(selectedArticle.name.replace(/\D/g, ''));
            if (!isNaN(parsed) && parsed > 0) numPackages = parsed;
        }

        // --- PRICING LOGIC ---
        const normalizeText = (text) => {
            if (!text) return '';
            return String(text).trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ");
        };
        const getPointBaremo = (city, zip) => {
            let baremo = 1; let tariffId = null;
            const cleanCity = String(city || '').trim().toLowerCase();
            const cleanZip = String(zip || '').trim();
            if (!cleanCity && !cleanZip) return { baremo: 1, tariffId: null }; 

            if (tariffs) {
                const normCity = normalizeText(cleanCity);
                const foundTariff = tariffs.find(t => (t.match && normCity && normalizeText(t.match) === normCity) || (t.zipPrefix && cleanZip && cleanZip.startsWith(t.zipPrefix.trim())));
                if (foundTariff) {
                    tariffId = foundTariff.id;
                    if (foundTariff.baremo) baremo = Number(foundTariff.baremo);
                }
            }
            if (!tariffId || baremo === 1) {
                const normCity = normalizeText(cleanCity);
                const dynamicMatch = (coverageZones || []).find(p => (normCity && normalizeText(p.name) === normCity) || (cleanZip && String(p.zip || '').trim() === cleanZip));
                const masterMatch = (ALL_BAREMO_PUEBLOS || []).find(p => (normCity && normalizeText(p.name) === normCity) || (cleanZip && String(p.zip || '').trim() === cleanZip));
                if (dynamicMatch) baremo = Number(dynamicMatch.baremo || 1);
                else if (masterMatch) baremo = Number(masterMatch.baremo);
                else if (cleanCity || cleanZip) baremo = 2;
            }
            return { baremo, tariffId };
        };

        let unitPrice = 0;
        if (selectedArticle) {
            const originCity = newOriginCity;
            const originZip = newOriginZip;
            const originInfo = getPointBaremo(originCity, originZip);
            const destInfo = getPointBaremo(newDestinationCity, newDestinationZip);
            const baremo = (Number(originInfo.baremo) === 2 || Number(destInfo.baremo) === 2) ? 2 : 1;
            const tariffId = destInfo.tariffId;

            unitPrice = parseFloat(selectedArticle.price || 0);

            if (baremo === 2 && client.customRatesB2 && client.customRatesB2[selectedArticle.id] !== undefined && client.customRatesB2[selectedArticle.id] !== '') {
                unitPrice = parseFloat(client.customRatesB2[selectedArticle.id]);
            } else if (baremo === 1 && client.customRates && client.customRates[selectedArticle.id] !== undefined && client.customRates[selectedArticle.id] !== '') {
                unitPrice = parseFloat(client.customRates[selectedArticle.id]);
            } else if (client.customRates && client.customRates[selectedArticle.id] !== undefined && client.customRates[selectedArticle.id] !== '') {
                unitPrice = parseFloat(client.customRates[selectedArticle.id]);
            } else if (selectedArticle.zonePrices && tariffId && selectedArticle.zonePrices[tariffId]) {
                unitPrice = parseFloat(selectedArticle.zonePrices[tariffId]);
            } else if (baremo === 2 && (selectedArticle.priceB2 !== undefined && selectedArticle.priceB2 !== null && selectedArticle.priceB2 !== '')) {
                unitPrice = parseFloat(selectedArticle.priceB2);
            }
        }

        const amountNum = parseFloat(codAmount) || 0;
        const finalAmount = unitPrice; // No sumamos comisión de COD aquí según petición

        const shipmentData = {
            id: `${clientPrefix}-${numeroAlbaran}`,
            type: 'Entrega',
            client: client.name,
            clientId: client.id,
            originName: client.name,
            originAddress: newOrigin,
            originZip: newOriginZip,
            originCity: newOriginCity,
            destinationName: newDestinationName,
            destinationAddress: newDestination,
            destinationZip: newDestinationZip,
            destinationCity: newDestinationCity,
            origin: `${newOriginZip} ${newOriginCity}, ES`.trim(),
            destination: `${newDestinationZip} ${newDestinationCity}, ES`.trim(),
            date: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }),
            createdAt: new Date().toISOString(),
            status: 'Pendiente de asignar',
            packages: numPackages,
            observations: observations,
            clientReference: clientReference ? clientReference.trim() : null,
            articles: selectedArticle ? [{
                ...selectedArticle,
                uniqueId: Date.now(),
                quantity: 1,
                unitPrice: unitPrice,
                totalPrice: unitPrice
            }] : [],
            amount: finalAmount ? finalAmount.toFixed(2) : 'Pendiente',
            paymentStatus: 'Pending',
            porteType: porteType,
            hasCod: amountNum > 0,
            codAmount: amountNum,
            codCommission: amountNum > 0 ? parseFloat(client.codFee || 3) : 0
        };

        onCreateShipment(shipmentData);
        setActiveTab('shipments');
        
        // Reset form
        setNewDestination('');
        setNewDestinationZip('');
        setNewDestinationCity('');
        setNewDestinationName('');
        setNewOrigin(client.address || '');
        setNewOriginZip(client.zip || '');
        setNewOriginCity(client.city || '');
        setSelectedArticleId('');
        setObservations('');
        setClientReference('');
        setPorteType('Pagado');
        setCodAmount('');
    };

    // Replaced by LabelPrintModal — keeping stub for safety
    const handlePrintLabel = (shipment) => {
        const clientLogo = client.agencyLogoUrl || client.customLogo;
        const mainLogoSrc = clientLogo || "/logo-sum.svg";
        const hasClientLogo = !!clientLogo;
        const printWindow = window.open('', '_blank');
        const printDate = new Date().toLocaleDateString('es-ES');
        
        let packagesCount = parseInt(shipment.packages) || 1;
        if (shipment.articles && shipment.articles.length > 0) {
            const badiArticle = shipment.articles.find(a => a.category === 'BADI' || String(a.name).includes('BLT_') || String(a.name).toLowerCase().includes('bulto'));
            if (badiArticle) {
                const parsed = parseInt(String(badiArticle.name).replace(/\D/g, ''));
                if (!isNaN(parsed) && parsed > 0) {
                    packagesCount = parsed * (badiArticle.quantity || 1);
                }
            }
        }
        
        let labelsHtml = '';
        for (let i = 1; i <= packagesCount; i++) {
            labelsHtml += `
                <div class="label-container">
                    <div class="header">
                        <img src="${mainLogoSrc}" alt="Logo" class="logo" onerror="this.src=''" />
                        <div style="text-align: right;">
                            ${hasClientLogo ? '<img src="/logo-sum.svg" alt="SUM" style="height:30px; margin-bottom:5px; object-fit:contain;" /><br/>' : ''}
                            <div class="meta" style="display:inline-block; text-align:right;">
                                <strong>${shipment.id}</strong><br/>
                                Fecha: ${printDate}
                            </div>
                        </div>
                    </div>

                    <div class="origin">
                        <p class="section-title">Remitente</p>
                        <p class="text-bold">${shipment.originName || shipment.client || 'Remitente'}</p>
                        <p class="text-normal">${shipment.originAddress || 'Dirección origen'}</p>
                        <p class="text-normal">${shipment.originCity || 'Ciudad origen'}</p>
                    </div>

                    <div class="destination">
                        <p class="section-title">Destinatario</p>
                        <p class="text-bold">${shipment.destinationName || 'Destinatario'}</p>
                        <p class="text-normal">${shipment.destinationAddress || shipment.destination || 'Dirección destino'}</p>
                        <p class="text-normal">${shipment.destinationCity || 'Ciudad destino'}</p>
                        <div class="details">
                            <div>
                                <p class="section-title">Bultos / Palets</p>
                                <p class="text-bold">${packagesCount > 1 ? `${i} / ${packagesCount}` : (shipment.articles && shipment.articles.length > 0 ? shipment.articles.map(a => a.name).join(', ') : (shipment.packages || 1))}</p>
                            </div>
                            <div>
                                <p class="section-title">Observaciones</p>
                                <p class="text-bold" style="font-size: 12px; max-width: 150px;">${shipment.observations || '-'}</p>
                            </div>
                            ${shipment.clientReference ? `
                            <div>
                                <p class="section-title">Ref. Cliente</p>
                                <p class="text-bold" style="font-size: 11px; font-family: monospace; max-width: 150px;">${shipment.clientReference}</p>
                            </div>` : ''}
                        </div>
                    </div>

                    <div class="barcode" style="margin-top: 20px; border-top: 2px solid #000; padding-top: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
                        <img 
                            src="https://bwipjs-api.metafloor.com/?bcid=qrcode&text=${shipment.id}-${i}&scale=3&rotate=N" 
                            alt="QR Code"
                            style="width: 150px; height: 150px; display: block; margin: 0 auto; object-fit: contain;"
                        />
                        <p style="margin: 10px 0 0 0; font-size: 16px; font-weight: bold; letter-spacing: 3px; font-family: monospace; text-align: center;">
                            ${shipment.id}-${i}/${packagesCount}
                        </p>
                        <p style="margin: 5px 0 0 0; font-size: 14px; text-transform: uppercase;">
                            Bulto ${i} de ${packagesCount}
                        </p>
                    </div>
                </div>
            `;
        }

        printWindow.document.write(`
            <html>
                <head>
                    <title>Etiquetas ${shipment.id}</title>
                    <style>
                        body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 0; padding: 20px; }
                        .label-container { 
                            border: 2px solid #000; 
                            width: 100mm; 
                            height: 150mm; 
                            padding: 20px; 
                            box-sizing: border-box; 
                            display: flex; 
                            flex-direction: column; 
                            page-break-after: always;
                            margin-bottom: 20px;
                        }
                        .label-container:last-child { page-break-after: auto; }
                        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
                        .logo { max-width: 120px; max-height: 40px; }
                        .meta { text-align: right; font-size: 12px; }
                        .section-title { font-size: 10px; color: #666; text-transform: uppercase; margin: 0 0 5px 0; }
                        .origin, .destination { border-bottom: 1px dashed #ccc; padding-bottom: 15px; margin-bottom: 15px; }
                        .text-bold { font-weight: bold; font-size: 16px; margin: 0; }
                        .text-normal { font-size: 14px; margin: 5px 0 0 0; }
                        .details { flex-grow: 1; display:flex; gap: 20px; }
                        .barcode { text-align: center; border-top: 2px solid #000; padding-top: 15px; margin-top: auto; }
                        .barcode img { max-width: 100%; height: 60px; }
                        @media print { 
                            button { display: none; } 
                            body { padding: 0; } 
                            .label-container { margin-bottom: 0; border: none; }
                        }
                    </style>
                </head>
                <body>
                    ${labelsHtml}
                    <script>
                        window.onload = function() { window.print(); }
                    </script>
                </body>
            </html>
        `);
        printWindow.document.close();
    };


    const getStatusColor = (status) => {
        if (status === 'Entregado') return 'text-emerald-600 bg-emerald-50 border-emerald-200';
        if (status === 'En reparto') return 'text-blue-600 bg-blue-50 border-blue-200';
        if (status === 'Entrega aplazada') return 'text-amber-600 bg-amber-50 border-amber-200';
        return 'text-slate-600 bg-slate-50 border-slate-200';
    };

    return (
        <div className="min-h-screen bg-slate-50">
            {/* Aviso de sincronización pendiente — un envío puede quedar en cola (p.ej. tras
                un fallo de guardado) sin llegar a Supabase hasta que esto se resuelva; antes
                esto pasaba en completo silencio y el envío parecía "desaparecer". */}
            {pendingQueueCount > 0 && (
                <div className="sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 text-white text-sm font-medium">
                    <Clock size={15} className="shrink-0" />
                    {isSyncingQueue
                        ? `Sincronizando ${pendingQueueCount} envío${pendingQueueCount > 1 ? 's' : ''} pendiente${pendingQueueCount > 1 ? 's' : ''}...`
                        : `${pendingQueueCount} envío${pendingQueueCount > 1 ? 's' : ''} pendiente${pendingQueueCount > 1 ? 's' : ''} de sincronizar. Si no desaparece en unos minutos, contacta con Sumtrans.`}
                </div>
            )}
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
                <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        {/* Logo SUM — siempre visible */}
                        <img src="/logo-sum.svg" alt="Sumtrans" className="h-8 object-contain" />
                        {/* Logo del cliente — junto al SUM si existe */}
                        {client.customLogo && (
                            <img
                                src={client.customLogo}
                                alt={client.name}
                                className="h-8 object-contain rounded"
                                onError={(e) => { e.target.style.display = 'none'; }}
                            />
                        )}
                        <div className="h-6 w-px bg-slate-200 mx-1"></div>
                        <div>
                            <h1 className="font-bold text-slate-800 text-lg leading-tight">{client.name}</h1>
                            <p className="text-xs text-slate-500">Portal de Cliente</p>
                        </div>
                    </div>



                    {/* Ocultar botón Salir si estamos dentro del iframe de la web */}
                    {window.parent === window && (
                    <button 
                        onClick={onLogout}
                        className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                        <LogOut size={16} /> Salir
                    </button>
                    )}
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 py-8">
                {/* Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                        <div className="p-4 bg-blue-50 text-blue-600 rounded-xl"><Package size={24}/></div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Total Envíos</p>
                            <p className="text-3xl font-bold text-slate-800">{clientShipments.length}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                        <div className="p-4 bg-orange-50 text-orange-600 rounded-xl"><Truck size={24}/></div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">En Tránsito</p>
                            <p className="text-3xl font-bold text-slate-800">{activeCount}</p>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-4">
                        <div className="p-4 bg-emerald-50 text-emerald-600 rounded-xl"><CheckCircle size={24}/></div>
                        <div>
                            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">Entregados</p>
                            <p className="text-3xl font-bold text-slate-800">{deliveredCount}</p>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6 border-b border-slate-200">
                    <button 
                        onClick={() => setActiveTab('shipments')}
                        className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'shipments' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Package size={18} /> Mis Envíos
                    </button>
                    <button 
                        onClick={() => setActiveTab('create')}
                        className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'create' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Plus size={18} /> Crear Nuevo Envío
                    </button>
                    <button 
                        onClick={() => setActiveTab('import')}
                        className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'import' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <Upload size={18} /> Importar Excel
                    </button>
                    <button 
                        onClick={() => setActiveTab('settings')}
                        className={`pb-4 px-2 text-sm font-bold flex items-center gap-2 border-b-2 transition-colors ${activeTab === 'settings' ? 'border-blue-600 text-blue-600' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
                    >
                        <SettingsIcon size={18} /> Configuración
                    </button>
                </div>

                {/* Tab Content */}
                {activeTab === 'shipments' && (
                    <div className="space-y-4">
                        {/* Filtros */}
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Clock size={16} className="text-slate-400" />
                                <span className="text-sm font-bold text-slate-600">Filtrar por Fecha:</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <input 
                                    type="date" 
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                                <span className="text-slate-400">a</span>
                                <input 
                                    type="date" 
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {(dateFrom || dateTo) && (
                                <button
                                    onClick={() => { setDateFrom(''); setDateTo(''); }}
                                    className="text-sm font-medium text-red-500 hover:text-red-700 hover:underline"
                                >
                                    Limpiar filtros
                                </button>
                            )}

                            <button
                                onClick={descargarAlbaranesDelFiltro}
                                disabled={descargandoAlbaranes || albaranesDelFiltro.length === 0}
                                className="ml-auto flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-lg transition-colors bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                                title={albaranesDelFiltro.length === 0
                                    ? 'No hay albaranes entregados en las fechas seleccionadas'
                                    : 'Descarga en un solo PDF todos los albaranes de las fechas seleccionadas'}
                            >
                                {descargandoAlbaranes
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : <FileDown size={16} />
                                }
                                {descargandoAlbaranes
                                    ? 'Preparando PDF...'
                                    : `Descargar albaranes (${albaranesDelFiltro.length})`
                                }
                            </button>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-slate-50 text-slate-600 font-medium select-none">
                                    <tr>
                                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('id')}>
                                            ID Envío {sortConfig.key === 'id' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('date')}>
                                            Fecha {sortConfig.key === 'date' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th className="px-4 py-4 text-slate-500">
                                            🔖 Referencia
                                        </th>
                                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('destinationName')}>
                                            Destinatario {sortConfig.key === 'destinationName' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('destination')}>
                                            Destino {sortConfig.key === 'destination' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors" onClick={() => requestSort('status')}>
                                            Estado {sortConfig.key === 'status' ? (sortConfig.direction === 'asc' ? '↑' : '↓') : ''}
                                        </th>
                                        <th className="px-6 py-4 text-right">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {clientShipments.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="px-6 py-8 text-center text-slate-500">
                                                No tienes historial de envíos.
                                            </td>
                                        </tr>
                                    ) : (
                                        clientShipments.map(s => (
                                            <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                                                <td className="px-6 py-4 font-bold text-slate-800">{s.id}</td>
                                                <td className="px-6 py-4 text-slate-600">{new Date(s.createdAt || s.date).toLocaleDateString('es-ES')}</td>
                                                <td className="px-4 py-4">
                                                    {s.clientReference
                                                        ? <span className="font-mono text-xs bg-violet-50 text-violet-700 border border-violet-200 px-2 py-1 rounded-lg">{s.clientReference}</span>
                                                        : <span className="text-slate-300 text-xs">—</span>
                                                    }
                                                </td>
                                                <td className="px-6 py-4 font-medium text-slate-700">{s.destinationName || 'Destinatario'}</td>
                                                <td className="px-6 py-4 text-slate-500">{s.destinationCity || s.destination || '-'}</td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getStatusColor(s.status)}`}>
                                                            {s.status}
                                                        </span>
                                                        {s.hasCod && parseFloat(s.codAmount || 0) > 0 && (
                                                            <span
                                                                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border ${
                                                                    s.codPaid
                                                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                                                        : 'bg-amber-50 text-amber-800 border-amber-200'
                                                                }`}
                                                                title={s.codPaid ? 'Reembolso cobrado' : 'Reembolso pendiente de cobro al destinatario'}
                                                            >
                                                                💰 {parseFloat(s.codAmount).toFixed(2)} €
                                                                {!s.codPaid && <span className="text-[9px] font-black ml-0.5">PDTE</span>}
                                                            </span>
                                                        )}
                                                        {s.incidentStatus === 'active' && (
                                                            <button 
                                                                onClick={() => setSelectedShipment(s)}
                                                                className="px-2 py-0.5 rounded text-[10px] font-black bg-red-600 text-white animate-pulse shadow-sm hover:bg-red-700 transition-colors"
                                                                title="Pincha para ver el motivo de la incidencia"
                                                            >
                                                                INCIDENCIA
                                                            </button>
                                                        )}
                                                        {Array.isArray(s.scannedPackages) && s.scannedPackages.length > 0 && (
                                                            <span className={`px-2 py-1 rounded-full text-[10px] font-bold border shadow-sm ${
                                                                s.scannedPackages.length >= getPackagesCount(s)
                                                                    ? 'bg-green-100 text-green-700 border-green-200'
                                                                    : 'bg-orange-100 text-orange-700 border-orange-200'
                                                            }`}>
                                                                {s.scannedPackages.length}/{getPackagesCount(s)} BULTOS RECOGIDOS
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>

                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        {s.status === 'Pendiente de asignar' && (
                                                            <button 
                                                                onClick={() => {
                                                                    if (window.confirm('¿Estás seguro de que deseas borrar este envío?')) {
                                                                        onDeleteShipment(s.id);
                                                                    }
                                                                }}
                                                                className="p-2 text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                                                                title="Borrar Envío"
                                                            >
                                                                <Trash2 size={16} />
                                                            </button>
                                                        )}
                                                        <button 
                                                            onClick={() => setSelectedShipment(s)}
                                                            className="p-2 text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                                                            title="Ver Detalles y Descargar Albarán"
                                                        >
                                                            <FileText size={16} />
                                                        </button>
                                                        {s.status === 'Entregado' && (
                                                            <button 
                                                                onClick={async () => {
                                                                    try {
                                                                        await generateDeliveryPDF(s, client);
                                                                    } catch (err) {
                                                                        alert("Error al descargar el justificante: " + err.message);
                                                                    }
                                                                }}
                                                                className="p-2 text-emerald-600 bg-emerald-50 rounded-lg hover:bg-emerald-100 transition-colors"
                                                                title="Descargar Justificante de Entrega (POD)"
                                                            >
                                                                <Download size={16} />
                                                            </button>
                                                        )}

                                                        <button 
                                                            onClick={() => setLabelPrintShipment(s)}
                                                            className="p-2 text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
                                                            title="Imprimir Etiqueta"
                                                        >
                                                            <Printer size={16} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
                )}

                {activeTab === 'create' && (
                    <form onSubmit={handleCreateSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-3xl animate-in fade-in slide-in-from-bottom-4">
                        <h2 className="text-xl font-bold text-slate-800 mb-6">Datos del Nuevo Envío</h2>
                        
                        <div className="space-y-6">
                            {/* Origin (Auto-filled but editable) */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Recogida (Mis Datos)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Dirección de Recogida</label>
                                        <input required type="text" value={newOrigin} onChange={e=>setNewOrigin(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"/>
                                    </div>
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Localidad de Recogida</label>
                                        <input 
                                            required type="text" 
                                            value={newOriginCity} 
                                            onChange={e => { setNewOriginCity(e.target.value); setShowOriginCitySuggestions(true); }}
                                            onFocus={() => setShowOriginCitySuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowOriginCitySuggestions(false), 200)}
                                            autoComplete="off"
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Escribe para buscar..."
                                        />
                                        {showOriginCitySuggestions && filteredOriginCities.length > 0 && (
                                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
                                                {filteredOriginCities.map((p, i) => (
                                                    <button
                                                        key={`${p.name}-${p.zip}-${i}`}
                                                        type="button"
                                                        onMouseDown={() => {
                                                            setNewOriginCity(p.name);
                                                            if (p.zip) setNewOriginZip(p.zip);
                                                            setShowOriginCitySuggestions(false);
                                                        }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex justify-between items-center border-b border-slate-50 last:border-0"
                                                    >
                                                        <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                                                        {p.zip && <span className="text-xs text-slate-400 font-mono">{p.zip}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Código Postal Recogida</label>
                                        <input required type="text" value={newOriginZip} onChange={e=>setNewOriginZip(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"/>
                                    </div>
                                </div>
                            </div>

                            {/* Destination */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Destino</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="md:col-span-2 relative">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre / Empresa Destinatario</label>
                                        <input 
                                            required type="text" 
                                            value={newDestinationName} 
                                            onChange={e => { setNewDestinationName(e.target.value); setShowDestSuggestions(true); }}
                                            onFocus={() => setShowDestSuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowDestSuggestions(false), 200)}
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Empieza a escribir para ver sugerencias..."
                                        />
                                        {showDestSuggestions && filteredContacts.length > 0 && (
                                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                                                {filteredContacts.map(c => (
                                                    <button 
                                                        key={c.id} 
                                                        type="button"
                                                        onMouseDown={() => handleSelectContact(c)}
                                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 transition-colors flex flex-col border-b border-slate-50 last:border-0"
                                                    >
                                                        <span className="font-bold text-slate-800 text-sm">{c.name}</span>
                                                        <span className="text-xs text-slate-400">{c.address}{c.city ? `, ${c.city}` : ''}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Dirección Completa de Destino</label>
                                        <input required type="text" value={newDestination} onChange={e=>setNewDestination(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"/>
                                    </div>
                                    <div className="relative">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Localidad de Destino</label>
                                        <input 
                                            required type="text" 
                                            value={newDestinationCity} 
                                            onChange={e => { setNewDestinationCity(e.target.value); setShowDestCitySuggestions(true); }}
                                            onFocus={() => setShowDestCitySuggestions(true)}
                                            onBlur={() => setTimeout(() => setShowDestCitySuggestions(false), 200)}
                                            autoComplete="off"
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            placeholder="Escribe para buscar..."
                                        />
                                        {showDestCitySuggestions && filteredDestCities.length > 0 && (
                                            <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden max-h-[200px] overflow-y-auto">
                                                {filteredDestCities.map((p, i) => (
                                                    <button
                                                        key={`${p.name}-${p.zip}-${i}`}
                                                        type="button"
                                                        onMouseDown={() => {
                                                            setNewDestinationCity(p.name);
                                                            if (p.zip) setNewDestinationZip(p.zip);
                                                            setShowDestCitySuggestions(false);
                                                        }}
                                                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition-colors flex justify-between items-center border-b border-slate-50 last:border-0"
                                                    >
                                                        <span className="font-medium text-slate-800 text-sm">{p.name}</span>
                                                        {p.zip && <span className="text-xs text-slate-400 font-mono">{p.zip}</span>}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Código Postal Destino</label>
                                        <input required type="text" value={newDestinationZip} onChange={e=>setNewDestinationZip(e.target.value)} className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"/>
                                    </div>
                                </div>
                            </div>

                            {/* Cargo Info */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Carga</h3>
                                <div className="flex flex-col gap-4">
                                    <div className="flex flex-col md:flex-row gap-4">
                                        <div className="w-full md:w-1/2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Mercancía</label>
                                            <select 
                                                required 
                                                value={selectedArticleId} 
                                                onChange={e=>setSelectedArticleId(e.target.value)} 
                                                className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                            >
                                                <option value="" disabled>Selecciona un tipo...</option>
                                                {availableArticles.map(a => (
                                                    <option key={a.id} value={a.id}>{a.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="w-full md:w-1/2">
                                            <label className="block text-sm font-medium text-slate-700 mb-1">Reembolso a Cobrar (€)</label>
                                            <div className="relative">
                                                <input 
                                                    type="number" 
                                                    step="0.01"
                                                    value={codAmount} 
                                                    onChange={e=>setCodAmount(e.target.value)} 
                                                    placeholder="0.00"
                                                    className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all bg-white"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-slate-700 mb-2">Tipo de Porte</label>
                                        <div className="flex gap-2">
                                            <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer py-3 px-4 rounded-xl border transition-all ${porteType === 'Pagado' ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                <input type="radio" name="porteType" value="Pagado" checked={porteType === 'Pagado'} onChange={(e) => setPorteType(e.target.value)} className="hidden" />
                                                <span className="text-[12px] font-bold uppercase transition-all text-center">PAGADO<br/><span className="font-normal text-[10px] opacity-70">(Cargo en mi Factura)</span></span>
                                            </label>
                                            <label className={`flex-1 flex items-center justify-center gap-2 cursor-pointer py-3 px-4 rounded-xl border transition-all ${porteType === 'Debido' ? 'bg-amber-50 border-amber-200 text-amber-700 shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                                                <input type="radio" name="porteType" value="Debido" checked={porteType === 'Debido'} onChange={(e) => setPorteType(e.target.value)} className="hidden" />
                                                <span className="text-[12px] font-bold uppercase transition-all text-center">DEBIDO<br/><span className="font-normal text-[10px] opacity-70">(Cobro en Destino)</span></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                            <Tag size={14} className="text-slate-400" />
                                            Referencia / Código de Mercancía
                                            <span className="text-[10px] font-normal text-slate-400 ml-1">(Opcional)</span>
                                        </label>
                                        <input
                                            type="text"
                                            value={clientReference}
                                            onChange={e => setClientReference(e.target.value)}
                                            placeholder="Nº pedido, referencia interna, código de barras, SSCC..."
                                            className="w-full px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-violet-500 focus:border-violet-500 outline-none transition-all font-mono text-sm"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1 pl-1">Identifica tu mercancía o pedido. Aparecerá en el albarán y en la etiqueta.</p>
                                    </div>
                                    <div className="w-full">
                                        <label className="block text-sm font-medium text-slate-700 mb-1">Observaciones (Opcional)</label>
                                        <textarea 
                                            value={observations} 
                                            onChange={e=>setObservations(e.target.value)} 
                                            placeholder="Instrucciones, horario de entrega..."
                                            rows="3"
                                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all resize-y"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="pt-6 border-t border-slate-100">
                                <button type="submit" className="w-full bg-blue-600 text-white font-bold text-lg py-4 rounded-xl hover:bg-blue-700 transition-colors shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2">
                                    <Plus size={24} /> Crear Envío
                                </button>
                                <p className="text-center text-xs text-slate-500 mt-4">Al crear el envío, este pasará a estar pendiente de recogida por nosotros.</p>
                            </div>
                        </div>
                    </form>
                )}

                {activeTab === 'import' && (
                    <ImportExcelShipments
                        client={client}
                        onCreateShipment={onCreateShipment}
                        allShipments={allShipments}
                        articles={articles}
                        tariffs={tariffs}
                        coverageZones={coverageZones}
                        allClients={allClients}
                        onClose={() => setActiveTab('shipments')}
                    />
                )}

                {activeTab === 'settings' && (
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-3xl animate-in fade-in slide-in-from-bottom-4">
                        <h2 className="text-xl font-bold text-slate-800 mb-6">Configuración de Cliente</h2>
                        
                        <div className="space-y-8">
                            {/* Logo corporativo */}
                            <div>
                                <h3 className="text-sm font-bold text-slate-800 mb-2">Mi Logo Corporativo</h3>
                                <p className="text-sm text-slate-500 mb-4">
                                    Sube el logo de tu empresa. Este logo aparecerá en esta intranet y en todas las etiquetas de envío que imprimas, reemplazando al de la agencia de transportes.
                                </p>
                                
                                <div className="flex items-start gap-6">
                                    <div className="w-40 h-24 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center bg-slate-50 overflow-hidden shrink-0">
                                        {client.customLogo ? (
                                            <img src={client.customLogo} alt="Mi Logo" className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <span className="text-xs text-slate-400 font-medium">Sin logo</span>
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-sm rounded-lg transition-colors border border-slate-200">
                                            <Upload size={16} />
                                            Subir / Cambiar Logo
                                            <input 
                                                type="file" 
                                                accept="image/*" 
                                                className="hidden" 
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            if (onUpdateClient) {
                                                                onUpdateClient(client.id, { customLogo: reader.result });
                                                            }
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                        </label>
                                        <p className="text-xs text-slate-400 mt-2">Formato recomendado: PNG, JPG o SVG. Fondo transparente ideal.</p>
                                        
                                        {client.customLogo && (
                                            <button 
                                                onClick={() => {
                                                    if (onUpdateClient && window.confirm("¿Seguro que quieres borrar tu logo? Volverá a salir el de la agencia.")) {
                                                        onUpdateClient(client.id, { customLogo: null });
                                                    }
                                                }}
                                                className="mt-3 text-red-500 text-xs hover:underline font-medium"
                                            >
                                                Eliminar logo actual
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Preferencias de impresión */}
                            <div className="border-t border-slate-100 pt-6">
                                <div className="flex items-center gap-2 mb-1">
                                    <Tag size={16} className="text-slate-500" />
                                    <h3 className="text-sm font-bold text-slate-800">Preferencias de Impresión de Etiquetas</h3>
                                </div>
                                <p className="text-sm text-slate-500 mb-4">
                                    Elige el modo que se pre-seleccionará por defecto al imprimir una etiqueta.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                        (client.labelPrintMode === 'a6' || !client.labelPrintMode)
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="labelPrintMode"
                                            value="a6"
                                            checked={client.labelPrintMode === 'a6' || !client.labelPrintMode}
                                            onChange={() => onUpdateClient && onUpdateClient(client.id, { labelPrintMode: 'a6' })}
                                            className="mt-0.5 text-blue-600 border-slate-300 focus:ring-blue-500"
                                        />
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">🖨️ Etiquetadora A6</p>
                                            <p className="text-xs text-slate-500 mt-0.5 leading-snug">Impresión directa en tamaño A6 (105×148mm). Para impresoras térmicas o configuradas en A6.</p>
                                        </div>
                                    </label>
                                    <label className={`flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                                        client.labelPrintMode === 'a4'
                                            ? 'border-emerald-500 bg-emerald-50'
                                            : 'border-slate-200 hover:border-slate-300 bg-white'
                                    }`}>
                                        <input
                                            type="radio"
                                            name="labelPrintMode"
                                            value="a4"
                                            checked={client.labelPrintMode === 'a4'}
                                            onChange={() => onUpdateClient && onUpdateClient(client.id, { labelPrintMode: 'a4' })}
                                            className="mt-0.5 text-emerald-600 border-slate-300 focus:ring-emerald-500"
                                        />
                                        <div>
                                            <p className="font-bold text-slate-800 text-sm">📄 Folio A4 (4 posiciones)</p>
                                            <p className="text-xs text-slate-500 mt-0.5 leading-snug">Divide el folio A4 en 4 etiquetas A6 (2×2). La app recuerda qué posición usaste para aprovechar el papel.</p>
                                        </div>
                                    </label>
                                </div>
                                <p className="text-xs text-slate-400 mt-3 flex items-center gap-1">
                                    <span>ℹ️</span>
                                    Puedes cambiar el modo en cualquier momento desde el modal de impresión.
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </main>

            {selectedShipment && (
                <ShipmentDetailsModal
                    isOpen={!!selectedShipment}
                    onClose={() => {
                        setSelectedShipment(null);
                    }}
                    shipment={selectedShipment}
                    isReadOnly={true}
                    isDriver={false}
                    articles={articles}
                    clients={allClients}
                    tariffs={tariffs}
                    isClientView={true}
                />
            )}

            <LabelPrintModal
                isOpen={!!labelPrintShipment}
                onClose={() => setLabelPrintShipment(null)}
                shipment={labelPrintShipment}
                client={client}
                onUpdateClient={onUpdateClient}
            />
        </div>
    );
}
