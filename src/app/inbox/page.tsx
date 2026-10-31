import { Suspense } from "react";
import { HomePage } from "@/components/inbox/home";

// Rendered on the client from /api/inbox (see layout.tsx).
export const instant = false;

export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}
