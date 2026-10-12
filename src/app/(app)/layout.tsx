import { Suspense } from "react";
import { BottomNav, Sidebar, SidebarFallback } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={<SidebarFallback />}>
        <Sidebar />
      </Suspense>
      <main className="min-h-dvh px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-32 md:ml-64 md:px-10 md:pb-12 print:m-0 print:p-0">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <Suspense fallback={null}>
        <BottomNav />
      </Suspense>
    </>
  );
}
