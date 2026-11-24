import { Rain } from "./Rain";

/** Layered Gotham atmosphere: smoke, crimson light sweep, rain, grain and vignette. */
export function Atmosphere({ rain = true, sweep = true }: { rain?: boolean; sweep?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="smoke" />
      <div className="smoke two" />
      {sweep && <div className="light-sweep" />}
      {rain && <Rain />}
      <div className="vignette absolute inset-0" />
      <div className="grain absolute inset-0 overflow-hidden" />
    </div>
  );
}

export function Emblem({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ff3b4e" />
          <stop offset="0.55" stopColor="#c8102e" />
          <stop offset="1" stopColor="#5d0910" />
        </linearGradient>
      </defs>
      <path d="M32 6C19 6 11 16 11 30c0 11 6 20 13 26l3-10h10l3 10c7-6 13-15 13-26C53 16 45 6 32 6z" fill="url(#hood)" />
      <path d="M18 30c4.5-3.5 9-3.5 12.5 0-3.5 3.5-8.5 3.5-12.5 0zm15.5 0c3.5-3.5 8-3.5 12.5 0-4 3.5-9 3.5-12.5 0z" fill="#07070a" />
      <path d="M32 6C24 6 18 10 15 17c5-5 10-7 17-7s12 2 17 7c-3-7-9-11-17-11z" fill="rgba(255,255,255,.18)" />
    </svg>
  );
}
