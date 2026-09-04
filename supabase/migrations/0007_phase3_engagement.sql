-- Reviews (separate restaurant/food/delivery scores), private complaints,
-- suggestions, video analytics, videos storage bucket, and guest-safe RPCs.
-- See project docs; applied to live project. Full body in repo history.
create type review_kind as enum ('restaurant','food','delivery');
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  kind review_kind not null,
  item_id uuid references public.menu_items(id) on delete set null,
  session_id uuid references public.dining_sessions(id) on delete set null,
  author_id uuid references public.profiles(id) on delete set null,
  rating int not null check (rating between 1 and 5),
  comment text, created_at timestamptz not null default now()
);
create index idx_reviews_rest on public.reviews(restaurant_id, kind);
alter table public.reviews enable row level security;
create policy reviews_staff_read on public.reviews for select using (public.can_access_restaurant(restaurant_id));

create type complaint_status as enum ('open','investigating','resolved','closed');
create table public.complaints (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  category text, description text not null,
  status complaint_status not null default 'open',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.complaints enable row level security;
create policy complaints_read on public.complaints for select using (public.is_saas_admin() or author_id = auth.uid());
create policy complaints_author_insert on public.complaints for insert with check (author_id = auth.uid() or author_id is null);

create table public.complaint_messages (
  id uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  from_admin boolean not null default false, body text not null,
  created_at timestamptz not null default now()
);
alter table public.complaint_messages enable row level security;
create policy complaint_msgs_read on public.complaint_messages for select using (
  exists (select 1 from public.complaints c where c.id = complaint_id and (public.is_saas_admin() or c.author_id = auth.uid())));

create table public.suggestions (
  id uuid primary key default gen_random_uuid(),
  author_id uuid references public.profiles(id) on delete set null,
  restaurant_id uuid references public.restaurants(id) on delete set null,
  body text not null, created_at timestamptz not null default now()
);
alter table public.suggestions enable row level security;
create policy suggestions_admin_read on public.suggestions for select using (public.is_saas_admin());

create table public.video_analytics (
  id bigint generated always as identity primary key,
  video_id uuid not null references public.menu_item_videos(id) on delete cascade,
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  event text not null check (event in ('view','complete')), created_at timestamptz not null default now()
);
alter table public.video_analytics enable row level security;
create policy video_analytics_read on public.video_analytics for select using (public.can_access_restaurant(restaurant_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos','videos', true, 209715200, array['video/mp4','video/webm','video/quicktime']) on conflict (id) do nothing;
create policy "public read videos" on storage.objects for select using (bucket_id = 'videos');
create policy "staff upload videos" on storage.objects for insert to authenticated with check (bucket_id='videos' and public.can_manage_restaurant(((storage.foldername(name))[1])::uuid));
create policy "staff delete videos" on storage.objects for delete to authenticated using (bucket_id='videos' and public.can_manage_restaurant(((storage.foldername(name))[1])::uuid));

-- RPCs: submit_review, submit_suggestion, submit_complaint, log_video_view
-- (bodies applied to live DB; see migration history).
