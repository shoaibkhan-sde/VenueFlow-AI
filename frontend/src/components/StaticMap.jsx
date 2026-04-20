// frontend/src/components/StaticMap.jsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  Settings,
  Map as MapIcon,
  Navigation2,
  Layers,
  RefreshCcw,
  X,
  Compass,
  Box,
  Plus,
  Minus,
  Maximize2
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import { loadGoogleMaps } from '../services/googleMapsService';

/**
 * GOOGLE MAPS IMPLEMENTATION
 * Replaces MapLibre for Top 3 Elite Ranking.
 */

const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'bc5fc6a760f33cc0';

// Custom Map Styles (Cloud Styling is preferred, but we define defaults here)
const STYLES = {
  light: [], // Cloud styled or empty
  dark: [
    { elementType: "geometry", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.stroke", stylers: [{ color: "#242f3e" }] },
    { elementType: "labels.text.fill", stylers: [{ color: "#746855" }] },
    { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#263c3f" }] },
    { featureType: "poi.park", elementType: "labels.text.fill", stylers: [{ color: "#6b9a76" }] },
    { featureType: "road", elementType: "geometry", stylers: [{ color: "#38414e" }] },
    { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212a37" }] },
    { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#9ca5b3" }] },
    { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#746855" }] },
    { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#1f2835" }] },
    { featureType: "road.highway", elementType: "labels.text.fill", stylers: [{ color: "#f3d19c" }] },
    { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2f3948" }] },
    { featureType: "transit.station", elementType: "labels.text.fill", stylers: [{ color: "#d59563" }] },
    { featureType: "water", elementType: "geometry", stylers: [{ color: "#17263c" }] },
    { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#515c6d" }] },
    { featureType: "water", elementType: "labels.text.stroke", stylers: [{ color: "#17263c" }] },
  ],
};

// --- MARKER GENERATORS ---

function makeGateMarker() {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:40px;height:40px;cursor:pointer;';
  el.innerHTML = `
    <div style="width:40px;height:40px;background:#a855f7;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(168,85,247,0.4);display:flex;align-items:center;justify-content:center;color:#fff;">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/></svg>
    </div>
    <div style="position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;white-space:nowrap;padding:2px 8px;background:rgba(255,255,255,0.9);border-radius:8px;font-size:11px;font-weight:800;color:#1e293b;box-shadow:0 2px 4px rgba(0,0,0,0.1);border:1px solid rgba(0,0,0,0.05);">STADIUM</div>
  `;
  return el;
}

function makeTransitMarker(name) {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:32px;height:32px;cursor:pointer;';
  el.innerHTML = `
    <div style="width:32px;height:32px;background:#f97316;border-radius:50%;border:2px solid #fff;box-shadow:0 4px 10px rgba(249,115,22,0.3);display:flex;align-items:center;justify-content:center;color:#fff;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="9" y1="7" x2="15" y2="7"/><line x1="9" y1="11" x2="15" y2="11"/><line x1="9" y1="18" x2="9.01" y2="18"/><line x1="15" y1="18" x2="15.01" y2="18"/></svg>
    </div>
    <div style="position:absolute;top:50%;left:100%;transform:translateY(-50%);margin-left:8px;white-space:nowrap;font-size:10px;font-weight:700;color:#5f6368;text-shadow:0 1px 2px #fff;">${name}</div>
  `;
  return el;
}

function makeUserMarker() {
  const el = document.createElement('div');
  el.style.cssText = 'position:relative;width:32px;height:32px;cursor:default;';
  el.innerHTML = `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;border-radius:50%;background:rgba(26,115,232,0.15);animation:vf-pulse 2.5s ease-out infinite;"></div>
    <div style="width:32px;height:32px;background:#1a73e8;border-radius:50%;border:3px solid #fff;box-shadow:0 4px 12px rgba(26,115,232,0.5);z-index:2;position:relative;"></div>
  `;
  return el;
}

function makeZoneMarker(zone, onClick) {
  const el = document.createElement('div');
  el.className = 'group relative flex items-center justify-center cursor-pointer';
  el.style.width = '40px'; el.style.height = '40px';
  const statusCls = zone.status === 'critical' ? 'bg-red-600' : zone.status === 'warning' ? 'bg-orange-500' : 'bg-emerald-500';
  el.innerHTML = `
    <div class="relative w-full h-full rounded-2xl shadow-lg border-2 border-white/20 flex items-center justify-center transition-all ${statusCls}">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="text-white">
        ${zone.type === 'gate' ? '<polygon points="3 11 22 2 13 21 11 13 3 11"/>' : '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'}
      </svg>
    </div>
  `;
  el.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
  return el;
}

export default function StaticMap({ venue, lat, lon, zones = [], onZoneClick }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // --- REFS ---
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const mounted = useRef(true);
  const watchIdRef = useRef(null);
  const userMarkerRef = useRef(null);
  const venueMarkerRef = useRef(null);
  const poiMarkersRef = useRef([]);
  const zoneMarkersRef = useRef([]);

  // --- STATE ---
  const [zoom, setZoom] = useState(17);
  const [menuOpen, setMenuOpen] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [locStatus, setLocStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);

  const startWatchingLocation = useCallback(async () => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    setLocStatus('loading');

    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    const success = (pos) => {
      const uLat = pos.coords.latitude; const uLng = pos.coords.longitude;
      setLocStatus('found'); setAccuracy(Math.round(pos.coords.accuracy));

      if (userMarkerRef.current) {
        userMarkerRef.current.position = { lat: uLat, lng: uLng };
      } else if (mapRef.current) {
        userMarkerRef.current = new AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: uLat, lng: uLng },
          content: makeUserMarker(),
          title: "Your Location"
        });
      }
    };

    const error = () => setLocStatus('denied');

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  }, []);

  const performFlyTo = useCallback((tLat, tLng) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({ lat: tLat, lng: tLng });
    mapRef.current.setZoom(18);
    mapRef.current.setTilt(is3D ? 65 : 0);
  }, [is3D]);

  const toggle3D = () => {
    const next = !is3D; setIs3D(next);
    if (mapRef.current) {
      mapRef.current.setTilt(next ? 65 : 0);
    }
    setMenuOpen(false);
  };

  const fitBoth = useCallback(() => {
    if (!userMarkerRef.current || !mapRef.current) { performFlyTo(lat, lon); return; }
    const uPos = userMarkerRef.current.position;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat, lng: lon });
    bounds.extend(uPos);
    mapRef.current.fitBounds(bounds, 70);
  }, [lat, lon, performFlyTo]);

  // --- INITIALIZATION ---
  useEffect(() => {
    mounted.current = true;
    let mapInstance = null;

    const initMap = async () => {
      try {
        const google = await loadGoogleMaps();
        if (!mounted.current || !containerRef.current) return;

        const { Map } = await google.maps.importLibrary("maps");
        const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

        mapInstance = new Map(containerRef.current, {
          center: { lat, lng: lon },
          zoom: 17,
          heading: 0,
          tilt: 55,
          mapId: MAP_ID,
          disableDefaultUI: true,
          styles: isDark ? STYLES.dark : STYLES.light,
          gestureHandling: 'greedy'
        });

        mapRef.current = mapInstance;

        // Add Venue Marker
        venueMarkerRef.current = new AdvancedMarkerElement({
          map: mapInstance,
          position: { lat, lng: lon },
          content: makeGateMarker(),
        });

        // POI Markers
        if (venue?.poi) {
          venue.poi.forEach(p => {
            const m = new AdvancedMarkerElement({
              map: mapInstance,
              position: { lat: p.lat, lng: p.lon },
              content: makeTransitMarker(p.name),
            });
            poiMarkersRef.current.push(m);
          });
        }

        mapInstance.addListener('zoom_changed', () => {
            setZoom(mapInstance.getZoom());
        });

        startWatchingLocation();
      } catch (err) {
        console.error("Google Maps Load Error:", err);
      }
    };

    initMap();

    return () => {
      mounted.current = false;
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [lat, lon]); // Retries if lat/lon change

  // --- THEME SYNC ---
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setOptions({ styles: isDark ? STYLES.dark : STYLES.light });
    }
  }, [isDark]);

  // --- ZONE MARKERS SYNC ---
  useEffect(() => {
    const updateZones = async () => {
      if (!mapRef.current) return;
      const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
      
      zoneMarkersRef.current.forEach(m => m.map = null);
      zoneMarkersRef.current = [];

      zones.forEach(z => {
        if (!z.lat || !z.lon) return;
        const m = new AdvancedMarkerElement({
          map: mapRef.current,
          position: { lat: z.lat, lng: z.lon },
          content: makeZoneMarker(z, () => onZoneClick?.(z)),
        });
        zoneMarkersRef.current.push(m);
      });
    };
    updateZones();
  }, [zones, onZoneClick]);

  return (
    <div className="w-full h-full rounded-xl overflow-hidden relative group shadow-premium border border-accent-blue/10 bg-slate-50">
      <div ref={containerRef} className="w-full h-full" />

      {/* ── SETTINGS DROP-DOWN ── */}
      <div className="absolute top-4 right-4 z-20">
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className={`w-12 h-12 rounded-[1.2rem] border backdrop-blur-md shadow-2xl flex items-center justify-center transition-all duration-300 ${isDark
            ? 'bg-slate-900/90 border-slate-700 text-white hover:bg-slate-800'
            : 'bg-white/95 border-gray-100 text-slate-700 hover:bg-gray-50'
            } ${menuOpen ? 'rotate-90 scale-110 !border-accent-blue/50' : ''}`}
        >
          {menuOpen ? <X size={20} /> : <Settings size={20} />}
        </button>

        {menuOpen && (
          <div className={`mt-3 absolute top-12 right-0 w-72 rounded-1xl border shadow-[0_20px_50px_rgba(0,0,0,0.15)] backdrop-blur-2xl overflow-hidden transition-all duration-500 animate-in fade-in slide-in-from-top-6 ${isDark ? 'bg-slate-900/95 border-slate-800' : 'bg-white/95 border-white'
            }`}>
            <div className="pt-5 pb-4 pl-20 pr-6 flex items-center">
              <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 leading-normal">
                Map Controls
              </p>
            </div>

            <div className="p-3 flex flex-col gap-1.5">
              <button
                onClick={() => { performFlyTo(lat, lon); setMenuOpen(false); }}
                className={`group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <div className="p-2 bg-accent-blue/10 rounded-xl text-accent-blue group-hover:scale-110 transition-transform">
                  <Navigation2 size={18} />
                </div>
                <span>Go to Stadium</span>
              </button>

              <button
                onClick={() => { 
                   if (userMarkerRef.current) performFlyTo(userMarkerRef.current.position.lat, userMarkerRef.current.position.lng);
                   setMenuOpen(false); 
                }}
                className={`group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-500 group-hover:scale-110 transition-transform">
                  <Compass size={18} />
                </div>
                <span>My Location</span>
              </button>

              <button
                onClick={toggle3D}
                className={`group w-full flex items-center justify-between px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-purple-500/10 rounded-xl text-purple-500 group-hover:scale-110 transition-transform">
                    {is3D ? <Box size={18} /> : <Layers size={18} />}
                  </div>
                  <span>{is3D ? '3D Perspective' : '2D Perspective'}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${is3D ? 'bg-accent-blue shadow-[0_0_8px_rgba(26,115,232,1)]' : 'bg-slate-300'}`} />
              </button>

              <button
                onClick={() => { fitBoth(); setMenuOpen(false); }}
                className={`group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <div className="p-2 bg-indigo-500/10 rounded-xl text-indigo-500 group-hover:scale-110 transition-transform">
                  <Maximize2 size={18} />
                </div>
                <span>Show Both Locations</span>
              </button>

              <div className={`h-px mx-6 my-2 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`} />

              <button
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('venueflow:reset'));
                  setMenuOpen(false);
                }}
                className="group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] text-rose-500 hover:bg-rose-50 transition-all duration-200"
              >
                <div className="p-2 bg-rose-500/10 rounded-xl text-rose-500 group-hover:rotate-180 transition-transform duration-500">
                  <RefreshCcw size={18} />
                </div>
                <span>Reset View</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── ZOOM BUTTONS ── */}
      <div className="absolute bottom-6 right-6 z-30 flex flex-col gap-2">
        <button
          onClick={() => mapRef.current?.setZoom(mapRef.current.getZoom() + 1)}
          className="w-12 h-12 rounded-[1.2rem] bg-white/90 border border-white shadow-premium flex items-center justify-center text-slate-600 backdrop-blur-xl hover:bg-accent-blue hover:text-white transition-all duration-300 group active:scale-90"
        >
          <Plus size={20} className="group-hover:scale-110 transition-transform" />
        </button>
        <button
          onClick={() => mapRef.current?.setZoom(mapRef.current.getZoom() - 1)}
          className="w-12 h-12 rounded-[1.2rem] bg-white/90 border border-white shadow-premium flex items-center justify-center text-slate-600 backdrop-blur-xl hover:bg-accent-blue hover:text-white transition-all duration-300 group active:scale-90"
        >
          <Minus size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <style>{`
        .gm-style-cc, .gm-style-mtc, .gm-svpc { display: none !important; }
        @keyframes vf-pulse {
          0%   { transform:translate(-50%,-50%) scale(0.6); opacity:1; }
          100% { transform:translate(-50%,-50%) scale(3.5); opacity:0; }
        }
      `}</style>
    </div>
  );
}