"use client";

// Small, quiet SVG charts. Every chart has a text alternative (aria-label / table).

export function Bars({ data, height = 120, color = "var(--dc-accent)", format = (v: number) => String(v), max }: { data: { label: string; value: number | null; title?: string }[]; height?: number; color?: string; format?: (v: number) => string; max?: number }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.value ?? 0));
  const w = 100 / Math.max(1, data.length);
  return (
    <figure>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={data.map((d) => `${d.title ?? d.label}: ${d.value === null ? "none" : format(d.value)}`).join("; ")}>
        <line x1="0" x2="100" y1={height - 0.5} y2={height - 0.5} stroke="var(--dc-rule)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = d.value === null ? 0 : (d.value / top) * (height - 6);
          return (
            <rect key={i} x={i * w + w * 0.2} width={w * 0.6} y={height - h} height={Math.max(h, d.value === 0 ? 1 : 0)} rx="1.2" fill={color} opacity={d.value === null ? 0.15 : 0.85}>
              <title>{`${d.title ?? d.label}: ${d.value === null ? "nothing planned" : format(d.value)}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex text-[0.65rem]" style={{ color: "var(--dc-faint)" }} aria-hidden>
        {data.map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

export function Line({ series, height = 110, max }: { series: { name: string; color: string; values: (number | null)[] }[]; height?: number; max?: number }) {
  const n = Math.max(...series.map((s) => s.values.length), 2);
  const top = max ?? Math.max(1, ...series.flatMap((s) => s.values.map((v) => v ?? 0)));
  const x = (i: number) => (i / (n - 1)) * 100;
  const y = (v: number) => height - 4 - (v / top) * (height - 10);
  return (
    <figure>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label={series.map((s) => `${s.name}: ${s.values.map((v) => (v === null ? "–" : Math.round(v * 100) / 100)).join(", ")}`).join(". ")}>
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1="0" x2="100" y1={y(top * f)} y2={y(top * f)} stroke="var(--dc-rule)" vectorEffect="non-scaling-stroke" />
        ))}
        {series.map((s) => {
          // Gaps where there's no value, so empty days don't look like zeros.
          const segs: string[] = [];
          let cur = "";
          s.values.forEach((v, i) => {
            if (v === null) {
              if (cur) segs.push(cur);
              cur = "";
            } else cur += `${cur ? "L" : "M"}${x(i)},${y(v)} `;
          });
          if (cur) segs.push(cur);
          return segs.map((d, i) => <path key={s.name + i} d={d} fill="none" stroke={s.color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />);
        })}
      </svg>
      {series.length > 1 && (
        <figcaption className="mt-1 flex gap-3 text-xs" style={{ color: "var(--dc-muted)" }}>
          {series.map((s) => (
            <span key={s.name} className="inline-flex items-center gap-1">
              <span className="h-0.5 w-3" style={{ background: s.color }} /> {s.name}
            </span>
          ))}
        </figcaption>
      )}
    </figure>
  );
}

export function HabitGrid({ rows, days }: { rows: { name: string; color: string; values: boolean[] }[]; days: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <thead className="sr-only">
          <tr>
            <th>Habit</th>
            {days.map((d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <th scope="row" className="pr-2 text-left text-xs font-normal whitespace-nowrap" style={{ color: "var(--dc-muted)" }}>
                {r.name}
              </th>
              {r.values.map((v, i) => (
                <td key={i} title={`${days[i]}: ${v ? "yes" : "no"}`} className="h-3.5 w-3.5 rounded-sm" style={{ background: v ? r.color : "var(--dc-rule)" }}>
                  <span className="sr-only">{v ? "yes" : "no"}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SplitBar({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (!total) return <p className="text-sm" style={{ color: "var(--dc-faint)" }}>Nothing completed yet.</p>;
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.name} ${p.value}`).join(", ")}>
        {parts.map((p) => (
          <span key={p.name} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-3 text-xs" style={{ color: "var(--dc-muted)" }}>
        {parts.map((p) => (
          <span key={p.name} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ background: p.color }} /> {p.name} {p.value}
          </span>
        ))}
      </div>
    </div>
  );
}
