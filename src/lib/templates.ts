import { DAY, newId, type Category, type Room } from "./store";

// Ready-made rooms so new users can set up their home in seconds, no photos needed.
// They can scan a room later to get an AI-personalized routine.

interface TemplateTask {
  title: string;
  minutes: number;
  category: Category;
  everyDays: number;
}

export interface RoomTemplate {
  key: string;
  name: string;
  emoji: string;
  tasks: TemplateTask[];
}

export const ROOM_TEMPLATES: RoomTemplate[] = [
  {
    key: "bedroom",
    name: "Bedroom",
    emoji: "🛏️",
    tasks: [
      { title: "Clothes off the floor into the hamper", minutes: 3, category: "laundry", everyDays: 1 },
      { title: "Make the bed", minutes: 2, category: "surfaces", everyDays: 1 },
      { title: "Return cups and plates to the kitchen", minutes: 2, category: "dishes", everyDays: 2 },
      { title: "Clear the nightstand", minutes: 3, category: "put_away", everyDays: 4 },
      { title: "Empty the trash bin", minutes: 2, category: "trash", everyDays: 5 },
      { title: "Change the sheets", minutes: 10, category: "laundry", everyDays: 14 },
    ],
  },
  {
    key: "kitchen",
    name: "Kitchen",
    emoji: "🍳",
    tasks: [
      { title: "Load or wash the dishes", minutes: 8, category: "dishes", everyDays: 1 },
      { title: "Wipe the counters", minutes: 3, category: "surfaces", everyDays: 1 },
      { title: "Take out the trash", minutes: 2, category: "trash", everyDays: 2 },
      { title: "Wipe the stovetop", minutes: 4, category: "surfaces", everyDays: 5 },
      { title: "Sweep the floor", minutes: 5, category: "floor", everyDays: 4 },
      { title: "Toss old food from the fridge", minutes: 5, category: "trash", everyDays: 7 },
    ],
  },
  {
    key: "bathroom",
    name: "Bathroom",
    emoji: "🛁",
    tasks: [
      { title: "Hang up the towels", minutes: 1, category: "laundry", everyDays: 2 },
      { title: "Wipe the sink and mirror", minutes: 3, category: "surfaces", everyDays: 3 },
      { title: "Clear the counter clutter", minutes: 3, category: "put_away", everyDays: 4 },
      { title: "Scrub the toilet", minutes: 5, category: "surfaces", everyDays: 7 },
      { title: "Empty the bin", minutes: 1, category: "trash", everyDays: 7 },
    ],
  },
  {
    key: "living",
    name: "Living room",
    emoji: "🛋️",
    tasks: [
      { title: "Fold blankets and fluff pillows", minutes: 2, category: "surfaces", everyDays: 1 },
      { title: "Clear the coffee table", minutes: 3, category: "put_away", everyDays: 2 },
      { title: "Gather stray items into a basket", minutes: 4, category: "put_away", everyDays: 3 },
      { title: "Vacuum the floor", minutes: 8, category: "floor", everyDays: 7 },
      { title: "Dust the TV stand and shelves", minutes: 5, category: "surfaces", everyDays: 10 },
    ],
  },
  {
    key: "office",
    name: "Desk & office",
    emoji: "💻",
    tasks: [
      { title: "Clear the desk surface", minutes: 3, category: "put_away", everyDays: 2 },
      { title: "Return mugs and dishes", minutes: 1, category: "dishes", everyDays: 1 },
      { title: "Sort loose papers", minutes: 5, category: "put_away", everyDays: 7 },
      { title: "Wipe the desk and keyboard", minutes: 3, category: "surfaces", everyDays: 7 },
    ],
  },
  {
    key: "laundry",
    name: "Laundry",
    emoji: "🧺",
    tasks: [
      { title: "Start a load of laundry", minutes: 3, category: "laundry", everyDays: 3 },
      { title: "Move the load to the dryer or rack", minutes: 2, category: "laundry", everyDays: 3 },
      { title: "Fold and put away one basket", minutes: 10, category: "laundry", everyDays: 4 },
    ],
  },
  {
    key: "entry",
    name: "Entryway",
    emoji: "🚪",
    tasks: [
      { title: "Line up the shoes", minutes: 1, category: "put_away", everyDays: 2 },
      { title: "Clear the drop zone (keys, mail, bags)", minutes: 3, category: "put_away", everyDays: 3 },
      { title: "Sweep the entry", minutes: 3, category: "floor", everyDays: 7 },
    ],
  },
  {
    key: "kids",
    name: "Kids' room",
    emoji: "🧸",
    tasks: [
      { title: "Toys back into bins", minutes: 5, category: "put_away", everyDays: 1 },
      { title: "Clothes into the hamper", minutes: 2, category: "laundry", everyDays: 1 },
      { title: "Make the bed", minutes: 2, category: "surfaces", everyDays: 2 },
      { title: "Clear the floor for vacuuming", minutes: 4, category: "floor", everyDays: 7 },
    ],
  },
];

export type HomeVibe = "chaos" | "messy" | "okay";

/**
 * Builds rooms from templates. How messy the home feels decides how many tasks
 * start out "due", so day one has a sensible plan instead of everything at once.
 */
export function roomsFromTemplates(keys: string[], vibe: HomeVibe, now = Date.now()): Room[] {
  return keys
    .map((k) => ROOM_TEMPLATES.find((t) => t.key === k))
    .filter((t): t is RoomTemplate => Boolean(t))
    .map((t, roomIdx) => ({
      id: newId(),
      name: t.name,
      emoji: t.emoji,
      createdAt: now,
      lastScore: null,
      coverPhotoId: null,
      tasks: t.tasks.map((task, i) => {
        // chaos: everything due; messy: daily tasks due; okay: staggered so things come due gradually
        const due = vibe === "chaos" || (vibe === "messy" && task.everyDays <= 2);
        const progress = vibe === "okay" ? 0.3 + ((i + roomIdx) % 4) * 0.15 : 0.4;
        return {
          id: newId(),
          title: task.title,
          minutes: task.minutes,
          category: task.category,
          everyDays: task.everyDays,
          lastDoneAt: due ? null : now - task.everyDays * DAY * progress,
        };
      }),
    }));
}
