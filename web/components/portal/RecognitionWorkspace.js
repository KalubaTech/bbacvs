"use client";

// Recognition workspace (RPL / credit transfer / progression / foreign qualification /
// micro-credential — spec §12–§13). Two modes:
//   mode="authority": the lead authority's case queue (TEVETA for RPL, ZAQA for the rest;
//     admin sees all) — screening → assessment → explainable NQF-descriptor decision.
//   mode="holder": a learner's own cases — open a case with evidence, follow the timeline,
//     add evidence, withdraw, and read the decision.
// The page wrapper does auth and provides PortalShell; this component receives
// `token` and `role` as props and renders the full workspace body.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, StatusTabs, SelectPill, SearchBox, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, ToolButton, SectionCard,
} from "./kit";
import CaseTimeline from "./CaseTimeline";
import { fmtDate, fmtDateTime } from "./auth";
import { api } from "../../lib/api";

/* ------------------------------------------------------------- metadata --- */

export const CASE_TYPES = {
  rpl: {
    label: "RPL",
    tone: "indigo",
    help: "Recognition of Prior Learning — have skills and knowledge gained through work or informal learning certified against the NQF.",
  },
  credit_transfer: {
    label: "Credit transfer",
    tone: "cyan",
    help: "Transfer credits you earned in one programme toward another registered qualification (CATS).",
  },
  progression: {
    label: "Progression",
    tone: "blue",
    help: "Confirm your eligibility to progress to a qualification at a higher NQF level.",
  },
  foreign_qualification: {
    label: "Foreign qualification",
    tone: "violet",
    help: "Have a qualification obtained outside Zambia evaluated and mapped to the NQF.",
  },
  micro_credential: {
    label: "Micro-credential",
    tone: "pink",
    help: "Recognise a short, focused credential against the national framework.",
  },
};

