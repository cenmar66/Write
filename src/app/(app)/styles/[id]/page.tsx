import { Loader2 } from "lucide-react";
import { Suspense } from "react";
import { StyleStudio } from "./style-studio";

type Params = Promise<{ id: string }>;

async function Loader({ params }: { params: Params }) {
  const { id } = await params;
  return <StyleStudio key={id} styleId={id} />;
}

export default function StylePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="grid min-h-[50dvh] place-items-center"><Loader2 className="animate-spin text-muted" /></div>}>
      <Loader params={params} />
    </Suspense>
  );
}
