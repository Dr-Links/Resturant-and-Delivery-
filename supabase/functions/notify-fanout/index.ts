// notify-fanout — fans a public.notifications row out to email + SMS.
// Invoked by the pg_net AFTER-INSERT trigger (see migration 0018). Auth is a
// shared token (stored in app_settings) since the function runs with
// verify_jwt = false so the database can call it directly.
//
// Runs in MOCK mode when no provider keys are set: it records email_status /
// sms_status = 'mock' so the whole pipeline is verifiable without credentials.
// Set secrets to go live:  supabase secrets set RESEND_API_KEY=... RESEND_FROM=...
//                          TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=...
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const RESEND_FROM = Deno.env.get("RESEND_FROM") ?? "Chez Marie <onboarding@resend.dev>";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID");
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN");
const TWILIO_FROM = Deno.env.get("TWILIO_FROM");

type ChannelResult = "sent" | "skipped" | "mock" | string;

async function sendEmail(to: string, subject: string, text: string): Promise<ChannelResult> {
  if (!RESEND_API_KEY) return "mock";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, text }),
  });
  return res.ok ? "sent" : `failed:${res.status}`;
}

async function sendSms(to: string, body: string): Promise<ChannelResult> {
  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) return "mock";
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body }),
  });
  return res.ok ? "sent" : `failed:${res.status}`;
}

Deno.serve(async (req) => {
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // Custom auth: compare the caller token against app_settings.notify_token.
  const token = req.headers.get("x-notify-token") ?? "";
  const { data: setting } = await admin.from("app_settings").select("value").eq("key", "notify_token").maybeSingle();
  if (!setting || token !== setting.value) {
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
  if (n.email_status || n.sms_status) {
    return new Response(JSON.stringify({ ok: true, idempotent: true })); // already dispatched
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("email, phone")
    .eq("id", n.recipient_id)
    .maybeSingle();

  const subject = n.title ?? "Notification";
  const text = n.body ?? "";
  const emailStatus = profile?.email ? await sendEmail(profile.email, subject, text) : "skipped";
  const smsStatus = profile?.phone ? await sendSms(profile.phone, `${subject}: ${text}`) : "skipped";

  await admin.from("notifications").update({ email_status: emailStatus, sms_status: smsStatus }).eq("id", n.id);

  return new Response(JSON.stringify({ ok: true, email: emailStatus, sms: smsStatus }), {
    headers: { "Content-Type": "application/json" },
  });
});
