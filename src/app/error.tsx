"use client";

import { ErrorDetails } from "@/components/error-details";

// Catches crashes in any page or nested layout (including InboxSatori's shell),
// so the browser shows what went wrong instead of a blank screen.
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  return <ErrorDetails error={error} retry={retry} />;
}
