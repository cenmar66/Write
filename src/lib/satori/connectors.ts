// Connected apps (MCP servers): the name Claude sees for each one.

/** A short, unique, lowercase name derived from the label ("My Notion" -> "my-notion"). */
export function serverNameFor(label: string, taken: string[]): string {
  const base =
    label
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 34) || "app";
  let name = /^[a-z0-9]/.test(base) ? base : `app-${base}`.slice(0, 40);
  for (let n = 2; taken.includes(name); n++) name = `${base}-${n}`.slice(0, 40);
  return name;
}
