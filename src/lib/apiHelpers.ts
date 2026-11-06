import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { ScanError } from "./scan";
import { track } from "./events";
import type { AiUsage } from "./aiCost";

// ~6 MB of base64 is plenty for a compressed phone photo.
export const MAX_IMAGE_CHARS = 8_000_000;

export function isDemoMode() {
  return (
    process.env.CLEAN_SWEEP_DEMO === "1" ||
    (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN)
  );
}

export type MediaType = "image/jpeg" | "image/png" | "image/webp";

export function parseDataUrl(image: string): { mediaType: MediaType; base64: string } | null {
  const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) return null;
  return { mediaType: match[1] as MediaType, base64: match[2] };
}

export async function errorResponse(err: unknown, ctx?: { kind: string; usage?: AiUsage }) {
  // Anything that isn't a normal "bad photo" answer is worth seeing on the dashboard.
  await track(err instanceof ScanError ? "ai.rejected" : "ai.error", {
    meta: {
      kind: ctx?.kind ?? null,
      error: err instanceof Error ? err.message.slice(0, 300) : String(err).slice(0, 300),
      status: err instanceof Anthropic.APIError ? err.status : null,
      ...(ctx?.usage ?? {}),
    },
  });
  if (err instanceof ScanError) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
  if (err instanceof Anthropic.RateLimitError) {
    return NextResponse.json(
      { error: "Lots of people are cleaning right now! Try again in a moment." },
      { status: 429 },
    );
  }
  if (err instanceof Anthropic.AuthenticationError) {
    console.error("Anthropic authentication failed. Check ANTHROPIC_API_KEY.");
    return NextResponse.json({ error: "The scanner isn't set up yet." }, { status: 500 });
  }
  if (err instanceof Anthropic.APIError) {
    console.error("Anthropic API error", err.status, err.message);
    return NextResponse.json({ error: "The scanner hiccuped. Please try again." }, { status: 502 });
  }
  console.error("Unexpected scan error", err);
  return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
}
