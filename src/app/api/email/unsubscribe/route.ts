import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { readUnsubscribeToken } from "@/lib/email";
import { track } from "@/lib/events";
import { WAITLIST_UNSUB_EVENT } from "@/lib/waitlist";

// Unsubscribe link in announcement emails. GET from the link, POST for one-click unsubscribe in mail apps.
// Account emails opt the account out; waitlist emails (no account yet) opt the address out.

async function unsubscribe(req: NextRequest): Promise<"account" | "waitlist" | null> {
  const target = readUnsubscribeToken(req.nextUrl.searchParams.get("t"));
  if (!target) return null;

  if ("waitlistEmail" in target) {
    const already = await accounts().listEvents({ types: [WAITLIST_UNSUB_EVENT], limit: 50_000 });
    if (!already.some((e) => e.email === target.waitlistEmail)) {
      await track(WAITLIST_UNSUB_EVENT, { email: target.waitlistEmail });
    }
    return "waitlist";
  }

  const profile = await accounts().findProfile(target.userId);
  if (!profile) return "account"; // account already deleted
  if (!profile.emailOptOut) {
    await accounts().updateProfile(target.userId, { emailOptOut: true });
    await track("email.unsubscribed", { userId: target.userId, email: profile.email });
  }
  return "account";
}

function page(title: string, text: string, status = 200) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:420px;margin:15vh auto;padding:28px 24px;background:#fff;border-radius:20px;text-align:center">
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#525252;margin:0;line-height:1.5">${text}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const kind = await unsubscribe(req).catch(() => null);
  if (kind === "waitlist") return page("You're unsubscribed", "You won't get Eboclean waitlist emails anymore.");
  if (kind === "account") {
    return page("You're unsubscribed", "You won't get announcement emails from Eboclean anymore. We'll still email you about your subscription and payments.");
  }
  return page("Link not valid", "This unsubscribe link is broken. Reply to any of our emails and we'll remove you.", 400);
}

export async function POST(req: NextRequest) {
  const kind = await unsubscribe(req).catch(() => null);
  return NextResponse.json({ ok: Boolean(kind) }, { status: kind ? 200 : 400 });
}
