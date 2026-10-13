import { Suspense } from "react";
import { SavedPost } from "./saved-post";

async function Loader({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SavedPost id={id} />;
}

export default function PostPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="glass h-64 animate-pulse rounded-3xl" />}>
      <Loader params={params} />
    </Suspense>
  );
}
