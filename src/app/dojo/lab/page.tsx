import type { Metadata } from "next";
import { LabPage } from "@/components/dojo/lab";

export const instant = false;
export const metadata: Metadata = { title: "Testing Lab" };

export default function Page() {
  return <LabPage />;
}
