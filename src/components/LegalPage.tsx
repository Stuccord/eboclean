import Link from "next/link";
import { LogoMark, Wordmark } from "./Logo";

export const LEGAL_UPDATED = "6 November 2026";

/** Contact for privacy/support requests. Set SUPPORT_EMAIL in your environment. */
function supportEmail() {
  return process.env.SUPPORT_EMAIL ?? null;
}

export function ContactLine() {
  const email = supportEmail();
  return email ? (
    <a href={`mailto:${email}`} className="font-semibold underline">
      {email}
    </a>
  ) : (
    <span>the support email shown on our app store page</span>
  );
}

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 pb-16 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <Link href="/" className="flex items-center gap-2" aria-label="Back to Eboclean">
        <LogoMark size={32} />
        <Wordmark className="text-lg" />
      </Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-neutral-500">Last updated {LEGAL_UPDATED}</p>
      <div className="mt-6 space-y-4 text-[15px] leading-6 text-neutral-800">{children}</div>
      <p className="mt-10 text-sm text-neutral-500">
        <Link href="/privacy" className="underline">
          Privacy Policy
        </Link>
        {" · "}
        <Link href="/terms" className="underline">
          Terms of Service
        </Link>
        {" · "}
        <Link href="/" className="underline">
          Back to the app
        </Link>
      </p>
    </main>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-4 text-lg font-bold text-neutral-950">{children}</h2>;
}

export function Bullets({ children }: { children: React.ReactNode }) {
  return <ul className="list-disc space-y-2 pl-5">{children}</ul>;
}
