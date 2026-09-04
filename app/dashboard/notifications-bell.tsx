'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Notif = { id: string; type: string; title: string; body: string | null; read_at: string | null; created_at: string };

export function NotificationsBell() {
  const supabase = createClient();
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications').select('id,type,title,body,read_at,created_at').order('created_at', { ascending: false }).limit(20);
    if (data) setItems(data as Notif[]);
  }, [supabase]);

  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  const unread = items.filter((n) => !n.read_at).length;

  async function toggle() {
    const next = !open; setOpen(next);
    if (next && unread > 0) {
      const ids = items.filter((n) => !n.read_at).map((n) => n.id);
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids);
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: new Date().toISOString() })));
    }
  }

  return (
    <div className="relative">
      <button onClick={toggle} className="relative rounded-full border border-line w-9 h-9 flex items-center justify-center" aria-label="Notifications">
        <span>🔔</span>
        {unread > 0 && <span className="absolute -top-1 -right-1 bg-brand text-black text-[10px] rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">{unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-line bg-card shadow-xl z-30">
          <div className="p-3 border-b border-line text-sm font-semibold">Notifications</div>
          {items.length === 0 ? (
            <p className="p-4 text-sm text-muted">Nothing yet.</p>
          ) : (
            items.map((n) => (
              <div key={n.id} className="px-4 py-3 border-b border-line last:border-0">
                <p className="text-sm font-medium">{n.title}</p>
                {n.body && <p className="text-xs text-muted mt-0.5">{n.body}</p>}
                <p className="text-[10px] text-muted mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
