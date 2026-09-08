-- =============================================================================
-- Migration 0027 — AI photo→3D generation jobs
-- =============================================================================
-- Tracks async image-to-3D generation jobs (Meshy/Luma/etc via the threed_gen
-- integration). The API routes (service role) create + advance rows; owners can
-- read their restaurant's jobs to poll progress. On success a menu_item_3d_models
-- row is created with source='ai_generated', status='preview' (existing
-- approve→publish flow applies — AI models are never auto-published, spec §9).
-- =============================================================================

create table if not exists public.model_gen_jobs (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  item_id       uuid not null references public.menu_items(id) on delete cascade,
  provider      text,
  task_id       text,
  status        text not null default 'processing',  -- processing | succeeded | failed
  glb_url       text,
  error         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_mgj_item on public.model_gen_jobs(item_id);

alter table public.model_gen_jobs enable row level security;

-- Owners read their own jobs (to poll). All writes go through the service-role
-- API routes (no insert/update/delete policy here).
create policy mgj_owner_read on public.model_gen_jobs for select
  using (public.can_manage_restaurant(restaurant_id));
