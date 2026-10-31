"use client";

import { useEffect } from "react";

/** Sets the browser tab title (used where the page's metadata can't know the domain). */
export function DocumentTitle({ title }: { title: string }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return null;
}
