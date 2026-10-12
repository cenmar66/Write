import type { LucideIcon } from "lucide-react";

export function ComingSoon({
  Icon,
  title,
  phase,
  blurb,
}: {
  Icon: LucideIcon;
  title: string;
  phase: number;
  blurb: string;
}) {
  return (
    <section className="flex min-h-[70dvh] flex-col items-center justify-center text-center animate-rise">
      <div className="bg-gradient-brand mb-6 grid size-16 place-items-center rounded-3xl text-white shadow-xl shadow-accent/30">
        <Icon size={28} />
      </div>
      <span className="glass rounded-full px-3 py-1 text-xs tracking-wide text-muted">
        Arriving in Phase {phase}
      </span>
      <h1 className="mt-4 font-display text-4xl tracking-tight sm:text-5xl">{title}</h1>
      <p className="mt-3 max-w-sm text-muted">{blurb}</p>
    </section>
  );
}
