import { getServerSupabase } from '@/lib/supabase/server';
import { IntegrationsManager } from './integrations-manager';
export const dynamic = 'force-dynamic';

type Row = {
  provider_key: string; setting_key: string; label: string | null;
  is_secret: boolean; value: string | null; vault_secret_id: string | null;
};
type Prov = { key: string; label: string; category: string; enabled: boolean };

export default async function AdminIntegrations() {
  const supabase = getServerSupabase();
  const [{ data: providers }, { data: settings }] = await Promise.all([
    supabase.from('integration_providers').select('key,label,category,enabled').order('category').order('label'),
    supabase.from('integration_settings').select('provider_key,setting_key,label,is_secret,value,vault_secret_id').order('setting_key'),
  ]);

  const provs = (providers as Prov[]) ?? [];
  const rows = (settings as Row[]) ?? [];

  // Never send secret values to the client — only whether a value is set.
  const view = provs.map((p) => ({
    key: p.key, label: p.label, category: p.category, enabled: p.enabled,
    settings: rows
      .filter((s) => s.provider_key === p.key)
      .map((s) => ({
        setting_key: s.setting_key,
        label: s.label,
        is_secret: s.is_secret,
        value: s.is_secret ? null : s.value,
        is_set: s.is_secret ? s.vault_secret_id != null : Boolean(s.value && s.value.length > 0),
      })),
  }));

  return <IntegrationsManager initial={view} />;
}
