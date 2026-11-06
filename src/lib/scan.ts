import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { usageOf, type AiUsage } from "./aiCost";

export const MODEL = "claude-opus-5-5";

export const StepSchema = z.object({
  title: z.string(),
  detail: z.string(),
  minutes: z.number(),
  category: z.enum([
    "trash",
    "dishes",
    "laundry",
    "put_away",
    "surfaces",
    "floor",
    "other",
  ]),
});

export const ScanResultSchema = z.object({
  is_space: z.boolean(),
  zone_label: z.string(),
  mess_score: z.number(),
  headline: z.string(),
  items_found: z.array(z.object({ name: z.string(), count: z.number() })),
  steps: z.array(StepSchema),
  encouragement: z.string(),
  comparison: z.string(),
});

export type ScanResult = z.infer<typeof ScanResultSchema>;
export type Step = z.infer<typeof StepSchema>;

// JSON Schema for structured outputs (mirrors ScanResultSchema).
const scanJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "is_space",
    "zone_label",
    "mess_score",
    "headline",
    "items_found",
    "steps",
    "encouragement",
    "comparison",
  ],
  properties: {
    is_space: {
      type: "boolean",
      description:
        "true if the photo shows a room, surface or space that can be tidied",
    },
    zone_label: {
      type: "string",
      description: 'Short name for the area, e.g. "Bedroom floor", "Desk"',
    },
    mess_score: {
      type: "integer",
      description: "0 (spotless) to 100 (total chaos), using the rubric",
    },
    headline: {
      type: "string",
      description: "One fun, kind, punchy line about the mess (max 12 words)",
    },
    items_found: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "count"],
        properties: {
          name: { type: "string" },
          count: { type: "integer" },
        },
      },
    },
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "minutes", "category"],
        properties: {
          title: {
            type: "string",
            description: 'Short action, e.g. "Grab the 6 cups"',
          },
          detail: {
            type: "string",
            description: "One sentence on exactly what to do and where things go",
          },
          minutes: { type: "integer" },
          category: {
            type: "string",
            enum: [
              "trash",
              "dishes",
              "laundry",
              "put_away",
              "surfaces",
              "floor",
              "other",
            ],
          },
        },
      },
    },
    encouragement: {
      type: "string",
      description: "One warm, motivating sentence",
    },
    comparison: {
      type: "string",
      description:
        'For an "after" scan: one celebratory sentence comparing before vs after. Empty string for a "before" scan.',
    },
  },
} as const;

const SYSTEM_PROMPT = `You are Ebo, the kind, funny cleaning coach inside the Eboclean app, made for people who feel overwhelmed by mess (many users have ADHD).

You look at a photo of a room or surface and return:
1. A Mess Score from 0 to 100.
2. A short, doable cleaning mission.

MESS SCORE RUBRIC (be consistent; the same photo must get the same score):
- 0-10: spotless, nothing out of place
- 11-25: tidy, a few stray items
- 26-45: lived-in, clutter on one or two surfaces
- 46-65: messy, clutter on several surfaces or part of the floor
- 66-85: very messy, piles, floor mostly covered, dishes or trash visible
- 86-100: total chaos, hard to see surfaces or floor at all
Base the score only on what is visible: amount of items out of place, how much floor and surface area is covered, trash, dishes, laundry.

MISSION RULES:
- 4 to 8 steps. Order them for quick wins first (trash and obvious grabs), then bigger groups.
- Each step is one simple physical action, takes 1 to 5 minutes, and names specific visible items ("the 3 mugs on the desk"), never vague ("tidy up").
- The total minutes must fit the user's time budget.
- If energy is low, pick the easiest, highest-impact steps only and keep them tiny.
- Group by category so the user moves around less.

TONE:
- Warm, playful, never shaming or judgmental. Mess is normal.
- Light humor is welcome. No sarcasm about the person.

SAFETY AND PRIVACY:
- Never comment on people, bodies, or personal documents in the photo. Focus only on objects and surfaces.
- If the photo is not a room, surface or space that can be tidied, set is_space to false, mess_score to 0, return no steps, and use the headline to kindly ask for a photo of a messy spot.`;

export type ScanMode = "before" | "after";

export interface ScanRequest {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  mode: ScanMode;
  timeBudgetMinutes: number;
  energy: "low" | "medium" | "high";
  previous?: { mess_score: number; zone_label: string };
  /** Called with token counts and cost once the API answers. */
  onUsage?: (usage: AiUsage) => void;
}

const client = new Anthropic();

