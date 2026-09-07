'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Setting = {
  setting_key: string;
  label: string | null;
  is_secret: boolean;
  value: string | null;
  is_set: boolean;
};
type Provider = { key: string; label: string; category: string; enabled: boolean; settings: Setting[] };

const CATEGORY_ORDER = ['payments', 'maps', 'other'];
const CATEGORY_LABEL: Record<string, string> = { payments: 'Payments', maps: 'Maps', other: 'Other integrations' };

export function IntegrationsManager({ initial }: { initial: Provider[] }) {
  const supabase = createClient();
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const dk = (p: string, s: string) => `${p}:${s}`;
  const setDraft = (k: string, v: string) => setDrafts((d) => ({ ...d, [k]: v }));

  async function run(id: string, fn: () => Promise<{ error: unknown }>, okMsg: string) {
    setBusy(id); setMsg(null);
    const { error } = await fn();
    setBusy(null);
    if (error) { setMsg((error as { message?: string }).message ?? 'Something went wrong.'); return; }
    setMsg(okMsg); router.refresh();
  }

  const saveSetting = (pk: string, s: Setting) => {
    const key = dk(pk, s.setting_key);
    const val = drafts[key] ?? (s.is_secret ? '' : s.value ?? '');
    if (s.is_secret && val === '') { setMsg('Enter a value before saving a secret.'); return; }
    return run(key, async () => {
      const { error } = await supabase.rpc('admin_set_integration_setting', {
        p_provider: pk, p_setting_key: s.setting_key, p_is_secret: s.is_secret, p_value: val, p_label: s.label,
      });
      return { error };
    }, 'Saved.');
  };

  const clearSetting = (pk: string, s: Setting) =>
    run(dk(pk, s.setting_key) + ':clear', async () => {
      const { error } = await supabase.rpc('admin_delete_integration_setting', { p_provider: pk, p_setting_key: s.setting_key });
      return { error };
    }, 'Cleared.');

  const toggleEnabled = (p: Provider) =>
    run(p.key + ':enabled', async () => {
      const { error } = await supabase.from('integration_providers')
        .update({ enabled: !p.enabled, updated_at: new Date().toISOString() }).eq('key', p.key);
      return { error };
    }, p.enabled ? 'Disabled.' : 'Enabled.');

  const deleteProvider = (p: Provider) => {
    if (!confirm(`Delete integration "${p.label}" and all its credentials?`)) return;
    return run(p.key + ':del', async () => {
      const { error } = await supabase.rpc('admin_delete_provider', { p_provider: p.key });
      return { error };
    }, 'Integration deleted.');
  };

  const byCategory = CATEGORY_ORDER
    .map((cat) => ({ cat, items: initial.filter((p) => p.category === cat) }))
    .concat({ cat: '__rest__', items: initial.filter((p) => !CATEGORY_ORDER.includes(p.category)) })
    .filter((g) => g.items.length > 0);

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Integrations &amp; API keys</h1>
        <p className="text-sm text-muted">
          Manage third-party credentials. Secrets are encrypted at rest (Vault) and never shown again after saving —
          you can only replace or clear them. Non-secret config (URLs, currency) is editable inline.
        </p>
      </div>

      {msg && <p className="text-sm text-brand">{msg}</p>}

      {byCategory.map((group) => (
        <div key={group.cat} className="space-y-3">
          <h2 className="text-lg font-semibold">{CATEGORY_LABEL[group.cat] ?? 'Other integrations'}</h2>
          {group.items.map((p) => (
            <div key={p.key} className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-semibold">{p.label}</p>
                  <p className="text-xs text-muted">{p.key}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleEnabled(p)}
                    disabled={busy === p.key + ':enabled'}
                    className={'rounded-full px-3 py-1 text-xs border ' + (p.enabled ? 'bg-brand/20 text-brand border-brand/50' : 'border-line text-muted')}
                  >
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button onClick={() => deleteProvider(p)} disabled={busy === p.key + ':del'} className="rounded-full border border-line px-3 py-1 text-xs text-red-300">Delete</button>
                </div>
              </div>

              <div className="space-y-2">
                {p.settings.map((s) => {
                  const key = dk(p.key, s.setting_key);
                  return (
                    <div key={s.setting_key} className="flex flex-wrap items-center gap-2 border-b border-line py-2">
                      <div className="min-w-[160px] flex-1">
                        <p className="text-sm font-medium">{s.label ?? s.setting_key}</p>
                        <p className="text-[11px] text-muted">{s.setting_key}{s.is_secret ? ' · secret' : ''}</p>
                      </div>
                      <input
                        type={s.is_secret ? 'password' : 'text'}
                        autoComplete="off"
                        placeholder={s.is_secret ? (s.is_set ? '•••••••• set — enter to replace' : 'not set') : ''}
                        defaultValue={s.is_secret ? '' : s.value ?? ''}
                        onChange={(e) => setDraft(key, e.target.value)}
                        className="w-52 rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
                      />
                      <button onClick={() => saveSetting(p.key, s)} disabled={busy === key} className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold disabled:opacity-50">Save</button>
                      {s.is_set && (
                        <button onClick={() => clearSetting(p.key, s)} disabled={busy === key + ':clear'} className="rounded-full border border-line px-3 py-1.5 text-sm text-muted">Clear</button>
                      )}
                    </div>
                  );
                })}
              </div>

              <AddSetting providerKey={p.key} onDone={() => router.refresh()} />
            </div>
          ))}
        </div>
      ))}

      <AddProvider onDone={() => router.refresh()} />
    </div>
  );
}

