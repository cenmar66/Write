// Word-level diff for comparing prompt versions (LCS on tokens, whitespace kept).
export type DiffPart = { type: "same" | "added" | "removed"; text: string };

const tokenize = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  // Guard against quadratic blow-up on huge inputs: fall back to a line diff.
  if (a.length * b.length > 4_000_000) return diffLines(before, after);
  const n = a.length;
  const m = b.length;
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffPart[] = [];
  const push = (type: DiffPart["type"], text: string) => {
    const last = out[out.length - 1];
    if (last && last.type === type) last.text += text;
    else out.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("removed", a[i++]);
    else push("added", b[j++]);
  }
  while (i < n) push("removed", a[i++]);
  while (j < m) push("added", b[j++]);
  return out;
}

function diffLines(before: string, after: string): DiffPart[] {
  const a = new Set(before.split("\n"));
  const b = new Set(after.split("\n"));
  const out: DiffPart[] = [];
  for (const l of before.split("\n")) out.push({ type: b.has(l) ? "same" : "removed", text: `${l}\n` });
  for (const l of after.split("\n")) if (!a.has(l)) out.push({ type: "added", text: `${l}\n` });
  return out;
}

export function diffStats(parts: DiffPart[]) {
  const count = (t: DiffPart["type"]) => parts.filter((p) => p.type === t).reduce((s, p) => s + (p.text.trim() ? p.text.trim().split(/\s+/).length : 0), 0);
  return { added: count("added"), removed: count("removed") };
}
