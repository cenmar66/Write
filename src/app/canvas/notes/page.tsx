import { NotesArchive } from "@/components/canvas/archive";

// Rendered on the device after the planner boots (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return <NotesArchive />;
}
