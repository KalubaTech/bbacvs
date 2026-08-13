"use client";

import { useEffect, useState } from "react";
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

/**
 * Filter pill backed by a real <select>. `options` is an array of strings or
 * {value, label}. When a value is chosen the pill shows "label: value".
 * Without `options`/`onChange` it renders as a static pill (legacy call sites).
 */
export function SelectPill({ label, value, options, onChange, allLabel, className = "" }) {
  const interactive = Array.isArray(options) && options.length > 0;
  const norm = interactive
    ? options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
    : [];
  const current = norm.find((o) => String(o.value) === String(value));
  const display = current && current.value !== "" ? `${label}: ${current.label}` : label;
  return (
    <span className={`relative inline-flex ${className}`}>
      <span
        className={`inline-flex w-full items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-medium ${
          current && current.value !== ""
            ? "border-blue-200 bg-blue-50 text-blue-700"
            : "border-slate-200 bg-white text-slate-600"
        } ${interactive ? "hover:bg-slate-50" : ""}`}
      >
        <span className="truncate">{display}</span>
        <Icon name="chevronDown" className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </span>
      {interactive && (
        <select
          aria-label={label}
          value={value ?? ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        >
          <option value="">{allLabel || `${label}: All`}</option>
          {norm
            .filter((o) => o.value !== "")
            .map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
        </select>
      )}
    </span>
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

export function DataTable({ columns, rows, rowKey, activeKey, onRowClick, footer, dense, loading, emptyText = "No records yet.", minWidth = "min-w-[560px]" }) {
  return (
    <div className="overflow-x-auto">
      <table className={`w-full ${minWidth} border-collapse text-left`}>
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
          {loading &&
            [0, 1, 2, 3, 4].map((i) => (
              <tr key={`skeleton-${i}`} className="border-b border-slate-100">
                {columns.map((c) => (
                  <td key={c.key} className={`px-3.5 ${dense ? "py-2" : "py-3"}`}>
                    <span className="block h-3.5 max-w-[140px] animate-pulse rounded bg-slate-100" />
                  </td>
                ))}
              </tr>
            ))}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3.5 py-10 text-center text-[13px] text-slate-400">
                {emptyText}
              </td>
            </tr>
          )}
          {!loading && rows.map((row, i) => {
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

export function Pagination({ summary, page = 1, pages = 1, onPageChange, className = "" }) {
  // Window of up to 5 page numbers centred on the current page.
  const start = Math.max(1, Math.min(page - 2, pages - 4));
  const nums = [];
  for (let i = start; i <= Math.min(pages, start + 4); i++) nums.push(i);
  const go = (n) => {
    if (n >= 1 && n <= pages && n !== page) onPageChange?.(n);
  };
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 px-3.5 py-3 ${className}`}>
      <span className="text-[12px] text-slate-500">{summary}</span>
      <div className="flex items-center gap-1">
        <PageBtn onClick={() => go(page - 1)} disabled={page <= 1} label="Previous page">
          <Icon name="chevronLeft" className="h-3.5 w-3.5" />
        </PageBtn>
        {start > 1 && (
          <>
            <PageBtn onClick={() => go(1)} label="Page 1">1</PageBtn>
            {start > 2 && <span className="px-1 text-slate-400">…</span>}
          </>
        )}
        {nums.map((n) => (
          <PageBtn key={n} active={n === page} onClick={() => go(n)} label={`Page ${n}`}>{n}</PageBtn>
        ))}
        {nums[nums.length - 1] < pages && (
          <>
            {nums[nums.length - 1] < pages - 1 && <span className="px-1 text-slate-400">…</span>}
            <PageBtn onClick={() => go(pages)} label={`Page ${pages}`}>{pages}</PageBtn>
          </>
        )}
        <PageBtn onClick={() => go(page + 1)} disabled={page >= pages} label="Next page">
          <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </PageBtn>
      </div>
    </div>
  );
}

function PageBtn({ active, disabled, onClick, label, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`flex h-7 min-w-[28px] items-center justify-center rounded-md border px-1.5 text-[12px] font-medium transition ${
        active
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      } ${disabled ? "cursor-not-allowed opacity-40 hover:bg-white" : ""}`}
    >
      {children}
    </button>
  );
}

/**
 * Client-side pagination helper: returns the visible slice plus props for
 * <Pagination>. Usage:
 *   const pg = usePager(filteredRows, 10);
 *   <DataTable rows={pg.rows} footer={<Pagination {...pg.props} />} />
 */
export function usePager(rows, perPage = 10, deps = []) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(page, pages);
  // Reset to page 1 when the row set shrinks below the current page or deps change.
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, ...deps]);
  const startIdx = (current - 1) * perPage;
  const slice = rows.slice(startIdx, startIdx + perPage);
  const summary = rows.length
    ? `Showing ${startIdx + 1}–${startIdx + slice.length} of ${rows.length}`
    : "No records";
  return {
    rows: slice,
    page: current,
    pages,
    props: { summary, page: current, pages, onPageChange: setPage },
  };
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

const KV_COLS = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-2 md:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
};

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
      {onClose && (
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      )}
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

export function Toggle({ on = true, tone = "bg-emerald-500", onChange, disabled, label }) {
  const interactive = !!onChange && !disabled;
  const Tag = onChange ? "button" : "span";
  return (
    <Tag
      {...(onChange
        ? {
            type: "button",
            role: "switch",
            "aria-checked": on,
            "aria-label": label,
            disabled,
            onClick: () => onChange(!on),
          }
        : {})}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition ${on ? tone : "bg-slate-200"} ${
        interactive ? "cursor-pointer" : ""
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${on ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </Tag>
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

/* ----------------------------------------------------------------- modal --- */

export function Modal({ open, onClose, title, badge, footer, width = "max-w-lg", children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-8" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : undefined}>
      <div className="fixed inset-0 bg-slate-900/40" onClick={onClose} />
      <div className={`relative z-10 my-auto w-full ${width} rounded-xl border border-slate-200 bg-white p-5 shadow-xl`}>
        <PanelHeader title={title} badge={badge} onClose={onClose} />
        <div className="max-h-[70vh] overflow-y-auto">{children}</div>
        {footer && <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- error banner --- */

export function ErrorBanner({ error, onRetry, className = "" }) {
  if (!error) return null;
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 ${className}`} role="alert">
      <div className="flex min-w-0 items-start gap-2.5">
        <Icon name="x" className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div className="min-w-0 text-[13px] text-red-700">{String(error)}</div>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="shrink-0 text-[12px] font-semibold text-red-700 underline hover:text-red-800">
          Retry
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- csv export --- */

/**
 * Export table data as CSV. `columns` is [{key, label, csv?}] — `csv(row)`
 * overrides the cell value (use it where `render` returns JSX).
 */
export function exportCSV(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = columns.map((c) => esc(c.label)).join(",");
  const body = rows.map((r) => columns.map((c) => esc(c.csv ? c.csv(r) : r[c.key])).join(",")).join("\n");
  const blob = new Blob([`${head}\n${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
