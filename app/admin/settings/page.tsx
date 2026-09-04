import { getServerSupabase } from '@/lib/supabase/server';
import { SettingsForm } from './settings-form';
export const dynamic = 'force-dynamic';
export default async function AdminSettings() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('platform_config').select('*').eq('id', 1).maybeSingle();
  return <SettingsForm initial={(data as any) ?? {}} />;
}
