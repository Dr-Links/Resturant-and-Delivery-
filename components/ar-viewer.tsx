'use client';

import { useEffect, useState } from 'react';

// Adapter around Google's <model-viewer>. Every dish opens "in 3D": a real
// uploaded model when present, otherwise a friendly placeholder — both with an
// animated cartoon chef. Swapping in WebXR/8thWall later means replacing only
// this component.

const CHEF_CSS = `
@keyframes chef-float { 0%,100%{ transform:translateY(0) rotate(-8deg) } 50%{ transform:translateY(-10px) rotate(8deg) } }
@keyframes dish-bob   { 0%,100%{ transform:translateY(0) } 50%{ transform:translateY(-8px) } }
`;

function Chef() {
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute', top: 10, right: 12, fontSize: 34, zIndex: 2,
        animation: 'chef-float 2.4s ease-in-out infinite',
        filter: 'drop-shadow(0 2px 4px rgba(0,0,0,.55))', pointerEvents: 'none',
      }}
    >
      👨‍🍳
    </div>
  );
}

export function ARViewer({
  glb,
  usdz,
  poster,
  alt,
}: {
  glb?: string | null;
  usdz?: string | null;
  poster?: string | null;
  alt: string;
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!glb) return;
    const existing = document.querySelector('script[data-model-viewer]') as HTMLScriptElement | null;
    if (existing) { setReady(true); return; }
    const s = document.createElement('script');
    s.type = 'module';
    s.src = 'https://unpkg.com/@google/model-viewer@3.5.0/dist/model-viewer.min.js';
    s.setAttribute('data-model-viewer', '1');
    s.onload = () => setReady(true);
    document.head.appendChild(s);
  }, [glb]);

  // Placeholder — no uploaded model yet, but the dish still "opens in 3D".
  if (!glb) {
    return (
      <div className="w-full">
        <style>{CHEF_CSS}</style>
        <div
          style={{ position: 'relative', width: '100%', height: '340px', borderRadius: '16px', overflow: 'hidden', background: 'radial-gradient(circle at 50% 30%, #1b1b1f, #0b0b0c)' }}
          className="flex items-center justify-center"
        >
          {poster ? (
            <img src={poster} alt={alt} style={{ maxHeight: '78%', maxWidth: '78%', objectFit: 'contain', borderRadius: 12, animation: 'dish-bob 3.6s ease-in-out infinite' }} />
          ) : (
            <div style={{ fontSize: 72, animation: 'dish-bob 3.6s ease-in-out infinite' }}>🍽️</div>
          )}
          <Chef />
        </div>
        <p className="mt-2 text-center text-xs text-muted">Our chef is plating a 3D view of this dish 👨‍🍳</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <style>{CHEF_CSS}</style>
      <div style={{ position: 'relative' }}>
        <model-viewer
          src={glb}
          ios-src={usdz ?? undefined}
          poster={poster ?? undefined}
          alt={alt}
          ar
          ar-modes="webxr scene-viewer quick-look"
          ar-scale="auto"
          camera-controls
          disable-pan
          disable-tap
          interaction-prompt="none"
          auto-rotate
          touch-action="none"
          shadow-intensity="1"
          style={{ width: '100%', height: '340px', backgroundColor: '#0b0b0c', borderRadius: '16px' }}
        />
        <Chef />
      </div>
      {ready ? (
        <div className="mt-2 rounded-xl border border-line bg-card px-3 py-2 text-center">
          <p className="text-xs text-white font-medium">Drag to spin the dish 🔄</p>
          <p className="text-[11px] text-muted mt-0.5">
            Want it on your real table? Tap the <span className="text-brand">cube icon</span> (bottom-right), then slowly point your phone at a flat surface and tap to place it.
          </p>
        </div>
      ) : (
        <p className="mt-2 text-center text-xs text-muted">Loading 3D…</p>
      )}
    </div>
  );
}
