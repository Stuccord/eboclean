import { NextResponse, type NextRequest } from "next/server";
import { loadAdminData, requireAdmin, userRows } from "@/lib/admin";

// Every account with its subscription status, activity and spend.
export async function GET(req: NextRequest) {
  const admin = requireAdmin(req);
  if (admin instanceof NextResponse) return admin;
  try {
    const data = await loadAdminData();
    return NextResponse.json({ users: userRows(data), paystackError: data.paystackError }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("Admin users failed", err);
    return NextResponse.json({ error: "Couldn't load users." }, { status: 500 });
  }
}
