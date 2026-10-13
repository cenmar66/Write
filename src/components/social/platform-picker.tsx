"use client";

import { Check } from "lucide-react";
import { PLATFORM_IDS, PLATFORMS, type PlatformId } from "@/lib/social/platforms";
import { PlatformBadge } from "./platform-badge";

export function PlatformPicker({ value, onChange }: { value: PlatformId[]; onChange: (v: PlatformId[]) => void }) {
  const toggle = (id: PlatformId) =>
    onChange(value.includes(id) ? (value.length > 1 ? value.filter((v) => v !== id) : value) : [...value, id]);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Platforms">
      {PLATFORM_IDS.map((id) => {
        const on = value.includes(id);
        return (
          <button
            key={id}
            onClick={() => toggle(id)}
            aria-pressed={on}
            className={`flex items-center gap-2 rounded-full py-1.5 pr-3.5 pl-1.5 text-sm ring-1 transition ${on ? "bg-surface-strong ring-accent" : "ring-line text-muted hover:text-ink"}`}
          >
            <PlatformBadge platform={id} size="sm" />
            {PLATFORMS[id].label}
            {on && <Check size={13} className="text-accent" />}
          </button>
        );
      })}
    </div>
  );
}
