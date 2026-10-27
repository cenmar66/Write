import { Suspense } from "react";
import { Composer } from "./composer";

type Search = Promise<{ template?: string; custom?: string; prompt?: string }>;

async function Loader({ searchParams }: { searchParams: Search }) {
  const { template, custom, prompt } = await searchParams;
  return <Composer templateKey={template ?? "free"} customId={custom} promptKey={prompt} />;
}

export default function NewPostPage({ searchParams }: { searchParams: Search }) {
  return (
    <Suspense fallback={<div className="glass h-64 animate-pulse rounded-3xl" />}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}
