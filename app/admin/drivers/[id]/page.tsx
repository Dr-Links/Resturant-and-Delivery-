import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabase } from '@/lib/supabase/server';
import { money } from '@/lib/format';
export const dynamic = 'force-dynamic';

const KYC_BUCKET = 'kyc';
const SIGNED_URL_TTL_SECONDS = 600; // 10 minutes

// driver_kyc.*_url columns hold the private-bucket object path; mint a
// short-lived signed URL for it (admin has read via the "kyc admin read"
// storage policy). Returns null if there is no path or signing fails.
async function signKycDoc(supabase: SupabaseClient, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  return data?.signedUrl ?? null;
}

type ProfileRef = { full_name: string | null; email: string | null; phone: string | null } | null;
type Driver = {
  id: string; status: string; is_online: boolean; vehicle: string | null;
  rating_avg: number; rating_count: number; last_ping: string | null; created_at: string;
  profile: ProfileRef;
};
type Kyc = {
  status: string; full_name: string | null; id_number: string | null; reviewed_at: string | null;
  id_doc_url: string | null; license_url: string | null; selfie_url: string | null;
} | null;
type Sub = { plan: string; status: string; expires_at: string | null } | null;
type StatRow = { total_deliveries: number; completed_deliveries: number; total_earnings: number };

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-brand/20 text-brand border border-brand/50',
  approved: 'bg-brand/20 text-brand border border-brand/50',
  pending: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  submitted: 'bg-amber-500/20 text-amber-300 border border-amber-500/40',
  suspended: 'bg-red-500/20 text-red-300 border border-red-500/40',
  rejected: 'bg-red-500/20 text-red-300 border border-red-500/40',
  inactive: 'bg-zinc-700 text-zinc-300',
};
function badge(status: string) {
  return 'rounded-full px-2.5 py-1 text-xs capitalize ' + (STATUS_BADGE[status] ?? 'bg-zinc-700 text-zinc-200');
}
function fmtDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}
function who(p: ProfileRef) {
  return p?.full_name || p?.email || 'Unknown driver';
}

// KYC documents are sensitive PII: private bucket + short-lived signed URL,
// rendered only on this admin-gated page, opened in a new tab with noopener.
// `path` is the stored object path; `url` is the minted signed URL.
function DocLink({ label, path, url }: { label: string; path: string | null; url: string | null }) {
  if (!path) return <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{label}: Not provided</span>;
  if (!url) return <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">{label}: Unavailable</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-brand/50 bg-brand/10 px-3 py-1 text-xs text-brand hover:underline">
      {label} ↗
    </a>
  );
}

export default async function AdminDriverDetail({ params }: { params: { id: string } }) {
  const supabase = getServerSupabase();

  const { data: driver } = await supabase
    .from('platform_drivers')
    .select('id,status,is_online,vehicle,rating_avg,rating_count,last_ping,created_at, profile:profiles(full_name,email,phone)')
    .eq('id', params.id)
    .maybeSingle();

  if (!driver) notFound();
  const d = driver as unknown as Driver;

  const [kycRes, subRes, statRes] = await Promise.all([
    supabase.from('driver_kyc').select('status,full_name,id_number,reviewed_at,id_doc_url,license_url,selfie_url').eq('driver_id', d.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('driver_subscriptions').select('plan,status,expires_at').eq('driver_id', d.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc('admin_driver_stats', { p_driver_id: d.id }),
  ]);
  const kyc = kycRes.data as Kyc;
  const sub = subRes.data as Sub;

  // Mint signed URLs for KYC docs from the private bucket (paths in *_url cols).
  const [idDocUrl, licenseUrl, selfieUrl] = kyc
    ? await Promise.all([
        signKycDoc(supabase, kyc.id_doc_url),
        signKycDoc(supabase, kyc.license_url),
        signKycDoc(supabase, kyc.selfie_url),
      ])
    : [null, null, null];
  const s = (statRes.data as StatRow[] | null)?.[0] ?? { total_deliveries: 0, completed_deliveries: 0, total_earnings: 0 };

  const stats = [
    { label: 'Deliveries', value: String(s.total_deliveries) },
    { label: 'Completed', value: String(s.completed_deliveries) },
    { label: 'Earnings', value: money(Number(s.total_earnings)) },
    { label: 'Rating', value: `★${d.rating_avg} (${d.rating_count})` },
  ];

  return (
    <div className="space-y-6">
      <Link href="/admin" className="text-xs text-brand hover:underline">← Back to overview</Link>

      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold">{who(d.profile)}</h1>
        <span className={badge(d.status)}>{d.status}</span>
        {d.is_online && <span className="text-brand text-xs">● online</span>}
      </div>

      {/* Profile + driver */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted mb-2">Contact</p>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{d.profile?.email ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Phone</dt><dd>{d.profile?.phone ?? '—'}</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <p className="text-xs text-muted mb-2">Driver</p>
          <dl className="text-sm space-y-1">
            <div className="flex justify-between gap-4"><dt className="text-muted">Vehicle</dt><dd>{d.vehicle ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Last ping</dt><dd>{fmtDate(d.last_ping)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Since</dt><dd>{fmtDate(d.created_at)}</dd></div>
          </dl>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((st) => (
          <div key={st.label} className="rounded-2xl border border-line bg-card p-4">
            <p className="text-xs text-muted">{st.label}</p>
            <p className="mt-1 text-2xl font-bold">{st.value}</p>
          </div>
        ))}
      </div>

      {/* KYC + subscription */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted">KYC</p>
            {kyc && <span className={badge(kyc.status)}>{kyc.status}</span>}
          </div>
          {kyc ? (
            <>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between gap-4"><dt className="text-muted">Name</dt><dd>{kyc.full_name ?? '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">ID number</dt><dd>{kyc.id_number ?? '—'}</dd></div>
                <div className="flex justify-between gap-4"><dt className="text-muted">Reviewed</dt><dd>{fmtDate(kyc.reviewed_at)}</dd></div>
              </dl>
              <p className="text-xs text-muted mt-3 mb-1.5">Documents</p>
              <div className="flex flex-wrap gap-2">
                <DocLink label="ID document" path={kyc.id_doc_url} url={idDocUrl} />
                <DocLink label="Driver's license" path={kyc.license_url} url={licenseUrl} />
                <DocLink label="Selfie" path={kyc.selfie_url} url={selfieUrl} />
              </div>
            </>
          ) : <p className="text-sm text-muted">No KYC submitted.</p>}
        </div>
        <div className="rounded-2xl border border-line bg-card p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted">Subscription</p>
            {sub && <span className={badge(sub.status)}>{sub.status}</span>}
          </div>
          {sub ? (
            <dl className="text-sm space-y-1">
              <div className="flex justify-between gap-4"><dt className="text-muted">Plan</dt><dd className="capitalize">{sub.plan}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-muted">Expires</dt><dd>{fmtDate(sub.expires_at)}</dd></div>
            </dl>
          ) : <p className="text-sm text-muted">No subscription.</p>}
        </div>
      </div>
    </div>
  );
}
