"use client";

import { Folder } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type FolderRow = { id: string; name: string };

/** Your folders (the same ones documents use). */
export function useFolders() {
  const supabase = useMemo(() => createClient(), []);
  const [folders, setFolders] = useState<FolderRow[]>([]);
  useEffect(() => {
    supabase
      .from("folders")
      .select("id,name")
      .order("name")
      .then(({ data }) => setFolders((data as FolderRow[]) ?? []));
  }, [supabase]);
  return folders;
}

/** A small "which folder" picker. Hidden when you have no folders yet. */
export function FolderSelect({
  folders,
  value,
  onChange,
  emptyLabel = "No folder",
  label = "Folder",
  className = "",
}: {
  folders: FolderRow[];
  value: string | null;
  onChange: (id: string | null) => void;
  emptyLabel?: string;
  label?: string;
  className?: string;
}) {
  if (!folders.length) return null;
  return (
    <label className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ring-line focus-within:ring-accent ${className}`}>
      <Folder size={14} className="shrink-0 text-muted" />
      <select
        aria-label={label}
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="max-w-40 cursor-pointer truncate bg-transparent outline-none"
      >
        <option value="">{emptyLabel}</option>
        {folders.map((f) => (
          <option key={f.id} value={f.id}>
            {f.name}
          </option>
        ))}
      </select>
    </label>
  );
}
