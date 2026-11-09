import { sign, verify } from "./signing";

// Emails to users (announcements, trial reminders) through Resend (https://resend.com).
// Set RESEND_API_KEY and EMAIL_FROM (e.g. "Eboclean <hello@yourdomain.com>", on a domain you verified in Resend).

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface OutgoingEmail {
  to: string;
  /** Account id, or null for waitlist people (no account yet). */
  userId: string | null;
  subject: string;
  /** Plain text; blank lines become paragraphs. {{email}} is replaced with the recipient's address. */
  body: string;
  /** Announcements carry an unsubscribe link; billing notices don't need one. */
  kind: "announcement" | "billing";
}

function appUrl() {
  return (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

/** Account emails unsubscribe the account; waitlist emails (no account) unsubscribe the address. */
export function unsubscribeUrl(target: { userId: string | null; to: string }) {
  const payload = target.userId ? { u: target.userId, p: "unsub" } : { w: target.to.trim().toLowerCase(), p: "unsub" };
  return `${appUrl()}/api/email/unsubscribe?t=${encodeURIComponent(sign(payload))}`;
}

export function readUnsubscribeToken(token: string | null): { userId: string } | { waitlistEmail: string } | null {
  const v = verify<{ u?: string; w?: string; p?: string }>(token ?? undefined);
  if (v?.p !== "unsub") return null;
  if (v.u) return { userId: v.u };
  if (v.w) return { waitlistEmail: v.w };
  return null;
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function render(e: OutgoingEmail) {
  const text = e.body.replaceAll("{{email}}", e.to);
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const unsub = e.kind === "announcement" ? unsubscribeUrl(e) : null;
  const why = e.userId ? "you have an Eboclean account" : "you joined the Eboclean waitlist";
  const footer = unsub
    ? `You're getting this because ${why}. <a href="${unsub}" style="color:#737373">Unsubscribe</a>.`
    : "You're getting this because of your Eboclean subscription.";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:520px;margin:0 auto;padding:32px 20px">
<div style="font-weight:700;font-size:20px;margin-bottom:24px">Eboclean</div>
<div style="background:#fff;border-radius:20px;padding:28px 24px;font-size:16px;line-height:1.5">${paragraphs}</div>
<div style="font-size:12px;color:#737373;margin-top:20px;line-height:1.5">${footer}</div>
</div></body></html>`;
  return { text: unsub ? `${text}\n\n--\nUnsubscribe: ${unsub}` : text, html, unsub };
}

/** Sends in batches of 100. Returns how many were accepted and the first error, if any. */
export async function sendEmails(list: OutgoingEmail[]): Promise<{ sent: number; failed: number; error: string | null }> {
  if (!emailConfigured()) return { sent: 0, failed: list.length, error: "Email isn't set up (RESEND_API_KEY and EMAIL_FROM)." };
  let sent = 0;
  let failed = 0;
  let error: string | null = null;
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    const payload = chunk.map((e) => {
      const r = render(e);
      return {
        from: process.env.EMAIL_FROM,
        to: [e.to],
        subject: e.subject,
        html: r.html,
        text: r.text,
        ...(process.env.SUPPORT_EMAIL ? { reply_to: process.env.SUPPORT_EMAIL } : {}),
        ...(r.unsub ? { headers: { "List-Unsubscribe": `<${r.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } } : {}),
      };
    });
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        error ??= body?.message ?? `Resend returned HTTP ${res.status}`;
      }
    } catch (err) {
      failed += chunk.length;
      error ??= err instanceof Error ? err.message : "Network error";
    }
  }
  return { sent, failed, error };
}
