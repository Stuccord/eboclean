import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark, Wordmark } from "@/components/Logo";
import { WaitlistForm } from "@/components/WaitlistForm";
import { EARLY_BIRD_OFFER, EARLY_BIRD_SPOTS } from "@/lib/waitlist";

export const metadata: Metadata = {
  title: "Eboclean: snap your mess, get a 10-minute plan",
  description:
    `For overwhelmed and ADHD brains. AI scores your room and tells you exactly what to do first. Join early access: the first ${EARLY_BIRD_SPOTS} get ${EARLY_BIRD_OFFER}.`,
  openGraph: {
    title: "Snap your mess. Get a 10-minute plan.",
    description: "AI scores your messy room and gives you tiny, doable steps. Join the Eboclean early access.",
    type: "website",
  },
};

/** Floating "mess" around the phone. `mobile` ones stay visible on small screens. */
const FLOATERS: { emoji: string; className: string; size: number; delay: number; mobile?: boolean }[] = [
  { emoji: "🧦", className: "left-[3%] top-[10%] -rotate-12", size: 84, delay: 0, mobile: true },
  { emoji: "☕", className: "left-[17%] top-[22%] rotate-6", size: 56, delay: 1.2 },
  { emoji: "📚", className: "left-[13%] top-[44%] -rotate-6", size: 88, delay: 0.6 },
  { emoji: "👕", className: "-left-[2%] top-[58%] rotate-12", size: 96, delay: 1.8, mobile: true },
  { emoji: "🧽", className: "right-[20%] top-[16%] rotate-12", size: 72, delay: 0.9 },
  { emoji: "🧺", className: "right-[2%] top-[14%] -rotate-6", size: 100, delay: 0.3, mobile: true },
  { emoji: "🧴", className: "right-[17%] top-[45%] rotate-6", size: 64, delay: 1.5 },
  { emoji: "🪴", className: "-right-[1%] top-[62%] -rotate-3", size: 96, delay: 2.1, mobile: true },
];

const STEPS = [
  { emoji: "📸", title: "Snap your mess", text: "One photo of the desk, bedroom, kitchen, or car." },
  { emoji: "🧠", title: "Get a tiny plan", text: "A Mess Score and 5–8 small steps, easiest wins first." },
  { emoji: "✨", title: "Watch it drop", text: "Snap the after photo and see your score fall. Confetti included." },
];

function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[248px] sm:w-[268px]" aria-hidden="true">
      <div className="relative h-[330px] overflow-hidden rounded-t-[44px] border-[7px] border-b-0 border-neutral-900 bg-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] sm:h-[350px]">
        {/* status bar + notch */}
        <div className="flex items-center justify-between bg-gradient-to-b from-emerald-50 to-white px-5 pt-3 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-[22px] w-[78px] rounded-full bg-neutral-900" />
          <span className="tracking-tighter">●●● ▮</span>
        </div>
        <div className="px-4 pt-3">
          <Wordmark className="text-[17px]" />
          <div className="mt-3 text-[11px] text-neutral-500">Good morning</div>
          <div className="text-[18px] font-bold leading-6">Your home today</div>

          <div className="mt-3 flex items-center gap-3 rounded-2xl bg-neutral-950 p-3 text-white">
            <div className="text-[26px] font-bold leading-none">78</div>
            <div className="leading-tight">
              <div className="text-[11px] text-neutral-400">Mess Score</div>
              <div className="text-[12px] font-semibold">Chaos detected 😬</div>
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 text-[10px] font-semibold">
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-500">5 min</span>
            <span className="rounded-full bg-emerald-100 px-2 py-1 text-emerald-800">10 min</span>
            <span className="rounded-full bg-neutral-100 px-2 py-1 text-neutral-500">15 min</span>
          </div>

          <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">Today&apos;s plan</div>
          <ul className="mt-1.5 space-y-1.5 text-[12px]">
            <li className="flex items-center gap-2 rounded-xl bg-neutral-50 px-2.5 py-2 text-neutral-400 line-through">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[9px] text-white no-underline">✓</span>
              Grab the 6 cups → kitchen
            </li>
            <li className="flex items-center gap-2 rounded-xl bg-neutral-50 px-2.5 py-2">
              <span className="h-4 w-4 rounded-full ring-2 ring-neutral-300" />
              Clothes on chair → hamper
              <span className="ml-auto text-[10px] text-neutral-400">3m</span>
            </li>
            <li className="flex items-center gap-2 rounded-xl bg-neutral-50 px-2.5 py-2">
              <span className="h-4 w-4 rounded-full ring-2 ring-neutral-300" />
              Trash in one bag
              <span className="ml-auto text-[10px] text-neutral-400">1m</span>
            </li>
          </ul>
        </div>
      </div>
      {/* fade the bottom of the phone into the page, like it's tucked behind the headline */}
      <div className="pointer-events-none absolute inset-x-[-20px] bottom-0 h-24 bg-gradient-to-t from-white to-transparent" />
    </div>
  );
}

