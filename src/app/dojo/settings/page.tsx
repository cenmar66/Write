import type { Metadata } from "next";
import { SettingsPage } from "@/components/dojo/settings";

export const instant = false;
export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsPage />;
}
