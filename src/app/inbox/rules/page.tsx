import { Suspense } from "react";
import { RulesPage } from "@/components/inbox/rules";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <RulesPage />
    </Suspense>
  );
}
