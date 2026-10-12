import { Suspense } from "react";
import { DocumentEditor, EditorSkeleton } from "@/components/editor/document-editor";

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DocumentEditor key={id} id={id} />;
}

export default function DocPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Loader params={params} />
    </Suspense>
  );
}