export const CASE_STATUS = {
  submitted: { label: "Submitted", tone: "blue" },
  screening: { label: "Screening", tone: "amber" },
  assessment: { label: "Assessment", tone: "orange" },
  decision_pending: { label: "Decision pending", tone: "purple" },
  recognised: { label: "Recognised", tone: "green" },
  partially_recognised: { label: "Partially recognised", tone: "teal" },
  not_recognised: { label: "Not recognised", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
};

const OUTCOMES = ["recognised", "partially_recognised", "not_recognised"];
const TERMINAL = [...OUTCOMES, "withdrawn"];
const EVIDENCE_OPEN = ["submitted", "screening", "assessment"];
const MAX_FILE_BYTES = 2 * 1024 * 1024; // keep each upload under ~2MB
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function TypeBadge({ type }) {
  const m = CASE_TYPES[type] || { label: type || "—", tone: "slate" };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function StatusBadge({ status }) {
  const m = CASE_STATUS[status] || { label: status || "—", tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

/* -------------------------------------------------------- form primitives --- */

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

/** Read a File into the API's evidence shape ({base64, name, mime}). */
function readFileAsEvidence(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        base64: String(reader.result).split(",")[1] || "",
        name: file.name,
        mime: file.type || "application/octet-stream",
      });
    reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Shared evidence picker: up to `max` files, each ≤ 2MB, with a description per file. */
function EvidencePicker({ files, setFiles, max = 3, onError }) {
  async function addFiles(e) {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-picking the same file
    for (const f of picked) {
      if (files.length + 1 > max) {
        onError?.(`You can attach at most ${max} documents here.`);
        return;
      }
      if (f.size > MAX_FILE_BYTES) {
        onError?.(`"${f.name}" is larger than 2MB — please upload a smaller file.`);
        continue;
      }
      try {
        const ev = await readFileAsEvidence(f);
        setFiles((prev) => (prev.length >= max ? prev : [...prev, { ...ev, description: "", size: f.size }]));
      } catch (err) {
        onError?.(err.message);
      }
    }
  }
  return (
    <div className="space-y-2">
      {files.map((f, i) => (
        <div key={`${f.name}-${i}`} className="rounded-lg border border-slate-200 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[12.5px] font-medium text-slate-700">{f.name}</span>
            <button
              type="button"
              className="shrink-0 text-[12px] font-semibold text-red-500 hover:text-red-700"
              onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
          <input
            className={`${inputCls} mt-1.5`}
            placeholder="What does this document show? (optional)"
            value={f.description}
            onChange={(e) =>
              setFiles((prev) => prev.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
            }
          />
        </div>
      ))}
      {files.length < max && (
        <label className="flex cursor-pointer items-center justify-center rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[12.5px] font-medium text-slate-500 hover:bg-slate-50">
          <input type="file" className="hidden" multiple onChange={addFiles} />
          + Attach document ({files.length}/{max}, max 2MB each)
        </label>
      )}
    </div>
  );
}

const toEvidenceBody = (files) =>
  files.map((f) => ({ base64: f.base64, name: f.name, mime: f.mime, description: f.description || "" }));

/* ------------------------------------------------ NQF descriptor helpers --- */

function useNqfLevel(level) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let on = true;
    if (!level) {
      setInfo(null);
      setError(null);
      return undefined;
    }
    setLoading(true);
    setError(null);
    api
      .nqfLevel(level)
      .then((res) => on && setInfo(res.level))
      .catch((err) => on && setError(err.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [level]);
  return { info, loading, error };
}

const DESCRIPTOR_DOMAINS = [
  { key: "knowledge", label: "Knowledge" },
  { key: "skills", label: "Skills" },
  { key: "autonomyResponsibility", label: "Autonomy & responsibility" },
];

/* --------------------------------------------------- shared detail parts --- */

function CaseFacts({ kase }) {
  return (
    <KVGrid
      cols={2}
      items={[
        { label: "Case reference", value: <span className="font-mono">{kase.caseRef || "—"}</span> },
        { label: "Type", value: <TypeBadge type={kase.type} /> },
        { label: "Applicant", value: kase.applicantName || kase.applicantEmail || "—" },
        { label: "Applicant email", value: <span className="break-all">{kase.applicantEmail || "—"}</span> },
        { label: "Target qualification", value: kase.targetTitle || kase.targetQualificationRef || "—" },
        { label: "Target NQF level", value: kase.targetNqfLevel != null ? `Level ${kase.targetNqfLevel}` : "—" },
        { label: "Source institution", value: kase.sourceInstitution || "—" },
        { label: "Source country", value: kase.sourceCountry || "Zambia" },
        { label: "Lead authority", value: (kase.leadAuthority || "—").toUpperCase() },
        { label: "Submitted", value: fmtDateTime(kase.createdAt) },
      ]}
    />
  );
}

function EvidenceList({ evidence }) {
  const list = evidence || [];
  if (list.length === 0) {
    return <div className="py-2 text-[12px] text-slate-400">No evidence documents attached.</div>;
  }
  return (
    <ul className="space-y-1.5">
      {list.map((e, i) => (
        <li key={e.cid || i} className="rounded-lg border border-slate-100 px-2.5 py-2">
          <div className="text-[12.5px] font-medium text-slate-700">{e.name}</div>
          {e.description && <div className="text-[11.5px] text-slate-500">{e.description}</div>}
          <div className="mt-0.5 break-all font-mono text-[10.5px] text-slate-400">IPFS {e.cid}</div>
        </li>
      ))}
    </ul>
  );
}

function DecisionBlock({ decision }) {
  if (!decision?.outcome) return null;
  const da = decision.descriptorAnalysis || {};
  return (
    <div className="rounded-lg border border-emerald-100 bg-emerald-50/40 p-3.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] font-bold text-slate-900">Decision</span>
        <StatusBadge status={decision.outcome} />
      </div>
      <div className="mt-3">
        <KVGrid
          cols={3}
          items={[
            { label: "NQF level", value: decision.nqfLevel != null ? `Level ${decision.nqfLevel}` : "—" },
            { label: "Credits awarded", value: decision.creditsAwarded != null ? decision.creditsAwarded : "—" },
            { label: "Mapped qualification", value: decision.mappedQualificationRef || "—" },
          ]}
        />
      </div>
      <div className="mt-3">
        <div className="text-[11px] font-medium text-slate-400">Rationale</div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-700">{decision.rationale || "—"}</p>
      </div>
      {DESCRIPTOR_DOMAINS.some((d) => da[d.key]) && (
        <div className="mt-3 space-y-2">
          {DESCRIPTOR_DOMAINS.map((d) =>
            da[d.key] ? (
              <div key={d.key}>
                <div className="text-[11px] font-medium text-slate-400">{d.label}</div>
                <p className="mt-0.5 text-[12.5px] leading-snug text-slate-700">{da[d.key]}</p>
              </div>
            ) : null
          )}
        </div>
      )}
      <div className="mt-3 border-t border-emerald-100 pt-2 text-[11px] text-slate-500">
        {decision.officer || "—"}
        {decision.policyVersion ? ` · Framework ${decision.policyVersion}` : ""}
        {decision.at ? ` · ${fmtDateTime(decision.at)}` : ""}
      </div>
    </div>
  );
}

/* --------------------------------------------------------- decision form --- */

function DecisionForm({ token, kase, onDone, onCancel }) {
  const [outcome, setOutcome] = useState("recognised");
  const [nqfLevel, setNqfLevel] = useState(kase.targetNqfLevel ? String(kase.targetNqfLevel) : "");
  const [credits, setCredits] = useState("");
  const [mappedRef, setMappedRef] = useState(kase.targetQualificationRef || "");
  const [rationale, setRationale] = useState("");
  const [analysis, setAnalysis] = useState({ knowledge: "", skills: "", autonomyResponsibility: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const level = useNqfLevel(nqfLevel ? parseInt(nqfLevel, 10) : null);

  const rationaleOk = rationale.trim().length >= 10;

  async function submit() {
    if (busy || !rationaleOk) return;
    setBusy(true);
    setError(null);
    const hasAnalysis = DESCRIPTOR_DOMAINS.some((d) => analysis[d.key].trim());
    const body = {
      outcome,
      rationale: rationale.trim(),
      ...(nqfLevel ? { nqfLevel: parseInt(nqfLevel, 10) } : {}),
      ...(credits !== "" && !Number.isNaN(Number(credits)) ? { creditsAwarded: Number(credits) } : {}),
      ...(mappedRef.trim() ? { mappedQualificationRef: mappedRef.trim() } : {}),
      ...(hasAnalysis
        ? {
            descriptorAnalysis: Object.fromEntries(
              DESCRIPTOR_DOMAINS.filter((d) => analysis[d.key].trim()).map((d) => [d.key, analysis[d.key].trim()])
            ),
          }
        : {}),
    };
    try {
      await api.decideRecognitionCase(token, kase._id, body);
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3.5">
      <div className="mb-3 text-[12.5px] font-bold text-slate-900">Record decision</div>
      <ErrorBanner error={error} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Outcome" required>
          <select className={inputCls} value={outcome} onChange={(e) => setOutcome(e.target.value)}>
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>{CASE_STATUS[o].label}</option>
            ))}
          </select>
        </Field>
        <Field label="NQF level" hint="Choosing a level loads its official descriptors below.">
          <select className={inputCls} value={nqfLevel} onChange={(e) => setNqfLevel(e.target.value)}>
            <option value="">Not mapped</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>Level {l}</option>
            ))}
          </select>
        </Field>
        <Field label="Credits awarded">
          <input type="number" min="0" className={inputCls} value={credits} onChange={(e) => setCredits(e.target.value)} placeholder="e.g. 60" />
        </Field>
        <Field label="Mapped qualification ref">
          <input className={inputCls} value={mappedRef} onChange={(e) => setMappedRef(e.target.value)} placeholder="e.g. ZAQA-Q-2026-0001" />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Rationale" required hint={rationaleOk ? "Sent to the applicant and recorded in the case file." : "At least 10 characters."}>
          <textarea rows={3} className={inputCls} value={rationale} onChange={(e) => setRationale(e.target.value)} placeholder="Why this outcome, based on the evidence…" />
        </Field>
      </div>

      <div className="mt-4">
        <div className="text-[12.5px] font-bold text-slate-900">Level descriptor analysis</div>
        {!nqfLevel && (
          <p className="mt-1 text-[12px] text-slate-400">
            Select an NQF level above to compare the evidence against the level&apos;s official descriptors.
          </p>
        )}
        {nqfLevel && level.loading && <p className="mt-1 text-[12px] text-slate-400">Loading level descriptors…</p>}
        {nqfLevel && level.error && <ErrorBanner error={level.error} className="mt-2 mb-0" />}
        {nqfLevel && level.info && (
          <div className="mt-2 space-y-3">
            <div className="text-[12px] font-semibold text-slate-600">{level.info.title || `NQF Level ${nqfLevel}`}</div>
            {DESCRIPTOR_DOMAINS.map((d) => (
              <div key={d.key} className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <div className="rounded-lg bg-slate-50 p-2.5">
                  <div className="text-[11px] font-semibold text-slate-500">{d.label} — level descriptor</div>
                  <p className="mt-1 text-[12px] leading-snug text-slate-600">
                    {level.info.descriptors?.[d.key] || "—"}
                  </p>
                </div>
                <Field label={`${d.label} — how the evidence meets it`}>
                  <textarea
                    rows={3}
                    className={inputCls}
                    value={analysis[d.key]}
                    onChange={(e) => setAnalysis((prev) => ({ ...prev, [d.key]: e.target.value }))}
                    placeholder="Officer analysis…"
                  />
                </Field>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
        <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={onCancel}>
          Cancel
        </ActionBtn>
        <ActionBtn tone="green" disabled={busy || !rationaleOk} className="disabled:opacity-50" onClick={submit}>
          {busy ? "Recording…" : "Submit decision"}
        </ActionBtn>
      </div>
    </div>
  );
}

/* ------------------------------------------------------- authority mode --- */

const AUTHORITY_TABS = [
  { label: "All", match: () => true },
  { label: "Submitted", match: (s) => s === "submitted" },
  { label: "Screening", match: (s) => s === "screening" },
  { label: "Assessment", match: (s) => s === "assessment" },
  { label: "Decision pending", match: (s) => s === "decision_pending" },
  { label: "Decided", match: (s) => OUTCOMES.includes(s) },
  { label: "Withdrawn", match: (s) => s === "withdrawn" },
];

function AuthorityRecognition({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("");
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [deciding, setDeciding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.recognitionQueue(token, typeFilter ? `?type=${typeFilter}` : "");
      const list = res.cases || [];
      setRows(list);
      return list;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token, typeFilter]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const tabs = AUTHORITY_TABS.map((t) => ({ label: t.label, count: rows.filter((c) => t.match(c.status)).length }));

  const filtered = useMemo(() => {
    const t = AUTHORITY_TABS.find((x) => x.label === tab) || AUTHORITY_TABS[0];
    const q = query.trim().toLowerCase();
    return rows.filter((c) => {
      if (!t.match(c.status)) return false;
      if (!q) return true;
      return [c.caseRef, c.applicantName, c.applicantEmail, c.targetTitle, c.targetQualificationRef, c.sourceInstitution]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, tab, query]);

  const pg = usePager(filtered, 10, [tab, query, typeFilter]);

  async function refreshSelected() {
    const fresh = await load();
    if (fresh && selected) {
      const upd = fresh.find((c) => c._id === selected._id);
      if (upd) setSelected(upd);
    }
  }

  async function moveTo(status, note) {
    if (busy || !selected) return;
    setBusy(true);
    setModalError(null);
    try {
      await api.setRecognitionStatus(token, selected._id, status, note);
      await refreshSelected();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: "caseRef", label: "Case", render: (c) => <span className="font-mono text-[12px]">{c.caseRef}</span> },
    { key: "type", label: "Type", render: (c) => <TypeBadge type={c.type} /> },
    {
      key: "applicantName",
      label: "Applicant",
      render: (c) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate font-medium text-slate-700">{c.applicantName || "—"}</span>
          <span className="block truncate text-[11px] text-slate-400">{c.applicantEmail}</span>
        </span>
      ),
    },
    {
      key: "targetTitle",
      label: "Target",
      render: (c) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate">{c.targetTitle || c.targetQualificationRef || "—"}</span>
          {c.targetNqfLevel != null && <span className="block text-[11px] text-slate-400">NQF Level {c.targetNqfLevel}</span>}
        </span>
      ),
    },
    { key: "createdAt", label: "Submitted", render: (c) => fmtDate(c.createdAt) },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
  ];

  const st = selected?.status;

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Search case ref, applicant or target…" className="w-full sm:w-72" />
        <SelectPill
          label="Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={Object.entries(CASE_TYPES).map(([value, m]) => ({ value, label: m.label }))}
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="_id"
          minWidth="min-w-[720px]"
          loading={loading}
          onRowClick={(c) => { setSelected(c); setDeciding(false); setModalError(null); }}
          emptyText="No recognition cases in your queue yet — learner applications land here automatically."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Case ${selected.caseRef || ""}` : "Case"}
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
        footer={
          selected && !deciding ? (
            <>
              {st === "submitted" && (
                <ActionBtn tone="blue" disabled={busy} className="disabled:opacity-50" onClick={() => moveTo("screening")}>
                  {busy ? "Working…" : "Begin screening"}
                </ActionBtn>
              )}
              {st === "screening" && (
                <ActionBtn tone="blue" disabled={busy} className="disabled:opacity-50" onClick={() => moveTo("assessment")}>
                  {busy ? "Working…" : "Move to assessment"}
                </ActionBtn>
              )}
              {st === "assessment" && (
                <>
                  <ActionBtn tone="softorange" disabled={busy} className="disabled:opacity-50" onClick={() => moveTo("screening", "Returned to screening")}>
                    {busy ? "Working…" : "Send back to screening"}
                  </ActionBtn>
                  <ActionBtn tone="softpurple" disabled={busy} className="disabled:opacity-50" onClick={() => moveTo("decision_pending")}>
                    {busy ? "Working…" : "Ready for decision"}
                  </ActionBtn>
                </>
              )}
              {(st === "assessment" || st === "decision_pending") && (
                <ActionBtn tone="green" disabled={busy} className="disabled:opacity-50" onClick={() => setDeciding(true)}>
                  Record decision
                </ActionBtn>
              )}
              {TERMINAL.includes(st) && <span className="text-[12px] text-slate-400">This case is closed — read-only.</span>}
            </>
          ) : null
        }
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <CaseFacts kase={selected} />
            <div>
              <div className="text-[11px] font-medium text-slate-400">Prior learning / source description</div>
              <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px] leading-snug text-slate-700">
                {selected.sourceDescription || "—"}
              </p>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-slate-900">Evidence ({(selected.evidence || []).length})</div>
              <EvidenceList evidence={selected.evidence} />
            </div>
            <DecisionBlock decision={selected.decision} />
            {deciding && (
              <DecisionForm
                token={token}
                kase={selected}
                onCancel={() => setDeciding(false)}
                onDone={async () => {
                  await refreshSelected();
                  setDeciding(false);
                }}
              />
            )}
            <div>
              <div className="mb-2 text-[12px] font-bold text-slate-900">Case history</div>
              <CaseTimeline events={selected.events} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- holder mode --- */

function NewCaseForm({ token, onDone, onCancel }) {
  const [type, setType] = useState("rpl");
  const [targetRef, setTargetRef] = useState("");
  const [targetTitle, setTargetTitle] = useState("");
  const [targetLevel, setTargetLevel] = useState("");
  const [sourceDescription, setSourceDescription] = useState("");
  const [sourceCountry, setSourceCountry] = useState("");
  const [sourceInstitution, setSourceInstitution] = useState("");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const foreign = type === "foreign_qualification";
  const descOk = sourceDescription.trim().length >= 10;
  const canSubmit = descOk && (!foreign || sourceCountry.trim()) && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const body = {
      type,
      sourceDescription: sourceDescription.trim(),
      ...(targetRef.trim() ? { targetQualificationRef: targetRef.trim() } : {}),
      ...(targetTitle.trim() ? { targetTitle: targetTitle.trim() } : {}),
      ...(targetLevel ? { targetNqfLevel: parseInt(targetLevel, 10) } : {}),
      ...(sourceCountry.trim() ? { sourceCountry: sourceCountry.trim() } : {}),
      ...(sourceInstitution.trim() ? { sourceInstitution: sourceInstitution.trim() } : {}),
      ...(files.length ? { evidence: toEvidenceBody(files) } : {}),
    };
    try {
      await api.createRecognitionCase(token, body);
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <>
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <Field label="Type of recognition" required hint={CASE_TYPES[type]?.help}>
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(CASE_TYPES).map(([k, m]) => (
              <option key={k} value={k}>{m.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Target qualification ref" hint="National reference ID, if you know it (e.g. ZAQA-Q-2026-0001).">
            <input className={inputCls} value={targetRef} onChange={(e) => setTargetRef(e.target.value)} placeholder="Optional" />
          </Field>
          <Field label="Target NQF level">
            <select className={inputCls} value={targetLevel} onChange={(e) => setTargetLevel(e.target.value)}>
              <option value="">Not sure</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Target qualification title">
          <input className={inputCls} value={targetTitle} onChange={(e) => setTargetTitle(e.target.value)} placeholder="e.g. Diploma in Electrical Engineering" />
        </Field>
        <Field
          label="Describe your prior learning / qualification"
          required
          hint={descOk ? "This is what the assessing officer reads first." : "At least 10 characters."}
        >
          <textarea
            rows={4}
            className={inputCls}
            value={sourceDescription}
            onChange={(e) => setSourceDescription(e.target.value)}
            placeholder="What did you learn or earn, where, over what period, and what can you do as a result?"
          />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Country obtained" required={foreign} hint={foreign ? "Required for foreign qualification evaluations." : undefined}>
            <input className={inputCls} value={sourceCountry} onChange={(e) => setSourceCountry(e.target.value)} placeholder={foreign ? "e.g. South Africa" : "Optional"} />
          </Field>
          <Field label="Institution / provider">
            <input className={inputCls} value={sourceInstitution} onChange={(e) => setSourceInstitution(e.target.value)} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Evidence documents" hint="Certificates, transcripts, portfolios, reference letters…">
          <EvidencePicker files={files} setFiles={setFiles} max={3} onError={setError} />
        </Field>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={onCancel}>
            Cancel
          </ActionBtn>
          <ActionBtn tone="blue" disabled={!canSubmit} className="disabled:opacity-50" onClick={submit}>
            {busy ? "Submitting…" : "Submit case"}
          </ActionBtn>
        </div>
      </div>
    </>
  );
}

function HolderRecognition({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState(null);
  const [addingEvidence, setAddingEvidence] = useState(false);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.myRecognitionCases(token);
      const list = res.cases || [];
      setRows(list);
      return list;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const pg = usePager(rows, 10);

  async function refreshSelected() {
    const fresh = await load();
    if (fresh && selected) {
      const upd = fresh.find((c) => c._id === selected._id);
      if (upd) setSelected(upd);
    }
  }

  async function submitEvidence() {
    if (busy || files.length === 0 || !selected) return;
    setBusy(true);
    setModalError(null);
    try {
      await api.addRecognitionEvidence(token, selected._id, { evidence: toEvidenceBody(files) });
      await refreshSelected();
      setAddingEvidence(false);
      setFiles([]);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (busy || !selected) return;
    if (!confirm(`Withdraw case ${selected.caseRef}? This closes the case permanently.`)) return;
    setBusy(true);
    setModalError(null);
    try {
      await api.withdrawRecognitionCase(token, selected._id);
      await refreshSelected();
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: "caseRef", label: "Case", render: (c) => <span className="font-mono text-[12px]">{c.caseRef}</span> },
    { key: "type", label: "Type", render: (c) => <TypeBadge type={c.type} /> },
    {
      key: "targetTitle",
      label: "Target",
      render: (c) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate">{c.targetTitle || c.targetQualificationRef || "—"}</span>
          {c.targetNqfLevel != null && <span className="block text-[11px] text-slate-400">NQF Level {c.targetNqfLevel}</span>}
        </span>
      ),
    },
    { key: "createdAt", label: "Submitted", render: (c) => fmtDate(c.createdAt) },
    { key: "status", label: "Status", render: (c) => <StatusBadge status={c.status} /> },
  ];

  const st = selected?.status;
  const canAddEvidence = EVIDENCE_OPEN.includes(st);
  const canWithdraw = st && !TERMINAL.includes(st);

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[13px] text-slate-500">
          {rows.length
            ? `You have ${rows.length} recognition case${rows.length > 1 ? "s" : ""}.`
            : "Apply to have prior learning, credits or foreign qualifications recognised against the NQF."}
        </div>
        <ToolButton
          icon="award"
          tone="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          onClick={() => setCreating(true)}
        >
          New recognition case
        </ToolButton>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="_id"
          loading={loading}
          onRowClick={(c) => { setSelected(c); setAddingEvidence(false); setFiles([]); setModalError(null); }}
          emptyText="No recognition cases yet. Start one with “New recognition case”."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal open={creating} onClose={() => setCreating(false)} title="New recognition case" width="max-w-xl">
        {creating && (
          <NewCaseForm
            token={token}
            onCancel={() => setCreating(false)}
            onDone={async () => {
              await load();
              setCreating(false);
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `Case ${selected.caseRef || ""}` : "Case"}
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
        footer={
          selected ? (
            addingEvidence ? (
              <>
                <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={() => { setAddingEvidence(false); setFiles([]); }}>
                  Cancel
                </ActionBtn>
                <ActionBtn tone="blue" disabled={busy || files.length === 0} className="disabled:opacity-50" onClick={submitEvidence}>
                  {busy ? "Uploading…" : `Add ${files.length || ""} document${files.length === 1 ? "" : "s"}`}
                </ActionBtn>
              </>
            ) : (
              <>
                {canAddEvidence && (
                  <ActionBtn tone="softblue" disabled={busy} className="disabled:opacity-50" onClick={() => setAddingEvidence(true)}>
                    Add evidence
                  </ActionBtn>
                )}
                {canWithdraw && (
                  <ActionBtn tone="softred" disabled={busy} className="disabled:opacity-50" onClick={withdraw}>
                    {busy ? "Working…" : "Withdraw"}
                  </ActionBtn>
                )}
                {TERMINAL.includes(st) && <span className="text-[12px] text-slate-400">This case is closed.</span>}
              </>
            )
          ) : null
        }
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <CaseFacts kase={selected} />
            <div>
              <div className="text-[11px] font-medium text-slate-400">Your description</div>
              <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px] leading-snug text-slate-700">
                {selected.sourceDescription || "—"}
              </p>
            </div>
            <div>
              <div className="mb-1.5 text-[12px] font-bold text-slate-900">Evidence ({(selected.evidence || []).length})</div>
              <EvidenceList evidence={selected.evidence} />
            </div>
            {addingEvidence && (
              <SectionCard title="Add evidence" pad="p-3.5">
                <EvidencePicker files={files} setFiles={setFiles} max={3} onError={setModalError} />
              </SectionCard>
            )}
            <DecisionBlock decision={selected.decision} />
            <div>
              <div className="mb-2 text-[12px] font-bold text-slate-900">Case history</div>
              <CaseTimeline events={selected.events} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- export --- */

export default function RecognitionWorkspace({ token, role, mode = "authority" }) {
  if (mode === "holder") return <HolderRecognition token={token} />;
  return <AuthorityRecognition token={token} role={role} />;
}
