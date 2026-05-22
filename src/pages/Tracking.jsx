import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Phone, Navigation, Clock, CheckCircle, Package, Zap } from 'lucide-react';
import { useEffect, useState, useMemo } from 'react';
import L from 'leaflet';

// Fix for default marker icon in React Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Colored van icon factory - creates a unique color van marker per driver
const createTruckIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 36" width="48" height="34">
        <!-- Van body -->
        <rect x="1" y="4" width="32" height="22" rx="3" fill="${color}"/>
        <!-- Cargo area lines -->
        <rect x="3" y="7" width="10" height="16" rx="1.5" fill="white" opacity="0.2"/>
        <line x1="18" y1="6" x2="18" y2="24" stroke="white" stroke-width="0.5" opacity="0.3"/>
        <!-- Cabin -->
        <path d="M33 12 L33 26 L48 26 L48 16 L42 8 L33 8 Z" fill="${color}" opacity="0.85"/>
        <!-- Windshield -->
        <path d="M35 10 L41 10 L46 16 L46 20 L35 20 Z" fill="#e0f2fe" opacity="0.85" stroke="white" stroke-width="0.5"/>
        <!-- Bumper -->
        <rect x="0" y="24" width="50" height="3" rx="1" fill="${color}" opacity="0.7"/>
        <!-- Wheels -->
        <circle cx="12" cy="27" r="4.5" fill="#1f2937" stroke="#d1d5db" stroke-width="1.5"/>
        <circle cx="12" cy="27" r="1.5" fill="#6b7280"/>
        <circle cx="42" cy="27" r="4.5" fill="#1f2937" stroke="#d1d5db" stroke-width="1.5"/>
        <circle cx="42" cy="27" r="1.5" fill="#6b7280"/>
        <!-- Mirror -->
        <rect x="48" y="13" width="3" height="5" rx="1" fill="${color}" opacity="0.6"/>
    </svg>`;
    return new L.DivIcon({
        html: svg,
        className: 'leaflet-truck-icon',
        iconSize: [48, 34],
        iconAnchor: [24, 27],
        popupAnchor: [0, -20],
    });
};

const deliveryIcon = new L.Icon({
    iconUrl: 'https://cdn-icons-png.flaticon.com/512/9402/9402416.png',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
});

const ROUTE_COLORS = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#f97316', '#6366f1', '#14b8a6'
];

export default function Tracking({ drivers, shipments = [], onRequestGps }) {
    const [selectedDriverId, setSelectedDriverId] = useState(null);
    const [gpsRequesting, setGpsRequesting] = useState(null); // driverId que estamos pidiendo
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const isToday = selectedDate === new Date().toISOString().split('T')[0];

    const [routeMode, setRouteMode] = useState('direct'); // 'direct' or 'road'
    const [roadRoutes, setRoadRoutes] = useState({}); // { driverId: { cacheKey, path } }
    const [isCalculatingRoad, setIsCalculatingRoad] = useState(false);

    const activeDrivers = useMemo(() => [...drivers], [drivers]);

    // Calcular rutas y paradas para cada conductor
    const driverRoutes = useMemo(() => {
        const routes = {};
        const [year, month, day] = selectedDate.split('-');
        const dateObj = new Date(year, month - 1, day);
        const shortDateStr = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

        activeDrivers.forEach((driver, index) => {
            // Envíos entregados ese día por este conductor
            const dayDeliveries = shipments
                .filter(s => 
                    String(s.assignedDriverId) === String(driver.id) && 
                    (s.status === 'Entregado' || s.status === 'Pendiente Cobro') &&
                    (s.updatedAt?.startsWith(selectedDate) || s.date?.includes(shortDateStr))
                )
                .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));

            const points = [];
            const stops = [];

            dayDeliveries.forEach(s => {
                if (s.deliveryCoordinates) {
                    const [lat, lng] = s.deliveryCoordinates.split(',').map(c => parseFloat(c.trim()));
                    if (!isNaN(lat) && !isNaN(lng)) {
                        const pos = [lat, lng];
                        points.push(pos);
                        stops.push({
                            id: s.id,
                            pos,
                            client: s.destinationName || s.client,
                            time: new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            type: s.type
                        });
                    }
                }
            });

            // Añadir posición actual al final de la ruta solo si es hoy y existe
            if (isToday && driver.currentLat && driver.currentLng) {
                points.push([driver.currentLat, driver.currentLng]);
            }

            routes[driver.id] = {
                points,
                stops,
                color: ROUTE_COLORS[index % ROUTE_COLORS.length]
            };
        });

        return routes;
    }, [activeDrivers, shipments, selectedDate, isToday]);

    useEffect(() => {
        if (routeMode !== 'road') return;

        const fetchRoads = async () => {
            setIsCalculatingRoad(true);
            const newRoads = { ...roadRoutes };
            let updated = false;

            for (const driver of activeDrivers) {
                const route = driverRoutes[driver.id];
                if (!route || route.points.length < 2) continue;

                // Limitamos a últimos 100 puntos (límite API pública OSRM suele ser 100)
                const pointsToRoute = route.points.slice(-100);
                const coordsStr = pointsToRoute.map(p => `${p[1]},${p[0]}`).join(';');
                
                const cacheKey = coordsStr;
                if (roadRoutes[driver.id]?.cacheKey === cacheKey) continue;

                try {
                    const res = await fetch(`https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`);
                    const data = await res.json();
                    
                    if (data.code === 'Ok' && data.routes && data.routes[0]) {
                        const geometry = data.routes[0].geometry.coordinates;
                        newRoads[driver.id] = {
                            cacheKey,
                            path: geometry.map(c => [c[1], c[0]]) // convertir a [lat, lng]
                        };
                        updated = true;
                    }
                } catch (err) {
                    console.error("Error obteniendo ruta de OSRM:", err);
                }
            }
            
            if (updated) {
                setRoadRoutes(newRoads);
            }
            setIsCalculatingRoad(false);
        };

        fetchRoads();
    }, [driverRoutes, routeMode, activeDrivers]); // eslint-disable-line react-hooks/exhaustive-deps

    const formatLastUpdate = (isoString) => {
        if (!isoString) return 'Sin señal';
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        
        if (diffMins < 1) return 'Ahora mismo';
        if (diffMins < 60) return `Hace ${diffMins} min`;
        return `Hace ${Math.floor(diffMins / 60)}h ${diffMins % 60}m`;
    };

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 animate-in fade-in duration-500">
            {/* Sidebar List */}
            <div className="w-full md:w-80 bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Navigation className="text-blue-600" size={20} />
                            {isToday ? 'Mapa en Vivo' : 'Historial de Rutas'}
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <input 
                            type="date" 
                            value={selectedDate}
                            max={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 font-bold focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                        />
                        {!isToday && (
                            <button 
                                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                                className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap"
                            >
                                Hoy
                            </button>
                        )}
                    </div>
                    {isToday && (
                        <p className="text-xs text-slate-500">
                            {activeDrivers.length} vehículos activos hoy
                        </p>
                    )}
                    <div className="flex bg-slate-200 p-1 rounded-lg mt-1 relative overflow-hidden">
                        {/* Indicador animado de fondo */}
                        <div 
                            className="absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white rounded-md shadow-sm transition-all duration-300 ease-out"
                            style={{ 
                                left: routeMode === 'direct' ? '4px' : 'calc(50% + 2px)'
                            }}
                        />
                        <button 
                            onClick={() => setRouteMode('direct')}
                            className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all relative z-10 ${
                                routeMode === 'direct' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Ruta Directa
                        </button>
                        <button 
                            onClick={() => setRouteMode('road')}
                            className={`flex-1 py-1.5 text-[11px] font-bold rounded-md transition-all relative z-10 flex items-center justify-center gap-1 ${
                                routeMode === 'road' ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Calles (Real)
                            {isCalculatingRoad && routeMode === 'road' && (
                                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></div>
                            )}
                        </button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {activeDrivers.map(driver => {
                        const route = driverRoutes[driver.id];
                        const isSelected = selectedDriverId === driver.id;
                        
                        return (
                            <div 
                                key={driver.id} 
                                onClick={() => setSelectedDriverId(driver.id)}
                                className={`p-3 rounded-lg border transition-all cursor-pointer group ${
                                    isSelected ? 'bg-blue-50 border-blue-200' : 'border-slate-100 hover:bg-slate-50'
                                }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: route?.color }}></div>
                                        <span className="font-bold text-slate-700 text-sm">{driver.name}</span>
                                    </div>
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${
                                        driver.status === 'En Ruta' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {driver.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                                    <Truck size={12} />
                                    {driver.vehicle}
                                    <span className="mx-1">•</span>
                                    <Package size={12} />
                                    {route?.stops.length || 0} entregas
                                </div>
                                
                                {isToday && (
                                    <div className="flex items-center gap-2 mb-3">
                                        <div className="flex-1 flex items-center gap-1 text-[10px] text-blue-600 font-mono bg-blue-50/50 p-1.5 rounded border border-blue-100/50">
                                            <Clock size={10} />
                                            {formatLastUpdate(driver.lastGpsUpdate)}
                                        </div>
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                setGpsRequesting(driver.id);
                                                await onRequestGps?.(driver.id);
                                                setTimeout(() => setGpsRequesting(null), 4000);
                                            }}
                                            disabled={gpsRequesting === driver.id}
                                            className={`p-1.5 rounded-lg shadow-sm transition-all active:scale-90 ${
                                                gpsRequesting === driver.id
                                                    ? 'bg-amber-500 text-white animate-pulse'
                                                    : 'bg-blue-600 text-white hover:bg-blue-700'
                                            }`}
                                            title={gpsRequesting === driver.id ? 'Esperando señal...' : 'Pedir señal GPS ahora'}
                                        >
                                            <Zap size={14} fill="currentColor" />
                                        </button>
                                    </div>
                                )}

                                {isSelected && route?.stops.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-blue-100 space-y-1.5 animate-in slide-in-from-top-1">
                                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                            {isToday ? 'Recorrido de hoy:' : 'Recorrido histórico:'}
                                        </p>
                                        {route.stops.map((stop, i) => (
                                            <div key={stop.id} className="flex items-center gap-2 text-[10px] text-slate-600">
                                                <div className="w-4 h-4 bg-white border border-slate-200 rounded-full flex items-center justify-center text-[8px] font-bold text-slate-400 shrink-0">
                                                    {i + 1}
                                                </div>
                                                <span className="truncate flex-1 font-medium">{stop.client}</span>
                                                <span className="text-slate-400 font-mono italic">{stop.time}</span>
                                            </div>
                                        ))}
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
                        const route = driverRoutes[driver.id];
                        if (!route) return null;

                        return (
                            <div key={driver.id}>
                                {/* Línea de ruta */}
                                {route.points.length > 1 && (
                                    routeMode === 'road' && roadRoutes[driver.id]?.path ? (
                                        <Polyline 
                                            positions={roadRoutes[driver.id].path} 
                                            color={route.color} 
                                            weight={4} 
                                            opacity={0.8} 
                                        />
                                    ) : (
                                        <Polyline 
                                            positions={route.points} 
                                            color={route.color} 
                                            weight={3} 
                                            opacity={0.6} 
                                            dashArray="1, 8"
                                        />
                                    )
                                )}

                                {/* Marcadores de paradas */}
                                {route.stops.map((stop, i) => (
                                    <Marker 
                                        key={stop.id} 
                                        position={stop.pos} 
                                        icon={deliveryIcon}
                                    >
                                        <Popup>
                                            <div className="p-1">
                                                <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs mb-1">
                                                    <CheckCircle size={12} /> Entrega #{i + 1}
                                                </div>
                                                <h4 className="font-bold text-slate-800 text-sm whitespace-nowrap">{stop.client}</h4>
                                                <p className="text-[10px] text-slate-500 font-mono mt-1">Hora: {stop.time}</p>
                                                <p className="text-[10px] text-blue-600 font-bold mt-0.5" style={{ color: route.color }}>Repartidor: {driver.name}</p>
                                            </div>
                                        </Popup>
                                        <Tooltip direction="top" offset={[0, -10]} opacity={1}>
                                            <span className="text-[10px] font-bold text-slate-700">{stop.client}</span>
                                        </Tooltip>
                                    </Marker>
                                ))}

                                {/* Marcador del Camión (Posición Actual) - Solo si es hoy */}
                                {isToday && driver.currentLat && driver.currentLng && (
                                    <Marker position={[driver.currentLat, driver.currentLng]} icon={createTruckIcon(route.color)}>
                                        <Popup>
                                            <div className="p-2 min-w-[150px]">
                                                <div className="flex items-center justify-between mb-2">
                                                    <h3 className="font-bold text-slate-800">{driver.name}</h3>
                                                    <span className="text-[9px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">POSICIÓN ACTUAL</span>
                                                </div>
                                                <p className="text-xs text-slate-500 mb-2 flex items-center gap-1">
                                                    <Truck size={10} /> {driver.vehicle}
                                                </p>
                                                <div className="bg-slate-50 p-2 rounded border border-slate-100 mb-2">
                                                    <p className="text-[10px] text-slate-400 uppercase font-black">Última señal:</p>
                                                    <p className="text-xs font-mono font-bold text-blue-600">{formatLastUpdate(driver.lastGpsUpdate)}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <a href={`tel:${driver.phone}`} className="flex-1 bg-green-50 text-green-700 text-xs px-2 py-1.5 rounded flex items-center justify-center gap-1 hover:bg-green-100 font-medium no-underline">
                                                        <Phone size={12} /> Llamar
                                                    </a>
                                                    <button 
                                                        onClick={() => onRequestGps?.(driver.id)}
                                                        className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700 transition-colors"
                                                        title="Pedir señal"
                                                    >
                                                        <Zap size={14} fill="currentColor" />
                                                    </button>
                                                </div>
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}
                            </div>
                        );
                    })}
                </MapContainer>
            </div>
        </div>
    );
}

