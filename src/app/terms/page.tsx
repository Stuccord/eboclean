import type { Metadata } from "next";
import { Bullets, ContactLine, H2, LegalPage } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Eboclean" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and Eboclean (&quot;we&quot;, &quot;us&quot;) for using the Eboclean app and website.
        By using Eboclean you agree to them. If you don&apos;t agree, please don&apos;t use the app.
      </p>

      <H2>Your account</H2>
      <p>
        You must be at least 13 to use Eboclean. You sign in with a one-time code sent to your email, so keep that email secure. You are
        responsible for activity in your account. You can delete it anytime in the app.
      </p>

      <H2>Free trial and Eboclean Pro</H2>
      <Bullets>
        <li>Eboclean needs an account and an active free trial or subscription. There is no free plan.</li>
        <li>
          The yearly plan comes with a 3-day free trial. You add a card to start it; Paystack makes a small card check that is
          refunded right away. One trial per person. The monthly plan has no free trial and is charged when you subscribe.
        </li>
        <li>
          <b>When the trial ends, your card is charged automatically</b> for the plan you chose, unless you cancel before the trial
          ends. You can cancel anytime from Progress → Manage or cancel subscription.
        </li>
        <li>
          Pro is a subscription billed monthly or yearly through Paystack at the price shown before you pay. It{" "}
          <b>renews automatically</b> until you cancel.
        </li>
        <li>Cancel anytime from &quot;Manage subscription&quot; in the app. You keep Pro until the end of the period you paid for.</li>
        <li>
          Payments are non-refundable except where the law requires. If something went wrong, contact us and we will do our best to make
          it right.
        </li>
        <li>
          To keep the service fair and affordable, AI features have daily limits on every plan. We may change prices or plans with
          notice; changes apply from your next billing period.
        </li>
      </Bullets>

      <H2>AI suggestions</H2>
      <p>
        Cleaning plans and Mess Scores are made by AI from your photos and can be wrong or incomplete. Use your own judgment: never mix
        cleaning products (for example bleach with ammonia or acids), follow product labels, take care lifting heavy things, and skip
        anything that feels unsafe. Eboclean is a motivation tool, not medical, mental-health or professional advice.
      </p>

      <H2>Your content</H2>
      <p>
        Photos and information you add stay yours. You let us process them only to run the app for you, for example to analyze a photo
        or sync it to your devices. Only upload photos you have the right to use, and avoid capturing other people without their
        consent.
      </p>

      <H2>Fair use</H2>
      <p>
        Don&apos;t misuse Eboclean: no attempts to break or overload the service, get around limits or payments, access other
        people&apos;s data, or do anything illegal. We may suspend accounts that do.
      </p>

      <H2>The service</H2>
      <p>
        We work hard to keep Eboclean running, but it is provided &quot;as is&quot;, without a guarantee that it will always be
        available or error-free. As far as the law allows, we are not liable for indirect losses, and our total liability is limited to
        what you paid us in the 12 months before a claim. Nothing here limits your rights under consumer law.
      </p>

      <H2>Changes, law and contact</H2>
      <p>
        We may update these terms. If the changes matter, we will tell you in the app before they apply. These terms are governed by the
        laws of Ghana, without affecting mandatory consumer protections where you live. Questions: <ContactLine />.
      </p>
    </LegalPage>
  );
}
