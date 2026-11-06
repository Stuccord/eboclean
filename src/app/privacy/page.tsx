import type { Metadata } from "next";
import { Bullets, ContactLine, H2, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Eboclean" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        Eboclean (&quot;we&quot;, &quot;us&quot;) helps you clean your home with tiny, doable steps. This policy explains what we
        collect, why, who helps us run the service, and the choices you have.
      </p>

      <H2>What we collect</H2>
      <Bullets>
        <li>
          <b>Your email address</b>, when you create an account, so you can sign in with a one-time code and keep your data on every
          device.
        </li>
        <li>
          <b>Photos you choose to scan.</b> They are sent to our AI provider to create your cleaning plan. They are saved on your device
          and, if you are signed in, in private storage linked to your account so they sync. Photos are never public, and we don&apos;t
          look at them unless you ask us to help with a problem.
        </li>
        <li>
          <b>Your home setup and progress</b>: rooms, tasks, history, streaks, points and your onboarding answers.
        </li>
        <li>
          <b>Subscription details</b>: your plan, trial dates and a customer ID from our payment provider. We never see or store your
          card number.
        </li>
        <li>
          <b>Usage counts and basic technical data</b>: how many scans you have used (to apply plan limits), your IP address (to block
          abuse) and standard server logs.
        </li>
      </Bullets>

      <H2>How we use it</H2>
      <p>
        To provide the app, analyze the photos you submit, sync your data, process payments, apply plan limits, prevent abuse, and reply
        when you contact us. We don&apos;t sell your data, don&apos;t show ads, and don&apos;t use your photos to train AI models.
      </p>

      <H2>Who helps us run Eboclean</H2>
      <Bullets>
        <li>
          <b>Anthropic</b> (Claude AI) analyzes the photos you scan. Under its commercial terms it doesn&apos;t train its models on them.
        </li>
        <li>
          <b>Supabase</b>: sign-in, database and private photo storage.
        </li>
        <li>
          <b>Paystack</b>: subscription payments. Card details go directly to Paystack.
        </li>
        <li>
          <b>Vercel</b>: hosting.
        </li>
      </Bullets>
      <p>These providers may process data in other countries, with the safeguards the law requires.</p>

      <H2>Cookies and device storage</H2>
      <p>
        We only use essential cookies: to keep you signed in and to remember your plan and free-scan usage. Your rooms, tasks and photos
        are also stored on your device so the app works offline. No advertising or tracking cookies.
      </p>

      <H2>How long we keep it</H2>
      <p>
        As long as you have an account. When you delete your account we delete your profile, synced data and photos straight away;
        copies in encrypted backups expire after a short period. Payment records may be kept by Paystack and by us where tax law
        requires.
      </p>

      <H2>Your choices and rights</H2>
      <Bullets>
        <li>
          <b>Delete your account</b> anytime in the app: Progress → your account → Delete account. This also cancels any active
          subscription.
        </li>
        <li>Use the app without an account for its offline features. AI scans need a free account.</li>
        <li>
          Ask us for a copy of your data, a correction or deletion. Depending on where you live (for example under Ghana&apos;s Data
          Protection Act, the GDPR or US state laws) you may have more rights, including complaining to your data protection authority.
        </li>
      </Bullets>

      <H2>Children</H2>
      <p>Eboclean isn&apos;t meant for children under 13, and we don&apos;t knowingly collect their data.</p>

      <H2>Security</H2>
      <p>
        Data is encrypted in transit, photos are stored privately, and each account can only reach its own data. No system is perfectly
        secure, but we work hard to protect yours.
      </p>

      <H2>Changes and contact</H2>
      <p>
        If we change this policy in a meaningful way, we will tell you in the app. Questions or requests: <ContactLine />.
      </p>
    </LegalPage>
  );
}
