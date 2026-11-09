import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";
import { WAITLIST_EVENT, WAITLIST_SPOT_EVENT } from "@/lib/waitlist";

// Admin-only: download the waitlist as a CSV (open /api/admin/waitlist while signed in as an admin).
// Add ?format=json for the raw list.

function csvCell(v: unknown) {
  const s = v == null ? "" : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const [events, answers] = await Promise.all([
    accounts().listEvents({ types: [WAITLIST_EVENT], limit: 50_000 }),
    accounts().listEvents({ types: [WAITLIST_SPOT_EVENT], limit: 50_000 }),
  ]);
  const spotByEmail = new Map(answers.map((e) => [e.email, e.meta?.spot as string | undefined]));
  const rows = events
    .slice()
    .reverse() // oldest first, so row number = waitlist position
    .map((e, i) => ({
      position: i + 1,
      email: e.email,
      joinedAt: new Date(e.at).toISOString(),
      spot: (e.meta?.spot as string | null) ?? spotByEmail.get(e.email) ?? null,
      ref: (e.meta?.ref as string | null) ?? null,
    }));

  if (req.nextUrl.searchParams.get("format") === "json") {
    return NextResponse.json({ count: rows.length, rows });
  }

  const header = ["position", "email", "joined_at", "messiest_spot", "ref"];
  const lines = [header.join(","), ...rows.map((r) => [r.position, r.email, r.joinedAt, r.spot, r.ref].map(csvCell).join(","))];
  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="eboclean-waitlist-${new Date().toISOString().slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
