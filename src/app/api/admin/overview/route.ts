import { NextResponse, type NextRequest } from "next/server";
import { buildOverview, loadAdminData, requireAdmin, waitlistPerks } from "@/lib/admin";

// Headline numbers, charts, alerts and setup status for the admin dashboard.
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const data = await loadAdminData();
    const perks = await waitlistPerks(data).catch(() => null);
    return NextResponse.json({ me: admin.email, appUrl: (process.env.APP_URL ?? req.nextUrl.origin).replace(/\/$/, ""), ...buildOverview(data, perks) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Admin overview failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load the dashboard." }, { status: 500 });
  }
}
