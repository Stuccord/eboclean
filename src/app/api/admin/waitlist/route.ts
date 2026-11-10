import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts } from "@/lib/db";
import { loadAdminData, requireAdmin, waitlistPerks } from "@/lib/admin";
import { track } from "@/lib/events";
import { waitlistMembers } from "@/lib/waitlistServer";

// Admin-only: download the waitlist as a CSV (open /api/admin/waitlist while signed in as an admin).
// Add ?format=json for the raw list, or ?format=perks for who has (and hasn't) got the early-bird price.
// POST gives the early-bird offer back to a member who lost it.

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  if (req.nextUrl.searchParams.get("format") === "perks") {
    try {
      const data = await loadAdminData();
      return NextResponse.json({ ...(await waitlistPerks(data)), paystackError: data.paystackError }, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      console.error("Admin waitlist failed", err);
      return NextResponse.json({ error: "Couldn't load the waitlist." }, { status: 500 });
    }
  }

  const rows = (await waitlistMembers()).map((m) => ({
    position: m.position,
    email: m.email,
    joinedAt: new Date(m.joinedAt).toISOString(),
    spot: m.spot,
    ref: m.ref,
    unsubscribed: m.unsubscribed,
  }));

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ count: rows.length, rows });
  }

  const header = ["position", "email", "joined_at", "messiest_spot", "ref", "unsubscribed"];
  const lines = [header.join(","), ...rows.map((r) => [r.position, r.email, r.joinedAt, r.spot, r.ref, r.unsubscribed ? "yes" : ""].map(csvCell).join(","))];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="eboclean-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}

const ActionSchema = z.object({ action: z.literal("restore_offer"), userId: z.string().regex(/^[A-Za-z0-9-]{1,64}$/) });

/**
 * Gives the early-bird offer back to an early waitlist member who lost it (the trial was marked
 * used, e.g. by starting a trial or by "give free access"). Only when they have no trial or plan now.
 */
export async function POST(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  let body: z.infer<typeof ActionSchema>;
  try {
    body = ActionSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }
  try {
    const data = await loadAdminData();
    if (data.paystackError) return NextResponse.json({ error: `Can't check their subscription (Paystack: ${data.paystackError}). Try again.` }, { status: 502 });
    const row = (await waitlistPerks(data)).rows.find((r) => r.userId === body.userId);
    if (!row) return NextResponse.json({ error: "This account isn't on the waitlist." }, { status: 404 });
    if (!row.canRestore) {
      const why =
        row.perk === "claimed"
          ? "They already bought the early-bird year."
          : row.perk === "missed"
            ? "They have a trial or plan right now. End or cancel it first."
            : "They can already get the offer.";
      return NextResponse.json({ error: why }, { status: 409 });
    }
    await accounts().updateProfile(body.userId, { trialUsed: false });
    await track("admin.action", { userId: body.userId, email: row.email, meta: { by: admin.email, action: "restore_early_bird", position: row.position } });
    return NextResponse.json({ ok: true, message: `Early-bird offer given back to ${row.email}. They'll see it next time they open the app.` });
  } catch (err) {
    console.error("Restore early-bird failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Action failed." }, { status: 502 });
  }
}
