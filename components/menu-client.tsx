'use client';

import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';
import { ARViewer } from '@/components/ar-viewer';
import { PayOrder } from '@/components/pay-order';
import { logEvent } from '@/lib/analytics';
import type { MenuItem } from '@/app/t/[token]/page';

type Category = { id: string; name: string; kind: string; sort_order: number };
type Restaurant = { id: string; name: string; currency: string };
type Activity = { table_label: string; item_name: string; qty: number };
type Video = { id: string; url: string; title: string | null };

function ytId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function platformOf(url: string): string {
  if (/instagram\.com/i.test(url)) return 'Instagram';
  if (/tiktok\.com/i.test(url)) return 'TikTok';
  if (/(facebook\.com|fb\.watch)/i.test(url)) return 'Facebook';
  if (/(youtube\.com|youtu\.be)/i.test(url)) return 'YouTube';
  return 'social';
}
// Inline-playable embed URL for the restaurant's preferred platform. YouTube,
// TikTok and Facebook play inline; Instagram (needs its own script) -> null (button).
function socialEmbed(url: string): { src: string; vertical: boolean } | null {
  const yt = ytId(url);
  if (yt) return { src: `https://www.youtube.com/embed/${yt}`, vertical: false };
  const tk = url.match(/tiktok\.com\/(?:.*\/video\/|v\/)(\d+)/);
  if (tk) return { src: `https://www.tiktok.com/embed/v2/${tk[1]}`, vertical: true };
  if (/(facebook\.com|fb\.watch)/i.test(url)) {
    return { src: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false`, vertical: false };
  }
  return null;
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} onClick={() => onChange(n)} className={'text-2xl ' + (n <= value ? 'text-brand' : 'text-zinc-600')} aria-label={`${n} stars`}>
          ★
        </button>
      ))}
    </div>
  );
}

export function MenuClient({
  restaurant, table, session, categories, items, activity, videos, socialVideoUrl, orderingEnabled = true,
}: {
  restaurant: Restaurant;
  table: { id: string; label: string };
  session: { id: string; code: number };
  categories: Category[];
  items: MenuItem[];
  activity: Activity[];
  videos: Video[];
  socialVideoUrl?: string | null;
  orderingEnabled?: boolean;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [openItem, setOpenItem] = useState<MenuItem | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placed, setPlaced] = useState<{ number: number; total: number } | null>(null);
  const [payment, setPayment] = useState<{ orderId: string; number: number; total: number } | null>(null);

  // post-order engagement state
  const [foodStars, setFoodStars] = useState(0);
  const [restoStars, setRestoStars] = useState(0);
  const [thanks, setThanks] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [suggestionSent, setSuggestionSent] = useState(false);

  const cur = restaurant.currency || 'XAF';
  const itemsById = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const count = Object.values(cart).reduce((a, b) => a + b, 0);
  const total = Object.entries(cart).reduce((sum, [id, q]) => sum + (itemsById[id]?.price ?? 0) * q, 0);

  const add = (id: string) => {
    logEvent(restaurant.id, id, 'add_to_cart', session.id);
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  };
  const remove = (id: string) =>
    setCart((c) => { const n = (c[id] ?? 0) - 1; const next = { ...c }; if (n <= 0) delete next[id]; else next[id] = n; return next; });

  const img = (i: MenuItem) => [...(i.menu_item_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0]?.url ?? null;
  const model = (i: MenuItem) => (i.menu_item_3d_models ?? []).find((m) => m.status === 'published' && m.glb_url) ?? null;

  const openAndLog = (i: MenuItem) => {
    setOpenItem(i);
    logEvent(restaurant.id, i.id, 'view', session.id);
    if (model(i)) logEvent(restaurant.id, i.id, 'ar_open', session.id);
  };

  async function placeOrder() {
    if (count === 0 || placing) return;
    setPlacing(true);
    const p_items = Object.entries(cart).map(([menu_item_id, quantity]) => ({ menu_item_id, quantity }));
    const { data, error } = await supabase.rpc('place_order', { p_session_id: session.id, p_items });
    setPlacing(false);
    if (error || !data || (data as any).error) { alert('Could not place the order. Please try again or ask a waiter.'); return; }
    const res = data as { order_id: string; order_number: number; subtotal: number };
    p_items.forEach((pi) => logEvent(restaurant.id, pi.menu_item_id, 'order', session.id));
    setCart({});
    setPayment({ orderId: res.order_id, number: res.order_number, total: res.subtotal });
  }

  async function rateFood(n: number) {
    setFoodStars(n);
    await supabase.rpc('submit_review', { p_restaurant_id: restaurant.id, p_kind: 'food', p_rating: n, p_session_id: session.id });
    setThanks(true);
  }
  async function rateResto(n: number) {
    setRestoStars(n);
    await supabase.rpc('submit_review', { p_restaurant_id: restaurant.id, p_kind: 'restaurant', p_rating: n, p_session_id: session.id });
    setThanks(true);
  }
  async function sendSuggestion() {
    if (!suggestion.trim()) return;
    await supabase.rpc('submit_suggestion', { p_restaurant_id: restaurant.id, p_body: suggestion });
    setSuggestion('');
    setSuggestionSent(true);
  }

  if (payment) {
    return (
      <PayOrder
        orderId={payment.orderId}
        orderNumber={payment.number}
        amount={payment.total}
        currency={cur}
        onPaid={() => { setPlaced({ number: payment.number, total: payment.total }); setPayment(null); }}
        onPayLater={() => { setPlaced({ number: payment.number, total: payment.total }); setPayment(null); }}
      />
    );
  }

  if (placed) {
    return (
      <main className="min-h-screen px-5 py-8 max-w-lg mx-auto">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 rounded-full bg-brand/15 border border-brand flex items-center justify-center text-brand text-3xl">✓</div>
          <h1 className="mt-3 text-2xl font-bold">Order #{placed.number} sent to the kitchen</h1>
          <p className="text-muted">Your food is being prepared. {money(placed.total, cur)}</p>
        </div>

        {videos.length > 0 && (
          <section className="mt-6">
            <p className="text-sm font-semibold mb-2">While you wait 🎬</p>
            <div className="space-y-3">
              {videos.map((v) => (
                <div key={v.id} className="rounded-2xl border border-line overflow-hidden bg-card">
                  <video src={v.url} controls playsInline className="w-full" onPlay={() => logEvent(restaurant.id, null, 'view', session.id)} />
                  {v.title && <p className="p-3 text-sm">{v.title}</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-6 rounded-2xl border border-line bg-card p-4">
          <p className="font-semibold">Rate your experience</p>
          {thanks && <p className="text-xs text-brand mt-1">Thanks for the feedback!</p>}
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-muted">The food</span>
            <Stars value={foodStars} onChange={rateFood} />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <span className="text-sm text-muted">The restaurant</span>
            <Stars value={restoStars} onChange={rateResto} />
          </div>
        </section>

        <section className="mt-4 rounded-2xl border border-line bg-card p-4">
          <p className="font-semibold">Have a suggestion?</p>
          {suggestionSent ? (
            <p className="text-sm text-brand mt-2">Suggestion received. Thank you!</p>
          ) : (
            <>
              <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} rows={2} placeholder="Tell us how we can improve…" className="mt-2 w-full rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
              <button onClick={sendSuggestion} className="mt-2 rounded-full border border-line px-4 py-2 text-sm">Send</button>
            </>
          )}
        </section>

        <button onClick={() => setPlaced(null)} className="mt-6 w-full rounded-full bg-brand text-black py-3 font-semibold">Add more items</button>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28">
      <header className="sticky top-0 z-10 bg-ink/90 backdrop-blur border-b border-line px-5 py-4">
        <div className="flex items-center justify-between">
          <div><h1 className="text-xl font-bold leading-tight">{restaurant.name}</h1><p className="text-xs text-muted">Table {table.label} · Session #{session.code}</p></div>
          <div className="text-right text-xs text-muted"><span className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Dining in</span></div>
        </div>
      </header>

      {activity.length > 0 && (
        <section className="px-5 pt-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">Popular right now · tap to view</p>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {activity.map((a, idx) => {
              const match = items.find((i) => i.name.toLowerCase() === a.item_name.toLowerCase());
              return (
                <button
                  key={idx}
                  onClick={() => match && openAndLog(match)}
                  disabled={!match}
                  className="shrink-0 rounded-full border border-line bg-card px-3 py-1.5 text-sm flex items-center gap-1.5 disabled:opacity-70 enabled:hover:border-brand transition-colors"
                >
                  <span>🔥</span>
                  <span className="text-brand font-semibold">{a.item_name}</span>
                  {a.qty > 1 && <span className="text-muted">×{a.qty}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {(socialVideoUrl || videos.length > 0) && (
        <section className="px-5 pt-4">
          <p className="text-xs uppercase tracking-wide text-muted mb-2">Watch 🎬</p>
          {socialVideoUrl && (() => {
            const embed = socialEmbed(socialVideoUrl);
            if (embed) {
              return (
                <div
                  className={'mb-3 overflow-hidden rounded-2xl border border-line bg-black ' + (embed.vertical ? '' : 'aspect-video')}
                  style={embed.vertical ? { height: 560 } : undefined}
                >
                  <iframe
                    src={embed.src}
                    title="Featured video"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              );
            }
            return (
              <a
                href={socialVideoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mb-3 flex items-center justify-between rounded-2xl border border-brand/50 bg-brand/10 px-4 py-3 font-semibold text-brand"
              >
                <span>Watch our {platformOf(socialVideoUrl)} video</span>
                <span>↗</span>
              </a>
            );
          })()}
          {videos.length > 0 && (
            <div className="flex gap-3 overflow-x-auto no-scrollbar pb-1">
              {videos.map((v) => (
                <video
                  key={v.id}
                  src={v.url}
                  controls
                  playsInline
                  preload="metadata"
                  className="shrink-0 w-64 rounded-2xl border border-line bg-card"
                  onPlay={() => logEvent(restaurant.id, null, 'view', session.id)}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="px-5 pt-5 space-y-8">
        {categories.map((cat) => {
          const catItems = items.filter((i) => i.category_id === cat.id);
          if (catItems.length === 0) return null;
          return (
            <section key={cat.id}>
              <h2 className="text-lg font-bold mb-3">{cat.name}</h2>
              <div className="grid grid-cols-1 gap-3">
                {catItems.map((i) => (
                  <button key={i.id} onClick={() => openAndLog(i)} className="text-left rounded-2xl border border-line bg-card overflow-hidden flex">
                    <div className="flex-1 p-4">
                      <div className="flex items-center gap-2"><h3 className="font-semibold">{i.name}</h3>{model(i) && <span className="rounded-full bg-brand/15 text-brand text-[10px] px-2 py-0.5 border border-brand/40">AR</span>}</div>
                      {i.description && <p className="mt-1 text-sm text-muted line-clamp-2">{i.description}</p>}
                      <p className="mt-2 font-semibold text-brand">{money(i.price, cur)}</p>
                    </div>
                    {img(i) && (<img src={img(i)!} alt={i.name} className="w-28 h-28 object-cover" />)}
                  </button>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      {openItem && (
        <div className="fixed inset-0 z-20 bg-black/70 flex items-end sm:items-center sm:justify-center" onClick={() => setOpenItem(null)}>
          <div className="w-full sm:max-w-md bg-ink border-t sm:border border-line rounded-t-3xl sm:rounded-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <ARViewer glb={model(openItem)?.glb_url ?? null} usdz={model(openItem)?.usdz_url ?? null} poster={img(openItem)} alt={openItem.name} />
              <div className="mt-4">
                <h2 className="text-2xl font-bold">{openItem.name}</h2>
                <p className="mt-1 text-brand font-semibold text-lg">{money(openItem.price, cur)}</p>
                {openItem.description && <p className="mt-3 text-muted">{openItem.description}</p>}
                {openItem.ingredients && (<p className="mt-3 text-sm text-muted"><span className="text-zinc-300">Ingredients: </span>{openItem.ingredients}</p>)}
              </div>
              <div className="mt-5 flex items-center gap-3">
                {orderingEnabled ? (
                  <>
                    {cart[openItem.id] ? (<div className="flex items-center gap-4 rounded-full border border-line px-4 py-2"><button onClick={() => remove(openItem.id)} className="text-xl">−</button><span className="min-w-6 text-center font-semibold">{cart[openItem.id]}</span><button onClick={() => add(openItem.id)} className="text-xl">+</button></div>) : (<button onClick={() => add(openItem.id)} className="flex-1 rounded-full bg-brand px-6 py-3 font-semibold text-black">Add to order</button>)}
                    <button onClick={() => setOpenItem(null)} className="rounded-full border border-line px-5 py-3">Close</button>
                  </>
                ) : (
                  <button onClick={() => setOpenItem(null)} className="flex-1 rounded-full border border-line px-5 py-3">Close</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {orderingEnabled && count > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-10 p-4">
          <button onClick={placeOrder} disabled={placing} className="w-full rounded-full bg-brand text-black py-4 font-semibold flex items-center justify-between px-6 shadow-lg disabled:opacity-60">
            <span>{placing ? 'Sending…' : `Place order · ${count} item${count > 1 ? 's' : ''}`}</span>
            <span>{money(total, cur)}</span>
          </button>
        </div>
      )}
    </main>
  );
}
