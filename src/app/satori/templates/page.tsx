import type { Metadata } from "next";
import { TemplatesPage } from "@/components/satori/templates";

export const instant = false;
export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return <TemplatesPage />;
}
