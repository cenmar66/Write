"use client";

import { History as HistoryIcon, Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { targetName } from "@/lib/dojo/targets";
import { api, formatDate, setHandoff, type GenerationRecord } from "./client";
import { useDojo } from "./provider";
import { EmptyState, ErrorBox, PageHeader } from "./ui";

export function HistoryPage() {
  const router = useRouter();
  const { toast } = useDojo();
  const [items, setItems] = useState<GenerationRecord[] | null>(null);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ generations: GenerationRecord[] }>(`/api/dojo/history${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      setItems(r.generations);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
      setItems((x) => x ?? []);
    }
  }, [q]);
  useEffect(() => {
    const t = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <div className="space-y-5">
      <PageHeader title="History" subtitle="Every prompt package you've generated. Open one to keep refining it." />
      <label className="relative block max-w-md">
        <span className="sr-only">Search history</span>
        <Search size={15} className="pd-muted absolute top-1/2 left-3 -translate-y-1/2" aria-hidden />
        <input className="pd-input pl-9" placeholder="Search your requests" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {error && <ErrorBox message={error} onRetry={load} />}
      {items === null ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skeleton h-20" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<HistoryIcon size={22} />} title={q ? "Nothing matches" : "No history yet"} action={!q ? <Link className="pd-btn pd-btn-primary" href="/dojo">Generate your first prompt</Link> : undefined} />
      ) : (
        <ul className="space-y-2">
          {items.map((g) => (
            <li key={g.id} className="pd-card flex items-start gap-3 p-4">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  setHandoff({ to: "generator", generationId: g.id });
                  router.push("/dojo");
                }}
              >
                <span className="block font-semibold">{g.result.recommended.title}</span>
                <span className="line-clamp-2 block text-sm pd-soft">{g.request}</span>
                <span className="mt-1.5 flex flex-wrap gap-1.5 text-xs pd-muted">
                  <span className="pd-badge">{targetName({ id: g.target_model, customName: g.custom_target })}</span>
                  {g.is_mock ? <span className="pd-badge pd-badge-warn">mock</span> : <span className="pd-mono">{g.model}</span>}
                  <span>· {formatDate(g.created_at)}</span>
                </span>
              </button>
              <button
                type="button"
                className="pd-btn pd-btn-ghost pd-btn-icon pd-btn-sm"
                aria-label="Delete from history"
                onClick={async () => {
                  try {
                    await api(`/api/dojo/history/${g.id}`, { method: "DELETE" });
                    setItems((x) => x?.filter((y) => y.id !== g.id) ?? null);
                    toast("Removed from history", "ok");
                  } catch (e) {
                    toast((e as Error).message, "error");
                  }
                }}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
