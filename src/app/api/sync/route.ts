import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { accounts } from "@/lib/db";
import { getSession } from "@/lib/session";

// Home data (rooms, tasks, history, points) for the signed-in user.
// Photos are synced separately via /api/photos/[id].

const MAX_BODY_CHARS = 2_000_000;

const BodySchema = z.object({
  rooms: z.array(z.unknown()).max(200),
  history: z.array(z.unknown()).max(5000),
  progress: z.unknown().nullable(),
});

export async function GET(req: NextRequest) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: "Sign in to sync." }, { status: 401 });
  try {
    return NextResponse.json(await accounts().getData(s.uid));
  } catch (err) {
    console.error("Load sync data failed", err);
    return NextResponse.json({ error: "Couldn't load your data." }, { status: 502 });
  }
}

export async function PUT(req: NextRequest) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: "Sign in to sync." }, { status: 401 });

  const text = await req.text();
  if (text.length > MAX_BODY_CHARS) return NextResponse.json({ error: "Too much data." }, { status: 413 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(JSON.parse(text));
  } catch {
    return NextResponse.json({ error: "Invalid data." }, { status: 400 });
  }

  try {
    const updatedAt = await accounts().putData(s.uid, { rooms: body.rooms, history: body.history, progress: body.progress ?? null });
    return NextResponse.json({ ok: true, updatedAt });
  } catch (err) {
    console.error("Save sync data failed", err);
    return NextResponse.json({ error: "Couldn't save your data." }, { status: 502 });
  }
}
