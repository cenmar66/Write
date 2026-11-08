import type { Metadata } from "next";
import { CostsPage } from "@/components/satori/costs";

export const instant = false;
export const metadata: Metadata = { title: "Costs" };

export default function Page() {
  return <CostsPage />;
}
