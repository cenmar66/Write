import { Suspense } from "react";
import { SendersPage } from "@/components/inbox/senders";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <SendersPage />
    </Suspense>
  );
}
