import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Phone, Navigation } from 'lucide-react';
import { useEffect, useState } from 'react';
import L from 'leaflet';

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom Truck Icon
const truckIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/741/741407.png', // Simple truck icon
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
});

export default function Tracking({ drivers }) {
    // Simulated Driver Locations (Defaults)
    const [locations, setLocations] = useState([
        { driverId: 1, lat: 40.4168, lng: -3.7038, city: 'Madrid' }, // Carlos (Madrid)
        { driverId: 2, lat: 39.4699, lng: -0.3763, city: 'Valencia' }, // Ana (Valencia)
        { driverId: 4, lat: 41.3851, lng: 2.1734, city: 'Barcelona' } // Jose Luis (Barcelona)
    ]);

    // Simulate Movement (Just for demo)
    useEffect(() => {
        const interval = setInterval(() => {
            setLocations(prev => prev.map(loc => ({
                ...loc,
                lat: loc.lat + (Math.random() - 0.5) * 0.001, // Move slightly
                lng: loc.lng + (Math.random() - 0.5) * 0.001
            })));
        }, 3000); // Update every 3 seconds

        return () => clearInterval(interval);
    }, []);

    const activeDrivers = drivers.filter(d => ['En Ruta', 'Disponible'].includes(d.status));

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 animate-in fade-in duration-500">
            {/* Sidebar List */}
            <div className="w-full md:w-80 bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-100 bg-slate-50">
                    <h2 className="font-bold text-slate-800 flex items-center gap-2">
                        <Navigation className="text-blue-600" size={20} />
                        Mapa en Vivo
                    </h2>
                    <p className="text-xs text-slate-500 mt-1">
                        {activeDrivers.length} con señal GPS activa
                    </p>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {activeDrivers.map(driver => {
                        const loc = locations.find(l => l.driverId === driver.id);
                        return (
                            <div key={driver.id} className="p-3 rounded-lg border border-slate-100 hover:bg-blue-50 hover:border-blue-100 transition-colors cursor-pointer group">
                                <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold text-slate-700 text-sm">{driver.name}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${driver.status === 'En Ruta' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {driver.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                                    <Truck size={12} />
                                    {driver.vehicle}
                                </div>
                                {loc && (
                                    <div className="flex items-center gap-1 text-[10px] text-blue-500 font-mono bg-blue-50/50 p-1 rounded">
                                        <Navigation size={10} />
                                        {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                                        <span className="text-slate-400 ml-auto">Hace 2s</span>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Map Container */}
            <div className="flex-1 bg-slate-200 rounded-xl overflow-hidden shadow-lg border border-slate-300 relative z-0">
                <MapContainer center={[40.4168, -3.7038]} zoom={6} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }}>
                    <TileLayer
                        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {activeDrivers.map(driver => {
                        const loc = locations.find(l => l.driverId === driver.id);
                        if (!loc) return null;

                        return (
                            <Marker key={driver.id} position={[loc.lat, loc.lng]} icon={truckIcon}>
                                <Popup>
                                    <div className="p-2 min-w-[150px]">
                                        <h3 className="font-bold text-slate-800 mb-1">{driver.name}</h3>
                                        <p className="text-xs text-slate-500 mb-2">{driver.vehicle}</p>
                                        <div className="flex items-center gap-2">
                                            <a href={`tel:${driver.phone}`} className="flex-1 bg-green-50 text-green-700 text-xs px-2 py-1.5 rounded flex items-center justify-center gap-1 hover:bg-green-100 font-medium no-underline">
                                                <Phone size={12} /> Llamar
                                            </a>
                                        </div>
                                    </div>
                                </Popup>
                            </Marker>
                        )
                    })}
                </MapContainer>
            </div>
        </div>
    );
}
