// frontend/src/components/StaticMap.jsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Settings,
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

/**
 * MAPRESTORE IMPLEMENTATION
 * Reverts to MapLibre for stability while maintaining Elite features.
 */

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || 'czxQ6wrMV3cG7qUo9FzK';
const STYLE_URL = `https://api.maptiler.com/maps/basic-v2/style.json?key=${MAPTILER_KEY}`;
const DARK_STYLE_URL = `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`;

export default function StaticMap({ venue, lat, lon, zones = [], onZoneClick }) {
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  // --- REFS ---
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const userMarkerRef = useRef(null);
  const zoneMarkersRef = useRef({}); // Using object for efficient sync

  // --- STATE ---
  const [zoom, setZoom] = useState(17);
  const [menuOpen, setMenuOpen] = useState(false);
  const [is3D, setIs3D] = useState(true);
  const [locStatus, setLocStatus] = useState('idle');

  // --- MARKER HELPERS ---
  const createUserMarkerEl = () => {
    const el = document.createElement('div');
    el.className = 'relative w-8 h-8';
    el.innerHTML = `
      <div class="absolute inset-0 rounded-full bg-blue-500/20 animate-ping"></div>
      <div class="relative w-8 h-8 rounded-full bg-blue-600 border-2 border-white shadow-lg"></div>
    `;
    return el;
  };

  const createZoneMarkerEl = (zone, onClick) => {
    const el = document.createElement('div');
    el.className = `group flex items-center justify-center cursor-pointer w-10 h-10 rounded-2xl shadow-xl border-2 border-white/40 transition-all hover:scale-110 active:scale-95 ${
      zone.status === 'critical' ? 'bg-red-600' : zone.status === 'warning' ? 'bg-orange-500' : 'bg-emerald-500'
    }`;
    el.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5">
        ${zone.type === 'gate' ? '<polygon points="3 11 22 2 13 21 11 13 3 11"/>' : '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>'}
      </svg>
    `;
    el.onclick = (e) => { e.stopPropagation(); onClick(); };
    return el;
  };

  const startWatchingLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    setLocStatus('loading');

    const success = (pos) => {
      const { latitude: uLat, longitude: uLng } = pos.coords;
      setLocStatus('found');

      if (userMarkerRef.current) {
        userMarkerRef.current.setLngLat([uLng, uLat]);
      } else if (mapRef.current) {
        userMarkerRef.current = new maplibregl.Marker({ element: createUserMarkerEl() })
          .setLngLat([uLng, uLat])
          .addTo(mapRef.current);
      }
    };

    const watchId = navigator.geolocation.watchPosition(success, () => setLocStatus('denied'), {
      enableHighAccuracy: true,
      timeout: 10000
    });

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: isDark ? DARK_STYLE_URL : STYLE_URL,
      center: [lon, lat],
      zoom: 17,
      pitch: 55,
      bearing: 0,
      antialias: true
    });

    mapRef.current = map;

    map.on('load', () => {
      // Add Crowd Heatmap Layer (Elite Intelligence Port)
      map.addSource('crowd-data', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] }
      });

      map.addLayer({
        id: 'crowd-heatmap',
        type: 'heatmap',
        source: 'crowd-data',
        maxzoom: 20,
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 20, 3],
          'heatmap-color': [
            'interpolate', ['linear'], ['heatmap-density'],
            0, 'rgba(0, 255, 0, 0)',
            0.2, 'rgba(0, 228, 0, 0.4)',
            0.4, 'rgba(255, 255, 0, 0.5)',
            0.6, 'rgba(255, 126, 0, 0.6)',
            0.8, 'rgba(255, 0, 0, 0.7)'
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 20, 50],
          'heatmap-opacity': 0.6
        }
      });

      // SYNC Telemetry
      startWatchingLocation();
    });

    map.on('zoom', () => setZoom(map.getZoom()));

    return () => map.remove();
  }, [lat, lon, isDark]);

  // --- ZONE SYNC ---
  useEffect(() => {
    if (!mapRef.current) return;

    // 1. Update Heatmap Source
    const heatmapData = {
      type: 'FeatureCollection',
      features: zones.map(z => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [z.lon, z.lat] },
        properties: { weight: (z.density || 0.5) * 10 }
      }))
    };
    const source = mapRef.current.getSource('crowd-data');
    if (source) source.setData(heatmapData);

    // 2. Update Markers
    zones.forEach(z => {
      if (!z.lat || !z.lon) return;
      if (zoneMarkersRef.current[z.id]) {
        zoneMarkersRef.current[z.id].setLngLat([z.lon, z.lat]);
      } else {
        const marker = new maplibregl.Marker({ element: createZoneMarkerEl(z, () => onZoneClick(z)) })
          .setLngLat([z.lon, z.lat])
          .addTo(mapRef.current);
        zoneMarkersRef.current[z.id] = marker;
      }
    });

    // Cleanup missing zones
    Object.keys(zoneMarkersRef.current).forEach(id => {
      if (!zones.find(z => z.id === id)) {
        zoneMarkersRef.current[id].remove();
        delete zoneMarkersRef.current[id];
      }
    });

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
            <div className="pt-5 pb-4 pl-20 pr-6 flex items-center border-b border-theme-main/5">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                Map Restoration Active
              </p>
            </div>

            <div className="p-3 flex flex-col gap-1.5">
              <button
                onClick={() => { mapRef.current?.flyTo({ center: [lon, lat], zoom: 18, pitch: is3D ? 65 : 0 }); setMenuOpen(false); }}
                className={`group w-full flex items-center gap-4 px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <div className="p-2 bg-accent-blue/10 rounded-xl text-accent-blue group-hover:scale-110 transition-transform">
                  <Navigation2 size={18} />
                </div>
                <span>Go to Venue</span>
              </button>

              <button
                onClick={() => {
                  const next = !is3D; setIs3D(next);
                  mapRef.current?.easeTo({ pitch: next ? 65 : 0 });
                  setMenuOpen(false);
                }}
                className={`group w-full flex items-center justify-between px-6 py-4 text-sm font-bold rounded-[1.5rem] transition-all duration-200 ${isDark ? 'text-slate-300 hover:bg-slate-800' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-purple-500/10 rounded-xl text-purple-500 group-hover:scale-110 transition-transform">
                    {is3D ? <Box size={18} /> : <Layers size={18} />}
                  </div>
                  <span>{is3D ? '3D View' : '2D View'}</span>
                </div>
                <div className={`w-2 h-2 rounded-full ${is3D ? 'bg-accent-blue shadow-[0_0_8px_rgba(26,115,232,1)]' : 'bg-slate-300'}`} />
              </button>

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
    </div>
  );
}