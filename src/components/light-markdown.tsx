/** Just enough Markdown for a preview: bold, italics, headings, bullets. */
export function LightMarkdown({ text }: { text: string }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const heading = /^#{1,6}\s+/.test(line);
        const clean = line.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "• ");
        const parts = clean.split(/(\*\*[^*]+\*\*|\*[^*]+\*|_[^_]+_)/g);
        return (
          <span key={i} className={heading ? "font-display text-lg" : undefined}>
            {parts.map((part, j) =>
              /^\*\*.+\*\*$/.test(part) ? (
                <strong key={j}>{part.slice(2, -2)}</strong>
              ) : /^(\*|_).+(\*|_)$/.test(part) ? (
                <em key={j}>{part.slice(1, -1)}</em>
              ) : (
                part
              ),
            )}
            {"\n"}
          </span>
        );
      })}
    </>
  );
}
