import 'server-only';
import { createClient } from '@supabase/supabase-js';

// Server-only Supabase clients for API route handlers.
// - anon client: opens payment intents (create_order_payment is a SECURITY
//   DEFINER RPC granted to anon).
// - admin client: settles payments (mark_order_payment is service-role only).
//   Requires SUPABASE_SERVICE_ROLE_KEY — never expose this to the browser.

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ylgvwzwmgeiuyhomxvuh.supabase.co';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_6Jzncu3t9rb2bwi5hHWRYg_VTKFXyLE';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const hasAdmin = (): boolean => Boolean(serviceKey);

export function getServerAnon() {
  return createClient(url, anonKey, { auth: { persistSession: false } });
}

export function getAdminSupabase() {
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured — cannot settle payments.');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}
