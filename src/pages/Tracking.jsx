import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Truck, Phone, Navigation, Clock, CheckCircle, Package, Zap, MapPin, Layers, Play, Pause, RotateCcw } from 'lucide-react';
import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import L from 'leaflet';

// ─── Fix Leaflet icons ────────────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ─── Estilos de mapa ──────────────────────────────────────────────────────────
const MAP_STYLES = {
    street:    { label: '🗺️ Calles',   url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',         attr: '© OpenStreetMap © CARTO' },
    satellite: { label: '🛰️ Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri © DigitalGlobe' },
    dark:      { label: '🌙 Noche',    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                    attr: '© OpenStreetMap © CARTO' },
};
const STYLE_ORDER = ['street', 'satellite', 'dark'];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const parseCoords = (s) => {
    if (!s) return null;
    const p = String(s).split(',').map(x => parseFloat(x.trim()));
    if (p.length < 2 || isNaN(p[0]) || isNaN(p[1])) return null;
    return [p[0], p[1]];
};
const getStopCoords = (s) => {
    if (s.type === 'Recogida') return parseCoords(s.originCoordinates);
    return parseCoords(s.destinationCoordinates) || parseCoords(s.deliveryCoordinates);
};
const getStopAddress = (s) => {
    const addr = s.type === 'Recogida'
        ? `${s.originAddress || ''}, ${s.originCity || ''}`
        : `${s.destinationAddress || ''}, ${s.destinationCity || ''}`;
    return addr.replace(/^,\s*|,\s*$/g, '').trim();
};
const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s) => {
    const min = Math.round(s / 60);
    if (min < 1) return `${Math.round(s)}s`;
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h ${min % 60}min`;
};
const fmtClock = (ms) => new Date(ms).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
const geocodeAddress = async (address) => {
    const q = encodeURIComponent(`${address}, España`);
    const url = `https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&countrycodes=es`;
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal, headers: { 'User-Agent': 'SumtransLogistica/1.0' } });
        clearTimeout(t);
        const data = await res.json();
        if (data?.[0]) return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
    } catch (_) {}
    return null;
};
const OSRM_SERVERS = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];
const fetchRoadSegment = async (from, to) => {
    const c = `${from[1]},${from[0]};${to[1]},${to[0]}`;
    for (const srv of OSRM_SERVERS) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 7000);
            const res = await fetch(`${srv}/route/v1/driving/${c}?overview=full&geometries=geojson&steps=false`, { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
                const r = data.routes[0];
                return { coords: r.geometry.coordinates.map(([lng, lat]) => [lat, lng]), distance: r.distance, duration: r.duration };
            }
        } catch (_) {}
    }
    return { coords: [from, to], distance: null, duration: null };
};
const calcBearing = (p1, p2) => {
    const r = d => d * Math.PI / 180;
    const y = Math.sin(r(p2[1] - p1[1])) * Math.cos(r(p2[0]));
    const x = Math.cos(r(p1[0])) * Math.sin(r(p2[0])) - Math.sin(r(p1[0])) * Math.cos(r(p2[0])) * Math.cos(r(p2[1] - p1[1]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};

// ─── Colores ──────────────────────────────────────────────────────────────────
const STOP_COLORS  = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#0ea5e9','#a855f7','#f43f5e','#10b981','#fb923c'];
const ROUTE_COLORS = ['#3b82f6','#ef4444','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#f97316','#6366f1','#14b8a6'];

// ─── Iconos ───────────────────────────────────────────────────────────────────
const createTruckIcon = (color) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 36" width="52" height="36">
        <rect x="1" y="4" width="32" height="22" rx="3" fill="${color}"/>
        <rect x="3" y="7" width="10" height="16" rx="1.5" fill="white" opacity="0.2"/>
        <path d="M33 12 L33 26 L48 26 L48 16 L42 8 L33 8 Z" fill="${color}" opacity="0.85"/>
        <path d="M35 10 L41 10 L46 16 L46 20 L35 20 Z" fill="#e0f2fe" opacity="0.85" stroke="white" stroke-width="0.5"/>
        <rect x="0" y="24" width="50" height="3" rx="1" fill="${color}" opacity="0.7"/>
        <circle cx="12" cy="27" r="4.5" fill="#1f2937" stroke="#d1d5db" stroke-width="1.5"/>
        <circle cx="12" cy="27" r="1.5" fill="#6b7280"/>
        <circle cx="42" cy="27" r="4.5" fill="#1f2937" stroke="#d1d5db" stroke-width="1.5"/>
        <circle cx="42" cy="27" r="1.5" fill="#6b7280"/>
        <rect x="48" y="13" width="3" height="5" rx="1" fill="${color}" opacity="0.6"/>
    </svg>`;
    return new L.DivIcon({ html: svg, className: '', iconSize: [52, 36], iconAnchor: [26, 28], popupAnchor: [0, -22] });
};

