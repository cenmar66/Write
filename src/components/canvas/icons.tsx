import {
  Briefcase,
  CalendarDays,
  CheckSquare,
  Dumbbell,
  GlassWater,
  Heart,
  Lightbulb,
  Mail,
  NotebookPen,
  ShoppingBag,
  User,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { SectionKey } from "@/lib/canvas/types";

export const SECTION_ICONS: Record<SectionKey, LucideIcon> = {
  must: CheckSquare,
  appointments: CalendarDays,
  work: Briefcase,
  comms: Mail,
  journal: Heart,
  shopping: ShoppingBag,
  personal: User,
  exercise: Dumbbell,
  meals: Utensils,
  water: GlassWater,
  ideas: Lightbulb,
  notes: NotebookPen,
};

/** The little leaf sprig next to the name. */
export function Sprig({ className = "", size = 22 }: { className?: string; size?: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
      <path d="M6 27C11 20 16 13 26 5" />
      <path d="M12 19c-3-.5-5-2.6-5.4-5.6 3 .3 5.1 2.3 5.4 5.6Z" />
      <path d="M16 14.5c-2.6-1.3-3.9-3.9-3.5-6.8 2.7 1.1 4 3.7 3.5 6.8Z" />
      <path d="M14 18.5c2.7.9 5.6.2 7.6-2-2.7-1-5.6-.3-7.6 2Z" />
      <path d="M19 12c2.6.7 5.3.1 7.2-2-2.6-.8-5.3-.2-7.2 2Z" />
    </svg>
  );
}
