import type { Metadata } from "next";
import Image from "next/image";
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

/** Free Pexels photo by Ron Lach, https://www.pexels.com/photo/10557077/ (no people in it; credit is optional). */
const SCAN_PHOTO = {
  src: "https://images.pexels.com/photos/10557077/pexels-photo-10557077.jpeg",
  alt: "A bright room with a yellow sofa and a pile of clothes, papers and toys on the floor",
};

/** Real Eboclean scan score for SCAN_PHOTO, so the page shows exactly what the app returns. */
const SCAN_SCORE = 64;

/**
 * What the scan finds in the photo, and the plan built from it. `x`/`y` are where the marker sits
 * on the photo (percent, for the 4:5 crop at object-position 50% 70%). `side` is where the label goes.
 */
const FINDINGS: { label: string; step: string; min: number; x: number; y: number; side: "left" | "right" }[] = [
  // Real Eboclean scan output for this photo (score 64, 5 steps, 10 minutes), same scan as the hero screenshot.
  { label: "Toy blocks", step: "Scoop up the 4 toy blocks", min: 1, x: 92, y: 82, side: "left" },
  { label: "Books & papers", step: "Stack the 3 books and papers", min: 1, x: 80, y: 73, side: "left" },
  { label: "Socks & sneaker", step: "Grab the 2 socks and the sneaker", min: 1, x: 22, y: 87, side: "right" },
  { label: "Clothes pile", step: "Sort the clothes pile in two", min: 4, x: 60, y: 88, side: "right" },
  { label: "Clean clothes", step: "Fold or hang the clean stack", min: 3, x: 45, y: 72, side: "left" },
];
const TOTAL_MIN = FINDINGS.reduce((n, f) => n + f.min, 0);

function ScanPhoto() {
  return (
    <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-neutral-200 shadow-2xl ring-1 ring-black/10">
      <Image
        src={SCAN_PHOTO.src}
        alt={SCAN_PHOTO.alt}
        fill
        sizes="(min-width: 768px) 520px, 100vw"
        className="object-cover object-[50%_70%]"
      />
      {/* subtle darkening so the overlay reads */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/25" />

      {/* scanning line */}
      <div className="scan-line pointer-events-none absolute inset-x-0 h-[3px] bg-emerald-300 shadow-[0_0_24px_6px_rgba(110,231,183,0.55)]" />

      {/* top HUD */}
      <div className="absolute inset-x-4 top-4 flex items-start justify-between gap-2">
        <div className="rounded-2xl bg-neutral-950/75 px-3.5 py-2.5 text-white backdrop-blur-md">
          <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-400">Mess Score</div>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-bold leading-none">{SCAN_SCORE}</span>
            <span className="text-xs text-neutral-400">/ 100</span>
          </div>
          <div className="mt-2 h-1 w-24 overflow-hidden rounded-full bg-white/15">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-rose-400" style={{ width: `${SCAN_SCORE}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-neutral-950/75 px-3 py-1.5 text-[11px] font-medium text-white backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {FINDINGS.length} areas found
        </div>
      </div>

      {/* markers */}
      {FINDINGS.map((f, i) => (
        <div key={f.label} className="absolute" style={{ left: `${f.x}%`, top: `${f.y}%` }}>
          <span className="absolute -left-2 -top-2 h-4 w-4 animate-ping rounded-full bg-white/60 [animation-duration:2.4s]" />
          <span className="absolute -left-[7px] -top-[7px] h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-400 shadow" />
          <span
            className={`absolute top-1/2 flex -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 py-1 pl-1 pr-2.5 text-[11px] font-semibold text-neutral-900 shadow-lg ${
              f.side === "right" ? "left-3" : "right-3"
            }`}
          >
            <span className="grid h-4 w-4 place-items-center rounded-full bg-neutral-950 text-[9px] font-bold text-white">{i + 1}</span>
            {f.label}
          </span>
        </div>
      ))}

    </div>
  );
}

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
        <div className="flex items-center justify-between bg-[#f7f7f8] px-5 pb-1 pt-3 text-[11px] font-semibold">
          <span>9:41</span>
          <span className="h-[22px] w-[78px] rounded-full bg-neutral-900" />
          <span className="tracking-tighter">●●● ▮</span>
        </div>
        {/* Real screenshot of the app's scan result for SCAN_PHOTO (real AI, 390pt wide at 1.32x). */}
        <Image
          src="/waitlist/app-scan.png"
          alt=""
          width={515}
          height={864}
          priority
          sizes="268px"
          className="block h-auto w-full"
        />
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
          <a href="#demo" className="hover:text-neutral-900 sm:text-center">
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

      {/* ---------- before / after ---------- */}
      <section id="demo" className="mx-auto max-w-5xl scroll-mt-6 px-5 pt-16 sm:px-8">
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">See it in action</div>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">From chaos to calm in 10 minutes</h2>
          <p className="mx-auto mt-2 max-w-lg text-balance text-neutral-600">
            Snap one photo. Eboclean spots what&apos;s making the mess and turns it into a short plan, so you never have to
            figure out where to start.
          </p>
        </div>

        <div className="mx-auto mt-10 grid max-w-4xl items-center gap-8 md:grid-cols-[1.1fr_1fr] md:gap-12">
          <ScanPhoto />

          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.12em] text-neutral-400">Your plan</div>
            <h3 className="mt-1 text-2xl font-bold tracking-tight">{FINDINGS.length} steps · {TOTAL_MIN} minutes</h3>
            <p className="mt-1 text-sm text-neutral-500">Built from the photo. Quick wins first, one step on screen at a time.</p>

            <ol className="mt-5 divide-y divide-neutral-200 border-y border-neutral-200">
              {FINDINGS.map((f, i) => (
                <li key={f.label} className="flex items-center gap-4 py-3.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-neutral-950 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-[15px] text-neutral-800">{f.step}</span>
                  <span className="text-sm tabular-nums text-neutral-400">{f.min} min</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between text-xs font-medium text-neutral-500">
                  <span>Mess Score</span>
                  <span className="tabular-nums">
                    {SCAN_SCORE} <span className="text-neutral-300">→</span> <span className="font-bold text-emerald-600">12</span>
                  </span>
                </div>
                <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-neutral-100">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-neutral-200" style={{ width: `${SCAN_SCORE}%` }} />
                  <div className="absolute inset-y-0 left-0 w-[12%] rounded-full bg-emerald-500" />
                </div>
              </div>
            </div>
          </div>
        </div>
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
