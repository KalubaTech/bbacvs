"use client";

// Programme cycle register: every intake / academic cycle a programme has run since its
// inception, with the courses offered in each. Institutions maintain it; regulators and ZAQA
// read it; validation uses it to confirm a programme was actually running in a credential's
// award year.
import { useEffect, useState } from "react";
import { Badge, Modal, ActionBtn, ErrorBanner } from "./kit";
import { AWARD_TYPES } from "./ScopeEditor";

const TYPE_LABEL = Object.fromEntries(AWARD_TYPES.map((t) => [t.value, t.label]));
const INPUT = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[12.5px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";
const span = (c) => `${c.startYear}${c.endYear == null ? " – ongoing" : c.endYear !== c.startYear ? ` – ${c.endYear}` : ""}`;

/** Read-only register: inception, award type, then each cycle with an expandable course list. */
export function CatalogueView({ programme, compact = false }) {
  const [open, setOpen] = useState(null);
  const cycles = [...(programme?.cycles || [])].sort((a, b) => b.startYear - a.startYear);
  const totalCourses = cycles.reduce((n, c) => n + (c.courses || []).length, 0);
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-slate-600">
        <span><span className="text-slate-400">Award:</span> {TYPE_LABEL[programme?.credentialType] || "Not set"}</span>
        <span><span className="text-slate-400">Since:</span> {programme?.inceptionYear || "Not set"}</span>
        <span><span className="text-slate-400">Cycles:</span> {cycles.length} · {totalCourses} course{totalCourses === 1 ? "" : "s"}</span>
      </div>
      {cycles.length === 0 ? (
        <div className="py-1 text-[12px] text-slate-400">No cycles recorded yet{compact ? "." : " — the award year cannot be checked against this programme."}</div>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {cycles.map((c, i) => {
            const on = open === i;
            return (
              <li key={c.id || i}>
                <button type="button" onClick={() => setOpen(on ? null : i)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-50">
                  <span className="min-w-0 flex-1">
                    <span className="text-[12.5px] font-semibold text-slate-800">{c.label || span(c)}</span>
                    <span className="ml-2 text-[11.5px] text-slate-400">{span(c)}{c.intake ? ` · ${c.intake}` : ""}</span>
                  </span>
                  <Badge tone={c.status === "discontinued" ? "slate" : "green"}>{c.status === "discontinued" ? "Discontinued" : "Offered"}</Badge>
                  <span className="text-[11px] text-slate-400">{(c.courses || []).length} course{(c.courses || []).length === 1 ? "" : "s"}</span>
                  <span className="text-slate-400">{on ? "▾" : "▸"}</span>
                </button>
                {on && (
                  <div className="border-t border-slate-100 bg-slate-50/60 px-3 py-2">
                    {c.note ? <div className="mb-1.5 text-[11.5px] text-slate-500">{c.note}</div> : null}
                    {(c.courses || []).length === 0 ? (
                      <div className="text-[11.5px] text-slate-400">No courses listed for this cycle.</div>
                    ) : (
                      <table className="w-full text-[11.5px]">
                        <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400"><th className="py-1 pr-2">Code</th><th className="py-1 pr-2">Course</th><th className="py-1 pr-2">Year</th><th className="py-1 pr-2">Semester</th><th className="py-1">Credits</th></tr></thead>
                        <tbody>
                          {c.courses.map((k, j) => (
                            <tr key={j} className="border-t border-slate-100 text-slate-700">
                              <td className="py-1 pr-2 font-mono">{k.code || "—"}</td><td className="py-1 pr-2">{k.title}</td>
                              <td className="py-1 pr-2">{k.year ?? "—"}</td><td className="py-1 pr-2">{k.semester || "—"}</td><td className="py-1">{k.credits ?? "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function blankCycle(year) {
  return { label: "", startYear: String(year), endYear: "", intake: "", status: "offered", note: "", courses: [] };
}
function blankCourse() {
  return { code: "", title: "", year: "", semester: "", credits: "" };
}

/** Institution-side editor for the whole register. onSave receives the API payload. */
export function CatalogueModal({ open, onClose, programme, busy, error, onSave }) {
  const [type, setType] = useState("");
  const [inception, setInception] = useState("");
  const [cycles, setCycles] = useState([]);
  const [expanded, setExpanded] = useState(0);

  useEffect(() => {
    if (!open || !programme) return;
    setType(programme.credentialType || "");
    setInception(programme.inceptionYear ? String(programme.inceptionYear) : "");
    setCycles([...(programme.cycles || [])].sort((a, b) => a.startYear - b.startYear).map((c) => ({
      label: c.label || "", startYear: String(c.startYear), endYear: c.endYear == null ? "" : String(c.endYear),
      intake: c.intake || "", status: c.status || "offered", note: c.note || "",
      courses: (c.courses || []).map((k) => ({ code: k.code || "", title: k.title || "", year: k.year ?? "", semester: k.semester || "", credits: k.credits ?? "" })),
    })));
    setExpanded(0);
  }, [open, programme]);

  const upd = (i, patch) => setCycles((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const updCourse = (i, k, patch) => upd(i, { courses: cycles[i].courses.map((c, j) => (j === k ? { ...c, ...patch } : c)) });
  const valid = cycles.every((c) => c.startYear && (!c.endYear || Number(c.endYear) >= Number(c.startYear)) && c.courses.every((k) => k.title.trim()));

  function addCycle() {
    const last = cycles[cycles.length - 1];
    const year = last ? Number(last.endYear || last.startYear) + 1 : Number(inception) || new Date().getFullYear();
    setCycles((cs) => [...cs, blankCycle(year)]);
    setExpanded(cycles.length);
  }
  function copyCourses(i) {
    if (i === 0) return;
    upd(i, { courses: cycles[i - 1].courses.map((k) => ({ ...k })) });
  }
  function save() {
    onSave({
      credentialType: type || null,
      inceptionYear: inception ? Number(inception) : null,
      cycles: cycles.map((c) => ({
        label: c.label.trim(), startYear: Number(c.startYear), endYear: c.endYear === "" ? null : Number(c.endYear),
        intake: c.intake.trim(), status: c.status, note: c.note.trim(),
        courses: c.courses.map((k) => ({
          code: k.code.trim(), title: k.title.trim(), year: k.year === "" ? null : Number(k.year),
          semester: k.semester.trim(), credits: k.credits === "" ? null : Number(k.credits),
        })),
      })),
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cycle register — ${programme?.name || ""}`}
      width="max-w-4xl"
      footer={
        <>
          <ActionBtn tone="outline" onClick={onClose}>Cancel</ActionBtn>
          <ActionBtn tone="blue" disabled={busy || !valid} onClick={save}>{busy ? "Saving…" : "Save register"}</ActionBtn>
        </>
      }
    >
      <ErrorBanner error={error} />
      <p className="mb-3 text-[12px] leading-relaxed text-slate-500">
        Record every cycle this programme has run since it started, with the courses offered in each. ZAQA and your
        regulator read this register, and validation checks that a credential&apos;s award year falls inside a cycle.
      </p>
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Award this programme leads to</span>
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Not set</option>
            {AWARD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-slate-600">Year the programme first ran</span>
          <input type="number" className={INPUT} value={inception} min="1900" max="2100" placeholder="e.g. 2012" onChange={(e) => setInception(e.target.value)} />
        </label>
      </div>

      <div className="space-y-2.5">
        {cycles.map((c, i) => {
          const on = expanded === i;
          return (
            <div key={i} className="rounded-xl border border-slate-200">
              <div className="flex items-center gap-2 px-3 py-2">
                <button type="button" onClick={() => setExpanded(on ? null : i)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="text-slate-400">{on ? "▾" : "▸"}</span>
                  <span className="truncate text-[12.5px] font-semibold text-slate-800">{c.label || (c.startYear ? `${c.startYear}${c.endYear ? `–${c.endYear}` : " – ongoing"}` : "New cycle")}</span>
                  <span className="text-[11px] text-slate-400">{c.courses.length} course{c.courses.length === 1 ? "" : "s"}</span>
                </button>
                <button type="button" onClick={() => setCycles((cs) => cs.filter((_, j) => j !== i))} className="text-[11.5px] font-semibold text-red-600 hover:underline">Remove</button>
              </div>
              {on && (
                <div className="border-t border-slate-100 p-3">
                  <div className="grid gap-3 sm:grid-cols-5">
                    <label className="block sm:col-span-2"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Cycle label</span><input className={INPUT} value={c.label} placeholder="e.g. 2019/2020" onChange={(e) => upd(i, { label: e.target.value })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Start year *</span><input type="number" className={INPUT} value={c.startYear} onChange={(e) => upd(i, { startYear: e.target.value })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">End year <span className="font-normal text-slate-400">(blank = ongoing)</span></span><input type="number" className={INPUT} value={c.endYear} onChange={(e) => upd(i, { endYear: e.target.value })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Status</span><select className={INPUT} value={c.status} onChange={(e) => upd(i, { status: e.target.value })}><option value="offered">Offered</option><option value="discontinued">Discontinued</option></select></label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Intake / mode</span><input className={INPUT} value={c.intake} placeholder="e.g. January intake, full-time" onChange={(e) => upd(i, { intake: e.target.value })} /></label>
                    <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-600">Note</span><input className={INPUT} value={c.note} placeholder="Optional" onChange={(e) => upd(i, { note: e.target.value })} /></label>
                  </div>

                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Courses in this cycle</span>
                    <div className="flex gap-2">
                      {i > 0 && cycles[i - 1].courses.length > 0 && c.courses.length === 0 && (
                        <button type="button" onClick={() => copyCourses(i)} className="text-[11.5px] font-semibold text-blue-600 hover:underline">Copy from previous cycle</button>
                      )}
                      <button type="button" onClick={() => upd(i, { courses: [...c.courses, blankCourse()] })} className="text-[11.5px] font-semibold text-blue-600 hover:underline">+ Add course</button>
                    </div>
                  </div>
                  {c.courses.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[560px] text-[12px]">
                        <thead><tr className="text-left text-[10.5px] uppercase tracking-wide text-slate-400"><th className="pb-1 pr-2 w-28">Code</th><th className="pb-1 pr-2">Course title *</th><th className="pb-1 pr-2 w-16">Year</th><th className="pb-1 pr-2 w-24">Semester</th><th className="pb-1 pr-2 w-20">Credits</th><th className="pb-1 w-8"></th></tr></thead>
                        <tbody>
                          {c.courses.map((k, j) => (
                            <tr key={j}>
                              <td className="py-0.5 pr-2"><input className={INPUT} value={k.code} placeholder="ICT101" onChange={(e) => updCourse(i, j, { code: e.target.value })} /></td>
                              <td className="py-0.5 pr-2"><input className={INPUT} value={k.title} placeholder="Introduction to Programming" onChange={(e) => updCourse(i, j, { title: e.target.value })} /></td>
                              <td className="py-0.5 pr-2"><input type="number" className={INPUT} value={k.year} min="1" max="10" onChange={(e) => updCourse(i, j, { year: e.target.value })} /></td>
                              <td className="py-0.5 pr-2"><input className={INPUT} value={k.semester} placeholder="1" onChange={(e) => updCourse(i, j, { semester: e.target.value })} /></td>
                              <td className="py-0.5 pr-2"><input type="number" className={INPUT} value={k.credits} min="0" onChange={(e) => updCourse(i, j, { credits: e.target.value })} /></td>
                              <td className="py-0.5"><button type="button" onClick={() => upd(i, { courses: c.courses.filter((_, x) => x !== j) })} className="text-slate-400 hover:text-red-600" aria-label="Remove course">✕</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" onClick={addCycle} className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-50">+ Add cycle</button>
    </Modal>
  );
}