const numberedIcon = (num, color, geocoded = false) => L.divIcon({

    className: '',
    html: `<div style="background:${color};color:white;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 12px rgba(0,0,0,0.4);border:${geocoded ? '2px dashed white' : '2.5px solid white'}">
        <span style="transform:rotate(45deg);font-size:12px;font-weight:900">${num}</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
});
const doneIcon = (isTimeline = false) => L.divIcon({
    className: '',
    html: `<div style="background:${isTimeline ? '#2563eb' : '#16a34a'};color:white;width:24px;height:24px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:13px;
        box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid white;opacity:${isTimeline ? '1' : '0.9'}">
        ${isTimeline ? '●' : '✓'}</div>`,
    iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -14],
});
const arrowIcon = (color, bearing) => L.divIcon({
    className: '',
    html: `<div style="color:${color};font-size:16px;font-weight:900;transform:rotate(${bearing}deg);text-shadow:0 0 4px rgba(0,0,0,0.6)">▲</div>`,
    iconSize: [16, 16], iconAnchor: [8, 8],
});

// ─── FitBounds ────────────────────────────────────────────────────────────────
function FitBounds({ positions, triggerKey }) {
    const map = useMap();
    useEffect(() => {
        if (!positions?.length) return;
        if (positions.length === 1) { map.setView(positions[0], 14); return; }
        try { map.fitBounds(L.latLngBounds(positions), { padding: [60, 60] }); } catch (_) {}
    }, [triggerKey]); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}

// ─── TileLayer que se actualiza al cambiar estilo ────────────────────────────
function DynamicTileLayer({ styleKey }) {
    const map = useMap();
    const style = MAP_STYLES[styleKey];
    useEffect(() => {
        // Forzar re-render del tile layer cambiando su URL
    }, [styleKey]);
    return <TileLayer key={styleKey} url={style.url} attribution={style.attr} />;
}

// ─────────────────────────────────────────────────────────────────────────────
export default function Tracking({ drivers, shipments = [], onRequestGps }) {
    const [selectedDriverId, setSelectedDriverId] = useState(null);
    const [gpsRequesting, setGpsRequesting]       = useState(null);
    const [selectedDate, setSelectedDate]         = useState(() => new Date().toISOString().split('T')[0]);
    const isToday = selectedDate === new Date().toISOString().split('T')[0];

    // ── Estilos de mapa ───────────────────────────────────────────────────────
    const [mapStyleKey, setMapStyleKey] = useState('street');
    const cycleStyle = useCallback(() => {
        setMapStyleKey(k => STYLE_ORDER[(STYLE_ORDER.indexOf(k) + 1) % STYLE_ORDER.length]);
    }, []);

    // ── Timeline / Reproducción ───────────────────────────────────────────────
    const [timelineActive, setTimelineActive]   = useState(false);
    const [timelineMs, setTimelineMs]           = useState(Date.now());
    const [timelinePlaying, setTimelinePlaying] = useState(false);
    const playIntervalRef = useRef(null);

    // ── Estado ruta planificada ───────────────────────────────────────────────
    const [pendingGeocoded, setPendingGeocoded]   = useState({});
    const [pendingGeocoding, setPendingGeocoding] = useState(false);
    const [pendingSegments, setPendingSegments]   = useState([]);
    const [pendingSegStats, setPendingSegStats]   = useState({});
    const [pendingLoading, setPendingLoading]     = useState(false);

    const activeDrivers = useMemo(() => [...drivers], [drivers]);

    // ── Envíos pendientes — mismo filtro que usa el conductor ─────────────────
    const todayStr = new Date().toISOString().split('T')[0];
    const pendingByDriver = useMemo(() => {
        const result = {};
        activeDrivers.forEach(driver => {
            const pending = shipments.filter(s => {
                if (!s) return false;
                if (Number(s.assignedDriverId) !== Number(driver.id)) return false;
                if (s.status === 'Entregado' || s.status === 'Entrega aplazada') return false;
                if (s.type === 'Recibo') return false;
                if (s.scheduledDate) {
                    const sch = s.scheduledDate.slice(0, 10);
                    if (sch > todayStr) return false;
                }
                return true;
            });
            if (driver.routeOrder?.length > 0) {
                const orderMap = new Map(driver.routeOrder.map((id, i) => [String(id), i]));
                pending.sort((a, b) => {
                    const ia = orderMap.has(String(a.id)) ? orderMap.get(String(a.id)) : 9999;
                    const ib = orderMap.has(String(b.id)) ? orderMap.get(String(b.id)) : 9999;
                    return ia - ib;
                });
            }
            result[driver.id] = pending;
        });
        return result;
    }, [activeDrivers, shipments, todayStr]);

    // ── Entregas completadas (para marcar en el mapa + timeline) ──────────────
    const coordsFromShipment = (s) => {
        const raw = s.deliveryCoordinates || s.destinationCoordinates || s.originCoordinates || null;
        if (!raw) return null;
        const [lat, lng] = String(raw).split(',').map(c => parseFloat(c.trim()));
        return (!isNaN(lat) && !isNaN(lng)) ? [lat, lng] : null;
    };
    const matchesDate = (s) => {
        const ref = s.deliveredAt || s.updatedAt || s.date || '';
        return ref.startsWith(selectedDate) || String(s.date || '').startsWith(selectedDate);
    };

    const driverRoutes = useMemo(() => {
        const routes = {};
        activeDrivers.forEach((driver, index) => {
            const dayDeliveries = shipments
                .filter(s =>
                    Number(s.assignedDriverId) === Number(driver.id) &&
                    (s.status === 'Entregado' || s.status === 'Pendiente Cobro' || s.status === 'Entrega aplazada') &&
                    matchesDate(s)
                )
                .sort((a, b) => new Date(a.deliveredAt || a.updatedAt) - new Date(b.deliveredAt || b.updatedAt));

            const points = [];
            const stops  = [];
            dayDeliveries.forEach(s => {
                const pos = coordsFromShipment(s);
                if (pos) {
                    const rawTime = s.deliveredAt || s.updatedAt;
                    const timeMs  = rawTime ? new Date(rawTime).getTime() : null;
                    points.push(pos);
                    stops.push({
                        id: s.id, pos, timeMs,
                        client: s.destinationName || s.client || s.origin || '?',
                        time:   rawTime ? new Date(rawTime).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '--:--',
                        status: s.status,
                    });
                }
            });
            if (isToday && driver.currentLat && driver.currentLng) {
                points.push([driver.currentLat, driver.currentLng]);
            }
            routes[driver.id] = { points, stops, color: ROUTE_COLORS[index % ROUTE_COLORS.length] };
        });
        return routes;
    }, [activeDrivers, shipments, selectedDate, isToday]);

    // ── Timeline: rango de tiempo ─────────────────────────────────────────────
    const allTimestamps = useMemo(() =>
        Object.values(driverRoutes).flatMap(r => r.stops.map(s => s.timeMs)).filter(Boolean),
    [driverRoutes]);
    const timelineMin = allTimestamps.length > 0 ? Math.min(...allTimestamps) : Date.now() - 8 * 3600000;
    const timelineMax = Date.now();

    // Auto-play del timeline (avanza 30 min cada 600ms)
    useEffect(() => {
        if (timelinePlaying) {
            playIntervalRef.current = setInterval(() => {
                setTimelineMs(prev => {
                    if (prev >= timelineMax) { setTimelinePlaying(false); return timelineMax; }
                    return prev + 30 * 60 * 1000;
                });
            }, 600);
        } else {
            clearInterval(playIntervalRef.current);
        }
        return () => clearInterval(playIntervalRef.current);
    }, [timelinePlaying, timelineMax]);

    // Reset timeline cuando se desactiva
    useEffect(() => {
        if (!timelineActive) { setTimelinePlaying(false); setTimelineMs(Date.now()); }
    }, [timelineActive]);

    // ── Conductor seleccionado ────────────────────────────────────────────────
    const selectedDriver   = activeDrivers.find(d => String(d.id) === String(selectedDriverId));
    const selectedRoute    = selectedDriverId ? driverRoutes[selectedDriverId] : null;
    const selectedPending  = selectedDriverId ? (pendingByDriver[selectedDriverId] || []) : [];
    const selectedColor    = selectedRoute?.color || '#6366f1';
    const driverPos        = selectedDriver?.currentLat && selectedDriver?.currentLng
        ? [selectedDriver.currentLat, selectedDriver.currentLng] : null;

    // Stops filtrados por timeline (si está activo)
    const filteredStops = (stops) => timelineActive
        ? stops.filter(s => s.timeMs && s.timeMs <= timelineMs)
        : stops;

    // Posición del conductor en el tiempo del slider
    const timelineDriverPos = useMemo(() => {
        if (!selectedDriverId || !timelineActive) return null;
        const done = filteredStops(selectedRoute?.stops || []);
        if (done.length > 0) return done[done.length - 1].pos;
        return driverPos;
    }, [selectedDriverId, timelineActive, timelineMs, selectedRoute?.stops]);

    // Paradas pendientes enriquecidas
    const rawPendingStops = useMemo(() => {
        return selectedPending.map((s, i) => ({
            ...s, _index: i + 1, _color: STOP_COLORS[i % STOP_COLORS.length],
            _label: s.type === 'Recogida' ? (s.client || s.originName || 'Recogida') : (s.destinationName || s.client || 'Entrega'),
            _isRecogida: s.type === 'Recogida', _coords: getStopCoords(s),
        }));
    }, [selectedPending]);

    const pendingStops = rawPendingStops.map(s => ({
        ...s, _coords: s._coords || pendingGeocoded[s.id] || null,
        _geocoded: !s._coords && !!pendingGeocoded[s.id],
    }));
    const pendingStopsWithCoords = pendingStops.filter(s => s._coords);
    const allPendingPositions = driverPos
        ? [driverPos, ...pendingStopsWithCoords.map(s => s._coords)]
        : pendingStopsWithCoords.map(s => s._coords);

    const allVisiblePositions = useMemo(() => {
        if (!selectedDriverId) return [];
        const completed = (selectedRoute?.stops || []).map(s => s.pos);
        const pending   = pendingStopsWithCoords.map(s => s._coords);
        const truck     = driverPos ? [driverPos] : [];
        return [...completed, ...pending, ...truck];
    }, [selectedDriverId, selectedRoute?.stops?.length, pendingStopsWithCoords.length, !!driverPos]);

    // ── Geocodificación de paradas pendientes ─────────────────────────────────
    useEffect(() => {
        if (!selectedDriverId) { setPendingGeocoded({}); setPendingSegments([]); setPendingSegStats({}); return; }
        const stopsNoGPS = rawPendingStops.filter(s => !s._coords && getStopAddress(s).length > 3);
        if (!stopsNoGPS.length) { setPendingGeocoding(false); return; }
        let cancelled = false;
        setPendingGeocoding(true);
        const run = async () => {
            for (const stop of stopsNoGPS) {
                if (cancelled) break;
                const coords = await geocodeAddress(getStopAddress(stop));
                if (coords && !cancelled) setPendingGeocoded(prev => ({ ...prev, [stop.id]: coords }));
                if (!cancelled) await new Promise(r => setTimeout(r, 1200));
            }
            if (!cancelled) setPendingGeocoding(false);
        };
        run();
        return () => { cancelled = true; };
    }, [selectedDriverId, rawPendingStops.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── OSRM: ruta pendiente ──────────────────────────────────────────────────
    const pendingCoordsKey = pendingStopsWithCoords.map(s => s.id).join(',') + (driverPos ? '|drv' : '');
    useEffect(() => {
        if (!selectedDriverId || allPendingPositions.length < 2) { setPendingSegments([]); setPendingSegStats({}); return; }
        setPendingLoading(true); setPendingSegments([]); setPendingSegStats({});
        let cancelled = false;
        const fetchAll = async () => {
            const newSegs = []; const newStats = {};
            for (let i = 0; i < allPendingPositions.length - 1; i++) {
                if (cancelled) break;
                const destIdx  = driverPos ? i : i + 1;
                const destStop = pendingStopsWithCoords[destIdx];
                const color    = destStop?._color || STOP_COLORS[i % STOP_COLORS.length];
                const seg      = await fetchRoadSegment(allPendingPositions[i], allPendingPositions[i + 1]);
                newSegs.push({ coords: seg.coords, color });
                if (destStop && seg.distance != null) newStats[destStop.id] = { distance: seg.distance, duration: seg.duration };
                if (!cancelled) { setPendingSegments([...newSegs]); setPendingSegStats({ ...newStats }); }
            }
            if (!cancelled) setPendingLoading(false);
        };
        fetchAll();
        return () => { cancelled = true; };
    }, [pendingCoordsKey]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        setPendingGeocoded({}); setPendingSegments([]); setPendingSegStats({});
    }, [selectedDriverId]);

    const pendingTotals = Object.values(pendingSegStats).reduce(
        (a, s) => ({ dist: a.dist + (s.distance || 0), dur: a.dur + (s.duration || 0) }),
        { dist: 0, dur: 0 }
    );

    const formatLastUpdate = (iso) => {
        if (!iso) return 'Sin señal';
        const diff = Math.floor((Date.now() - new Date(iso)) / 60000);
        if (diff < 1)  return 'Ahora mismo';
        if (diff < 60) return `Hace ${diff} min`;
        return `Hace ${Math.floor(diff / 60)}h ${diff % 60}m`;
    };

    const timelineSliderPct = allTimestamps.length > 0
        ? Math.max(0, Math.min(100, ((timelineMs - timelineMin) / (timelineMax - timelineMin)) * 100))
        : 100;

    return (
        <div className="h-[calc(100vh-6rem)] flex flex-col md:flex-row gap-4 animate-in fade-in duration-500">

            {/* ── Sidebar ── */}
            <div className="w-full md:w-80 bg-white rounded-xl shadow-lg border border-slate-100 flex flex-col overflow-hidden shrink-0">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-bold text-slate-800 flex items-center gap-2">
                            <Navigation className="text-blue-600" size={20} />
                            {isToday ? 'Mapa en Vivo' : 'Historial de Rutas'}
                        </h2>
                        {selectedDriverId && (
                            <button onClick={() => setSelectedDriverId(null)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                                ✕ Deseleccionar
                            </button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="date" value={selectedDate} max={new Date().toISOString().split('T')[0]}
                            onChange={e => { setSelectedDate(e.target.value); setTimelineActive(false); }}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg text-slate-700 font-bold focus:ring-2 focus:ring-blue-500/20 outline-none bg-white"
                        />
                        {!isToday && (
                            <button onClick={() => { setSelectedDate(new Date().toISOString().split('T')[0]); setTimelineActive(false); }}
                                className="px-3 py-1.5 text-xs font-bold text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors whitespace-nowrap">
                                Hoy
                            </button>
                        )}
                    </div>
                    <p className="text-xs text-slate-500">{activeDrivers.length} vehículos · pulsa un conductor para ver su ruta completa</p>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {activeDrivers.map(driver => {
                        const route      = driverRoutes[driver.id];
                        const isSelected = String(selectedDriverId) === String(driver.id);
                        const pending    = pendingByDriver[driver.id] || [];
                        const doneStops  = timelineActive ? filteredStops(route?.stops || []) : (route?.stops || []);
                        const doneCount  = doneStops.length;

                        return (
                            <div key={driver.id}
                                onClick={() => setSelectedDriverId(isSelected ? null : driver.id)}
                                className={`p-3 rounded-xl border transition-all cursor-pointer ${isSelected
                                    ? 'bg-indigo-50 border-indigo-300 shadow-md'
                                    : 'border-slate-100 hover:bg-slate-50 hover:border-slate-200'}`}
                            >
                                <div className="flex justify-between items-center mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: route?.color }} />
                                        <span className="font-bold text-slate-800 text-sm">{driver.name}</span>
                                    </div>
                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase ${driver.status === 'En Ruta' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                        {driver.status}
                                    </span>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-slate-500 mb-2">
                                    <span className="flex items-center gap-1"><Truck size={11} />{driver.vehicle}</span>
                                    {doneCount > 0 && <span className="flex items-center gap-1 text-green-600 font-bold"><CheckCircle size={11} />{doneCount} hechas</span>}
                                    {!timelineActive && pending.length > 0 && <span className="flex items-center gap-1 text-amber-600 font-bold"><Package size={11} />{pending.length} pend.</span>}
                                </div>
                                {isToday && (
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="flex-1 flex items-center gap-1 text-[10px] text-blue-600 font-mono bg-blue-50/50 p-1.5 rounded border border-blue-100/50">
                                            <Clock size={10} />{formatLastUpdate(driver.lastGpsUpdate)}
                                        </div>
                                        <button
                                            onClick={async e => { e.stopPropagation(); setGpsRequesting(driver.id); await onRequestGps?.(driver.id); setTimeout(() => setGpsRequesting(null), 4000); }}
                                            disabled={gpsRequesting === driver.id}
                                            className={`p-1.5 rounded-lg shadow-sm transition-all active:scale-90 ${gpsRequesting === driver.id ? 'bg-amber-500 text-white animate-pulse' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                                        ><Zap size={13} fill="currentColor" /></button>
                                    </div>
                                )}

                                {isSelected && (
                                    <div className="mt-2 space-y-3 animate-in slide-in-from-top-1" onClick={e => e.stopPropagation()}>
                                        {!timelineActive && (pendingTotals.dist > 0 || pendingLoading) && (
                                            <div className="p-2.5 bg-indigo-600 rounded-xl flex items-center justify-between gap-2">
                                                <span className="text-white text-[10px] font-bold uppercase tracking-wide">Ruta pendiente</span>
                                                <div className="flex items-center gap-2">
                                                    {pendingLoading && !pendingTotals.dist && <span className="text-indigo-200 text-[9px]">calculando…</span>}
                                                    {pendingTotals.dist > 0 && <>
                                                        <span className="text-white text-[10px] font-bold">📍 {fmtDist(pendingTotals.dist)}</span>
                                                        <span className="text-white text-[10px] font-bold">⏱ {fmtTime(pendingTotals.dur)}</span>
                                                        <span className="bg-white/20 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                                            🏁 {new Date(Date.now() + pendingTotals.dur * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </>}
                                                </div>
                                            </div>
                                        )}

                                        {!timelineActive && selectedPending.length > 0 && (
                                            <div>
                                                <p className="text-[9px] font-bold text-indigo-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                    <MapPin size={9} /> Por entregar
                                                    {pendingGeocoding && <span className="text-amber-500 font-normal normal-case">· geocodificando…</span>}
                                                    {pendingLoading && <span className="text-indigo-400 font-normal normal-case">· calculando ruta…</span>}
                                                </p>
                                                {(() => {
                                                    let cumDist = 0, cumDur = 0;
                                                    const now = new Date();
                                                    return pendingStops.map(stop => {
                                                        const stats = pendingSegStats[stop.id];
                                                        if (stats?.distance) cumDist += stats.distance;
                                                        if (stats?.duration) cumDur  += stats.duration;
                                                        const etaStr = cumDur > 0 ? new Date(now.getTime() + cumDur * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
                                                        return (
                                                            <div key={stop.id} className="flex items-start gap-2 py-1.5 border-b border-slate-100 last:border-0">
                                                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 mt-0.5" style={{ background: stop._color }}>{stop._index}</div>
                                                                <div className="flex-1 min-w-0">
                                                                    <p className="font-bold text-slate-700 text-[11px] truncate">{stop._label}</p>
                                                                    <p className="text-slate-400 text-[9px] truncate">{getStopAddress(stop)}</p>
                                                                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                                                        {stats && <span className="text-[9px] font-semibold" style={{ color: stop._color }}>📍 {fmtDist(stats.distance)} · ⏱ {fmtTime(stats.duration)}</span>}
                                                                        {cumDur > 0 && <span className="text-[9px] text-slate-400">∑ {fmtTime(cumDur)}</span>}
                                                                        {etaStr && <span className="bg-indigo-100 text-indigo-700 text-[9px] font-bold px-1.5 py-0.5 rounded">🕐 {etaStr}</span>}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        );
                                                    });
                                                })()}
                                            </div>
                                        )}

                                        {doneCount > 0 && (
                                            <div>
                                                <p className="text-[9px] font-bold text-green-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                                                    <CheckCircle size={9} /> {timelineActive ? `Entregado a las ${fmtClock(timelineMs)}` : `Entregado hoy (${doneCount})`}
                                                </p>
                                                {doneStops.map((stop, i) => (
                                                    <div key={stop.id} className="flex items-center gap-2 py-1 border-b border-slate-100 last:border-0">
                                                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0 ${timelineActive ? 'bg-blue-500' : 'bg-green-500'}`}>
                                                            {timelineActive ? '●' : '✓'}
                                                        </div>
                                                        <span className="truncate flex-1 text-[10px] text-slate-600 font-medium">{stop.client}</span>
                                                        <span className="text-slate-400 font-mono text-[9px]">{stop.time}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {selectedPending.length === 0 && doneCount === 0 && (
                                            <p className="text-xs text-slate-400 text-center py-2">Sin envíos asignados hoy</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* ── Mapa + Timeline ── */}
            <div className="flex-1 flex flex-col gap-2 min-h-0">

                {/* Mapa */}
                <div className="flex-1 rounded-xl overflow-hidden shadow-lg border border-slate-300 relative z-0 min-h-0">
                    <MapContainer center={[40.4168, -3.7038]} zoom={6} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
                        <DynamicTileLayer styleKey={mapStyleKey} />

                        {selectedDriverId && allVisiblePositions.length > 0 && (
                            <FitBounds positions={allVisiblePositions} triggerKey={selectedDriverId} />
                        )}

                        {/* ── Vista global ── */}
                        {!selectedDriverId && activeDrivers.map(driver => {
                            const route = driverRoutes[driver.id];
                            if (!route) return null;
                            const visStops = filteredStops(route.stops);
                            const visPoints = [...visStops.map(s => s.pos), ...(isToday && !timelineActive && driver.currentLat ? [[driver.currentLat, driver.currentLng]] : [])];
                            return (
                                <span key={driver.id}>
                                    {visPoints.length > 1 && (
                                        <Polyline positions={visPoints} color={route.color} weight={3} opacity={0.5} dashArray="4, 8" />
                                    )}
                                    {visStops.map((stop, i) => (
                                        <Marker key={stop.id} position={stop.pos} icon={doneIcon(timelineActive)}>
                                            <Popup>
                                                <div className="p-1">
                                                    <p className="font-bold text-sm">{stop.client}</p>
                                                    <p className="text-xs text-slate-500">Entregado a las {stop.time}</p>
                                                    <p className="text-xs font-bold mt-1" style={{ color: route.color }}>{driver.name}</p>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    ))}
                                    {isToday && !timelineActive && driver.currentLat && driver.currentLng && (
                                        <Marker position={[driver.currentLat, driver.currentLng]} icon={createTruckIcon(route.color)}>
                                            <Popup>
                                                <div className="p-2">
                                                    <p className="font-bold">{driver.name}</p>
                                                    <p className="text-xs text-slate-500">{formatLastUpdate(driver.lastGpsUpdate)}</p>
                                                </div>
                                            </Popup>
                                        </Marker>
                                    )}
                                </span>
                            );
                        })}

                        {/* ── Vista conductor seleccionado ── */}
                        {selectedDriverId && (
                            <>
                                {isToday && !timelineActive && activeDrivers
                                    .filter(d => String(d.id) !== String(selectedDriverId) && d.currentLat && d.currentLng)
                                    .map(d => (
                                        <Marker key={d.id} position={[d.currentLat, d.currentLng]} icon={createTruckIcon('#94a3b8')}>
                                            <Popup><strong>{d.name}</strong></Popup>
                                        </Marker>
                                    ))
                                }

                                {/* Entregas completadas (o filtradas por timeline) */}
                                {filteredStops(selectedRoute?.stops || []).map((stop, i) => (
                                    <Marker key={stop.id} position={stop.pos} icon={doneIcon(timelineActive)}>
                                        <Popup>
                                            <div className="p-1">
                                                <div className={`flex items-center gap-1 font-bold text-xs mb-1 ${timelineActive ? 'text-blue-600' : 'text-green-600'}`}>
                                                    <CheckCircle size={11} /> Entrega #{i + 1} {timelineActive ? '(en timeline)' : 'completada'}
                                                </div>
                                                <p className="font-bold text-sm">{stop.client}</p>
                                                <p className="text-xs text-slate-500 font-mono">Hora: {stop.time}</p>
                                            </div>
                                        </Popup>
                                        <Tooltip direction="top" offset={[0, -8]} opacity={1}>
                                            <span className="text-[10px] font-bold" style={{ color: timelineActive ? '#2563eb' : '#16a34a' }}>
                                                {timelineActive ? '●' : '✓'} {stop.client}
                                            </span>
                                        </Tooltip>
                                    </Marker>
                                ))}

                                {/* Camión — posición actual o posición en timeline */}
                                {(timelineActive ? timelineDriverPos : driverPos) && (
                                    <Marker position={timelineActive ? timelineDriverPos : driverPos} icon={createTruckIcon(selectedColor)}>
                                        <Popup>
                                            <div className="p-2 min-w-[160px]">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <h3 className="font-bold text-slate-800">{selectedDriver?.name}</h3>
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold ${timelineActive ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                                                        {timelineActive ? fmtClock(timelineMs) : 'LIVE'}
                                                    </span>
                                                </div>
                                                {!timelineActive && <>
                                                    <p className="text-xs text-slate-500 mb-2">{formatLastUpdate(selectedDriver?.lastGpsUpdate)}</p>
                                                    <div className="flex gap-2">
                                                        <a href={`tel:${selectedDriver?.phone}`} className="flex-1 bg-green-50 text-green-700 text-xs px-2 py-1.5 rounded flex items-center justify-center gap-1 no-underline font-medium hover:bg-green-100">
                                                            <Phone size={11} /> Llamar
                                                        </a>
                                                        <button onClick={() => onRequestGps?.(selectedDriverId)} className="bg-blue-600 text-white p-1.5 rounded hover:bg-blue-700">
                                                            <Zap size={13} fill="currentColor" />
                                                        </button>
                                                    </div>
                                                </>}
                                            </div>
                                        </Popup>
                                    </Marker>
                                )}

                                {/* Ruta pendiente (solo cuando NO está en timeline) */}
                                {!timelineActive && pendingSegments.map((seg, i) => {
                                    const mid = seg.coords[Math.floor(seg.coords.length / 2)];
                                    const p1  = seg.coords[Math.max(0, Math.floor(seg.coords.length / 2) - 1)];
                                    return (
                                        <span key={i}>
                                            <Polyline positions={seg.coords} color={seg.color} weight={6} opacity={0.9} />
                                            {mid && p1 && mid !== p1 && <Marker position={mid} icon={arrowIcon(seg.color, calcBearing(p1, mid))} />}
                                        </span>
                                    );
                                })}
                                {!timelineActive && pendingStopsWithCoords.map(stop => {
                                    const stats = pendingSegStats[stop.id];
                                    return (
                                        <Marker key={stop.id} position={stop._coords} icon={numberedIcon(stop._index, stop._color, stop._geocoded)}>
                                            <Popup minWidth={190}>
                                                <div style={{ fontFamily: 'sans-serif' }}>
                                                    <div style={{ background: stop._color, color: 'white', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 5 }}>
                                                        #{stop._index} · {stop._isRecogida ? 'Recogida' : 'Entrega'}
                                                        {stop._geocoded && <span style={{ opacity: 0.8, marginLeft: 4 }}>(aprox.)</span>}
                                                    </div>
                                                    <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 13 }}>{stop._label}</p>
                                                    <p style={{ color: '#475569', fontSize: 11, margin: '0 0 6px' }}>{getStopAddress(stop)}</p>
                                                    {stats && <p style={{ color: stop._color, fontSize: 11, fontWeight: 700, margin: 0 }}>
                                                        📍 {fmtDist(stats.distance)} · ⏱ {fmtTime(stats.duration)}
                                                    </p>}
                                                </div>
                                            </Popup>
                                        </Marker>
                                    );
                                })}
                            </>
                        )}
                    </MapContainer>

                    {/* ── Botón cambio de estilo de mapa ── */}
                    <button onClick={cycleStyle} style={{
                        position: 'absolute', bottom: 24, right: 12, zIndex: 1000,
                        background: 'rgba(15,23,42,0.88)', backdropFilter: 'blur(8px)',
                        border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12,
                        padding: '8px 14px', color: 'white', cursor: 'pointer',
                        fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.5)', transition: 'all 0.2s',
                    }}>
                        <Layers size={14} /> {MAP_STYLES[mapStyleKey].label}
                    </button>

                    {/* ── Banner flotante ── */}
                    {selectedDriverId && selectedDriver && (
                        <div style={{
                            position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
                            zIndex: 1000, background: 'rgba(15,23,42,0.92)', backdropFilter: 'blur(12px)',
                            border: `1px solid ${timelineActive ? '#3b82f6' : selectedColor}50`, borderRadius: 14,
                            padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12,
                            boxShadow: '0 6px 24px rgba(0,0,0,0.4)', color: 'white', fontSize: 12,
                            flexWrap: 'wrap', maxWidth: 'calc(100% - 40px)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{ width: 10, height: 10, borderRadius: '50%', background: timelineActive ? '#3b82f6' : selectedColor, boxShadow: `0 0 8px ${timelineActive ? '#3b82f6' : selectedColor}` }} />
                                <strong style={{ color: '#f1f5f9' }}>{selectedDriver.name}</strong>
                            </div>
                            {timelineActive && (
                                <span style={{ background: '#1d4ed820', color: '#60a5fa', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                    ⏪ {fmtClock(timelineMs)}
                                </span>
                            )}
                            {!timelineActive && (filteredStops(selectedRoute?.stops || []).length || 0) > 0 && (
                                <span style={{ background: '#16a34a30', color: '#4ade80', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                    ✓ {filteredStops(selectedRoute?.stops || []).length} entregadas
                                </span>
                            )}
                            {!timelineActive && selectedPending.length > 0 && (
                                <span style={{ background: '#f59e0b20', color: '#fbbf24', borderRadius: 8, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                                    ⏳ {selectedPending.length} pendientes
                                </span>
                            )}
                            {!timelineActive && pendingTotals.dist > 0 && <>
                                <span style={{ color: '#60a5fa', fontWeight: 700 }}>📍 {fmtDist(pendingTotals.dist)}</span>
                                <span style={{ color: '#34d399', fontWeight: 700 }}>⏱ {fmtTime(pendingTotals.dur)}</span>
                                <span style={{ background: '#166534', color: '#4ade80', borderRadius: 8, padding: '2px 10px', fontSize: 11, fontWeight: 800 }}>
                                    🏁 {new Date(Date.now() + pendingTotals.dur * 1000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </>}
                            {(pendingLoading || pendingGeocoding) && !timelineActive && <span style={{ color: '#fbbf24', fontWeight: 400, fontSize: 11 }}>calculando…</span>}
                            <button onClick={() => setSelectedDriverId(null)}
                                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '3px 10px', cursor: 'pointer', color: 'white', fontSize: 11 }}>
                                ✕
                            </button>
                        </div>
                    )}
                </div>

                {/* ── Barra de Timeline ── */}
                {allTimestamps.length > 0 && (
                    <div style={{
                        background: timelineActive ? 'rgba(15,23,42,0.97)' : 'rgba(15,23,42,0.88)',
                        backdropFilter: 'blur(12px)',
                        border: `1px solid ${timelineActive ? '#3b82f640' : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 14, padding: '10px 16px',
                        display: 'flex', alignItems: 'center', gap: 12,
                        transition: 'all 0.3s', flexWrap: 'wrap',
                    }}>
                        {/* Toggle timeline */}
                        <button
                            onClick={() => setTimelineActive(a => !a)}
                            style={{
                                background: timelineActive ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                                border: 'none', borderRadius: 8, padding: '6px 12px',
                                color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap',
                                transition: 'all 0.2s',
                            }}>
                            <RotateCcw size={12} /> {timelineActive ? 'Salir' : 'Reproducción'}
                        </button>

                        {timelineActive && (
                            <>
                                {/* Play/Pause */}
                                <button
                                    onClick={() => setTimelinePlaying(p => !p)}
                                    style={{
                                        background: timelinePlaying ? '#ef4444' : '#22c55e',
                                        border: 'none', borderRadius: 8, padding: '6px 10px',
                                        color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center',
                                        transition: 'all 0.2s',
                                    }}>
                                    {timelinePlaying ? <Pause size={14} /> : <Play size={14} />}
                                </button>

                                {/* Hora actual del slider */}
                                <span style={{ color: '#60a5fa', fontWeight: 800, fontSize: 13, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                                    {fmtClock(timelineMs)}
                                </span>

                                {/* Slider */}
                                <div style={{ flex: 1, minWidth: 120, position: 'relative', display: 'flex', alignItems: 'center' }}>
                                    <div style={{
                                        position: 'absolute', height: 4, borderRadius: 2,
                                        left: 0, width: `${timelineSliderPct}%`,
                                        background: 'linear-gradient(90deg, #3b82f6, #8b5cf6)',
                                        pointerEvents: 'none',
                                    }} />
                                    <input
                                        type="range"
                                        min={timelineMin}
                                        max={timelineMax}
                                        value={timelineMs}
                                        onChange={e => { setTimelinePlaying(false); setTimelineMs(Number(e.target.value)); }}
                                        style={{ width: '100%', accentColor: '#3b82f6', cursor: 'pointer' }}
                                    />
                                </div>

                                {/* Horas inicio/fin */}
                                <span style={{ color: '#475569', fontSize: 10, whiteSpace: 'nowrap' }}>
                                    {fmtClock(timelineMin)} – {fmtClock(timelineMax)}
                                </span>

                                {/* Reset */}
                                <button
                                    onClick={() => { setTimelinePlaying(false); setTimelineMs(timelineMin); }}
                                    style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 8, padding: '6px 10px', color: '#94a3b8', cursor: 'pointer', fontSize: 11 }}>
                                    ⏮
                                </button>
                            </>
                        )}

                        {!timelineActive && (
                            <span style={{ color: '#475569', fontSize: 11 }}>
                                ⏪ Activa la <strong style={{ color: '#60a5fa' }}>Reproducción</strong> para ver cómo fue avanzando la ruta del día
                            </span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
