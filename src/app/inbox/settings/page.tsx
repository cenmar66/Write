import { Suspense } from "react";
import { SettingsPage } from "@/components/inbox/settings";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <SettingsPage />
    </Suspense>
  );
}