function AddSetting({ providerKey, onDone }: { providerKey: string; onDone: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  const [secret, setSecret] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    if (!k.trim()) { setErr('Key is required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc('admin_set_integration_setting', {
      p_provider: providerKey, p_setting_key: k.trim(), p_is_secret: secret, p_value: v, p_label: k.trim(),
    });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setK(''); setV(''); setOpen(false); onDone();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="mt-3 text-xs text-brand hover:underline">+ Add field</button>;
  return (
    <div className="mt-3 rounded-xl border border-line p-3 flex flex-wrap items-center gap-2">
      <input value={k} onChange={(e) => setK(e.target.value)} placeholder="KEY_NAME" className="w-40 rounded-lg bg-ink border border-line px-3 py-1.5 text-sm outline-none focus:border-brand" />
      <input value={v} onChange={(e) => setV(e.target.value)} placeholder="value" type={secret ? 'password' : 'text'} autoComplete="off" className="w-44 rounded-lg bg-ink border border-line px-3 py-1.5 text-sm outline-none focus:border-brand" />
      <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={secret} onChange={(e) => setSecret(e.target.checked)} /> secret</label>
      <button onClick={add} disabled={busy} className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold disabled:opacity-50">Add</button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted">Cancel</button>
      {err && <p className="w-full text-xs text-red-400">{err}</p>}
    </div>
  );
}

function AddProvider({ onDone }: { onDone: () => void }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('other');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function add() {
    const k = key.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!k || !label.trim()) { setErr('Key and label are required.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.from('integration_providers').insert({ key: k, label: label.trim(), category });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setKey(''); setLabel(''); setOpen(false); onDone();
  }

  if (!open) return <button onClick={() => setOpen(true)} className="rounded-full border border-line px-4 py-2 text-sm text-brand">+ Add integration</button>;
  return (
    <div className="rounded-2xl border border-line bg-card p-4 flex flex-wrap items-center gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Display name (e.g. Stripe)" className="w-52 rounded-lg bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
      <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="key_slug (e.g. stripe)" className="w-44 rounded-lg bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand">
        <option value="payments">Payments</option>
        <option value="maps">Maps</option>
        <option value="other">Other</option>
      </select>
      <button onClick={add} disabled={busy} className="rounded-full bg-brand text-black px-4 py-2 text-sm font-semibold disabled:opacity-50">Create</button>
      <button onClick={() => setOpen(false)} className="text-xs text-muted">Cancel</button>
      {err && <p className="w-full text-xs text-red-400">{err}</p>}
    </div>
  );
}
