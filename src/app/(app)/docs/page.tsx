import { FileText } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function DocsPage() {
  return (
    <ComingSoon
      Icon={FileText}
      title="Documents"
      phase={2}
      blurb="A calm, focused editor with AI that rewrites, expands, and keeps going when you're stuck."
    />
  );
}
