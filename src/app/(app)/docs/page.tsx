import { Suspense } from "react";
import { DocsBrowser } from "./docs-browser";

export default function DocsPage() {
  return (
    <Suspense fallback={<div className="glass mt-24 h-36 animate-pulse rounded-3xl" />}>
      <DocsBrowser />
    </Suspense>
  );
}
