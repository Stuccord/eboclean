import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { scanRoom, type ScanResult } from "@/lib/scan";
import { demoResult } from "@/lib/demo";
import { errorResponse, isDemoMode, MAX_IMAGE_CHARS, parseDataUrl } from "@/lib/apiHelpers";
import { checkAllowance, PAYWALL_MESSAGE } from "@/lib/billing";

export const maxDuration = 60;

const BodySchema = z.object({
  image: z.string().startsWith("data:image/"),
  mode: z.enum(["before", "after"]),
  timeBudgetMinutes: z.number().int().min(5).max(30),
  energy: z.enum(["low", "medium", "high"]),
  previous: z.object({ mess_score: z.number(), zone_label: z.string() }).optional(),
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

  // Only "before" scans count toward the free limit; the after photo is part of the same session.
  const allowance = body.mode === "before" ? await checkAllowance(request, "scans") : null;
  if (allowance && !allowance.allowed) {
    return NextResponse.json({ error: PAYWALL_MESSAGE.scans, paywall: "scans" }, { status: 402 });
  }

  if (isDemoMode()) {
    await new Promise((r) => setTimeout(r, 1800));
    const result: ScanResult = demoResult(body.mode, body.previous?.mess_score);
    const res = NextResponse.json({ result, demo: true });
    await allowance?.record(res);
    return res;
  }

  const img = parseDataUrl(body.image);
  if (!img) {
    return NextResponse.json({ error: "Please upload a JPEG, PNG or WebP photo." }, { status: 400 });
  }

  try {
    const result = await scanRoom({
      imageBase64: img.base64,
      mediaType: img.mediaType,
      mode: body.mode,
      timeBudgetMinutes: body.timeBudgetMinutes,
      energy: body.energy,
      previous: body.previous,
    });
    const res = NextResponse.json({ result, demo: false });
    await allowance?.record(res);
    return res;
  } catch (err) {
    return errorResponse(err);
  }
}
