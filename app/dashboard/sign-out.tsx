'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton() {
  const router = useRouter();
  async function out() {
    await createClient().auth.signOut();
    router.push('/login');
    router.refresh();
  }
  return (
    <button onClick={out} className="rounded-full border border-line px-4 py-2 text-sm">
      Sign out
    </button>
  );
}