export default function WaitlistPage() {
  return (
    <div className="w-full bg-white">
      {/* ---------- hero ---------- */}
      <section className="relative isolate flex min-h-dvh flex-col overflow-hidden">
        {/* soft fresh glow at the top */}
        <div className="absolute inset-x-0 top-0 -z-10 h-[55%] bg-gradient-to-b from-emerald-100/80 via-emerald-50/60 to-white" />

        {FLOATERS.map((f) => (
          <span
            key={f.emoji}
            aria-hidden="true"
            className={`floater pointer-events-none absolute select-none drop-shadow-[0_14px_18px_rgba(0,0,0,0.18)] ${
              f.mobile ? "" : "hidden md:block"
            } ${f.className}`}
            style={{ fontSize: `clamp(${Math.round(f.size * 0.55)}px, ${f.size / 11}vw, ${f.size}px)`, animationDelay: `${f.delay}s` }}
          >
            {f.emoji}
          </span>
        ))}

        <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center gap-2 px-5 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
          <Link href="/waitlist" className="flex items-center gap-2" aria-label="Eboclean">
            <LogoMark size={30} />
            <Wordmark className="text-lg" />
          </Link>
          <nav className="ml-auto flex items-center gap-2">
            <a
              href="#how"
              className="hidden rounded-full bg-black/5 px-4 py-2 text-sm font-medium text-neutral-800 backdrop-blur hover:bg-black/10 sm:inline-block"
            >
              How it works
            </a>
            {/* A label focuses the email field without any JavaScript. */}
            <label
              htmlFor="wl-email"
              className="cursor-pointer rounded-full bg-neutral-950 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
            >
              Join waitlist
            </label>
          </nav>
        </header>

        <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-5 pb-6 pt-8 text-center">
          <PhoneMockup />
          <h1 className="relative -mt-6 text-[34px] font-bold leading-[1.05] tracking-tight text-balance sm:text-5xl md:text-[52px]">
            Your mess, sorted in 10 minutes
          </h1>
          <p className="mt-3 max-w-lg text-balance text-neutral-600 sm:text-lg">
            Snap your mess. Eboclean gives you a Mess Score and tiny steps, built for overwhelmed and ADHD brains.
          </p>
          <div className="mt-6 w-full max-w-md">
            <WaitlistForm earlyBird={EARLY_BIRD_SPOTS} />
          </div>
        </div>

        <footer className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-2 items-center sm:grid-cols-3 gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] text-[11px] text-neutral-500 sm:px-8">
          <span className="hidden sm:block">Made for messy humans 🧡</span>
          <a href="#how" className="hover:text-neutral-900 sm:text-center">
            Scroll down to see more
          </a>
          <span className="text-right">
            <Link href="/privacy" className="hover:text-neutral-900">
              Privacy
            </Link>
            {" · "}
            <Link href="/terms" className="hover:text-neutral-900">
              Terms
            </Link>
          </span>
        </footer>
      </section>

      {/* ---------- below the fold ---------- */}
      <section id="how" className="mx-auto max-w-4xl scroll-mt-6 px-5 py-20 sm:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-3xl bg-neutral-50 p-6 ring-1 ring-black/5">
              <div className="text-4xl" aria-hidden="true">
                {s.emoji}
              </div>
              <div className="mt-4 text-xs font-semibold uppercase tracking-wide text-neutral-400">Step {i + 1}</div>
              <div className="mt-1 text-lg font-bold">{s.title}</div>
              <div className="mt-1 text-sm text-neutral-600">{s.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-6 rounded-3xl bg-neutral-950 p-6 text-white sm:flex sm:items-center sm:gap-6 sm:p-8">
          <div className="text-4xl" aria-hidden="true">
            🔒
          </div>
          <div className="mt-3 sm:mt-0">
            <div className="text-lg font-bold">Your photos stay private</div>
            <div className="mt-1 text-sm text-neutral-400">
              They&apos;re never used to train AI, and you can delete them anytime.
            </div>
          </div>
          <label
            htmlFor="wl-email"
            className="mt-5 inline-block cursor-pointer rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-neutral-950 sm:ml-auto sm:mt-0 sm:shrink-0"
          >
            Get early access ↑
          </label>
        </div>
      </section>
    </div>
  );
}
