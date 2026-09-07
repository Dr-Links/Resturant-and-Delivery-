'use client';

import { useEffect, useRef } from 'react';

export type MapPoint = { id: string; lat: number; lng: number; label: string; status: string };

// Overview map of delivery destinations. Leaflet + OpenStreetMap tiles (no API
// key needed). Coordinates come from geocoding at delivery-creation time.
export function DeliveriesMap({ points }: { points: MapPoint[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const map = useRef<any>(null);

  useEffect(() => {
    if (points.length === 0) return;
    if (!document.querySelector('link[data-leaflet]')) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'; l.setAttribute('data-leaflet', '1');
      document.head.appendChild(l);
    }
    function init() {
      const L = (window as any).L;
      if (!L || !ref.current) return;
      if (!map.current) {
        const c = points[0];
        map.current = L.map(ref.current).setView([c.lat, c.lng], 12);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }).addTo(map.current);
      }
      const layer = L.featureGroup();
      points.forEach((p) => {
        L.marker([p.lat, p.lng]).bindPopup(`${p.label}<br><span style="text-transform:capitalize">${p.status.replace('_', ' ')}</span>`).addTo(layer);
      });
      layer.addTo(map.current);
      if (points.length > 1) map.current.fitBounds(layer.getBounds().pad(0.2));
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
  }, [points]);

  if (points.length === 0) {
    return (
      <div className="w-full h-[180px] rounded-2xl border border-line bg-card flex items-center justify-center text-center text-xs text-muted px-6">
        No mapped delivery locations yet. Destinations appear here once addresses are geocoded (set the Google Maps key under Integrations).
      </div>
    );
  }
  return <div ref={ref} className="border border-line" style={{ width: '100%', height: '320px', borderRadius: '16px', overflow: 'hidden' }} />;
}
