# Eboclean ✨

Snap your messy room → AI gives you a **Mess Score** and a 10-minute cleaning mission → snap the "after" photo → share your glow-up.

## Run it locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 (on your phone, use your computer's local IP, e.g. `http://192.168.x.x:3000`).

**No API key yet?** The app runs in **demo mode** with a sample result, so you can try the full flow and film UI clips.

## Connect the real AI

1. Create an API key at https://console.anthropic.com (Settings → API Keys) and add billing credit.
2. Copy `.env.example` to `.env.local` and paste your key:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
3. Restart `npm run dev`.

The scan uses Claude Opus 5.5 (vision + structured JSON output) with low effort for speed. A server-side fallback is enabled, so if a photo is declined for a policy reason the API retries on a fallback model.

## How it works

### Features
- **Home setup from photos:** snap each room once; AI builds a recurring routine (tasks + how often).
- **Today's reset:** each day the app picks the most-needed tasks across your home that fit your time and energy.
- **Clean with Ebo:** a "just 2 minutes" start, a companion that talks you through each step (browser voice), cheers you on, and checks in at 2 minutes.
- **Quick scan:** snap any mess → Mess Score → mission → after photo → share card.
- **Rooms:** freshness meter per room that slowly drops as tasks come due.
- **Progress:** streaks, points, and a before/after photo timeline.

| File | What it does |
|---|---|
| `src/app/page.tsx` | Navigation (Today / Rooms / Progress tabs), welcome screen, daily reset flow |
| `src/components/TodayView.tsx` | Today's plan, time/energy picker |
| `src/components/SetupFlow.tsx` | Add a room from a photo |
| `src/components/ScanFlow.tsx` | Quick scan → mission → after photo → glow-up + share |
| `src/components/MissionRunner.tsx` | Step-by-step mission with timer and the Sweep companion |
| `src/components/RoomsView.tsx` | Room list, room detail, timeline entries |
| `src/components/ProgressView.tsx` | Stats and glow-up timeline |
| `src/components/ui.tsx` | Shared UI pieces and data hooks |
| `src/app/api/scan/route.ts`, `src/app/api/setup/route.ts` | API endpoints (AI or demo mode) |
| `src/lib/scan.ts` | AI prompts, Mess Score rubric, JSON schemas |
| `src/lib/store.ts` | Rooms, tasks, history, photos (IndexedDB on the device), daily plan logic |
| `src/lib/progress.ts` | Points and streaks |
| `src/lib/shareCard.ts` | Draws the 1080×1920 before/after share card |

## Payments (Paystack, in US dollars)

