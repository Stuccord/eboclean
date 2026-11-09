import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts } from "@/lib/db";
import { loadAdminData, requireAdmin, STATUS_LABEL, userRows, type UserRow, type UserStatus } from "@/lib/admin";
import { emailConfigured, sendEmails } from "@/lib/email";
import { track } from "@/lib/events";
import { waitlistMembers } from "@/lib/waitlistServer";

// Email groups of users (announcements, win-backs, payment problems) and see what was sent.

// "waitlist" = people who joined the early-access waitlist (no account needed).
const SEGMENTS = ["all", ...Object.keys(STATUS_LABEL), "waitlist"] as const;
type Segment = (typeof SEGMENTS)[number];

function inSegment(r: UserRow, s: Segment) {
  return s === "all" || r.status === (s as UserStatus);
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const d = await loadAdminData();
  const rows = userRows(d);
  const waitlist = await waitlistMembers().catch(() => []);
  const segments = SEGMENTS.map((s) => {
    if (s === "waitlist") {
      return { id: s, label: "Waitlist (early access)", count: waitlist.length, optedOut: waitlist.filter((w) => w.unsubscribed).length };
    }
    const members = rows.filter((r) => inSegment(r, s));
    return {
      id: s,
      label: s === "all" ? "Everyone" : STATUS_LABEL[s as UserStatus],
      count: members.length,
      optedOut: members.filter((r) => r.emailOptOut).length,
    };
  });
  const history = await accounts()
    .listEvents({ typePrefix: "email.", limit: 300 })
    .catch(() => []);
  return NextResponse.json({ configured: emailConfigured(), from: process.env.EMAIL_FROM ?? null, me: admin.email, segments, history });
}

const SendSchema = z.object({
  segment: z.enum(SEGMENTS),
  subject: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  /** Billing/account notices go to everyone in the group; announcements skip people who unsubscribed. */
  kind: z.enum(["announcement", "billing"]),
  /** Send only to the admin, to preview. */
  test: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: z.infer<typeof SendSchema>;
  try {
    body = SendSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Add a subject and a message." }, { status: 400 });
  }
  if (!emailConfigured()) return NextResponse.json({ error: "Email isn't set up yet. Add RESEND_API_KEY and EMAIL_FROM." }, { status: 400 });

  if (body.test) {
    const r = await sendEmails([{ to: admin.email, userId: admin.uid, subject: `[Test] ${body.subject}`, body: body.body, kind: body.kind }]);
    if (!r.sent) return NextResponse.json({ error: r.error ?? "Couldn't send." }, { status: 502 });
    return NextResponse.json({ ok: true, message: `Test sent to ${admin.email}.` });
  }

  if (body.segment === "waitlist") {
    // Waitlist people aren't customers yet: always an announcement with an unsubscribe link.
    const all = await waitlistMembers();
    const list = all.filter((w) => !w.unsubscribed);
    if (!list.length) return NextResponse.json({ error: "Nobody on the waitlist can receive this email." }, { status: 400 });
    const r = await sendEmails(list.map((w) => ({ to: w.email, userId: null, subject: body.subject, body: body.body, kind: "announcement" })));
    await track("email.broadcast", {
      meta: {
        by: admin.email,
        segment: "waitlist",
        kind: "announcement",
        subject: body.subject,
        sent: r.sent,
        failed: r.failed,
        skippedOptOut: all.length - list.length,
        error: r.error,
      },
    });
    if (!r.sent) return NextResponse.json({ error: r.error ?? "Couldn't send." }, { status: 502 });
    return NextResponse.json({
      ok: true,
      message: `Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"} on the waitlist${r.failed ? `, ${r.failed} failed (${r.error})` : ""}.`,
    });
  }

  const rows = userRows(await loadAdminData()).filter((r) => inSegment(r, body.segment));
  const recipients = rows.filter((r) => body.kind === "billing" || !r.emailOptOut);
  if (!recipients.length) return NextResponse.json({ error: "Nobody in that group can receive this email." }, { status: 400 });

  const r = await sendEmails(recipients.map((u) => ({ to: u.email, userId: u.id, subject: body.subject, body: body.body, kind: body.kind })));
  await track("email.broadcast", {
    meta: {
      by: admin.email,
      segment: body.segment,
      kind: body.kind,
      subject: body.subject,
      sent: r.sent,
      failed: r.failed,
      skippedOptOut: rows.length - recipients.length,
      error: r.error,
    },
  });
  if (!r.sent) return NextResponse.json({ error: r.error ?? "Couldn't send." }, { status: 502 });
  return NextResponse.json({
    ok: true,
    message: `Sent to ${r.sent} ${r.sent === 1 ? "person" : "people"}${r.failed ? `, ${r.failed} failed (${r.error})` : ""}.`,
  });
}
