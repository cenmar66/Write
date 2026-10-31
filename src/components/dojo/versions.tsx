"use client";

import { GitCompare, History, RotateCcw } from "lucide-react";
import { useState } from "react";
import { formatDate } from "./client";
import { DiffView } from "./editor";
import { Dialog } from "./ui";

export type VersionItem = { id: string; content: string; label: string; createdAt: string; kind: string; summary?: string; model?: string | null };

/** Immutable version list: view any version, compare two, restore (appends a copy). */
export function VersionList({
  versions,
  currentIndex,
  onSelect,
  onRestore,
}: {
  versions: VersionItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onRestore: (index: number) => void;
}) {
  const [compare, setCompare] = useState<[number, number] | null>(null);
  const latest = versions.length - 1;
  if (!versions.length) return null;

  return (
    <section className="pd-card p-4" aria-labelledby="pd-versions-title">
      <div className="mb-2.5 flex items-center gap-2">
        <History size={16} className="pd-muted" aria-hidden />
        <h3 id="pd-versions-title" className="text-sm font-semibold">
          Versions <span className="pd-muted font-normal">({versions.length})</span>
        </h3>
        {versions.length > 1 && (
          <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost ml-auto" onClick={() => setCompare([Math.max(0, currentIndex === 0 ? 0 : currentIndex - 1), currentIndex === 0 ? 1 : currentIndex])}>
            <GitCompare size={14} aria-hidden /> Compare
          </button>
        )}
      </div>
      <ol className="max-h-72 space-y-1 overflow-y-auto">
        {versions
          .map((v, i) => ({ v, i }))
          .reverse()
          .map(({ v, i }) => (
            <li key={v.id}>
              <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 text-sm ${i === currentIndex ? "pd-accent-bg" : ""}`}>
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onSelect(i)} aria-current={i === currentIndex ? "true" : undefined}>
                  <span className="font-medium">v{i + 1}</span> <span className="pd-soft">{v.label}</span>
                  <span className="block truncate text-xs pd-muted">
                    {formatDate(v.createdAt)}
                    {v.summary ? ` · ${v.summary}` : ""}
                  </span>
                </button>
                {i !== latest && (
                  <button type="button" className="pd-btn pd-btn-sm pd-btn-ghost pd-btn-icon" title="Restore this version (adds it as a new version)" aria-label={`Restore version ${i + 1}`} onClick={() => onRestore(i)}>
                    <RotateCcw size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
      </ol>

      <Dialog open={!!compare} onClose={() => setCompare(null)} title="Compare versions" wide>
        {compare && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5">
                From
                <select className="pd-select w-auto py-1.5" value={compare[0]} onChange={(e) => setCompare([Number(e.target.value), compare[1]])}>
                  {versions.map((v, i) => (
                    <option key={v.id} value={i}>
                      v{i + 1} · {v.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5">
                to
                <select className="pd-select w-auto py-1.5" value={compare[1]} onChange={(e) => setCompare([compare[0], Number(e.target.value)])}>
                  {versions.map((v, i) => (
                    <option key={v.id} value={i}>
                      v{i + 1} · {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <DiffView before={versions[compare[0]].content} after={versions[compare[1]].content} labels={[`v${compare[0] + 1}`, `v${compare[1] + 1}`]} />
          </div>
        )}
      </Dialog>
    </section>
  );
}
