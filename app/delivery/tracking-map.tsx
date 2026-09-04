'use client';

import { useEffect, useRef } from 'react';

type Pt = { lat: number; lng: number } | null;

// Live tracking map using Leaflet + OpenStreetMap tiles (no API key required).
export function TrackingMap({ driver, dest }: { driver: Pt; dest: Pt }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);
  const markers = useRef<any>({});

  useEffect(() => {
    if (!document.querySelector('link[data-leaflet]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; l.setAttribute('data-leaflet', '1');
      document.head.appendChild(l);
    }
    function init() {
      const L = (window as any).L;
      if (!L || !ref.current) return;
      if (!map.current) {
        const c = driver ?? dest ?? { lat: 4.155, lng: 9.281 };
        map.current = L.map(ref.current).setView([c.lat, c.lng], 14);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);
      }
      if (dest) {
        if (!markers.current.dest) markers.current.dest = L.marker([dest.lat, dest.lng]).addTo(map.current).bindPopup('Destination');
        else markers.current.dest.setLatLng([dest.lat, dest.lng]);
      }
      if (driver) {
        if (!markers.current.driver) markers.current.driver = L.marker([driver.lat, driver.lng]).addTo(map.current).bindPopup('Driver');
        else markers.current.driver.setLatLng([driver.lat, driver.lng]);
        map.current.setView([driver.lat, driver.lng]);
      }
    }
    if (!(window as any).L) {
      let s = document.querySelector('script[data-leaflet-js]') as HTMLScriptElement | null;
      if (!s) {
        s = document.createElement('script');
        s.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'; s.setAttribute('data-leaflet-js', '1');
        document.head.appendChild(s);
      }
      s.addEventListener('load', init);
      const t = setInterval(() => { if ((window as any).L) { clearInterval(t); init(); } }, 200);
      return () => clearInterval(t);
    }
    init();
  }, [driver, dest]);

  if (!driver && !dest) {
    return <div className="w-full h-[200px] rounded-2xl border border-line bg-card flex items-center justify-center text-xs text-muted">Waiting for driver location…</div>;
  }
  return <div ref={ref} className="border border-line" style={{ width: '100%', height: '260px', borderRadius: '16px', overflow: 'hidden' }} />;
}
