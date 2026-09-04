-- AI assistant audit + confirm-gate (applied live).
--   ai_actions            logs every AI query/proposal; RLS-scoped to the restaurant
--   apply_menu_proposal() the ONLY path that turns a proposal into a DB change;
--                         requires manager/owner, applies whitelisted change types
--                         only, marks the action applied, and writes an audit_logs row.
-- The AI never writes to menu data directly (§48).
create type ai_action_status as enum ('proposed','applied','dismissed');
create table public.ai_actions (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null, question text, answer text, proposal jsonb,
  status ai_action_status not null default 'proposed',
  applied_by uuid references public.profiles(id) on delete set null, applied_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ai_actions enable row level security;
create policy ai_read on public.ai_actions for select using (public.can_access_restaurant(restaurant_id));
create policy ai_insert on public.ai_actions for insert with check (public.can_access_restaurant(restaurant_id));
create policy ai_update on public.ai_actions for update using (public.can_manage_restaurant(restaurant_id));
-- apply_menu_proposal(action_id) body applied live (see migration history).
