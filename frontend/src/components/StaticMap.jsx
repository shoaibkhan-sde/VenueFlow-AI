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

// MapLibre assets are pre-loaded in index.html for maximum performance.

const STYLES = {
  light: 'https://api.maptiler.com/maps/streets-v2/style.json?key=czxQ6wrMV3cG7qUo9FzK',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/style.json?key=czxQ6wrMV3cG7qUo9FzK',
};

function buildingLayer(sourceName) {
  return {
    id: 'venueflow-3d-buildings',
    type: 'fill-extrusion',
    source: sourceName,
    'source-layer': 'building',
    minzoom: 14,
    filter: [
      'all',
      ['has', 'height'],
      ['>', ['coalesce', ['get', 'height'], 0], 0],
    ],
    paint: {
      'fill-extrusion-color': [
        'interpolate', ['linear'], ['coalesce', ['get', 'height'], 0],
        0, '#d0dff0', 50, '#93b0d0', 200, '#5a8ab0',
      ],
      'fill-extrusion-height': ['coalesce', ['get', 'height'], 8],
      'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
      'fill-extrusion-opacity': 0.85,
    },
  };
}

function injectStyles() {
  if (document.getElementById('vf-map-styles')) return;
  const s = document.createElement('style');
  s.id = 'vf-map-styles';
  s.textContent = `
    @keyframes vf-pulse {
      0%   { transform:translate(-50%,-50%) scale(0.6); opacity:1; }
      100% { transform:translate(-50%,-50%) scale(3.5); opacity:0; }
    }
    .vf-zoom-btn {
      width: 44px; height: 44px;
      background: #fff; border: 1px solid rgba(0,0,0,0.1);
      display: flex; align-items: center; justify-content: center;
      cursor: pointer; transition: all 0.2s;
      color: #5f6368; box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .vf-zoom-btn:hover { background: #f8f9fa; color: #1a73e8; }
    .vf-zoom-top { border-radius: 12px 12px 0 0; border-bottom: none; }
    .vf-zoom-bottom { border-radius: 0 0 12px 12px; }
  `;
  document.head.appendChild(s);
}

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

  // 1. REFS
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const initialised = useRef(false);
  const mounted = useRef(true);
  const watchIdRef = useRef(null);
  const userMarkerRef = useRef(null);
  const venueMarkerRef = useRef(null);
  const poiMarkersRef = useRef([]);
  const zoneMarkersRef = useRef([]);
  const is3DRef = useRef(true);
  const userNavigatedManuallyRef = useRef(false);
  const styleLoadingRef = useRef(false);
  const nextStyleRef = useRef(null);

  // 2. STATE
  const [zoom, setZoom] = useState(16);
  const [menuOpen, setMenuOpen] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [locStatus, setLocStatus] = useState('idle');
  const [accuracy, setAccuracy] = useState(null);
  const [areaName, setAreaName] = useState(null);

  // 3. LOGIC HELPERS (ORDERED BY DEPENDENCY TO AVOID TDZ)
  const fetchAreaName = useCallback(async (uLon, uLat) => {
    try {
      const resp = await fetch(`https://api.maptiler.com/geocoding/${uLon},${uLat}.json?key=czxQ6wrMV3cG7qUo9FzK&limit=1`);
      const data = await resp.json();
      if (data.features?.length > 0) {
        setAreaName(data.features[0].text || data.features[0].place_name?.split(',')[0] || 'Unknown Area');
      }
    } catch (e) { console.error('Geocoding fail:', e); }
  }, []);

  const performFlyTo = useCallback((cLon, cLat) => {
    if (!mapRef.current) return;
    mapRef.current.flyTo({
      center: [cLon, cLat], zoom: 18,
      pitch: is3DRef.current ? 70 : 0, bearing: 0,
      duration: 1200, essential: true,
    });
  }, []);

  const startWatchingLocation = useCallback(() => {
    if (!navigator.geolocation || watchIdRef.current !== null) return;
    setLocStatus('loading');

    const success = (pos) => {
      const uLat = pos.coords.latitude; const uLon = pos.coords.longitude;
      setLocStatus('found'); setAccuracy(Math.round(pos.coords.accuracy));
      fetchAreaName(uLon, uLat);

      const map = mapRef.current;
      if (!map || !window.maplibregl) return;

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([uLon, uLat]);
      } else {
        userMarkerRef.current = new window.maplibregl.Marker({ element: makeUserMarker(), anchor: 'bottom' })
          .setLngLat([uLon, uLat])
          .setPopup(new window.maplibregl.Popup({ offset: 20 }).setHTML(`
            <div style="font-family:system-ui;font-size:12px;padding:4px;">
              <div style="font-weight:900;color:#1a73e8;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:2px;">📍 Current Location</div>
              <div style="font-weight:700;color:#1e293b;font-size:14px;margin-bottom:4px;">${areaName || 'Detecting Area...'}</div>
              <div style="font-weight:500;color:#64748b;font-size:10px;border-top:1px solid #f1f5f9;padding-top:4px;">Accuracy: ±${Math.round(pos.coords.accuracy)}m</div>
            </div>`))
          .addTo(map);
      }
      if (!userNavigatedManuallyRef.current) performFlyTo(uLon, uLat);
    };

    const error = (err) => {
      if (err.code === 3 && watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = navigator.geolocation.watchPosition(success, () => setLocStatus('denied'), { enableHighAccuracy: false, timeout: 15000 });
      } else { setLocStatus('denied'); }
    };

    watchIdRef.current = navigator.geolocation.watchPosition(success, error, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
  }, [areaName, fetchAreaName, performFlyTo]);

  const flyToGate = useCallback(() => { userNavigatedManuallyRef.current = true; performFlyTo(lon, lat); }, [lat, lon, performFlyTo]);
  const flyToUser = useCallback(() => {
    if (!userMarkerRef.current) { startWatchingLocation(); setMenuOpen(false); return; }
    const pos = userMarkerRef.current.getLngLat();
    userNavigatedManuallyRef.current = true; performFlyTo(pos.lng, pos.lat);
  }, [performFlyTo, startWatchingLocation]);

  const fitBoth = useCallback(() => {
    if (!userMarkerRef.current || !mapRef.current) { flyToGate(); return; }
    userNavigatedManuallyRef.current = true;
    const u = userMarkerRef.current.getLngLat();
    mapRef.current.fitBounds([[Math.min(u.lng, lon) - 0.001, Math.min(u.lat, lat) - 0.001], [Math.max(u.lng, lon) + 0.001, Math.max(u.lat, lat) + 0.001]], { padding: 70, pitch: is3DRef.current ? 60 : 0, duration: 1200 });
  }, [lat, lon, flyToGate]);

  const toggle3D = () => {
    const next = !is3D; setIs3D(next); is3DRef.current = next;
    mapRef.current?.easeTo({ pitch: next ? 70 : 0, duration: 700 });
    setMenuOpen(false);
  };

  const add3DBuildings = useCallback((map) => {
    const s = map.getStyle(); if (!s || !s.sources || map.getLayer('venueflow-3d-buildings')) return;
    const src = Object.keys(s.sources).find(k => s.sources[k].type === 'vector' && k.includes('maptiler')) || Object.keys(s.sources).find(k => s.sources[k].type === 'vector') || 'maptiler_planet';
    if (!map.getSource(src)) return;
    const lbl = (s.layers || []).find(l => l.type === 'symbol' && l.layout?.['text-field']);
    try { map.addLayer(buildingLayer(src), lbl?.id); } catch (e) { }
  }, []);

  const updateVisibility = useCallback((zV) => {
    zoneMarkersRef.current.forEach(m => { if (m.getElement()) m.getElement().style.display = zV >= 14 ? 'block' : 'none'; });
    poiMarkersRef.current.forEach(m => { if (m.getElement()) m.getElement().style.display = zV >= 14.5 ? 'block' : 'none'; });
  }, []);

  // 4. LIFECYCLE
  useEffect(() => {
    mounted.current = true; injectStyles();
    const init = () => {
      const ml = window.maplibregl; if (!ml || !containerRef.current || !mounted.current) return;
      
      // SAFETY GUARD: Prevent MapLibre from crashing on NaN/undefined coordinates
      if (typeof lat !== 'number' || typeof lon !== 'number' || isNaN(lat) || isNaN(lon)) {
        console.warn('Map deferred: Invalid coordinates', { lat, lon });
        return;
      }

      try {
        const map = new ml.Map({ 
          container: containerRef.current, 
          style: isDark ? STYLES.dark : STYLES.light, 
          center: [lon, lat], 
          zoom: 17, 
          pitch: 55, 
          antialias: true, 
          attributionControl: false 
        });
        mapRef.current = map; initialised.current = true;
        map.once('styledata', () => { if (!mounted.current) return; add3DBuildings(map); });
        map.on('load', () => {
          if (!mounted.current) return;
          updateVisibility(map.getZoom());
          map.on('zoom', () => { updateVisibility(map.getZoom()); setZoom(map.getZoom()); });
          startWatchingLocation();
        });
      } catch (e) { console.error('Map init fail:', e); }
    };

    if (window.maplibregl) init(); 
    else { 
      const p = setInterval(() => { 
        if (window.maplibregl) { clearInterval(p); init(); } 
      }, 50); 
      return () => clearInterval(p); 
    }

    return () => {
      mounted.current = false; initialised.current = false;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, [lat, lon]); // Add lat/lon dependencies so map can retry if they arrive late

  useEffect(() => {
    const map = mapRef.current; if (!map || !initialised.current) return;
    const target = isDark ? STYLES.dark : STYLES.light;
    const perform = () => {
      styleLoadingRef.current = true; map.setStyle(target);
      map.once('styledata', () => { styleLoadingRef.current = false; if (is3DRef.current) add3DBuildings(map); if (nextStyleRef.current) { const q = nextStyleRef.current; nextStyleRef.current = null; if (q !== target) perform(); } });
    };
    if (styleLoadingRef.current) nextStyleRef.current = target; else perform();
  }, [isDark, add3DBuildings]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !initialised.current || !window.maplibregl) return;
    venueMarkerRef.current?.remove(); poiMarkersRef.current.forEach(m => m.remove()); poiMarkersRef.current = [];
    venueMarkerRef.current = new window.maplibregl.Marker({ element: makeGateMarker(), anchor: 'center' }).setLngLat([lon, lat]).addTo(map);
    if (venue?.poi) venue.poi.forEach(p => { const m = new window.maplibregl.Marker({ element: makeTransitMarker(p.name), anchor: 'center' }).setLngLat([p.lon, p.lat]).addTo(map); m.getElement().style.display = zoom >= 12 ? 'block' : 'none'; poiMarkersRef.current.push(m); });
  }, [venue?.name, lon, lat]);

  useEffect(() => {
    const map = mapRef.current; if (!map || !initialised.current || !window.maplibregl) return;
    zoneMarkersRef.current.forEach(m => m.remove()); zoneMarkersRef.current = [];
    zones.forEach(z => { if (!z.lat || !z.lon) return; const m = new window.maplibregl.Marker({ element: makeZoneMarker(z, () => onZoneClick?.(z)), anchor: 'center' }).setLngLat([z.lon, z.lat]).addTo(map); m.getElement().style.display = zoom >= 14 ? 'block' : 'none'; zoneMarkersRef.current.push(m); });
  }, [zones, onZoneClick]);

  useEffect(() => { performFlyTo(lon, lat); }, [lat, lon, performFlyTo]);

  // 5. RENDER
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
                onClick={() => { flyToGate(); setMenuOpen(false); }}
                className={`group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
              >
                <div className="p-2 bg-accent-blue/10 rounded-xl text-accent-blue group-hover:scale-110 transition-transform">
                  <Navigation2 size={18} />
                </div>
                <span>Go to Stadium</span>
              </button>

              <button
                onClick={() => { flyToUser(); setMenuOpen(false); }}
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
          onClick={() => mapRef.current?.zoomIn()}
          className="w-12 h-12 rounded-[1.2rem] bg-white/90 border border-white shadow-premium flex items-center justify-center text-slate-600 backdrop-blur-xl hover:bg-accent-blue hover:text-white transition-all duration-300 group active:scale-90"
        >
          <Plus size={20} className="group-hover:scale-110 transition-transform" />
        </button>
        <button
          onClick={() => mapRef.current?.zoomOut()}
          className="w-12 h-12 rounded-[1.2rem] bg-white/90 border border-white shadow-premium flex items-center justify-center text-slate-600 backdrop-blur-xl hover:bg-accent-blue hover:text-white transition-all duration-300 group active:scale-90"
        >
          <Minus size={20} className="group-hover:scale-110 transition-transform" />
        </button>
      </div>

      <style>{`.maplibregl-ctrl-attrib, .maplibregl-ctrl-logo { display:none !important; }`}</style>
    </div>
  );
}