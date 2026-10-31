import type { Metadata } from "next";
import { LibraryPage } from "@/components/dojo/library";

export const instant = false;
export const metadata: Metadata = { title: "My Library" };

export default function Page() {
  return <LibraryPage />;
}
