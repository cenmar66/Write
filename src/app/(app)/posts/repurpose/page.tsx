import { Suspense } from "react";
import { Repurposer } from "./repurposer";

type Search = Promise<{ doc?: string; auto?: string }>;

async function Loader({ searchParams }: { searchParams: Search }) {
  const { doc, auto } = await searchParams;
  return <Repurposer docId={doc} auto={auto === "1"} />;
}

export default function RepurposePage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="glass h-64 animate-pulse rounded-3xl" />}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}
