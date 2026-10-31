import { Suspense } from "react";
import { PromptDetailPage } from "@/components/dojo/prompt-detail";

export const instant = false;

type Params = Promise<{ id: string }>;

async function Loader({ params }: { params: Params }) {
  const { id } = await params;
  return <PromptDetailPage key={id} id={id} />;
}

export default function Page({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="pd-skeleton h-96" />}>
      <Loader params={params} />
    </Suspense>
  );
}
