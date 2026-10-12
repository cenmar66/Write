import { Sparkles } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function PostsPage() {
  return (
    <ComingSoon
      Icon={Sparkles}
      title="Posts"
      phase={5}
      blurb="Proven templates for every platform. One idea in, scroll-stopping posts out."
    />
  );
}
