import 'server-only';
import { getAdminSupabase, hasAdmin } from '@/lib/supabase/admin';

// Reads a third-party integration's config (including Vault-decrypted secrets)
// from the DB via the service-role-only get_integration_config RPC, then returns
// a resolver that falls back to process.env, then to a caller default. This lets
// admins manage credentials from the dashboard while env vars keep working
// (e.g. mock mode with no service-role key set).

export type ConfigResolver = (key: string, fallback?: string) => string;

async function fetchDbConfig(provider: string): Promise<Record<string, string>> {
  if (!hasAdmin()) return {};
  try {
    const supabase = getAdminSupabase();
    const { data } = await supabase.rpc('get_integration_config', { p_provider: provider });
    const out: Record<string, string> = {};
    if (data && typeof data === 'object') {
      for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
        if (v != null && String(v).length > 0) out[k] = String(v);
      }
    }
    return out;
  } catch {
    return {}; // fall back to env
  }
}

export async function loadIntegration(provider: string): Promise<ConfigResolver> {
  const db = await fetchDbConfig(provider);
  return (key: string, fallback = '') => db[key] ?? process.env[key] ?? fallback;
}
