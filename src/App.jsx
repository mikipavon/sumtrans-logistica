import { useState } from 'react'
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

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userRole, setUserRole] = useState(null) // 'admin', 'driver', 'client'
  const [currentView, setCurrentView] = useState('dashboard')
  const [currentDriverId, setCurrentDriverId] = useState(null) // ID of the logged in driver

  // Lifted state for drivers
  const [drivers, setDrivers] = useState([
    { id: 1, name: 'Carlos Ruiz', status: 'En Ruta', vehicle: 'V-8921-GZ', rating: 4.9, phone: '+34 600 000 001', since: '2019' },
    { id: 2, name: 'Ana Garcia', status: 'Descanso', vehicle: 'B-1234-XY', rating: 5.0, phone: '+34 600 000 002', since: '2020' },
    { id: 3, name: 'Miguel Angel', status: 'Vacaciones', vehicle: '-', rating: 4.7, phone: '+34 600 000 003', since: '2018' },
    { id: 4, name: 'Jose Luis', status: 'En Ruta', vehicle: 'V-9999-BB', rating: 4.8, phone: '+34 600 000 004', since: '2021' },
    { id: 5, name: 'Elena Torres', status: 'Disponible', vehicle: '-', rating: 4.9, phone: '+34 600 000 005', since: '2022' },
  ])

  // Lifted state for shipments
  const [shipments, setShipments] = useState([
    { id: 'TR-2024001', client: 'Industrias Apex', origin: 'Madrid, ES', destination: 'Paris, FR', status: 'En Tránsito', date: '19 Ene, 2024', amount: '€1,250', assignedDriverId: 1, address: 'Paris, FR' }, // Assigned to Carlos
    { id: 'TR-2024002', client: 'Global Tech SA', origin: 'Valencia, ES', destination: 'Munich, DE', status: 'Pendiente', date: '20 Ene, 2024', amount: '€3,400', assignedDriverId: null, address: 'Munich, DE' },
    { id: 'TR-2024003', client: 'AgroLevante', origin: 'Murcia, ES', destination: 'Barcelona, ES', status: 'Entregado', date: '18 Ene, 2024', amount: '€850', assignedDriverId: 2, address: 'Barcelona, ES' },
    { id: 'TR-2024004', client: 'Decor Home', origin: 'Sevilla, ES', destination: 'Porto, PT', status: 'En Tránsito', date: '21 Ene, 2024', amount: '€1,100', assignedDriverId: null, address: 'Porto, PT' },
    { id: 'TR-2024005', client: 'Inditex Group', origin: 'Coruña, ES', destination: 'Milan, IT', status: 'Preparando', date: '22 Ene, 2024', amount: '€4,200', assignedDriverId: 1, address: 'Milan, IT' }, // Assigned to Carlos
  ])

  // Lifted state for articles
  const [articles, setArticles] = useState([
    { id: 1, name: 'Hora de Espera', description: 'Cargo por hora adicional de espera en carga/descarga', price: '45.00', unit: 'Hora' },
    { id: 2, name: 'Palet Europeo', description: 'Transporte de palet estándar (120x80)', price: '65.00', unit: 'Unidad' },
    { id: 3, name: 'Kilometraje Extra', description: 'Tarifa por km fuera de ruta pactada', price: '1.20', unit: 'Km' },
    { id: 4, name: 'Servicio Urgente', description: 'Suplemento por entrega 24h', price: '150.00', unit: 'Servicio' },
  ])

  const handleLogin = (role = 'admin') => {
    setIsAuthenticated(true)
    setUserRole(role)
    // Simulate logging in as Driver ID 1 (Carlos) when 'driver' role is selected
    if (role === 'driver') {
      setCurrentDriverId(1)
    } else {
      setCurrentDriverId(null)
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

  const handleAssignDriver = (shipmentId, driverId) => {
    setShipments(shipments.map(s =>
      s.id === shipmentId ? { ...s, assignedDriverId: Number(driverId) } : s
    ))
  }

  // Stored Client Locations
  const [clients, setClients] = useState([
    { id: 101, name: 'Industrias Apex', address: 'Polígono Industrial Sur, Nave 4', city: 'Madrid', zip: '28001', phone: '+34 912 345 678', cif: 'B-12345678', type: 'Remitente', lastInteraction: '2024-01-19', coordinates: '40.4168, -3.7038', color: '#ef4444' }, // Red
    { id: 102, name: 'Global Tech SA', address: 'Av. del Puerto 12', city: 'Valencia', zip: '46024', phone: '+34 960 000 000', cif: 'A-87654321', type: 'Remitente', lastInteraction: '2024-01-20', coordinates: '39.4699, -0.3763', color: '#3b82f6' }, // Blue
  ])

  const handleAddShipment = (newShipment, originalPickupId = null) => {
    // Determine creator
    let creatorName = 'Administrador';
    if (userRole === 'driver') {
      const driver = drivers.find(d => d.id === currentDriverId);
      creatorName = driver ? `Cond. ${driver.name}` : 'Conductor';
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
        address: newShipment.originAddress || newShipment.origin || '',
        city: newShipment.originCity || '',
        zip: newShipment.originZip || '',
        phone: newShipment.originPhone || '',
        coordinates: newShipment.originCoordinates || '',
        type: 'Remitente',
        billingType: 'Cobro Diario',
        status: 'pending', // Pendiente de validación
        createdFrom: newShipment.type === 'Recogida' ? 'Recogida' : 'Albarán',
        createdBy: creatorName,
        lastInteraction: new Date().toISOString().split('T')[0]
      }]);
    }

    // Auto-save DESTINATARIO (Receiver) if new
    const receiverExists = clients.find(c => c.name.toLowerCase() === newShipment.destinationName?.toLowerCase());
    if (!receiverExists && newShipment.destinationName) {
      setClients(prev => [...prev, {
        id: Date.now() + 1,
        name: newShipment.destinationName,
        address: newShipment.destinationAddress || '',
        city: newShipment.destinationCity || '',
        zip: newShipment.destinationZip || '',
        phone: newShipment.destinationPhone || '',
        coordinates: newShipment.destinationCoordinates || '',
        type: 'Destinatario',
        billingType: 'Cobro Diario',
        status: 'pending', // Pendiente de validación
        createdFrom: newShipment.type === 'Recogida' ? 'Recogida' : 'Albarán',
        createdBy: creatorName,
        lastInteraction: new Date().toISOString().split('T')[0]
      }]);
    }
  }

  // Handle manual edits to shipment details
  const handleUpdateShipment = (id, updatedFields) => {
    setShipments(shipments.map(s =>
      s.id === id ? { ...s, ...updatedFields } : s
    ));
    // Also update client if minimal details changed? Maybe not for now to avoid side effects.
  };

  const handleShipmentStatusChange = (shipmentId, newStatus, deliveryCoordinates = null) => {
    setShipments(shipments.map(s => {
      if (s.id === shipmentId) {
        const updates = { status: newStatus }
        // If Incidencia, unassign driver
        if (newStatus === 'Incidencia') {
          updates.assignedDriverId = null
        }

        // LOGIC FOR 'COBRAR MÁS TARDE' (Pendiente Cobro)
        // If client is 'Cobro Diario' or 'Nuevo' (pending), unassign driver to return to pool
        if (newStatus === 'Pendiente Cobro') {
          const receiverName = s.destinationName || '';
          const receiver = clients.find(c => c.name.toLowerCase() === receiverName.toLowerCase());

          // Check if receiver exists and is 'Cobro Diario' or status 'pending' (New)
          // If receiver doesn't exist, we treat as New
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
    if (newStatus === 'Entregado' || newStatus === 'Pendiente Cobro') {
      const shipment = shipments.find(s => s.id === shipmentId);
      if (shipment && shipment.destinationName) {
        // Find existing client (destinatario)
        const existingClient = clients.find(c =>
          c.name.toLowerCase() === shipment.destinationName.toLowerCase()
        );

        if (existingClient) {
          // ONLY update coordinates if client is still PENDING (not yet validated)
          // Approved clients have PROTECTED coordinates - only admin can change them
          if (deliveryCoordinates && existingClient.status === 'pending') {
            setClients(clients.map(c =>
              c.id === existingClient.id
                ? { ...c, coordinates: deliveryCoordinates, lastInteraction: new Date().toISOString().split('T')[0] }
                : c
            ));
          }
        } else {
          // Create new client with coordinates
          setClients(prev => [...prev, {
            id: Date.now(),
            name: shipment.destinationName,
            address: shipment.destinationAddress || shipment.destination || '',
            city: shipment.destinationCity || '',
            zip: shipment.destinationZip || '',
            phone: shipment.destinationPhone || '',
            coordinates: deliveryCoordinates || '',
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
      {currentView === 'pending-collections' && <PendingCollections shipments={shipments} drivers={drivers} clients={clients} />}
      {currentView === 'shipments' && <Shipments shipments={shipments} drivers={drivers} clients={clients} onAssignDriver={handleAssignDriver} onCreateShipment={handleAddShipment} onAddClient={handleAddClient} />}
      {currentView === 'fleet' && <Fleet />}
      {currentView === 'drivers' && <Drivers drivers={drivers} shipments={shipments} onAddDriver={handleAddDriver} onImpersonate={handleImpersonate} />}
      {currentView === 'tracking' && <Tracking drivers={drivers} />}
      {currentView === 'clients' && <Clients clients={clients} articles={articles} onUpdateClient={handleUpdateClient} onAddClient={handleAddClient} onImportClients={handleImportClients} />}
      {currentView === 'articles' && <Articles articles={articles} onAddArticle={handleAddArticle} onUpdateArticle={handleUpdateArticle} />}
      {currentView === 'incidents' && <Incidents shipments={shipments} onUpdateStatus={handleShipmentStatusChange} drivers={drivers} />}
      {currentView === 'clientValidation' && <ClientValidation clients={clients} onValidateClient={handleValidateClient} />}
      {currentView === 'settings' && <div className="p-4 bg-white rounded-xl shadow-sm h-96 flex items-center justify-center text-slate-400">Configuración del Sistema</div>}
    </Layout>
  )
}

export default App
