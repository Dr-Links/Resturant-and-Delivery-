import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSupabase } from '@/lib/supabase/server';
import { loadIntegration } from '@/lib/integrations/server';

export const runtime = 'nodejs';

const Body = z.object({ address: z.string().trim().min(3).max(300) });

// POST /api/geocode — turn an address string into { lat, lng } using the Google
// Geocoding API. The key is read server-side from the integration store (Vault),
// so it never reaches the browser. Auth-gated to avoid anonymous cost/abuse.
// Returns { configured:false } (not an error) when no key is set, so callers can
// proceed without coordinates.
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  const supabase = getServerSupabase();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const get = await loadIntegration('google_maps');
  const key = get('GOOGLE_MAPS_API_KEY');
  if (!key) return NextResponse.json({ lat: null, lng: null, configured: false });

  const url =
    'https://maps.googleapis.com/maps/api/geocode/json?address=' +
    encodeURIComponent(parsed.data.address) +
    '&key=' + encodeURIComponent(key);

  try {
    const res = await fetch(url);
    const body = (await res.json()) as {
      status: string;
      results?: { geometry?: { location?: { lat: number; lng: number } } }[];
    };
    const loc = body.results?.[0]?.geometry?.location;
    if (body.status !== 'OK' || !loc) {
      return NextResponse.json({ lat: null, lng: null, configured: true, status: body.status });
    }
    return NextResponse.json({ lat: loc.lat, lng: loc.lng, configured: true });
  } catch {
    return NextResponse.json({ lat: null, lng: null, configured: true, error: 'geocode_failed' }, { status: 502 });
  }
}
