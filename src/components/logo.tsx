export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="wl" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7c6cff" />
          <stop offset=".6" stopColor="#f472b6" />
          <stop offset="1" stopColor="#fbbf77" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#wl)" />
      <path
        d="M17 22l6.5 21L32 26l8.5 17L47 22"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <Logo size={30} />
      <span className="font-display text-xl tracking-tight">
        Write<span className="text-gradient">.ai</span>
      </span>
    </span>
  );
}
