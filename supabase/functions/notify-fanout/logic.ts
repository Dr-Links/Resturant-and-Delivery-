// Pure, runtime-agnostic decision logic for notify-fanout.
// No Deno / jsr / network imports here so it can be unit-tested under Node/Vitest
// while the Deno function (index.ts) imports the exact same functions.

export type ChannelPlan = "send" | "skip" | "mock";

/** Email is sent only when there's an address; mock when no provider key is set. */
export function planEmail(email: string | null | undefined, hasKey: boolean): ChannelPlan {
  if (!email) return "skip";
  return hasKey ? "send" : "mock";
}

/** SMS is sent only when there's a phone; mock when provider creds are missing. */
export function planSms(phone: string | null | undefined, hasCreds: boolean): ChannelPlan {
  if (!phone) return "skip";
  return hasCreds ? "send" : "mock";
}

/** A notification already touched by the dispatcher must not be re-sent. */
export function alreadyDispatched(n: { email_status?: string | null; sms_status?: string | null }): boolean {
  return Boolean(n.email_status || n.sms_status);
}

/** Shared-token auth for the pg_net → function call. */
export function isAuthorized(token: string, expected: string | null | undefined): boolean {
  return Boolean(expected) && token === expected;
}

/** Final status string written back to the notification row for a 'send' attempt. */
export function sendResultStatus(ok: boolean, httpStatus: number): string {
  return ok ? "sent" : `failed:${httpStatus}`;
}

/** Maps a channel plan to the persisted status when we are NOT calling a gateway. */
export function planToStatus(plan: ChannelPlan): "skipped" | "mock" | "send" {
  if (plan === "skip") return "skipped";
  if (plan === "mock") return "mock";
  return "send";
}
