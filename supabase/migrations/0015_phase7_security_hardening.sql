-- Security hardening (applied live), from the Supabase security advisor:
--   * dropped leftover public.chat_messages (unused chat-starter table)
--   * pinned search_path on km_between()
--   * revoked REST EXECUTE from internal/trigger functions
--     (handle_new_user, set_updated_at, on_delivery_delivered, offer_next_driver, rls_auto_enable)
-- See SECURITY.md for the full posture and the remaining documented items.
drop table if exists public.chat_messages cascade;
alter function public.km_between(double precision, double precision, double precision, double precision) set search_path = pg_catalog, public;
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.on_delivery_delivered() from anon, authenticated, public;
revoke execute on function public.offer_next_driver(uuid) from anon, authenticated, public;
