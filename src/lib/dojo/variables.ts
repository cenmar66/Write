// {{placeholder}} handling shared by the generator, templates and the Testing Lab.
const VAR = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]{0,63})\s*\}\}/g;

/** Distinct variable names in order of first appearance. */
export function extractVariables(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(VAR)) seen.add(m[1]);
  return [...seen];
}

/** Replaces {{name}} with values; unknown or empty variables are left in place. */
export function fillVariables(text: string, values: Record<string, string>): string {
  return text.replace(VAR, (whole, name: string) => {
    const v = values[name];
    return typeof v === "string" && v.trim() ? v : whole;
  });
}
