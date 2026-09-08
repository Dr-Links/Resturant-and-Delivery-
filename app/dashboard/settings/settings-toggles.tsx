'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const FEATURES: { key: string; label: string; hint: string }[] = [
  {
    key: 'show_table_activity',
    label: 'Show table activity',
    hint: 'Let customers see what other tables ordered — dish name + table label only, no names, prices, or personal info. Turn off to hide cross-table activity entirely.',
  },
  {
    key: 'digital_ordering_enabled',
    label: 'Digital ordering',
    hint: 'Customers order from their phone after scanning the table QR. Turn off to use the menu for browsing only.',
  },
  {
    key: 'kitchen_screen_enabled',
    label: 'Kitchen screen',
    hint: 'Enable the kitchen display mode for incoming orders.',
  },
];

export function SettingsToggles({ restaurantId, initial }: { restaurantId: string; initial: Record<string, unknown> }) {
  const supabase = createClient();
  const router = useRouter();
  const [settings, setSettings] = useState<Record<string, unknown>>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [socialUrl, setSocialUrl] = useState<string>((initial.social_video_url as string) ?? '');
  const [savingSocial, setSavingSocial] = useState(false);
  const [qrUrl, setQrUrl] = useState<string>((initial.payment_qr_url as string) ?? '');
  const [qrBusy, setQrBusy] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>((initial.logo_url as string) ?? '');
  const [logoBusy, setLogoBusy] = useState(false);

  async function saveKey(key: string, value: string | null) {
    const next = { ...settings, [key]: value };
    const { error } = await supabase.from('restaurants').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', restaurantId);
    if (error) throw error;
    setSettings(next);
  }

  async function uploadImage(kind: 'logo' | 'payment-qr', file: File, onUrl: (u: string) => void, settingKey: string, setBusyFn: (b: boolean) => void, okMsg: string) {
    setBusyFn(true); setMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${restaurantId}/${kind}/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('item-images').upload(path, file, { contentType: file.type || 'image/png' });
      if (upErr) throw upErr;
      const url = supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl;
      await saveKey(settingKey, url);
      onUrl(url); setMsg(okMsg); router.refresh();
    } catch { setMsg('Could not upload the image.'); } finally { setBusyFn(false); }
  }

  async function clearLogo() {
    setLogoBusy(true); setMsg(null);
    try { await saveKey('logo_url', null); setLogoUrl(''); router.refresh(); }
    catch { setMsg('Could not remove the logo.'); }
    finally { setLogoBusy(false); }
  }

  async function saveSocial() {
    setSavingSocial(true); setMsg(null);
    const next = { ...settings, social_video_url: socialUrl.trim() || null };
    const { error } = await supabase.from('restaurants').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', restaurantId);
    setSavingSocial(false);
    if (error) { setMsg('Could not save the video link.'); return; }
    setSettings(next); setMsg('Saved.'); router.refresh();
  }

  async function saveQr(value: string | null) {
    const next = { ...settings, payment_qr_url: value };
    const { error } = await supabase.from('restaurants').update({ settings: next, updated_at: new Date().toISOString() }).eq('id', restaurantId);
    if (error) throw error;
    setSettings(next);
  }

  async function uploadQr(file: File) {
    setQrBusy(true); setMsg(null);
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const path = `${restaurantId}/payment-qr/${Date.now()}-${safe}`;
      const { error: upErr } = await supabase.storage.from('item-images').upload(path, file, { contentType: file.type || 'image/png' });
      if (upErr) throw upErr;
      const url = supabase.storage.from('item-images').getPublicUrl(path).data.publicUrl;
      await saveQr(url);
      setQrUrl(url); setMsg('Payment QR saved.'); router.refresh();
    } catch {
      setMsg('Could not upload the payment QR.');
    } finally {
      setQrBusy(false);
    }
  }

  async function clearQr() {
    setQrBusy(true); setMsg(null);
    try { await saveQr(null); setQrUrl(''); router.refresh(); }
    catch { setMsg('Could not remove the payment QR.'); }
    finally { setQrBusy(false); }
  }

  async function toggle(key: string) {
    const prev = settings;
    const next = { ...settings, [key]: !Boolean(settings[key]) };
    setSettings(next);
    setBusy(key);
    setMsg(null);
    const { error } = await supabase
      .from('restaurants')
      .update({ settings: next, updated_at: new Date().toISOString() })
      .eq('id', restaurantId);
    setBusy(null);
    if (error) {
      setSettings(prev); // revert
      setMsg('Could not save. Please try again.');
      return;
    }
    setMsg('Saved.');
    router.refresh();
  }

  return (
    <div>
      <p className="text-sm text-muted mb-3">Turn restaurant features on or off. Changes are saved instantly.</p>

      {msg && <p className="mb-3 text-sm text-brand">{msg}</p>}

      <div className="rounded-2xl border border-line bg-card p-4 mb-4">
        <p className="font-medium">Restaurant logo</p>
        <p className="text-xs text-muted mt-0.5 mb-3">Shown in the top bar of the customer menu.</p>
        <div className="flex items-center gap-3">
          {logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="Logo" className="h-14 w-14 rounded-lg object-cover border border-line" />
          )}
          <label className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold cursor-pointer">
            {logoBusy ? 'Uploading…' : logoUrl ? 'Replace logo' : '+ Upload logo'}
            <input type="file" accept="image/*" className="hidden" disabled={logoBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage('logo', f, setLogoUrl, 'logo_url', setLogoBusy, 'Logo saved.'); e.currentTarget.value = ''; }} />
          </label>
          {logoUrl && <button onClick={clearLogo} disabled={logoBusy} className="rounded-full border border-line px-4 py-1.5 text-sm text-muted">Remove</button>}
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card divide-y divide-line">
        {FEATURES.map((f) => {
          const on = Boolean(settings[f.key]);
          return (
            <div key={f.key} className="flex items-start justify-between gap-4 p-4">
              <div className="flex-1">
                <p className="font-medium">{f.label}</p>
                <p className="text-xs text-muted mt-0.5">{f.hint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={on}
                disabled={busy === f.key}
                onClick={() => toggle(f.key)}
                className={
                  'relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-60 ' +
                  (on ? 'bg-brand' : 'bg-line')
                }
              >
                <span
                  className={
                    'absolute top-1 h-5 w-5 rounded-full bg-white transition-all ' +
                    (on ? 'left-6' : 'left-1')
                  }
                />
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-2xl border border-line bg-card p-4 mt-4">
        <p className="font-medium">Featured social video</p>
        <p className="text-xs text-muted mt-0.5 mb-3">
          Link one video from your social media (YouTube, Instagram, TikTok, Facebook). Customers see it in the menu&apos;s
          Watch section. YouTube plays inline; others open in the app. Leave blank to remove.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            value={socialUrl}
            onChange={(e) => setSocialUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…  or  instagram.com/reel/…"
            className="flex-1 min-w-[220px] rounded-xl bg-ink border border-line px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <button
            onClick={saveSocial}
            disabled={savingSocial}
            className="rounded-full bg-brand text-black px-5 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {savingSocial ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-line bg-card p-4 mt-4">
        <p className="font-medium">Payment QR (scan to pay)</p>
        <p className="text-xs text-muted mt-0.5 mb-3">
          Upload your mobile money or bank merchant QR. Customers can scan it at checkout to pay — works
          <span className="text-white"> with or without </span> the online payment gateway.
        </p>
        {qrUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qrUrl} alt="Payment QR" className="w-32 h-32 rounded-lg bg-white p-1 object-contain mb-3" />
        )}
        <div className="flex items-center gap-2">
          <label className="rounded-full bg-brand text-black px-4 py-1.5 text-sm font-semibold cursor-pointer">
            {qrBusy ? 'Uploading…' : qrUrl ? 'Replace QR' : '+ Upload QR'}
            <input type="file" accept="image/*" className="hidden" disabled={qrBusy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadQr(f); e.currentTarget.value = ''; }} />
          </label>
          {qrUrl && <button onClick={clearQr} disabled={qrBusy} className="rounded-full border border-line px-4 py-1.5 text-sm text-muted">Remove</button>}
        </div>
      </div>
    </div>
  );
}
