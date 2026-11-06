// Answers from onboarding, kept on the device (used for defaults like daily minutes).
export interface Prefs {
  onboarded: boolean;
  goals: string[];
  vibe: "chaos" | "messy" | "okay" | null;
  minutes: number;
}

const KEY = "eboclean-prefs-v1";
const EVENT = "eboclean-prefs";
const DEFAULT: Prefs = { onboarded: false, goals: [], vibe: null, minutes: 10 };

let cachedRaw: string | null = null;
let cached: Prefs = DEFAULT;

export function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT;
  const raw = localStorage.getItem(KEY);
  if (raw === cachedRaw) return cached;
  cachedRaw = raw;
  try {
    cached = raw ? { ...DEFAULT, ...JSON.parse(raw) } : DEFAULT;
  } catch {
    cached = DEFAULT;
  }
  return cached;
}

export function savePrefs(p: Partial<Prefs>) {
  localStorage.setItem(KEY, JSON.stringify({ ...loadPrefs(), ...p }));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribePrefs(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export function serverPrefs(): Prefs {
  return DEFAULT;
}
