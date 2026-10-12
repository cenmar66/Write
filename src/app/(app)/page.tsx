import { ArrowUpRight, CalendarDays, FileText, Mic, Sparkles } from "lucide-react";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

const ACTIONS = [
  {
    href: "/docs/new",
    title: "Start a document",
    blurb: "A blank page with a brilliant co-writer.",
    Icon: FileText,
    tint: "from-violet-500/20 to-indigo-500/5",
  },
  {
    href: "/docs/new",
    title: "Just talk",
    blurb: "Speak in English or Spanish. Get clean text back.",
    Icon: Mic,
    tint: "from-rose-500/20 to-pink-500/5",
  },
  {
    href: "/posts",
    title: "Write a post",
    blurb: "Pick a proven format. Drop in your idea.",
    Icon: Sparkles,
    tint: "from-amber-400/25 to-orange-400/5",
  },
  {
    href: "/calendar",
    title: "Plan the week",
    blurb: "Schedule once. Publish everywhere.",
    Icon: CalendarDays,
    tint: "from-sky-400/20 to-cyan-400/5",
  },
];

async function Greeting() {
  await connection(); // depends on the current time
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "America/Los_Angeles",
    }).format(new Date()),
  );
  if (hour < 5) return "Burning the midnight oil";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function HomePage() {
  return (
    <div>
      <header className="animate-rise pt-4 md:pt-10">
        <p className="text-sm tracking-wide text-muted">
          <Suspense fallback="Welcome back">
            <Greeting />
          </Suspense>
        </p>
        <h1 className="mt-2 font-display text-5xl leading-[1.05] tracking-tight sm:text-7xl">
          What will you
          <br />
          <span className="text-gradient italic">create today?</span>
        </h1>
      </header>

      <section className="mt-10 grid gap-4 sm:grid-cols-2 md:mt-14">
        {ACTIONS.map(({ href, title, blurb, Icon, tint }, i) => (
          <Link
            key={title}
            href={href}
            prefetch={href.endsWith("/new") ? false : undefined}
            style={{ animationDelay: `${120 + i * 70}ms` }}
            className="glass group relative overflow-hidden rounded-3xl p-6 transition duration-300 animate-rise hover:-translate-y-1 hover:shadow-[0_18px_40px_-20px_rgba(40,30,90,0.18)]"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${tint} opacity-0 transition duration-300 group-hover:opacity-60 dark:opacity-60 dark:group-hover:opacity-100`} />
            <div className="relative flex items-start justify-between">
              <div className="grid size-12 place-items-center rounded-2xl bg-surface-strong shadow-sm">
                <Icon size={22} className="text-accent" />
              </div>
              <ArrowUpRight
                size={20}
                className="text-muted transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-ink"
              />
            </div>
            <h2 className="relative mt-6 font-display sm:mt-8 text-2xl tracking-tight">{title}</h2>
            <p className="relative mt-1 text-muted">{blurb}</p>
          </Link>
        ))}
      </section>
    </div>
  );
}
