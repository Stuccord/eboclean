import { NextResponse, type NextRequest } from "next/server";
import { accounts } from "@/lib/db";
import { MAX_IMAGE_CHARS, parseDataUrl } from "@/lib/apiHelpers";
import { getSession } from "@/lib/session";

// Before/after and room photos for the signed-in user. Private: each user can only reach their own.

const ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export async function GET(req: NextRequest, ctx: RouteContext<"/api/photos/[id]">) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });
  try {
    const photo = await accounts().getPhoto(s.uid, id);
    if (!photo) return NextResponse.json({ error: "Not found." }, { status: 404 });
    return new NextResponse(new Uint8Array(photo.bytes), {
      headers: { "Content-Type": photo.contentType, "Cache-Control": "private, max-age=31536000, immutable" },
    });
  } catch (err) {
    console.error("Load photo failed", err);
    return NextResponse.json({ error: "Couldn't load the photo." }, { status: 502 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/photos/[id]">) {
  const s = getSession(req);
  if (!s) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "Bad id." }, { status: 400 });

  const text = await req.text();
  if (text.length > MAX_IMAGE_CHARS) return NextResponse.json({ error: "Photo too large." }, { status: 413 });
  const img = parseDataUrl(text);
  if (!img) return NextResponse.json({ error: "Send a JPEG, PNG or WebP data URL." }, { status: 400 });

  try {
    await accounts().putPhoto(s.uid, id, Buffer.from(img.base64, "base64"), img.mediaType);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Save photo failed", err);
    return NextResponse.json({ error: "Couldn't save the photo." }, { status: 502 });
  }
}
