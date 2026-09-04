import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getServerSupabase } from '@/lib/supabase/server';
import { getActiveRestaurant } from '@/lib/dashboard';
import { SignOutButton } from './sign-out';
import { NotificationsBell } from './notifications-bell';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const restaurant = await getActiveRestaurant(supabase);

  if (!restaurant) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-6 text-center">
        <h1 className="text-xl font-bold">No restaurant linked to this account</h1>
        <p className="text-muted">Ask an owner to add you as staff.</p>
        <SignOutButton />
      </main>
    );
  }

  const nav = [
    { href: '/dashboard', label: 'Overview' },
    { href: '/dashboard/assistant', label: 'Assistant' },
    { href: '/dashboard/orders', label: 'Orders' },
    { href: '/dashboard/menu', label: 'Menu' },
    { href: '/dashboard/analytics', label: 'Analytics' },
    { href: '/dashboard/videos', label: 'Videos' },
    { href: '/dashboard/feedback', label: 'Feedback' },
    { href: '/dashboard/delivery', label: 'Delivery' },
    { href: '/dashboard/deliveries', label: 'Deliveries' },
    { href: '/dashboard/tables', label: 'Tables & QR' },
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink/90 backdrop-blur border-b border-line">
        <div className="max-w-5xl mx-auto px-5 py-3 flex items-center justify-between">
          <div>
            <p className="font-bold leading-tight">{restaurant.name}</p>
            <p className="text-xs text-muted">Restaurant dashboard</p>
          </div>
          <div className="flex items-center gap-2"><NotificationsBell /><SignOutButton /></div>
        </div>
        <nav className="max-w-5xl mx-auto px-5 flex gap-1 overflow-x-auto no-scrollbar">
          {nav.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="px-3 py-2 text-sm text-muted hover:text-white whitespace-nowrap"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="max-w-5xl mx-auto px-5 py-6">{children}</div>
    </div>
  );
}
