import { Suspense } from "react";
import { AccountsPage } from "@/components/inbox/accounts";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <AccountsPage />
    </Suspense>
  );
}
