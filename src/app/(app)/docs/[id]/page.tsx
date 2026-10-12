import { Suspense } from "react";
import { DocumentEditor, EditorSkeleton } from "@/components/editor/document-editor";

type Params = Promise<{ id: string }>;
type Search = Promise<{ dictate?: string }>;

async function Loader({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [{ id }, { dictate }] = await Promise.all([params, searchParams]);
  return <DocumentEditor key={id} id={id} autoDictate={dictate === "1"} />;
}

export default function DocPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Loader params={params} searchParams={searchParams} />
    </Suspense>
  );
}
