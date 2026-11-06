// Eboclean logo: a friendly lowercase "e" drawn as one sweeping stroke, with a
// sparkle for the "fresh start" moment. Original artwork, safe to use anywhere.

export function LogoMark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} role="img" aria-label="Eboclean">
      <defs>
        <linearGradient id="ebo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2b2b2f" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#ebo-bg)" />
      {/* the "e": crossbar + sweeping arc */}
      <path d="M18 35 H44 M44 35 A13.5 13.5 0 1 0 40.5 45" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      {/* sparkle */}
      <path d="M49 8 C50 13.5 51 14.5 56.5 15.5 C51 16.5 50 17.5 49 23 C48 17.5 47 16.5 41.5 15.5 C47 14.5 48 13.5 49 8 Z" fill="#ffffff" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-tight ${className}`}>
      ebo<span className="text-neutral-900">clean</span>
    </span>
  );
}