export async function scanRoom(req: ScanRequest): Promise<ScanResult> {
  const instruction =
    req.mode === "before"
      ? `This is a BEFORE photo. Time budget: ${req.timeBudgetMinutes} minutes. Energy level: ${req.energy}. Score the mess and build the mission. Set comparison to an empty string.`
      : `This is an AFTER photo of the same area ("${req.previous?.zone_label ?? "the area"}"), which scored ${req.previous?.mess_score ?? "unknown"} before cleaning. Score it with the same rubric. Celebrate the progress in "comparison". Only include steps if clear mess remains (max 3 small steps), otherwise return no steps.`;

  // Server-side fallback: if the model declines for a policy reason, the API
  // re-runs the request on Anthropic's recommended fallback model.
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: scanJsonSchema },
    },
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: req.mediaType,
              data: req.imageBase64,
            },
          },
          { type: "text", text: instruction },
        ],
      },
    ],
  });

  req.onUsage?.(usageOf(response));
  if (response.stop_reason === "refusal") {
    throw new ScanError("We couldn't scan that photo. Try a different one.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new ScanError("The scan was cut short. Please try again.");
  }

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new ScanError("No scan result came back. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ScanError("The scan result was unreadable. Please try again.");
  }

  const result = ScanResultSchema.parse(parsed);
  result.mess_score = Math.max(0, Math.min(100, Math.round(result.mess_score)));
  result.steps = result.steps.map((s) => ({
    ...s,
    minutes: Math.max(1, Math.min(10, Math.round(s.minutes))),
  }));
  return result;
}

export class ScanError extends Error {}

// ---------------- Room setup (build a recurring plan from one photo) ----------------

const CATEGORY_ENUM = ["trash", "dishes", "laundry", "put_away", "surfaces", "floor", "other"] as const;

export const SetupResultSchema = z.object({
  is_space: z.boolean(),
  room_name: z.string(),
  emoji: z.string(),
  mess_score: z.number(),
  headline: z.string(),
  recurring_tasks: z.array(
    z.object({
      title: z.string(),
      minutes: z.number(),
      category: z.enum(CATEGORY_ENUM),
      every_days: z.number(),
    }),
  ),
});
export type SetupResult = z.infer<typeof SetupResultSchema>;

const setupJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["is_space", "room_name", "emoji", "mess_score", "headline", "recurring_tasks"],
  properties: {
    is_space: { type: "boolean" },
    room_name: { type: "string", description: 'e.g. "Bedroom", "Kitchen", "Home office"' },
    emoji: { type: "string", description: "One emoji that represents the room" },
    mess_score: { type: "integer", description: "0 (spotless) to 100 (total chaos), same rubric" },
    headline: { type: "string", description: "One fun, kind line about this room (max 12 words)" },
    recurring_tasks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "minutes", "category", "every_days"],
        properties: {
          title: { type: "string", description: 'Short, specific action, e.g. "Clear the desk surface"' },
          minutes: { type: "integer" },
          category: { type: "string", enum: [...CATEGORY_ENUM] },
          every_days: { type: "integer", description: "How often this should repeat, in days" },
        },
      },
    },
  },
} as const;

const SETUP_PROMPT = `You are Ebo, the kind cleaning coach inside the Eboclean app, made for people who feel overwhelmed by mess (many have ADHD).

You see ONE photo of a room. Identify the room type and create a realistic, low-pressure RECURRING maintenance routine for it, based on what is actually visible (furniture, surfaces, appliances, the kind of clutter that builds up).

RULES:
- 5 to 8 recurring tasks. Each is one small, specific action taking 1 to 10 minutes.
- Frequencies should be realistic and gentle: daily resets (1 day) only for things that truly pile up daily (dishes, trash, clothes on the floor); most tasks every 3 to 14 days; deep tasks every 14 to 30 days.
- Prefer tiny, finishable tasks over big vague ones ("Wipe the bathroom sink" not "Clean bathroom").
- Also give the current Mess Score with this rubric: 0-10 spotless, 11-25 tidy, 26-45 lived-in, 46-65 messy, 66-85 very messy, 86-100 total chaos.
- Tone: warm, playful, never shaming.
- Never comment on people or personal documents in the photo.
- If the photo is not a room or space, set is_space to false, mess_score to 0, return no tasks, and kindly ask for a room photo in the headline.`;

export async function setupRoom(req: {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp";
  onUsage?: (usage: AiUsage) => void;
}): Promise<SetupResult> {
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: setupJsonSchema },
    },
    system: SETUP_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: req.mediaType, data: req.imageBase64 } },
          { type: "text", text: "Set up this room's routine." },
        ],
      },
    ],
  });

  req.onUsage?.(usageOf(response));
  if (response.stop_reason === "refusal") throw new ScanError("We couldn't scan that photo. Try a different one.");
  if (response.stop_reason === "max_tokens") throw new ScanError("The scan was cut short. Please try again.");

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") throw new ScanError("No result came back. Please try again.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(textBlock.text);
  } catch {
    throw new ScanError("The result was unreadable. Please try again.");
  }
  const result = SetupResultSchema.parse(parsed);
  result.mess_score = Math.max(0, Math.min(100, Math.round(result.mess_score)));
  result.recurring_tasks = result.recurring_tasks.map((t) => ({
    ...t,
    minutes: Math.max(1, Math.min(15, Math.round(t.minutes))),
    every_days: Math.max(1, Math.min(60, Math.round(t.every_days))),
  }));
  return result;
}
