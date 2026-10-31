import type { Metadata } from "next";
import { HistoryPage } from "@/components/dojo/history";

export const instant = false;
export const metadata: Metadata = { title: "History" };

export default function Page() {
  return <HistoryPage />;
}
