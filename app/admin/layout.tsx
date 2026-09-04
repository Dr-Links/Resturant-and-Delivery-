import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { SignOutButton } from '../dashboard/sign-out';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: admin } = await supabase.from('platform_admins').select('profile_id').eq('profile_id', user.id).maybeSingle();
  if (!admin) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-xl font-bold">Admins only</h1>
        <p className="text-muted">This account isn’t a platform admin.</p>
        <SignOutButton />
      </main>
    );
  }
  const nav = [
    { href: '/admin', label: 'Overview' }, { href: '/admin/kyc', label: 'KYC' },
    { href: '/admin/complaints', label: 'Complaints' }, { href: '/admin/suggestions', label: 'Suggestions' },
    { href: '/admin/drivers', label: 'Drivers' }, { href: '/admin/deliveries', label: 'Deliveries' },
    { href: '/admin/audit', label: 'Audit' },
    { href: '/admin/settings', label: 'Settings' },
  ];
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div><p className="font-bold">SaaS Admin</p><p className="text-xs text-muted">Platform console</p></div>
          <SignOutButton />
        </div>
        <nav className="max-w-5xl mx-auto px-5 flex gap-1 overflow-x-auto no-scrollbar">
          {nav.map((n) => (<Link key={n.href} href={n.href} className="px-3 py-2 text-sm text-muted hover:text-white whitespace-nowrap">{n.label}</Link>))}
        </nav>
      </header>
      <div className="max-w-5xl mx-auto px-5 py-6">{children}</div>
    </div>
  );
}
