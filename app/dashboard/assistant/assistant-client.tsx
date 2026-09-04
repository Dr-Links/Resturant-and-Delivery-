'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Msg = { role: 'you' | 'ai'; text: string; proposal?: any; actionId?: string | null; done?: string };

const SUGGESTIONS = [
  'What are my best sellers?',
  'Which foods get views but few orders?',
  'Which category performs best?',
  'What should I promote?',
];

export function AssistantClient() {
  const router = useRouter();
  const supabase = createClient();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setMsgs((m) => [...m, { role: 'you', text: question }]);
    setQ(''); setBusy(true);
    try {
      const res = await fetch('/api/ai/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question }) });
      const data = await res.json();
      setMsgs((m) => [...m, { role: 'ai', text: data.answer ?? 'No answer.', proposal: data.proposal, actionId: data.action_id }]);
    } catch { setMsgs((m) => [...m, { role: 'ai', text: 'Request failed.' }]); }
    setBusy(false);
  }

  async function apply(idx: number, actionId: string) {
    const { data } = await supabase.rpc('apply_menu_proposal', { p_action_id: actionId });
    setMsgs((m) => m.map((msg, i) => (i === idx ? { ...msg, done: (data as any)?.ok ? 'applied' : 'failed' } : msg)));
    if ((data as any)?.ok) router.refresh();
  }
  function dismiss(idx: number) { setMsgs((m) => m.map((msg, i) => (i === idx ? { ...msg, done: 'dismissed' } : msg))); }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold mb-1">AI assistant</h1>
      <p className="text-sm text-muted mb-4">Ask about your data. Menu changes are only ever <span className="text-white">proposed</span> — you confirm before anything changes.</p>

      {msgs.length === 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {SUGGESTIONS.map((s) => (<button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:text-white">{s}</button>))}
        </div>
      )}

      <div className="space-y-3 mb-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.role === 'you' ? 'text-right' : ''}>
            <div className={'inline-block rounded-2xl px-4 py-2 text-sm ' + (m.role === 'you' ? 'bg-brand text-black' : 'bg-card border border-line')}>{m.text}</div>
            {m.proposal && (
              <div className="mt-2 rounded-2xl border border-brand/50 bg-brand/10 p-3 text-sm">
                <p className="font-semibold">Proposed change</p>
                <p className="text-muted mt-1">{m.proposal.summary ?? JSON.stringify(m.proposal)}</p>
                {!m.done ? (
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => apply(i, m.actionId!)} className="rounded-full bg-brand text-black px-4 py-1.5 font-semibold">Apply</button>
                    <button onClick={() => dismiss(i)} className="rounded-full border border-line px-4 py-1.5">Dismiss</button>
                  </div>
                ) : (<p className="mt-2 text-brand capitalize">{m.done}</p>)}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && ask(q)} placeholder="Ask about your restaurant…" className="flex-1 rounded-full bg-ink border border-line px-4 py-3 outline-none focus:border-brand" />
        <button onClick={() => ask(q)} disabled={busy} className="rounded-full bg-brand text-black px-6 py-3 font-semibold disabled:opacity-50">{busy ? '…' : 'Ask'}</button>
      </div>
    </div>
  );
}
