// notify-fanout — fans a public.notifications row out to email + SMS.
// Invoked by the pg_net AFTER-INSERT trigger (see migration 0018). Auth is a
// shared token (stored in app_settings) since the function runs with
// verify_jwt = false so the database can call it directly.
//
// Provider credentials are read from the dashboard-managed integration store
// (get_integration_config, service-role only), falling back to Deno.env secrets.
// Runs in MOCK mode when neither is set: records email_status / sms_status =
// 'mock' so the whole pipeline is verifiable without credentials.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { alreadyDispatched, isAuthorized, planEmail, planSms, planToStatus, sendResultStatus } from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ResendCfg = { apiKey?: string; from: string };
type TwilioCfg = { sid?: string; token?: string; from?: string };

// Read a provider's config from the integration store (Vault-decrypted), then
// fall back to Deno.env for any missing key.
async function loadStore(admin: SupabaseClient, provider: string): Promise<Record<string, string>> {
  try {
    const { data } = await admin.rpc("get_integration_config", { p_provider: provider });
    return (data && typeof data === "object") ? data as Record<string, string> : {};
  } catch {
    return {};
  }
}

async function sendEmail(cfg: ResendCfg, to: string, subject: string, text: string): Promise<string> {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: cfg.from, to, subject, text }),
  });
  return sendResultStatus(res.ok, res.status);
}

async function sendSms(cfg: TwilioCfg, to: string, body: string): Promise<string> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${cfg.sid}:${cfg.token}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: cfg.from!, Body: body }),
  });
  return sendResultStatus(res.ok, res.status);
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Custom auth: compare the caller token against app_settings.notify_token.
  const token = req.headers.get("x-notify-token") ?? "";
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "notify_token").maybeSingle();
  if (!isAuthorized(token, setting?.value)) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const { notification_id } = (await req.json().catch(() => ({}))) as { notification_id?: string };
  if (!notification_id) {
    return new Response(JSON.stringify({ error: "no_notification_id" }), { status: 400 });
  }

  const { data: n } = await admin
    .from("notifications")
    .select("id, recipient_id, title, body, email_status, sms_status")
    .eq("id", notification_id)
    .maybeSingle();
  if (!n) return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
  if (alreadyDispatched(n)) {
    return new Response(JSON.stringify({ ok: true, idempotent: true }));
  }

  // Resolve provider credentials: dashboard store first, then Deno.env.
  const [resendStore, twilioStore] = await Promise.all([loadStore(admin, "resend"), loadStore(admin, "twilio")]);
  const resend: ResendCfg = {
    apiKey: resendStore.RESEND_API_KEY || Deno.env.get("RESEND_API_KEY") || undefined,
    from: resendStore.RESEND_FROM || Deno.env.get("RESEND_FROM") || "Chez Marie <onboarding@resend.dev>",
  };
  const twilio: TwilioCfg = {
    sid: twilioStore.TWILIO_ACCOUNT_SID || Deno.env.get("TWILIO_ACCOUNT_SID") || undefined,
    token: twilioStore.TWILIO_AUTH_TOKEN || Deno.env.get("TWILIO_AUTH_TOKEN") || undefined,
    from: twilioStore.TWILIO_FROM || Deno.env.get("TWILIO_FROM") || undefined,
  };

  const { data: profile } = await admin
    .from("profiles")
    .select("email, phone")
    .eq("id", n.recipient_id)
    .maybeSingle();

  const subject = n.title ?? "Notification";
  const text = n.body ?? "";

  const emailPlan = planEmail(profile?.email, Boolean(resend.apiKey));
  const smsPlan = planSms(profile?.phone, Boolean(twilio.sid && twilio.token && twilio.from));

  const emailStatus = emailPlan === "send" ? await sendEmail(resend, profile!.email!, subject, text) : planToStatus(emailPlan);
  const smsStatus = smsPlan === "send" ? await sendSms(twilio, profile!.phone!, `${subject}: ${text}`) : planToStatus(smsPlan);

  await admin.from("notifications").update({ email_status: emailStatus, sms_status: smsStatus }).eq("id", n.id);

  return new Response(JSON.stringify({ ok: true, email: emailStatus, sms: smsStatus }), {
    headers: { "Content-Type": "application/json" },
  });
});
