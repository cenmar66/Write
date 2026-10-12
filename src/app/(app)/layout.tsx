import { BottomNav, Sidebar } from "@/components/nav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Sidebar />
      <main className="min-h-dvh px-5 pt-[max(2rem,env(safe-area-inset-top))] pb-32 md:ml-64 md:px-10 md:pb-12">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
      <BottomNav />
    </>
  );
}
