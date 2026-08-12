import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Download, Upload, Trash2, Database, Shield, Clock, Folder, CheckCircle, AlertCircle, Save, Settings, X, RotateCcw, User } from 'lucide-react'
import DailySummaryModal from './components/DailySummaryModal';
import { ALL_BAREMO_PUEBLOS } from './data/baremos';
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import Shipments from './pages/Shipments'
import Fleet from './pages/Fleet'
import Drivers from './pages/Drivers'
import Login from './pages/Login'
import DriverDashboard from './pages/driver/DriverDashboard'
import Clients from './pages/Clients'
import Articles from './pages/Articles'
import Tracking from './pages/Tracking'
import FuelManagement from './pages/FuelManagement'
import MaintenanceHistory from './pages/MaintenanceHistory'
import ClientDashboard from './pages/client/ClientDashboard'
import Incidents from './pages/Incidents'
import ClientValidation from './pages/ClientValidation'
import PendingCollections from './pages/PendingCollections'
import NotificationCenter from './pages/NotificationCenter'
import Shipment from './models/Shipment';
import { supabase, getUserProfile, getCurrentSession } from './lib/supabase'
import { initStorageBuckets } from './utils/storage';
import { fetchAllRows } from './utils/fetchAllRows';
import { resolveOwnerAgencyId, getClientsOwnedBy } from './utils/agencyOwnership';
import { establecerContextoDeError } from './utils/errorLog';
import { getIrregularReasons } from './utils/shipmentUtils';
import {
  fusionarConocimiento,
  claveAprendizaje,
  esClaveAprendizaje,
  driverIdDeClave,
  ensamblarConocimiento,
  conductoresConCambios
} from './utils/routeKnowledge';
import { BAREMO_1_PUEBLOS, BAREMO_2_PUEBLOS } from './data/baremos';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { enqueue, getQueue, dequeue, getQueueLength } from './utils/offlineQueue';
import { uploadProof } from './utils/storage';



// Custom hook for localStorage persistence
function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return saved !== null ? JSON.parse(saved) : initialValue;
    } catch (e) {
      console.error("Storage load error:", e);
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (e) {
      console.warn(`[usePersistentState] Error persisting key "${key}":`, e);
    }
  }, [key, state]);

  return [state, setState];
}

// Shared Utils
const normalizeText = (text) => {
    if (!text) return '';
    return String(text)
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+de\s+cordoba$/, "")
        .replace(/\s+de\s+la\s+frontera$/, "")
        .replace(/\s+de\s+los\s+caballeros$/, "")
        .replace(/[^a-z0-9\s]/g, "")
        .replace(/\s+/g, " ");
};

const normalizeClientName = (name) => {
    if (!name) return '';
    return String(name)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // remove accents
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " "); // collapse multiple spaces
};

