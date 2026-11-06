import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { getSession } from "@/lib/session";

export async function GET(req: NextRequest) {
  const s = getSession(req);
  let backend: "supabase" | "local" | "none" = "none";
  try {
    backend = accounts().kind;
  } catch {
    // not configured
  }
  return NextResponse.json({ user: s ? { id: s.uid, email: s.email } : null, backend });
}