**No free plan.** After onboarding, everyone must sign up and start a trial or subscribe; the app is locked otherwise (`AccessGate` in `src/components/Billing.tsx`), and every AI route checks it on the server.
**Pro:** **$9.99/month** or **$29.99/year** (USD). The yearly plan has a 3-day free trial (card up front); monthly is charged at checkout.
**Trial: 3 days, yearly plan only, card required.** Flow: the user picks the yearly plan → Paystack charges a $1.00 card check (`TRIAL_CARD_CHECK`) that saves a reusable card → the server creates the Paystack subscription with `start_date` = 3 days later and refunds the $1.00 → on day 4 Paystack charges the plan automatically unless the user cancelled (Progress → Manage or cancel subscription). One trial per account (claimed atomically, so the success redirect and webhook can't start it twice). Code: `activateCardTrial` in `src/lib/billing.ts`.

Without Paystack keys the app uses **demo payments** (trial, subscribe and cancel all work; nothing is charged).

To take real payments:
1. Open a Paystack account and complete business verification.
2. **Ask Paystack to enable USD payments** on your account (Settings, or contact Paystack support). USD availability depends on your business country and needs approval.
3. In **Test mode**: Products → Plans → create "Eboclean Pro Monthly" ($9.99, monthly, currency USD) and "Eboclean Pro Yearly" ($29.99, annually, currency USD). Copy each plan code (`PLN_...`).
4. Put `PAYSTACK_SECRET_KEY` (test key first), `PAYSTACK_PLAN_MONTHLY`, `PAYSTACK_PLAN_YEARLY` and `APP_SECRET` in `.env.local` (see `.env.example`).
5. Test with Paystack's test cards, then switch to your live key and live plan codes.

How it works: the app starts a Paystack checkout for the chosen plan; Paystack charges the card in USD and creates the subscription. When the user returns, the server verifies the transaction with Paystack and stores the customer in a signed cookie. Pro status is checked live with Paystack (cached 1 minute): a subscription counts while it is `active` or `non-renewing` (cancelled but paid until the period ends). "Manage or cancel" opens Paystack's hosted subscription page.

Starting a trial or subscribing requires an account, so they work on every device. A trial cancelled before day 4 never charges; when it ends the app locks again.

## Accounts (email code sign-in + cloud sync)

Sign-in is passwordless: enter your email, get a 6-digit code. Rooms, tasks, history, points/streak and photos sync to the account, so users can sign in on a new phone and pick up where they left off. The free-usage counters, trial and Paystack subscription are stored on the account, so Pro works on every device and the trial can't be repeated by clearing cookies. Signing out removes the data from that device (it stays in the account).

Without Supabase keys the app uses **demo accounts**: stored in `.data/` on this computer, and the sign-in code is shown on screen instead of emailed. Demo accounts are refused in production unless `ALLOW_DEMO_ACCOUNTS=1`.

To use real accounts with Supabase (free tier is fine):
1. Create a project at supabase.com.
2. SQL Editor → run `supabase/schema.sql`.
3. Storage → New bucket → name it `photos`, keep it **private**.
4. Authentication → Email templates → "Magic Link": make the email show the code with `{{ .Token }}` (for example: "Your Eboclean code is {{ .Token }}"). By default Supabase sends a link, but the app signs in with the 6-digit code.
5. Authentication → Providers → Email: enabled. For real users, set up custom SMTP (Supabase's built-in email is rate-limited and meant for testing).
6. Project Settings → API: copy the URL, anon key and service role key into `.env.local` (see `.env.example`). Keep the service role key secret.

## PWA (installable app) and app-store readiness

- `src/app/manifest.ts`: name, colors, standalone display, icons (normal + maskable), shortcuts (SOS, Scan).
- `public/sw.js`: service worker (production only). Pages network-first with offline fallback to the cached app; build assets cache-first; `/api/*` never cached. Bump `VERSION` to force-clear old caches.
- `public/offline.html`: shown if the app was never loaded and the device is offline.
- iPhone: `appleWebApp` metadata + `src/app/apple-icon.png`; layout uses safe-area insets (`viewport-fit=cover`).
- Install prompts: `src/components/Pwa.tsx` (Android/desktop "Install app" button, iPhone "Add to Home Screen" steps).
- Icons: regenerate everything from the logo with `node scripts/generate-icons.mjs`. Store icons are in `store-assets/` (512 for Google Play, 1024 for the App Store, no transparency).

### Shipping to the stores (later)
- **Google Play:** wrap the PWA as a Trusted Web Activity (PWABuilder or Bubblewrap). You'll add `public/.well-known/assetlinks.json` with the app's signing-key fingerprint from Play Console.
- **Apple App Store:** wrap with Capacitor and add native features (camera, push reminders, haptics), so the app isn't rejected as a "website in a wrapper" (guideline 4.2).
- **Payments in store apps:** Apple and Google generally require their own in-app purchase systems for digital subscriptions sold inside the app (Apple 3.1.1, Google Play Payments policy), so Paystack can't be the checkout inside those apps. Plan: keep Paystack on the web, add store billing (e.g. via RevenueCat) in the store builds, and link both to the same account so Pro works everywhere.

## Protection against abuse and runaway AI costs

- **AI needs an account with an active trial or subscription** (checked on the server for every scan and room setup).
- **Daily cap per account** on all AI calls (scans, after-photos, room setups): 40/day (`DAILY_AI_LIMIT` in `src/lib/billing.ts`). Needs the `ai_day`/`ai_count` columns: re-run `supabase/schema.sql` (safe to run again).
- **Burst limit per IP**: 20 AI requests per 10 minutes per server instance (`src/lib/rateLimit.ts`).
- Also set a **monthly spend limit** in the Anthropic Console (Settings → Limits) as a final safety net.

## Paystack webhook

`/api/billing/webhook` verifies Paystack's signature, links a payment to the account even if the buyer closed the tab before returning, and refreshes Pro status right away on cancellations and failed renewals. In Paystack → Settings → API Keys & Webhooks, set the **Webhook URL** to `https://eboclean-two.vercel.app/api/billing/webhook` (test and live mode each have their own).

## Account deletion, privacy and terms

- Progress → account card → **Delete account**: cancels any Paystack subscription, deletes photos, synced data, profile and the login (required by Apple, Google and privacy laws).
- `/privacy` and `/terms` are linked from onboarding, the paywall and Progress. Set `SUPPORT_EMAIL` so the pages show a contact address. They are a solid starting point, not legal advice: have them reviewed, and add your registered business name if you have one.

## Admin dashboard (`/admin`)

Open **https://eboclean-two.vercel.app/admin** and sign in with an email listed in `ADMIN_EMAILS`. Nobody else can load any of its data.

- **Overview**: things to look out for (failed payments, unrefunded card checks, AI errors, missing setup), money (MRR, revenue, fees, refunds, profit after AI costs, charges coming in the next 7 days), growth (sign-ups, active users), subscription statuses, the trial-to-paid funnel, and AI usage and cost per day.
- **Users**: every account with its status, activity, AI cost and payments; search, filter, CSV export. Open a user to see their timeline and to give free days, reset their daily scan limit, cancel their subscription, email them or delete the account.
- **Payments**: money in and out from Paystack, failed attempts, trial card checks, one-click refunds.
- **Emails**: email a group (everyone, on trial, paying, payment failed, trial ended…) through Resend. Announcements include an unsubscribe link and skip people who unsubscribed. A daily job emails people on day 2 of their 3-day trial, before it converts.
- **Activity**: a live log of sign-ups, sign-ins, trials, scans, blocked scans, Paystack events, emails and admin actions.
- **Setup**: what's connected and what's missing.

The activity log lives in the `events` table: re-run `supabase/schema.sql` after updating. AI costs are estimated from the tokens each Claude call used.

## Live deployment (Vercel)

Live at **https://eboclean-two.vercel.app** (deploys automatically when you push to `main` on GitHub).

- Keys are **not** in the repository. Add them in Vercel → Project → Settings → Environment Variables (Production), then redeploy:
  `ANTHROPIC_API_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_PLAN_MONTHLY`, `PAYSTACK_PLAN_YEARLY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_SECRET`, `SUPPORT_EMAIL`, `ADMIN_EMAILS`, `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`, and `APP_URL=https://eboclean-two.vercel.app`.
- In Supabase → Authentication → URL Configuration, set **Site URL** to `https://eboclean-two.vercel.app`.

## Not built yet (next steps)

- Error monitoring (e.g. Sentry) and automated tests for payments and sign-in
- Real reminder notifications (needs a native app or web push)
- Household sharing
