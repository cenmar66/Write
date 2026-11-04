import { Suspense } from "react";
import { OnboardingPage } from "@/components/inbox/onboarding";

// Rendered on the client from /api/inbox (see ../layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <OnboardingPage />
    </Suspense>
  );
}
