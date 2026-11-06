import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { setupRoom } from "@/lib/scan";
import { demoSetup } from "@/lib/demo";
import { errorResponse, isDemoMode, MAX_IMAGE_CHARS, parseDataUrl } from "@/lib/apiHelpers";
import { checkAllowance, denyResponse } from "@/lib/billing";

export const maxDuration = 60;

const BodySchema = z.object({
  image: z.string().startsWith("data:image/"),
  // Used only in demo mode to vary sample rooms.
  roomIndex: z.number().int().min(0).max(50).optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (body.image.length > MAX_IMAGE_CHARS) {
    return NextResponse.json({ error: "That photo is too large. Try another one." }, { status: 413 });
  }

  const allowance = await checkAllowance(request);
  if (!allowance.allowed) return denyResponse(allowance.reason);

  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 1500));
    const res = NextResponse.json({ result: demoSetup(body.roomIndex ?? 0), demo: true });
    await allowance.record();
    return res;
  }

  const img = parseDataUrl(body.image);
  if (!img) {
    return NextResponse.json({ error: "Please upload a JPEG, PNG or WebP photo." }, { status: 400 });
  }

  try {
    const result = await setupRoom({ imageBase64: img.base64, mediaType: img.mediaType });
    const res = NextResponse.json({ result, demo: false });
    await allowance.record();
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
