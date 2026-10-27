"use client";

export function Ring({ value, size = 40, stroke = 4, color = "var(--dc-accent)", label, children }: { value: number | null; size?: number; stroke?: number; color?: string; label?: string; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value === null ? 0 : Math.max(0, Math.min(1, value));
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }} role="img" aria-label={label ?? (value === null ? "Nothing planned" : `${Math.round(v * 100)}% complete`)}>
      <svg width={size} height={size} className="dc-ring -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--dc-rule)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} />
      </svg>
      {children && <span className="absolute inset-0 flex items-center justify-center">{children}</span>}
    </span>
  );
}
