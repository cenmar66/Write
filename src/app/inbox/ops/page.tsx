import { Suspense } from "react";
import { OpsPage } from "@/components/inbox/ops";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <OpsPage />
    </Suspense>
  );
}
