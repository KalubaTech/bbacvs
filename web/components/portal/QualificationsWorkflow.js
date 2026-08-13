"use client";

// National qualification registration workflow (spec §5, §7) — three modes:
//   mode="issuer": an institution proposes qualification designs and tracks them.
//   mode="authority": the sub-framework authority (HEA / TEVETA / ECZ) reviews proposals
//     and recommends them to ZAQA (or rejects them).
//   mode="zaqa": ZAQA takes the national registration decision, and manages the register —
//     amendments (new versions), lifecycle decisions and the full version history.
// The page wrapper does auth and provides PortalShell; this component receives
// `token` and `role` as props and renders the full workspace body.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, TabBar, SearchBox, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, ToolButton, WorkflowSteps, SectionCard,
} from "./kit";
import CaseTimeline from "./CaseTimeline";
import { fmtDate } from "./auth";
import { api } from "../../lib/api";

/* ------------------------------------------------------------- metadata --- */

export const QUAL_STATUS = {
  draft: { label: "Draft", tone: "slate" },
  submitted: { label: "Proposed", tone: "blue" },
  under_review: { label: "Recommended", tone: "amber" },
  registered: { label: "Registered", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspended: { label: "Suspended", tone: "orange" },
  expired: { label: "Expired", tone: "slate" },
  deregistered: { label: "Deregistered", tone: "dark" },
  superseded: { label: "Superseded", tone: "slate" },
};

const TYPE_LABEL = { full: "Full qualification", part: "Part qualification", micro_credential: "Micro-credential" };
const SUBFRAMEWORK_LABEL = { general: "General Education", tevet: "TEVET", higher_ed: "Higher Education" };
const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function StatusBadge({ status }) {
  const m = QUAL_STATUS[status] || { label: status || "—", tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

/** proposed → recommended → registered strip, mapped from the record's status. */
function stepsFor(status) {
  const steps = (a, b, c, subC) => [
    { label: "Proposed", state: a },
    { label: "Recommended", state: b },
    { label: "Registered", state: c, sub: subC },
  ];
  if (status === "draft" || status === "submitted") return steps("current", "pending", "pending");
  if (status === "under_review") return steps("done", "current", "pending");
  if (status === "rejected") return steps("done", "error", "pending", "Rejected");
  // registered + post-registration lifecycle states
  const sub = status === "registered" ? undefined : QUAL_STATUS[status]?.label || status;
  return steps("done", "done", "done", sub);
}

const submittedAt = (q) => q.events?.[0]?.at || q.registrationDate || null;

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

const splitLines = (text) => text.split("\n").map((s) => s.trim()).filter(Boolean);

/* ------------------------------------------------ NQF descriptor helper --- */

// Read-only display of a level's official descriptors so the reviewer can judge
// whether the proposed level fits the design.
function LevelDescriptors({ level }) {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  useEffect(() => {
    let on = true;
    if (!level) {
      setInfo(null);
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

  if (!level) return null;
  return (
    <SectionCard title={`NQF Level ${level} descriptors`} pad="p-3.5">
      {loading && <p className="text-[12px] text-slate-400">Loading descriptors…</p>}
      {error && <ErrorBanner error={error} className="mb-0" />}
      {info && (
        <div className="space-y-2.5">
          <div className="text-[12px] font-semibold text-slate-600">{info.title || `Level ${level}`}</div>
          {[
            { key: "knowledge", label: "Knowledge" },
            { key: "skills", label: "Skills" },
            { key: "autonomyResponsibility", label: "Autonomy & responsibility" },
          ].map((d) => (
            <div key={d.key} className="rounded-lg bg-slate-50 p-2.5">
              <div className="text-[11px] font-semibold text-slate-500">{d.label}</div>
              <p className="mt-0.5 text-[12px] leading-snug text-slate-600">{info.descriptors?.[d.key] || "—"}</p>
            </div>
          ))}
          {(info.typicalQualifications || []).length > 0 && (
            <div className="text-[11.5px] text-slate-500">
              <span className="font-semibold">Typical qualifications:</span> {info.typicalQualifications.join(", ")}
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
}

/* --------------------------------------------------- shared detail parts --- */

function QualificationFacts({ q }) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-4">
        <WorkflowSteps steps={stepsFor(q.status)} />
      </div>
      <KVGrid
        cols={2}
        items={[
          { label: "Title", value: q.title || "—" },
          { label: "Status", value: <StatusBadge status={q.status} /> },
          { label: "Type", value: TYPE_LABEL[q.qualificationType] || q.qualificationType || "—" },
          { label: "NQF level", value: q.nqfLevel != null ? `Level ${q.nqfLevel}` : "—" },
          { label: "Sub-framework", value: SUBFRAMEWORK_LABEL[q.subFramework] || q.subFramework || "—" },
          { label: "Awarding body", value: q.awardingBody || "—" },
          { label: "Field of education", value: q.fieldOfEducation || "—" },
          { label: "Credit value", value: q.creditValue != null ? q.creditValue : "—" },
          { label: "Reference ID", value: q.referenceId || "Assigned at registration" },
          { label: "Version", value: `v${q.qualificationVersion || 1}` },
          { label: "Framework", value: q.frameworkVersion || "—" },
          { label: "Registered", value: q.registrationDate ? fmtDate(q.registrationDate) : "—" },
        ]}
      />
      {q.purpose && (
        <div>
          <div className="text-[11px] font-medium text-slate-400">Purpose</div>
          <p className="mt-1 text-[12.5px] leading-snug text-slate-700">{q.purpose}</p>
        </div>
      )}
      {(q.learningOutcomes || []).length > 0 && (
        <div>
          <div className="text-[11px] font-medium text-slate-400">Learning outcomes</div>
          <ul className="mt-1 space-y-1">
            {q.learningOutcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-[12.5px] text-slate-700">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500" />
                {o}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ issuer mode --- */

function ProposeForm({ token, onDone, onCancel }) {
  const [title, setTitle] = useState("");
  const [qualificationType, setQualificationType] = useState("full");
  const [nqfLevel, setNqfLevel] = useState("");
  const [fieldOfEducation, setFieldOfEducation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [outcomesText, setOutcomesText] = useState("");
  const [creditValue, setCreditValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const titleOk = title.trim().length >= 3;
  const canSubmit = titleOk && nqfLevel && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const body = {
      title: title.trim(),
      qualificationType,
      nqfLevel: parseInt(nqfLevel, 10),
      ...(fieldOfEducation.trim() ? { fieldOfEducation: fieldOfEducation.trim() } : {}),
      ...(purpose.trim() ? { purpose: purpose.trim() } : {}),
      learningOutcomes: splitLines(outcomesText),
      ...(creditValue !== "" && Number(creditValue) >= 1 ? { creditValue: parseInt(creditValue, 10) } : {}),
    };
    try {
      await api.proposeQualification(token, body);
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
        <Field label="Qualification title" required hint={titleOk ? undefined : "At least 3 characters."}>
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Bachelor of Science in Computer Science" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Qualification type" required>
            <select className={inputCls} value={qualificationType} onChange={(e) => setQualificationType(e.target.value)}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Proposed NQF level" required hint="The authority and ZAQA confirm or correct the level.">
            <select className={inputCls} value={nqfLevel} onChange={(e) => setNqfLevel(e.target.value)}>
              <option value="">Select level…</option>
              {LEVELS.map((l) => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </select>
          </Field>
          <Field label="Field of education">
            <input className={inputCls} value={fieldOfEducation} onChange={(e) => setFieldOfEducation(e.target.value)} placeholder="e.g. Information and Communication Technologies" />
          </Field>
          <Field label="Credit value">
            <input type="number" min="1" className={inputCls} value={creditValue} onChange={(e) => setCreditValue(e.target.value)} placeholder="e.g. 480" />
          </Field>
        </div>
        <Field label="Purpose">
          <textarea rows={3} className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What the qualification is for and who it serves…" />
        </Field>
        <Field label="Learning outcomes" hint="One outcome per line.">
          <textarea rows={4} className={inputCls} value={outcomesText} onChange={(e) => setOutcomesText(e.target.value)} placeholder={"Design and implement software systems\nApply computational thinking to real problems"} />
        </Field>
        <p className="text-[11px] text-slate-400">
          The sub-framework and awarding body are taken from your institution&apos;s record — proposals route
          automatically to your regulator (HEA, TEVETA or ECZ) and then to ZAQA for national registration.
        </p>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={onCancel}>
            Cancel
          </ActionBtn>
          <ActionBtn tone="blue" disabled={!canSubmit} className="disabled:opacity-50" onClick={submit}>
            {busy ? "Submitting…" : "Submit proposal"}
          </ActionBtn>
        </div>
      </div>
    </>
  );
}

function IssuerQualifications({ token }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [proposing, setProposing] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.myQualifications(token);
      setRows(res.qualifications || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const pg = usePager(rows, 10);

  const columns = [
    { key: "title", label: "Title", render: (q) => <span className="font-medium text-slate-700">{q.title}</span> },
    { key: "qualificationType", label: "Type", render: (q) => TYPE_LABEL[q.qualificationType] || q.qualificationType },
    { key: "nqfLevel", label: "Proposed level", render: (q) => (q.nqfLevel != null ? `Level ${q.nqfLevel}` : "—") },
    { key: "status", label: "Status", render: (q) => <StatusBadge status={q.status} /> },
    { key: "submitted", label: "Submitted", render: (q) => fmtDate(submittedAt(q)) },
  ];

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[13px] text-slate-500">
          {rows.length
            ? `${rows.length} qualification design${rows.length > 1 ? "s" : ""} proposed by your institution.`
            : "Propose a qualification design for review by your regulator and national registration by ZAQA."}
        </div>
        <ToolButton
          icon="plus"
          tone="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          onClick={() => setProposing(true)}
        >
          Propose qualification
        </ToolButton>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="id"
          loading={loading}
          onRowClick={setSelected}
          emptyText="No proposals yet. Use “Propose qualification” to submit your first design."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal open={proposing} onClose={() => setProposing(false)} title="Propose a qualification" width="max-w-xl">
        {proposing && (
          <ProposeForm
            token={token}
            onCancel={() => setProposing(false)}
            onDone={async () => {
              await load();
              setProposing(false);
            }}
          />
        )}
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title || "Qualification"}
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
      >
        {selected && (
          <div className="space-y-4">
            <QualificationFacts q={selected} />
            <div>
              <div className="mb-2 text-[12px] font-bold text-slate-900">History</div>
              <CaseTimeline events={selected.events} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* --------------------------------------- authority / ZAQA inbox (shared) --- */

function InboxView({ token, zaqa }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null); // "recommend" | "reject" | "register"
  const [note, setNote] = useState("");
  const [regLevel, setRegLevel] = useState("");
  const [regYears, setRegYears] = useState("5");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.qualificationInbox(token);
      const list = res.qualifications || [];
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.title, r.awardingBody, r.fieldOfEducation].some((v) => String(v || "").toLowerCase().includes(q))
    );
  }, [rows, query]);

  const pg = usePager(filtered, 10, [query]);

  function openDetail(q) {
    setSelected(q);
    setForm(null);
    setNote("");
    setRegLevel(q.nqfLevel != null ? String(q.nqfLevel) : "");
    setRegYears("5");
    setModalError(null);
  }

  async function run(fn, { close = false } = {}) {
    if (busy) return;
    setBusy(true);
    setModalError(null);
    try {
      await fn();
      const fresh = await load();
      if (close) {
        setSelected(null);
      } else if (fresh && selected) {
        const upd = fresh.find((r) => r.id === selected.id);
        setSelected(upd || null); // decided items leave the inbox
      }
      setForm(null);
      setNote("");
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: "title", label: "Title", render: (q) => <span className="font-medium text-slate-700">{q.title}</span> },
    { key: "awardingBody", label: "Awarding body" },
    { key: "qualificationType", label: "Type", render: (q) => TYPE_LABEL[q.qualificationType] || q.qualificationType },
    { key: "nqfLevel", label: "Proposed level", render: (q) => (q.nqfLevel != null ? `Level ${q.nqfLevel}` : "—") },
    { key: "status", label: "Status", render: (q) => <StatusBadge status={q.status} /> },
    { key: "submitted", label: "Submitted", render: (q) => fmtDate(submittedAt(q)) },
  ];

  const st = selected?.status;
  const noteOk = form !== "reject" || note.trim().length >= 3;

  const FORM_COPY = {
    recommend: { title: "Recommend to ZAQA", cta: "Confirm recommendation", tone: "green", required: false, hint: "Optional note — appended to the proposal's history." },
    reject: { title: "Reject this proposal", cta: "Confirm rejection", tone: "red", required: true, hint: "Required — the reason is sent to the proposing institution." },
    register: { title: "Register nationally", cta: "Register qualification", tone: "green", required: false, hint: "Optional note. Registration assigns the national reference ID and anchors the fingerprint." },
  };

  function confirmForm() {
    if (!selected) return;
    if (form === "recommend") run(() => api.recommendQualification(token, selected.id, note.trim()));
    else if (form === "reject") run(() => api.rejectQualification(token, selected.id, note.trim()));
    else if (form === "register")
      run(() =>
        api.registerQualification(token, selected.id, {
          ...(regLevel ? { nqfLevel: parseInt(regLevel, 10) } : {}),
          validityYears: Math.min(10, Math.max(1, parseInt(regYears, 10) || 5)),
          ...(note.trim() ? { note: note.trim() } : {}),
        })
      );
  }

  const footer = !selected ? null : form ? (
    <>
      <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={() => { setForm(null); setNote(""); setModalError(null); }}>
        Cancel
      </ActionBtn>
      <ActionBtn tone={FORM_COPY[form].tone} disabled={busy || !noteOk} className="disabled:opacity-50" onClick={confirmForm}>
        {busy ? "Working…" : FORM_COPY[form].cta}
      </ActionBtn>
    </>
  ) : (
    <>
      {!zaqa && st === "submitted" && (
        <ActionBtn tone="green" disabled={busy} className="disabled:opacity-50" onClick={() => setForm("recommend")}>
          Recommend
        </ActionBtn>
      )}
      {!zaqa && st === "under_review" && (
        <span className="text-[12px] text-slate-400">Recommended — awaiting the ZAQA registration decision.</span>
      )}
      {zaqa && st === "under_review" && (
        <ActionBtn tone="green" disabled={busy} className="disabled:opacity-50" onClick={() => setForm("register")}>
          Register
        </ActionBtn>
      )}
      {zaqa && st === "submitted" && (
        <span className="text-[12px] text-slate-400">Awaiting the sub-framework authority&apos;s recommendation.</span>
      )}
      {["submitted", "under_review"].includes(st) && (
        <ActionBtn tone="softred" disabled={busy} className="disabled:opacity-50" onClick={() => setForm("reject")}>
          Reject
        </ActionBtn>
      )}
    </>
  );

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox value={query} onChange={setQuery} placeholder="Search title, institution or field…" className="w-full sm:w-80" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="id"
          minWidth="min-w-[720px]"
          loading={loading}
          onRowClick={openDetail}
          emptyText={
            zaqa
              ? "No proposals awaiting a decision. Recommended proposals appear here for national registration."
              : "No qualification proposals in your inbox — institutions in your sub-framework submit them here."
          }
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title || "Proposal"}
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
        footer={footer}
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <QualificationFacts q={selected} />
            <LevelDescriptors level={selected.nqfLevel} />
            {form === "register" && (
              <div className="rounded-lg border border-slate-200 p-3.5">
                <div className="mb-2 text-[12.5px] font-bold text-slate-900">Registration decision</div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Final NQF level" hint="ZAQA may correct the proposed level.">
                    <select className={inputCls} value={regLevel} onChange={(e) => setRegLevel(e.target.value)}>
                      {LEVELS.map((l) => (
                        <option key={l} value={l}>Level {l}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Validity (years)">
                    <input type="number" min="1" max="10" className={inputCls} value={regYears} onChange={(e) => setRegYears(e.target.value)} />
                  </Field>
                </div>
                <div className="mt-3">
                  <Field label="Note" hint={FORM_COPY.register.hint}>
                    <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </div>
              </div>
            )}
            {(form === "recommend" || form === "reject") && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1.5 text-[12.5px] font-bold text-slate-900">{FORM_COPY[form].title}</div>
                <textarea
                  rows={3}
                  className={inputCls}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={form === "reject" ? "Reason for rejection…" : "Optional note…"}
                />
                <div className="mt-1 text-[11px] text-slate-400">{FORM_COPY[form].hint}</div>
              </div>
            )}
            <div>
              <div className="mb-2 text-[12px] font-bold text-slate-900">History</div>
              <CaseTimeline events={selected.events} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------ ZAQA registered register --- */

function AmendForm({ token, row, onDone, onCancel }) {
  const [title, setTitle] = useState(row.title || "");
  const [outcomesText, setOutcomesText] = useState("");
  const [creditValue, setCreditValue] = useState(row.creditValue != null ? String(row.creditValue) : "");
  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  function buildChanges() {
    const changes = {};
    if (title.trim() && title.trim() !== row.title) changes.title = title.trim();
    if (outcomesText.trim()) changes.learningOutcomes = splitLines(outcomesText);
    if (creditValue !== "" && Number(creditValue) >= 1 && Number(creditValue) !== row.creditValue) {
      changes.creditValue = parseInt(creditValue, 10);
    }
    if (purpose.trim()) changes.purpose = purpose.trim();
    return changes;
  }

  const changes = buildChanges();
  const canSubmit = Object.keys(changes).length > 0 && note.trim().length >= 3 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.amendQualification(token, row.id, changes, note.trim());
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
        <p className="text-[12px] leading-snug text-slate-500">
          Amending creates a new version of <span className="font-semibold">{row.referenceId}</span> — the current
          version is preserved and marked superseded. Leave a field blank to keep its current value.
        </p>
        <Field label="Title">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Credit value">
            <input type="number" min="1" className={inputCls} value={creditValue} onChange={(e) => setCreditValue(e.target.value)} />
          </Field>
        </div>
        <Field label="Learning outcomes" hint="One per line — replaces the current list when filled in.">
          <textarea rows={3} className={inputCls} value={outcomesText} onChange={(e) => setOutcomesText(e.target.value)} placeholder="Leave blank to keep the current outcomes" />
        </Field>
        <Field label="Purpose" hint="Replaces the current purpose when filled in.">
          <textarea rows={2} className={inputCls} value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="Leave blank to keep the current purpose" />
        </Field>
        <Field label="Amendment note" required hint="Required — recorded on both the old and the new version.">
          <textarea rows={2} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed and why…" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={onCancel}>
            Cancel
          </ActionBtn>
          <ActionBtn tone="blue" disabled={!canSubmit} className="disabled:opacity-50" onClick={submit}>
            {busy ? "Amending…" : "Create amended version"}
          </ActionBtn>
        </div>
      </div>
    </>
  );
}

const LIFECYCLE_ACTIONS = [
  { value: "suspend", label: "Suspend", help: "Temporarily removes the qualification from active use (registered → suspended)." },
  { value: "reinstate", label: "Reinstate", help: "Restores a suspended qualification to the register (suspended → registered)." },
  { value: "deregister", label: "Deregister", help: "Permanently removes the qualification from the register. This is terminal." },
  { value: "renew", label: "Renew", help: "Extends the registration's expiry date by five years." },
];

function LifecycleForm({ token, row, onDone, onCancel }) {
  const [action, setAction] = useState("suspend");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const canSubmit = note.trim().length >= 3 && !busy;

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      await api.qualificationLifecycle(token, row.id, action, note.trim());
      await onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const meta = LIFECYCLE_ACTIONS.find((a) => a.value === action);

  return (
    <>
      <ErrorBanner error={error} />
      <div className="space-y-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Qualification", value: row.title },
            { label: "Current status", value: <StatusBadge status={row.status} /> },
          ]}
        />
        <Field label="Lifecycle action" required hint={meta?.help}>
          <select className={inputCls} value={action} onChange={(e) => setAction(e.target.value)}>
            {LIFECYCLE_ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Note" required hint="Required — recorded in the register entry's history and sent to the awarding body.">
          <textarea rows={3} className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for this decision…" />
        </Field>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
          <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={onCancel}>
            Cancel
          </ActionBtn>
          <ActionBtn tone={action === "deregister" ? "red" : action === "suspend" ? "orange" : "green"} disabled={!canSubmit} className="disabled:opacity-50" onClick={submit}>
            {busy ? "Applying…" : `Confirm ${meta?.label.toLowerCase()}`}
          </ActionBtn>
        </div>
      </div>
    </>
  );
}

function HistoryView({ token, row }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let on = true;
    setLoading(true);
    setError(null);
    api
      .qualificationHistory(row.referenceId, token)
      .then((res) => on && setData(res))
      .catch((err) => on && setError(err.message))
      .finally(() => on && setLoading(false));
    return () => {
      on = false;
    };
  }, [row.referenceId, token]);

  if (loading) return <p className="py-6 text-center text-[12.5px] text-slate-400">Loading version history…</p>;
  if (error) return <ErrorBanner error={error} />;
  const versions = data?.versions || [];
  if (versions.length === 0) return <p className="py-6 text-center text-[12.5px] text-slate-400">No history recorded.</p>;

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1.5 text-[12px] font-bold text-slate-900">Version chain</div>
        <ul className="space-y-1">
          {versions.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-700">
              <span className="font-mono text-[11.5px] text-slate-500">v{v.qualificationVersion}</span>
              <span className="font-medium">{v.title}</span>
              <StatusBadge status={v.status} />
              {v.registrationDate && <span className="text-[11px] text-slate-400">registered {fmtDate(v.registrationDate)}</span>}
            </li>
          ))}
        </ul>
      </div>
      {versions.map((v) => (
        <SectionCard
          key={v.id}
          title={`Version ${v.qualificationVersion} — ${v.title}`}
          action={<StatusBadge status={v.status} />}
          pad="p-3.5"
        >
          <CaseTimeline events={v.events} />
        </SectionCard>
      ))}
    </div>
  );
}

function RegisteredRegister({ token }) {
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modal, setModal] = useState(null); // { kind: "amend" | "lifecycle" | "history", row }

  const load = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await api.searchQualifications(`?status=registered&page=${page}`);
      setRows(res.items || []);
      setPages(res.pages || 1);
      setTotal(res.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  const columns = [
    { key: "referenceId", label: "Reference", render: (q) => <span className="font-mono text-[12px]">{q.referenceId || "—"}</span> },
    {
      key: "title",
      label: "Title",
      render: (q) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate font-medium text-slate-700">{q.title}</span>
          <span className="block truncate text-[11px] text-slate-400">{q.awardingBody || "—"} · v{q.qualificationVersion || 1}</span>
        </span>
      ),
    },
    { key: "nqfLevel", label: "Level", render: (q) => (q.nqfLevel != null ? `Level ${q.nqfLevel}` : "—") },
    { key: "registrationDate", label: "Registered", render: (q) => fmtDate(q.registrationDate) },
    {
      key: "actions",
      label: "Actions",
      render: (q) => (
        <span className="flex flex-wrap gap-1.5">
          <ActionBtn tone="softblue" className="!px-2.5 !py-1 !text-[11px]" onClick={() => setModal({ kind: "amend", row: q })}>
            Amend
          </ActionBtn>
          <ActionBtn tone="softorange" className="!px-2.5 !py-1 !text-[11px]" onClick={() => setModal({ kind: "lifecycle", row: q })}>
            Lifecycle
          </ActionBtn>
          <ActionBtn tone="outline" className="!px-2.5 !py-1 !text-[11px]" onClick={() => setModal({ kind: "history", row: q })}>
            History
          </ActionBtn>
        </span>
      ),
    },
  ];

  const summary = total ? `${total} registered qualification${total > 1 ? "s" : ""}` : "No records";

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey="id"
          minWidth="min-w-[760px]"
          loading={loading}
          emptyText="Nothing on the national register yet — registrations appear here once ZAQA approves a recommended proposal."
          footer={<Pagination summary={summary} page={page} pages={pages} onPageChange={setPage} />}
        />
      </div>

      <Modal
        open={modal?.kind === "amend"}
        onClose={() => setModal(null)}
        title={`Amend ${modal?.row?.referenceId || ""}`}
        width="max-w-xl"
      >
        {modal?.kind === "amend" && (
          <AmendForm
            token={token}
            row={modal.row}
            onCancel={() => setModal(null)}
            onDone={async () => {
              await load();
              setModal(null);
            }}
          />
        )}
      </Modal>

      <Modal
        open={modal?.kind === "lifecycle"}
        onClose={() => setModal(null)}
        title={`Lifecycle — ${modal?.row?.referenceId || ""}`}
      >
        {modal?.kind === "lifecycle" && (
          <LifecycleForm
            token={token}
            row={modal.row}
            onCancel={() => setModal(null)}
            onDone={async () => {
              await load();
              setModal(null);
            }}
          />
        )}
      </Modal>

      <Modal
        open={modal?.kind === "history"}
        onClose={() => setModal(null)}
        title={`History — ${modal?.row?.referenceId || ""}`}
        width="max-w-2xl"
      >
        {modal?.kind === "history" && <HistoryView token={token} row={modal.row} />}
      </Modal>
    </div>
  );
}

function ZaqaWorkspace({ token }) {
  const [tab, setTab] = useState("Decision inbox");
  return (
    <div>
      <div className="mb-4">
        <TabBar tabs={["Decision inbox", "Registered"]} active={tab} onChange={setTab} />
      </div>
      {tab === "Decision inbox" ? <InboxView token={token} zaqa /> : <RegisteredRegister token={token} />}
    </div>
  );
}

/* ---------------------------------------------------------------- export --- */

export default function QualificationsWorkflow({ token, role, mode = "issuer" }) {
  if (mode === "authority") return <InboxView token={token} />;
  if (mode === "zaqa") return <ZaqaWorkspace token={token} />;
  return <IssuerQualifications token={token} />;
}
