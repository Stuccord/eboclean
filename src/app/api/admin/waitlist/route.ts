import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { waitlistMembers } from "@/lib/waitlistServer";

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
