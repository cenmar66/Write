import type { Metadata } from "next";
import { LibraryPage } from "@/components/satori/library";

export const instant = false;
export const metadata: Metadata = { title: "My Library" };

export default function Page() {
  return <LibraryPage />;
}
