import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, CheckCircle, PenTool, Camera, Image as ImageIcon, Mic, MicOff, Wallet, MapPin, RotateCcw, AlertTriangle, FileText, Package } from 'lucide-react';
import SignatureCanvas from 'react-signature-canvas';
import Shipment from '../../models/Shipment';
import { compressImage } from '../../utils/imageCompression';
import { printSimplifiedInvoice } from '../../utils/printSimplifiedInvoice';
import CameraCaptureModal from '../CameraCaptureModal';

// Reintentos de localización GPS al abrir el modal: en sitios con mala señal
// (naves, sótanos) un solo intento sin timeout se queda esperando para siempre.
// Se reintenta varias veces con un límite corto por intento antes de rendirse.
const GPS_MAX_ATTEMPTS = 8;
const GPS_RETRY_INTERVAL_MS = 5000;

export default function DeliveryConfirmationModal({ isOpen, onClose, onConfirm, shipment, collectionAlert, pendingDebts = [], clients = [], sameClientStops = [], zoom = 1 }) {
    const labelClass = "block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1";
    const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all shadow-sm";
    const [isSignatureCaptured, setIsSignatureCaptured] = useState(false);
    const sigCanvas = useRef({});
    const [photoPreview, setPhotoPreview] = useState(null);
    const [photoPreview2, setPhotoPreview2] = useState(null);
    // Cámara DENTRO de la app: 1 = foto de agencia/sello, 2 = documento firmado.
    // Salir a la cámara del móvil deja que Android mate la app y se pierde la entrega.
    const [camaraFoto, setCamaraFoto] = useState(null);
    const fotoRespaldoRef = useRef(1); // A qué foto vuelve el respaldo del móvil
    const inputRespaldoRef = useRef(null);

    const [receiverName, setReceiverName] = useState('');
    const [receiverId, setReceiverId] = useState('');
    const [isListening, setIsListening] = useState(false);
    const [deliveryCoordinates, setDeliveryCoordinates] = useState('');
    const [gpsAttempt, setGpsAttempt] = useState(0);
    const [gpsFailed, setGpsFailed] = useState(false);
    const gpsRetryTimeoutRef = useRef(null);
    const [customAmounts, setCustomAmounts] = useState({});
    const [selectedDebts, setSelectedDebts] = useState([]);
    // Otras paradas de hoy para el mismo destinatario que se cerrarán en este mismo
    // gesto. El conductor las puede desmarcar si el cliente solo se queda una parte.
    const [selectedStopIds, setSelectedStopIds] = useState([]);
    const [showReturnPrompt, setShowReturnPrompt] = useState(false);
    const [initialReturnAlert, setInitialReturnAlert] = useState(false);
    const [initialSignatureAlert, setInitialSignatureAlert] = useState(false);
    const [pendingConfirmData, setPendingConfirmData] = useState(null);
    const [validationFailed, setValidationFailed] = useState(false);
    const [includeIva, setIncludeIva] = useState(false);
    const [clientGives, setClientGives] = useState('');

    // Parse helper
    const parseVal = (val) => {
        if (typeof val === 'number') return val;
        if (!val) return 0;
        return parseFloat(val.toString().replace(/[^0-9.-]+/g, "")) || 0;
    };

    // Build the Shipment model instance to use its business logic
    const shipmentModel = useMemo(() => {
        if (!shipment) return null;

        // Find the destination client to get their billingType (search in root clients AND branches)
        const destNorm = String(shipment.destinationName || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        let destBillingType = null;

        for (const c of (clients || [])) {
            const nameNorm = String(c.name || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (nameNorm === destNorm) {
                destBillingType = c.billingType;
                break;
            }
            if (c.branches && Array.isArray(c.branches)) {
                for (const b of c.branches) {
                    const bNorm = String(b.name || '').trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    if (bNorm === destNorm) {
                        destBillingType = c.billingType;
                        break;
                    }
                }
                if (destBillingType) break;
            }
        }

        return new Shipment({
            ...shipment,
            // Pass destination billing type from client list if available
            destinationBillingType: destBillingType || shipment.destinationBillingType || null,
        });
    }, [shipment, clients]);

    /**
     * Quién recibió la última vez en esta dirección. Se guarda al confirmar la entrega
     * (ver el auto-aprendizaje del destinatario en DriverDashboard) y aquí sale como
     * chuleta: en gris, y sólo se escribe en los campos si el conductor la toca. No se
     * rellena solo a propósito — la prueba de entrega dice quién ha recibido HOY, y un
     * nombre que nadie ha mirado es peor que uno en blanco.
     */
    const receptorHabitual = useMemo(() => {
        if (!shipment) return null;
        const sinTildes = new RegExp('[\\u0300-\\u036f]', 'g');
        const norm = (v) => String(v || '').trim().toLowerCase().normalize('NFD').replace(sinTildes, '');
        const destNorm = norm(shipment.destinationName);
        if (!destNorm) return null;

        for (const c of (clients || [])) {
            if (norm(c.name) === destNorm) return c.lastReceiver || null;
            for (const b of (Array.isArray(c.branches) ? c.branches : [])) {
                // La sede tiene su propia chuleta; si no la tiene, la de la casa madre
                // no vale: quien firma en un almacén no es quien firma en otro.
                if (norm(b.name) === destNorm) return b.lastReceiver || null;
            }
        }
        return null;
    }, [shipment, clients]);

    const haySugerencia = !!(receptorHabitual?.name || '').trim();

    // Build list of current shipment cobros using the MODEL logic
    const currentParts = useMemo(() => {
        if (!shipment || !shipmentModel) return [];
        const parts = [];
        const porte = parseVal(shipment.customAmount) || parseVal(shipment.amount) || 0;
        const cod = parseVal(shipment.codAmount) || 0;
        const amountToColl = shipmentModel.amountToCollectAtDelivery();

        // Detectar si el importe es "Tarifa" (sin valor numérico calculado)
        const isTarifaText = porte === 0 && (
            String(shipment.amount || '').toLowerCase().includes('tarifa') ||
            String(shipment.customAmount || '').toLowerCase().includes('tarifa')
        );

        // Porte a cobrar en destino
        if (shipment.porteType === 'Debido' && (porte > 0 || isTarifaText)) {
            if (porte > 0) {
                const porteACobrar = amountToColl - (shipment.hasCod ? cod : 0);
                if (porteACobrar > 0) {
                    parts.push({
                        id: `${shipment.id}-porte`,
                        shipmentId: shipment.id,
                        type: 'Porte',
                        amount: porteACobrar.toFixed(2),
                        label: 'Porte Debido',
                        detail: shipment.destinationName || 'Destinatario'
                    });
                }
                // Si porteACobrar no es positivo con porte > 0, es porque el destinatario
                // factura (amountToCollectAtDelivery() sólo devuelve el reembolso — ver
                // Shipment.js, Caso 7): el porte va a su factura y el conductor no cobra
                // nada en mano por él. Antes había aquí un "por si acaso" que volvía a
                // meter el porte completo como pendiente, y eso es justo lo contrario de
                // la regla: el listado de la ruta ya no muestra "COBRAR" para estos
                // clientes, así que este modal tampoco debe pedirlo.
            } else if (isTarifaText && !shipment.portePaid) {
                // El precio es "Tarifa" sin valor → permitir al conductor poner el importe manualmente
                parts.push({
                    id: `${shipment.id}-porte`,
                    shipmentId: shipment.id,
                    type: 'Porte',
                    amount: '0.00',
                    label: 'Porte Debido (introducir importe)',
                    detail: shipment.destinationName || 'Destinatario',
                    needsManualAmount: true
                });
            }
        } else if (shipment.status === 'Pendiente Cobro' && porte > 0) {
            parts.push({
                id: `${shipment.id}-porte`,
                shipmentId: shipment.id,
                type: 'Porte',
                amount: porte.toFixed(2),
                label: 'Porte (Pendiente)',
                detail: shipment.destinationName || 'Destinatario'
            });
        }

        // Reembolso (COD) siempre se cobra al destinatario
        if (shipment.hasCod && cod > 0) {
            parts.push({
                id: `${shipment.id}-reembolso`,
                shipmentId: shipment.id,
                type: 'Reembolso',
                amount: cod.toFixed(2),
                label: 'Reembolso',
                detail: shipment.destinationName || 'Destinatario'
            });
        }

        return parts;
    }, [shipment, shipmentModel]);

    // Paradas extra realmente marcadas por el conductor.
    const selectedStops = useMemo(
        () => sameClientStops.filter(st => selectedStopIds.includes(st.shipment?.id)),
        [sameClientStops, selectedStopIds]
    );

    // Si se cierran varios albaranes en el mismo gesto manda la regla más estricta de
    // todos. Pedir el DNI una vez y guardarlo en los dos es correcto; cerrar en silencio
    // un albarán que exigía DNI sin haberlo pedido, no.
    const effectiveRules = useMemo(() => {
        const merged = { ...(shipment?.deliveryRules || {}) };
        selectedStops.forEach(st => {
            const r = st.shipment?.deliveryRules || {};
            if (r.requireDNI) merged.requireDNI = true;
            if (r.requirePhoto) merged.requirePhoto = true;
            // Firma y nombre se dan por obligatorios salvo que se desactiven a propósito,
            // así que basta con que uno de los albaranes no los desactive.
            if (r.requireSignature !== false && merged.requireSignature === false) merged.requireSignature = true;
            if (r.requireName !== false && merged.requireName === false) merged.requireName = true;
        });
        return merged;
    }, [shipment, selectedStops]);

    const allSelectableDebts = useMemo(() => {
        const extras = selectedStops.flatMap(st => st.debts || []);
        return [...currentParts, ...pendingDebts, ...extras];
    }, [currentParts, pendingDebts, selectedStops]);

    // Al abrir, se marcan todas las paradas del mismo destinatario. Sólo se reinicia si
    // cambia el conjunto de paradas, no en cada refresco: si no, una actualización en
    // tiempo real volvería a marcar lo que el conductor acababa de desmarcar.
    const stopIdsKey = sameClientStops.map(st => st.shipment?.id).join('|');
    useEffect(() => {
        if (!isOpen) { setSelectedStopIds([]); return; }
        setSelectedStopIds(stopIdsKey ? stopIdsKey.split('|') : []);
    }, [isOpen, stopIdsKey]);

    // Los cobros se marcan solos según van apareciendo: los del albarán actual al abrir,
    // y los de una parada extra en cuanto se marca. Lo que el conductor haya desmarcado
    // o escrito a mano se respeta, porque este efecto se vuelve a ejecutar cada vez que
    // se marca o desmarca una parada y reiniciarlo entero borraría los importes.
    const seenDebtIdsRef = useRef(new Set());
    useEffect(() => {
        if (!isOpen) {
            seenDebtIdsRef.current = new Set();
            setSelectedDebts([]);
            setCustomAmounts({});
            setClientGives('');
            return;
        }

        const vigentes = new Set(allSelectableDebts.map(d => d.id));
        const nuevos = allSelectableDebts.filter(d => !seenDebtIdsRef.current.has(d.id));

        setSelectedDebts(prev => {
            const vivos = prev.filter(id => vigentes.has(id));
            if (nuevos.length === 0) return vivos.length === prev.length ? prev : vivos;
            return [...vivos, ...nuevos.map(d => d.id)];
        });

        setCustomAmounts(prev => {
            const sobran = Object.keys(prev).filter(id => !vigentes.has(id));
            if (nuevos.length === 0 && sobran.length === 0) return prev;
            const next = { ...prev };
            sobran.forEach(id => delete next[id]);
            nuevos.forEach(d => {
                next[d.id] = (d.needsManualAmount || d.amount === 'Tarifa') ? '' : d.amount;
            });
            return next;
        });

        seenDebtIdsRef.current = vigentes;
    }, [isOpen, allSelectableDebts]);

    // Calculate Dynamic Total using custom amounts (Separating Porte from Reembolso)
    const basePorteTotal = allSelectableDebts
        .filter(d => selectedDebts.includes(d.id) && d.type === 'Porte')
        .reduce((sum, d) => {
            const val = customAmounts[d.id] !== undefined ? customAmounts[d.id] : d.amount;
            return sum + (String(val).toLowerCase() === 'tarifa' ? 0 : parseVal(val));
        }, 0);

    const baseReembolsoTotal = allSelectableDebts
        .filter(d => selectedDebts.includes(d.id) && d.type === 'Reembolso')
        .reduce((sum, d) => {
            const val = customAmounts[d.id] !== undefined ? customAmounts[d.id] : d.amount;
            return sum + (String(val).toLowerCase() === 'tarifa' ? 0 : parseVal(val));
        }, 0);

    const baseTotalToCollect = basePorteTotal + baseReembolsoTotal;
    const totalToCollect = includeIva ? +(basePorteTotal * 1.21 + baseReembolsoTotal).toFixed(2) : baseTotalToCollect;

    useEffect(() => {
        if (isOpen && navigator.geolocation) {
            let cancelled = false;

            const tryGetPosition = (attempt) => {
                if (cancelled) return;
                setGpsAttempt(attempt);
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        if (cancelled) return;
                        setDeliveryCoordinates(`${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`);
                    },
                    (error) => {
                        if (cancelled) return;
                        console.log('[GPS] intento', attempt, 'de', GPS_MAX_ATTEMPTS, error);
                        if (attempt < GPS_MAX_ATTEMPTS) {
                            gpsRetryTimeoutRef.current = setTimeout(() => tryGetPosition(attempt + 1), GPS_RETRY_INTERVAL_MS);
                        } else {
                            setGpsFailed(true);
                        }
                    },
                    { enableHighAccuracy: true, timeout: GPS_RETRY_INTERVAL_MS - 500, maximumAge: 0 }
                );
            };

            tryGetPosition(1);

            return () => {
                cancelled = true;
                if (gpsRetryTimeoutRef.current) clearTimeout(gpsRetryTimeoutRef.current);
            };
        } else if (!isOpen) {
            if (gpsRetryTimeoutRef.current) clearTimeout(gpsRetryTimeoutRef.current);
            setDeliveryCoordinates('');
            setGpsAttempt(0);
            setGpsFailed(false);
            setReceiverName('');
            setReceiverId('');
            setReceiverId('');
            setPhotoPreview(null);
            setPhotoPreview2(null);
            setShowReturnPrompt(false);
            setInitialReturnAlert(false);
            setInitialSignatureAlert(false);
            setPendingConfirmData(null);
            setValidationFailed(false);
            setIncludeIva(false);
            if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
                sigCanvas.current.clear();
            }
        }
    }, [isOpen]);

    // Handle Initial Return Alert
    useEffect(() => {
        if (isOpen && shipment) {
            if (shipment.hasReturn) setInitialReturnAlert(true);
            if (shipment.needsSignatureReturn) setInitialSignatureAlert(true);
        }
    }, [isOpen, shipment?.id]);

    if (!isOpen || !shipment) return null;

    // Las reglas ya vienen fusionadas con las de las paradas extra marcadas.
    const rules = effectiveRules;
    const requiresPhoto1 = !!(rules.requirePhoto || shipment.needsSignatureReturn);
    const requiresPhoto2 = !!(rules.requirePhoto && shipment.needsSignatureReturn);

    const handleVoiceInput = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('El reconocimiento de voz no está soportado en tu navegador.');
            return;
        }
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.lang = 'es-ES';
        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            setReceiverName(transcript);
        };
        recognition.start();
    };

    const handlePhotoUpload = async (e, photoIndex = 1) => {
        const file = e.target.files[0];
        e.target.value = ''; // Permite repetir la misma foto y suelta el fichero
        if (!file) return;
        // El fichero va DIRECTO al compresor: convertirlo antes a base64 y
        // descomprimirlo entero dejaba sin memoria al móvil y Android cerraba la app.
        try {
            const compressed = await compressImage(file);
            if (photoIndex === 1) {
                setPhotoPreview(compressed);
            } else {
                setPhotoPreview2(compressed);
            }
        } catch (err) {
            console.error("Compression error:", err);
            alert("No se ha podido procesar la foto. Vuelve a intentarlo; la entrega no se ha perdido.");
        }
    };

    const abrirCamara = (indice) => setCamaraFoto(indice);

    const alHacerFoto = (foto) => {
        if (camaraFoto === 2) setPhotoPreview2(foto);
        else setPhotoPreview(foto);
        setCamaraFoto(null);
    };

    // Sólo si la cámara de dentro no arranca: se sale a la del móvil, con su riesgo.
    const usarCamaraDelMovil = () => {
        fotoRespaldoRef.current = camaraFoto || 1;
        inputRespaldoRef.current?.click();
    };

    const handleClearSignature = () => {
        if (sigCanvas.current && typeof sigCanvas.current.clear === 'function') {
            sigCanvas.current.clear();
            setIsSignatureCaptured(false);
        }
    };

    const handleClearPhoto = (photoIndex = 1) => {
        if (photoIndex === 1) {
            setPhotoPreview(null);
        } else {
            setPhotoPreview2(null);
        }
    };

    const handleConfirm = async (status, skipCurrentDebts = false) => {
        let proofData = { 
            type: 'multi', 
            coordinates: deliveryCoordinates,
            name: receiverName,
            id: receiverId,
            signatureData: null,
            photoData: photoPreview,
            photoData2: photoPreview2
        };

        // Capture Signature if not empty
        if (sigCanvas.current && !sigCanvas.current.isEmpty()) {
            try {
                const trimmed = sigCanvas.current.getTrimmedCanvas();
                const rawSignature = trimmed.toDataURL('image/png');
                proofData.signatureData = await compressImage(rawSignature, 800, 400, 0.6);
            } catch (e) {
                try {
                    proofData.signatureData = sigCanvas.current.toDataURL('image/png');
                } catch (err) {
                    console.error("Error generating signature image", err);
                }
            }
        }

        // Validation: At least name + (signature OR photo) if status is 'Entregado' and NOT a pickup
        if (status === 'Entregado' && shipment?.type !== 'Recogida') {
            const rules = effectiveRules;
            let hasError = false;
            
            // Check required DNI
            if (rules.requireDNI && !receiverId?.trim()) {
                hasError = true;
            }
            
            // Check required Photos (If needsSignatureReturn is true, we require at least 1 photo.
            // If rules.requirePhoto is also true, we require 2 photos).
            const requiresPhoto1 = rules.requirePhoto || shipment.needsSignatureReturn;
            const requiresPhoto2 = rules.requirePhoto && shipment.needsSignatureReturn;

            if (requiresPhoto1 && !proofData.photoData) {
                hasError = true;
            }
            if (requiresPhoto2 && !proofData.photoData2) {
                hasError = true;
            }
            
            // Check required Signature
            if (rules.requireSignature !== false && !proofData.signatureData) {
                hasError = true;
            }

            // Check required Name
            if (rules.requireName !== false && !receiverName?.trim()) {
                hasError = true;
            }
            if (!proofData.signatureData && !proofData.photoData) {
                hasError = true;
            }

            if (hasError) {
                setValidationFailed(true);
                // Show specific error for the first failing rule
                if (rules.requireDNI && !receiverId?.trim()) {
                    alert("🪪 DNI OBLIGATORIO\n\nEste cliente exige que el receptor identifique su DNI/NIE antes de entregar.");
                } else if (requiresPhoto1 && !proofData.photoData) {
                    alert(shipment.needsSignatureReturn
                        ? "📸 FOTO 1 OBLIGATORIA\n\nEs obligatorio tomar una foto del albarán de la agencia."
                        : "📸 FOTO OBLIGATORIA\n\nEste cliente exige una foto para completar la entrega.");
                } else if (requiresPhoto2 && !proofData.photoData2) {
                    alert("📄 FOTO 2 OBLIGATORIA\n\nDebes tomar una foto del albarán de contenido firmado (Documentación de vuelta).");
                } else if (rules.requireSignature !== false && !proofData.signatureData) {
                    alert("✍️ FIRMA OBLIGATORIA\n\nEste cliente exige una firma real en la entrega.");
                } else if (rules.requireName !== false && !receiverName?.trim()) {
                    alert("📝 NOMBRE OBLIGATORIO\n\nDebes escribir el nombre de quien recibe el paquete.");
                } else {
                    alert("Es obligatorio capturar al menos una prueba (Firma o Foto del Sello/Albarán).");
                }
                return;
            }

            // Ubicación GPS: no bloquea la entrega (el conductor puede estar en un sitio
            // sin señal), pero se avisa para que sea una decisión consciente y no un
            // hueco silencioso que nadie nota hasta que hace falta para una reclamación.
            if (!deliveryCoordinates) {
                const proceedWithoutGps = window.confirm(
                    gpsFailed
                        ? '⚠️ No se ha podido obtener tu ubicación GPS tras varios intentos.\n\n¿Confirmar la entrega sin ubicación registrada?'
                        : '⚠️ Todavía no se ha capturado tu ubicación GPS.\n\n¿Confirmar la entrega sin esperar a la ubicación?'
                );
                if (!proceedWithoutGps) return;
            }
        }

        // IMPORTANT: Filter out current shipment debts if we are choosing "Postpone/Aplazar" mode
        // Al aplazar, NO se procesa ningún cobro (ni el actual ni otros pendientes).
        // Los cobros de otros albaranes solo se registran cuando se entrega con éxito.
        const finalDebts = skipCurrentDebts ? [] : selectedDebts;

        if (status === 'Entregado' && shipment.hasReturn && !showReturnPrompt) {
            setPendingConfirmData({ shipmentId: shipment.id, proofData, status, finalDebts, customAmounts, includeIva });
            setShowReturnPrompt(true);
            return;
        }

        executeConfirm(shipment.id, proofData, status, finalDebts, customAmounts, false, includeIva);
    };

    const executeConfirm = (shipId, pData, stat, fDebts, cAmts, shouldGen, wantsIva) => {
        let extraFlags = null;
        if (wantsIva) {
            // Solo aplicamos IVA a la parte de Porte
            const finalPorteTotal = fDebts.reduce((sum, dId) => {
                const debt = allSelectableDebts.find(d => d.id === dId);
                if (debt?.type !== 'Porte') return sum;
                const val = cAmts[dId] !== undefined ? cAmts[dId] : debt.amount;
                return sum + parseVal(val);
            }, 0);
            
            const finalPorteWithIva = +(finalPorteTotal * 1.21).toFixed(2);
            
            extraFlags = {
                hasSimplifiedInvoice: true,
                simplifiedInvoiceAmount: finalPorteWithIva,
                simplifiedInvoicePaid: true
            };

            printSimplifiedInvoice({
                ...shipment,
                amount: finalPorteWithIva,
                id: shipment.id,
                date: new Date().toLocaleDateString('es-ES'),
                articles: shipment.articles || []
            });
        }
        
        // Las paradas extra sólo se arrastran en una entrega efectiva. Al aplazar el
        // porte el paquete también se entrega (sólo queda la deuda), así que también
        // se cierran; los cobros ya vienen vaciados en fDebts.
        const extraStopIds = stat === 'Entregado' ? selectedStopIds : [];
        onConfirm(shipId, pData, stat, fDebts, cAmts, shouldGen, extraFlags, extraStopIds);
    };

    const handleConfirmReturn = (shouldGenerate) => {
        if (!pendingConfirmData) return;
        executeConfirm(
            pendingConfirmData.shipmentId, 
            pendingConfirmData.proofData, 
            pendingConfirmData.status, 
            pendingConfirmData.finalDebts, 
            pendingConfirmData.customAmounts,
            shouldGenerate,
            pendingConfirmData.includeIva
        );
        setShowReturnPrompt(false);
    };
    // El modal se saca del árbol del dashboard con un portal a propósito. El dashboard
    // del conductor va envuelto en `style={{ zoom }}` (la lupa A+/A-) y el zoom de CSS
    // NO ajusta las unidades de viewport: dentro de un zoom 1.3, un alto de 94vh se
    // dibuja al 122% de la pantalla y los botones de abajo se salen. Fuera del zoom,
    // `fixed inset-0` y `100dvh` valen exactamente lo que mide la pantalla.
    // El zoom del conductor se vuelve a aplicar más abajo, pero sólo al CONTENIDO de
    // cada bloque, nunca al armazón que mide con dvh.
    return createPortal(
        <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-md z-[100] flex items-end sm:items-center justify-center sm:p-4 animate-in fade-in duration-300">
            <div className="bg-white sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col modal-mobile-full">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center shrink-0" style={{ zoom }}>
                    <h3 className="font-bold text-slate-800">{shipment?.type === 'Recogida' ? 'Cobros Pendientes' : 'Confirmar Entrega'}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={20} />
                    </button>
                </div>

                {/* Otras paradas de hoy para el mismo destinatario. Se cierran con esta
                    misma firma y ubicación, pero cada albarán guarda su propia prueba.
                    Van marcadas de salida porque el caso normal es entregarlo todo; se
                    desmarcan si el cliente sólo se queda una parte. */}
                {sameClientStops.length > 0 && (
                    <div
                        className="bg-blue-50 border-b border-blue-100 p-3 sm:p-4 shrink-0 overflow-y-auto max-h-[calc(28dvh/var(--z,1))] custom-scrollbar"
                        style={{ zoom, '--z': zoom }}
                    >
                        <div className="flex items-center gap-2 mb-1">
                            <Package className="text-blue-600 shrink-0" size={18} />
                            <h4 className="text-sm font-black text-blue-700 uppercase tracking-tighter">
                                Más entregas para {shipment.destinationName || shipment.client}
                            </h4>
                        </div>
                        <p className="text-[11px] text-blue-700/80 mb-3 leading-snug">
                            Se cerrarán con esta misma firma y ubicación. Desmarca lo que no entregues.
                        </p>
                        <div className="space-y-2">
                            {sameClientStops.map(st => {
                                const marcada = selectedStopIds.includes(st.shipment.id);
                                return (
                                    <label
                                        key={st.shipment.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${marcada ? 'bg-white border-blue-200 shadow-sm' : 'bg-blue-50/50 border-blue-100 opacity-60'}`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={marcada}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedStopIds([...selectedStopIds, st.shipment.id]);
                                                else setSelectedStopIds(selectedStopIds.filter(sid => sid !== st.shipment.id));
                                            }}
                                            className="w-5 h-5 accent-blue-600 shrink-0"
                                        />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold text-slate-800 leading-tight">{st.resumen}</p>
                                            <p className="text-[10px] text-slate-400 font-mono">{st.shipment.id}</p>
                                        </div>
                                        {st.totalCobro > 0 && (
                                            <span className="text-sm font-black text-red-600 shrink-0">
                                                {st.totalCobro.toFixed(2)}€
                                            </span>
                                        )}
                                    </label>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Unified Cobros Section (The "Alarma").
                    El alto máximo se divide entre el zoom porque este bloque se dibuja
                    escalado: 35dvh/1.4 escalado por 1.4 vuelve a ser 35dvh de pantalla
                    real. Si no, con la lupa a tope los cobros se comen la pantalla. */}
                {allSelectableDebts.length > 0 && (
                    <div
                        className="bg-red-50 border-b border-orange-100 p-3 sm:p-4 shrink-0 overflow-y-auto max-h-[calc(35dvh/var(--z,1))] sm:max-h-[calc(40dvh/var(--z,1))] custom-scrollbar"
                        style={{ zoom, '--z': zoom }}
                    >
                        {shipment.hasReturn && (
                            <div className="mb-3 flex items-center gap-3 bg-red-600 text-white p-3 rounded-xl animate-pulse shadow-lg shadow-red-600/20">
                                <RotateCcw size={18} className="shrink-0" />
                                <div className="flex-1 leading-none">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Aviso Especial</p>
                                    <p className="text-sm font-bold">ESTE ENVÍO TIENE RETORNO</p>
                                </div>
                                <AlertTriangle size={18} />
                            </div>
                        )}
                        {shipment.needsSignatureReturn && (
                            <div className="mb-3 flex items-center gap-3 bg-emerald-600 text-white p-3 rounded-xl shadow-lg shadow-emerald-600/20">
                                <FileText size={18} className="shrink-0" />
                                <div className="flex-1 leading-none">
                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Documentación</p>
                                    <p className="text-sm font-bold">RECOGER FIRMA DE VUELTA</p>
                                </div>
                                <CheckCircle size={18} />
                            </div>
                        )}
                        <div className="flex items-center gap-2 mb-3">
                            <Wallet className="text-red-600" size={18} />
                            <h4 className="text-sm font-black text-red-700 uppercase tracking-tighter">Listado de Cobros Pendientes</h4>
                        </div>

                        <div className="space-y-2">
                            {allSelectableDebts.map(debt => {
                                const isSelected = selectedDebts.includes(debt.id);
                                return (
                                    <label
                                        key={debt.id}
                                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${isSelected ? 'bg-white border-red-200 shadow-sm' : 'bg-red-50/50 border-red-100 opacity-60'
                                            }`}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={(e) => {
                                                if (e.target.checked) setSelectedDebts([...selectedDebts, debt.id]);
                                                else setSelectedDebts(selectedDebts.filter(id => id !== debt.id));
                                            }}
                                            className="w-5 h-5 text-red-600 rounded-md focus:ring-red-500 border-red-200"
                                        />
                                        <div className="flex-1">
                                            <div className="flex justify-between items-center">
                                                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${debt.type === 'Porte' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                                                    }`}>
                                                    {debt.type}
                                                </span>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className={`flex items-center gap-1 rounded-lg px-2 py-1 shadow-inner transition-all ${debt.needsManualAmount ? 'bg-red-50 border-2 border-red-400 ring-2 ring-red-200' : 'bg-slate-50 border border-slate-200 focus-within:border-blue-400 focus-within:ring-1 focus-within:ring-blue-400'}`}>
                                                        <input
                                                            type="number"
                                                            step="0.01"
                                                            inputMode="decimal"
                                                            value={customAmounts[debt.id] ?? ''}
                                                            onChange={(e) => {
                                                                setCustomAmounts(prev => ({ ...prev, [debt.id]: e.target.value }));
                                                            }}
                                                            onClick={(e) => e.preventDefault()}
                                                            className={`bg-transparent border-none p-0 text-right font-mono font-bold text-sm focus:ring-0 ${debt.needsManualAmount ? 'w-20 text-red-700' : 'w-16 text-slate-800'}`}
                                                            placeholder={debt.needsManualAmount ? "PRECIO" : "0.00"}
                                                            autoFocus={debt.needsManualAmount}
                                                        />
                                                        <span className="text-xs font-bold text-slate-400">€</span>
                                                    </div>
                                                </div>
                                            </div>
                                            <p className="text-xs font-bold text-slate-700 mt-0.5">{debt.label}</p>
                                            {debt.detail && <p className="text-[10px] text-slate-400">{debt.detail}</p>}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>

                        <div className="mt-4 pt-3 border-t border-red-200">
                            <div className="flex justify-between items-end">
                                <div>
                                    <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">Total Seleccionado</p>
                                    <p className="text-2xl font-black text-red-800 leading-none">{totalToCollect.toFixed(2)}€</p>
                                </div>
                                <span className="text-[10px] text-red-400 font-medium">Se marcarán como cobrados</span>
                            </div>

                            {/* 💰 CALCULADORA DE CAMBIO */}
                            {totalToCollect > 0 && (() => {
                                const given = parseFloat(clientGives) || 0;
                                const change = +(given - totalToCollect).toFixed(2);
                                const hasEnough = given >= totalToCollect;
                                const hasInput = clientGives !== '' && given > 0;
                                return (
                                    <div className="mt-2 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                        <div className="flex items-center gap-2 px-2.5 py-1.5">
                                            <span className="text-sm">💰</span>
                                            <p className="text-[9px] font-black text-slate-500 uppercase tracking-wider flex-1">Calculadora de Cambio</p>
                                            {hasInput && (
                                                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${hasEnough ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                                                    {hasEnough ? (change === 0 ? '✅ Exacto' : `💵 Cambio: ${change.toFixed(2)}€`) : `⚠️ Faltan: ${Math.abs(change).toFixed(2)}€`}
                                                </span>
                                            )}
                                        </div>
                                        <div className="px-2.5 pb-2 flex items-center gap-2">
                                            <div className="flex-1 flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 shadow-inner focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/30 transition-all">
                                                <span className="text-xs font-bold text-slate-400">€</span>
                                                <input
                                                    type="number"
                                                    step="0.01"
                                                    min="0"
                                                    value={clientGives}
                                                    onChange={(e) => setClientGives(e.target.value)}
                                                    placeholder="Cantidad que da el cliente..."
                                                    className="flex-1 bg-transparent border-none p-0 text-sm font-mono font-bold text-slate-800 focus:ring-0 placeholder:text-slate-300 placeholder:font-normal placeholder:text-xs"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}

                            {/* Casilla Factura Simplificada */}
                            {basePorteTotal > 0 && (
                                <label className={`mt-3 flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer shadow-sm ${includeIva ? 'bg-orange-50 border-orange-200' : 'bg-white border-slate-200 hover:bg-slate-50'}`}>
                                    <input 
                                        type="checkbox" 
                                        checked={includeIva}
                                        onChange={(e) => setIncludeIva(e.target.checked)}
                                        className="w-5 h-5 text-orange-600 rounded-md focus:ring-orange-500 border-slate-300"
                                    />
                                    <div className="flex-1 leading-none">
                                        <p className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                            🧾 Emitir Factura Simplificada
                                        </p>
                                        <p className="text-[10px] text-slate-500 mt-1">Aplica un +21% de IVA al cobro del porte (+{+(basePorteTotal * 0.21).toFixed(2)}€)</p>
                                    </div>
                                </label>
                            )}
                        </div>
                    </div>
                )}

                <div className="p-6 flex-1 overflow-y-auto custom-scrollbar" style={{ zoom }}>
                    <div className="mb-4 space-y-1">
                        <p className="text-sm text-slate-500">
                            Envia: <span className="font-bold text-slate-800">{shipment.client}</span>
                        </p>
                        <p className="text-sm text-slate-500">
                            Entrega para: <span className="font-bold text-slate-800">{shipment.destinationName}</span>
                        </p>
                    </div>

                    <div className={`flex items-center gap-2 text-xs mb-4 px-3 py-2 rounded-lg ${deliveryCoordinates
                        ? 'bg-emerald-50 text-emerald-700'
                        : gpsFailed ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                        <MapPin size={14} />
                        {deliveryCoordinates
                            ? `📍 Ubicación capturada: ${deliveryCoordinates}`
                            : gpsFailed
                                ? '⚠️ No se pudo obtener el GPS tras varios intentos'
                                : `⏳ Buscando señal GPS... intento ${gpsAttempt} de ${GPS_MAX_ATTEMPTS}`
                        }
                    </div>

                    {/* Secciones de prueba: Solo para entregas, NO para recogidas */}
                    {shipment?.type !== 'Recogida' && (
                    <div className="space-y-6">


                        {/* 1. Recipient Name Section */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                <FileText size={14} className="text-blue-500" />
                                Datos de quien recibe
                            </h4>

                            {/* Chuleta de la última entrega en esta dirección. Se toca y
                                rellena los dos campos; si no, no escribe nada. */}
                            {haySugerencia && !receiverName?.trim() && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setReceiverName(receptorHabitual.name);
                                        if (receptorHabitual.dni) setReceiverId(receptorHabitual.dni);
                                    }}
                                    className="w-full flex items-center gap-2 text-left bg-white border border-dashed border-slate-300 rounded-xl px-3 py-2 active:bg-slate-100 transition-colors"
                                >
                                    <RotateCcw size={14} className="text-slate-400 shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">La última vez recibió</span>
                                        <span className="block text-sm font-bold text-slate-500 truncate">
                                            {receptorHabitual.name}
                                            {receptorHabitual.dni ? ` · ${receptorHabitual.dni}` : ''}
                                        </span>
                                    </span>
                                    <span className="text-[10px] font-black uppercase text-blue-600 shrink-0">Usar</span>
                                </button>
                            )}

                            <div>
                                <label className={labelClass}>Nombre Completo {rules.requireName !== false && <span className="text-red-500">*</span>}</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder={haySugerencia ? receptorHabitual.name : "Pulsa el micro y habla..."}
                                        className={`${inputClass} pr-10 ${validationFailed && rules.requireName !== false && !receiverName?.trim() ? '!border-red-500 !ring-2 !ring-red-500/30 animate-pulse' : ''}`}
                                        value={receiverName}
                                        onChange={(e) => setReceiverName(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleVoiceInput}
                                        className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-colors ${isListening ? 'bg-red-100 text-red-600 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
                                        title="Dictar nombre"
                                    >
                                        {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                                    </button>
                                </div>
                            </div>
                            {/* DNI: siempre a la vista para poder anotarlo aunque el cliente no
                                lo pida. Antes solo aparecía con requireDNI, y como esa regla es
                                una foto congelada del cliente al crear el albarán, el conductor
                                se quedaba sin sitio donde apuntarlo. Obligatorio (asterisco rojo
                                y bloqueo al confirmar) sigue siéndolo solo si el cliente lo exige. */}
                            <div>
                                <label className={labelClass}>
                                    DNI / NIE / ID{' '}
                                    {rules.requireDNI
                                        ? <span className="text-red-500">*</span>
                                        : <span className="text-slate-400 font-medium normal-case tracking-normal">(opcional)</span>}
                                </label>
                                <input
                                    type="text"
                                    placeholder={receptorHabitual?.dni || "12345678X"}
                                    className={`${inputClass} ${validationFailed && rules.requireDNI && !receiverId?.trim() ? '!border-red-500 !ring-2 !ring-red-500/30 animate-pulse' : ''}`}
                                    value={receiverId}
                                    onChange={(e) => setReceiverId(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* BULTOS — recordatorio de qué hay que entregar. Antes ocupaba tres
                            pisos (cabecera, lista de artículos y aviso de verificación) y se
                            comía la pantalla por delante de los campos que sí hay que rellenar.
                            Se mantiene el naranja para que siga cantando, pero en una sola
                            línea, y con el nombre del artículo además del recuento: saber que
                            va "1 bulto" no dice qué se entrega, que es justo para lo que sirve. */}
                        {(() => {
                            const arts = shipment.articles || [];
                            const pkgText = shipment.packages || '';
                            const hasArts = arts.length > 0;
                            const totalBultos = hasArts
                                ? arts.reduce((s, a) => s + (parseInt(a.quantity) || 1), 0)
                                : null;
                            if (!hasArts && !pkgText) return null;

                            const detalle = hasArts
                                ? arts.map(a => {
                                    const cantidad = parseInt(a.quantity) || 1;
                                    return cantidad > 1 ? `${cantidad}× ${a.name}` : a.name;
                                }).join(', ')
                                : pkgText;

                            return (
                                <div className="flex items-center gap-2 rounded-xl border-2 border-orange-300 bg-orange-50 px-3 py-2">
                                    <Package size={16} className="text-orange-500 shrink-0" />
                                    {totalBultos !== null && (
                                        <span className="bg-orange-500 text-white font-black text-[11px] px-2 py-0.5 rounded-full shrink-0">
                                            {totalBultos} {totalBultos === 1 ? 'bulto' : 'bultos'}
                                        </span>
                                    )}
                                    <span className="min-w-0 text-sm font-bold text-slate-800 leading-tight whitespace-pre-wrap">
                                        {detalle}
                                    </span>
                                </div>
                            );
                        })()}

                        {/* 2. Signature Section */}
                        <div className="space-y-2">
                            <div className="flex justify-between items-end">
                                <label className={labelClass}>Firma Digital</label>
                                <button onClick={handleClearSignature} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-1">
                                    Limpiar
                                </button>
                            </div>
                            <div className={`bg-white border-2 rounded-2xl h-[160px] relative overflow-hidden shadow-inner ${validationFailed && shipment.deliveryRules?.requireSignature !== false && !isSignatureCaptured ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-200'}`}>
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    onBegin={() => setIsSignatureCaptured(true)}
                                    penColor="black"
                                    canvasProps={{ className: 'absolute inset-0 w-full h-full' }}
                                    backgroundColor="#ffffff"
                                />
                                {!isSignatureCaptured && (
                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
                                        <PenTool size={40} className="text-slate-400" />
                                        <span className="ml-2 text-sm font-bold text-slate-400 uppercase italic">Firme aquí</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 3. Photo Section — siempre a la vista, como el DNI. Antes sólo
                            aparecía si el cliente exigía foto, y el conductor que consigue
                            un sello en la mercancía o en el albarán se quedaba sin dónde
                            guardar esa prueba. Obligatoria (asterisco rojo y bloqueo al
                            confirmar) sigue siéndolo sólo si el cliente lo exige. */}
                            <div className="space-y-4">
                                {/* Mini-recordatorio de bultos: sólo cuando la foto es
                                    obligatoria, que es cuando el conductor está fotografiando
                                    el albarán y tiene que cuadrar lo que entrega. Si no, ya
                                    lo tiene en la línea naranja de arriba. */}
                                {requiresPhoto1 && (() => {
                                    const arts = shipment.articles || [];
                                    const pkgText = shipment.packages || '';
                                    const totalBultos = arts.length > 0
                                        ? arts.reduce((s, a) => s + (parseInt(a.quantity) || 1), 0)
                                        : null;
                                    if (!arts.length && !pkgText) return null;
                                    return (
                                        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                                            <Package size={14} className="text-amber-500 shrink-0" />
                                            <span className="text-xs font-black text-amber-700 uppercase tracking-wide">
                                                {totalBultos !== null
                                                    ? `${totalBultos} ${totalBultos === 1 ? 'bulto' : 'bultos'} — `
                                                    : ''}
                                                {arts.length > 0
                                                    ? arts.map(a => `${parseInt(a.quantity)||1}× ${a.name}`).join(', ')
                                                    : pkgText}
                                            </span>
                                        </div>
                                    );
                                })()}
                                {requiresPhoto2 ? (
                                    <div className="grid grid-cols-2 gap-4">
                                        {/* Photo 1: Agency Proof */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">📸 Foto 1: Agencia <span className="text-red-500">*</span></label>
                                                {photoPreview && (
                                                    <button onClick={() => handleClearPhoto(1)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-0.5">
                                                        Quitar
                                                    </button>
                                                )}
                                            </div>
                                            <div className={`bg-slate-50 border-2 border-dashed rounded-2xl h-[130px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && !photoPreview ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                                {photoPreview ? (
                                                    <img src={photoPreview} alt="Agencia Proof" className="w-full h-full object-contain" />
                                                ) : (
                                                    <button type="button" onClick={() => abrirCamara(1)} className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-2 text-center">
                                                        <div className="p-2 bg-white rounded-full shadow-sm mb-1 text-blue-500">
                                                            <Camera size={20} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Foto Agencia</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>

                                        {/* Photo 2: Content Signature Return Proof */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-end">
                                                <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">📄 Foto 2: Doc. Firmado <span className="text-red-500">*</span></label>
                                                {photoPreview2 && (
                                                    <button onClick={() => handleClearPhoto(2)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-0.5">
                                                        Quitar
                                                    </button>
                                                )}
                                            </div>
                                            <div className={`bg-slate-50 border-2 border-dashed rounded-2xl h-[130px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && !photoPreview2 ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                                {photoPreview2 ? (
                                                    <img src={photoPreview2} alt="Document Proof" className="w-full h-full object-contain" />
                                                ) : (
                                                    <button type="button" onClick={() => abrirCamara(2)} className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-2 text-center">
                                                        <div className="p-2 bg-white rounded-full shadow-sm mb-1 text-emerald-500">
                                                            <FileText size={20} />
                                                        </div>
                                                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-tight">Doc. Firmado</span>
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    /* Single Photo Capture */
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-end">
                                            <label className={labelClass}>
                                                Foto del Sello / Albarán / Documento{' '}
                                                {requiresPhoto1
                                                    ? <span className="text-red-500">*</span>
                                                    : <span className="text-slate-400 font-medium normal-case tracking-normal">(opcional)</span>}
                                            </label>
                                            {photoPreview && (
                                                <button onClick={() => handleClearPhoto(1)} className="text-[10px] text-red-500 font-bold uppercase hover:underline mb-1">
                                                    Quitar
                                                </button>
                                            )}
                                        </div>
                                        <div className={`bg-slate-50 border-2 border-dashed rounded-2xl min-h-[160px] flex flex-col items-center justify-center relative overflow-hidden ${validationFailed && requiresPhoto1 && !photoPreview ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse' : 'border-slate-300'}`}>
                                            {photoPreview ? (
                                                <img src={photoPreview} alt="Proof" className="w-full h-full object-contain" />
                                            ) : (
                                                <button type="button" onClick={() => abrirCamara(1)} className="flex flex-col items-center justify-center w-full h-full cursor-pointer hover:bg-slate-100 transition-colors p-6">
                                                    <div className="p-4 bg-white rounded-full shadow-sm mb-2 text-blue-500">
                                                        <Camera size={32} />
                                                    </div>
                                                    <span className="text-sm text-slate-500 font-bold uppercase tracking-tight">
                                                        {shipment.needsSignatureReturn ? "Tomar Foto del Doc. Firmado" : "Tomar Foto del Sello"}
                                                    </span>
                                                    <span className="text-xs text-slate-400">Captura la evidencia visual</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                    </div>
                    )}
                </div>

                <div className="p-4 border-t border-slate-100 bg-slate-50 shrink-0 flex flex-col gap-2" style={{ zoom }}>
                    {/* Logic: If there is SOMETHING to collect (current Porte, COD, or old Debts), show dual buttons. Else show single finish button. */}
                    {allSelectableDebts.length > 0 ? (
                        <>
                            <button
                                onClick={() => handleConfirm('Entregado')}
                                className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-green-500/20 flex items-center justify-center gap-2 transition-all order-1"
                            >
                                <CheckCircle size={20} />
                                <span>
                                    {shipment?.type === 'Recogida'
                                        ? `Cobrar (€${totalToCollect.toFixed(2)}) y Continuar`
                                        : `Cobrar Todo (€${totalToCollect.toFixed(2)}) y Finalizar`
                                    }
                                </span>
                            </button>
                            {shipment?.type === 'Recogida' ? (
                                <button
                                    onClick={() => { onConfirm(shipment.id, { type: 'multi', coordinates: deliveryCoordinates }, 'skip_pickup', [], customAmounts, false); }}
                                    className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-all border border-slate-200 order-2"
                                >
                                    <span>Saltar Cobros y Continuar</span>
                                </button>
                            ) : (
                                !shipment.hasCod && (
                                    <button
                                        onClick={() => handleConfirm('Entregado', true)}
                                        className="w-full bg-amber-100 hover:bg-amber-200 text-amber-800 py-3 rounded-xl font-bold shadow-sm flex flex-col items-center justify-center gap-1 transition-all border border-amber-200 order-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Wallet size={20} />
                                            <span>Aplazar Porte</span>
                                        </div>
                                        <span className="text-[10px] font-normal opacity-80 text-center px-4">
                                            Entregar paquete HOY. Registrar deuda para cobrar después.
                                        </span>
                                    </button>
                                )
                            )}
                        </>
                    ) : (
                        <button
                            onClick={() => handleConfirm('Entregado')}
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 transition-all"
                        >
                            <CheckCircle size={20} />
                            <span>{shipment?.type === 'Recogida' ? 'Continuar con Recogida' : 'Confirmar Entrega'}</span>
                        </button>
                    )}
                </div>

                {/* Return Prompt Overlay/Screen */}
                {showReturnPrompt && (
                    <div className="absolute inset-0 bg-blue-900/95 backdrop-blur-xl z-[200] flex items-center justify-center p-6 text-center animate-in zoom-in duration-300">
                        <div className="space-y-6 max-w-xs">
                            <div className="w-20 h-20 bg-amber-400 rounded-full flex items-center justify-center mx-auto shadow-lg shadow-amber-400/20">
                                <RotateCcw size={40} className="text-amber-900 animate-spin-slow" />
                            </div>
                            <div className="space-y-2">
                                <h3 className="text-2xl font-black text-white uppercase tracking-tighter">¿Realizar Retorno?</h3>
                                <p className="text-blue-100 text-sm leading-relaxed">Este envío tiene marcado un **retorno**. El precio ({shipment.amount}) será heredado automáticamente al origen.</p>
                            </div>
                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={() => handleConfirmReturn(true)}
                                    className="w-full bg-white text-blue-900 py-3 rounded-xl font-bold text-sm shadow-lg hover:bg-blue-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <RotateCcw size={18} />
                                    GENERAR RETORNO
                                </button>
                                <button
                                    onClick={() => handleConfirmReturn(false)}
                                    className="w-full bg-blue-800/50 text-blue-200 py-3 rounded-xl font-bold hover:bg-blue-800/70 transition-all text-sm"
                                >
                                    NO TIENE RETORNO
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                {/* Initial Return Alert (Upon opening) */}
                {initialReturnAlert && (
                    <div className="absolute inset-0 bg-blue-600 z-[300] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-6 text-white max-w-xs text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                                <RotateCcw size={40} className="text-white" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black uppercase tracking-tighter">¡Llleva Retorno!</h2>
                                <p className="text-blue-100 font-medium">Este envío tiene vinculada una **recogida de retorno**. Recuérdalo antes de marcharte.</p>
                            </div>
                            <button
                                onClick={() => setInitialReturnAlert(false)}
                                className="w-full bg-white text-blue-600 py-4 rounded-2xl font-black shadow-xl shadow-blue-900/20 active:scale-95 transition-all text-sm tracking-widest"
                            >
                                ENTENDIDO, RECOGERÉ EL RETORNO
                            </button>
                        </div>
                    </div>
                )}
                {/* Initial Signature Alert */}
                {initialSignatureAlert && (
                    <div className="absolute inset-0 bg-emerald-600 z-[300] flex items-center justify-center p-8 animate-in fade-in duration-300">
                        <div className="flex flex-col items-center gap-6 text-white max-w-xs text-center">
                            <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center animate-bounce">
                                <FileText size={40} className="text-white" />
                            </div>
                            <div className="space-y-2">
                                <h2 className="text-3xl font-black uppercase tracking-tighter">Papel Firmado</h2>
                                <p className="text-emerald-50 font-medium">El cliente solicita la **devolución de documentación firmada**. Recógela antes de marcharte.</p>
                            </div>
                            <button
                                onClick={() => setInitialSignatureAlert(false)}
                                className="w-full bg-white text-emerald-600 py-4 rounded-2xl font-black shadow-xl shadow-emerald-900/20 active:scale-95 transition-all text-sm tracking-widest"
                            >
                                ENTENDIDO, TENGO EL PAPEL
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <CameraCaptureModal
                isOpen={camaraFoto !== null}
                onClose={() => setCamaraFoto(null)}
                onCapture={alHacerFoto}
                onFallback={usarCamaraDelMovil}
                titulo={camaraFoto === 2 ? 'Documento firmado' : 'Foto de la entrega'}
                maxLado={1200}
                calidad={0.7}
            />
            {/* Respaldo: la cámara del móvil, sólo si la de dentro no arranca. */}
            <input
                ref={inputRespaldoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => handlePhotoUpload(e, fotoRespaldoRef.current)}
            />
        </div>,
        document.body
    );
}
