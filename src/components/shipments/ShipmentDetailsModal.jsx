import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Map as MapIcon, Calendar, Clock, Package, User, Phone, FileText, Euro, CreditCard, Save, Edit2, Truck, Printer, Shield, Fingerprint, Image as ImageIcon, ExternalLink, Download, Loader2, MessageSquare, Camera, Wallet } from 'lucide-react';

import { printShipmentTicket } from '../../utils/printShipment';
import { printSimplifiedInvoice } from '../../utils/printSimplifiedInvoice';
import { generateDeliveryPDF } from '../../utils/deliveryPdf';
import { uploadProof } from '../../utils/storage';
import { compressImage } from '../../utils/imageCompression';
import CameraCaptureModal from '../CameraCaptureModal';
import { getPackagesCount } from '../../utils/shipmentUtils';


import { Trash2, Plus } from 'lucide-react';
import { calcularComisionReembolso } from '../../utils/comisionReembolso';
import { baremoDelEnvio, precioUnitarioArticulo, repreciarArticulos } from '../../utils/precioArticulo';
export default function ShipmentDetailsModal({ isOpen, onClose, shipment, onUpdate, allPoblaciones, drivers = [], clients = [], tariffs = null, coverageZones = [], articles = [], familyOrder = [], isReadOnly = false, onWhatsAppShare, hidePrices = false, hideTicketPrint = false, isClientView = false, clientePortal = null, driverNamePreference = 'both', zoom = 1 }) {
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({});
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [newPhoto, setNewPhoto] = useState(null); // Local pre-upload photo
    const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
    const [codReceiptPhoto, setCodReceiptPhoto] = useState(null); // COD receipt photo (new upload)
    const [isUploadingCodReceipt, setIsUploadingCodReceipt] = useState(false);
    const [isSavingInvoice, setIsSavingInvoice] = useState(false);
    const fileInputRef = useRef(null);
    const codReceiptInputRef = useRef(null);
    // Cámara dentro de la app: 'mercancia' o 'justificante'. Salir a la del móvil
    // deja que Android mate la app con la ficha a medio editar.
    const [camaraAbierta, setCamaraAbierta] = useState(null);
    
    // Porte tecleado a mano cuando el precio va oculto (cliente de facturación /
    // presupuesto). null = no se ha tocado, así el precio de tarifa sigue sin verse.
    // Mismo mecanismo que el alta (CreateShipmentModal), donde sí se podía.
    const [priceOverride, setPriceOverride] = useState(null);

    const [selectedArticles, setSelectedArticles] = useState([]);
    const [tempArticleId, setTempArticleId] = useState('');
    const [tempQuantity, setTempQuantity] = useState(1);
    const [weightKg, setWeightKg] = useState('');


    const weightClientData = React.useMemo(() => {
        // Solo el cliente que PAGA determina si va por kilos
        const pt = formData.porteType || 'Pagado';
        const payingClientName = pt === 'Pagado' ? formData.client : formData.destinationName;
        if (!payingClientName) return null;
        
        const cName = payingClientName.toLowerCase().trim();
        const client = (clients || []).find(c =>
            String(c.name || '').toLowerCase().trim() === cName ||
            String(c.legalName || '').toLowerCase().trim() === cName
        );
        
        if (client) {
            const hasTariff = client.weightTariff && Array.isArray(client.weightTariff) && client.weightTariff.length > 0;
            const isByKilos = client.tariffType === 'Por Kilos';
            if (hasTariff || isByKilos) {
                return { client, tariff: client.weightTariff || [] };
            }
        }
        return null;
    }, [formData.porteType, formData.client, formData.destinationName, clients]);

    const calculateWeightPrice = (kg, tariff, clientData) => {
        if (!kg) return 0;
        const weight = parseFloat(kg);
        if (isNaN(weight) || weight <= 0) return 0;

        if (clientData?.weightCalculationMode === 'formula' && clientData?.weightFormula) {
            const { baseKg, basePrice, extraKgPrice } = clientData.weightFormula;
            const bKg = parseFloat(baseKg) || 0;
            const bPrice = parseFloat(basePrice) || 0;
            const ePrice = parseFloat(extraKgPrice) || 0;

            if (weight <= bKg) return bPrice;
            return bPrice + ((weight - bKg) * ePrice);
        }

        if (!tariff || tariff.length === 0) return 0;
        const sorted = [...tariff].sort((a, b) => a.maxKg - b.maxKg);
        const bracket = sorted.find(b => weight <= b.maxKg);
        if (bracket) return parseFloat(bracket.price);
        return parseFloat(sorted[sorted.length - 1].price);
    };

    // customRates ("Tarifa Especial" en la ficha del cliente) vive en el cliente
    // PADRE, pero el remitente o el destinatario de un albarán puede ser una
    // SEDE concreta suya. Buscar solo por c.name/c.legalName no encontraba
    // nunca al padre a través de la sede: cambiar el pagador a una sede con
    // tarifa especial pactada se quedaba con el precio normal del artículo,
    // como si no tuviera ningún acuerdo.
    const findBillingClient = (name) => {
        const cName = String(name || '').toLowerCase().trim();
        if (!cName) return null;
        return (clients || []).find(c =>
            String(c.name || '').toLowerCase().trim() === cName ||
            String(c.legalName || '').toLowerCase().trim() === cName ||
            (c.branches || []).some(b => String(b.name || '').toLowerCase().trim() === cName)
        ) || null;
    };

    // Baremo del envío con lo que hay ahora mismo en la ficha: la misma cuenta que
    // usa el alta (utils/precioArticulo.js), para que editar dé el mismo precio.
    const baremoActual = () => baremoDelEnvio(formData, { tariffs, coverageZones });

    // Misma cuenta única que en CreateShipmentModal, y por el mismo motivo: aquí
    // el importe se rehacía en tres sitios más (añadir artículo, quitarlo y el
    // recálculo al cambiar quién paga) y ninguno sumaba el porte por peso, así
    // que editar un albarán de tarifa por kilos lo devolvía a 0,00 €.
    const calcularImporteTotal = (articulos, kilos = weightKg) => {
        const articlesTotal = (articulos || []).reduce((sum, item) => sum + item.totalPrice, 0);
        const commission = parseFloat(formData.codCommission) || 0;
        const portePorPeso = weightClientData
            ? calculateWeightPrice(kilos, weightClientData.tariff, weightClientData.client)
            : 0;
        return (articlesTotal + portePorPeso + commission).toFixed(2);
    };

    const addArticle = (articleId) => {
        const idToUse = articleId || tempArticleId;
        if (!idToUse || tempQuantity < 1) return;
        const article = (articles || []).find(a => a.id.toString() === idToUse.toString());
        if (!article) return;

        // Mismo cálculo que el alta (utils/precioArticulo.js): baremo del pueblo,
        // tarifa especial del que paga, precio por zona y precio B2 del artículo.
        // Antes aquí sólo se miraba el precio base y la tarifa especial, y un
        // artículo a un pueblo de Baremo 2 se añadía al precio de Baremo 1.
        // Para clientes "Por Kilos" el precio viene del peso, NO del artículo.
        const { baremo, tariffId } = baremoActual();
        const pt = formData.porteType || 'Pagado';
        const payingClientName = pt === 'Pagado' ? formData.client : formData.destinationName;
        const client = findBillingClient(payingClientName);
        const price = precioUnitarioArticulo(article, { baremo, tariffId, cliente: client, porKilos: !!weightClientData });

        const newItem = {
            ...article,
            quantity: Number(tempQuantity),
            unitPrice: price,
            totalPrice: price * Number(tempQuantity),
            uniqueId: Date.now().toString()
        };
        
        const updatedList = [...selectedArticles, newItem];
        setSelectedArticles(updatedList);
        
        setFormData(prev => ({ ...prev, amount: calcularImporteTotal(updatedList) }));
        setTempArticleId('');
        setTempQuantity(1);
    };

    const removeArticle = (uniqueId) => {
        const updatedList = selectedArticles.filter(item => item.uniqueId !== uniqueId);
        setSelectedArticles(updatedList);
        setFormData(prev => ({ ...prev, amount: calcularImporteTotal(updatedList) }));
    };

    // Si el admin corrige quién paga (Pagado ↔ Debido) o cambia el pueblo de origen
    // o destino, los artículos ya añadidos se quedan con el precio calculado para
    // el pagador y el baremo ANTERIORES. Se recalculan aquí con la misma cuenta del
    // alta (baremo, tarifa especial del que paga, precio por zona y precio B2).
    //
    // Sólo salta cuando cambia algo de eso DURANTE la edición. Antes saltaba también
    // al pulsar Editar y, como no conocía los baremos, abrir un albarán a un pueblo
    // de Baremo 2 lo abarataba al precio de Baremo 1 y "Guardar Cambios" pisaba el
    // importe bueno aunque no se hubiera tocado nada.
    const clavePrecioAnterior = useRef(null);
    useEffect(() => {
        if (!isEditing) {
            clavePrecioAnterior.current = null;
            return;
        }
        const clave = JSON.stringify([
            formData.porteType || 'Pagado', formData.client, formData.destinationName,
            formData.originCity, formData.originZip, formData.destinationCity, formData.destinationZip
        ]);
        if (clavePrecioAnterior.current === null) {
            // Entrar a editar no toca el precio guardado.
            clavePrecioAnterior.current = clave;
            return;
        }
        if (clave === clavePrecioAnterior.current) return;
        clavePrecioAnterior.current = clave;
        if (selectedArticles.length === 0) return;

        const pt = formData.porteType || 'Pagado';
        const payingClientName = pt === 'Pagado' ? formData.client : formData.destinationName;
        const client = findBillingClient(payingClientName);
        const { baremo, tariffId } = baremoActual();
        const { articulos, cambiaron } = repreciarArticulos(selectedArticles, { baremo, tariffId, cliente: client, porKilos: !!weightClientData });
        if (cambiaron) {
            setSelectedArticles(articulos);
            setFormData(prev => ({ ...prev, amount: calcularImporteTotal(articulos) }));
        }
    }, [isEditing, formData.porteType, formData.client, formData.destinationName, formData.originCity, formData.originZip, formData.destinationCity, formData.destinationZip]);

    useEffect(() => {
        if (shipment) {
            // Los artículos guardados son la fuente de verdad.
            // Si hay articles[], regeneramos el texto de packages a partir de ellos.
            // Así la vista y el editor siempre muestran los mismos datos.
            const currentArticles = shipment.articles || [];
            let packagesText = '';
            if (currentArticles.length > 0) {
                packagesText = currentArticles.map(a => `${a.quantity || 1}x ${a.name}`).join('\n');
            } else {
                packagesText = shipment.packages || '';
            }
            setSelectedArticles(currentArticles);
            setWeightKg(shipment.weightKg || '');
            setFormData({
                ...shipment,
                packages: packagesText
            });
            setIsEditing(false);
            setCodReceiptPhoto(null);
            setPriceOverride(null);
        }
    }, [shipment, isOpen]);

    if (!isOpen || !shipment) return null;

    const handleSave = async () => {
        if (onUpdate && !isReadOnly) {
            setIsUploadingPhoto(true);
            let finalFormData = { ...formData };

            // ── ARTÍCULOS Y KILOS ────────────────────────────────────────────────
            // selectedArticles y weightKg se gestionan en estado propio (fuera de
            // formData), así que hay que fusionarlos explícitamente antes de guardar.
            finalFormData.articles = selectedArticles;
            if (weightKg !== '' && weightKg !== null && weightKg !== undefined) {
                finalFormData.weightKg = weightKg;
            }
            
            try {
                // REVERSION DE ESTADO MANUAL POR ADMINISTRADOR
                if (shipment.status === 'Entregado' && finalFormData.status !== 'Entregado') {
                    if (window.confirm(`⚠️ Vas a revertir este envío a "${finalFormData.status.toUpperCase()}".\n\n- Se borrarán permanentemente las firmas y fotos de entrega.\n- Se eliminará la hora de entrega.\n- El envío volverá a figurar como incompleto.\n\n¿Estás completamente seguro?`)) {
                        finalFormData.deliverySignature = null;
                        finalFormData.deliveryPhoto = null;
                        finalFormData.deliveryCoordinates = null;
                        finalFormData.paidAt = null;
                        finalFormData.receiverName = null;
                        finalFormData.receiverId = null;
                    } else {
                        // Abortar si el usuario cancela
                        finalFormData.status = 'Entregado';
                        setFormData(prev => ({ ...prev, status: 'Entregado' }));
                        setIsUploadingPhoto(false);
                        return;
                    }
                }

                // REVERSION DE COBROS MANUAL POR ADMINISTRADOR
                if (shipment.portePaid && !finalFormData.portePaid) {
                    finalFormData.porteCollectedById = null;
                    finalFormData.isPaid = false; // Compatibilidad
                }
                if (shipment.hasCod && shipment.codPaid && !finalFormData.codPaid) {
                    finalFormData.codCollectedById = null;
                    finalFormData.isCodPaid = false; // Compatibilidad
                }

                // Sincronizar portePaid e isPaid (ya que son equivalentes)
                if (finalFormData.portePaid) finalFormData.isPaid = true;
                if (finalFormData.codPaid) finalFormData.isCodPaid = true;

                // Forzar que el customAmount coincida con el importe final real del albarán,
                // de esta forma las cajas y recaudaciones tomarán este nuevo valor si el admin lo cambia.
                //
                // El campo "Precio Final Porte" se edita como texto libre y se inicializa con
                // el valor tal cual viene del albarán, que suele llevar el símbolo de moneda
                // ("€7.00") o ser literalmente "Tarifa". parseFloat("€7.00") da NaN —no puede
                // con el símbolo por delante— así que al guardar CUALQUIER cambio de la ficha
                // (aunque no se tocara el precio) customAmount se corrompía a NaN en silencio.
                // El resto de la app (el modelo, el modal de entrega) se defiende de eso cayendo
                // a `amount`, pero la etiqueta "COBRAR" de la tarjeta de reparto no lo hacía y
                // desaparecía aunque el porte siguiera pendiente de cobro.
                // Se limpia el símbolo antes de parsear, y si no queda ningún número (p.ej.
                // "Tarifa"), NO se toca customAmount — mejor dejarlo como estaba que corromperlo.
                if (finalFormData.amount !== undefined && finalFormData.amount !== null) {
                    const importeLimpio = parseFloat(
                        String(finalFormData.amount).replace(/[^0-9.,-]+/g, '').replace(',', '.')
                    );
                    if (Number.isFinite(importeLimpio)) {
                        finalFormData.customAmount = importeLimpio;
                    }
                }

                // Si hay una foto nueva seleccionada, la subimos
                if (newPhoto && newPhoto.startsWith('data:image')) {
                    const uploadedUrl = await uploadProof(shipment.id, newPhoto, 'merchandise_photos');
                    if (uploadedUrl) {
                        finalFormData.merchandisePhoto = uploadedUrl;
                    }
                } else if (newPhoto === 'REMOVE') {
                    // Si el usuario activó borrar la foto
                    finalFormData.merchandisePhoto = null;
                }

                await onUpdate(shipment.id, finalFormData);
                setIsEditing(false);
                setNewPhoto(null);
                setCodReceiptPhoto(null);
            } catch (err) {
                console.error("Error saving shipment changes:", err);
                alert("Error al guardar los cambios o subir la imagen.");
            } finally {
                setIsUploadingPhoto(false);
            }
        }
    };

    const handlePhotoChange = async (e) => {
        const file = e.target.files[0];
        e.target.value = ''; // Permite repetir la misma foto y suelta el fichero
        if (!file) return;
        if (file.size > 20 * 1024 * 1024) {
            alert("La imagen es demasiado grande. Máximo 20MB.");
            return;
        }
        // Aquí la foto se guardaba en crudo: además de pesar en la nube, descomprimir
        // una foto de móvil entera dejaba sin memoria al navegador y cerraba la app.
        try {
            setNewPhoto(await compressImage(file, 1200, 1200, 0.75));
        } catch (err) {
            console.error('[Foto mercancia] No se pudo comprimir la foto:', err);
            alert("No se ha podido procesar la foto. Vuelve a intentarlo.");
        }
    };

    // El justificante se sube en cuanto se hace la foto, igual que por el input.
    const subirJustificante = async (dataUrl) => {
        setIsUploadingCodReceipt(true);
        try {
            const uploadedUrl = await uploadProof(shipment.id, dataUrl, 'delivery_photos');
            if (uploadedUrl && onUpdate) {
                await onUpdate(shipment.id, { codReceiptPhoto: uploadedUrl });
                setCodReceiptPhoto(uploadedUrl);
            }
        } catch (err) {
            console.error('Error uploading COD receipt:', err);
            alert('Error al subir el justificante: ' + err.message);
        } finally {
            setIsUploadingCodReceipt(false);
        }
    };

    const alHacerFoto = (foto) => {
        const destino = camaraAbierta;
        setCamaraAbierta(null);
        if (destino === 'justificante') subirJustificante(foto);
        else setNewPhoto(foto);
    };

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    // originCoordinates/destinationCoordinates son una FOTO tomada al crear el
    // albarán (de la sede, o del GPS de quien lo creó si tocó "capturar
    // ubicación"). Si luego se corrige la coordenada en la ficha del cliente/
    // sede, los albaranes ya creados NO se actualizan solos y se quedan con la
    // posición vieja en el mapa de ruta. Esto busca el valor actual guardado
    // en cliente o sede para poder resincronizar un albarán puntual.
    const findSavedCoordinates = (name) => {
        const norm = String(name || '').trim().toLowerCase();
        if (!norm) return null;
        for (const c of (clients || [])) {
            if (String(c.name || '').trim().toLowerCase() === norm) return c.coordinates || null;
            const b = (c.branches || []).find(br => String(br.name || '').trim().toLowerCase() === norm);
            if (b) return b.coordinates || null;
        }
        return null;
    };

    // billingType/destinationBillingType son otra FOTO tomada al crear el albarán
    // (misma familia de bug que las coordenadas). Si al editar se cambia el
    // remitente o el destinatario a otro cliente —o a uno nuevo que aún no está
    // en la ficha, pendiente de validar—, sin esto el albarán se queda con el
    // tipo de facturación del cliente ANTERIOR: un destinatario de Facturación
    // (no cobra a la entrega) podía convertirse en un cliente nuevo real, que sí
    // hay que cobrar, y seguir marcado como si no hubiera que cobrarle. Mismo
    // criterio que usa CreateShipmentModal al crear: cliente no encontrado en la
    // ficha → 'Clientes Habituales' (se cobra en el momento), igual que un
    // cliente desconocido.
    const lookupBillingType = (name) => {
        const norm = String(name || '').trim().toLowerCase();
        if (!norm) return 'Clientes Habituales';
        for (const c of (clients || [])) {
            if (String(c.name || '').trim().toLowerCase() === norm || String(c.legalName || '').trim().toLowerCase() === norm) {
                return c.billingType || 'Clientes Habituales';
            }
            const b = (c.branches || []).find(br => String(br.name || '').trim().toLowerCase() === norm);
            if (b) return c.billingType || 'Clientes Habituales';
        }
        return 'Clientes Habituales';
    };

    // Resolve driver name from ID
    const resolveDriver = (driverId) => {
        if (!driverId) return null;
        const d = (drivers || []).find(dr => String(dr.id) === String(driverId));
        if (!d) return `Conductor #${driverId}`;
        const name = d.name || '';
        const alias = d.alias || '';
        if (driverNamePreference === 'alias' && alias) return alias;
        if (driverNamePreference === 'name') return name;
        return alias ? `${name} (${alias})` : name;
    };

    // Format ISO date to readable string
    const formatDate = (value) => {
        if (!value) return null;
        try {
            const d = new Date(value);
            if (isNaN(d.getTime())) return String(value);
            return d.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        } catch { return String(value); }
    };

    // Helper to render field or input
    const renderField = (label, value, fieldName, icon = null, type = "text", fullWidth = false) => {
        return (
            <div className={`space-y-1 ${fullWidth ? 'col-span-full' : ''}`}>
                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                    {icon && React.cloneElement(icon, { size: 12 })}
                    {label}
                </span>
                {isEditing && !isReadOnly ? (
                    type === 'textarea' ? (
                        <textarea
                            value={formData[fieldName] || ''}
                            onChange={(e) => handleChange(fieldName, e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            rows={3}
                        />
                    ) : (
                        <input
                            type={type}
                            value={formData[fieldName] || ''}
                            onChange={(e) => handleChange(fieldName, e.target.value)}
                            className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        />
                    )
                ) : (
                    <p className="text-gray-800 font-medium text-sm break-words whitespace-pre-wrap">
                        {value || <span className="text-gray-300 italic">No especificado</span>}
                    </p>
                )}
            </div>
        );
    };

    // El modal se saca del árbol del dashboard con un portal a propósito: el dashboard
    // del conductor va envuelto en `style={{ zoom }}` (la lupa A+/A-), y el zoom de CSS
    // no ajusta las unidades de viewport (ver memoria zoom-css-rompe-vh-en-el-dashboard),
    // así que el marco `modal-mobile-height` (dvh) se dibuja mal dentro de ese subárbol.
    // Fuera del zoom, `fixed inset-0` y `dvh` valen exactamente lo que mide la pantalla.
    // El zoom del conductor se reaplica más abajo, pero sólo al CONTENIDO de cada bloque.
    return createPortal(
        <div className="fixed inset-0 bg-slate-900/90 z-[100] flex items-end sm:items-center justify-center sm:p-4 backdrop-blur-md animate-in fade-in duration-200">
            {isEditing && !isReadOnly && (
                <datalist id="edit-clients-list">
                    {(clients || []).map(c => (
                        <option key={`client-${c.id}`} value={c.name} />
                    ))}
                    {(clients || []).flatMap(c => c.branches || []).map(b => (
                        <option key={`branch-${b.id}`} value={b.name} />
                    ))}
                </datalist>
            )}
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col modal-mobile-height">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between z-10 shrink-0" style={{ zoom }}>
                    <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${shipment.type === 'Recogida' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'}`}>
                            <Package size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-gray-800 leading-tight">
                                {shipment.type === 'Recogida' ? 'Detalles de Recogida' : 'Albarán de Entrega'}
                            </h2>
                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                <p className="text-xs text-gray-500 font-mono">REF: {shipment.id}</p>
                                {Array.isArray(shipment.scannedPackages) && shipment.scannedPackages.length > 0 && (
                                    <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded shadow-sm ${
                                        shipment.scannedPackages.length >= getPackagesCount(shipment)
                                            ? 'bg-green-600 text-white'
                                            : 'bg-orange-500 text-white'
                                    }`}>
                                        {shipment.scannedPackages.length}/{getPackagesCount(shipment)} BULTOS ESCANEADOS
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isEditing && !isReadOnly && (
                            <button
                                id="tour-edit-btn"
                                onClick={() => setIsEditing(true)}
                                className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                                title="Editar"
                            >
                                <Edit2 size={20} />
                            </button>
                        )}
                        <button
                            onClick={() => onWhatsAppShare?.(shipment)}
                            className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors"
                            title="Compartir por WhatsApp"
                        >
                            <MessageSquare size={20} />
                        </button>
                        {!hideTicketPrint && (
                            <button
                                onClick={() => printShipmentTicket(shipment)}
                                className="p-2 text-slate-600 hover:bg-slate-50 rounded-full transition-colors"
                                title="Imprimir Albarán/Justificante"
                            >
                                <Printer size={20} />
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 rounded-full transition-colors"
                        >
                            <X size={24} />
                        </button>
                    </div>
                </div>

                <div className="p-3 sm:p-6 space-y-4 sm:space-y-6 flex-1 overflow-y-auto bg-slate-50/50" style={{ zoom }}>
                    {/* Client Information */}
                    <div className="bg-gray-50 p-4 rounded-xl space-y-4 border border-gray-100">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2 text-[10px] uppercase tracking-wider border-b border-gray-200 pb-2">
                            <User size={14} className="text-blue-500" />
                            Datos del Cliente / Pagador
                        </h3>
                        <div className="grid grid-cols-2 gap-4">
                            {renderField("Cliente", formData.client, "client", null, "text", true)}
                            {/* Previously 'clientName' was used, corrected to 'formData.client' */}
                        </div>
                    </div>

                    {/* Locations */}
                    <div className="space-y-4">
                        <div className="relative pl-4 border-l-2 border-dashed border-gray-300 space-y-6">
                            {/* Origin */}
                            <div id="tour-edit-origin" className="relative">
                                <div className="absolute -left-[21px] top-0 w-3 h-3 rounded-full bg-blue-500 ring-4 ring-white"></div>
                                <h4 className="text-[10px] font-bold text-blue-600 mb-1.5 uppercase tracking-widest">Origen (Remitente)</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">Nombre</span>
                                        {isEditing && !isReadOnly ? (
                                            <input
                                                type="text"
                                                value={formData.originName || formData.senderName || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleChange("originName", val);
                                                    handleChange("billingType", lookupBillingType(val));

                                                    const match = (clients || []).find(c => (c.name || '').toLowerCase() === val.toLowerCase());
                                                    if (match) {
                                                        handleChange("originAddress", match.address || '');
                                                        handleChange("originCity", match.city || '');
                                                        handleChange("originZip", match.zip || '');
                                                        handleChange("originPhone", match.phone || '');
                                                    } else {
                                                        for (const c of (clients || [])) {
                                                            if (Array.isArray(c.branches)) {
                                                                const bMatch = c.branches.find(b => (b.name || '').toLowerCase() === val.toLowerCase());
                                                                if (bMatch) {
                                                                    handleChange("originAddress", bMatch.address || '');
                                                                    handleChange("originCity", bMatch.city || '');
                                                                    handleChange("originZip", bMatch.zip || '');
                                                                    handleChange("originPhone", bMatch.phone || '');
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }}
                                                list="edit-clients-list"
                                                className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-gray-800 font-medium text-sm break-words whitespace-pre-wrap">
                                                {formData.originName || formData.senderName || <span className="text-gray-300 italic">No especificado</span>}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                            {renderField("Dirección", formData.originAddress || formData.origin, "originAddress", <MapPin />)}
                                        </div>
                                        <a 
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formData.originCoordinates || `${formData.originAddress || formData.origin}, ${formData.originCity || ''}`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-5 px-3 py-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors flex items-center gap-1.5 text-xs font-bold"
                                            title="Navegar a Origen"
                                        >
                                            <MapIcon size={14} /> Navegar
                                        </a>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Población", formData.originCity, "originCity")}
                                        {renderField("C.P.", formData.originZip, "originZip")}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Teléfono", formData.originPhone, "originPhone", <Phone />)}
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                            <MapIcon size={12} /> Coordenadas GPS (mapa de ruta)
                                        </span>
                                        {isEditing && !isReadOnly ? (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={formData.originCoordinates || ''}
                                                    onChange={(e) => handleChange('originCoordinates', e.target.value)}
                                                    placeholder="37.9052, -4.7192"
                                                    className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                                />
                                                <button
                                                    type="button"
                                                    title="Volver a tomar la ubicación guardada en la ficha del cliente/sede"
                                                    onClick={() => {
                                                        const saved = findSavedCoordinates(formData.originName || formData.senderName);
                                                        if (saved) handleChange('originCoordinates', saved);
                                                        else alert('Ese remitente no tiene coordenadas guardadas en su ficha.');
                                                    }}
                                                    className="px-3 py-2 bg-blue-50 text-blue-600 rounded-lg border border-blue-100 hover:bg-blue-100 text-[10px] font-bold whitespace-nowrap shrink-0"
                                                >
                                                    🔄 Usar la de la ficha
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-gray-800 font-medium text-sm font-mono">
                                                {formData.originCoordinates || <span className="text-gray-300 italic">No guardadas (usará la dirección)</span>}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Destination */}
                            <div id="tour-edit-destination" className="relative">
                                <div className="absolute -left-[21px] top-0 w-3 h-3 rounded-full bg-green-500 ring-4 ring-white"></div>
                                <h4 className="text-[10px] font-bold text-green-600 mb-1.5 uppercase tracking-widest">Destino (Entrega)</h4>
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">Nombre</span>
                                        {isEditing && !isReadOnly ? (
                                            <input
                                                type="text"
                                                value={formData.destinationName || formData.receiverName || ''}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    handleChange("destinationName", val);
                                                    handleChange("destinationBillingType", lookupBillingType(val));

                                                    const match = (clients || []).find(c => (c.name || '').toLowerCase() === val.toLowerCase());
                                                    if (match) {
                                                        handleChange("destinationAddress", match.address || '');
                                                        handleChange("destinationCity", match.city || '');
                                                        handleChange("destinationZip", match.zip || '');
                                                        handleChange("destinationPhone", match.phone || '');
                                                    } else {
                                                        for (const c of (clients || [])) {
                                                            if (Array.isArray(c.branches)) {
                                                                const bMatch = c.branches.find(b => (b.name || '').toLowerCase() === val.toLowerCase());
                                                                if (bMatch) {
                                                                    handleChange("destinationAddress", bMatch.address || '');
                                                                    handleChange("destinationCity", bMatch.city || '');
                                                                    handleChange("destinationZip", bMatch.zip || '');
                                                                    handleChange("destinationPhone", bMatch.phone || '');
                                                                    break;
                                                                }
                                                            }
                                                        }
                                                    }
                                                }}
                                                list="edit-clients-list"
                                                className="w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                            />
                                        ) : (
                                            <p className="text-gray-800 font-medium text-sm break-words whitespace-pre-wrap">
                                                {formData.destinationName || formData.receiverName || <span className="text-gray-300 italic">No especificado</span>}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-start gap-2">
                                        <div className="flex-1">
                                            {renderField("Dirección", formData.destinationAddress || formData.destination || formData.address, "destinationAddress", <MapPin />)}
                                        </div>
                                        <a 
                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(formData.destinationCoordinates || `${formData.destinationAddress || formData.destination || formData.address}, ${formData.destinationCity || ''}`)}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="mt-5 px-3 py-2 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 transition-colors flex items-center gap-1.5 text-xs font-bold"
                                            title="Navegar a Destino"
                                        >
                                            <MapIcon size={14} /> Navegar
                                        </a>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Población", formData.destinationCity, "destinationCity")}
                                        {renderField("C.P.", formData.destinationZip, "destinationZip")}
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        {renderField("Teléfono", formData.destinationPhone, "destinationPhone", <Phone />)}
                                        {renderField("Contacto", formData.destinationContact, "destinationContact", <User />)}
                                    </div>
                                    <div className="space-y-1">
                                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                            <MapIcon size={12} /> Coordenadas GPS (mapa de ruta)
                                        </span>
                                        {isEditing && !isReadOnly ? (
                                            <div className="flex gap-2">
                                                <input
                                                    type="text"
                                                    value={formData.destinationCoordinates || ''}
                                                    onChange={(e) => handleChange('destinationCoordinates', e.target.value)}
                                                    placeholder="37.9052, -4.7192"
                                                    className="flex-1 min-w-0 text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-mono"
                                                />
                                                <button
                                                    type="button"
                                                    title="Volver a tomar la ubicación guardada en la ficha del cliente/sede"
                                                    onClick={() => {
                                                        const saved = findSavedCoordinates(formData.destinationName || formData.receiverName);
                                                        if (saved) handleChange('destinationCoordinates', saved);
                                                        else alert('Ese destinatario no tiene coordenadas guardadas en su ficha.');
                                                    }}
                                                    className="px-3 py-2 bg-green-50 text-green-600 rounded-lg border border-green-100 hover:bg-green-100 text-[10px] font-bold whitespace-nowrap shrink-0"
                                                >
                                                    🔄 Usar la de la ficha
                                                </button>
                                            </div>
                                        ) : (
                                            <p className="text-gray-800 font-medium text-sm font-mono">
                                                {formData.destinationCoordinates || <span className="text-gray-300 italic">No guardadas (usará la dirección)</span>}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Details (Amounts, Packages) */}
                    {!isClientView && (
                        <div id="tour-edit-amounts" className="grid grid-cols-2 gap-4">
                                                {hidePrices ? (
                            /* Precio oculto (cliente de facturación/presupuesto): el conductor no
                               ve la tarifa, pero SÍ puede teclear otro porte si este envío lleva
                               un precio distinto — igual que en el alta. Mientras no escriba nada
                               la casilla va vacía y el importe guardado no se toca. */
                            <div className="space-y-1">
                                <span className="text-xs font-bold text-gray-400 uppercase tracking-wider flex items-center gap-1">
                                    <Euro size={12} /> Precio Final Porte
                                </span>
                                {isEditing && !isReadOnly ? (
                                    <input
                                        type="number"
                                        step="0.01"
                                        inputMode="decimal"
                                        placeholder="FACTURACIÓN - pulsa para cambiar"
                                        value={priceOverride !== null ? priceOverride : ''}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            // Si la vacía, se vuelve al importe que ya tenía el albarán:
                                            // borrar la casilla no puede dejar el porte a cero.
                                            setPriceOverride(val === '' ? null : val);
                                            handleChange('amount', val === '' ? (shipment.amount ?? '') : val);
                                        }}
                                        className={`w-full text-sm border border-gray-300 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none font-bold ${priceOverride === null ? 'text-slate-400 italic' : 'text-slate-700'}`}
                                    />
                                ) : (
                                    <p className="text-slate-400 italic font-medium text-sm">FACTURACIÓN (OCULTO)</p>
                                )}
                            </div>
                        ) : (
                            renderField("Precio Final Porte", formData.amount, "amount", <Euro />)
                        )}
                        {isEditing && !isReadOnly ? (
                            <div className="col-span-full bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1 border-b border-slate-100 pb-2"><Package size={12} /> Bultos y Artículos</span>
                                
                                {/* Article Selector — añade al seleccionar, igual que en creación */}
                                <div className="flex gap-2 items-end">
                                    <div className="flex-1">
                                        <select 
                                            value={tempArticleId} 
                                            onChange={(e) => { const val = e.target.value; setTempArticleId(val); if (val) addArticle(val); }} 
                                            className="w-full text-sm border-2 border-slate-200 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                        >
                                            <option value="">Seleccionar artículo...</option>
                                            {(() => {
                                                let availableArticles = [...(articles || [])];
                                                
                                                const clientName = (formData.client || '').toLowerCase().trim();
                                                const destName = (formData.destinationName || '').toLowerCase().trim();
                                                
                                                const client = (clients || []).find(c => 
                                                    String(c.name || '').toLowerCase().trim() === clientName || 
                                                    String(c.legalName || '').toLowerCase().trim() === clientName
                                                );
                                                
                                                const destClient = (clients || []).find(c => 
                                                    String(c.name || '').toLowerCase().trim() === destName || 
                                                    String(c.legalName || '').toLowerCase().trim() === destName
                                                );

                                                const STD_IDS = ['1774442159060', '1774442159061', '1774442159062', '1774442159063']; // BLT_1-4

                                                const isWeightClient = client?.tariffType === 'Por Kilos' || destClient?.tariffType === 'Por Kilos';

                                                let clientIds;
                                                if (client?.allowedArticles?.length > 0) {
                                                    clientIds = client.allowedArticles;
                                                } else if (isWeightClient) {
                                                    clientIds = availableArticles
                                                        .filter(a => {
                                                            const name = String(a.name || '').toLowerCase();
                                                            return name.includes('blt_') || name.includes('bulto') || name.includes('palet');
                                                        })
                                                        .map(a => a.id);
                                                    if (clientIds.length === 0) clientIds = STD_IDS;
                                                } else {
                                                    clientIds = STD_IDS;
                                                }

                                                const destIds = (destClient?.allowedArticles?.length > 0) ? destClient.allowedArticles : [];

                                                // Merge
                                                const mergedIds = [...clientIds];
                                                for (const id of destIds) {
                                                    if (!mergedIds.includes(id)) mergedIds.push(id);
                                                }

                                                availableArticles = availableArticles.filter(a => mergedIds.includes(a.id) || mergedIds.includes(String(a.id)));
                                                availableArticles.sort((a, b) => {
                                                    const iA = mergedIds.indexOf(a.id) !== -1 ? mergedIds.indexOf(a.id) : mergedIds.indexOf(String(a.id));
                                                    const iB = mergedIds.indexOf(b.id) !== -1 ? mergedIds.indexOf(b.id) : mergedIds.indexOf(String(b.id));
                                                    return iA - iB;
                                                });

                                                return availableArticles.map(article => <option key={article.id} value={article.id}>{article.name}</option>);
                                            })()}
                                        </select>
                                    </div>
                                    <div className="w-20" title="Cantidad (ajusta antes de seleccionar)">
                                        <input type="number" min="1" className="w-full text-sm border-2 border-slate-200 rounded-lg p-2.5 text-center font-bold" value={tempQuantity} onChange={(e) => setTempQuantity(e.target.value)} />
                                    </div>
                                </div>
                                
                                {weightClientData && (
                                    <div className="w-28 mt-2 border-t border-slate-100 pt-2">
                                        <label className="text-[10px] uppercase font-bold text-indigo-500 mb-1 block">⚖️ Kilos</label>
                                        <input
                                            type="number" min="0" step="0.1" placeholder="Kg"
                                            className="w-full text-sm border-2 border-indigo-200 rounded-lg p-2 text-indigo-700 font-bold focus:ring-indigo-500"
                                            value={weightKg}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setWeightKg(val);
                                                setFormData(prev => ({ ...prev, amount: calcularImporteTotal(selectedArticles, val) }));
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Article List */}
                                {selectedArticles.length > 0 && (
                                    <div className="mt-3 bg-white border border-slate-100 rounded-lg p-2">
                                        {selectedArticles.map((item) => (
                                            <div key={item.uniqueId} className="flex justify-between items-center py-1 text-sm border-b border-slate-50 last:border-0">
                                                <span className="font-medium text-slate-800">{item.quantity}x {item.name}</span>
                                                <div className="flex gap-3 items-center">
                                                    <span className="font-bold text-slate-700">{hidePrices ? '***' : `${item.totalPrice.toFixed(2)}€`}</span>
                                                    <button type="button" onClick={() => removeArticle(item.uniqueId)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            renderField("Bultos", formData.packages, "packages", <Package />)
                        )}
                    </div>
                    )}

                    {/* Factura Simplificada: fuera del modo edición a propósito, para que se
                        pueda marcar también desde vistas de solo lectura (p.ej. al pinchar un
                        cobro en la Caja del conductor), que es justo donde hace falta reclasificar
                        un cobro ya hecho. Guarda al momento con onUpdate, sin pasar por "Guardar
                        Cambios". Lo ya cobrado pasa a ser la BASE y se le suma el +21% de IVA
                        encima (igual que el checkbox de la confirmación de entrega): el cliente
                        pasa a deber ese IVA además de lo que ya pagó. simplifiedInvoiceAmount se
                        guarda CON IVA incluido porque así lo espera accountLogic.js, que además
                        saca automáticamente el albarán del cómputo normal de caja en cuanto
                        hasSimplifiedInvoice es true. */}
                    {!isClientView && !hidePrices && (parseFloat(String(formData.customAmount ?? formData.amount ?? 0).toString().replace(/[^0-9.,-]+/g, '').replace(',', '.')) || 0) > 0 && (
                        <div className={`p-4 rounded-xl border shadow-sm transition-colors ${formData.hasSimplifiedInvoice ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
                            <label className="flex items-center gap-3 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.hasSimplifiedInvoice || false}
                                    disabled={isSavingInvoice || !onUpdate}
                                    onChange={async (e) => {
                                        const checked = e.target.checked;
                                        let updates;
                                        if (checked) {
                                            const base = parseFloat(String(formData.customAmount ?? formData.amount ?? 0).toString().replace(/[^0-9.,-]+/g, '').replace(',', '.')) || 0;
                                            const totalConIva = +(base * 1.21).toFixed(2);
                                            updates = { hasSimplifiedInvoice: true, simplifiedInvoiceAmount: totalConIva.toFixed(2), simplifiedInvoicePaid: true };
                                        } else {
                                            updates = { hasSimplifiedInvoice: false, simplifiedInvoiceAmount: null, simplifiedInvoicePaid: false };
                                        }
                                        setFormData(prev => ({ ...prev, ...updates }));
                                        if (onUpdate) {
                                            setIsSavingInvoice(true);
                                            try {
                                                await onUpdate(shipment.id, updates);
                                            } catch (err) {
                                                console.error('Error guardando factura simplificada:', err);
                                                alert('Error al guardar la factura simplificada: ' + err.message);
                                            } finally {
                                                setIsSavingInvoice(false);
                                            }
                                        }
                                    }}
                                    className="w-5 h-5 rounded text-amber-600 border-gray-300 focus:ring-amber-500"
                                />
                                <div className="flex-1">
                                    <span className="text-sm font-bold text-slate-800 block leading-none mb-1">
                                        🧾 Factura Simplificada{isSavingInvoice ? ' (guardando...)' : ''}
                                    </span>
                                    <span className="text-[10px] text-slate-500 uppercase leading-none block">Añade +21% IVA a lo ya cobrado y lo saca de caja</span>
                                </div>
                            </label>
                            {formData.hasSimplifiedInvoice && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const totalConIva = parseFloat(formData.simplifiedInvoiceAmount) || 0;
                                        const base = +(totalConIva / 1.21).toFixed(2);
                                        printSimplifiedInvoice({
                                            ...shipment,
                                            ...formData,
                                            amount: base,
                                            id: shipment.id,
                                            date: new Date().toLocaleDateString('es-ES'),
                                            articles: selectedArticles.length > 0 ? selectedArticles : (shipment.articles || [])
                                        });
                                    }}
                                    className="mt-3 w-full text-[10px] font-bold text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg py-2 transition-colors"
                                >
                                    Imprimir Factura Simplificada ({formData.simplifiedInvoiceAmount}€)
                                </button>
                            )}
                        </div>
                    )}

                    {(formData.hasCod || isEditing) && (
                        <div className={`p-3 rounded-lg border flex gap-4 animate-in fade-in slide-in-from-bottom-2 ${formData.hasCod ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'}`}>
                            <div className="flex-1 flex flex-col justify-center relative">
                                {isEditing ? (
                                    <div className="relative">
                                        <Euro className="absolute left-3 top-1/2 -translate-y-1/2 text-red-400" size={16} />
                                        <input 
                                            type="number" 
                                            step="0.01"
                                            value={formData.codAmount || ''}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                const amount = parseFloat(val) || 0;
                                                
                                                const cName = formData.client ? formData.client.toLowerCase().trim() : '';
                                                const clientObj = (clients || []).find(c =>
                                                    String(c.name || '').toLowerCase().trim() === cName ||
                                                    String(c.legalName || '').toLowerCase().trim() === cName
                                                );
                                                const fee = calcularComisionReembolso(clientObj, amount);
                                                
                                                const currentTotal = parseFloat(formData.amount) || 0;
                                                const prevCommission = parseFloat(formData.codCommission) || 0;
                                                
                                                let basePorte = 0;
                                                if (selectedArticles && selectedArticles.length > 0) {
                                                    basePorte = selectedArticles.reduce((sum, item) => sum + item.totalPrice, 0);
                                                    if (weightClientData && weightKg) {
                                                        // El tercer argumento faltaba: sin él, un cliente con
                                                        // tarifa por fórmula caía en el reparto por tramos.
                                                        basePorte += calculateWeightPrice(weightKg, weightClientData.tariff, weightClientData.client);
                                                    }
                                                } else {
                                                    basePorte = Math.max(0, currentTotal - prevCommission);
                                                }
                                                
                                                const newCommission = fee;
                                                const newTotalAmount = basePorte + newCommission;
                                                
                                                setFormData({
                                                    ...formData, 
                                                    codAmount: val, 
                                                    hasCod: amount > 0,
                                                    codCommission: newCommission > 0 ? newCommission.toFixed(2) : 0,
                                                    amount: newTotalAmount.toFixed(2)
                                                });
                                            }}
                                            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm bg-white focus:border-red-500 focus:ring-red-500/20"
                                            placeholder="REEMBOLSO 0.00"
                                        />
                                    </div>
                                ) : (
                                    <>
                                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Valor Reembolso (A Cobrar)</span>
                                        <span className="text-sm font-bold text-red-700">{formData.codAmount} €</span>
                                    </>
                                )}
                            </div>
                            
                            {formData.hasCod && !isEditing && (
                                <div className="flex-1 border-l border-red-200 pl-4 flex flex-col justify-end">
                                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Comisión (Incluida)</span>
                                    <span className="text-sm font-bold text-red-700">{formData.codCommission} €</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* COD Receipt Photo (Justificante de Reembolso Firmado) */}
                    {formData.hasCod && !isClientView && (
                        <div className={`p-4 rounded-xl border space-y-3 shadow-sm transition-all ${
                            shipment.codReceiptPhoto || codReceiptPhoto
                                ? 'bg-emerald-50 border-emerald-200'
                                : 'bg-amber-50 border-amber-200'
                        }`}>
                            <div className="flex items-center justify-between border-b border-current/10 pb-2">
                                <h3 className="font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-2">
                                    <FileText size={14} className={shipment.codReceiptPhoto || codReceiptPhoto ? 'text-emerald-500' : 'text-amber-500'} />
                                    JUSTIFICANTE DE REEMBOLSO FIRMADO
                                    {!(shipment.codReceiptPhoto || codReceiptPhoto) && (
                                        <span className="px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded text-[8px] font-black">PENDIENTE</span>
                                    )}
                                </h3>
                                {!isReadOnly && (
                                    <div className="flex gap-2">
                                        <input
                                            type="file"
                                            ref={codReceiptInputRef}
                                            className="hidden"
                                            accept="image/*"
                                            capture="environment"
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                e.target.value = ''; // Permite repetir la misma foto
                                                if (!file) return;
                                                if (file.size > 20 * 1024 * 1024) {
                                                    alert('La imagen es demasiado grande. Máximo 20MB.');
                                                    return;
                                                }
                                                setIsUploadingCodReceipt(true);
                                                try {
                                                    // Comprimir ANTES de subir: la foto entera en crudo dejaba
                                                    // sin memoria al móvil y cerraba la app.
                                                    const dataUrl = await compressImage(file, 1200, 1200, 0.8);
                                                    // Utilizamos el bucket 'delivery_photos' que ya existe y tiene permisos configurados
                                                    const uploadedUrl = await uploadProof(shipment.id, dataUrl, 'delivery_photos');
                                                    if (uploadedUrl && onUpdate) {
                                                        await onUpdate(shipment.id, { codReceiptPhoto: uploadedUrl });
                                                        setCodReceiptPhoto(uploadedUrl);
                                                    }
                                                } catch (err) {
                                                    console.error('Error uploading COD receipt:', err);
                                                    alert('Error al subir el justificante: ' + err.message);
                                                } finally {
                                                    setIsUploadingCodReceipt(false);
                                                }
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setCamaraAbierta('justificante')}
                                            disabled={isUploadingCodReceipt}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1 disabled:opacity-50"
                                        >
                                            {isUploadingCodReceipt ? (
                                                <><Loader2 size={12} className="animate-spin" /> Subiendo...</>
                                            ) : (
                                                <><Camera size={12} /> {shipment.codReceiptPhoto ? 'Cambiar' : 'Subir Justificante'}</>
                                            )}
                                        </button>
                                        {(shipment.codReceiptPhoto || codReceiptPhoto) && (
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    if (window.confirm('¿Eliminar el justificante de reembolso firmado?')) {
                                                        if (onUpdate) {
                                                            await onUpdate(shipment.id, { codReceiptPhoto: null });
                                                            setCodReceiptPhoto(null);
                                                        }
                                                    }
                                                }}
                                                className="text-[10px] font-bold text-red-500 hover:text-red-600"
                                            >
                                                Eliminar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="relative group bg-white border border-gray-100 rounded-xl overflow-hidden aspect-video flex items-center justify-center p-1">
                                {(codReceiptPhoto || shipment.codReceiptPhoto) ? (
                                    <>
                                        <img
                                            src={codReceiptPhoto || shipment.codReceiptPhoto}
                                            alt="Justificante de reembolso firmado"
                                            className="max-w-full max-h-full object-contain rounded-lg"
                                        />
                                        <a
                                            href={codReceiptPhoto || shipment.codReceiptPhoto}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-xs font-bold backdrop-blur-[1px]"
                                        >
                                            <Download size={14} /> Ver / Descargar
                                        </a>
                                    </>
                                ) : (
                                    <div className="text-center p-4">
                                        <FileText size={24} className="mx-auto text-amber-300 mb-1" />
                                        <p className="text-[10px] text-amber-500 font-bold uppercase">Sin justificante subido</p>
                                        <p className="text-[9px] text-slate-400 mt-1">Sube la foto del justificante firmado/sellado por el remitente</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Observations */}
                    <div className={`p-4 rounded-xl border ${isEditing ? 'bg-white border-gray-200' : 'bg-yellow-50 border-yellow-100'} transition-colors`}>
                        {renderField("Observaciones", formData.observations, "observations", <FileText />, "textarea", true)}
                    </div>

                    {/* Foto de la Mercancía */}
                    {(shipment.merchandisePhoto || isEditing) && (
                        <div className={`p-4 rounded-xl border ${isEditing ? 'bg-white border-blue-100 ring-2 ring-blue-500/5' : 'bg-white border-gray-200'} space-y-3 shadow-sm transition-all`}>
                            <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                                <h3 className="font-bold text-slate-700 text-[10px] uppercase tracking-wider flex items-center gap-2">
                                    <Camera size={14} className="text-blue-500" />
                                    FOTO DE LA MERCANCÍA
                                </h3>
                                {isEditing && (
                                    <div className="flex gap-2">
                                        <input 
                                            type="file" 
                                            ref={fileInputRef} 
                                            className="hidden" 
                                            accept="image/*" 
                                            capture="environment"
                                            onChange={handlePhotoChange}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setCamaraAbierta('mercancia')}
                                            className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1"
                                        >
                                            <ImageIcon size={12} /> {shipment.merchandisePhoto || newPhoto ? 'Cambiar' : 'Añadir'}
                                        </button>
                                        {(shipment.merchandisePhoto || newPhoto) && newPhoto !== 'REMOVE' && (
                                            <button
                                                type="button"
                                                onClick={() => setNewPhoto('REMOVE')}
                                                className="text-[10px] font-bold text-red-500 hover:text-red-600"
                                            >
                                                Quitar
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="relative group bg-slate-50 border border-gray-100 rounded-xl overflow-hidden aspect-video flex items-center justify-center p-1">
                                {newPhoto === 'REMOVE' ? (
                                    <div className="text-center p-4">
                                        <Package size={24} className="mx-auto text-slate-300 opacity-50 mb-1" />
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Foto Eliminada</p>
                                    </div>
                                ) : (newPhoto || shipment.merchandisePhoto) ? (
                                    <>
                                        <img 
                                            src={newPhoto || shipment.merchandisePhoto} 
                                            alt="Foto de la mercancía" 
                                            className="max-w-full max-h-full object-contain rounded-lg"
                                        />
                                        {!isEditing && (
                                            <a 
                                                href={shipment.merchandisePhoto} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-xs font-bold backdrop-blur-[1px]"
                                            >
                                                <ExternalLink size={14} /> Ver Foto Completa
                                            </a>
                                        )}
                                        {isEditing && newPhoto && (
                                            <div className="absolute top-2 right-2 bg-blue-600 text-white px-2 py-0.5 rounded text-[8px] font-bold shadow-lg">
                                                NUEVA SELECCIÓN
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-center p-4">
                                        <ImageIcon size={24} className="mx-auto text-slate-200 mb-1" />
                                        <p className="text-[10px] text-slate-400 font-bold uppercase">Sin foto de mercancía</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Incidencia Activa */}
                    {shipment.incidentStatus === 'active' && (
                        <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-bottom-2">
                            <h3 className="font-bold text-red-700 text-[10px] uppercase tracking-wider flex items-center gap-2 border-b border-red-100 pb-2">
                                <Shield size={14} className="text-red-500" />
                                INCIDENCIA REPORTADA
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Motivo / Nota del Conductor</span>
                                    <p className="text-sm font-bold text-red-900 bg-white/50 p-2 rounded-lg border border-red-100">
                                        "{shipment.incidentReason || 'Sin motivo especificado'}"
                                    </p>
                                </div>
                                {shipment.incidentPhoto && (
                                    <div>
                                        <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-1">Evidencia Visual</span>
                                        <div className="relative group bg-white border border-red-200 rounded-xl overflow-hidden aspect-video flex items-center justify-center p-1 shadow-sm">
                                            <img 
                                                src={shipment.incidentPhoto} 
                                                alt="Foto de la incidencia" 
                                                className="max-w-full max-h-full object-contain rounded-lg"
                                            />
                                            <a 
                                                href={shipment.incidentPhoto} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="absolute inset-0 bg-red-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-xs font-bold backdrop-blur-[1px]"
                                            >
                                                <ExternalLink size={14} /> Ver Foto Completa
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Audit Trail */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                        <h3 className="font-bold text-slate-600 text-xs uppercase tracking-wider flex items-center gap-2">
                            <Clock size={13} />
                            Trazabilidad del Envío
                        </h3>
                        <div className="grid grid-cols-2 gap-3">
                            {/* Created */}
                            <div className="bg-white rounded-lg border border-slate-100 p-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                    <Calendar size={10} /> Fecha Creación
                                </span>
                                <p className="text-sm font-semibold text-slate-700">
                                    {formatDate(shipment.createdAt) || shipment.date || <span className="text-slate-300 italic text-xs">—</span>}
                                </p>
                            </div>
                            <div className="bg-white rounded-lg border border-slate-100 p-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                    <User size={10} /> Creado por
                                </span>
                                <p className="text-sm font-semibold text-slate-700">
                                    {(() => {
                                        // El texto de createdBy se congela al crear el albarán, y los
                                        // creados antes del arreglo se guardaron como "Conductor" a
                                        // secas. Si tenemos el id, se resuelve el nombre real al
                                        // pintarlo, para que los albaranes viejos también salgan bien.
                                        const generico = ['conductor', 'driver'].includes(String(shipment.createdBy || '').trim().toLowerCase());
                                        if (generico && shipment.createdById) return resolveDriver(shipment.createdById);
                                        return shipment.createdBy || <span className="text-slate-300 italic text-xs">—</span>;
                                    })()}
                                </p>
                            </div>
                        </div>
                        {/* Referencia Externa (SSCC / QR del cliente) */}
                        {shipment.clientReference && (
                            <div className="mt-3 bg-indigo-50 rounded-lg border border-indigo-200 p-3 flex items-center gap-3">
                                <span className="text-lg">📎</span>
                                <div>
                                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block mb-0.5">Ref. Externa Cliente (SSCC / QR)</span>
                                    <p className="text-sm font-bold text-indigo-800 font-mono tracking-wide">{shipment.clientReference}</p>
                                </div>
                            </div>
                        )}
                        {/* Pickup & Delivery */}
                        <div className="grid grid-cols-2 gap-3 mt-3">
                            {/* Picked up */}
                            <div className="bg-white rounded-lg border border-slate-100 p-3">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                    <Truck size={10} /> Recogido por
                                </span>
                                <p className="text-sm font-semibold text-purple-700">
                                    {shipment.pickedUpBy || <span className="text-slate-300 italic text-xs">—</span>}
                                </p>
                            </div>
                            {/* Delivery */}
                            <div className={`bg-white rounded-lg border p-3 ${shipment.status === 'Entregado' ? 'border-emerald-100' : 'border-slate-100'}`}>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                    <Calendar size={10} /> Fecha Entrega
                                </span>
                                <p className={`text-sm font-semibold ${shipment.status === 'Entregado' ? 'text-emerald-700' : 'text-slate-400 italic text-xs'}`}>
                                    {/* Solo hay fecha de entrega cuando el albarán está entregado. Antes se
                                        usaba paidAt, que en un Porte Pagado es la hora en que se COBRÓ al
                                        crearlo: un albarán aún en reparto salía "entregado" a la misma hora
                                        que se creó. Para los entregados de antes, que no guardaban
                                        deliveredAt, se sigue tirando de paidAt/updatedAt. */}
                                    {shipment.status === 'Entregado'
                                        ? (formatDate(shipment.deliveredAt) || formatDate(shipment.paidAt) || formatDate(shipment.updatedAt) || '—')
                                        : 'Aún no entregado'}
                                </p>
                            </div>
                            <div className={`bg-white rounded-lg border p-3 ${shipment.status === 'Entregado' ? 'border-emerald-100' : 'border-slate-100'}`}>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                    {/* Mientras no esté entregado, el conductor que figura es al que se le ha
                                        asignado el reparto, no el que lo ha entregado: se dice tal cual, que
                                        poner "Entregado por" en un albarán que sigue en la furgoneta daba por
                                        hecha una entrega que no ha pasado. */}
                                    <Truck size={10} /> {shipment.status === 'Entregado' ? 'Entregado por' : 'Asignado a'}
                                </span>
                                <p className={`text-sm font-semibold ${shipment.status === 'Entregado' ? 'text-emerald-700' : 'text-slate-400 italic text-xs'}`}>
                                    {resolveDriver(shipment.status === 'Entregado'
                                        ? (shipment.deliveredById || shipment.assignedDriverId)
                                        : shipment.assignedDriverId
                                    ) || <span className="text-slate-300 italic text-xs">Sin asignar</span>}
                                </p>
                            </div>
                        </div>
                        {/* Financial Traceability */}
                        {(shipment.portePaid || (shipment.hasCod && shipment.codPaid)) && (
                            <div className="grid grid-cols-2 gap-3 mt-3">
                                {shipment.portePaid && (
                                    <div className="bg-blue-50 rounded-lg border border-blue-100 p-3">
                                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                            <Wallet size={10} /> Porte Cobrado Por
                                        </span>
                                        <p className="text-sm font-semibold text-blue-700">
                                            {(() => {
                                                const bt = String(shipment.billingType || '').toLowerCase();
                                                if (bt.includes('factur')) return 'Administración / Oficina';
                                                // Un Porte Pagado se cobra EN ORIGEN, al crear el albarán: si no
                                                // quedó guardado quién lo cobró, el que cobró es el que lo CREÓ, no
                                                // el que lo reparte. Cayendo al conductor asignado, la ficha le
                                                // apuntaba el dinero a otro y no cuadraba con la Cuenta, que sí
                                                // mira al creador (accountLogic, "prepaidCollections").
                                                const esConductor = (id) => id && (drivers || []).some(d => String(d.id) === String(id));
                                                const cobradorId = shipment.porteCollectedById
                                                    || (shipment.porteType === 'Pagado' && esConductor(shipment.createdById) ? shipment.createdById : null)
                                                    || shipment.assignedDriverId;
                                                return resolveDriver(cobradorId) || 'Oficina / Automático';
                                            })()}
                                        </p>
                                    </div>
                                )}
                                {(shipment.hasCod && shipment.codPaid) && (
                                    <div className="bg-purple-50 rounded-lg border border-purple-100 p-3">
                                        <span className="text-[10px] font-bold text-purple-500 uppercase tracking-wider block mb-1 flex items-center gap-1">
                                            <Wallet size={10} /> Reembolso Cobrado
                                        </span>
                                        <p className="text-sm font-semibold text-purple-700">
                                            {resolveDriver(shipment.codCollectedById || shipment.assignedDriverId) || 'Oficina / Automático'}
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Controles de Administración (Modo Edición) */}
                    {isEditing && !isReadOnly && (
                        <div className="bg-orange-50 border-2 border-orange-200 rounded-2xl p-5 space-y-4 shadow-sm mt-6 animate-in slide-in-from-bottom-2">
                            <h3 className="font-bold text-orange-800 text-xs uppercase tracking-widest flex items-center gap-2 border-b border-orange-100 pb-3">
                                <Shield size={16} className="text-orange-500" />
                                Controles de Administración Remota
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Revertir o Alterar Estado</span>
                                    <select 
                                        value={formData.status || 'Pendiente de asignar'}
                                        onChange={(e) => handleChange('status', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="Pendiente de asignar">Pendiente de asignar</option>
                                        <option value="En reparto">En reparto</option>
                                        <option value="Entregado">Entregado</option>
                                        <option value="Cancelado">Cancelado</option>
                                    </select>
                                    {shipment.status === 'Entregado' && formData.status !== 'Entregado' && (
                                        <p className="text-[10px] font-bold text-red-600 drop-shadow-sm mt-1.5 leading-tight">
                                            ⚠️ Advertencia: Revertir la entrega borrará todas las firmas, fotos de evidencia y horas de entrega asociadas al guardado.
                                        </p>
                                    )}
                                </div>
                                
                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Tipo de Porte (Responsable)</span>
                                    <select 
                                        value={formData.porteType || 'Pagado'}
                                        onChange={(e) => {
                                            const newPorteType = e.target.value;
                                            handleChange('porteType', newPorteType);
                                            // Al cambiar a Debido → el porte pasa a estar pendiente de cobro al destinatario
                                            if (newPorteType === 'Debido') {
                                                handleChange('paymentStatus', 'Pending');
                                                handleChange('portePaid', false);
                                                handleChange('isPaid', false);
                                            }
                                        }}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="Pagado">Pagado (Remitente)</option>
                                        <option value="Debido">Debido (Beneficiario)</option>
                                    </select>
                                    {formData.porteType === 'Debido' && (formData.portePaid || formData.paymentStatus === 'Paid') === false && (
                                        <p className="text-[10px] text-orange-500 font-bold flex items-center gap-1 mt-1">
                                            ✅ Estado financiero y porte cobrado actualizados automáticamente
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Estado Financiero (Caja)</span>
                                    <select 
                                        value={formData.paymentStatus || 'Pending'}
                                        onChange={(e) => {
                                            handleChange('paymentStatus', e.target.value);
                                            if (e.target.value === 'Pending') {
                                                handleChange('portePaid', false);
                                                handleChange('isPaid', false);
                                            }
                                        }}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="Paid">Cobrado / Liquidado</option>
                                        <option value="Pending">Pendiente de Cobro (Deuda)</option>
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Conductor Asignado</span>
                                    <select 
                                        value={formData.assignedDriverId || ''}
                                        onChange={(e) => handleChange('assignedDriverId', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold cursor-pointer"
                                    >
                                        <option value="">Sin Asignar</option>
                                        {drivers.filter(d => d.isActive !== false || d.id === formData.assignedDriverId).map(d => (
                                            <option key={d.id} value={d.id}>
                                                {resolveDriver(d.id)} {d.isActive === false ? '(Baja)' : ''}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                <div className="space-y-2">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider block">Fecha y Hora Programada</span>
                                    <input 
                                        type="datetime-local"
                                        value={formData.scheduledDate || ''}
                                        onChange={(e) => handleChange('scheduledDate', e.target.value)}
                                        className="w-full text-sm border-2 border-orange-200 rounded-xl p-3 focus:ring-2 focus:ring-orange-500 focus:outline-none bg-white text-orange-900 font-semibold"
                                    />
                                </div>

                                <div className="space-y-3 pt-1">
                                    <div className="bg-white p-3 rounded-xl border border-orange-100 shadow-sm hover:border-orange-300 transition-colors">
                                        <label className="flex items-center gap-3 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={formData.portePaid || formData.isPaid || false}
                                                onChange={(e) => {
                                                    handleChange('portePaid', e.target.checked);
                                                    handleChange('isPaid', e.target.checked);
                                                }}
                                                className="w-5 h-5 rounded text-orange-600 border-gray-300 focus:ring-orange-500"
                                            />
                                            <div>
                                                <span className="text-sm font-bold text-slate-800 block leading-none mb-1">Porte Cobrado</span>
                                                <span className="text-[10px] text-slate-500 uppercase leading-none block">Marca o desmarca saldo a tu favor</span>
                                            </div>
                                        </label>
                                    </div>
                                    {formData.hasCod && (
                                        <div className="bg-white p-3 rounded-xl border border-orange-100 shadow-sm hover:border-orange-300 transition-colors">
                                            <label className="flex items-center gap-3 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={formData.codPaid || formData.isCodPaid || false}
                                                    onChange={(e) => {
                                                        handleChange('codPaid', e.target.checked);
                                                        handleChange('isCodPaid', e.target.checked);
                                                    }}
                                                    className="w-5 h-5 rounded text-orange-600 border-gray-300 focus:ring-orange-500"
                                                />
                                                <div>
                                                    <span className="text-sm font-bold text-slate-800 block leading-none mb-1">Reembolso Cobrado</span>
                                                    <span className="text-[10px] text-slate-500 uppercase leading-none block">El conductor ya aportó el dinero del COD</span>
                                                </div>
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Delivery Proofs (Justificantes) */}
                    {(shipment.status === 'Entregado' || shipment.deliverySignature || shipment.deliveryPhoto) && (
                        <div className="bg-white border-2 border-emerald-100 rounded-2xl p-5 space-y-4 shadow-sm animate-in fade-in slide-in-from-bottom-4 mt-6">
                            <h3 className="font-bold text-emerald-800 text-xs uppercase tracking-widest flex items-center gap-2 border-b border-emerald-50 pb-3">
                                <Shield size={16} className="text-emerald-500" />
                                Justificante de Entrega (Seguro)
                            </h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                {/* Signature & Receiver Info */}
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                        <Fingerprint size={12} /> Datos del Receptor
                                    </div>
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                                        <p className="text-sm font-bold text-slate-700">{shipment.receiverName || <span className="text-slate-300 italic">Nombre no registrado</span>}</p>
                                        <p className="text-xs text-slate-500 mt-1">DNI/ID: {shipment.receiverId || <span className="text-slate-300 italic">No proporcionado</span>}</p>
                                    </div>
                                    
                                    {shipment.deliverySignature ? (
                                        <div className="space-y-2">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase block">Firma Digital</span>
                                            <div className="relative group bg-white border border-slate-200 rounded-xl overflow-hidden shadow-inner aspect-[4/3] flex items-center justify-center p-2">
                                                <img 
                                                    src={shipment.deliverySignature} 
                                                    alt="Firma de entrega" 
                                                    className="max-w-full max-h-full object-contain"
                                                />
                                                <a 
                                                    href={shipment.deliverySignature} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-xs font-bold backdrop-blur-[1px]"
                                                >
                                                    <ExternalLink size={14} /> Ampliar Firma
                                                </a>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-2">
                                            <Fingerprint size={24} className="opacity-20" />
                                            <span className="text-[10px] uppercase font-bold">Sin firma registrada</span>
                                        </div>
                                    )}
                                </div>

                                {/* Photos Section */}
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                                    {/* Merchandise Photo (Carga) */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                            <ImageIcon size={12} /> Foto de Mercancía (Carga)
                                        </div>
                                        {shipment.merchandisePhoto ? (
                                            <div className="relative group bg-slate-100 border border-slate-200 rounded-xl overflow-hidden aspect-square flex items-center justify-center shadow-inner">
                                                <img 
                                                    src={shipment.merchandisePhoto} 
                                                    alt="Mercancía" 
                                                    className="w-full h-full object-cover"
                                                />
                                                <a 
                                                    href={shipment.merchandisePhoto} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-[10px] font-bold backdrop-blur-[1px]"
                                                >
                                                    <ExternalLink size={12} /> Ver Original
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                                                <ImageIcon size={16} className="opacity-20" />
                                                <span className="text-[10px] uppercase font-bold">Sin foto</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery Photo (Llegada) */}
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase">
                                            <ImageIcon size={12} /> Foto de Entrega (Sello)
                                        </div>
                                        {shipment.deliveryPhoto ? (
                                            <div className="relative group bg-slate-100 border border-slate-200 rounded-xl overflow-hidden aspect-square flex items-center justify-center shadow-inner">
                                                <img 
                                                    src={shipment.deliveryPhoto} 
                                                    alt="Entrega" 
                                                    className="w-full h-full object-cover"
                                                />
                                                <a 
                                                    href={shipment.deliveryPhoto} 
                                                    target="_blank" 
                                                    rel="noopener noreferrer"
                                                    className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-[10px] font-bold backdrop-blur-[1px]"
                                                >
                                                    <ExternalLink size={12} /> Ver Original
                                                </a>
                                            </div>
                                        ) : (
                                            <div className="aspect-square bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                                                <ImageIcon size={16} className="opacity-20" />
                                                <span className="text-[10px] uppercase font-bold">Sin foto</span>
                                            </div>
                                        )}
                                    </div>

                                    {/* Delivery Photo 2 (Documentación de vuelta) */}
                                    {(shipment.deliveryPhoto2 || shipment.needsSignatureReturn) && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-500 uppercase">
                                                <FileText size={12} /> Foto 2: Doc. Firmado
                                            </div>
                                            {shipment.deliveryPhoto2 ? (
                                                <div className="relative group bg-slate-100 border border-slate-200 rounded-xl overflow-hidden aspect-square flex items-center justify-center shadow-inner">
                                                    <img 
                                                        src={shipment.deliveryPhoto2} 
                                                        alt="Doc. Firmado" 
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <a 
                                                        href={shipment.deliveryPhoto2} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-[10px] font-bold backdrop-blur-[1px]"
                                                    >
                                                        <ExternalLink size={12} /> Ver Original
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className="aspect-square bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1">
                                                    <FileText size={16} className="opacity-20" />
                                                    <span className="text-[10px] uppercase font-bold">Sin foto de doc.</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* COD Receipt Photo (Justificante de Reembolso) */}
                                    {shipment.hasCod && (
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-[10px] font-bold text-purple-400 uppercase">
                                                <FileText size={12} /> Justif. Reembolso
                                            </div>
                                            {shipment.codReceiptPhoto ? (
                                                <div className="relative group bg-slate-100 border border-slate-200 rounded-xl overflow-hidden aspect-square flex items-center justify-center shadow-inner">
                                                    <img 
                                                        src={shipment.codReceiptPhoto} 
                                                        alt="Justificante de Reembolso" 
                                                        className="w-full h-full object-cover"
                                                    />
                                                    <a 
                                                        href={shipment.codReceiptPhoto} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white gap-2 text-[10px] font-bold backdrop-blur-[1px]"
                                                    >
                                                        <ExternalLink size={12} /> Ver Original
                                                    </a>
                                                </div>
                                            ) : (
                                                <div className="aspect-square bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 gap-1 text-center px-1">
                                                    <FileText size={16} className="opacity-20" />
                                                    <span className="text-[10px] uppercase font-bold leading-tight">Pendiente de<br/>escanear</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                                    
                                    <div className="pt-2">
                                        {shipment.deliveryCoordinates ? (
                                            <a
                                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shipment.deliveryCoordinates)}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-[10px] font-bold text-blue-600 hover:text-blue-700 flex items-center gap-1.5 transition-colors"
                                            >
                                                <MapPin size={12} /> Ubicación GPS Confirmada
                                            </a>
                                        ) : (
                                            <span className="text-[10px] font-bold text-amber-600 flex items-center gap-1.5" title="El conductor no tenía señal GPS al confirmar la entrega">
                                                <MapPin size={12} /> ⚠️ Sin ubicación GPS registrada
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                </div>



                {/* Footer Buttons */}
                {isEditing ? (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 shrink-0 flex gap-3 animate-in slide-in-from-bottom-2" style={{ zoom }}>
                        <button
                            onClick={() => {
                                setFormData(shipment);
                                setIsEditing(false);
                            }}
                            className="flex-1 py-3 text-sm font-bold text-gray-600 bg-white border border-gray-200 rounded-xl hover:bg-gray-50"
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isUploadingPhoto}
                            className={`flex-1 py-3 text-sm font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50`}
                        >
                            {isUploadingPhoto ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                            {isUploadingPhoto ? 'Subiendo...' : 'Guardar Cambios'}
                        </button>
                    </div>
                ) : (
                    <div className="border-t border-gray-100 p-4 bg-gray-50 shrink-0 flex gap-3" style={{ zoom }}>
                        {shipment.status === 'Entregado' && (
                            <button
                                onClick={async () => {
                                    setIsGeneratingPDF(true);
                                    try {
                                        // `clientePortal` sólo llega desde el portal del
                                        // cliente: el justificante sale sin el precio del
                                        // porte cuando no es él quien lo paga.
                                        await generateDeliveryPDF(shipment, clientePortal);
                                    } catch (err) {
                                        console.error("PDF Generate Error:", err);
                                        alert("Error al generar el PDF: " + err.message);
                                    } finally {
                                        setIsGeneratingPDF(false);
                                    }

                                }}
                                disabled={isGeneratingPDF}
                                className="flex-1 py-3 text-sm font-bold text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                            >
                                {isGeneratingPDF ? <Loader2 size={18} className="animate-spin" /> : <Download size={18} />}
                                {isGeneratingPDF ? 'Generando...' : 'Descargar POD'}
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className={`py-3 text-sm font-bold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-100 transition-all ${shipment.status === 'Entregado' ? 'px-8' : 'w-full'}`}
                        >
                            Cerrar
                        </button>
                    </div>

                )}
            </div>

            <CameraCaptureModal
                isOpen={camaraAbierta !== null}
                onClose={() => setCamaraAbierta(null)}
                onCapture={alHacerFoto}
                onFallback={() => (camaraAbierta === 'justificante'
                    ? codReceiptInputRef.current?.click()
                    : fileInputRef.current?.click())}
                titulo={camaraAbierta === 'justificante' ? 'Foto del justificante' : 'Foto de la mercancía'}
            />
        </div>,
        document.body
    );
}
