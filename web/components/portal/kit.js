import Icon from "./icons";

/* ---------------------------------------------------------------- tones --- */

export const TONES = {
  green: "bg-emerald-100 text-emerald-700",
  softgreen: "bg-emerald-50 text-emerald-600",
  red: "bg-red-100 text-red-700",
  softred: "bg-red-50 text-red-600",
  amber: "bg-amber-100 text-amber-800",
  yellow: "bg-yellow-100 text-yellow-800",
  orange: "bg-orange-100 text-orange-700",
  blue: "bg-blue-100 text-blue-700",
  softblue: "bg-blue-50 text-blue-600",
  indigo: "bg-indigo-100 text-indigo-700",
  purple: "bg-purple-100 text-purple-700",
  violet: "bg-violet-100 text-violet-700",
  teal: "bg-teal-100 text-teal-700",
  cyan: "bg-cyan-100 text-cyan-700",
  pink: "bg-pink-100 text-pink-700",
  slate: "bg-slate-100 text-slate-600",
  dark: "bg-slate-700 text-white",
  outline: "border border-slate-200 bg-white text-slate-600",
};

export function Badge({ tone = "slate", dot, icon, className = "", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${TONES[tone] || TONES.slate} ${className}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {icon && <Icon name={icon} className="h-3 w-3" />}
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- avatar --- */

const AVATAR_BG = [
  "bg-blue-600", "bg-emerald-600", "bg-purple-600", "bg-amber-600",
  "bg-rose-600", "bg-teal-600", "bg-indigo-600", "bg-orange-600",
];

export function Avatar({ name = "", size = "h-8 w-8", className = "" }) {
  const initials = name
    .replace(/[(),.]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 997;
  return (
    <span
      className={`inline-flex ${size} shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${AVATAR_BG[h % AVATAR_BG.length]} ${className}`}
    >
      {initials || "?"}
    </span>
  );
}

export function AvatarName({ name, sub, size = "h-7 w-7" }) {
  return (
    <span className="flex items-center gap-2">
      <Avatar name={name} size={size} />
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-medium text-slate-700">{name}</span>
        {sub && <span className="block truncate text-[11px] text-slate-400">{sub}</span>}
      </span>
    </span>
  );
}

/* ------------------------------------------------------------- stat card --- */

export function StatCard({ icon, iconTone = "softblue", label, value, delta, deltaUp = true, deltaText = "vs last 30 days", sub, className = "" }) {
  return (
    <div className={`min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-card ${className}`}>
      <div className="flex items-center gap-2.5">
        {icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[iconTone]}`}>
            <Icon name={icon} className="h-[18px] w-[18px]" />
          </span>
        )}
        <div className="min-w-0 text-xs font-medium leading-tight text-slate-500">{label}</div>
      </div>
      <div className="mt-2.5 whitespace-nowrap text-2xl font-bold tracking-tight text-slate-900 [font-variant-numeric:tabular-nums]">
        {value}
      </div>
      {delta != null && (
        <div className="mt-1 flex items-center gap-1 whitespace-nowrap text-[11px]">
          <span className={`shrink-0 font-semibold ${deltaUp ? "text-emerald-600" : "text-red-500"}`}>
            {deltaUp ? "↑" : "↓"} {delta}
          </span>
          <span className="truncate text-slate-400">{deltaText}</span>
        </div>
      )}
      {sub && <div className="mt-1 truncate text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

export function StatRow({ children, cols }) {
  const n = cols || (Array.isArray(children) ? children.length : 4);
  const grid = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[Math.min(n, 6)];
  return <div className={`mb-5 grid grid-cols-2 gap-3.5 md:grid-cols-3 ${grid}`}>{children}</div>;
}

/* ----------------------------------------------------------------- cards --- */

export function SectionCard({ title, action, children, className = "", pad = "p-4" }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-card ${className}`}>
      {(title || action) && (
        <div className={`flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3`}>
          <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
          {action}
        </div>
      )}
      <div className={pad}>{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ tabs --- */

export function StatusTabs({ tabs, active, onChange, variant = "underline" }) {
  if (variant === "pill") {
    return (
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tabs.map((tab) => {
          const on = tab.label === active;
          return (
            <button
              key={tab.label}
              onClick={() => onChange?.(tab.label)}
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition ${
                on
                  ? "border-orange-300 bg-orange-50 text-slate-900"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              {tab.label}
              {tab.count != null && (
                <span className={`rounded-full px-1.5 text-[11px] ${on ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const on = tab.label === active;
        return (
          <button
            key={tab.label}
            onClick={() => onChange?.(tab.label)}
            className={`-mb-px flex flex-col items-center gap-1 border-b-2 px-4 py-2 text-[13px] font-medium transition ${
              on ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <span className="whitespace-nowrap">{tab.label}</span>
            {tab.count != null && <span className={`text-base font-bold ${on ? "text-blue-700" : "text-slate-700"}`}>{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabBar({ tabs, active, onChange, accent = "border-blue-600 text-blue-700" }) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200">
      {tabs.map((tab) => {
        const label = typeof tab === "string" ? tab : tab.label;
        const count = typeof tab === "string" ? null : tab.count;
        const on = label === active;
        return (
          <button
            key={label}
            onClick={() => onChange?.(label)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-[13px] font-medium transition ${
              on ? accent : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            {count != null && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-500">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- filters --- */

export function SelectPill({ label, className = "" }) {
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-medium text-slate-600 hover:bg-slate-50 ${className}`}
    >
      {label}
      <Icon name="chevronDown" className="h-3.5 w-3.5 text-slate-400" />
    </button>
  );
}

export function SearchBox({ placeholder = "Search...", value, onChange, className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <Icon name="search" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        placeholder={placeholder}
      />
    </div>
  );
}

export function ToolButton({ icon, children, tone = "outline", className = "", ...props }) {
  const cls =
    tone === "outline"
      ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      : tone;
  return (
    <button {...props} className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-medium ${cls} ${className}`}>
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

/* ----------------------------------------------------------------- table --- */

export function DataTable({ columns, rows, rowKey, activeKey, onRowClick, footer, dense }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50/60">
            {columns.map((c) => (
              <th key={c.key} className={`px-3.5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${c.thClass || ""}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const k = rowKey ? row[rowKey] : i;
            const isActive = activeKey != null && k === activeKey;
            return (
              <tr
                key={k}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`border-b border-slate-100 transition ${onRowClick ? "cursor-pointer" : ""} ${
                  isActive ? "bg-blue-50/60" : "hover:bg-slate-50/70"
                }`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-3.5 ${dense ? "py-2" : "py-3"} text-[13px] text-slate-600 ${c.tdClass || ""}`}>
                    {c.render ? c.render(row) : row[c.key]}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {footer}
    </div>
  );
}

export function Pagination({ summary, page = 1, pages = 1, className = "" }) {
  const nums = [];
  for (let i = 1; i <= Math.min(pages, 5); i++) nums.push(i);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 ${className}`}>
      <span className="text-[12px] text-slate-500">{summary}</span>
      <div className="flex items-center gap-1">
        <PageBtn><Icon name="chevronLeft" className="h-3.5 w-3.5" /></PageBtn>
        {nums.map((n) => (
          <PageBtn key={n} active={n === page}>{n}</PageBtn>
        ))}
        {pages > 6 && (
          <>
            <span className="px-1 text-slate-400">…</span>
            <PageBtn>{pages}</PageBtn>
          </>
        )}
        <PageBtn><Icon name="chevronRight" className="h-3.5 w-3.5" /></PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ active, children }) {
  return (
    <button
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md border px-1.5 text-[12px] font-medium ${
        active ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      }`}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- progress --- */

const BAR_TONES = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  orange: "bg-orange-500",
  red: "bg-red-500",
  blue: "bg-blue-500",
  purple: "bg-purple-500",
  slate: "bg-slate-400",
};

export function ProgressBar({ value = 0, tone, className = "", height = "h-1.5" }) {
  const t = tone || (value >= 90 ? "green" : value >= 70 ? "green" : value >= 50 ? "amber" : "red");
  return (
    <div className={`${height} w-full overflow-hidden rounded-full bg-slate-100 ${className}`}>
      <div className={`${height} rounded-full ${BAR_TONES[t]}`} style={{ width: `${Math.min(100, value)}%` }} />
    </div>
  );
}

/* -------------------------------------------------------------- timeline --- */

const STEP_STATE = {
  done: { dot: "bg-emerald-500 text-white", icon: "check" },
  current: { dot: "bg-blue-600 text-white", icon: null },
  warn: { dot: "bg-amber-500 text-white", icon: null },
  error: { dot: "bg-red-500 text-white", icon: null },
  pending: { dot: "bg-slate-200 text-slate-400", icon: null },
};

export function Timeline({ items }) {
  return (
    <ol className="relative space-y-4">
      {items.map((item, i) => {
        const st = STEP_STATE[item.state || "done"];
        return (
          <li key={i} className="relative flex gap-3">
            {i < items.length - 1 && <span className="absolute left-[9px] top-6 h-full w-px bg-slate-200" />}
            <span className={`relative z-10 mt-0.5 flex h-[19px] w-[19px] shrink-0 items-center justify-center rounded-full ${st.dot}`}>
              {st.icon && <Icon name={st.icon} className="h-2.5 w-2.5" strokeWidth={3} />}
            </span>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[13px] font-semibold text-slate-800">{item.title}</span>
                {item.time && <span className="shrink-0 text-[11px] text-slate-400">{item.time}</span>}
              </div>
              {item.sub && <div className="mt-0.5 text-[12px] text-slate-500">{item.sub}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function WorkflowSteps({ steps }) {
  return (
    <div className="flex items-start">
      {steps.map((s, i) => {
        const st = STEP_STATE[s.state || "pending"];
        return (
          <div key={i} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-px flex-1 ${i === 0 ? "bg-transparent" : "bg-slate-200"}`} />
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${st.dot}`}>
                {s.state === "done" ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span className={`h-px flex-1 ${i === steps.length - 1 ? "bg-transparent" : "bg-slate-200"}`} />
            </div>
            <div className="mt-1.5 text-[11px] font-semibold text-slate-700">{s.label}</div>
            {s.sub && <div className="text-[10px] text-slate-400">{s.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------- key-value --- */

export function KV({ label, value, className = "" }) {
  return (
    <div className={className}>
      <div className="text-[11px] font-medium text-slate-400">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-slate-800">{value}</div>
    </div>
  );
}

const KV_COLS = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-4" };

export function KVGrid({ items, cols = 2, className = "" }) {
  return (
    <div className={`grid ${KV_COLS[cols] || KV_COLS[2]} gap-x-4 gap-y-3 ${className}`}>
      {items.map((it, i) => (
        <KV key={i} label={it.label} value={it.value} />
      ))}
    </div>
  );
}

export function KVRow({ label, value, className = "" }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-1.5 ${className}`}>
      <span className="text-[12px] text-slate-500">{label}</span>
      <span className="text-right text-[12px] font-semibold text-slate-800">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------- checklist --- */

const CHECK_STATES = {
  ok: { cls: "bg-emerald-100 text-emerald-600", icon: "check" },
  warn: { cls: "bg-amber-100 text-amber-600", icon: "clock" },
  missing: { cls: "bg-red-100 text-red-600", icon: "x" },
  pending: { cls: "bg-slate-100 text-slate-400", icon: "clock" },
};

export function CheckItem({ state = "ok", label, meta }) {
  const st = CHECK_STATES[state] || CHECK_STATES.ok;
  return (
    <div className="flex items-center gap-2.5 py-1">
      <span className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${st.cls}`}>
        <Icon name={st.icon} className="h-2.5 w-2.5" strokeWidth={3} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700">{label}</span>
      {meta && <span className="shrink-0 text-[11px] text-slate-400">{meta}</span>}
    </div>
  );
}

/* ------------------------------------------------------- panel primitives --- */

export function PanelHeader({ title, badge, onClose }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2.5">
        <h2 className="text-[15px] font-bold text-slate-900">{title}</h2>
        {badge}
      </div>
      <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
        <Icon name="x" className="h-[18px] w-[18px]" />
      </button>
    </div>
  );
}

const ACTION_TONES = {
  green: "bg-emerald-500 text-white hover:bg-emerald-600",
  darkgreen: "bg-emerald-600 text-white hover:bg-emerald-700",
  blue: "bg-blue-600 text-white hover:bg-blue-700",
  navy: "bg-[#12275c] text-white hover:bg-[#1b3576]",
  red: "bg-red-500 text-white hover:bg-red-600",
  orange: "bg-orange-500 text-white hover:bg-orange-600",
  purple: "bg-violet-500 text-white hover:bg-violet-600",
  softred: "border border-red-200 bg-red-50 text-red-600 hover:bg-red-100",
  softgreen: "border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  softblue: "border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  softorange: "border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100",
  softpurple: "border border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100",
  outline: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
};

export function ActionBtn({ tone = "outline", icon, full, className = "", children, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition ${ACTION_TONES[tone]} ${
        full ? "w-full" : ""
      } ${className}`}
    >
      {icon && <Icon name={icon} className="h-4 w-4" />}
      {children}
    </button>
  );
}

export function Toggle({ on = true, tone = "bg-emerald-500" }) {
  return (
    <span className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? tone : "bg-slate-200"}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </span>
  );
}

export function FileRow({ name, size, verified, icon = "file", tone = "softred" }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[tone]}`}>
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[12.5px] font-medium text-slate-700">{name}</div>
        {size && <div className="text-[11px] text-slate-400">{size}</div>}
      </div>
      {verified != null &&
        (verified ? <Badge tone="green" icon="check">Verified</Badge> : <Icon name="download" className="h-4 w-4 text-slate-400" />)}
    </div>
  );
}
