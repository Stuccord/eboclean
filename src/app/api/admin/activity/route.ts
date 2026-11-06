import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { requireAdmin } from "@/lib/admin";

// The live feed: everything that happened, newest first. ?type=ai. filters by prefix.
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  const type = req.nextUrl.searchParams.get("type") ?? "";
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit")) || 300, 2000);
  if (type && !/^[a-z_.]{1,60}$/.test(type)) return NextResponse.json({ error: "Bad filter." }, { status: 400 });
  try {
    const events = await accounts().listEvents({ typePrefix: type || undefined, limit });
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return NextResponse.json(
      { error: `${err instanceof Error ? err.message : "Couldn't read events"}. Run supabase/schema.sql to create the events table.` },
      { status: 500 },
    );
  }
}
