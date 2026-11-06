import type { ScanResult, SetupResult } from "./scan";

const DEMO_ROOMS: SetupResult[] = [
  {
    is_space: true,
    room_name: "Bedroom",
    emoji: "🛏️",
    mess_score: 72,
    headline: "Cozy chaos with big comeback potential.",
    recurring_tasks: [
      { title: "Clothes off the floor into the hamper", minutes: 3, category: "laundry", every_days: 1 },
      { title: "Return cups and plates to the kitchen", minutes: 2, category: "dishes", every_days: 1 },
      { title: "Make the bed", minutes: 2, category: "surfaces", every_days: 1 },
      { title: "Clear the nightstand", minutes: 3, category: "put_away", every_days: 4 },
      { title: "Empty the trash bin", minutes: 2, category: "trash", every_days: 5 },
      { title: "Change the sheets", minutes: 10, category: "laundry", every_days: 14 },
    ],
  },
  {
    is_space: true,
    room_name: "Kitchen",
    emoji: "🍳",
    mess_score: 58,
    headline: "The sink is staging a quiet protest.",
    recurring_tasks: [
      { title: "Load or wash the dishes", minutes: 8, category: "dishes", every_days: 1 },
      { title: "Wipe the counters", minutes: 3, category: "surfaces", every_days: 1 },
      { title: "Take out the trash", minutes: 2, category: "trash", every_days: 2 },
      { title: "Toss old food from the fridge", minutes: 5, category: "trash", every_days: 7 },
      { title: "Sweep the floor", minutes: 5, category: "floor", every_days: 4 },
      { title: "Wipe the stovetop", minutes: 4, category: "surfaces", every_days: 5 },
    ],
  },
  {
    is_space: true,
    room_name: "Bathroom",
    emoji: "🛁",
    mess_score: 40,
    headline: "Mostly fresh, with a few soggy towels.",
    recurring_tasks: [
      { title: "Hang up the towels", minutes: 1, category: "laundry", every_days: 2 },
      { title: "Wipe the sink and mirror", minutes: 3, category: "surfaces", every_days: 3 },
      { title: "Clear the counter clutter", minutes: 3, category: "put_away", every_days: 4 },
      { title: "Scrub the toilet", minutes: 5, category: "surfaces", every_days: 7 },
      { title: "Empty the bin", minutes: 1, category: "trash", every_days: 7 },
    ],
  },
  {
    is_space: true,
    room_name: "Living room",
    emoji: "🛋️",
    mess_score: 50,
    headline: "The couch has become a storage unit.",
    recurring_tasks: [
      { title: "Fold the blankets and fluff the pillows", minutes: 2, category: "surfaces", every_days: 1 },
      { title: "Clear the coffee table", minutes: 3, category: "put_away", every_days: 2 },
      { title: "Gather stray items into a basket", minutes: 4, category: "put_away", every_days: 3 },
      { title: "Vacuum the floor", minutes: 8, category: "floor", every_days: 7 },
      { title: "Dust the TV stand and shelves", minutes: 5, category: "surfaces", every_days: 10 },
    ],
  },
];

export function demoSetup(index: number): SetupResult {
  return DEMO_ROOMS[index % DEMO_ROOMS.length];
}

// Sample results used when no API key is configured, so the UI can be tried
// and filmed before the AI is connected.
export function demoResult(mode: "before" | "after", previousScore?: number): ScanResult {
  if (mode === "after") {
    const before = previousScore ?? 78;
    return {
      is_space: true,
      zone_label: "Bedroom",
      mess_score: 12,
      headline: "Who even lives here? A very organized person, apparently.",
      items_found: [{ name: "charger cable", count: 1 }],
      steps: [],
      encouragement: "You showed up and did the thing. That's the whole secret.",
      comparison: `From ${before} to 12. That's a ${before - 12}-point glow-up in one session!`,
    };
  }
  return {
    is_space: true,
    zone_label: "Bedroom",
    mess_score: 78,
    headline: "The floor called. It misses you.",
    items_found: [
      { name: "clothes", count: 14 },
      { name: "cups and mugs", count: 5 },
      { name: "snack wrappers", count: 7 },
      { name: "shoes", count: 4 },
      { name: "books", count: 3 },
    ],
    steps: [
      {
        title: "Trash sweep",
        detail: "Grab a bag and collect the 7 snack wrappers and any loose paper from the floor and desk.",
        minutes: 2,
        category: "trash",
      },
      {
        title: "Mug rescue",
        detail: "Carry the 5 cups and mugs from the nightstand and desk to the kitchen sink.",
        minutes: 2,
        category: "dishes",
      },
      {
        title: "Clothes round-up",
        detail: "Toss all 14 clothing items into the hamper. Sorting can wait, floor first.",
        minutes: 3,
        category: "laundry",
      },
      {
        title: "Shoe parking",
        detail: "Line up the 4 pairs of shoes by the door or in the closet.",
        minutes: 1,
        category: "put_away",
      },
      {
        title: "Book stack",
        detail: "Stack the 3 books on the shelf or nightstand.",
        minutes: 1,
        category: "put_away",
      },
      {
        title: "Victory reset",
        detail: "Straighten the blanket and pillows so the bed looks made.",
        minutes: 1,
        category: "surfaces",
      },
    ],
    encouragement: "Ten minutes from now, future you is going to be so grateful.",
    comparison: "",
  };
}
