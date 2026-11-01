import { Suspense } from "react";
import { BriefPage } from "@/components/inbox/brief";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <BriefPage />
    </Suspense>
  );
}
