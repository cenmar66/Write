import type { Metadata } from "next";
import { PrivacyPage } from "@/components/dojo/privacy";

export const instant = false;
export const metadata: Metadata = { title: "Privacy" };

export default function Page() {
  return <PrivacyPage />;
}
