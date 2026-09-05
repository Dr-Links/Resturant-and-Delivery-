-- =============================================================================
-- PHASE 7 (completion) — EMAIL / SMS NOTIFICATION FAN-OUT
-- In-app notifications already exist (0016). This adds outbound delivery: an
-- AFTER INSERT trigger on notifications calls the notify-fanout edge function
-- via pg_net, which sends email (Resend) + SMS (Twilio), falling back to a mock
-- that records status when no provider keys are configured.
-- Applied live to project ylgvwzwmgeiuyhomxvuh.
-- Edge function source: supabase/functions/notify-fanout/index.ts
-- =============================================================================

alter table public.notifications add column if not exists email_status text;
alter table public.notifications add column if not exists sms_status  text;

-- Small server-only settings store (endpoint + shared token for the trigger).
create table if not exists public.app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_settings enable row level security;  -- no policies: definer/service-role only

insert into public.app_settings(key, value) values
  ('notify_endpoint', 'https://ylgvwzwmgeiuyhomxvuh.supabase.co/functions/v1/notify-fanout'),
  ('notify_token', gen_random_uuid()::text)
on conflict (key) do nothing;

create extension if not exists pg_net with schema extensions;

-- Fan a freshly-inserted notification out to the edge function (best-effort,
-- async). If the endpoint isn't configured the trigger simply no-ops.
create or replace function public.fanout_notification()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public', 'extensions'
as $function$
declare
  v_endpoint text;
  v_token    text;
begin
  select value into v_endpoint from public.app_settings where key = 'notify_endpoint';
  select value into v_token    from public.app_settings where key = 'notify_token';
  if v_endpoint is null then return new; end if;

  perform net.http_post(
    url     := v_endpoint,
    headers := jsonb_build_object('Content-Type','application/json','x-notify-token', v_token),
    body    := jsonb_build_object('notification_id', new.id)
  );
  return new;
end;
$function$;

revoke execute on function public.fanout_notification() from anon, authenticated, public;

drop trigger if exists trg_notify_fanout on public.notifications;
create trigger trg_notify_fanout after insert on public.notifications
  for each row execute function public.fanout_notification();
