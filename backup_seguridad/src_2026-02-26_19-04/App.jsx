import { useState, useEffect } from 'react'
import { Download, Upload, Trash2, Database } from 'lucide-react'
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
import Incidents from './pages/Incidents'
import ClientValidation from './pages/ClientValidation'
import PendingCollections from './pages/PendingCollections'
import Quotes from './pages/Quotes';

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
    localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);

  return [state, setState];
}

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState(null) // 'admin', 'driver', 'client'
  const [currentView, setCurrentView] = useState('dashboard')
  const [currentDriverId, setCurrentDriverId] = useState(null) // ID of the logged in driver

  // Lifted state for drivers
  const [drivers, setDrivers] = usePersistentState('drivers', [
    { id: 1, name: 'Carlos Ruiz', status: 'En Ruta', vehicle: 'V-8921-GZ', rating: 4.9, phone: '+34 600 000 001', since: '2019', username: 'carlosr', password: 'password123' },
    { id: 2, name: 'Ana Garcia', status: 'Descanso', vehicle: 'B-1234-XY', rating: 5.0, phone: '+34 600 000 002', since: '2020', username: 'anag', password: 'password123' },
    { id: 3, name: 'Miguel Angel', status: 'Vacaciones', vehicle: '-', rating: 4.7, phone: '+34 600 000 003', since: '2018', username: 'miguela', password: 'password123' },
    { id: 4, name: 'Jose Luis', status: 'En Ruta', vehicle: 'V-9999-BB', rating: 4.8, phone: '+34 600 000 004', since: '2021', username: 'josel', password: 'password123' },
    { id: 5, name: 'Elena Torres', status: 'Disponible', vehicle: '-', rating: 4.9, phone: '+34 600 000 005', since: '2022', username: 'elenat', password: 'password123' },
  ])

  // Lifted state for shipments
  const [shipments, setShipments] = usePersistentState('shipments', [
    { id: 'TR-2024001', client: 'Industrias Apex', origin: 'Madrid, ES', destination: 'Paris, FR', status: 'En reparto', date: '19 Ene, 2024', amount: '€1,250', assignedDriverId: 1, address: 'Paris, FR' }, // Assigned to Carlos
    { id: 'TR-2024002', client: 'Global Tech SA', origin: 'Valencia, ES', destination: 'Munich, DE', status: 'Pendiente de asignar', date: '20 Ene, 2024', amount: '€3,400', assignedDriverId: null, address: 'Munich, DE' },
    { id: 'TR-2024003', client: 'AgroLevante', origin: 'Murcia, ES', destination: 'Barcelona, ES', status: 'Entregado', date: '18 Ene, 2024', amount: '€850', assignedDriverId: 2, address: 'Barcelona, ES' },
    { id: 'TR-2024004', client: 'Decor Home', origin: 'Sevilla, ES', destination: 'Porto, PT', status: 'En reparto', date: '21 Ene, 2024', amount: '€1,100', assignedDriverId: null, address: 'Porto, PT' },
    { id: 'TR-2024005', client: 'Inditex Group', origin: 'Coruña, ES', destination: 'Milan, IT', status: 'En reparto', date: '22 Ene, 2024', amount: '€4,200', assignedDriverId: 1, address: 'Milan, IT' }, // Assigned to Carlos
  ])

  // Lifted state for articles
  const [articles, setArticles] = usePersistentState('articles', [
    { id: 1, name: 'Hora de Espera', description: 'Cargo por hora adicional de espera en carga/descarga', price: '45.00', unit: 'Hora' },
    { id: 2, name: 'Palet Europeo', description: 'Transporte de palet estándar (120x80)', price: '65.00', unit: 'Unidad' },
    { id: 3, name: 'Kilometraje Extra', description: 'Tarifa por km fuera de ruta pactada', price: '1.20', unit: 'Km' },
    { id: 4, name: 'Servicio Urgente', description: 'Suplemento por entrega 24h', price: '150.00', unit: 'Servicio' },
  ])

  // Lifted state for vehicles (Fleet)
  const [vehicles, setVehicles] = usePersistentState('vehicles', [
    { id: 'V-8921-GZ', model: 'Volvo FH16', assignedDriverId: 1, status: 'En Ruta', location: 'A-6 km 45, Madrid', fuel: '78%', maintenance: 'OK', documents: [] },
    { id: 'B-1234-XY', model: 'Scania R500', assignedDriverId: 2, status: 'Disponible', location: 'Base Central', fuel: '100%', maintenance: 'OK', documents: [] },
    { id: 'M-5678-AB', model: 'Mercedes Actros', assignedDriverId: 3, status: 'Mantenimiento', location: 'Taller', fuel: '45%', maintenance: 'Warning', documents: [] },
    { id: 'V-9999-BB', model: 'Iveco S-Way', assignedDriverId: 4, status: 'En Ruta', location: 'AP-7, Valencia', fuel: '62%', maintenance: 'OK', documents: [] },
  ])

  const handleLogin = (role = 'admin', username = '', password = '') => {
    if (role === 'driver') {
      const driver = drivers.find(d => d.username === username && d.password === password);
      // Validar si existe o si se ingresó directamente sin contraseña usando credenciales válidas
      if (driver) {
        setIsAuthenticated(true);
        setUserRole(role);
        setCurrentDriverId(driver.id);
        return true;
      } else {
        return false; // Error en auth
      }
    } else {
      // Admin / Client log in
      setIsAuthenticated(true);
      setUserRole(role);
      setCurrentDriverId(null);
      return true;
    }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    setUserRole(null)
    setCurrentDriverId(null)
    setCurrentView('dashboard')
  }

  const handleAddDriver = (newDriver) => {
    setDrivers([...drivers, newDriver])
  }

  const handleDeleteDriver = (driverId) => {
    setDrivers(drivers.filter(driver => driver.id !== driverId))
  }

  const handleUpdateDriver = (driverId, updatedData) => {
    setDrivers(drivers.map(driver => driver.id === driverId ? { ...driver, ...updatedData } : driver))
  }

  const handleAssignDriver = (shipmentId, driverId) => {
    setShipments(shipments.map(s => {
      if (s.id === shipmentId) {
        const isUnassigning = !driverId || driverId === '' || driverId === 'unassigned';
        return {
          ...s,
          assignedDriverId: isUnassigning ? null : Number(driverId),
          status: isUnassigning ? 'Pendiente de asignar' : 'En reparto'
        };
      }
      return s;
    }))
  }

  const handleAddVehicle = (newVehicle) => {
    setVehicles([...vehicles, newVehicle]);
  }

  const handleUpdateVehicle = (id, updatedData) => {
    setVehicles(vehicles.map(v => v.id === id ? { ...v, ...updatedData } : v));
  }

  const handleDeleteVehicle = (id) => {
    setVehicles(vehicles.filter(v => v.id !== id));
  }

  // Stored Client Locations
  const [clients, setClients] = usePersistentState('clients', [
    { id: 101, name: 'Industrias Apex', legalName: 'Industrias Apex S.L.', address: 'Polígono Industrial Sur, Nave 4', city: 'Madrid', zip: '28001', phone: '+34 912 345 678', cif: 'B-12345678', type: 'Remitente', lastInteraction: '2024-01-19', coordinates: '40.4168, -3.7038', color: '#ef4444' }, // Red
    { id: 102, name: 'Global Tech SA', legalName: 'Global Technology Solutions S.A.', address: 'Av. del Puerto 12', city: 'Valencia', zip: '46024', phone: '+34 960 000 000', cif: 'A-87654321', type: 'Remitente', lastInteraction: '2024-01-20', coordinates: '39.4699, -0.3763', color: '#3b82f6' }, // Blue
  ])

  const handleAddShipment = (newShipment, originalPickupId = null) => {
    // Determine creator
    let creatorName = 'Administrador';
    if (userRole === 'driver') {
      const driver = drivers.find(d => d.id === currentDriverId);
      creatorName = driver ? `Cond.${driver.name} ` : 'Conductor';
    }

    const shipmentWithMeta = {
      ...newShipment,
      type: newShipment.type || 'Entrega', // Default to Entrega
      createdAt: new Date().toISOString(), // Register creation time
      createdBy: creatorName, // Register who created it
      createdById: userRole === 'driver' ? currentDriverId : null, // ID of creator if driver

      // Auto-assign to creator logic REMOVED as per user request (pass to Assignation pool)
      assignedDriverId: newShipment.assignedDriverId
    };

    // If converting a pickup, remove the original pickup
    if (originalPickupId) {
      setShipments(prev => {
        const filtered = prev.filter(s => s.id !== originalPickupId);
        return [...filtered, shipmentWithMeta];
      });
    } else {
      setShipments(prev => [...prev, shipmentWithMeta]);
    }

    // Auto-save REMITENTE (Sender) if new
    const senderExists = clients.find(c => c.name.toLowerCase() === newShipment.client?.toLowerCase());
    if (!senderExists && newShipment.client) {
      setClients(prev => [...prev, {
        id: Date.now(),
        name: newShipment.client,
        legalName: '',
        address: newShipment.originAddress || newShipment.origin || '',
        city: newShipment.originCity || '',
        zip: newShipment.originZip || '',
        phone: newShipment.originPhone || '',
        coordinates: newShipment.originCoordinates || '', // Save Origin GPS
        type: 'Remitente',
        billingType: 'Cobro Diario',
        status: 'pending', // Pendiente de validación
        createdFrom: newShipment.type === 'Recogida' ? 'Recogida' : 'Albarán',
        createdBy: creatorName,
        lastInteraction: new Date().toISOString().split('T')[0]
      }]);
    } else if (senderExists && newShipment.originCoordinates && senderExists.status === 'pending') {
      // Update pending sender with new coordinates if captured
      setClients(clients.map(c =>
        c.id === senderExists.id ? { ...c, coordinates: newShipment.originCoordinates } : c
      ));
    }

    // Auto-save DESTINATARIO (Receiver) removed here. 
    // Logic moved to 'handleShipmentStatusChange' (on Delivery) to validate location first.
  }

  // Handle manual edits to shipment details
  const handleUpdateShipment = (id, updatedFields) => {
    setShipments(prev => prev.map(s =>
      s.id === id ? { ...s, ...updatedFields } : s
    ));
    // Also update client if minimal details changed? Maybe not for now to avoid side effects.
  };

  const handleShipmentStatusChange = (shipmentId, newStatus, deliveryCoordinates = null) => {
    setShipments(prev => prev.map(s => {
      if (s.id === shipmentId) {
        const updates = { status: newStatus }
        // If Incidencia or Entrega aplazada, unassign driver to return to pool if needed
        if (newStatus === 'Incidencia' || newStatus === 'Entrega aplazada') {
          updates.assignedDriverId = null
        }

        // Keep compatibility with 'Pendiente Cobro' logic if still used or mapped to 'Entrega aplazada'
        if (newStatus === 'Entrega aplazada' || newStatus === 'Pendiente Cobro') {
          const receiverName = s.destinationName || '';
          const receiver = clients.find(c => c.name.toLowerCase() === receiverName.toLowerCase());
          const isDailyOrNew = !receiver || receiver.billingType === 'Cobro Diario' || receiver.status === 'pending';

          if (isDailyOrNew) {
            updates.assignedDriverId = null;
          }
        }

        // Store delivery coordinates with the shipment
        if (deliveryCoordinates) {
          updates.deliveryCoordinates = deliveryCoordinates
        }
        return { ...s, ...updates }
      }
      return s
    }))

    // Auto-save/update Receiver Location on Delivery with GPS coordinates
    if (newStatus === 'Entregado' || newStatus === 'Entrega aplazada' || newStatus === 'Pendiente Cobro') {
      const shipment = shipments.find(s => s.id === shipmentId);
      if (shipment && shipment.destinationName) {
        // Find existing client (destinatario)
        const existingClient = clients.find(c =>
          c.name.toLowerCase() === shipment.destinationName.toLowerCase()
        );

        if (existingClient) {
          // ONLY update coordinates if client is still PENDING (not yet validated)
          // Approved clients have PROTECTED coordinates - only admin can change them
          // ONLY update coordinates if client is still PENDING
          const finalCoords = deliveryCoordinates || shipment.destinationCoordinates;
          if (finalCoords && existingClient.status === 'pending') {
            setClients(clients.map(c =>
              c.id === existingClient.id
                ? { ...c, coordinates: finalCoords, lastInteraction: new Date().toISOString().split('T')[0] }
                : c
            ));
          }
        } else {
          // Create new client with coordinates
          setClients(prev => [...prev, {
            id: Date.now(),
            name: shipment.destinationName,
            legalName: '',
            address: shipment.destinationAddress || shipment.destination || '',
            city: shipment.destinationCity || '',
            zip: shipment.destinationZip || '',
            phone: shipment.destinationPhone || '',
            coordinates: deliveryCoordinates || shipment.destinationCoordinates || '',
            type: 'Destinatario',
            billingType: 'Cobro Diario',
            status: 'pending',
            createdFrom: 'Entrega',
            lastInteraction: new Date().toISOString().split('T')[0]
          }]);
        }
      }
    }
  }

  const handleUpdateClient = (clientId, updatedData) => {
    setClients(clients.map(c =>
      c.id === clientId ? {
        ...c,
        ...updatedData, // Merge new data (address, color, coordinates, tariff, etc.)
        lastInteraction: new Date().toISOString().split('T')[0]
      } : c
    ));
  }

  const handleAddClient = (newClient) => {
    setClients(prev => [...prev, { ...newClient, id: Date.now(), lastInteraction: new Date().toISOString().split('T')[0] }])
  }

  const handleImportClients = (newClients) => {
    const clientsWithIds = newClients.map((c, index) => ({
      ...c,
      id: Date.now() + index,
      lastInteraction: new Date().toISOString().split('T')[0]
    }));
    setClients(prev => [...prev, ...clientsWithIds]);
  }

  const handleAddArticle = (newArticle) => {
    setArticles([...articles, newArticle]);
  }

  const handleUpdateArticle = (id, updatedData) => {
    setArticles(articles.map(a => a.id === id ? { ...a, ...updatedData } : a));
  }

  // Lifted state for tariffs (Dynamic Pricing)
  const [tariffs, setTariffs] = usePersistentState('tariffs', [
    { id: 1, name: 'Córdoba (Provincia)', match: 'Córdoba', zipPrefix: '14', price: '45.00' },
    { id: 2, name: 'Sevilla', match: 'Sevilla', zipPrefix: '41', price: '65.00' },
    { id: 3, name: 'Málaga', match: 'Málaga', zipPrefix: '29', price: '75.00' },
  ])

  const handleAddTariff = (newTariff) => {
    setTariffs(prev => [...prev, { ...newTariff, id: Date.now() }]);
  }

  const handleUpdateTariff = (id, updatedData) => {
    setTariffs(prev => prev.map(t => t.id === id ? { ...t, ...updatedData } : t));
  }

  const handleDeleteTariff = (id) => {
    setTariffs(prev => prev.filter(t => t.id !== id));
  }

  const handleValidateClient = (clientId, approved) => {
    if (approved) {
      // Approve: change status to 'approved'
      setClients(clients.map(c =>
        c.id === clientId ? { ...c, status: 'approved' } : c
      ));
    } else {
      // Reject: remove client
      setClients(clients.filter(c => c.id !== clientId));
    }
  }

  // Count pending clients for badge
  const pendingClientsCount = clients.filter(c => c.status === 'pending').length;

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />
    // return <div className="p-10 text-2xl font-bold text-center">LOGIN PLACEHOLDER - Si ves esto, Login.jsx es el problema</div>

  }

  const handleImpersonate = (driverId) => {
    setIsAuthenticated(true)
    setUserRole('driver')
    setCurrentDriverId(driverId)
  }

  // Driver View
  if (userRole === 'driver') {
    return <DriverDashboard
      onLogout={handleLogout}
      allShipments={shipments}
      currentDriverId={currentDriverId}
      onAssignShipment={handleAssignDriver}
      drivers={drivers}
      clients={clients}
      onCreateShipment={handleAddShipment}
      onStatusChange={handleShipmentStatusChange}
      onUpdateShipment={handleUpdateShipment}
      tariffs={tariffs}
      articles={articles}
    />
  }

  // Admin View (Default)
  return (
    <Layout
      onLogout={handleLogout}
      currentView={currentView}
      onNavigate={setCurrentView}
      pendingClientsCount={pendingClientsCount}
    >
      {currentView === 'dashboard' && <Dashboard />}
      {currentView === 'pending-collections' && <PendingCollections shipments={shipments} drivers={drivers} clients={clients} onAssignDriver={handleAssignDriver} />}
      {currentView === 'shipments' && <Shipments shipments={shipments} drivers={drivers} clients={clients} tariffs={tariffs} onAssignDriver={handleAssignDriver} onCreateShipment={handleAddShipment} onAddClient={handleAddClient} onUpdateShipment={handleUpdateShipment} />}
      {currentView === 'fleet' && <Fleet vehicles={vehicles} drivers={drivers} onAddVehicle={handleAddVehicle} onUpdateVehicle={handleUpdateVehicle} onDeleteVehicle={handleDeleteVehicle} />}
      {currentView === 'drivers' && <Drivers drivers={drivers} shipments={shipments} onAddDriver={handleAddDriver} onUpdateDriver={handleUpdateDriver} onDeleteDriver={handleDeleteDriver} onImpersonate={handleImpersonate} onNavigate={setCurrentView} />}
      {currentView === 'tracking' && <Tracking drivers={drivers} />}
      {currentView === 'clients' && <Clients clients={clients} articles={articles} onUpdateClient={handleUpdateClient} onAddClient={handleAddClient} onImportClients={handleImportClients} />}
      {currentView === 'articles' && <Articles articles={articles} tariffs={tariffs} onAddArticle={handleAddArticle} onUpdateArticle={handleUpdateArticle} onImportArticles={(data) => setArticles(prev => [...prev, ...data.map((d, i) => ({ ...d, id: Date.now() + i }))])} onAddTariff={handleAddTariff} onUpdateTariff={handleUpdateTariff} onDeleteTariff={handleDeleteTariff} onImportTariffs={(data) => setTariffs(prev => [...prev, ...data.map((d, i) => ({ ...d, id: Date.now() + i }))])} />}
      {currentView === 'quotes' && <Quotes />}
      {currentView === 'incidents' && <Incidents shipments={shipments} onUpdateStatus={handleShipmentStatusChange} drivers={drivers} />}
      {currentView === 'clientValidation' && <ClientValidation clients={clients} onValidateClient={handleValidateClient} onUpdateClient={handleUpdateClient} />}
      {currentView === 'settings' && (
        <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
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

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* EXPORT */}
              <button
                onClick={() => {
                  const data = { drivers, shipments, clients, articles, tariffs };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `backup - logistica - ${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                }}
                className="flex flex-col items-center justify-center gap-3 p-8 bg-slate-50 border-2 border-slate-200 border-dashed rounded-xl hover:bg-blue-50 hover:border-blue-200 hover:text-blue-700 transition-all group"
              >
                <div className="p-4 bg-white rounded-full shadow-sm group-hover:scale-110 transition-transform">
                  <Download size={32} className="text-slate-400 group-hover:text-blue-600" />
                </div>
                <div className="text-center">
                  <div className="font-bold text-lg">Exportar Copia</div>
                  <div className="text-xs text-slate-500 mt-1">Descargar archivo .json</div>
                </div>
              </button>

              {/* IMPORT */}
              <div className="relative group">
                <input
                  type="file"
                  accept=".json"
                  onChange={(e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (!window.confirm('¿Estás seguro de restaurar? Esto sobrescribirá los datos actuales.')) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const data = JSON.parse(event.target.result);
                        if (data.drivers) setDrivers(data.drivers);
                        if (data.shipments) setShipments(data.shipments);
                        if (data.clients) setClients(data.clients);
                        if (data.articles) setArticles(data.articles);
                        if (data.tariffs) setTariffs(data.tariffs);
                        alert('¡Datos restaurados con éxito!');
                        window.location.reload(); // Reload to ensure state consistency
                      } catch (err) {
                        alert('Error: Archivo dañado o formato incorrecto.');
                      }
                    };
                    reader.readAsText(file);
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

            <div className="mt-6 p-4 bg-amber-50 rounded-lg flex items-start gap-3 text-amber-800 text-sm">
              <Database size={16} className="mt-0.5 shrink-0" />
              <p>
                <strong>Nota:</strong> Los datos se guardan automáticamente en este navegador.
                Usa "Exportar Copia" periódicamente para tener una copia de seguridad en tu ordenador.
              </p>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}

export default App
