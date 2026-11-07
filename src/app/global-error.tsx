"use client";

import { ErrorDetails } from "@/components/error-details";

// Last resort: a crash in the root layout itself. Renders its own document.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0 }}>
        <ErrorDetails error={error} retry={retry} />
      </body>
    </html>
  );
}
