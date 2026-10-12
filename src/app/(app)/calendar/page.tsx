import { CalendarDays } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function CalendarPage() {
  return (
    <ComingSoon
      Icon={CalendarDays}
      title="Calendar"
      phase={6}
      blurb="See your whole week of content at a glance, then let it publish itself."
    />
  );
}
