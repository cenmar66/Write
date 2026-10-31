import { Suspense } from "react";
import { AnalyticsPage } from "@/components/inbox/analytics";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <AnalyticsPage />
    </Suspense>
  );
}
