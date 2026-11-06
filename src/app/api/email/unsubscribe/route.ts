import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { readUnsubscribeToken } from "@/lib/email";
import { track } from "@/lib/events";

// Unsubscribe link in announcement emails. GET from the link, POST for one-click unsubscribe in mail apps.

async function unsubscribe(req: NextRequest) {
  const userId = readUnsubscribeToken(req.nextUrl.searchParams.get("t"));
  if (!userId) return false;
  const profile = await accounts().findProfile(userId);
  if (!profile) return true; // account already deleted
  if (!profile.emailOptOut) {
    await accounts().updateProfile(userId, { emailOptOut: true });
    await track("email.unsubscribed", { userId, email: profile.email });
  }
  return true;
}

function page(title: string, text: string, status = 200) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;background:#f7f7f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#0a0a0a">
<div style="max-width:420px;margin:15vh auto;padding:28px 24px;background:#fff;border-radius:20px;text-align:center">
<h1 style="font-size:22px;margin:0 0 8px">${title}</h1><p style="color:#525252;margin:0;line-height:1.5">${text}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(req: NextRequest) {
  const ok = await unsubscribe(req).catch(() => false);
  return ok
    ? page("You're unsubscribed", "You won't get announcement emails from Eboclean anymore. We'll still email you about your subscription and payments.")
    : page("Link not valid", "This unsubscribe link is broken. Reply to any of our emails and we'll remove you.", 400);
}

export async function POST(req: NextRequest) {
  const ok = await unsubscribe(req).catch(() => false);
  return NextResponse.json({ ok }, { status: ok ? 200 : 400 });
}
