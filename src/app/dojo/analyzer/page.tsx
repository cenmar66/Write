import type { Metadata } from "next";
import { AnalyzerPage } from "@/components/dojo/analyzer";

export const instant = false;
export const metadata: Metadata = { title: "Analyzer" };

export default function Page() {
  return <AnalyzerPage />;
}
