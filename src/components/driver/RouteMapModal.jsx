import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Polyline, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Navigation, AlertCircle, Map, Layers, Clock, Ruler } from 'lucide-react';

// ─── Fix Leaflet icon paths ───────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ─── Estilos de mapa ──────────────────────────────────────────────────────────
const MAP_STYLES = {
    street:    { label: '🗺️ Calles',   url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',         attr: '© OpenStreetMap © CARTO' },
    satellite: { label: '🛰️ Satélite', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: '© Esri © DigitalGlobe' },
    dark:      { label: '🌙 Noche',    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',                    attr: '© OpenStreetMap © CARTO' },
};
const STYLE_ORDER = ['street', 'satellite', 'dark'];

// ─── Colores por parada ───────────────────────────────────────────────────────
const COLORS = ['#ef4444','#f97316','#eab308','#22c55e','#06b6d4','#8b5cf6','#ec4899','#14b8a6','#0ea5e9','#a855f7','#f43f5e','#10b981','#fb923c'];

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
const getStopAddress = (stop) => {
    const addr = stop._isRecogida
        ? `${stop.originAddress || ''}, ${stop.originCity || ''}`
        : `${stop.destinationAddress || ''}, ${stop.destinationCity || ''}`;
    return addr.replace(/^,\s*|,\s*$/g, '').trim();
};
const getLocationString = (stop) => {
    const addr = getStopAddress(stop).replace(/,\s*$/, '').trim();
    if (addr.length > 3) return addr;
    if (stop._coords) return `${stop._coords[0]},${stop._coords[1]}`;
    return null;
};
const fmtDist = (m) => m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
const fmtTime = (s) => {
    const min = Math.round(s / 60);
    if (min < 1) return `${Math.round(s)}s`;
    if (min < 60) return `${min} min`;
    return `${Math.floor(min / 60)}h ${min % 60}min`;
};

// ─── Nominatim: geocodificar dirección → coordenadas ──────────────────────────
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

// ─── OSRM: ruta real por carretera ────────────────────────────────────────────
const OSRM_SERVERS = ['https://router.project-osrm.org', 'https://routing.openstreetmap.de/routed-car'];
const fetchRoadSegment = async (from, to) => {
    const c = `${from[1]},${from[0]};${to[1]},${to[0]}`;
    for (const srv of OSRM_SERVERS) {
        const url = `${srv}/route/v1/driving/${c}?overview=full&geometries=geojson&steps=false`;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 7000);
            const res = await fetch(url, { signal: ctrl.signal });
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

// ─── Flechas de dirección ─────────────────────────────────────────────────────
const calcBearing = (p1, p2) => {
    const r = d => d * Math.PI / 180;
    const y = Math.sin(r(p2[1] - p1[1])) * Math.cos(r(p2[0]));
    const x = Math.cos(r(p1[0])) * Math.sin(r(p2[0])) - Math.sin(r(p1[0])) * Math.cos(r(p2[0])) * Math.cos(r(p2[1] - p1[1]));
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
};
const arrowIcon = (color, bearing) => L.divIcon({
    className: '',
    html: `<div style="color:${color};font-size:18px;font-weight:900;transform:rotate(${bearing}deg);text-shadow:0 0 4px rgba(0,0,0,0.6)">▲</div>`,
    iconSize: [18, 18], iconAnchor: [9, 9],
});

// ─── Icono numerado ───────────────────────────────────────────────────────────
const numberedIcon = (num, color, geocoded = false) => L.divIcon({
    className: '',
    html: `<div style="background:${color};color:white;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 3px 10px rgba(0,0,0,0.4);border:${geocoded ? '2px dashed white' : '2.5px solid white'}">
        <span style="transform:rotate(45deg);font-size:12px;font-weight:900">${num}</span></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -34],
});
const driverIcon = (live) => L.divIcon({
    className: '',
    html: `<div style="background:${live ? '#16a34a' : '#1d4ed8'};color:white;width:42px;height:42px;border-radius:50%;
        display:flex;align-items:center;justify-content:center;font-size:20px;
        box-shadow:0 0 0 6px rgba(${live ? '22,163,74' : '29,78,216'},0.3);border:3px solid white">🚚</div>`,
    iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -24],
});

// ─── Fit mapa ─────────────────────────────────────────────────────────────────
function FitBounds({ positions }) {
    const map = useMap();
    useEffect(() => {
        if (!positions?.length) return;
        if (positions.length === 1) { map.setView(positions[0], 15); return; }
        try { map.fitBounds(L.latLngBounds(positions), { padding: [50, 50] }); } catch (_) {}
    }, [positions?.length]);
    return null;
}

// ─── URLs navegación Google Maps ──────────────────────────────────────────────
const singleNavUrl = (stop, driverCoords) => {
    const dest = stop._coords ? `${stop._coords[0]},${stop._coords[1]}` : encodeURIComponent(getLocationString(stop) || '');
    if (!dest) return null;
    const orig = driverCoords ? `&origin=${driverCoords.lat},${driverCoords.lon}` : '';
    return `https://www.google.com/maps/dir/?api=1${orig}&destination=${dest}&travelmode=driving&dir_action=navigate`;
};
const fullRouteUrl = (stops, driverCoords) => {
    const nav = stops.slice(0, 9).map(getLocationString).filter(Boolean);
    if (!nav.length) return null;
    const orig  = driverCoords ? `${driverCoords.lat},${driverCoords.lon}` : encodeURIComponent(nav[0]);
    const dest  = encodeURIComponent(nav[nav.length - 1]);
    const wps   = nav.slice(1, -1);
    const wpStr = wps.length ? `&waypoints=${wps.map(p => encodeURIComponent(p)).join('|')}` : '';
    return `https://www.google.com/maps/dir/?api=1&origin=${orig}&destination=${dest}${wpStr}&travelmode=driving&dir_action=navigate`;
};

// ─────────────────────────────────────────────────────────────────────────────
export default function RouteMapModal({ route, driverCoords, onClose }) {

    // Paradas base
    const stops = route.map((s, i) => ({
        ...s,
        _index:      i + 1,
        _color:      COLORS[i % COLORS.length],
        _label:      s.type === 'Recogida' ? (s.client || s.originName || 'Recogida') : (s.destinationName || s.client || 'Entrega'),
        _isRecogida: s.type === 'Recogida',
        _coords:     getStopCoords(s),
    }));

    // ── Estado ────────────────────────────────────────────────────────────────
    const [geocoded, setGeocoded]     = useState({}); // { stopId: [lat,lon] }
    const [geocoding, setGeocoding]   = useState(false);
    const [segments, setSegments]     = useState([]);
    const [segStats, setSegStats]     = useState({}); // { stopId: {distance,duration} }
    const [loadingRoad, setLoadingRoad] = useState(false);
    const [mapStyleKey, setMapStyleKey] = useState('street');
    const [livePos, setLivePos]       = useState(driverCoords ? [driverCoords.lat, driverCoords.lon] : null);
    const [gpsActive, setGpsActive]   = useState(false);

    // Stops con coordenadas (GPS original o geocodificadas)
    const enhancedStops = stops.map(s => ({
        ...s,
        _coords:     s._coords || geocoded[s.id] || null,
        _geocoded:   !s._coords && !!geocoded[s.id],
    }));
    const stopsWithCoords = enhancedStops.filter(s => s._coords);
    const driverPos       = livePos || (driverCoords ? [driverCoords.lat, driverCoords.lon] : null);
    const allMapPositions = driverPos
        ? [driverPos, ...stopsWithCoords.map(s => s._coords)]
        : stopsWithCoords.map(s => s._coords);
    const mapCenter = allMapPositions[0] || [37.888, -4.779];
    const mapsUrl   = fullRouteUrl(enhancedStops, driverCoords);

    // ── GPS en tiempo real ────────────────────────────────────────────────────
    useEffect(() => {
        if (!navigator.geolocation) return;
        const id = navigator.geolocation.watchPosition(
            p => { setLivePos([p.coords.latitude, p.coords.longitude]); setGpsActive(true); },
            () => setGpsActive(false),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
        );
        return () => navigator.geolocation.clearWatch(id);
    }, []);

    // ── Geocodificar paradas sin GPS ──────────────────────────────────────────
    useEffect(() => {
        const stopsNoGPS = stops.filter(s => !s._coords && getStopAddress(s).length > 3);
        if (!stopsNoGPS.length) return;
        let cancelled = false;
        setGeocoding(true);
        const run = async () => {
            for (const stop of stopsNoGPS) {
                if (cancelled) break;
                const coords = await geocodeAddress(getStopAddress(stop));
                if (coords && !cancelled) setGeocoded(prev => ({ ...prev, [stop.id]: coords }));
                if (!cancelled) await new Promise(r => setTimeout(r, 1200)); // Nominatim: 1 req/s
            }
            if (!cancelled) setGeocoding(false);
        };
        run();
        return () => { cancelled = true; };
    }, [stops.length]);

    // ── Rutas OSRM (re-run cuando cambian los coords disponibles) ─────────────
    const coordsKey = stopsWithCoords.map(s => s.id).join(',');
    useEffect(() => {
        if (allMapPositions.length < 2) return;
        setLoadingRoad(true);
        setSegments([]);
        setSegStats({});
        let cancelled = false;

        const fetchAll = async () => {
            const newSegs = [];
            const newStats = {};
            for (let i = 0; i < allMapPositions.length - 1; i++) {
                if (cancelled) break;
                const destIdx  = driverPos ? i : i + 1;
                const destStop = stopsWithCoords[destIdx];
                const color    = destStop?._color || COLORS[i % COLORS.length];
                const seg      = await fetchRoadSegment(allMapPositions[i], allMapPositions[i + 1]);
                newSegs.push({ coords: seg.coords, color });
                if (destStop && seg.distance != null) newStats[destStop.id] = { distance: seg.distance, duration: seg.duration };
                if (!cancelled) {
                    setSegments([...newSegs]);
                    setSegStats({ ...newStats });
                }
            }
            if (!cancelled) setLoadingRoad(false);
        };
        fetchAll();
        return () => { cancelled = true; };
    }, [coordsKey]);

    // ── Totales ───────────────────────────────────────────────────────────────
    const totals = Object.values(segStats).reduce(
        (a, s) => ({ dist: a.dist + (s.distance || 0), dur: a.dur + (s.duration || 0) }),
        { dist: 0, dur: 0 }
    );
    const cycleStyle = () => {
        const idx = STYLE_ORDER.indexOf(mapStyleKey);
        setMapStyleKey(STYLE_ORDER[(idx + 1) % STYLE_ORDER.length]);
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999, background: '#0f172a',
            display: 'flex', flexDirection: 'column',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        }}>
            {/* ── Header ── */}
            <div style={{
                background: 'linear-gradient(135deg, #1e40af, #1d4ed8)',
                padding: '10px 14px', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: '0 2px 12px rgba(0,0,0,0.4)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Map size={18} color="white" />
                    <div>
                        <p style={{ color: 'white', fontWeight: 700, fontSize: 14, margin: 0 }}>
                            Ruta del día · {stops.length} paradas
                            {gpsActive && <span style={{ color: '#4ade80', fontSize: 11, marginLeft: 6 }}>● GPS</span>}
                            {geocoding && <span style={{ color: '#fbbf24', fontSize: 11, marginLeft: 6 }}>· geocodificando…</span>}
                        </p>
                        <div style={{ display: 'flex', gap: 10 }}>
                            {totals.dist > 0 && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Ruler size={10} /> {fmtDist(totals.dist)}</span>}
                            {totals.dur > 0 && <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}><Clock size={10} /> {fmtTime(totals.dur)}</span>}
                            {loadingRoad && <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>calculando…</span>}
                        </div>
                    </div>
                </div>
                <button onClick={onClose} style={{
                    background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: 8, padding: '6px 12px', cursor: 'pointer', color: 'white',
                    fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4,
                }}>
                    <X size={14} /> Cerrar
                </button>
            </div>

            {/* ── Mapa ── */}
            <div style={{ height: '58%', flexShrink: 0, position: 'relative' }}>
                {stopsWithCoords.length === 0 ? (
                    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#1e293b', gap: 8 }}>
                        <AlertCircle size={32} color="#475569" />
                        <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600, margin: 0 }}>
                            {geocoding ? 'Geocodificando direcciones…' : 'Sin coordenadas GPS'}
                        </p>
                    </div>
                ) : (
                    <>
                        <MapContainer center={mapCenter} zoom={13} style={{ width: '100%', height: '100%' }} zoomControl>
                            <TileLayer url={MAP_STYLES[mapStyleKey].url} attribution={MAP_STYLES[mapStyleKey].attr} key={mapStyleKey} />
                            <FitBounds positions={allMapPositions} />

                            {/* Tramos de ruta con flechas */}
                            {segments.map((seg, i) => {
                                const mid = seg.coords[Math.floor(seg.coords.length / 2)];
                                const p1  = seg.coords[Math.max(0, Math.floor(seg.coords.length / 2) - 1)];
                                return (
                                    <span key={i}>
                                        <Polyline positions={seg.coords} color={seg.color} weight={6} opacity={0.88} />
                                        {mid && p1 && mid !== p1 && (
                                            <Marker position={mid} icon={arrowIcon(seg.color, calcBearing(p1, mid))} />
                                        )}
                                    </span>
                                );
                            })}

                            {/* Conductor */}
                            {driverPos && (
                                <Marker position={driverPos} icon={driverIcon(gpsActive)}>
                                    <Popup><strong>{gpsActive ? '🟢 Tu posición (GPS vivo)' : '🔵 Posición de referencia'}</strong></Popup>
                                </Marker>
                            )}

                            {/* Marcadores de paradas */}
                            {stopsWithCoords.map(stop => (
                                <Marker key={stop.id} position={stop._coords} icon={numberedIcon(stop._index, stop._color, stop._geocoded)}>
                                    <Popup minWidth={200}>
                                        <div style={{ fontFamily: 'sans-serif' }}>
                                            <div style={{ background: stop._color, color: 'white', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, display: 'inline-block', marginBottom: 5 }}>
                                                Parada {stop._index} · {stop._isRecogida ? 'Recogida' : 'Entrega'}
                                                {stop._geocoded && <span style={{ opacity: 0.8, marginLeft: 4 }}>(aprox.)</span>}
                                            </div>
                                            <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 13 }}>{stop._label}</p>
                                            <p style={{ color: '#475569', fontSize: 11, margin: '0 0 8px' }}>{getStopAddress(stop)}</p>
                                            {singleNavUrl(stop, driverCoords) && (
                                                <a href={singleNavUrl(stop, driverCoords)} target="_blank" rel="noopener noreferrer"
                                                    style={{ display: 'block', textAlign: 'center', background: '#1a73e8', color: 'white', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, textDecoration: 'none' }}>
                                                    🧭 Navegar aquí
                                                </a>
                                            )}
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>

                        {/* Toggle estilo mapa */}
                        <button onClick={cycleStyle} style={{
                            position: 'absolute', top: 10, right: 10, zIndex: 1000,
                            background: 'rgba(15,23,42,0.85)', backdropFilter: 'blur(8px)',
                            border: '1px solid rgba(255,255,255,0.15)',
                            borderRadius: 10, padding: '7px 12px', color: 'white',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: 5,
                            boxShadow: '0 4px 14px rgba(0,0,0,0.5)',
                        }}>
                            <Layers size={14} /> {MAP_STYLES[mapStyleKey].label}
                        </button>
                    </>
                )}
            </div>

            {/* ── Barra ruta completa ── */}
            <div style={{ padding: '5px 10px', flexShrink: 0, background: '#0f172a', display: 'flex', gap: 8, alignItems: 'center' }}>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: 0, flex: 1 }}>
                    Pulsa <strong style={{ color: '#60a5fa' }}>"Ir"</strong> en cada parada para navegar con Google Maps
                    {geocoding && <span style={{ color: '#fbbf24' }}> · geocodificando paradas sin GPS…</span>}
                </p>
                {mapsUrl && (
                    <a href={mapsUrl} target="_blank" rel="noopener noreferrer" style={{
                        background: '#1e293b', border: '1px solid #334155',
                        color: '#94a3b8', borderRadius: 8, padding: '5px 10px',
                        fontSize: 10, fontWeight: 600, textDecoration: 'none',
                        display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                    }}>
                        <Navigation size={11} /> Ruta completa
                    </a>
                )}
            </div>

            {/* ── Lista de paradas ── */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '4px 10px 10px' }}>
                {enhancedStops.map((stop) => {
                    const hasLoc = !!getLocationString(stop);
                    const navUrl = singleNavUrl(stop, driverCoords);
                    const stats  = segStats[stop.id];
                    return (
                        <div key={stop.id} style={{
                            background: '#1e293b', borderRadius: 8, padding: '7px 10px',
                            marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8,
                            border: `1px solid ${hasLoc ? stop._color + '55' : '#44403c'}`,
                            opacity: hasLoc ? 1 : 0.5,
                        }}>
                            {/* Bola de color */}
                            <div style={{
                                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                                background: hasLoc ? stop._color : '#44403c',
                                color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 900, fontSize: 11,
                                boxShadow: hasLoc ? `0 0 8px ${stop._color}80` : 'none',
                            }}>{stop._index}</div>

                            {/* Info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <p style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 12, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {stop._label}
                                    </p>
                                    {stop._isRecogida && <span style={{ background: '#92400e', color: '#fcd34d', fontSize: 8, fontWeight: 700, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>REC</span>}
                                    {stop._coords && !stop._geocoded && <span style={{ background: '#1e3a5f', color: '#60a5fa', fontSize: 8, fontWeight: 700, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>GPS</span>}
                                    {stop._geocoded && <span style={{ background: '#14532d', color: '#4ade80', fontSize: 8, fontWeight: 700, borderRadius: 3, padding: '1px 4px', flexShrink: 0 }}>MAP</span>}
                                </div>
                                <div style={{ display: 'flex', gap: 8, marginTop: 2, alignItems: 'center' }}>
                                    {getStopAddress(stop) && (
                                        <p style={{ color: '#64748b', fontSize: 10, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                            {getStopAddress(stop)}
                                        </p>
                                    )}
                                    {stats && (
                                        <span style={{ color: stop._color, fontSize: 9, fontWeight: 600, flexShrink: 0, display: 'flex', gap: 5 }}>
                                            {stats.distance && <span>📍 {fmtDist(stats.distance)}</span>}
                                            {stats.duration && <span>⏱ {fmtTime(stats.duration)}</span>}
                                        </span>
                                    )}
                                    {!stop._coords && !stop._geocoded && geocoding && (
                                        <span style={{ color: '#fbbf24', fontSize: 9, flexShrink: 0 }}>buscando…</span>
                                    )}
                                </div>
                            </div>

                            {/* Ir */}
                            {navUrl && (
                                <a href={navUrl} target="_blank" rel="noopener noreferrer" style={{
                                    background: stop._color, borderRadius: 8, padding: '5px 10px',
                                    color: 'white', display: 'flex', alignItems: 'center', gap: 4,
                                    fontSize: 11, fontWeight: 700, flexShrink: 0, textDecoration: 'none',
                                    boxShadow: `0 2px 8px ${stop._color}60`,
                                }}>
                                    <Navigation size={11} /> Ir
                                </a>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
