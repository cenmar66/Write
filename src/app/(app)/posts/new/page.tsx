import { Suspense } from "react";
import { Composer } from "./composer";

type Search = Promise<{ template?: string; custom?: string }>;

async function Loader({ searchParams }: { searchParams: Search }) {
  const { template, custom } = await searchParams;
  return <Composer templateKey={template ?? "free"} customId={custom} />;
}

export default function NewPostPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="glass h-64 animate-pulse rounded-3xl" />}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}
