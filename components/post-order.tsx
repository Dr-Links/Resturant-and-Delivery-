'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { money } from '@/lib/format';

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(n)}
          className={'text-2xl leading-none ' + (n <= value ? 'text-brand' : 'text-zinc-600')}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export function PostOrder({
  restaurantId,
  sessionId,
  orderNumber,
  total,
  currency,
  items,
  onAddMore,
}: {
  restaurantId: string;
  sessionId: string;
  orderNumber: number;
  total: number;
  currency: string;
  items: { id: string; name: string }[];
  onAddMore: () => void;
}) {
  const [restStars, setRestStars] = useState(0);
  const [foodStars, setFoodStars] = useState<Record<string, number>>({});
  const [comment, setComment] = useState('');
  const [reviewed, setReviewed] = useState(false);

  const [tab, setTab] = useState<'rate' | 'suggest' | 'report'>('rate');
  const [suggestion, setSuggestion] = useState('');
  const [suggestSent, setSuggestSent] = useState(false);
  const [complaint, setComplaint] = useState('');
  const [complaintSent, setComplaintSent] = useState(false);

  async function submitReview() {
    if (restStars > 0) {
      await supabase.rpc('submit_restaurant_rating', { p_restaurant_id: restaurantId, p_session_id: sessionId, p_stars: restStars, p_comment: comment || null });
    }
    for (const it of items) {
      const s = foodStars[it.id];
      if (s) await supabase.rpc('submit_food_rating', { p_restaurant_id: restaurantId, p_item_id: it.id, p_session_id: sessionId, p_stars: s, p_comment: null });
    }
    setReviewed(true);
  }

  async function sendSuggestion() {
    if (!suggestion.trim()) return;
    await supabase.rpc('submit_suggestion', { p_restaurant_id: restaurantId, p_body: suggestion });
    setSuggestSent(true);
    setSuggestion('');
  }

  async function sendComplaint() {
    if (!complaint.trim()) return;
    await supabase.rpc('submit_complaint', { p_restaurant_id: restaurantId, p_type: 'general', p_description: complaint, p_order_id: null, p_session_id: sessionId });
    setComplaintSent(true);
    setComplaint('');
  }

  return (
    <main className="min-h-screen px-5 py-8 max-w-md mx-auto">
      <div className="text-center">
        <div className="mx-auto h-16 w-16 rounded-full bg-brand/15 border border-brand flex items-center justify-center text-brand text-3xl">✓</div>
        <h1 className="mt-3 text-2xl font-bold">Order #{orderNumber} sent to the kitchen</h1>
        <p className="text-muted">Being prepared · {money(total, currency)}</p>
      </div>

      <div className="mt-6 rounded-2xl border border-line bg-card p-4">
        <p className="text-sm text-muted">While you wait</p>
        <p className="mt-1 font-semibold">🎬 Restaurant videos — coming with the video stage</p>
      </div>

      <div className="mt-6 flex gap-1 rounded-full border border-line p-1 text-sm">
        {(['rate', 'suggest', 'report'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={'flex-1 rounded-full py-2 ' + (tab === t ? 'bg-brand text-black font-semibold' : 'text-muted')}>
            {t === 'rate' ? 'Rate' : t === 'suggest' ? 'Suggest' : 'Report'}
          </button>
        ))}
      </div>

      {tab === 'rate' && (
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          {reviewed ? (
            <p className="text-center py-4">Thanks for your feedback! 🙏</p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <span className="font-semibold">Overall</span>
                <Stars value={restStars} onChange={setRestStars} />
              </div>
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="A comment (optional)" className="mt-2 w-full rounded-xl bg-ink border border-line p-3 text-sm outline-none focus:border-brand" rows={2} />
              <div className="mt-4 border-t border-line pt-3 space-y-2">
                {items.map((it) => (
                  <div key={it.id} className="flex items-center justify-between">
                    <span className="text-sm">{it.name}</span>
                    <Stars value={foodStars[it.id] ?? 0} onChange={(n) => setFoodStars((f) => ({ ...f, [it.id]: n }))} />
                  </div>
                ))}
              </div>
              <button onClick={submitReview} className="mt-4 w-full rounded-full bg-brand text-black py-3 font-semibold">Submit review</button>
            </>
          )}
        </div>
      )}

      {tab === 'suggest' && (
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          {suggestSent ? (
            <p className="text-center py-4">Suggestion received. Thank you!</p>
          ) : (
            <>
              <textarea value={suggestion} onChange={(e) => setSuggestion(e.target.value)} placeholder="Your suggestion…" className="w-full rounded-xl bg-ink border border-line p-3 text-sm outline-none focus:border-brand" rows={3} />
              <button onClick={sendSuggestion} className="mt-3 w-full rounded-full bg-brand text-black py-3 font-semibold">Send suggestion</button>
            </>
          )}
        </div>
      )}

      {tab === 'report' && (
        <div className="mt-4 rounded-2xl border border-line bg-card p-4">
          {complaintSent ? (
            <p className="text-center py-4">Sent privately to support. We’ll look into it.</p>
          ) : (
            <>
              <p className="text-xs text-muted mb-2">This goes privately to support, not the restaurant.</p>
              <textarea value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Describe the problem…" className="w-full rounded-xl bg-ink border border-line p-3 text-sm outline-none focus:border-brand" rows={3} />
              <button onClick={sendComplaint} className="mt-3 w-full rounded-full border border-line py-3 font-semibold">Send report</button>
            </>
          )}
        </div>
      )}

      <button onClick={onAddMore} className="mt-6 w-full rounded-full border border-line py-3 font-semibold">Add more items</button>
    </main>
  );
}
