import { Suspense } from "react";
import { FollowupsPage } from "@/components/inbox/followups";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <FollowupsPage />
    </Suspense>
  );
}