function App() {
  // ── Restaurar sesión LOCAL instantáneamente (para sobrevivir a Android matando la página) ──
  const savedSession = (() => {
    try {
      const s = sessionStorage.getItem('sumtrans_session');
      if (s) return JSON.parse(s);
    } catch {}
    return null;
  })();

  const [isAuthenticated, setIsAuthenticated] = useState(!!savedSession)
  const [userRole, setUserRole] = useState(savedSession?.role || null) // 'admin', 'driver', 'client'
  const [currentView, setCurrentView] = useState(savedSession?.view || 'dashboard')
  const [currentDriverId, setCurrentDriverId] = useState(savedSession?.driverId || null) // ID of the logged in driver
  const [currentClientId, setCurrentClientId] = useState(savedSession?.clientId || null) // ID of the logged in client
  const [shipmentStatusFilter, setShipmentStatusFilter] = useState(null) // Filter passed from Dashboard KPI cards
  const [isRestoringSession, setIsRestoringSession] = useState(!savedSession) // Skip waiting if we have a local session

  // ── Nombre del conductor guardado en sesión para mostrarlo instantáneamente ──
  const [cachedDriverName, setCachedDriverName] = useState(savedSession?.driverName || null)

  // ── Persistir sesión local cada vez que cambie el estado de login ──
  useEffect(() => {
    if (isAuthenticated && userRole) {
      try {
        sessionStorage.setItem('sumtrans_session', JSON.stringify({
          role: userRole,
          driverId: currentDriverId,
          clientId: currentClientId,
          view: currentView,
          driverName: cachedDriverName,
          savedAt: Date.now()
        }));
      } catch {}
    } else {
      sessionStorage.removeItem('sumtrans_session');
    }
  }, [isAuthenticated, userRole, currentDriverId, currentClientId, currentView, cachedDriverName]);

  // ── Restaurar sesión de Supabase Auth al cargar la app ──
  useEffect(() => {
    let cancelled = false;

    async function restoreSession() {
      try {
        const session = await getCurrentSession();
        if (session && !cancelled) {
          const profile = await getUserProfile();
          if (profile && !cancelled) {
            setIsAuthenticated(true);
            setUserRole(profile.role);
            if (profile.role === 'driver') setCurrentDriverId(profile.linked_id);
            if (profile.role === 'client') setCurrentClientId(profile.linked_id);
          }
        }
      } catch (e) {
        console.warn('[Session] Error restoring session:', e);
      } finally {
        if (!cancelled) setIsRestoringSession(false);
      }
    }

    restoreSession();

    // Escuchar cambios de auth (logout desde otra pestaña, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[Auth] Event:', event, '| Session:', !!session);
        if (event === 'SIGNED_OUT' && !session) {
          // Solo hacer logout real si no hay sesión (evita falsos SIGNED_OUT durante refresh)
          // Esperar un momento para verificar que no es un refresh
          setTimeout(async () => {
            const { data: { session: currentSession } } = await supabase.auth.getSession();
            if (!currentSession) {
              console.log('[Auth] Confirmed logout — no session found');
              setIsAuthenticated(false);
              setUserRole(null);
              setCurrentDriverId(null);
              setCurrentClientId(null);
            }
          }, 500);
        }
      }
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  // --- OFFLINE / CONNECTIVITY ---
  const { isOnline, justReconnected } = useOnlineStatus();
  const [isSyncingQueue, setIsSyncingQueue] = useState(false);
  const [pendingQueueCount, setPendingQueueCount] = useState(0);
  // Fix: getQueueLength is async — initialize to 0 and update on mount
  useEffect(() => {
    getQueueLength().then(len => setPendingQueueCount(len)).catch(() => {});
  }, []);

  // Lifted state for drivers
  const [drivers, setDrivers] = useState([])
  const [isSyncing, setIsSyncing] = useState(true)

  const [shipments, setShipments] = useState([])



  // Lifted state for articles — fuente de verdad: Supabase (no localStorage)
  const [articles, setArticles] = useState([
    { id: 1, name: 'Hora de Espera', description: 'Cargo por hora adicional de espera en carga/descarga', price: '45.00', unit: 'Hora' },
    { id: 2, name: 'Palet Europeo', description: 'Transporte de palet estándar (120x80)', price: '65.00', unit: 'Unidad' },
    { id: 3, name: 'Kilometraje Extra', description: 'Tarifa por km fuera de ruta pactada', price: '1.20', unit: 'Km' },
    { id: 4, name: 'Servicio Urgente', description: 'Suplemento por entrega 24h', price: '150.00', unit: 'Servicio' },
  ])

  // Lifted state for vehicles (Fleet) — fuente de verdad: Supabase
  const [vehicles, setVehicles] = useState([
    { id: 'V-8921-GZ', model: 'Volvo FH16', assignedDriverId: 1, status: 'En Ruta', location: 'A-6 km 45, Madrid', fuel: '78%', maintenance: 'OK', documents: [] },
    { id: 'B-1234-XY', model: 'Scania R500', assignedDriverId: 2, status: 'Disponible', location: 'Base Central', fuel: '100%', maintenance: 'OK', documents: [] },
    { id: 'V-9999-BB', model: 'Iveco S-Way', assignedDriverId: 4, status: 'En Ruta', location: 'AP-7, Valencia', fuel: '62%', maintenance: 'OK', documents: [] },
  ])

  // Lifted state for fuel logs — fuente de verdad: Supabase
  const [fuelLogs, setFuelLogs] = useState([])
  const [routes, setRoutes] = useState([])
  const [routeKnowledge, setRouteKnowledge] = useState({}) // { masterByRoute: {routeId: {...}}, byDriver: {driverId: {...}} }
  
  // Default COD configuration — fuente de verdad: Supabase settings
  const [defaultCodFee, setDefaultCodFee] = useState('3.00')

  // GPS Interval for driver tracking (in minutes) — fuente de verdad: Supabase settings
  const [gpsIntervalMinutes, setGpsIntervalMinutes] = useState(15)

  // Driver Alerts (configurable notifications for drivers) — fuente de verdad: Supabase settings
  const [driverAlerts, setDriverAlerts] = useState([
    { id: 'monday_vehicle_check', title: '🔧 Revisión Semanal del Vehículo', message: '¡Buenos días! Es lunes. Antes de salir a ruta, confirma que has revisado los niveles de tu furgoneta:\n\n• Aceite del motor\n• Líquido refrigerante\n• Líquido de frenos\n• Presión de neumáticos\n• Luces y intermitentes', confirmText: '✅ Confirmo que he revisado los niveles', icon: '🚐', dayOfWeek: 1, enabled: true }
  ])

  // Driver Alert acknowledgements history
  const [alertAcknowledgements, setAlertAcknowledgements] = useState([])

  // Family Order for articles — fuente de verdad: Supabase settings
  const [familyOrder, setFamilyOrder] = useState([])

  // Driver Manual Order — fuente de verdad: Supabase settings
  const [driverOrder, setDriverOrder] = useState([])

  // Driver name rendering preference ('both', 'name', 'alias') — fuente de verdad: Supabase settings
  const [driverNamePreference, setDriverNamePreference] = useState('both')

  // Coverage Zones (Baremo 1 & 2) — fuente de verdad: Supabase coverage_zones
  const [coverageZones, setCoverageZones] = useState([
    ...(BAREMO_1_PUEBLOS || []), 
    ...(BAREMO_2_PUEBLOS || [])
  ])


  // (Ghost Mode logic moved down below state declarations)

  const handleUpdateFamilyOrder = async (newOrder) => {
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'familyOrder', value: JSON.stringify(newOrder) });
      if (error) throw error;
      setFamilyOrder(newOrder);
    } catch (e) {
      alert('Error al actualizar el orden de las familias.');
      console.error(e);
    }
  }

  const handleUpdateDriverOrder = async (newOrder) => {
    // Optimistic UI update to prevent visual lag during drag and drop
    const previousOrder = driverOrder;
    setDriverOrder(newOrder);

    try {
      const { error } = await supabase.from('settings').upsert({ key: 'driverOrder', value: JSON.stringify(newOrder) });
      if (error) throw error;
    } catch (e) {
      setDriverOrder(previousOrder); // Revert on failure
      alert('Error al actualizar el orden de los conductores.');
      console.error(e);
    }
  }

  const handleUpdateDriverNamePreference = async (preference) => {
    setDriverNamePreference(preference);
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'driverNamePreference', value: preference });
      if (error) throw error;
    } catch (e) {
      alert('Error al actualizar la preferencia de nombres de conductores.');
      console.error(e);
    }
  }

  // Stored Client Locations
  const [clients, setClients] = useState([])
  const [isExportingSecretsZip, setIsExportingSecretsZip] = useState(false)

  // ======= LATEST STATE REFS (Avoid stale closures in async handlers) =======
  const shipmentsRef = useRef(shipments);
  const driversRef = useRef(drivers);
  const clientsRef = useRef(clients);
  // Para saber qué aprendizaje había ANTES de un cambio del administrador y deducir
  // qué filas por conductor hay que reescribir.
  const routeKnowledgeRef = useRef(routeKnowledge);
  // Guard to ensure initStorageBuckets only runs once per app session
  const bucketsInitializedRef = useRef(false);

  useEffect(() => { shipmentsRef.current = shipments; }, [shipments]);
  useEffect(() => { driversRef.current = drivers; }, [drivers]);
  useEffect(() => { clientsRef.current = clients; }, [clients]);
  useEffect(() => { routeKnowledgeRef.current = routeKnowledge; }, [routeKnowledge]);

  // Sin esto, un error registrado desde la nube es un mensaje sin dueño: hace falta
  // saber en qué móvil y de quién, o no se puede ir a mirarlo.
  useEffect(() => {
    establecerContextoDeError({
      role: userRole,
      driverId: currentDriverId,
      driverName: cachedDriverName
    });
  }, [userRole, currentDriverId, cachedDriverName]);
  // =========================================================================

  // Admin credentials (loaded from Supabase settings, with secure defaults)
  const [adminCreds, setAdminCreds] = useState({ user: 'info@sumtransportes.com', pass: '1632' })

  // --- MODO PRUEBAS (Ahora es por cada conductor) ---
  const activeTestMode = useMemo(() => {
    if (userRole === 'driver' && currentDriverId) {
      const driver = drivers.find(d => String(d.id) === String(currentDriverId));
      return driver?.isTestMode || false;
    }
    return false;
  }, [userRole, currentDriverId, drivers]);

  const handleResetToZero = async (onlyTestData = false) => {
    const message = onlyTestData 
      ? "¿Estás seguro de que quieres borrar SOLAMENTE los envíos realizados en MODO PRUEBAS?"
      : "⚠️ ATENCIÓN: Vas a borrar TODOS los envíos, firmas, fotos y coordenadas GPS de los clientes.\n\nEsto dejará la aplicación limpia para empezar el trabajo real.\n\n¿Estás seguro?";
    
    const confirm1 = window.confirm(message);
    if (!confirm1) return;

    if (!onlyTestData) {
      const confirm2 = window.prompt("Esta acción es IRREVERSIBLE. Escribe 'BORRAR TODO' para confirmar:");
      if (confirm2 !== 'BORRAR TODO') return;
    }

    try {
      setIsSyncing(true);
      
      if (onlyTestData) {
        // 1. Borrar envíos de prueba
        const testShipments = shipments.filter(s => s.isTest);
        const testShipmentIds = testShipments.map(s => s.id);
        
        // 2. Borrar clientes de prueba
        const testClients = clients.filter(c => c.isTest);
        const testClientIds = testClients.map(c => c.id);

        if (testShipmentIds.length === 0 && testClientIds.length === 0) {
          alert("No hay datos de prueba (envíos o clientes) para borrar.");
          return;
        }

        if (testShipmentIds.length > 0) {
          const { error: errS } = await supabase.from('shipments').delete().in('id', testShipmentIds);
          if (errS) throw errS;
          setShipments(prev => prev.filter(s => !testShipmentIds.includes(s.id)));
          await purgeCollectionsForShipments(testShipmentIds);
        }

        if (testClientIds.length > 0) {
          const { error: errC } = await supabase.from('clients').delete().in('id', testClientIds);
          if (errC) throw errC;
          setClients(prev => prev.filter(c => !testClientIds.includes(c.id)));
        }

        alert(`✅ Limpieza completada: Se han borrado ${testShipmentIds.length} envíos y ${testClientIds.length} clientes de prueba.`);
      } else {
        // 1. Borrar todos los envíos
        const { error: err1 } = await supabase.from('shipments').delete().neq('id', 'temp_placeholder');
        if (err1) throw err1;

        // 2. Limpiar coordenadas de todos los clientes
        const { data: allCli, error: err2 } = await fetchAllRows(
          () => supabase.from('clients').select('*').order('id'),
          { label: 'clients_reset' }
        );
        if (err2) throw err2;

        for (const cli of (allCli || [])) {
          const updatedData = { ...cli.data, coordinates: '' };
          await supabase.from('clients').update({ data: updatedData }).eq('id', cli.id);
        }

        await purgeCollectionsForShipments([], { all: true });

        setShipments([]);
        setClients(prev => prev.map(c => ({ ...c, coordinates: '' })));
        alert("✅ Aplicación reseteada a 0. Lista para producción.");
      }
    } catch (err) {
      console.error(err);
      alert("Error durante el reseteo: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const [isGhostModeUnlocked, setIsGhostModeUnlocked] = useState(false);
  const [orphanStartDate, setOrphanStartDate] = useState('');
  const [orphanEndDate, setOrphanEndDate] = useState('');


  const handleSecretUnlock = useCallback(() => {
    if (isGhostModeUnlocked) {
      setIsGhostModeUnlocked(false);
      alert("🔒 Modo Seguro Reactivado. Datos confidenciales ocultos.");
    } else {
      // Pedimos la contraseña (se validará contra la que tenga configurada el admin en ajustes)
      const pass = prompt("Modo Dev: Introduce la clave de la base de datos para depuración.");
      if (pass === adminCreds.pass) {
        setIsGhostModeUnlocked(true);
        alert("🔓 Desbloqueo Completado: Mostrando registros de Clientes Habituales.");
      } else if (pass !== null && pass !== '') {
        alert("❌ Clave de depuración incorrecta.");
      }
    }
  }, [isGhostModeUnlocked, adminCreds.pass]);

  /**
   * Borra los cobros de unos envíos de la caja de todos los conductores.
   *
   * Va emparejado con el cálculo de la cuenta diaria: allí un cobro ya NO se descarta
   * por no encontrar su envío en memoria (esa lista solo trae los activos y 90 días de
   * histórico, así que la ausencia no probaba nada y se perdía dinero real). La única
   * forma legítima de que un cobro desaparezca es que se borre aquí, cuando de verdad
   * se borra el envío.
   *
   * Los cobros viven dentro de `drivers.data`, en una clave por día
   * (`collectedCollections_YYYY-MM-DD`), así que hay que recorrerlas todas.
   *
   * Con `{ all: true }` se vacían todos los cobros, para el reseteo a cero: allí se
   * borran también envíos que no estaban cargados y no hay lista de ids que valga.
   */
  const purgeCollectionsForShipments = useCallback(async (shipmentIds, { all = false } = {}) => {
    const ids = new Set((shipmentIds || []).filter(Boolean));
    if (!all && ids.size === 0) return;

    try {
      const { data: driverRows, error } = await supabase.from('drivers').select('id, data');
      if (error) throw error;

      for (const row of (driverRows || [])) {
        const data = row.data || {};
        let touched = false;
        const nextData = { ...data };

        for (const key of Object.keys(data)) {
          if (!key.startsWith('collectedCollections_')) continue;
          const cobros = data[key];
          if (!Array.isArray(cobros)) continue;

          const quedan = all ? [] : cobros.filter(c => !(c?.shipmentId && ids.has(c.shipmentId)));
          if (quedan.length !== cobros.length) {
            nextData[key] = quedan;
            touched = true;
          }
        }

        if (touched) {
          const { error: upErr } = await supabase.from('drivers').update({ data: nextData }).eq('id', row.id);
          if (upErr) throw upErr;
          console.log(`[Cobros] Purgados cobros de envíos borrados en el conductor ${row.id}`);
        }
      }
    } catch (e) {
      // No bloquea el borrado del envío: como mucho queda un cobro huérfano, que ahora
      // aparece marcado en la cuenta en vez de descontarse a escondidas.
      console.error('[Cobros] No se pudieron purgar los cobros de los envíos borrados:', e);
    }
  }, []);

  const getSecretShipments = useCallback(() => {
     return shipments.filter(s => {
        let isSecret = false;
        const normalize = (val) => String(val || '').toLowerCase().trim();
        
        const sClientNorm = normalize(s.client);
        const remitente = clients.find(c => normalize(c.name) === sClientNorm || normalize(c.legalName) === sClientNorm);
        
        const sDestNorm = normalize(s.destinationName || s.client);
        const destinatario = clients.find(c => normalize(c.name) === sDestNorm || normalize(c.legalName) === sDestNorm);
        
        const destBillingType = normalize(s.destinationBillingType || (destinatario ? destinatario.billingType : ''));
        const mainBillingType = normalize(s.billingType || (remitente ? remitente.billingType : ''));
        
        if (destBillingType.includes('habitual') || destBillingType.includes('diar') || destBillingType.includes('libre') || destBillingType.includes('contado')) isSecret = true;
        if (mainBillingType.includes('habitual') || mainBillingType.includes('diar') || mainBillingType.includes('libre') || mainBillingType.includes('contado')) isSecret = true;

        if (mainBillingType.includes('presupuesto') || destBillingType.includes('presupuesto')) isSecret = true;

        return isSecret;
     });
  }, [shipments, clients]);

  const handleExportSecretsCSV = useCallback(() => {
    const secrets = getSecretShipments();
    if (secrets.length === 0) return alert('No hay envíos sensibles que exportar.');

    const escapeCSV = (str) => `"${String(str || '').replace(/"/g, '""')}"`;

    const headers = ['ID', 'Fecha', 'Remitente', 'C.P. Origen', 'Destinatario', 'C.P. Destino', 'Tipo Porte', 'Importe', 'Reembolso', 'Estado', 'Conductor Asignado', 'Observaciones', 'Nombre Receptor', 'DNI/Identidad', 'Firma (URL)', 'Foto Entrega (URL)', 'Foto Mercancía (URL)', 'Coordenadas Entrega'];
    
    const rows = secrets.map(s => {
      const driver = drivers.find(d => d.id === s.assignedDriverId);
      return [
        s.id,
        s.date || s.createdAt || '',
        s.client || s.originName || '',
        s.originZip || '',
        s.destinationName || '',
        s.destinationZip || '',
        s.porteType || '',
        s.amount || '0',
        s.hasCod ? (s.codAmount || '0') : '0',
        s.status || '',
        driver ? driver.name : '',
        s.observations || '',
        s.receiverName || '',
        s.receiverId || '',
        s.deliverySignature || '',
        s.deliveryPhoto || '',
        s.merchandisePhoto || '',
        s.deliveryCoordinates || ''
      ].map(escapeCSV).join(';'); // Use semicolon for Excel Spanish locales
    });

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `albaranes_confidenciales_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [getSecretShipments, drivers]);

  const handleExportSecretsZIP = useCallback(async () => {
    const secrets = getSecretShipments();
    if (secrets.length === 0) return alert('No hay envíos confidenciales que exportar.');

    setIsExportingSecretsZip(true);
    try {
        const JSZip = (await import('jszip')).default;
        const { saveAs } = await import('file-saver');
        const { generateDeliveryPDFBlob } = await import('./utils/deliveryPdf');
        
        const zip = new JSZip();
        let count = 0;
        for (const s of secrets) {
            const blob = await generateDeliveryPDFBlob(s);
            if (blob) {
                const clientFolder = (s.client || 'Sin_Cliente').substring(0, 20).replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_]/g, '');
                const fileName = `POD_${s.id}_${(s.destinationName || 'Envio').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '')}.pdf`;
                zip.folder(clientFolder).file(fileName, blob);
                count++;
            }
        }

        if (count === 0) {
            alert("No se pudo generar ningún PDF válido para descargar.");
            setIsExportingSecretsZip(false);
            return;
        }

        const content = await zip.generateAsync({ type: "blob" });
        const dateStr = new Date().toISOString().split('T')[0];
        saveAs(content, `Albaranes_Historial_${dateStr}.zip`);
        
    } catch (error) {
        console.error('Error generando ZIP:', error);
        alert('Error al descargar los PDFs en ZIP.');
    } finally {
        setIsExportingSecretsZip(false);
    }
  }, [getSecretShipments]);

  const handleDeleteSecrets = useCallback(async () => {
    const secrets = getSecretShipments();
    if (secrets.length === 0) return alert('No hay envíos confidenciales que borrar.');

    const confirm1 = window.confirm(`⚠️ ¡ATENCIÓN EXTREMA!\n\nVas a ELIMINAR PERMANENTEMENTE ${secrets.length} envíos (sus albaranes, justificantes de entrega y firmas).\n\nLos perfiles de Clientes y sus direcciones NO se borrarán, solo el historial de viajes.\n\n¿Estás seguro de que tienes una copia exportada en tu ordenador?`);
    if (!confirm1) return;

    const confirm2 = window.prompt(`Esta acción es IRREVERSIBLE e impactará a todos los conductores y la Nube.\nEscribe "BORRAR" (en mayúsculas) para confirmar la destrucción de los ${secrets.length} registros:`);
    if (confirm2 !== "BORRAR") return;

    try {
      const idsToDelete = secrets.map(s => s.id);
      
      const { error } = await supabase.from('shipments').delete().in('id', idsToDelete);
      if (error) throw error;

      setShipments(prev => prev.filter(s => !idsToDelete.includes(s.id)));
      await purgeCollectionsForShipments(idsToDelete);

      alert(`✅ ¡Operación confidencial completada con éxito!\nSe han evaporado ${secrets.length} envíos. El rastro contable de estos portes está limpio.`);
    } catch (err) {
      console.error(err);
      alert('Error crítico intentando borrar en Supabase.');
    }
  }, [getSecretShipments, purgeCollectionsForShipments]);

  const handleCleanOrphanedFiles = useCallback(async () => {
    let confirmMessage = "¿Seguro que quieres buscar y eliminar de la nube TODAS las fotos y firmas que ya no tienen un envío asociado en tu panel?";
    if (orphanStartDate || orphanEndDate) {
      confirmMessage += `\n\nFiltro de fechas aplicado:\nDesde: ${orphanStartDate || 'El principio'}\nHasta: ${orphanEndDate || 'Hoy'}`;
    }
    confirmMessage += "\n\nEsta acción es irreversible y liberará espacio en el servidor.";
    
    if (!window.confirm(confirmMessage)) return;

    try {
      // 1. Recopilar todas las rutas de archivos que SÍ están en uso
      const activePaths = new Set();
      shipments.forEach(s => {
        [s.deliverySignature, s.deliveryPhoto, s.merchandisePhoto, s.incidentPhoto].forEach(url => {
          if (typeof url === 'string' && url.includes('/storage/v1/object/public/')) {
            const parts = url.split('/storage/v1/object/public/')[1].split('/');
            const filePath = decodeURIComponent(parts.slice(1).join('/'));
            activePaths.add(filePath);
          }
        });
      });

      let totalDeleted = 0;
      const buckets = ['signatures', 'delivery_photos', 'merchandise_photos', 'incident_photos'];

      const start = orphanStartDate ? new Date(orphanStartDate).getTime() : 0;
      const end = orphanEndDate ? new Date(orphanEndDate).getTime() + 86400000 : Infinity; // Add 24h to include end day

      for (const bucket of buckets) {
        // Listar todos los archivos del bucket
        const { data: files, error } = await supabase.storage.from(bucket).list('', { limit: 10000 });
        if (error) {
          console.error(`Error listando bucket ${bucket}:`, error);
          continue;
        }

        if (!files || files.length === 0) continue;

        // Filtrar los que NO están en activePaths Y cumplen el filtro de fechas
        const orphanedFiles = files
          .filter(f => {
             if (f.name === '.emptyFolderPlaceholder') return false;
             if (activePaths.has(f.name)) return false;
             
             // Filtro de fecha usando f.created_at
             if (f.created_at) {
               const fileTime = new Date(f.created_at).getTime();
               if (fileTime < start || fileTime > end) return false;
             }
             return true;
          })
          .map(f => f.name);

        if (orphanedFiles.length > 0) {
          // Borrar en lotes de 100
          const chunkSize = 100;
          for (let i = 0; i < orphanedFiles.length; i += chunkSize) {
            const chunk = orphanedFiles.slice(i, i + chunkSize);
            const { error: delError } = await supabase.storage.from(bucket).remove(chunk);
            if (delError) {
              console.error(`Error borrando en ${bucket}:`, delError);
            } else {
              totalDeleted += chunk.length;
            }
          }
        }
      }

      alert(`✅ Limpieza completada con éxito.\n\nSe han borrado definitivamente ${totalDeleted} archivos (fotos/firmas) de la nube.`);
    } catch (e) {
      console.error(e);
      alert("Ocurrió un error al limpiar los archivos sueltos.");
    }
  }, [shipments, orphanStartDate, orphanEndDate]);

  // --- PERFORMANCE: CLIENTS CACHE MAP ---
  const clientsMap = useMemo(() => {
    const map = new Map();
    const normalize = (s) => String(s || '').toLowerCase().trim();
    (clients || []).forEach(c => {
      const nameNorm = normalize(c.name);
      const legalNorm = normalize(c.legalName);
      if (nameNorm) map.set(nameNorm, c);
      if (legalNorm) map.set(legalNorm, c);
    });
    return map;
  }, [clients]);

  // Si el usuario es admin y el candado está echado, los clientes y envíos habituales dejan de existir de cara a la app
  const visibleClients = useMemo(() => {
    if (userRole === 'admin' && !isGhostModeUnlocked) {
      return clients.filter(c => {
         const type = String(c.billingType || '').toLowerCase().trim();
         return !(type.includes('habitual') || type.includes('diar') || type.includes('libre') || type.includes('contado') || type.includes('presupuesto'));
      });
    }
    return clients;
  }, [clients, userRole, isGhostModeUnlocked]);


  const visibleShipments = useMemo(() => {
    if (userRole === 'admin' && !isGhostModeUnlocked) {
      const normalize = (val) => String(val || '').toLowerCase().trim();
      
      return shipments.filter(s => {
        const esPagado = s.porteType !== 'Debido';

        if (esPagado) {
          // Priorizar la ficha actual del cliente (puede haber cambiado su tipo de cobro)
          const remitente = clientsMap.get(normalize(s.client));
          const billingType = normalize(remitente ? remitente.billingType : (s.billingType || ''));
          if (billingType.includes('habitual') || billingType.includes('presupuesto')) return false;
        } else {
          const destinatario = clientsMap.get(normalize(s.destinationName || s.client));
          const billingType = normalize(destinatario ? destinatario.billingType : (s.destinationBillingType || s.billingType || ''));
          if (billingType.includes('habitual') || billingType.includes('presupuesto')) return false;
        }

        return true;
      });
    }
    return shipments;
  }, [shipments, clientsMap, userRole, isGhostModeUnlocked]);



  // Centralized Population List for Autocomplete
  const allPoblaciones = useMemo(() => {
    // Solo usamos las poblaciones registradas en el listado de Baremos (coverageZones)
    const set = new Set();
    
    (coverageZones || []).forEach(z => {
      if (z.name) set.add(z.name.trim());
    });
    
    (ALL_BAREMO_PUEBLOS || []).forEach(p => {
      if (p.name) set.add(p.name.trim());
    });

    // De-duplicación por si acaso hubiera entradas idénticas
    const uniqueMap = new Map();
    set.forEach(poblacion => {
      const normalized = poblacion.toLowerCase();
      if (!uniqueMap.has(normalized) && poblacion !== '') {
        uniqueMap.set(normalized, poblacion);
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));
  }, [coverageZones]);

  // Supabase Data Loading (Carga OPTIMIZADA de la nube)
  useEffect(() => {
    const isMissingSupabaseKeys = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (isMissingSupabaseKeys) {
        setIsSyncing(false);
        return;
    }

    // Non-blocking: init storage buckets only once per app session
    if (!bucketsInitializedRef.current) {
      bucketsInitializedRef.current = true;
      initStorageBuckets().catch(e => console.warn('initStorageBuckets background error:', e));
    }

    let retryCount = 0;
    const MAX_RETRIES = 3;

    async function loadData() {
      // Verificar sesión directamente (más fiable que depender del estado React)
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[LoadData] Sin sesión Auth, esperando login...');
        setIsSyncing(false);
        return;
      }

      setIsSyncing(true)
      try {

        // ── Date threshold: only load finished shipments from the last 90 days ──
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const cutoffISO = ninetyDaysAgo.toISOString();

        // ── OPTIMIZED QUERIES ──
        // 1. Select ONLY the columns we actually use (not select('*'))
        // 2. ALL settings in ONE query instead of 8+2 separate queries
        // 3. Shipments split: active (all) + finished (last 90 days only)
        // 4. Todas van por `fetchAllRows`: Supabase corta en 1.000 filas sin devolver
        //    error, así que una consulta directa daba por buenos históricos truncados.
        //    El `.order('id')` no es decorativo, es lo que hace estable el paginado.
        const queryNames = [
          'drivers', 'shipments_active', 'shipments_finished', 'clients',
          'articles', 'vehicles', 'fuel_logs', 'tariffs',
          'settings', 'coverage_zones'
        ];

        const results = await Promise.allSettled([
          fetchAllRows(() => supabase.from('drivers').select('id, data, username, password').order('id'), { label: 'drivers' }),
          fetchAllRows(() => supabase.from('shipments').select('id, data')                    // 1 - active
            .not('status', 'in', '("Entregado","Anulado")').order('id'), { label: 'shipments_active' }),
          fetchAllRows(() => supabase.from('shipments').select('id, data')                    // 2 - finished recent
            .in('status', ['Entregado', 'Anulado'])
            .gte('data->>createdAt', cutoffISO).order('id'), { label: 'shipments_finished' }),
          fetchAllRows(() => supabase.from('clients').select('id, data').order('id'), { label: 'clients' }),
          fetchAllRows(() => supabase.from('articles').select('id, data').order('id'), { label: 'articles' }),
          fetchAllRows(() => supabase.from('vehicles').select('id, data').order('id'), { label: 'vehicles' }),
          fetchAllRows(() => supabase.from('fuel_logs').select('id, data').order('id'), { label: 'fuel_logs' }),
          fetchAllRows(() => supabase.from('tariffs').select('id, data').order('id'), { label: 'tariffs' }),
          fetchAllRows(() => supabase.from('settings').select('key, value').order('key'), { label: 'settings' }),
          fetchAllRows(() => supabase.from('coverage_zones').select('id, data').order('id'), { label: 'coverage_zones' }),
        ]);

        // Helper to safely extract data from settled results
        const getData = (index) => {
          const result = results[index];
          if (result.status === 'rejected') {
            console.error(`[LoadData] Query '${queryNames[index]}' rejected:`, result.reason);
            return null;
          }
          const { data, error } = result.value || {};
          if (error) {
            console.error(`[LoadData] Query '${queryNames[index]}' error:`, error.message);
            return null;
          }
          return data;
        };

        const drv = getData(0);
        const shpActive = getData(1);
        const shpFinished = getData(2);
        const cli = getData(3);
        const art = getData(4);
        const veh = getData(5);
        const fue = getData(6);
        const trf = getData(7);
        const allSettings = getData(8);
        const covZones = getData(9);

        // ── Helper to get a setting value by key from the single settings query ──
        const getSetting = (key) => {
          if (!allSettings) return null;
          const found = allSettings.find(s => s.key === key);
          return found ? found.value : null;
        };

        // Track how many critical queries succeeded
        const criticalLoaded = [drv, (shpActive || shpFinished), cli].filter(Boolean).length;
        const activeShipmentsTimedOut = !shpActive && shpFinished; // timeout en activos pero no en terminados
        
        if (drv) setDrivers(drv.map(d => ({ ...d.data, id: d.id, username: d.username, password: d.password })))
        
        // ── Merge active + recent finished shipments ──
        if (shpActive || shpFinished) {
          const allShp = [...(shpActive || []), ...(shpFinished || [])];
          let loadedShipments = allShp.map(s => ({ ...s.data, id: s.id }));
          
          // ── Apply pending queue operations over fresh Supabase data ──
          const pendingOps = await getQueue();
          if (pendingOps.length > 0) {
            console.log(`[Queue] Applying ${pendingOps.length} pending operations to fresh data...`);
            for (const op of pendingOps) {
              if (op.type === 'statusChange' && op.updatedData) {
                loadedShipments = loadedShipments.map(s => 
                  s.id === op.shipmentId ? { ...s, ...op.updatedData } : s
                );
              } else if (op.type === 'updateShipment' && op.mergedData) {
                loadedShipments = loadedShipments.map(s => 
                  s.id === op.shipmentId ? { ...s, ...op.mergedData } : s
                );
              }
            }
          }
          
          setShipments(loadedShipments);
          console.log(`[LoadData] Loaded ${(shpActive||[]).length} active + ${(shpFinished||[]).length} recent shipments (90 days)`);
        }
        if (cli) setClients(cli.map(c => ({ ...c.data, id: c.id })))
        if (art) setArticles(art.map(a => ({ ...a.data, id: a.id })))
        if (veh) setVehicles(veh.map(v => ({ ...v.data, id: v.id })))
        if (fue) setFuelLogs(fue.map(f => ({ ...f.data, id: f.id })))
        if (trf) setTariffs(trf.map(t => ({ ...t.data, id: t.id })))
        if (covZones) setCoverageZones(covZones.map(z => ({ ...z.data, id: z.id })))

        // ── Process ALL settings from the single query ──
        const codValue = getSetting('defaultCodFee');
        if (codValue) setDefaultCodFee(codValue);

        const famOrderValue = getSetting('familyOrder');
        if (famOrderValue) {
          try { setFamilyOrder(JSON.parse(famOrderValue)) } catch (e) { console.error("Error parsing familyOrder:", e) }
        }
        
        const drvOrderValue = getSetting('driverOrder');
        if (drvOrderValue) {
          try { setDriverOrder(JSON.parse(drvOrderValue)) } catch (e) { console.error("Error parsing driverOrder:", e) }
        }

        const drvNamePrefValue = getSetting('driverNamePreference');
        if (drvNamePrefValue) {
          setDriverNamePreference(drvNamePrefValue);
        }

        const routesValue = getSetting('routes');
        if (routesValue) {
          try { setRoutes(JSON.parse(routesValue)) } catch(e) { console.error('Error parsing routes:', e) }
        }

        const gpsValue = getSetting('gpsIntervalMinutes');
        if (gpsValue) {
          try { setGpsIntervalMinutes(parseInt(gpsValue) || 15) } catch(e) { console.error('Error parsing gpsInterval:', e) }
        }

        const alertsValue = getSetting('driverAlerts');
        if (alertsValue) {
          try { setDriverAlerts(JSON.parse(alertsValue)) } catch(e) { console.error('Error parsing driverAlerts:', e) }
        }

        const ackValue = getSetting('alert_acknowledgments');
        if (ackValue) {
          try { setAlertAcknowledgements(JSON.parse(ackValue)) } catch(e) { console.error('Error parsing alert acknowledgements:', e) }
        }

        // ── Aprendizaje de rutas: fila principal + una fila por conductor ──
        // Las filas por conductor ya vienen en esta misma consulta de settings, así que
        // ensamblarlas no cuesta ni una llamada más. Mandan sobre el `byDriver` viejo,
        // que se conserva como respaldo del aprendizaje que aún no se ha regrabado.
        const rkValue = getSetting('route_knowledge');
        let baseConocimiento = {};
        if (rkValue) {
          try { baseConocimiento = JSON.parse(rkValue) || {}; }
          catch(e) { console.error('Error parsing route_knowledge:', e) }
        }

        const aprendizajePorConductor = {};
        for (const fila of (allSettings || [])) {
          if (!esClaveAprendizaje(fila.key)) continue;
          try {
            aprendizajePorConductor[driverIdDeClave(fila.key)] = JSON.parse(fila.value) || {};
          } catch(e) {
            console.error(`Error parsing ${fila.key}:`, e);
          }
        }

        if (rkValue || Object.keys(aprendizajePorConductor).length > 0) {
          setRouteKnowledge(ensamblarConocimiento(baseConocimiento, aprendizajePorConductor));
        }


        // Admin credentials (from the same single settings query — no extra network calls)
        setAdminCreds({
          user: getSetting('admin_user') || 'info@sumtransportes.com',
          pass: getSetting('admin_pass') || '1632'
        })

        // If critical data failed to load OR active shipments timed out, retry automatically
        if ((criticalLoaded < 3 || activeShipmentsTimedOut) && retryCount < MAX_RETRIES) {
          retryCount++;
          const delay = retryCount === 1 ? 3000 : 8000; // 3s primer reintento, 8s segundo
          console.warn(`[LoadData] ${activeShipmentsTimedOut ? 'Active shipments timed out' : `Only ${criticalLoaded}/3 critical tables loaded`}. Auto-retrying in ${delay/1000}s... (attempt ${retryCount}/${MAX_RETRIES})`);
          setTimeout(() => loadData(), delay);
          return; // Don't set isSyncing=false yet, we're retrying
        }

      } catch (error) {
        console.error('Error loading Supabase data:', error)
        // Auto-retry on total failure
        if (retryCount < MAX_RETRIES) {
          retryCount++;
          console.warn(`[LoadData] Total failure. Auto-retrying in 3s... (attempt ${retryCount}/${MAX_RETRIES})`);
          setTimeout(() => loadData(), 3000);
          return;
        }
      } finally {
        setIsSyncing(false)
      }
    }
    loadData()

    // ======= SUSCRIPCIÓN EN TIEMPO REAL (Supabase Realtime) =======
    const channel = supabase.channel('global-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shipments' }, (payload) => {
        console.log("🔄 [Realtime] Cambio en envíos:", payload.eventType);
        if (!payload.new && payload.eventType !== 'DELETE') return;
        setShipments(prev => {
          if (payload.eventType === 'INSERT') {
            if (!payload.new?.data) { console.warn('[Realtime] INSERT shipment sin data, ignorado'); return prev; }
            const newItem = { ...payload.new.data, id: payload.new.id };
            if (prev.find(s => s.id === newItem.id)) return prev;
            return [newItem, ...prev];
          }
          if (payload.eventType === 'UPDATE') {
            if (!payload.new?.data) {
              console.warn('[Realtime] UPDATE shipment parcial (sin data JSONB), merge superficial');
              const { id, data: _d, ...topLevelFields } = payload.new;
              return prev.map(s => s.id === id ? { ...s, ...topLevelFields } : s);
            }
            const updatedItem = { ...payload.new.data, id: payload.new.id };
            return prev.map(s => s.id === updatedItem.id ? updatedItem : s);
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(s => s.id !== payload.old?.id);
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'drivers' }, (payload) => {
        console.log("🔄 [Realtime] Cambio en conductores:", payload.eventType);
        if (!payload.new && payload.eventType !== 'DELETE') return;
        setDrivers(prev => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (!payload.new?.data) {
              console.warn('[Realtime] Driver event sin data JSONB, merge superficial');
              const { id, data: _d, ...topLevelFields } = payload.new || {};
              if (!id) return prev;
              const exists = prev.find(d => d.id === id);
              return exists ? prev.map(d => d.id === id ? { ...d, ...topLevelFields } : d) : prev;
            }
            const item = { ...payload.new.data, id: payload.new.id, username: payload.new.username, password: payload.new.password };
            const exists = prev.find(d => d.id === item.id);
            if (exists && payload.eventType === 'INSERT') return prev;
            return exists ? prev.map(d => d.id === item.id ? item : d) : [...prev, item];
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(d => d.id !== payload.old?.id);
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'clients' }, (payload) => {
        console.log("🔄 [Realtime] Cambio en clientes:", payload.eventType);
        if (!payload.new && payload.eventType !== 'DELETE') return;
        setClients(prev => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            if (!payload.new?.data) {
              console.warn('[Realtime] Client event sin data JSONB, merge superficial');
              const { id, data: _d, ...topLevelFields } = payload.new || {};
              if (!id) return prev;
              const exists = prev.find(c => c.id === id);
              return exists ? prev.map(c => c.id === id ? { ...c, ...topLevelFields } : c) : prev;
            }
            const item = { ...payload.new.data, id: payload.new.id, name: payload.new.name };
            const exists = prev.find(c => c.id === item.id);
            if (exists && payload.eventType === 'INSERT') return prev;
            return exists ? prev.map(c => c.id === item.id ? item : c) : [...prev, item];
          }
          if (payload.eventType === 'DELETE') {
            return prev.filter(c => c.id !== payload.old?.id);
          }
          return prev;
        });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => {
        console.log("🔄 [Realtime] Cambio en ajustes:", payload.eventType);
        if (payload.new && payload.new.key === 'alert_acknowledgments') {
          try { setAlertAcknowledgements(JSON.parse(payload.new.value)); } catch(e) {}
        }
        if (payload.new && payload.new.key === 'driverAlerts') {
          try { setDriverAlerts(JSON.parse(payload.new.value)); } catch(e) {}
        }
      })
      .subscribe();

    // Limpieza de canales si se desmonta
    return () => {
      supabase.removeChannel(channel);
    }
  }, [isAuthenticated])

  // ======= REFRESCO PERIÓDICO DE ENVÍOS ACTIVOS (cada 90s, silencioso) =======
  // Red de seguridad: si el Realtime falla o está throttleado por cuota,
  // los envíos activos se recargan solos sin que el admin tenga que hacer nada.
  useEffect(() => {
    const isMissingSupabaseKeys = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (isMissingSupabaseKeys) return;
    if (userRole !== 'admin') return; // Solo para admin

    const refreshActiveShipments = async () => {
      try {
        // Paginado: este refresco SUSTITUYE los activos en memoria, así que una
        // respuesta truncada a 1.000 filas haría desaparecer envíos del panel.
        const { data, error } = await fetchAllRows(
          () => supabase.from('shipments').select('id, data')
            .not('status', 'in', '("Entregado","Anulado")').order('id'),
          { label: 'refresh_activos' }
        );
        if (error || !data) return;
        const fresh = data.map(s => ({ ...s.data, id: s.id }));
        setShipments(prev => {
          // Merge: actualizar/añadir activos, conservar los terminados ya en estado
          const finishedInState = prev.filter(s => s.status === 'Entregado' || s.status === 'Anulado');
          const freshIds = new Set(fresh.map(s => s.id));
          const stillFinished = finishedInState.filter(s => !freshIds.has(s.id));
          return [...fresh, ...stillFinished];
        });
      } catch (e) {
        // Silencioso — no mostrar errores al usuario en el refresco de fondo
      }
    };

    const interval = setInterval(refreshActiveShipments, 60000); // cada 60 segundos
    return () => clearInterval(interval);
  }, [userRole]);

  // ======= OFFLINE QUEUE: FLUSH LOGIC (shared) =======
  const flushQueueRef = useRef(false); // prevent concurrent flushes

  const flushOfflineQueue = useCallback(async () => {
    if (flushQueueRef.current) return; // Already flushing
    const queue = await getQueue();
    if (queue.length === 0) return;
    if (!navigator.onLine) return; // Don't try if truly offline

    flushQueueRef.current = true;
    console.log(`[OfflineQueue] Flushing ${queue.length} queued operations...`);
    setIsSyncingQueue(true);
    setPendingQueueCount(queue.length);

    for (const op of queue) {
      try {
        if (op.type === 'updateShipment') {
          const { error } = await supabase
            .from('shipments')
            .update({
              status: op.mergedData.status,
              assignedDriverId: op.mergedData.assignedDriverId,
              data: op.mergedData
            })
            .eq('id', op.shipmentId);
          if (!error) {
            await dequeue(op.id);
            console.log(`[OfflineQueue] Synced updateShipment: ${op.shipmentId}`);
          } else {
            console.warn(`[OfflineQueue] Failed to sync updateShipment ${op.shipmentId}:`, error);
          }
        } else if (op.type === 'statusChange') {
          // --- Upload pending offline photos/signatures ---
          let dataToSave = { ...op.updatedData };
          const uploads = op.pendingUploads || {};

          // Upload signature if stored as base64 offline
          if (uploads.signatureData) {
            try {
              const uploadedUrl = await uploadProof(op.shipmentId, uploads.signatureData, 'signatures');
              if (uploadedUrl) dataToSave.deliverySignature = uploadedUrl;
              console.log(`[OfflineQueue] Uploaded offline signature for ${op.shipmentId}`);
            } catch (e) { console.warn('[OfflineQueue] Signature upload failed:', e); }
          }
          // Upload photo if stored as base64 offline
          if (uploads.photoData) {
            try {
              const uploadedUrl = await uploadProof(op.shipmentId, uploads.photoData, 'delivery_photos');
              if (uploadedUrl) dataToSave.deliveryPhoto = uploadedUrl;
              console.log(`[OfflineQueue] Uploaded offline photo for ${op.shipmentId}`);
            } catch (e) { console.warn('[OfflineQueue] Photo upload failed:', e); }
          }
          // Upload photo 2 if stored as base64 offline
          if (uploads.photoData2) {
            try {
              const uploadedUrl = await uploadProof(op.shipmentId, uploads.photoData2, 'delivery_photos');
              if (uploadedUrl) dataToSave.deliveryPhoto2 = uploadedUrl;
              console.log(`[OfflineQueue] Uploaded offline photo 2 for ${op.shipmentId}`);
            } catch (e) { console.warn('[OfflineQueue] Photo 2 upload failed:', e); }
          }
          // Upload incident photo if stored as base64 offline
          if (uploads.incidentPhotoData) {
            try {
              const uploadedUrl = await uploadProof(op.shipmentId, uploads.incidentPhotoData, 'incident_photos');
              if (uploadedUrl) dataToSave.incidentPhoto = uploadedUrl;
              console.log(`[OfflineQueue] Uploaded offline incident photo for ${op.shipmentId}`);
            } catch (e) { console.warn('[OfflineQueue] Incident photo upload failed:', e); }
          }

          // --- Sync the shipment record to Supabase ---
          const { error } = await supabase
            .from('shipments')
            .update({
              status: op.finalStatus,
              assignedDriverId: op.assignedDriverId,
              data: dataToSave
            })
            .eq('id', op.shipmentId);
          if (!error) {
            await dequeue(op.id);
            // Refresh local state with permanent Storage URLs
            setShipments(prev => prev.map(s => s.id === op.shipmentId ? { ...s, ...dataToSave } : s));
            console.log(`[OfflineQueue] Synced statusChange: ${op.shipmentId} -> ${op.finalStatus}`);
          } else {
            console.warn(`[OfflineQueue] Failed to sync statusChange ${op.shipmentId}:`, error);
          }
        } else if (op.type === 'createShipment') {
          // Envío creado mientras el conductor no tenía sesión Auth (error RLS 42501)
          const { error } = await supabase.from('shipments').upsert([{
            id: op.shipmentData.id,
            status: op.shipmentData.status,
            assignedDriverId: op.shipmentData.assignedDriverId || null,
            data: op.shipmentData
          }]);
          if (!error) {
            await dequeue(op.id);
            console.log(`[OfflineQueue] Synced createShipment: ${op.shipmentId}`);
          } else {
            console.warn(`[OfflineQueue] Failed to sync createShipment ${op.shipmentId}:`, error);
          }
        } else if (op.type === 'bulkUpdateShipments') {
          const { error } = await supabase.from('shipments').upsert(op.payloads);
          if (!error) {
            await dequeue(op.id);
            setShipments(prev => prev.map(s => {
              const match = op.payloads.find(p => p.id === s.id);
              return match ? { ...match.data, id: match.id } : s;
            }));
            console.log(`[OfflineQueue] Synced bulkUpdateShipments: ${op.payloads.length} envíos`);
          } else {
            console.warn(`[OfflineQueue] Failed to sync bulkUpdateShipments:`, error);
          }
        } else if (op.type === 'updateClient') {
          const { error } = await supabase
            .from('clients')
            .update({ name: op.updatedData.name, data: op.updatedData })
            .eq('id', op.clientId);
          if (!error) {
            await dequeue(op.id);
            setClients(prev => prev.map(c => c.id === op.clientId ? { ...op.updatedData, id: op.clientId } : c));
            console.log(`[OfflineQueue] Synced updateClient: ${op.clientId}`);
          } else {
            console.warn(`[OfflineQueue] Failed to sync updateClient ${op.clientId}:`, error);
          }
        }
      } catch (e) {
        console.error(`[OfflineQueue] Error processing op ${op.id}:`, e);
      }
    }
    setIsSyncingQueue(false);
    const newLen = await getQueueLength();
    setPendingQueueCount(newLen);
    flushQueueRef.current = false;
    console.log('[OfflineQueue] Flush complete. Remaining:', newLen);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger flush when coming back online
  useEffect(() => {
    if (isOnline) flushOfflineQueue();
  }, [isOnline]); // eslint-disable-line react-hooks/exhaustive-deps

  // Periodic retry: flush every 15 seconds if there are pending operations
  useEffect(() => {
    const interval = setInterval(() => {
      if (getQueueLength() > 0 && navigator.onLine) {
        console.log('[OfflineQueue] Periodic retry triggered...');
        flushOfflineQueue();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [flushOfflineQueue]);

  // Warn driver before closing if there are pending queue operations
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (getQueueLength() > 0) {
        e.preventDefault();
        e.returnValue = 'Tienes entregas pendientes de sincronizar. Si cierras ahora, se intentarán sincronizar al volver a abrir la app.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  // =================================================

  const handleSyncLocalToCloud = async () => {
    setIsSyncing(true)
    try {
      alert('Iniciando migración completa a Supabase...')
      // Migrate everything
      const dataToSync = [
        { table: 'drivers', items: JSON.parse(localStorage.getItem('drivers') || '[]'), idKey: 'id' },
        { table: 'shipments', items: JSON.parse(localStorage.getItem('shipments') || '[]'), idKey: 'id' },
        { table: 'clients', items: JSON.parse(localStorage.getItem('clients') || '[]'), idKey: 'id' },
        { table: 'articles', items: JSON.parse(localStorage.getItem('articles') || '[]'), idKey: 'id' },
        { table: 'vehicles', items: JSON.parse(localStorage.getItem('vehicles') || '[]'), idKey: 'id' },
        { table: 'fuel_logs', items: JSON.parse(localStorage.getItem('fuelLogs') || '[]'), idKey: 'id' },
        { table: 'tariffs', items: JSON.parse(localStorage.getItem('tariffs') || '[]'), idKey: 'id' },
        { table: 'settings', items: [{ key: 'defaultCodFee', value: localStorage.getItem('defaultCodFee') || '3.00' }], idKey: 'key' }
      ]

      for (const sync of dataToSync) {
        if (sync.items.length > 0) {
          for (const item of sync.items) {
             const payload = { id: item.id || item.key, data: item };
             if (sync.table === 'drivers') {
               payload.username = item.username;
               payload.password = item.password;
             }
             if (sync.table === 'clients') {
               payload.name = item.name;
             }
             if (sync.table === 'settings') {
               payload.key = item.key;
               payload.value = item.value;
               delete payload.data; // Settings table has key/value, not data JSONB
             }
             await supabase.from(sync.table).upsert([payload])
          }
        }
      }
      
      alert('¡Sincronización completada con éxito!')
      window.location.reload()
    } catch (error) {
      console.error('Sync error:', error)
      alert('Error en la sincronización.')
    } finally {
      setIsSyncing(false)
    }
  }

  const handleLogin = async (role = 'admin', username = '', password = '') => {
    try {
      // ── Construir el email para Supabase Auth ──
      let authEmail = username;

      // Para drivers: si no es un email, buscar el email usando RPC segura (bypasa RLS)
      if (role === 'driver' && !username.includes('@')) {
        try {
          const { data: email } = await supabase.rpc('get_driver_email_by_username', { p_username: username });
          if (email) {
            authEmail = email;
            console.log('[Login] Driver username →', authEmail);
          }
        } catch (e) {
          console.warn('[Login] RPC email lookup failed:', e);
        }
      }

      // ── Autenticación con Supabase Auth ──
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: password,
      });

      if (authError || !authData.user) {
        console.warn('[Login] Supabase Auth failed:', authError?.message);
        // ── FALLBACK: login legacy (para transición mientras se migran usuarios) ──
        return await handleLegacyLogin(role, username, password);
      }

      // ── Obtener perfil con rol ──
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (!profile) {
        console.warn('[Login] No profile found for auth user, falling back to legacy');
        return await handleLegacyLogin(role, username, password);
      }

      // ── Verificar que el driver está activo ──
      if (profile.role === 'driver' && profile.linked_id) {
        const { data: driverCheck } = await supabase
          .from('drivers')
          .select('data')
          .eq('id', profile.linked_id)
          .single();
        if (driverCheck?.data?.isActive === false) {
          await supabase.auth.signOut();
          alert('Tu cuenta de usuario ha sido desactivada. Por favor, contacta con la oficina.');
          return false;
        }
      }

      // ── Login exitoso ──
      setIsAuthenticated(true);
      setUserRole(profile.role);

      if (profile.role === 'driver') {
        setCurrentDriverId(profile.linked_id);
        setCurrentClientId(null);
        // Guardar nombre del conductor para mostrarlo instantáneamente al recargar
        if (profile.display_name) setCachedDriverName(profile.display_name);
      } else if (profile.role === 'client') {
        setCurrentClientId(profile.linked_id);
        setCurrentDriverId(null);
        // Notificar a la web padre (iframe)
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'SUM_CLIENT_LOGIN_SUCCESS', clientId: profile.linked_id }, '*');
        }
      } else {
        setCurrentDriverId(null);
        setCurrentClientId(null);
      }

      // No reload needed — el useEffect [isAuthenticated] carga datos automáticamente
      return true;
    } catch (e) {
      console.error('[Login] Error:', e);
      // Fallback a login legacy
      return await handleLegacyLogin(role, username, password);
    }
  }

  // ── Login legacy (compatibilidad durante la transición) ──
  const handleLegacyLogin = async (role = 'admin', username = '', password = '') => {
    if (role === 'driver') {
      // Usar RPC segura para verificar credenciales (bypasa RLS)
      try {
        const { data: driverInfo } = await supabase.rpc('verify_driver_login', { 
          p_username: username, 
          p_password: password 
        });
        
        if (driverInfo && driverInfo.found) {
          // Guardar nombre del conductor para mostrarlo de inmediato
          if (driverInfo.name) setCachedDriverName(driverInfo.name);

          // Si tiene email, intentar login con Supabase Auth para tener sesión
          if (driverInfo.email) {
            const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
              email: driverInfo.email,
              password: password,
            });
            if (!authErr && authData?.user) {
              console.log('[LegacyLogin] Driver auth session established ✅');
              setIsAuthenticated(true);
              setUserRole(role);
              setCurrentDriverId(driverInfo.id);
              setCurrentClientId(null);
              return true;
            } else {
              console.log('[LegacyLogin] Auth failed but legacy RPC succeeded. Sincronizando contraseña en Auth...');
              try {
                const res = await supabase.functions.invoke('create-auth-user', {
                  body: {
                    email: driverInfo.email,
                    password: password,
                    role: 'driver',
                    linked_id: String(driverInfo.id),
                    display_name: driverInfo.name || driverInfo.username,
                  }
                });
                
                if (!res.error) {
                  console.log('[LegacyLogin] Contraseña sincronizada en Auth ✅. Reintentando signIn...');
                  const { data: retryAuthData, error: retryAuthErr } = await supabase.auth.signInWithPassword({
                    email: driverInfo.email,
                    password: password,
                  });
                  if (!retryAuthErr && retryAuthData?.user) {
                    console.log('[LegacyLogin] Driver auth session established after sync ✅');
                    setIsAuthenticated(true);
                    setUserRole(role);
                    setCurrentDriverId(driverInfo.id);
                    setCurrentClientId(null);
                    return true;
                  }
                }
              } catch (syncErr) {
                console.warn('[LegacyLogin] Failed to sync auth password:', syncErr);
              }
            }
          }
          
          // Fallback sin sesión Auth (funcionalidad limitada)
          console.warn('[LegacyLogin] Driver sin sesión Auth — funcionalidad limitada');
          setIsAuthenticated(true);
          setUserRole(role);
          setCurrentDriverId(driverInfo.id);
          setCurrentClientId(null);
          return true;
        }
      } catch (e) {
        console.warn('[LegacyLogin] RPC verify failed:', e);
      }

      // Último fallback: caché local
      const normalize = (val) => String(val || '').toLowerCase().trim();
      const normInputUser = normalize(username);

      const driverFound = drivers.find(
        d => (normalize(d.username) === normInputUser || normalize(d.email) === normInputUser) && d.password === password
      );
      if (driverFound) {
        if (driverFound.isActive === false) {
          alert('Tu cuenta de usuario ha sido desactivada. Por favor, contacta con la oficina.');
          return false;
        }
        if (driverFound.name) setCachedDriverName(driverFound.name);
        setIsAuthenticated(true);
        setUserRole(role);
        setCurrentDriverId(driverFound.id);
        setCurrentClientId(null);
        return true;
      }
      return false;

    } else if (role === 'client') {
      // Usar datos en memoria si ya están cargados — evita round-trip de red innecesario
      let currentClients = clients;
      if (!currentClients || currentClients.length === 0) {
        // Solo consultar Supabase si la caché local está vacía (arranque frío)
        try {
          // Paginado: aquí se busca al cliente que intenta entrar. Truncar a 1.000
          // filas dejaría fuera del login a los clientes que caigan más abajo.
          const { data } = await fetchAllRows(
            () => supabase.from('clients').select('*').order('id'),
            { label: 'clients_login' }
          );
          if (data && data.length > 0) {
            currentClients = data.map(c => ({ ...c.data, id: c.id }));
            setClients(currentClients);
          }
        } catch (e) {
          console.warn('Error fetching clients for login:', e);
        }
      }
      
      const normalize = (val) => String(val || '').toLowerCase().trim();
      const normInputUser = normalize(username);

      const client = currentClients.find(c => 
        (normalize(c.username) === normInputUser || normalize(c.email) === normInputUser || normalize(c.name).includes(normInputUser)) 
        && c.password === password
      );
      if (client) {
        setIsAuthenticated(true);
        setUserRole(role);
        setCurrentClientId(client.id);
        setCurrentDriverId(null);
        // Notificar a la web padre (iframe) que el login fue exitoso
        if (window.parent !== window) {
          window.parent.postMessage({ type: 'SUM_CLIENT_LOGIN_SUCCESS', clientId: client.id }, '*');
        }
        return true;
      }
      return false;

    } else {
      // Admin log in - compare against loaded creds OR hardcoded defaults
      const DEFAULT_ADMIN_USER = 'info@sumtransportes.com';
      const DEFAULT_ADMIN_PASS = '1632';

      const isValid = 
        (username === (adminCreds?.user || DEFAULT_ADMIN_USER) && password === (adminCreds?.pass || DEFAULT_ADMIN_PASS)) ||
        (username === DEFAULT_ADMIN_USER && password === DEFAULT_ADMIN_PASS);

      if (isValid) {
        setIsAuthenticated(true);
        setUserRole(role);
        setCurrentDriverId(null);
        setCurrentClientId(null);
        return true;
      }
      return false;
    }
  }

  const handleLogout = async () => {
    // Cerrar sesión de Supabase Auth
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Logout] Error signing out from Supabase Auth:', e);
    }
    // Limpiar sesión local (para que no se restaure al recargar)
    try {
      sessionStorage.removeItem('sumtrans_session');
      sessionStorage.removeItem('sumtrans_creating_shipment');
      sessionStorage.removeItem('sumtrans_shipment_draft');
    } catch {}
    setIsAuthenticated(false)
    setUserRole(null)
    setCurrentDriverId(null)
    setCurrentClientId(null)
    setCurrentView('dashboard')
  }

  // Temporary cleanup and data migration
  useEffect(() => {
    // 1. Ensure default clients have billingType if missing (Migration)
    setClients(prev => prev.map(c => {
      let updated = { ...c };
      if ((c.name === 'Global Tech SA' || c.name === 'Industrias Apex') && !c.billingType) {
        updated.billingType = 'Facturación';
      }
      // Add credentials to previous local-storage items
      if (c.name === 'Industrias Apex' && !c.username) {
        updated.username = 'apex';
        updated.password = 'password123';
      }
      return updated;
    }));
  }, []);

  const handleCleanupDriverData = async (pattern = 'miki') => {
    if (!window.confirm(`¿Seguro que quieres borrar todos los datos que contengan "${pattern}"?`)) return;

    const lowerPattern = pattern.toLowerCase();
    
    try {
      // 1. Identify driver IDs to delete
      const driversToDelete = drivers.filter(d => 
        (d.name && d.name.toLowerCase().includes(lowerPattern)) || 
        (d.username && d.username.toLowerCase().includes(lowerPattern))
      );
      const driverIds = driversToDelete.map(d => d.id);

      // 2. Delete drivers from Supabase
      if (driverIds.length > 0) {
        await supabase.from('drivers').delete().in('id', driverIds);
      }
      setDrivers(prev => prev.filter(d => !driverIds.includes(d.id)));

      // 3. Filter out shipments assigned to or created by these drivers, OR matching client name
      const shipmentsToDelete = shipments.filter(s => 
        driverIds.includes(s.assignedDriverId) || 
        driverIds.includes(s.createdById) ||
        (s.client && s.client.toLowerCase().includes(lowerPattern)) ||
        (s.destinationName && s.destinationName.toLowerCase().includes(lowerPattern))
      ).map(s => s.id);

      if (shipmentsToDelete.length > 0) {
        await supabase.from('shipments').delete().in('id', shipmentsToDelete);
      }
      setShipments(prev => prev.filter(s => !shipmentsToDelete.includes(s.id)));

      // 4. Filter out clients that match the pattern
      const clientsToDelete = clients.filter(c => c.name.toLowerCase().includes(lowerPattern)).map(c => c.id);
      if (clientsToDelete.length > 0) {
        await supabase.from('clients').delete().in('id', clientsToDelete);
      }
      setClients(prev => prev.filter(c => !clientsToDelete.includes(c.id)));

      alert(`Limpieza completada: Se han borrado los datos relacionados con "${pattern}".`);
    } catch (error) {
      console.error('Error during cleanup:', error);
      alert('Error al realizar la limpieza de datos.');
    }
  };

  // ── Crear/actualizar la cuenta Supabase Auth de un conductor ──
  // Sin cuenta Auth no hay sesión, y sin sesión las políticas RLS bloquean
  // TODAS las consultas: el conductor entra y lo ve todo en blanco. Por eso
  // cualquier fallo aquí se avisa en pantalla en vez de quedarse en la consola.
  const syncDriverAuthAccount = async ({ email, password, driverId, displayName }) => {
    const motivo = !email
      ? 'no tiene email'
      : (!password || password.length < 6)
        ? 'la contraseña tiene menos de 6 caracteres'
        : null;

    if (motivo) {
      alert(
        `⚠️ El conductor se ha guardado, pero NO tendrá acceso a la app porque ${motivo}.\n\n` +
        `Sin cuenta de acceso podrá iniciar sesión pero lo verá todo vacío.\n\n` +
        `Edita su ficha y añade email + contraseña de 6 caracteres o más.`
      );
      return false;
    }

    try {
      const res = await supabase.functions.invoke('create-auth-user', {
        body: {
          email,
          password,
          role: 'driver',
          linked_id: String(driverId),
          display_name: displayName || email,
        }
      });

      if (res.error) {
        console.warn('[DriverAuth]', res.error.message);
        alert(
          `⚠️ El conductor se ha guardado, pero no se pudo crear su cuenta de acceso:\n\n${res.error.message}\n\n` +
          `Hasta que se resuelva, entrará en la app pero lo verá todo vacío.`
        );
        return false;
      }

      console.log('[DriverAuth] Cuenta Auth creada/actualizada ✅');
      return true;
    } catch (authErr) {
      console.error('[DriverAuth] Error inesperado:', authErr);
      alert(
        `⚠️ El conductor se ha guardado, pero no se pudo crear su cuenta de acceso:\n\n${authErr.message}\n\n` +
        `Hasta que se resuelva, entrará en la app pero lo verá todo vacío.`
      );
      return false;
    }
  };

  const handleAddDriver = async (newDriver) => {
    try {
      const { data, error } = await supabase.from('drivers').insert([{ 
        id: newDriver.id, 
        username: newDriver.username?.trim() || null, 
        password: newDriver.password || null, 
        data: newDriver 
      }]).select();
      
      if (error) {
        console.error('Supabase Error Details:', error)
        alert(`Error Supabase al crear Transportista: ${error.message} (${error.code})`)
        return false
      }
      
      // ── Crear cuenta Supabase Auth automáticamente ──
      await syncDriverAuthAccount({
        email: newDriver.email,
        password: newDriver.password,
        driverId: data[0].id,
        displayName: newDriver.name || newDriver.username,
      });

      if (data && data[0]) setDrivers(prev => [...prev, { ...data[0].data, id: data[0].id, username: data[0].username, password: data[0].password }])
      return true
    } catch (e) { 
      console.error(e)
      alert('Se produjo un error crítico al guardar el transportista: ' + e.message)
      return false
    }
  }

  const handleDeleteDriver = async (driverId) => {
    if (!window.confirm('¿Seguro que quieres borrar este conductor?')) return;
    try {
      const { error } = await supabase.from('drivers').delete().eq('id', driverId);
      if (error) throw error;
      setDrivers(prev => prev.filter(d => d.id !== driverId));
    } catch (e) { alert('Error al borrar conductor'); console.error(e); }
  }

  // =====================================================
  // MODO PRUEBAS SANDBOX: Limpieza automática al desactivar
  // =====================================================
  const handleDeactivateTestMode = async (driverId) => {
    try {
      const today = new Date().toISOString().split('T')[0];

      // 1. Revertir envíos que el conductor tocó hoy:
      //    - Asignados a él Y cuyo estado haya cambiado (no están en 'Pendiente de asignar' / 'En reparto')
      const shipmentsToRevert = shipmentsRef.current.filter(s =>
        String(s.assignedDriverId) === String(driverId) &&
        s.status !== 'Pendiente de asignar' &&
        // Solo los modificados hoy
        (s.updatedAt || s.paidAt || '').startsWith(today)
      );

      let revertedCount = 0;
      for (const s of shipmentsToRevert) {
        const revertedData = {
          ...s,
          status: 'En reparto',
          deliverySignature: null,
          deliveryPhoto: null,
          deliveryCoordinates: null,
          paidAt: null,
          isPaid: false,
          isCodPaid: false,
          porteCollectedById: null,
          codCollectedById: null,
          comment: null,
          updatedAt: new Date().toISOString(),
        };
        await supabase.from('shipments').update({
          status: 'En reparto',
          data: revertedData
        }).eq('id', s.id);
        setShipments(prev => prev.map(item => item.id === s.id ? revertedData : item));
        revertedCount++;
      }

      // 2. Borrar clientes creados en modo prueba por este conductor (isTest: true)
      const testClients = clientsRef.current.filter(c =>
        c.isTest === true &&
        (String(c.creatorId) === String(driverId) || String(c.createdById) === String(driverId))
      );
      const testClientIds = testClients.map(c => c.id);

      if (testClientIds.length > 0) {
        await supabase.from('clients').delete().in('id', testClientIds);
        setClients(prev => prev.filter(c => !testClientIds.includes(c.id)));
      }

      if (revertedCount > 0 || testClientIds.length > 0) {
        alert(`✅ Modo Pruebas desactivado.\nSe han revertido ${revertedCount} envíos a "En reparto" y eliminado ${testClientIds.length} clientes de prueba.`);
      }
    } catch (e) {
      console.error('Error en limpieza de modo pruebas:', e);
    }
  };

    const handleUpdateRoutes = async (newRoutes) => {
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'routes', value: JSON.stringify(newRoutes) });
      if (error) throw error;
      setRoutes(newRoutes);
    } catch(e) { console.error('Error saving routes:', e); alert('Error al guardar rutas'); }
  }

  // opciones.driverId  → guardado desde el móvil de un repartidor: escribe SOLO su
  //                      fila. Nadie más la toca, así que no hay carrera que perder.
  // opciones.fusionar = false para órdenes deliberadas del administrador (borrar o
  //                      recuperar aprendizaje): ahí el objeto que llega ES el
  //                      definitivo, y fusionarlo con lo que hay en la nube
  //                      resucitaría justo lo que se acaba de borrar.
  const handleUpdateRouteKnowledge = async (newKnowledge, opciones = {}) => {
    const fusionar = opciones.fusionar !== false;
    const driverId = opciones.driverId ?? null;

    try {
      // ── Camino del repartidor ──
      // Su aprendizaje vive en `route_knowledge_driver_<id>`, una fila que solo escribe
      // su propio móvil. Antes esto iba al JSON común y dos repartidores sincronizando
      // a la vez se pisaban el aprendizaje: releer antes de escribir estrechaba la
      // ventana, pero entre la lectura y la escritura seguía cabiendo la del otro.
      if (driverId != null) {
        const suAprendizaje = newKnowledge?.byDriver?.[String(driverId)] || {};
        const { error } = await supabase.from('settings').upsert({
          key: claveAprendizaje(driverId),
          value: JSON.stringify(suAprendizaje)
        });
        if (error) throw error;

        // En memoria sí se refleja el objeto completo, que es lo que consume la UI.
        setRouteKnowledge(prev => ensamblarConocimiento(prev, { [String(driverId)]: suAprendizaje }));
        return;
      }

      // ── Camino del administrador ──
      let valorFinal = newKnowledge;

      if (fusionar) {
        // La fila principal sigue siendo compartida (maestro por ruta, papelera y buzón
        // de órdenes), así que aquí la relectura + fusión sigue haciendo falta.
        const { data: actual, error: errorLectura } = await supabase
          .from('settings')
          .select('value')
          .eq('key', 'route_knowledge')
          .maybeSingle();
        if (errorLectura) throw errorLectura;

        let base = {};
        if (actual?.value) {
          try { base = JSON.parse(actual.value) || {}; }
          catch(e) { console.warn('route_knowledge ilegible en la nube, se reescribe:', e); }
        }

        valorFinal = fusionarConocimiento(base, newKnowledge);
      }

      const { error } = await supabase.from('settings').upsert({ key: 'route_knowledge', value: JSON.stringify(valorFinal) });
      if (error) throw error;

      // Borrar o recuperar el aprendizaje de un conductor se decide sobre el objeto
      // entero, pero quien manda al cargar es su fila: hay que materializar el cambio
      // ahí también o al recargar reaparecería lo borrado.
      const cambios = conductoresConCambios(routeKnowledgeRef.current, valorFinal);
      for (const [id, datos] of Object.entries(cambios)) {
        const { error: errFila } = await supabase.from('settings').upsert({
          key: claveAprendizaje(id),
          value: JSON.stringify(datos)
        });
        if (errFila) throw errFila;
      }

      setRouteKnowledge(valorFinal);
    } catch(e) {
      // Supabase devuelve un objeto, no un Error: sin desglosarlo la consola solo
      // muestra "[object Object]" y no hay forma de saber si es permisos o red.
      console.error('Error saving route knowledge:', e?.code || '', e?.message || e, e?.details || '');
    }
  }

  const handleUpdateDriver = async (driverId, updatedData) => {
    const previousDriver = driversRef.current.find(d => String(d.id) === String(driverId));
    if (!previousDriver) {
      console.error('[UpdateDriver] Conductor no encontrado en estado:', driverId);
      alert('Error: Conductor no encontrado. Recarga la página e inténtalo de nuevo.');
      return;
    }

    const wasTestMode = previousDriver?.isTestMode || false;
    const isNowTestMode = updatedData.isTestMode || false;
    const isDeactivating = wasTestMode && !isNowTestMode;

    // ⚠️ Merge con datos previos para NO perder campos no incluidos en el formulario
    const mergedData = { ...previousDriver, ...updatedData };

    console.log('[UpdateDriver] Guardando conductor', driverId, '| isTestMode:', mergedData.isTestMode);

    try {
      // Verificar sesión Auth activa antes de intentar la operación
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        alert('Tu sesión ha caducado. Por favor, recarga la página y vuelve a iniciar sesión.');
        return;
      }

      const { data, error } = await supabase.from('drivers').update({ 
        username: mergedData.username?.trim() || null, 
        password: mergedData.password || null, 
        data: mergedData 
      }).eq('id', driverId).select();
      if (error) throw error;

      if (!data || data.length === 0) {
        console.error('[UpdateDriver] El UPDATE no devolvió filas. ¿ID incorrecto o RLS bloqueando?', driverId);
        alert('No se pudo guardar el conductor. Comprueba los permisos.');
        return;
      }

      console.log('[UpdateDriver] Guardado OK | isTestMode en BD:', data[0].data?.isTestMode);

      // Usar String() para evitar problemas de tipo number vs string en el ID
      setDrivers(prev => prev.map(d => String(d.id) === String(driverId) 
        ? { ...data[0].data, id: data[0].id, username: data[0].username, password: data[0].password } 
        : d
      ));

      if (isDeactivating) {
        await handleDeactivateTestMode(driverId);
      }

      // ── Crear/actualizar cuenta Supabase Auth ──
      await syncDriverAuthAccount({
        email: mergedData.email,
        password: mergedData.password,
        driverId,
        displayName: mergedData.name || mergedData.username,
      });
    } catch (e) {
      const msg = e?.message || e?.details || String(e);
      console.error('[UpdateDriver] Error completo:', e);
      alert(`Error al actualizar transportista:\n${msg}`);
    }
  }

  const handleAssignDriver = async (shipmentId, driverId, scheduledDate = null) => {
    const shipment = shipmentsRef.current.find(s => s.id === shipmentId);
    if (!shipment) return;
    
    const isUnassigning = !driverId || driverId === '' || driverId === 'unassigned';
    const isSendingToAdmin = driverId === 'admin';
    const updatedShipment = {
      ...shipment,
      assignedDriverId: isUnassigning || isSendingToAdmin ? null : Number(driverId),
      status: isUnassigning ? 'Pendiente de asignar' : (isSendingToAdmin ? 'Administración' : 'En reparto'),
      // Cualquier asignación deliberada cierra el "lo devolví yo, lo reasigno yo": si no
      // se limpiara, un albarán devuelto por un conductor y luego liberado por oficina
      // seguiría apareciendo solo en la pestaña de aquel conductor.
      returnedToAssignById: null
    };
    
    if (scheduledDate !== null) {
      updatedShipment.scheduledDate = scheduledDate;
    }


    if (shipment.isTest || activeTestMode) {
      console.log('🛡️ [Modo Pruebas] Asignación bloqueada — solo actualización local.');
      setShipments(prev => prev.map(s => s.id === shipmentId ? updatedShipment : s));
      return true;
    }

    // Optimistic Update — always applied immediately, igual que handleUpdateShipment
    setShipments(prev => prev.map(s => s.id === shipmentId ? updatedShipment : s));

    // --- OFFLINE or FAIL: enqueue for retry (reutiliza el mismo op 'updateShipment' del flush) ---
    const enqueueAssignOp = async () => {
      const opId = `updateShipment_${shipmentId}`;
      const qLen = await enqueue({ id: opId, type: 'updateShipment', shipmentId, mergedData: updatedShipment, queuedAt: new Date().toISOString() });
      setPendingQueueCount(qLen);
      console.log(`[Queue] Enqueued assignDriver for ${shipmentId}`);
    };

    if (!navigator.onLine) {
      await enqueueAssignOp();
      return true;
    }

    try {
      const { data, error } = await supabase.from('shipments').update({
        status: updatedShipment.status,
        assignedDriverId: updatedShipment.assignedDriverId,
        data: updatedShipment
      }).eq('id', shipmentId).select();
      if (error) throw error;

      if (!data || data.length === 0) {
        console.warn(`[Supabase] No se encontró el envío ${shipmentId} para actualizar. Puede que no se haya sincronizado aún.`);
        return true; // Ya se hizo la actualización optimista localmente
      }

      setShipments(prev => prev.map(s => s.id === shipmentId ? { ...data[0].data, id: data[0].id } : s));
      return true;
    } catch (e) {
      // Error de red (o Supabase caído) — encolar en vez de perder la asignación
      console.warn(`[Queue] Error asignando conductor ${shipmentId}, encolando para reintento:`, e);
      await enqueueAssignOp();
      return true; // Keep optimistic update
    }
  }

  const handleAddVehicle = async (newVehicle) => {
    try {
      const { data, error } = await supabase.from('vehicles').insert([{ id: newVehicle.id, data: newVehicle }]).select();
      if (error) throw error;
      setVehicles(prev => [...prev, { ...data[0].data, id: data[0].id }]);
    } catch (e) { alert('Error al guardar vehículo'); console.error(e); }
  }

  const handleUpdateVehicle = async (id, updatedData) => {
    try {
      // `updatedData` trae solo los campos que cambian (ej: { documents }), así que hay que
      // combinarlo con la ficha guardada. Si se escribiera tal cual, el resto de la ficha
      // (marca, modelo, estado, conductor, odómetro, mantenimientos...) se perdería.
      const { data: current, error: readError } = await supabase
        .from('vehicles').select('data').eq('id', id).single();
      if (readError) throw readError;

      const merged = { ...(current?.data || {}), ...updatedData };
      const { data, error } = await supabase.from('vehicles').update({ data: merged }).eq('id', id).select();
      if (error) throw error;
      setVehicles(prev => prev.map(v => v.id === id ? { ...data[0].data, id: data[0].id } : v));
    } catch (e) { alert('Error al actualizar vehículo'); console.error(e); }
  }

  const handleDeleteVehicle = async (id) => {
    try {
      const { error } = await supabase.from('vehicles').delete().eq('id', id);
      if (error) throw error;
      setVehicles(prev => prev.filter(v => v.id !== id));
    } catch (e) { alert('Error al borrar vehículo'); console.error(e); }
  }

  const handleRequestDriverGps = async (driverId) => {
    const driver = drivers.find(d => String(d.id) === String(driverId));
    if (!driver) return;
    
    // Limpiar campos que son de nivel superior en la BD y no deben ir dentro de `data`
    const { id, username, password, created_at, ...cleanDriverData } = driver;
    
    const updatedData = { 
      ...cleanDriverData, 
      locationRequestTrigger: Date.now() 
    };
    
    try {
      const { error } = await supabase.from('drivers').update({
        data: updatedData
      }).eq('id', driverId);
      
      if (error) {
        console.error("Error pidiendo señal GPS:", error);
        alert(`❌ Error al pedir señal GPS: ${error.message}`);
      } else {
        // Actualizar el estado local también para que sea inmediato
        setDrivers(prev => prev.map(d => 
          String(d.id) === String(driverId) 
            ? { ...d, locationRequestTrigger: updatedData.locationRequestTrigger }
            : d
        ));
      }
    } catch (e) {
      console.error("Error pidiendo señal GPS:", e);
      alert("❌ Error de conexión al pedir señal GPS");
    }
  }


  const handleAddShipment = async (newShipment, originalPickupId = null) => {
    // Determine creator
    let creatorName = 'Administrador';
    let creatorId = null;

    if (userRole === 'driver') {
      // Comparar con String() como en el resto de la app: el id del conductor llega
      // unas veces como número (tabla drivers) y otras como texto (perfil de Supabase
      // o sesión guardada). Con `===` la búsqueda fallaba y el albarán se guardaba
      // como "Conductor" a secas, sin saber quién lo había hecho.
      const driver = drivers.find(d => String(d.id) === String(currentDriverId));
      const nombre = driver?.name || cachedDriverName;
      creatorName = nombre ? `Cond.${nombre} ` : 'Conductor';
      creatorId = currentDriverId;
    } else if (userRole === 'client') {
      const client = clients.find(c => c.id === currentClientId);
      creatorName = client ? `ClienteWeb: ${client.name}` : 'Portal Cliente';
      creatorId = currentClientId;
    }

    // Usar el modelo para normalizar los datos
    const shipmentModel = new Shipment({
      ...newShipment,
      type: newShipment.type || 'Entrega',
      createdAt: new Date().toISOString(),
      createdBy: creatorName,
      createdById: creatorId,
      assignedDriverId: newShipment.assignedDriverId,
      isTest: activeTestMode
    });

    const shipmentWithMeta = shipmentModel.toJSON();

    // ============================================================
    // MODO PRUEBAS SANDBOX: Si el conductor está en modo prueba,
    // solo actualizamos el estado local. NADA va a Supabase.
    // ============================================================
    if (activeTestMode) {
      console.log('🛡️ [Modo Pruebas] Envío bloqueado — solo actualización local.');
      const localShipment = { ...shipmentWithMeta, id: shipmentWithMeta.id };
      if (originalPickupId) {
        setShipments(prev => [localShipment, ...prev.filter(s => s.id !== originalPickupId)]);
      } else {
        setShipments(prev => [localShipment, ...prev]);
      }
      return true;
    }
    // ============================================================

    // Encola el envío para crearlo en Supabase en cuanto vuelva la cobertura.
    // Se usa tanto si ya sabemos que estamos offline como si la red falla a mitad de guardado.
    const enqueueCreateOp = async () => {
      const qLen = await enqueue({
        id: `create_${shipmentWithMeta.id}_${Date.now()}`,
        type: 'createShipment',
        shipmentId: shipmentWithMeta.id,
        shipmentData: shipmentWithMeta,
        timestamp: Date.now(),
      });
      setPendingQueueCount(qLen);
      if (originalPickupId) {
        setShipments(prev => [{ ...shipmentWithMeta }, ...prev.filter(s => s.id !== originalPickupId)]);
      } else {
        setShipments(prev => [{ ...shipmentWithMeta }, ...prev]);
      }
    };

    // --- SIN COBERTURA: no intentamos la llamada de red (tardaría en fallar) ---
    // encolamos directamente para que se sincronice en cuanto vuelva la señal.
    if (!navigator.onLine) {
      console.warn('[handleAddShipment] Sin conexión — encolando envío para sincronizar al recuperar cobertura');
      await enqueueCreateOp();
      return true;
    }

    try {
      // 1. If replacing an existing pickup, delete it FIRST to avoid Primary Key collisions
      if (originalPickupId) {
        const { error: delErr } = await supabase.from('shipments').delete().eq('id', originalPickupId);
        if (delErr) console.warn("Could not delete original pickup (might be same ID):", delErr);
      }

      // 2. Save new shipment to Supabase (using upsert for resilience)
      const { data, error } = await supabase.from('shipments').upsert([{
        id: shipmentWithMeta.id,
        status: shipmentWithMeta.status,
        assignedDriverId: shipmentWithMeta.assignedDriverId || null,
        data: shipmentWithMeta 
      }]).select();
      
      if (error) {
        console.error('Supabase Error Details:', error)
        // Error 42501 = RLS: el conductor no tiene sesión Auth activa.
        // Código vacío/ausente = supabase-js envolvió un fallo de red (fetch roto por
        // mala cobertura, "TypeError: Load failed" en Safari/iOS) como si fuera una
        // respuesta normal en vez de lanzar una excepción — navigator.onLine puede seguir
        // marcando true con wifi "conectado pero sin datos reales".
        // En ambos casos NO es un error de datos: guardamos el envío en la cola offline
        // para que se sincronice automáticamente en cuanto haya cobertura real.
        const isRetryable = error.code === '42501' || !error.code;
        if (isRetryable) {
          console.warn('[handleAddShipment] Error de red/RLS — encolando envío para reintento automático', error);
          await enqueueCreateOp();
          return true; // No bloquear al conductor
        }
        alert(`Error Supabase: ${error.message} (${error.code})`)
        return false
      }

      const newShipmentFromDB = (data && data[0]) ? { ...data[0].data, id: data[0].id } : { ...shipmentWithMeta };

      // 2. Update local state
      // (el pickup original ya se borró en el paso 1, antes del upsert — repetir el
      // delete aquí era una llamada de red redundante, y si el nuevo albarán reutiliza
      // el mismo id que el pickup, borraba la fila que se acababa de crear)
      if (originalPickupId) {
        setShipments(prev => {
          const filtered = prev.filter(s => s.id !== originalPickupId);
          return [...filtered, newShipmentFromDB];
        });
      } else {
        setShipments(prev => [newShipmentFromDB, ...prev]);
      }

      // 3. Auto-save Clients (Supabase)
      const isActuallyTest = false; // Ya no llegamos aquí en modo prueba

      // Auto-save REMITENTE (Sender) if new
      const normalizedNewSender = normalizeClientName(newShipment.client);
      let targetClient = null;
      let targetBranch = null;

      for (const c of clients) {
          if (normalizeClientName(c.name) === normalizedNewSender || normalizeClientName(c.legalName) === normalizedNewSender) {
              targetClient = c;
              break;
          }
          if (c.branches && Array.isArray(c.branches)) {
              const b = c.branches.find(br => normalizeClientName(br.name) === normalizedNewSender);
              if (b) {
                  targetClient = c;
                  targetBranch = b;
                  break;
              }
          }
      }

      if (!targetClient && newShipment.client) {
        const newClientData = {
          id: Date.now(),
          name: newShipment.client,
          legalName: '',
          address: newShipment.originAddress || newShipment.origin || '',
          city: newShipment.originCity || '',
          zip: newShipment.originZip || '',
          phone: newShipment.originPhone || '',
          coordinates: newShipment.originCoordinates || '',
          type: 'Remitente',
          billingType: 'Clientes Habituales',
          status: 'pending',
          // Si el porte lo paga una agencia, el remitente también es gente suya
          ownerAgencyId: resolveOwnerAgencyId(newShipment, clientsRef.current),
          createdFrom: newShipment.type === 'Recogida' ? 'Recogida' : 'Albarán',
          createdBy: creatorName,
          lastInteraction: new Date().toISOString().split('T')[0],
          creatorId: creatorId,
          isTest: isActuallyTest
        };
        await handleAddClient(newClientData);
      }

      // Check sender as well if it already exists but has no coordinates
      if (targetClient && newShipment.originCoordinates) {
          if (targetBranch) {
              if (!(targetBranch.coordinates && String(targetBranch.coordinates).trim().length > 0)) {
                  console.log("Auto-filling missing GPS for existing sender branch:", targetBranch.name);
                  await handleUpdateClient(targetClient.id, { coordinates: newShipment.originCoordinates }, targetBranch.id);
              }
          } else {
              if (!(targetClient.coordinates && String(targetClient.coordinates).trim().length > 0)) {
                  console.log("Auto-filling missing GPS for existing sender:", targetClient.name);
                  await handleUpdateClient(targetClient.id, { coordinates: newShipment.originCoordinates });
              }
          }
      }

      return true;
    } catch (error) {
      // Error de red (fetch falla, no solo un error de Supabase) — encolar en vez de perder el envío
      console.warn('[handleAddShipment] Error de red al guardar envío — encolando para reintento:', error);
      await enqueueCreateOp();
      return true; // No bloquear al conductor
    }
  }

  // Handle manual edits to shipment details
  const handleUpdateShipment = async (idOrObject, maybeUpdates) => {
    let id, updates;
    if (typeof idOrObject === 'object' && !maybeUpdates) {
      id = idOrObject.id;
      updates = idOrObject;
    } else {
      id = idOrObject;
      updates = maybeUpdates;
    }

    if (!id) return false;

    const currentShipment = shipmentsRef.current.find(s => s.id === id);
    if (!currentShipment) {
        console.error("Shipment not found for update (using ref):", id);
        return false;
    }

    const mergedData = { ...currentShipment, ...updates };

    // Optimistic Update — always applied immediately
    setShipments(prev => prev.map(s => s.id === id ? mergedData : s));

    // --- OFFLINE or FAIL: enqueue for retry ---
    const enqueueUpdateOp = async () => {
      const opId = `updateShipment_${id}`;
      const qLen = await enqueue({ id: opId, type: 'updateShipment', shipmentId: id, mergedData, queuedAt: new Date().toISOString() });
      setPendingQueueCount(qLen);
      console.log(`[Queue] Enqueued updateShipment for ${id}`);
    };

    if (!navigator.onLine) {
      await enqueueUpdateOp();
      return true;
    }

    try {
      const { data, error } = await supabase
        .from('shipments')
        .update({
          status: mergedData.status,
          assignedDriverId: mergedData.assignedDriverId,
          data: mergedData
        })
        .eq('id', id)
        .select();

      if (error) {
        // Supabase write failed — enqueue for retry instead of reverting
        console.warn(`[Queue] Supabase write failed for ${id}, enqueuing for retry:`, error);
        await enqueueUpdateOp();
        return true; // Keep optimistic update, will sync later
      }

      if (!data || data.length === 0) {
        console.warn(`[Supabase] No se encontró el envío ${id} para actualizar. Puede estar en modo prueba o no sincronizado.`);
        return true; // Ya se hizo la actualización optimista localmente
      }

      const savedShipment = { ...data[0].data, id: data[0].id };
      setShipments(prev => prev.map(s => s.id === id ? savedShipment : s));
      return true;
    } catch (error) {
       // Network error — enqueue for retry
       console.warn(`[Queue] Network error updating ${id}, enqueuing for retry:`, error);
       await enqueueUpdateOp();
       return true; // Keep optimistic update
    }
  }

  const handleDeleteShipment = async (shipmentId) => {
    try {
      const shipmentToDelete = shipmentsRef.current.find(s => s.id === shipmentId);

      // ── PROTECCIÓN: Albarán cobrado ──
      if (shipmentToDelete) {
        const hasPaidPorte = shipmentToDelete.portePaid;
        const hasPaidCod = shipmentToDelete.codPaid && parseFloat(String(shipmentToDelete.codAmount || '0').replace(',', '.')) > 0;
        const paidAmount = parseFloat(String(shipmentToDelete.customAmount || shipmentToDelete.amount || '0').replace(',', '.')) || 0;
        const codAmount = parseFloat(String(shipmentToDelete.codAmount || '0').replace(',', '.')) || 0;
        
        if (hasPaidPorte || hasPaidCod) {
          const warnings = [];
          if (hasPaidPorte && paidAmount > 0) warnings.push(`Porte cobrado: ${paidAmount.toFixed(2)} €`);
          if (hasPaidCod && codAmount > 0) warnings.push(`Reembolso cobrado: ${codAmount.toFixed(2)} €`);
          
          const confirmed = window.confirm(
            `⚠️ ¡ATENCIÓN! Este albarán tiene cobros registrados:\n\n` +
            warnings.join('\n') + '\n\n' +
            `Si lo borras, estos cobros DESAPARECERÁN de la Cuenta del conductor.\n` +
            `El dinero ya cobrado quedará sin justificante.\n\n` +
            `¿Estás SEGURO de que quieres borrarlo?`
          );
          if (!confirmed) return;
          
          // Segunda confirmación para cobros
          const doubleConfirm = window.confirm(
            `🔴 CONFIRMACIÓN FINAL\n\n` +
            `Vas a borrar el albarán ${shipmentId} con cobros ya realizados.\n` +
            `Esta acción NO se puede deshacer.\n\n` +
            `¿Confirmar borrado definitivo?`
          );
          if (!doubleConfirm) return;
        }
      }

      // REVERSIÓN DE PRESUPUESTOS
      if (shipmentToDelete && shipmentToDelete.type === 'Recibo') {
          const linkedShipments = shipmentsRef.current.filter(s => s.linkedReceiptId === shipmentId);
          if (linkedShipments.length > 0) {
              if (window.confirm(`Este recibo está vinculado a ${linkedShipments.length} presupuestos.\nSi lo borras, esos presupuestos volverán a estar pendientes de cierre mensual.\n\n¿Deseas continuar y revertir el cierre?`)) {
                  const updatesArray = linkedShipments.map(s => ({
                      id: s.id,
                      updates: { budgetLiquidated: false, linkedReceiptId: null }
                  }));
                  // Ejecutar actualización múltiple local y en la nube
                  await handleUpdateMultipleShipments(updatesArray);
              } else {
                  return; // Cancelar borrado
              }
          }
      }

      const { error } = await supabase.from('shipments').delete().eq('id', shipmentId);
      if (error) throw error;
      setShipments(prev => prev.filter(s => s.id !== shipmentId));
      await purgeCollectionsForShipments([shipmentId]);
    } catch (e) {
      alert('Error al borrar el envío');
      console.error(e);
    }
  }

  const handleDeleteMultipleShipments = async (shipmentIds) => {
    try {
      const { error } = await supabase.from('shipments').delete().in('id', shipmentIds);
      if (error) throw error;
      setShipments(prev => prev.filter(s => !shipmentIds.includes(s.id)));
      await purgeCollectionsForShipments(shipmentIds);
    } catch (e) {
      alert('Error al borrar los envíos');
      console.error(e);
    }
  }

  const handleUpdateMultipleShipments = async (updatesArray) => {
    // updatesArray format: [{ id: 'TR-1', updates: { budgetLiquidated: true } }, ...]
    if (!updatesArray || updatesArray.length === 0) return true;

    // 1. Prepare local optimistic update and Supabase payloads
    const supabasePayloads = [];
    const localUpdatesMap = new Map();

    updatesArray.forEach(({ id, updates }) => {
      const currentShipment = shipmentsRef.current.find(s => s.id === id);
      if (currentShipment) {
        const mergedData = { ...currentShipment, ...updates };
        localUpdatesMap.set(id, mergedData);
        supabasePayloads.push({
          id,
          status: mergedData.status,
          assignedDriverId: mergedData.assignedDriverId,
          data: mergedData
        });
      }
    });

    if (supabasePayloads.length === 0) return true;

    // 2. Optimistic local update
    setShipments(prev => prev.map(s => localUpdatesMap.has(s.id) ? localUpdatesMap.get(s.id) : s));

    // --- OFFLINE or FAIL: enqueue for retry (p.ej. liquidación de presupuestos) ---
    const enqueueBulkOp = async () => {
      const opId = `bulkUpdateShipments_${Date.now()}`;
      const qLen = await enqueue({ id: opId, type: 'bulkUpdateShipments', payloads: supabasePayloads, queuedAt: new Date().toISOString() });
      setPendingQueueCount(qLen);
      console.log(`[Queue] Enqueued bulkUpdateShipments (${supabasePayloads.length} envíos)`);
    };

    if (!navigator.onLine) {
      await enqueueBulkOp();
      return true; // Ya aplicado en local, se sincroniza al recuperar cobertura
    }

    try {
      const { error } = await supabase.from('shipments').upsert(supabasePayloads);
      if (error) {
        console.warn("[Queue] Bulk update failed, enqueuing for retry:", error);
        await enqueueBulkOp();
      }
    } catch (err) {
      console.warn("[Queue] Network error on bulk update, enqueuing for retry:", err);
      await enqueueBulkOp();
    }
    return true;
  }

  const handleShipmentStatusChange = async (shipmentId, newStatus, deliveryCoordinates = null, comment = null, photo = null, proof = null, extraData = {}, pendingUploads = {}) => {
    // 1. Encontrar el envío original en el estado local (usando REF para evitar cierres obsoletos)
    const s = shipmentsRef.current.find(item => item.id === shipmentId);
    if (!s) {
        console.error("handleShipmentStatusChange: Shipment not found in ref", shipmentId);
        return;
    }

    // Foto de incidencia: se sube a Storage igual que las pruebas de entrega (firma,
    // foto de sello...) para guardar solo la URL. Antes se guardaba el base64 crudo
    // directo en la fila del envío, engordando la carga de `shipments` para todo el
    // mundo cada vez que había una incidencia con foto.
    let finalPhoto = photo;
    let incidentPendingUpload = {};
    if (newStatus === 'Incidencia' && photo) {
      if (navigator.onLine) {
        try {
          finalPhoto = await uploadProof(shipmentId, photo, 'incident_photos');
        } catch (e) {
          console.warn('[Incidencia] No se pudo subir la foto, se guarda localmente:', e);
          finalPhoto = photo; // Fallback: mejor guardarla en base64 que perderla
        }
      } else {
        // Sin cobertura: se ve ya en pantalla como base64, y se sube de verdad al
        // reconectar (mismo mecanismo que signatureData/photoData de una entrega).
        incidentPendingUpload = { incidentPhotoData: photo };
      }
    }

    // ============================================================
    // MODO PRUEBAS SANDBOX: Si el conductor que opera está en modo
    // prueba, solo actualizamos el estado local. NADA va a Supabase.
    // ============================================================
    const operatingDriverForCheck = driversRef.current.find(d => String(d.id) === String(s.assignedDriverId));
    if (operatingDriverForCheck?.isTestMode) {
      console.log('🛡️ [Modo Pruebas] Cambio de estado bloqueado — solo actualización local.');
      const shipmentModel = new Shipment({ ...s, ...extraData });
      shipmentModel.updateStatus(newStatus, comment, finalPhoto, proof);
      if (deliveryCoordinates) shipmentModel.deliveryCoordinates = deliveryCoordinates;
      const localUpdatedData = { ...s, ...shipmentModel.toJSON(), updatedAt: new Date().toISOString() };
      setShipments(prev => prev.map(item => item.id === shipmentId ? localUpdatedData : item));
      return; // 🛑 FIN — no se escribe nada a Supabase ni a clientes
    }
    // ============================================================

    // 2. Usar el modelo para procesar la lógica de negocio (status, comment, etc)
    // FUSIONAR extraData (flags de pago) ANTES de crear el modelo para que updateStatus use los valores actualizados
    const shipmentModel = new Shipment({ ...s, ...extraData });
    shipmentModel.updateStatus(newStatus, comment, finalPhoto, proof);
    if (deliveryCoordinates) shipmentModel.deliveryCoordinates = deliveryCoordinates;

    // 3. Obtener el objeto plano para guardar como JSONB en Supabase
    const updatedData = {
      ...s,
      ...shipmentModel.toJSON(),
      updatedAt: new Date().toISOString()
    };

    // Aseguramos que el ID y el Status de primer nivel de la tabla coincidan
    const finalStatus = shipmentModel.status;

    // Optimistic UI Update
    setShipments(prev => prev.map(item => item.id === shipmentId ? updatedData : item));

    const mergedPendingUploads = { ...pendingUploads, ...incidentPendingUpload };

    // --- OFFLINE: enqueue and skip Supabase ---
    if (!navigator.onLine) {
      const opId = `statusChange_${shipmentId}_${newStatus}`;
      const qLen = await enqueue({
        id: opId,
        type: 'statusChange',
        shipmentId,
        finalStatus,
        assignedDriverId: s.assignedDriverId,
        updatedData,
        pendingUploads: mergedPendingUploads, // base64 images to upload to Storage when back online
        queuedAt: new Date().toISOString()
      });
      setPendingQueueCount(qLen);
      console.log(`[Offline] Queued statusChange for ${shipmentId} -> ${finalStatus}`, mergedPendingUploads);
      return;
    }
    // ------------------------------------------

    // Helper: enqueue this status change for later retry
    const enqueueStatusOp = async () => {
      const opId = `statusChange_${shipmentId}_${newStatus}`;
      const qLen = await enqueue({
        id: opId,
        type: 'statusChange',
        shipmentId,
        finalStatus,
        assignedDriverId: s.assignedDriverId,
        updatedData,
        pendingUploads: mergedPendingUploads,
        queuedAt: new Date().toISOString()
      });
      setPendingQueueCount(qLen);
      console.log(`[Queue] Enqueued statusChange for ${shipmentId} -> ${finalStatus}`);
    };

    try {
      // 4. Actualización Atómica en Supabase
      const { data, error } = await supabase.from('shipments').update({ 
        status: finalStatus, 
        assignedDriverId: s.assignedDriverId,
        data: updatedData 
      }).eq('id', shipmentId).select();
      
      if (error) {
        // Supabase write failed — enqueue for retry, keep optimistic update
        console.warn(`[Queue] Supabase statusChange failed for ${shipmentId}, enqueuing:`, error);
        enqueueStatusOp();
        // Don't revert — the queue will sync it later
      } else if (!data || data.length === 0) {
        console.warn(`[Queue] No data returned for ${shipmentId}, enqueuing for retry`);
        enqueueStatusOp();
      } else {
        // 5. Sincronizar con el dato real de la base de datos
        setShipments(prev => prev.map(item => item.id === shipmentId ? { ...data[0].data, id: data[0].id } : item));

        // Actualizar posición del conductor con las coordenadas de entrega
        if (deliveryCoordinates && s.assignedDriverId) {
          const [lat, lng] = String(deliveryCoordinates).split(',').map(c => parseFloat(c.trim()));
          if (!isNaN(lat) && !isNaN(lng)) {
            const driver = driversRef.current.find(d => String(d.id) === String(s.assignedDriverId));
            if (driver) {
              const updatedDriverData = { 
                ...driver, 
                currentLat: lat, 
                currentLng: lng, 
                lastGpsUpdate: new Date().toISOString() 
              };
              await supabase.from('drivers').update({ data: updatedDriverData }).eq('id', s.assignedDriverId);
            }
          }
        }
      }
    } catch (e) { 
      // Network error — enqueue for retry, keep optimistic update
      console.warn(`[Queue] Network error on statusChange ${shipmentId}, enqueuing:`, e);
      enqueueStatusOp();
    }

    // Solo actualizamos clientes si el conductor NO está en modo prueba
    // (El guard al inicio de la función ya lo garantiza, pero lo dejamos explícito)
    if (newStatus === 'Entregado' || newStatus === 'Entrega aplazada' || newStatus === 'Pendiente Cobro') {
      const shipment = shipmentsRef.current.find(s => s.id === shipmentId);
      if (shipment && shipment.destinationName) {
        // Find existing client (destinatario) or branch
        const normDest = normalizeClientName(shipment.destinationName);
        let targetClient = null;
        let targetBranch = null;

        for (const c of clientsRef.current) {
            if (normalizeClientName(c.name) === normDest || normalizeClientName(c.legalName) === normDest) {
                targetClient = c;
                break;
            }
            if (c.branches && Array.isArray(c.branches)) {
                const b = c.branches.find(br => normalizeClientName(br.name) === normDest);
                if (b) {
                    targetClient = c;
                    targetBranch = b;
                    break;
                }
            }
        }

        if (targetClient) {
          // ONLY update coordinates if client/branch GPS is empty
          const finalCoords = deliveryCoordinates || shipment.destinationCoordinates;
          if (finalCoords) {
              if (targetBranch) {
                  if (!(targetBranch.coordinates && String(targetBranch.coordinates).trim().length > 0)) {
                      await handleUpdateClient(targetClient.id, { coordinates: finalCoords }, targetBranch.id);
                  }
              } else {
                  if (!(targetClient.coordinates && String(targetClient.coordinates).trim().length > 0)) {
                      await handleUpdateClient(targetClient.id, { coordinates: finalCoords, lastInteraction: new Date().toISOString().split('T')[0] });
                  }
              }
          }
        } else {
          // Create new client with coordinates
          const newClientData = {
            id: Date.now(),
            name: shipment.destinationName,
            legalName: '',
            address: shipment.destinationAddress || shipment.destination || '',
            city: shipment.destinationCity || '',
            zip: shipment.destinationZip || '',
            phone: shipment.phone || '',
            coordinates: deliveryCoordinates || shipment.destinationCoordinates || '',
            type: 'Destinatario',
            billingType: 'Clientes Habituales',
            status: 'pending',
            // Si el porte lo paga una agencia, el destinatario es suyo (ver agencyOwnership.js)
            ownerAgencyId: resolveOwnerAgencyId(shipment, clientsRef.current),
            createdFrom: 'Entrega',
            lastInteraction: new Date().toISOString().split('T')[0],
            isTest: false
          };
          await handleAddClient(newClientData);
        }
      }
    }
  };

  const handleResolveIncident = async (id) => {
    const s = shipments.find(item => item.id === id);
    if (!s) return;
    const updated = { ...s, incidentStatus: 'resolved' };
    try {
      const { data, error } = await supabase.from('shipments').update({ data: updated }).eq('id', id).select();
      if (error) throw error;
      setShipments(prev => prev.map(item => item.id === id ? { ...data[0].data, id: data[0].id } : item));
    } catch (e) { alert('Error al resolver incidencia'); console.error(e); }
  };

  const handleIncidentReply = async (id, reply) => {
    const s = shipmentsRef.current.find(item => item.id === id);
    if (!s) return;
    const updated = { ...s, incidentReply: reply };
    try {
      const { data, error } = await supabase.from('shipments').update({ data: updated }).eq('id', id).select();
      if (error) throw error;
      setShipments(prev => prev.map(item => item.id === id ? { ...data[0].data, id: data[0].id } : item));
    } catch (e) { alert('Error al añadir respuesta a incidencia'); console.error(e); }
  };

  const handleUpdateClient = async (clientId, updatedData, branchId = null) => {
    const c = clientsRef.current.find(item => item.id === clientId);
    if (!c) return;

    let updated = { ...c, lastInteraction: new Date().toISOString().split('T')[0] };

    if (branchId && c.branches) {
        const updatedBranches = c.branches.map(b => b.id === branchId ? { ...b, ...updatedData } : b);
        updated.branches = updatedBranches;
    } else {
        updated = { ...updated, ...updatedData };
    }

    // Optimistic update — este handler se usa mucho como efecto secundario silencioso
    // (aprendizaje de GPS/receptor en la entrega), así que nunca debe bloquear al
    // conductor con un alert ni perder el dato si falla la red.
    setClients(prev => prev.map(item => item.id === clientId ? updated : item));

    const enqueueClientOp = async () => {
      const qLen = await enqueue({ id: `updateClient_${clientId}`, type: 'updateClient', clientId, updatedData: updated, queuedAt: new Date().toISOString() });
      setPendingQueueCount(qLen);
      console.log(`[Queue] Enqueued updateClient for ${clientId}`);
    };

    if (!navigator.onLine) {
      await enqueueClientOp();
      return;
    }

    try {
      const { data, error } = await supabase.from('clients').update({ name: updated.name, data: updated }).eq('id', clientId).select();
      if (error) throw error;
      if (data && data[0]) setClients(prev => prev.map(item => item.id === clientId ? { ...data[0].data, id: data[0].id } : item));
    } catch (e) {
      console.warn(`[Queue] Error actualizando cliente ${clientId}, encolando para reintento:`, e);
      await enqueueClientOp();
    }
  }

  const getClientPrefix = (billingType) => {
    if (billingType === 'Presupuesto') return 'P-';
    if (billingType === 'Clientes Habituales') return 'CH-';
    return '';
  };

  const getNextClientNumber = (allClients, prefix) => {
    const usedNumbers = new Set();
    allClients.forEach(c => {
      const str = String(c.clientNumber || '').trim();
      if (prefix) {
        if (str.startsWith(prefix)) {
          const num = parseInt(str.substring(prefix.length), 10);
          if (!isNaN(num) && num > 0) usedNumbers.add(num);
        }
      } else {
        // Only accept pure numbers for normal sequence
        if (/^\d+$/.test(str)) {
          const num = parseInt(str, 10);
          if (!isNaN(num) && num > 0) usedNumbers.add(num);
        }
      }
    });
    let next = 1;
    while (usedNumbers.has(next)) {
      next++;
    }
    return `${prefix}${next}`;
  };

  const handleAddClient = async (newClient) => {
    // ── Anti-duplicados ──
    // Si ya existe un cliente con el mismo nombre (activo o pendiente de validar),
    // no crear otro. Evita duplicados cuando el conductor entrega varias veces
    // al mismo destinatario desconocido.
    const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
    const alreadyExists = (clientsRef.current || []).some(
      c => normalize(c.name) === normalize(newClient.name)
    );
    if (alreadyExists) {
      console.log(`[AddClient] Omitido duplicado: "${newClient.name}" ya existe en la BD.`);
      return;
    }

    const prefix = getClientPrefix(newClient.billingType);
    const nextNum = getNextClientNumber(clientsRef.current, prefix);
    const clientWithMeta = { 
        ...newClient, 
        id: newClient.id || Date.now(), 
        clientNumber: newClient.clientNumber || nextNum,
        lastInteraction: new Date().toISOString().split('T')[0] 
    };
    try {
      const { data, error } = await supabase.from('clients').insert([{ id: clientWithMeta.id, name: clientWithMeta.name, data: clientWithMeta }]).select();
      if (error) throw error;
      if (data && data[0]) setClients(prev => [...prev, { ...data[0].data, id: data[0].id }]);
      else setClients(prev => [...prev, clientWithMeta]);
    } catch (e) { alert('Error al guardar cliente'); console.error(e); }
  }

  const handleDeleteClient = async (clientId) => {
    if (!window.confirm("¿Estás seguro de que quieres eliminar este cliente permanentemente?")) return;
    try {
      const { error } = await supabase.from('clients').delete().eq('id', clientId);
      if (error) throw error;
      setClients(prev => prev.filter(c => c.id !== clientId));
    } catch (e) { alert('Error al borrar cliente'); console.error(e); }
  }

  const handleDeleteClients = async (clientIds) => {
    if (!clientIds || clientIds.length === 0) return;
    try {
      const { error } = await supabase.from('clients').delete().in('id', clientIds);
      if (error) throw error;
      setClients(prev => prev.filter(c => !clientIds.includes(c.id)));
    } catch (e) { alert('Error al borrar los clientes'); console.error(e); }
  }

  // ── Reparto de fichas entre bases de datos (propia / agencias) ──
  // Se usa desde el informe de reparto: mueve fichas en bloque sin tocar nada más.
  const handleAssignOwnerAgency = async (assignments) => {
    if (!assignments || assignments.length === 0) return { updated: 0, failed: 0 };
    const updatedClients = [];
    let failed = 0;

    for (const { clientId, agencyId } of assignments) {
      const current = clientsRef.current.find(c => String(c.id) === String(clientId));
      if (!current) { failed += 1; continue; }
      const updated = { ...current, ownerAgencyId: agencyId || null };
      try {
        const { error } = await supabase.from('clients').update({ data: updated }).eq('id', clientId);
        if (error) throw error;
        updatedClients.push(updated);
      } catch (e) {
        console.error(`[Reparto] No se pudo mover la ficha ${clientId}:`, e);
        failed += 1;
      }
    }

    if (updatedClients.length > 0) {
      const byId = new Map(updatedClients.map(c => [String(c.id), c]));
      setClients(prev => prev.map(c => byId.get(String(c.id)) || c));
    }
    return { updated: updatedClients.length, failed };
  };

  // ── Baja de una agencia: borra su base de datos, nunca la cartera propia ──
  const handleDeleteAgencyDatabase = async (agencyId) => {
    const toDelete = getClientsOwnedBy(agencyId, clientsRef.current).map(c => c.id);
    if (toDelete.length === 0) return { deleted: 0 };

    // Por lotes: un .in() con miles de ids revienta la URL de la petición.
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      const { error } = await supabase.from('clients').delete().in('id', chunk);
      if (error) throw error;
    }
    const deletedSet = new Set(toDelete.map(id => String(id)));
    setClients(prev => prev.filter(c => !deletedSet.has(String(c.id))));
    return { deleted: toDelete.length };
  };

  const handleImportClients = async (newClients) => {
    try {
      let currentClients = [...clientsRef.current];
      const clientsToInsert = newClients.map((c, index) => {
        const prefix = getClientPrefix(c.billingType);
        let assignedNum = c.clientNumber;
        if (!assignedNum || String(assignedNum).trim() === '') {
          assignedNum = getNextClientNumber(currentClients, prefix);
        }
        
        const clientData = { 
            ...c, 
            id: c.id || Date.now() + index, 
            clientNumber: assignedNum,
            lastInteraction: new Date().toISOString().split('T')[0] 
        };
        currentClients.push(clientData); // Add for next iterations

        return {
          id: clientData.id,
          name: clientData.name,
          data: clientData
        };
      });
      const { data, error } = await supabase.from('clients').insert(clientsToInsert).select();
      if (error) throw error;
      setClients(prev => [...prev, ...data.map(c => ({ ...c.data, id: c.id }))]);
      alert('Clientes importados con éxito!');
    } catch (e) {
      alert('Error al importar clientes.');
      console.error(e);
    }
  }

  const handleAddArticle = async (newArticle) => {
    try {
      const articleWithId = { ...newArticle, id: newArticle.id || Date.now() + Math.floor(Math.random() * 1000) };
      const { data, error } = await supabase.from('articles').insert([{ 
        id: articleWithId.id, 
        data: articleWithId 
      }]).select();
      if (error) throw error;
      setArticles(prev => [...prev, { ...data[0].data, id: data[0].id }]);
      return true;
    } catch (e) { 
      alert('Error al guardar artículo'); 
      console.error(e); 
      return false;
    }
  }

  const handleImportArticles = async (newArticles) => {
    try {
      const articlesToInsert = newArticles.map((a, index) => ({
        id: a.id || Date.now() + index,
        data: { ...a, id: a.id || Date.now() + index, lastInteraction: new Date().toISOString() }
      }));
      
      const { data, error } = await supabase.from('articles').insert(articlesToInsert).select();
      if (error) throw error;
      
      setArticles(prev => [...prev, ...data.map(a => ({ ...a.data, id: a.id }))]);
      return true;
    } catch (e) {
      alert('Error al importar artículos.');
      console.error(e);
      return false;
    }
  }

  const handleUpdateArticle = async (id, updatedData) => {
    try {
      const { data, error } = await supabase.from('articles').update({ data: updatedData }).eq('id', id).select();
      if (error) throw error;
      setArticles(prev => prev.map(a => a.id === id ? { ...data[0].data, id: data[0].id } : a));
    } catch (e) { alert('Error al actualizar artículo'); console.error(e); }
  }

  const handleDeleteArticle = async (id) => {
    try {
      if (!window.confirm('¿Estás seguro de que quieres eliminar este artículo?')) return;
      const { error } = await supabase.from('articles').delete().eq('id', id);
      if (error) throw error;
      setArticles(prev => prev.filter(a => a.id !== id));
    } catch (e) {
      alert('Error al borrar artículo');
      console.error(e);
    }
  }

  const handleRenameCategory = async (oldName, newName) => {
    if (!newName || oldName === newName) return;
    
    try {
      // 1. Update all articles with this category in Supabase
      const articlesToUpdate = articles.filter(a => a.category === oldName);
      if (articlesToUpdate.length > 0) {
        const updatePromises = articlesToUpdate.map(article => {
          const updatedArticle = { ...article, category: newName };
          return supabase.from('articles').update({ data: updatedArticle }).eq('id', article.id);
        });
        await Promise.all(updatePromises);
      }

      // 2. Update local state
      setArticles(prev => prev.map(a => a.category === oldName ? { ...a, category: newName } : a));

      // 3. Update familyOrder if it exists
      if (familyOrder.includes(oldName)) {
        const newOrder = familyOrder.map(f => f === oldName ? newName : f);
        handleUpdateFamilyOrder(newOrder);
      }
      
      alert(`Familia "${oldName}" renombrada a "${newName}" con éxito.`);
    } catch (e) {
      alert('Error al renombrar la familia.');
      console.error(e);
    }
  }

  const handleDeleteAllArticles = async () => {
    try {
      if (!window.confirm('¿ESTÁS TOTALMENTE SEGURO? Esta acción borrará TODO el catálogo de artículos y servicios. No se puede deshacer.')) return;
      
      const { error } = await supabase.from('articles').delete().gt('id', 0); // Delete all
      if (error) throw error;
      
      setArticles([]);
      alert('Catálogo vaciado con éxito.');
    } catch (e) {
      alert('Error al vaciar el catálogo.');
      console.error(e);
    }
  }

  // Lifted state for tariffs (Dynamic Pricing)
  const [tariffs, setTariffs] = useState([])

  const handleAddTariff = async (newTariff) => {
    try {
      const tariffWithId = { ...newTariff, id: newTariff.id || Date.now() };
      const { data, error } = await supabase.from('tariffs').insert([{ id: tariffWithId.id, data: tariffWithId }]).select();
      if (error) throw error;
      setTariffs(prev => [...prev, { ...data[0].data, id: data[0].id }]);
    } catch (e) { alert('Error al guardar tarifa'); console.error(e); }
  }

  const handleUpdateTariff = async (id, updatedData) => {
    try {
      const { data, error } = await supabase.from('tariffs').update({ data: updatedData }).eq('id', id).select();
      if (error) throw error;
      setTariffs(prev => prev.map(t => t.id === id ? { ...data[0].data, id: data[0].id } : t));
    } catch (e) { alert('Error al actualizar tarifa'); console.error(e); }
  }

  const handleDeleteTariff = async (id) => {
    try {
      const { error } = await supabase.from('tariffs').delete().eq('id', id);
      if (error) throw error;
      setTariffs(prev => prev.filter(t => t.id !== id));
    } catch (e) { alert('Error al borrar tarifa'); console.error(e); }
  }

  const handleImportTariffs = async (newTariffs) => {
    try {
      const timestamp = Date.now();
      const tariffsToInsert = newTariffs.map((t, index) => {
        const id = t.id || (timestamp + index);
        const data = { ...t, id };
        return { id, data };
      });
      
      const { data, error } = await supabase.from('tariffs').insert(tariffsToInsert).select();
      if (error) throw error;
      
      setTariffs(prev => [...prev, ...data.map(t => ({ ...t.data, id: t.id }))]);
      return true;
    } catch (e) {
      alert('Error al importar tarifas.');
      console.error(e);
      return false;
    }
  }

  const handleAddCoverageZone = async (newZone) => {
    try {
      const zoneWithId = { ...newZone, id: newZone.id || Date.now() };
      const { data, error } = await supabase.from('coverage_zones').insert([{ id: zoneWithId.id, data: zoneWithId }]).select();
      if (error) throw error;
      setCoverageZones(prev => [...prev, { ...data[0].data, id: data[0].id }]);
    } catch (e) { alert('Error al guardar zona de cobertura'); console.error(e); }
  }

  const handleUpdateCoverageZone = async (id, updatedData) => {
    try {
      const { error } = await supabase.from('coverage_zones').update({ data: updatedData }).eq('id', id);
      if (error) throw error;
      setCoverageZones(prev => prev.map(z => z.id === id ? { ...updatedData, id } : z));
      return true;
    } catch (e) {
      console.error(e);
      alert('Error al actualizar zona de cobertura.');
      return false;
    }
  };

  const handleImportCoverageZones = async (zones) => {
    try {
      const timestamp = Date.now();
      const zonesToInsert = zones.map((z, index) => {
        const id = z.id || (timestamp + index);
        const data = { ...z, id };
        return { id, data };
      });
      
      const { data, error } = await supabase.from('coverage_zones').insert(zonesToInsert).select();
      if (error) throw error;
      
      setCoverageZones(prev => [...prev, ...data.map(z => ({ ...z.data, id: z.id }))]);
      return true;
    } catch (e) {
      alert('Error al importar zonas de cobertura.');
      console.error(e);
      return false;
    }
  }

  const handleDeleteCoverageZone = async (id) => {
    try {
      const { error } = await supabase.from('coverage_zones').delete().eq('id', id);
      if (error) throw error;
      setCoverageZones(prev => prev.filter(z => z.id !== id));
    } catch (e) { alert('Error al borrar zona de cobertura'); console.error(e); }
  }

  const handleNormalizeAllClients = async () => {
    if (!window.confirm('¿Deseas normalizar las ciudades de todos los clientes? Esto cambiará nombres como "MONTALBAN" por "Montalbán de Córdoba" si se encuentra una coincidencia en tu lista de bultos.')) return;
    
    try {
      let updatedCount = 0;
      const zones = coverageZones || [];
      const updatedClients = [...clients];

      for (let i = 0; i < updatedClients.length; i++) {
        const client = updatedClients[i];
        const clientCityNorm = normalizeText(client.city);
        if (!clientCityNorm) continue;

        const match = zones.find(z => normalizeText(z.name) === clientCityNorm);
        
        if (match && match.name !== client.city) {
          const { error } = await supabase.from('clients').update({ city: match.name }).eq('id', client.id);
          if (error) throw error;
          updatedClients[i] = { ...client, city: match.name };
          updatedCount++;
        }
      }

      setClients(updatedClients);
      alert(`Limpieza completada: Se han corregido ${updatedCount} clientes.`);
      return true;
    } catch (e) {
      alert('Error durante la normalización de clientes.');
      console.error(e);
      return false;
    }
  }

  const handleAddFuelLog = async (log) => {
    const logWithId = { ...log, id: log.id || Date.now() };
    try {
       const { data, error } = await supabase.from('fuel_logs').insert([{ id: logWithId.id, data: logWithId }]).select();
       if (error) throw error;
       setFuelLogs(prev => [...prev, { ...data[0].data, id: data[0].id }]);
    } catch (e) { alert('Error al guardar combustible'); console.error(e); }
  }

  const handleUpdateDefaultCodFee = async (newFee) => {
    try {
      const { error } = await supabase.from('settings').upsert({ key: 'defaultCodFee', value: newFee });
      if (error) throw error;
      setDefaultCodFee(newFee);
    } catch (e) {
      alert('Error al actualizar la tarifa COD por defecto.');
      console.error(e);
    }
  }

  const handleValidateClient = async (clientId, approved) => {
    if (approved) {
      const client = clients.find(c => c.id === clientId);
      console.log('[Validar] Cliente encontrado:', client?.name, '| billingType:', client?.billingType, '| clientNumber:', client?.clientNumber);
      const updateData = { status: 'approved' };
      if (client && !client.clientNumber) {
        // Fallback: si billingType no está definido, usar 'Clientes Habituales' por defecto
        const billing = client.billingType || 'Clientes Habituales';
        const prefix = getClientPrefix(billing);
        const nextNum = getNextClientNumber(clientsRef.current, prefix);
        updateData.clientNumber = nextNum;
        console.log('[Validar] Asignando número:', nextNum, '| prefix:', prefix, '| billing:', billing);
      }
      await handleUpdateClient(clientId, updateData);
      console.log('[Validar] Cliente aprobado y guardado:', clientId, updateData);
    } else {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', clientId);
        if (error) throw error;
        setClients(prev => prev.filter(c => c.id !== clientId));
      } catch (e) { alert('Error al rechazar cliente'); console.error(e); }
    }
  }

  // --- NUEVOS ESTADOS PARA COPIA DE SEGURIDAD (Movid@s tras TODAS las declaraciones de estado) ---
  const [backupDirHandle, setBackupDirHandle] = useState(null)
  // autoBackupInterval y lastBackupTime son preferencias LOCALES de UI → sí usan localStorage
  const [autoBackupInterval, setAutoBackupInterval] = usePersistentState('autoBackupInterval', '0') // '0' = desactivado
  const [lastBackupTime, setLastBackupTime] = usePersistentState('lastBackupTime', null)
  const [backupStatus, setBackupStatus] = useState('idle') // 'idle', 'success', 'error'

  const [showRestoreModal, setShowRestoreModal] = useState(false)
  const [pendingRestoreData, setPendingRestoreData] = useState(null)
  const [restoreOptions, setRestoreOptions] = useState({ drivers: true, shipments: false, clients: true, articles: true, tariffs: true, vehicles: true, fuelLogs: true })

  // Persistir handle de carpeta en IndexedDB (necesario ya que localStorage no admite objetos complejos como Handles)
  useEffect(() => {
    async function loadHandle() {
      try {
        const db = await openDB();
        const handle = await getVal(db, 'backupDirHandle');
        if (handle) setBackupDirHandle(handle);
      } catch (err) { console.error("Error cargando carpeta de backup:", err); }
    }
    loadHandle();
  }, []);

  const openDB = () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('LogisticaBackupDB', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  const setVal = (db, key, val) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put(val, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  };

  const getVal = (db, key) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  };

  const handleSelectBackupDir = async () => {
    try {
      const handle = await window.showDirectoryPicker();
      setBackupDirHandle(handle);
      const db = await openDB();
      await setVal(db, 'backupDirHandle', handle);
      alert('Carpeta de copias de seguridad seleccionada correctamente.');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error(err);
        alert('Error al seleccionar la carpeta. Asegúrate de usar un navegador compatible (Chrome/Edge).');
      }
    }
  };

  const executeBackup = useCallback(async (isAuto = false) => {
    if (!backupDirHandle) {
      if (!isAuto) alert('Primero debes seleccionar una carpeta de destino en Ajustes.');
      return;
    }

    try {
      // Verificar permisos (el navegador suele pedirlos tras recargar)
      const options = { mode: 'readwrite' };
      if ((await backupDirHandle.queryPermission(options)) !== 'granted') {
        if ((await backupDirHandle.requestPermission(options)) !== 'granted') {
          throw new Error('Permiso denegado por el usuario');
        }
      }

      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      const timeStr = now.getHours().toString().padStart(2, '0') + '-' + now.getMinutes().toString().padStart(2, '0');
      const fileName = `copia_logistica_${dateStr}_${timeStr}.json`;

      const fileHandle = await backupDirHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      
      const data = { 
        drivers, shipments, clients, articles, tariffs, vehicles, fuelLogs, defaultCodFee, familyOrder,
        // Configuración operativa (antes no se incluía)
        routes,
        routeKnowledge,
        coverageZones,
        gpsIntervalMinutes,
        driverAlerts,
        backupInfo: { timestamp: now.toISOString(), type: isAuto ? 'auto' : 'manual' }
      };

      await writable.write(JSON.stringify(data, null, 2));
      await writable.close();

      setLastBackupTime(now.toISOString());
      setBackupStatus('success');
      setTimeout(() => setBackupStatus('idle'), 3000);
      
      if (!isAuto) console.log(`Copia guardada: ${fileName}`);
    } catch (err) {
      console.error("Error en backup:", err);
      setBackupStatus('error');
      setTimeout(() => setBackupStatus('idle'), 3000);
      if (!isAuto) alert('Error al guardar la copia: ' + err.message);
    }
  }, [backupDirHandle, drivers, shipments, clients, articles, tariffs, vehicles, fuelLogs, defaultCodFee, familyOrder, routes, routeKnowledge, coverageZones, gpsIntervalMinutes, driverAlerts]);

  // Temporizador de Auto-guardado (Intervalos)
  useEffect(() => {
    if (!backupDirHandle || ['0', 'open', 'close', 'both'].includes(autoBackupInterval)) return;

    const intervalMs = parseInt(autoBackupInterval) * 60 * 1000;
    const timer = setInterval(() => {
      console.log("Iniciando auto-guardado programado...");
      executeBackup(true);
    }, intervalMs);

    return () => clearInterval(timer);
  }, [autoBackupInterval, backupDirHandle, executeBackup]);

  // Auto-guardado al entrar (Al cargar el handle)
  useEffect(() => {
    if ((autoBackupInterval === 'open' || autoBackupInterval === 'both') && backupDirHandle) {
      executeBackup(true);
    }
  }, [backupDirHandle]); // Solo una vez cuando el handle esté listo

  // Auto-guardado al cerrar (Aviso: Best-effort)
  useEffect(() => {
    if (!['close', 'both'].includes(autoBackupInterval) || !backupDirHandle) return;

    const handleBeforeUnload = () => {
      // Intentamos disparar el backup. 
      // Al ser asíncrono, los navegadores pueden interrumpirlo, pero es lo máximo posible.
      executeBackup(true);
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [autoBackupInterval, backupDirHandle, executeBackup]);


  // Count pending items for badges
  const pendingClientsCount = visibleClients.filter(c => c.status === 'pending').length;
  const pendingIncidentsCount = shipments.filter(s => s.incidentStatus === 'active' || s.status === 'Incidencia').length;
  const irregularCount = visibleShipments.filter(s => getIrregularReasons(s).length > 0).length;

  const handleConfirmRestore = async () => {
    if (!pendingRestoreData) return;
    
    try {
      const data = pendingRestoreData;
      const upsertPromises = [];

      if (restoreOptions.drivers && data.drivers) {
        upsertPromises.push(supabase.from('drivers').upsert(data.drivers.map(d => ({ id: d.id, username: d.username, password: d.password, data: d }))));
      }
      if (restoreOptions.shipments && data.shipments) {
        upsertPromises.push(supabase.from('shipments').upsert(data.shipments.map(s => ({ id: s.id, status: s.status, assignedDriverId: s.assignedDriverId, data: s }))));
      }
      if (restoreOptions.clients && data.clients) {
        upsertPromises.push(supabase.from('clients').upsert(data.clients.map(c => ({ id: c.id, name: c.name, data: c }))));
      }
      if (restoreOptions.articles && data.articles) {
        upsertPromises.push(supabase.from('articles').upsert(data.articles.map(a => ({ id: a.id, data: a }))));
      }
      if (restoreOptions.tariffs) {
        if (data.tariffs) upsertPromises.push(supabase.from('tariffs').upsert(data.tariffs.map(t => ({ id: t.id, data: t }))));
        if (data.defaultCodFee) upsertPromises.push(supabase.from('settings').upsert({ key: 'defaultCodFee', value: data.defaultCodFee }));
        if (data.familyOrder) upsertPromises.push(supabase.from('settings').upsert({ key: 'familyOrder', value: JSON.stringify(data.familyOrder) }));
      }
      if (restoreOptions.vehicles && data.vehicles) {
        upsertPromises.push(supabase.from('vehicles').upsert(data.vehicles.map(v => ({ id: v.id, data: v }))));
      }
      // Configuración operativa
      if (data.routes)           upsertPromises.push(supabase.from('settings').upsert({ key: 'routes',               value: JSON.stringify(data.routes) }));
      if (data.routeKnowledge)   upsertPromises.push(supabase.from('settings').upsert({ key: 'route_knowledge',      value: JSON.stringify(data.routeKnowledge) }));
      if (data.coverageZones)    upsertPromises.push(supabase.from('settings').upsert({ key: 'coverageZones',        value: JSON.stringify(data.coverageZones) }));
      if (data.gpsIntervalMinutes !== undefined) upsertPromises.push(supabase.from('settings').upsert({ key: 'gpsIntervalMinutes', value: String(data.gpsIntervalMinutes) }));
      if (data.driverAlerts)     upsertPromises.push(supabase.from('settings').upsert({ key: 'driverAlerts',         value: JSON.stringify(data.driverAlerts) }));
      if (restoreOptions.fuelLogs && data.fuelLogs) {
        upsertPromises.push(supabase.from('fuel_logs').upsert(data.fuelLogs.map(f => ({ id: f.id, data: f }))));
      }

      await Promise.all(upsertPromises);
      alert('¡Datos seleccionados restaurados y sincronizados con éxito!');
      window.location.reload(); 
    } catch (err) {
      alert('Error crítico durante la restauración en Supabase.');
      console.error(err);
    }
  };

  // --- CRITICAL CONFIGURATION CHECK ---
  const isMissingSupabaseKeys = !import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (isMissingSupabaseKeys) {
    return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 p-6 text-center">
        <div className="max-w-md bg-amber-50 border border-amber-200 p-8 rounded-xl shadow-lg animate-in fade-in zoom-in duration-300">
          <Shield className="w-16 h-16 text-amber-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-amber-800 mb-2">⚠️ Configuración de Vercel Incompleta</h1>
          <p className="text-amber-700 mb-6 font-medium">
            La aplicación no puede conectar con la base de datos porque las "llaves" de Supabase no están configuradas en el panel de Vercel.
          </p>
          <div className="text-left space-y-4 bg-white p-5 rounded-lg border border-amber-100 text-sm shadow-inner overflow-hidden">
            <p className="font-semibold text-amber-900">Pasos para solucionar:</p>
            <ol className="list-decimal list-inside space-y-2 text-slate-600">
              <li>Ve al panel de <strong>Vercel &gt; Settings &gt; Environment Variables</strong>.</li>
              <li>Añade <span className="bg-slate-100 px-1 rounded font-mono">VITE_SUPABASE_URL</span></li>
              <li>Añade <span className="bg-slate-100 px-1 rounded font-mono">VITE_SUPABASE_ANON_KEY</span></li>
            </ol>
            <p className="text-xs text-amber-600 italic">No olvides marcar 'Production' y darle a 'Save'.</p>
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="mt-8 w-full bg-amber-600 text-white font-bold py-3 rounded-xl hover:bg-amber-700 transition-all shadow-md active:scale-95"
          >
            Ya las he puesto, Recargar Página
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
    // return <div className="p-10 text-2xl font-bold text-center">LOGIN PLACEHOLDER - Si ves esto, Login.jsx es el problema</div>

  }

  const handleImpersonate = (driverId) => {
    setIsAuthenticated(true)
    setUserRole('driver')
    setCurrentDriverId(driverId)
  }

  // Client View
  if (userRole === 'client') {
    return <ClientDashboard 
        client={clients.find(c => c.id === currentClientId)}
        onLogout={handleLogout}
        allShipments={shipments}
        drivers={drivers}
        allClients={clients}
        articles={articles}
        tariffs={tariffs}
        coverageZones={coverageZones}
        onCreateShipment={handleAddShipment}
        onUpdateClient={handleUpdateClient}
        onDeleteShipment={handleDeleteShipment}
        pendingQueueCount={pendingQueueCount}
        isSyncingQueue={isSyncingQueue}
    />
  }

  // Driver View
  if (userRole === 'driver') {
    return <DriverDashboard
      onLogout={handleLogout}
      allShipments={shipments}
      currentDriverId={currentDriverId}
      routes={routes}
      routeKnowledge={routeKnowledge}
      onUpdateRouteKnowledge={handleUpdateRouteKnowledge}
      onAssignShipment={handleAssignDriver}
      drivers={drivers}
      clients={clients}
      allPoblaciones={allPoblaciones}
      onCreateShipment={handleAddShipment}
      onStatusChange={handleShipmentStatusChange}
      onUpdateShipment={handleUpdateShipment}
      onUpdateClient={handleUpdateClient}
      onAddClient={handleAddClient}
      tariffs={tariffs}
      articles={articles}
      familyOrder={familyOrder}
      coverageZones={coverageZones}
      defaultCodFee={defaultCodFee}
      gpsIntervalMinutes={gpsIntervalMinutes}
      driverAlerts={driverAlerts}
      alertAcknowledgements={alertAcknowledgements}
      isInitialLoading={isSyncing}
      driverNamePreference={driverNamePreference}
      isTestMode={activeTestMode}
      cachedDriverName={cachedDriverName}
    />
  }

  // Admin View (Default)
  return (
  <Layout
      onLogout={handleLogout}
      currentView={currentView}
      onNavigate={setCurrentView}
      pendingClientsCount={pendingClientsCount} 
      pendingIncidentsCount={visibleShipments.filter(s => s.incidentStatus === 'active' || s.status === 'Incidencia').length}
      irregularCount={irregularCount}
      shipments={visibleShipments}
      vehicles={vehicles}
      onSecretUnlock={handleSecretUnlock}
      isTestMode={activeTestMode}
      onResetToZero={handleResetToZero}
      isOnline={isOnline}
      justReconnected={justReconnected}
      pendingQueueCount={pendingQueueCount}
      isSyncingQueue={isSyncingQueue}
    >
                {currentView === 'dashboard' && (
                    <div className="animate-in fade-in duration-500">
                        <Dashboard onSync={handleSyncLocalToCloud} isSyncing={isSyncing} shipments={visibleShipments} clients={clients} vehicles={vehicles} isGhostModeUnlocked={isGhostModeUnlocked} onNavigate={(view, statusFilter) => { setShipmentStatusFilter(statusFilter || null); setCurrentView(view); }} />
                    </div>
                )}
      {currentView === 'pending-collections' && <PendingCollections shipments={visibleShipments} drivers={drivers} clients={visibleClients} onAssignDriver={handleAssignDriver} onUpdateShipment={handleUpdateShipment} driverNamePreference={driverNamePreference} />}
      {currentView === 'shipments' && <Shipments shipments={visibleShipments} allShipments={shipments} drivers={drivers} clients={visibleClients} allPoblaciones={allPoblaciones} tariffs={tariffs} onAssignDriver={handleAssignDriver} onCreateShipment={handleAddShipment} onAddClient={handleAddClient} onUpdateClient={handleUpdateClient} onUpdateShipment={handleUpdateShipment} onUpdateMultipleShipments={handleUpdateMultipleShipments} onDeleteShipment={handleDeleteShipment} onDeleteMultipleShipments={handleDeleteMultipleShipments} articles={articles} defaultCodFee={defaultCodFee} familyOrder={familyOrder} isGhostModeUnlocked={isGhostModeUnlocked} coverageZones={coverageZones} initialStatusFilter={shipmentStatusFilter} onClearStatusFilter={() => setShipmentStatusFilter(null)} driverNamePreference={driverNamePreference} />}
      {currentView === 'fleet' && <Fleet vehicles={vehicles} drivers={drivers} onAddVehicle={handleAddVehicle} onUpdateVehicle={handleUpdateVehicle} onDeleteVehicle={handleDeleteVehicle} />}
      {currentView === 'maintenance-history' && <MaintenanceHistory vehicles={vehicles} onUpdateVehicle={handleUpdateVehicle} onNavigateToFleet={() => setCurrentView('fleet')} />}
      {currentView === 'fuel' && <FuelManagement fuelLogs={fuelLogs} onAddFuelLog={handleAddFuelLog} drivers={drivers} shipments={visibleShipments} />}
      {currentView === 'drivers' && <Drivers routes={routes} onUpdateRoutes={handleUpdateRoutes} routeKnowledge={routeKnowledge} onUpdateRouteKnowledge={handleUpdateRouteKnowledge} drivers={drivers} shipments={visibleShipments} clients={visibleClients} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} articles={articles} defaultCodFee={defaultCodFee} isGhostModeUnlocked={isGhostModeUnlocked} driverOrder={driverOrder} onUpdateDriverOrder={handleUpdateDriverOrder} gpsIntervalMinutes={gpsIntervalMinutes} setGpsIntervalMinutes={setGpsIntervalMinutes} driverAlerts={driverAlerts} setDriverAlerts={setDriverAlerts} driverNamePreference={driverNamePreference} onUpdateDriverNamePreference={handleUpdateDriverNamePreference} />}
      {currentView === 'tracking' && <Tracking drivers={drivers} shipments={shipments} onRequestGps={handleRequestDriverGps} />}

      {currentView === 'clients' && <Clients clients={visibleClients} allClients={clients} shipments={shipments} allPoblaciones={allPoblaciones} articles={articles} onUpdateClient={handleUpdateClient} onAddClient={handleAddClient} onImportClients={handleImportClients} onDeleteClient={handleDeleteClient} onAssignOwnerAgency={handleAssignOwnerAgency} onDeleteAgencyDatabase={handleDeleteAgencyDatabase} tariffs={tariffs} isGhostModeUnlocked={isGhostModeUnlocked} />}
      {currentView === 'articles' && <Articles 
        articles={articles} 
        tariffs={tariffs} 
        coverageZones={coverageZones} 
        onAddCoverageZone={handleAddCoverageZone} 
        onUpdateCoverageZone={handleUpdateCoverageZone}
        onImportCoverageZones={handleImportCoverageZones} 
        onDeleteCoverageZone={handleDeleteCoverageZone} 
        onNormalizeClients={handleNormalizeAllClients}
        onAddArticle={handleAddArticle} 
        onUpdateArticle={handleUpdateArticle} 
        onDeleteArticle={handleDeleteArticle} 
        onDeleteAllArticles={handleDeleteAllArticles} 
        onImportArticles={handleImportArticles} 
        onAddTariff={handleAddTariff} 
        onUpdateTariff={handleUpdateTariff} 
        onDeleteTariff={handleDeleteTariff} 
        onImportTariffs={handleImportTariffs} 
        defaultCodFee={defaultCodFee} 
        onUpdateDefaultCodFee={handleUpdateDefaultCodFee} 
        familyOrder={familyOrder} 
        onUpdateFamilyOrder={handleUpdateFamilyOrder} 
        onRenameCategory={handleRenameCategory} 
      />}
      {currentView === 'incidents' && <Incidents shipments={visibleShipments} onUpdateStatus={handleShipmentStatusChange} onResolve={handleResolveIncident} onReply={handleIncidentReply} drivers={drivers} driverNamePreference={driverNamePreference} />}
      {currentView === 'notifications' && <NotificationCenter shipments={visibleShipments} drivers={drivers} clients={visibleClients} onUpdateShipment={handleUpdateShipment} articles={articles} tariffs={tariffs} defaultCodFee={defaultCodFee} familyOrder={familyOrder} coverageZones={coverageZones} />}
      {currentView === 'clientValidation' && <ClientValidation clients={clients} onValidateClient={handleValidateClient} onUpdateClient={handleUpdateClient} onDeleteClients={handleDeleteClients} articles={articles} tariffs={tariffs} allPoblaciones={allPoblaciones} />}
      {currentView === 'settings' && (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">

          {/* ══════ BACKUP & DATA (existing) ══════ */}
          <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                <Database size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800">Copia de Seguridad y Datos</h2>
                <p className="text-slate-500 text-sm">Gestiona el almacenamiento local y exporta tus datos.</p>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-8"> {/* NUEVA SECCIÓN DE COPIA AVANZADA */}
              <div className="md:col-span-2 space-y-4">
                <div className="flex flex-col md:flex-row gap-4">
                  {/* SELECT DIRECTORY */}
                  <div className="flex-1 bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 font-bold text-slate-700">
                        <Folder className="text-blue-600" size={20} />
                        Destino de Copias
                      </div>
                      {backupDirHandle ? (
                        <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">CONFIGURADO</span>
                      ) : (
                        <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">PENDIENTE</span>
                      )}
                    </div>
                    
                    <div className="text-xs text-slate-500 bg-white p-3 rounded-lg border border-slate-100 min-h-[40px] flex items-center italic">
                      {backupDirHandle ? `Carpeta: ${backupDirHandle.name}` : 'Ninguna carpeta seleccionada. Las copias se pedirán descargar manualmente.'}
                    </div>

                    <div className="flex gap-2">
                       <button
                        onClick={handleSelectBackupDir}
                        className="flex-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
                      >
                        <Settings size={18} />
                        Examinar...
                      </button>
                      <button
                        onClick={() => executeBackup()}
                        disabled={!backupDirHandle}
                        className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-95 ${
                          backupStatus === 'success' ? 'bg-emerald-500 text-white' : 
                          backupStatus === 'error' ? 'bg-red-500 text-white' :
                          'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:shadow-none'
                        }`}
                      >
                        {backupStatus === 'success' ? <CheckCircle size={18} /> : 
                         backupStatus === 'error' ? <AlertCircle size={18} /> : 
                         <Save size={18} />}
                        {backupStatus === 'success' ? '¡Guardado!' : 
                         backupStatus === 'error' ? 'Error' : 
                         'Guardar Ahora'}
                      </button>
                    </div>
                  </div>

                  {/* AUTO-BACKUP SETTINGS */}
                  <div className="flex-1 bg-slate-50 border border-slate-200 p-6 rounded-xl flex flex-col gap-4">
                    <div className="flex items-center gap-2 font-bold text-slate-700">
                      <Clock className="text-indigo-600" size={20} />
                      Auto-guardado
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Intervalo</label>
                      <select 
                        value={autoBackupInterval}
                        onChange={(e) => setAutoBackupInterval(e.target.value)}
                        className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                      >
                        <option value="0">Desactivado</option>
                        <option value="both">Al entrar y al cerrar</option>
                        <option value="open">Al entrar</option>
                        <option value="close">Al cerrar</option>
                        <option value="15">Cada 15 minutos</option>
                        <option value="60">Cada hora</option>
                        <option value="360">Cada 6 horas</option>
                        <option value="1440">Una vez al día</option>
                      </select>
                    </div>

                    <div className="mt-auto pt-2 flex items-center justify-between text-[10px] text-slate-400 font-bold uppercase">
                      <span>Última copia:</span>
                      <span className="text-slate-600">
                        {lastBackupTime ? new Date(lastBackupTime).toLocaleString() : 'Nunca'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* BOTÓN MANUAL CLÁSICO (Como apoyo) */}
                <button
                  onClick={() => {
                    if (backupDirHandle) {
                      executeBackup();
                    } else {
                      const data = { drivers, shipments, clients, articles, tariffs, vehicles, fuelLogs, defaultCodFee, familyOrder, routes, routeKnowledge, coverageZones, gpsIntervalMinutes, driverAlerts };
                      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `copia_sin_carpeta_logistica_${new Date().toISOString().split('T')[0]}.json`;
                      document.body.appendChild(a);
                      a.click();
                      document.body.removeChild(a);
                    }
                  }}
                  className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200"
                >
                  <Download size={14} />
                  Descargar Copia Manual
                </button>
              </div>
            </div>

            <div className="mt-8 grid grid-cols-1 gap-4">
              {/* IMPORT */}
              <div className="relative group">
                <input
                  type="file"
                  accept=".json"
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                      try {
                        const data = JSON.parse(event.target.result);
                        setPendingRestoreData(data);
                        setShowRestoreModal(true);
                      } catch (err) {
                        alert('Error: Archivo dañado o no es un JSON válido de Sumtrans.');
                        console.error(err);
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = ''; // Reset file input
                  }}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />
                <div className="flex flex-col items-center justify-center gap-3 p-8 bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl group-hover:bg-emerald-50 group-hover:border-emerald-200 group-hover:text-emerald-700 transition-all h-full">
                  <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                    <Upload size={32} className="text-slate-400 group-hover:text-emerald-600" />
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-lg">Restaurar Copia</div>
                    <div className="text-xs text-slate-500 mt-1">Subir archivo .json</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ADMIN PASSWORD MANAGEMENT */}
            <div className="mt-8 pt-8 border-t border-slate-100">
               <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2 mb-4">
                 <Shield size={18} className="text-blue-600" />
                 Acceso de Gestión (Administrador)
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Usuario / Email Administrador</label>
                      <input 
                        type="text" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        value={adminCreds.user}
                        onChange={(e) => setAdminCreds(prev => ({ ...prev, user: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Nueva Contraseña Administración</label>
                      <input 
                        type="password" 
                        className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
                        value={adminCreds.pass}
                        onChange={(e) => setAdminCreds(prev => ({ ...prev, pass: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <button
                      onClick={async () => {
                        try {
                          await supabase.from('settings').upsert([
                            { key: 'admin_user', value: adminCreds.user },
                            { key: 'admin_pass', value: adminCreds.pass }
                          ]);
                          alert('¡Credenciales de Administrador actualizadas con éxito!');
                        } catch (err) {
                          alert('Error al guardar credenciales.');
                        }
                      }}
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl transition-all shadow-lg shadow-blue-500/20 active:scale-95"
                    >
                      Guardar Nuevas Credenciales
                    </button>
                    <p className="text-[10px] text-slate-400 mt-2 italic px-2">
                       Ten cuidado: si cambias estos datos, tendrás que usarlos la próxima vez que inicies sesión.
                    </p>
                  </div>
               </div>
            </div>

            {/* MIKI CLEANUP ZONE */}
            <div className="mt-8 pt-8 border-t border-slate-100">
               <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Zona de Desarrollo / Pruebas</h3>
               <button
                 onClick={() => handleCleanupDriverData('miki')}
                 className="w-full flex items-center justify-center gap-3 p-4 bg-red-50 text-red-700 border border-red-100 rounded-xl hover:bg-red-100 transition-colors font-bold"
               >
                 <Trash2 size={20} />
                 Borrar todos los datos de "Miki"
               </button>
               <p className="text-[11px] text-slate-400 mt-2 text-center">
                 Esta acción borrará conductores, clientes y envíos que contengan el nombre "miki". No se puede deshacer.
               </p>
            </div>

            {/* SECRET HIGH PRIVACY PANEL - ONLY VISIBLE IF GHOST MODE IS UNLOCKED */}
            {isGhostModeUnlocked && (
              <div className="mt-8 pt-8 border-t-2 border-slate-800 bg-slate-900 -mx-8 px-8 pb-8 rounded-b-xl animate-in slide-in-from-bottom-5 duration-500">
                <div className="flex items-center gap-3 mb-6 pt-4">
                  <div className="p-3 bg-red-500/20 text-red-500 rounded-lg">
                    <Shield size={24} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">Panel de Alta Privacidad</h2>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* BOTÓN EXPORTAR EXCEL */}
                  <button
                    onClick={handleExportSecretsCSV}
                    className="w-full bg-emerald-600/20 hover:bg-emerald-600/40 text-emerald-400 border border-emerald-500/50 p-6 rounded-xl text-lg font-bold flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-emerald-900/20"
                  >
                    <Download size={24} />
                    <span>Descargar Excel</span>
                  </button>

                  {/* BOTÓN EXPORTAR ZIP (PDFs) */}
                  <button
                    onClick={handleExportSecretsZIP}
                    disabled={isExportingSecretsZip}
                    className="w-full bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-500/50 p-6 rounded-xl text-lg font-bold flex flex-col items-center justify-center gap-2 transition-all active:scale-95 shadow-lg shadow-blue-900/20 disabled:opacity-50"
                  >
                    {isExportingSecretsZip ? <span className="animate-pulse text-2xl">...</span> : <Download size={24} />}
                    <span>Descargar PDFs</span>
                  </button>

                  {/* ESPACIO NUCLEAR DE DESTRUCCIÓN */}
                  <div className="relative overflow-hidden rounded-xl">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/10 blur-3xl rounded-full pointer-events-none"></div>
                    <button
                      onClick={handleDeleteSecrets}
                      className="w-full relative z-10 bg-red-600 hover:bg-red-700 text-white p-6 rounded-xl text-lg font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-lg shadow-red-900/50 border border-red-500"
                    >
                      <Trash2 size={24} />
                      Eliminar
                    </button>
                  </div>

                  {/* ESPACIO LIMPIEZA DE ARCHIVOS HUÉRFANOS */}
                  <div className="md:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-4 mt-2">
                    <h3 className="text-sm font-bold text-slate-300 mb-3 flex items-center gap-2">
                      <Database size={16} />
                      Limpieza Selectiva de Archivos en la Nube
                    </h3>
                    <p className="text-xs text-slate-400 mb-4">Borra permanentemente fotos y firmas que ya no tienen un envío asociado en tu panel. Puedes filtrar por la fecha en la que se subió la foto.</p>
                    <div className="flex flex-col md:flex-row gap-4 mb-4">
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 mb-1">Desde la fecha (Opcional)</label>
                        <input
                          type="date"
                          value={orphanStartDate}
                          onChange={(e) => setOrphanStartDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm focus:border-blue-500 outline-none [color-scheme:dark]"
                        />
                      </div>
                      <div className="flex-1">
                        <label className="block text-xs font-bold text-slate-400 mb-1">Hasta la fecha (Opcional)</label>
                        <input
                          type="date"
                          value={orphanEndDate}
                          onChange={(e) => setOrphanEndDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700 text-slate-300 rounded-lg p-2 text-sm focus:border-blue-500 outline-none [color-scheme:dark]"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleCleanOrphanedFiles}
                      className="w-full relative z-10 bg-red-900/50 hover:bg-red-800/80 text-red-200 border border-red-700/50 p-3 rounded-xl text-sm font-bold flex items-center justify-center gap-3 transition-all active:scale-95"
                    >
                      <Trash2 size={18} />
                      Liberar Espacio: Borrar Archivos Huérfanos
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-amber-50 rounded-lg flex items-start gap-3 text-amber-800 text-sm">
              <Database size={16} className="mt-0.5 shrink-0" />
              <p>
                <strong>Nota:</strong> Los datos se guardan automáticamente en este navegador o en la nube (si están sincronizados).
              </p>
            </div>

            {/* ══════ PREFERENCIA DE NOMBRES DE CONDUCTORES ══════ */}
            <div className="bg-white p-8 rounded-xl shadow-sm border border-slate-100 mt-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
                  <User size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Visualización de Conductores</h2>
                  <p className="text-slate-500 text-sm">Elige cómo deseas que se muestren los nombres de tus repartidores en listados y modales.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <button
                  type="button"
                  onClick={() => handleUpdateDriverNamePreference('both')}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.01] active:scale-95 duration-200 ${
                    driverNamePreference === 'both'
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Ambos</span>
                  <span className="text-sm font-bold text-slate-800">Nombre (Alias)</span>
                  <p className="text-xs text-slate-500 mt-2">Muestra el nombre completo y su alias entre paréntesis.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateDriverNamePreference('name')}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.01] active:scale-95 duration-200 ${
                    driverNamePreference === 'name'
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Nombre Únicamente</span>
                  <span className="text-sm font-bold text-slate-800">Solo Nombre</span>
                  <p className="text-xs text-slate-500 mt-2">Muestra solo el nombre completo del conductor.</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateDriverNamePreference('alias')}
                  className={`p-4 rounded-xl border-2 text-left transition-all hover:scale-[1.01] active:scale-95 duration-200 ${
                    driverNamePreference === 'alias'
                      ? 'border-blue-600 bg-blue-50/50 shadow-sm'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Alias Únicamente</span>
                  <span className="text-sm font-bold text-slate-800">Solo Alias</span>
                  <p className="text-xs text-slate-500 mt-2">Muestra solo su alias (si no tiene, se usará el nombre).</p>
                </button>
              </div>
            </div>

            {/* ACERCA DE */}
            <div className="mt-8 pt-8 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20">
                    <span className="text-white font-black text-lg">S</span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800">Sumtrans Logística</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Versión 1.0.0</p>
                  </div>
                </div>
                <span className="text-[10px] bg-blue-50 text-blue-600 px-3 py-1 rounded-full font-bold border border-blue-100">
                  Producción
                </span>
              </div>
              <div className="mt-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Desarrollado por</span>
                    <p className="text-slate-700 font-semibold mt-0.5">Miguel Ángel Pavón Maíz</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Año</span>
                    <p className="text-slate-700 font-semibold mt-0.5">{new Date().getFullYear()}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-200">
                  © {new Date().getFullYear()} Sumtrans Logística — Todos los derechos reservados.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RESTAURACIÓN INTELIGENTE */}
      {showRestoreModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                  <Database size={20} />
                </div>
                <h3 className="text-lg font-bold text-slate-800">Caja Fuerte / Restauración</h3>
              </div>
              <button onClick={() => setShowRestoreModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors">
                 <X size={24} />
              </button>
            </div>
            
            <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
              <p className="text-sm text-slate-600 mb-4">
                Has cargado un archivo de copia de seguridad. Selecciona qué áreas de Sumtrans deseas restaurar. 
                Tus datos actuales en la Nube se empalmarán, sin borrar lo más nuevo.
              </p>

              <div className="space-y-3">
                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.articles} onChange={(e) => setRestoreOptions(p => ({...p, articles: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Catálogo de Artículos y Servicios</div>
                     <div className="text-xs text-slate-500">Recuperar artículos, precios base e IDs borrados.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.clients} onChange={(e) => setRestoreOptions(p => ({...p, clients: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Cartera Inmensa de Clientes</div>
                     <div className="text-xs text-slate-500">Recuperar cuentas de cliente y validaciones.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.tariffs} onChange={(e) => setRestoreOptions(p => ({...p, tariffs: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Tarifas Pre-asignadas y Clasificación</div>
                     <div className="text-xs text-slate-500">Recuperar los precios fijos del catálogo para los B2B.</div>
                   </div>
                 </label>

                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.drivers} onChange={(e) => setRestoreOptions(p => ({...p, drivers: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Conductores y Permisos</div>
                     <div className="text-xs text-slate-500">Restaura los carnets, contraseñas y accesos.</div>
                   </div>
                 </label>
                 
                 <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                   <input type="checkbox" checked={restoreOptions.vehicles} onChange={(e) => setRestoreOptions(p => ({...p, vehicles: e.target.checked}))} className="mt-1 w-5 h-5 text-indigo-600 rounded" />
                   <div>
                     <div className="font-bold text-slate-700 text-sm">Registro de Vehículos (Flota)</div>
                     <div className="text-xs text-slate-500">Seguros, ITV y control de la flota.</div>
                   </div>
                 </label>

                 <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${restoreOptions.shipments ? 'bg-red-50 border-red-200' : 'border-slate-200 hover:bg-slate-50'}`}>
                   <input type="checkbox" checked={restoreOptions.shipments} onChange={(e) => setRestoreOptions(p => ({...p, shipments: e.target.checked}))} className={`mt-1 w-5 h-5 rounded ${restoreOptions.shipments ? 'text-red-600' : 'text-slate-400'}`} />
                   <div>
                     <div className={`font-bold text-sm ${restoreOptions.shipments ? 'text-red-700' : 'text-slate-700'}`}>Viajes y Entregas Diarias (¡PELIGRO TÉRMICO!)</div>
                     <div className={`text-xs ${restoreOptions.shipments ? 'text-red-600' : 'text-slate-500'}`}>Si marcas esto, desharás todo el trabajo en la carretera realizado desde que se hizo esta copia... <strong>Eliminarás las entregas de hoy y firmas.</strong></div>
                   </div>
                 </label>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3">
              <button 
                onClick={() => setShowRestoreModal(false)}
                className="flex-[1] py-3 bg-white border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmRestore}
                disabled={!restoreOptions.articles && !restoreOptions.clients && !restoreOptions.tariffs && !restoreOptions.drivers && !restoreOptions.vehicles && !restoreOptions.shipments && !restoreOptions.fuelLogs}
                className="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20 disabled:opacity-50 flex justify-center items-center gap-2"
              >
                <RotateCcw size={18} />
                Confirmar Restauración (Fusión Nube)
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default App
