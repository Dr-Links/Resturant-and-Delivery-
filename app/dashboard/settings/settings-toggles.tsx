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
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-sm text-muted mb-4">Turn restaurant features on or off. Changes are saved instantly.</p>

      {msg && <p className="mb-3 text-sm text-brand">{msg}</p>}

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
    </div>
  );
}
