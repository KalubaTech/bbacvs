"use client";

// Accreditation scope: what an institution may award, and during which period. Regulators
// (HEA / TEVETA) and ZAQA each maintain their own entries; every entry that is in force in a
// credential's award year must permit the award, so a diploma college issuing a degree, or an
// award dated before the institution was eligible, is blocked at issuance and flagged as
// critical during ZAQA validation.
import { useEffect, useState } from "react";
import { Badge, Modal, ActionBtn, ErrorBanner } from "./kit";

export const AWARD_TYPES = [
  { value: "secondary", label: "Secondary certificate", zqf: "1–4" },
  { value: "other", label: "Certificate / other", zqf: "≤5" },
  { value: "diploma", label: "Diploma", zqf: "6" },
  { value: "degree", label: "Degree", zqf: "7–8" },
  { value: "masters", label: "Master's", zqf: "9" },
  { value: "phd", label: "PhD", zqf: "10" },
];
const TYPE_LABEL = Object.fromEntries(AWARD_TYPES.map((t) => [t.value, t.label]));
const REG_TONE = { HEA: "blue", TEVETA: "orange", ECZ: "green", ZAQA: "teal" };
const yr = (d) => (d ? new Date(d).getFullYear() : null);
const iso = (d) => (d ? new Date(d).toISOString().slice(0, 10) : "");

/** Period + permitted awards in one line, e.g. "2015 – open · Diplomas, Certificates · up to ZQF 6". */
export function describeScope(s) {
  const period = `${yr(s.validFrom) ?? "?"} – ${s.validTo ? yr(s.validTo) : "open"}`;
  const types = s.allowedTypes?.length ? s.allowedTypes.map((t) => TYPE_LABEL[t] || t).join(", ") : "Any award type";
  const level = s.maxZqfLevel != null ? ` · up to ZQF ${s.maxZqfLevel}` : "";
  return `${period} · ${types}${level}`;
}

/** Read-only list of an institution's scope entries, grouped by the authority that set them. */
export function ScopeList({ scopes = [], emptyText = "No scope restrictions recorded — any accredited award is permitted." }) {
  if (!scopes.length) return <div className="py-1 text-[12px] text-slate-400">{emptyText}</div>;
  const groups = {};
  for (const s of scopes) (groups[s.regulator] ||= []).push(s);
  return (
    <div className="space-y-2.5">
      {Object.entries(groups).map(([reg, list]) => (
        <div key={reg}>
          <div className="mb-1 flex items-center gap-2">
            <Badge tone={REG_TONE[reg] || "slate"}>{reg}</Badge>
            <span className="text-[11px] text-slate-400">{list.length} entr{list.length === 1 ? "y" : "ies"}</span>
          </div>
          <ul className="space-y-1">
            {[...list].sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom)).map((s, i) => {
              const now = new Date();
              const active = new Date(s.validFrom) <= now && (!s.validTo || new Date(s.validTo) >= now);
              return (
                <li key={i} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${active ? "bg-emerald-500" : "bg-slate-300"}`} />
                  <span className="min-w-0">
                    {describeScope(s)}
                    {s.note ? <span className="block text-[11.5px] text-slate-400">{s.note}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

function blankEntry() {
  return { allowedTypes: [], maxZqfLevel: "", validFrom: `${new Date().getFullYear()}-01-01`, validTo: "", note: "" };
}

/**
 * Editor for ONE authority's scope entries on an institution. `scopes` is the institution's
 * full list; only entries with `regulator === regulator` are edited here, the rest are shown
 * read-only for context. onSave receives the edited entries for this regulator only.
 */
export function ScopeModal({ open, onClose, institution, regulator, scopes = [], busy, error, onSave }) {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    if (!open) return;
    setRows(scopes.filter((s) => s.regulator === regulator).map((s) => ({
      allowedTypes: s.allowedTypes || [], maxZqfLevel: s.maxZqfLevel ?? "", validFrom: iso(s.validFrom), validTo: iso(s.validTo), note: s.note || "",
    })));
  }, [open, scopes, regulator]);
  const others = scopes.filter((s) => s.regulator !== regulator);

  const update = (i, patch) => setRows((r) => r.map((row, j) => (j === i ? { ...row, ...patch } : row)));
  const toggleType = (i, t) => update(i, { allowedTypes: rows[i].allowedTypes.includes(t) ? rows[i].allowedTypes.filter((x) => x !== t) : [...rows[i].allowedTypes, t] });
  const valid = rows.every((r) => r.validFrom && (!r.validTo || r.validTo >= r.validFrom));

  function save() {
    onSave(rows.map((r) => ({
      allowedTypes: r.allowedTypes,
      maxZqfLevel: r.maxZqfLevel === "" ? null : Number(r.maxZqfLevel),
      validFrom: r.validFrom, validTo: r.validTo || null, note: r.note || "",
    })));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${regulator} accreditation scope — ${institution?.institution || ""}`}
      width="max-w-3xl"
      footer={
        <>
          <ActionBtn tone="outline" onClick={onClose}>Cancel</ActionBtn>
          <ActionBtn tone="navy" disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : `Save ${rows.length} entr${rows.length === 1 ? "y" : "ies"}`}</ActionBtn>
        </>
      }
    >
      <ErrorBanner error={error} />
      <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
        Each entry says what this institution may award and for which period. A credential must fit an entry in force
        in its <span className="font-semibold text-slate-700">award year</span>. Leave the award types empty to allow any type;
        leave the end date empty for an open-ended entry. Add a new entry rather than editing an old one when the scope
        changes, so history stays intact.
      </p>

      {rows.length === 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-[12.5px] text-slate-400">
          No {regulator} restrictions yet — the institution may make any accredited award.
        </div>
      )}
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Valid from *</span>
                <input type="date" className={INPUT} value={r.validFrom} onChange={(e) => update(i, { validFrom: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Valid to <span className="font-normal text-slate-400">(blank = open)</span></span>
                <input type="date" className={INPUT} value={r.validTo} onChange={(e) => update(i, { validTo: e.target.value })} />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Highest ZQF level</span>
                <select className={INPUT} value={r.maxZqfLevel} onChange={(e) => update(i, { maxZqfLevel: e.target.value })}>
                  <option value="">No limit</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </label>
            </div>
            <div className="mt-3">
              <span className="mb-1 block text-[11px] font-semibold text-slate-600">Award types permitted <span className="font-normal text-slate-400">(none ticked = any)</span></span>
              <div className="flex flex-wrap gap-1.5">
                {AWARD_TYPES.map((t) => {
                  const on = r.allowedTypes.includes(t.value);
                  return (
                    <button key={t.value} type="button" onClick={() => toggleType(i, t.value)}
                      className={`rounded-lg border px-2.5 py-1 text-[12px] font-medium transition ${on ? "border-blue-300 bg-blue-50 text-blue-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                      {t.label} <span className="text-[10.5px] text-slate-400">ZQF {t.zqf}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 flex items-end gap-2">
              <label className="block flex-1">
                <span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span>
                <input className={INPUT} value={r.note} placeholder="e.g. Accreditation letter ref HEA/2021/044" onChange={(e) => update(i, { note: e.target.value })} />
              </label>
              <button type="button" onClick={() => setRows((rows) => rows.filter((_, j) => j !== i))} className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px] font-semibold text-red-600 hover:bg-red-50">Remove</button>
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => setRows((r) => [...r, blankEntry()])} className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">
        + Add scope entry
      </button>

      {others.length > 0 && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Set by other authorities (read only)</div>
          <ScopeList scopes={others} />
        </div>
      )}
    </Modal>
  );
}
