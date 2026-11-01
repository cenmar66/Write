import type { Metadata } from "next";
import { HistoryPage } from "@/components/satori/history";

export const instant = false;
export const metadata: Metadata = { title: "History" };

export default function Page() {
  return <HistoryPage />;
}
