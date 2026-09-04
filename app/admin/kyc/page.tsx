import { getServerSupabase } from '@/lib/supabase/server';
import { KycReview } from './kyc-review';
export const dynamic = 'force-dynamic';
export default async function AdminKyc() {
  const supabase = getServerSupabase();
  const { data } = await supabase.from('driver_kyc').select('id,full_name,id_number,status,created_at,driver_id').order('created_at', { ascending: false });
  return <KycReview initial={(data as any) ?? []} />;
}
