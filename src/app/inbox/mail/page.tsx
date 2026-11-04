import { Suspense } from "react";
import { MailPage } from "@/components/inbox/mail";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <MailPage />
    </Suspense>
  );
}
