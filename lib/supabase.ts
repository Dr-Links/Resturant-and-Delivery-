import { createClient } from '@supabase/supabase-js';

// The publishable (anon) key is safe in the browser because every table has RLS.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ylgvwzwmgeiuyhomxvuh.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_6Jzncu3t9rb2bwi5hHWRYg_VTKFXyLE';

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
