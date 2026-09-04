'use client';

import { useEffect, useState } from 'react';

// Adapter around Google's <model-viewer>. Swapping in WebXR/8thWall later means
// only replacing this component — nothing else in the app touches AR directly.
export function ARViewer({
  glb,
  usdz,
  poster,
  alt,
}: {
  glb: string;
  usdz?: string | null;
  poster?: string | null;
  alt: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existing = document.querySelector('script[data-model-viewer]') as HTMLScriptElement | null;
    if (existing) {
      setReady(true);
      return;
    }
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    s.setAttribute('data-model-viewer', '1');
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, []);

  return (
    <div className="w-full">
      <model-viewer
        src={glb}
        ios-src={usdz ?? undefined}
        poster={poster ?? undefined}
        alt={alt}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        auto-rotate
        touch-action="pan-y"
        shadow-intensity="1"
        style={{ width: '100%', height: '340px', backgroundColor: '#0b0b0c', borderRadius: '16px' }}
      />
      <p className="mt-2 text-center text-xs text-muted">
        {ready ? 'Drag to rotate · tap the AR icon to place it on your table' : 'Loading 3D…'}
      </p>
    </div>
  );
}
