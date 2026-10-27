export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--logo-bg, #1c1c1c)" />
      <path
        d="M17 22l6.5 21L32 26l8.5 17L47 22"
        fill="none"
        stroke="var(--logo-fg, #f3f2ef)"
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
