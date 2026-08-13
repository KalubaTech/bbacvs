// Pure-SVG mini charts for portal dashboards. No external deps.
// Colors are passed in as hex (validated categorical set: #3b82f6 #10b981 #f59e0b #ef4444 #8b5cf6).

export const CHART = {
  blue: "#3b82f6",
  green: "#10b981",
  amber: "#f59e0b",
  red: "#ef4444",
  purple: "#8b5cf6",
  orange: "#f97316",
  slate: "#94a3b8",
  teal: "#14b8a6",
};

/* Donut with center label. segments: [{value, color, label}] */
export function Donut({ segments, size = 150, thickness = 20, centerTitle, centerSub }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = segments.length > 1 ? 2.5 : 0; // px gap between segments
  let offset = -circ / 4; // start at 12 o'clock
  return (
    <div className="relative inline-block w-full" style={{ maxWidth: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="h-auto w-full">
        {segments.map((seg, i) => {
          const len = (seg.value / total) * circ;
          const el = (
            <circle
              key={i}
              cx={c}
              cy={c}
              r={r}
              fill="none"
              stroke={seg.color}
              strokeWidth={thickness}
              strokeDasharray={`${Math.max(len - gap, 0.5)} ${circ - Math.max(len - gap, 0.5)}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            >
              <title>{`${seg.label ?? ""} ${seg.value}`}</title>
            </circle>
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-tight">
        {centerTitle && <span className="text-xl font-bold text-slate-900">{centerTitle}</span>}
        {centerSub && <span className="text-[11px] text-slate-400">{centerSub}</span>}
      </div>
    </div>
  );
}

/* Legend for donuts/lines. items: [{label, color, value}] */
export function Legend({ items, className = "" }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2 text-[12px]">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
          <span className="min-w-0 flex-1 truncate text-slate-600">{it.label}</span>
          {it.value != null && <span className="shrink-0 font-semibold text-slate-800">{it.value}</span>}
        </div>
      ))}
    </div>
  );
}

/* Multi-series line chart. series: [{points: number[], color, label, dashed?, area?}] */
export function LineChart({ series, labels = [], height = 180, max, min = 0, yTicks = 4, className = "" }) {
  const W = 600;
  const H = height;
  const padL = 34;
  const padB = 20;
  const padT = 8;
  const allMax = max ?? (Math.max(...series.flatMap((s) => s.points)) * 1.15 || 1);
  const n = Math.max(...series.map((s) => s.points.length));
  const x = (i) => padL + (i * (W - padL - 8)) / Math.max(n - 1, 1);
  const y = (v) => padT + (H - padT - padB) * (1 - (v - min) / (allMax - min || 1));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} style={{ height }}>
      {[...Array(yTicks + 1)].map((_, i) => {
        const v = min + ((allMax - min) * i) / yTicks;
        return (
          <g key={i}>
            <line x1={padL} x2={W - 8} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
            <text x={padL - 6} y={y(v) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
              {v >= 1000 ? `${Math.round(v / 1000)}K` : Math.round(v)}
            </text>
          </g>
        );
      })}
      {labels.map((lb, i) => (
        <text key={i} x={x(i)} y={H - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">
          {lb}
        </text>
      ))}
      {series.map((s, si) => {
        const pts = s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
        return (
          <g key={si}>
            {s.area && (
              <polygon
                points={`${padL},${y(min)} ${pts} ${x(s.points.length - 1)},${y(min)}`}
                fill={s.color}
                opacity="0.08"
              />
            )}
            <polyline
              points={pts}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? "4 4" : "none"}
            />
            {s.points.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={s.color} stroke="#fff" strokeWidth="1.5">
                <title>{`${s.label ?? ""} ${labels[i] ?? i}: ${v}`}</title>
              </circle>
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/* Grouped bar chart. groups: [{label, values: number[]}], colors aligned to values. */
export function Bars({ groups, colors, height = 170, max, className = "" }) {
  const W = 600;
  const H = height;
  const padL = 34;
  const padB = 20;
  const padT = 8;
  const allMax = max ?? (Math.max(...groups.flatMap((g) => g.values)) * 1.15 || 1);
  const gw = (W - padL - 10) / groups.length;
  const bw = Math.min(14, (gw - 10) / Math.max(colors.length, 1));
  const y = (v) => padT + (H - padT - padB) * (1 - v / allMax);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={`w-full ${className}`} style={{ height }}>
      {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
        <g key={i}>
          <line x1={padL} x2={W - 8} y1={y(allMax * f)} y2={y(allMax * f)} stroke="#f1f5f9" strokeWidth="1" />
          <text x={padL - 6} y={y(allMax * f) + 3} fontSize="9" fill="#94a3b8" textAnchor="end">
            {allMax * f >= 1000 ? `${Math.round((allMax * f) / 1000)}K` : Math.round(allMax * f)}
          </text>
        </g>
      ))}
      {groups.map((g, gi) => {
        const x0 = padL + gi * gw + (gw - bw * g.values.length - 2 * (g.values.length - 1)) / 2;
        return (
          <g key={gi}>
            {g.values.map((v, vi) => (
              <rect
                key={vi}
                x={x0 + vi * (bw + 2)}
                y={y(v)}
                width={bw}
                height={Math.max(H - padB - y(v), 1)}
                rx="3"
                fill={colors[vi]}
              >
                <title>{`${g.label}: ${v}`}</title>
              </rect>
            ))}
            <text x={padL + gi * gw + gw / 2} y={H - 6} fontSize="9" fill="#94a3b8" textAnchor="middle">
              {g.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* Tiny sparkline for stat tiles. */
export function Sparkline({ points, color = CHART.green, width = 90, height = 28 }) {
  const max = Math.max(...points) || 1;
  const min = Math.min(...points);
  const x = (i) => (i * (width - 4)) / (points.length - 1) + 2;
  const y = (v) => 2 + (height - 4) * (1 - (v - min) / (max - min || 1));
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" style={{ maxWidth: width }}>
      <polyline
        points={points.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
