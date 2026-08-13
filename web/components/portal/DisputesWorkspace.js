"use client";

// Disputes workspace (spec §11, §30) — one component, two modes:
//   mode="authority": the lead authority's queue (ZAQA / HEA / TEVETA / ECZ / issuer officers)
//     with review workflow, decisions and (ZAQA) appeal decisions.
//   mode="holder": a graduate's own disputes — raise a dispute on a credential, follow the
//     case timeline and appeal a decision.
// The page wrapper does auth (usePortalGuard) and provides PortalShell; this component
// receives `token` and `role` as props and renders the full workspace body.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Badge, StatusTabs, SearchBox, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, ToolButton,
} from "./kit";
import CaseTimeline from "./CaseTimeline";
import { fmtDate, fmtDateTime } from "./auth";
import { api } from "../../lib/api";

/* ------------------------------------------------------------- metadata --- */

export const DISPUTE_CATEGORIES = {
  ecz_result: { label: "ECZ result", tone: "cyan" },
  institution_compliance: { label: "Institution compliance", tone: "indigo" },
  programme_accreditation: { label: "Programme accreditation", tone: "violet" },
  zqf_level: { label: "ZQF level", tone: "blue" },
  national_recognition: { label: "National recognition", tone: "teal" },
  award_details: { label: "Award details", tone: "pink" },
  other: { label: "Other", tone: "slate" },
};

export const DISPUTE_STATUS = {
  open: { label: "Open", tone: "blue" },
  under_review: { label: "Under review", tone: "amber" },
  awaiting_evidence: { label: "Awaiting evidence", tone: "orange" },
  upheld: { label: "Upheld", tone: "green" },
  dismissed: { label: "Dismissed", tone: "slate" },
  resolved: { label: "Resolved", tone: "slate" },
  appealed: { label: "Appealed", tone: "purple" },
  appeal_upheld: { label: "Appeal upheld", tone: "green" },
  appeal_dismissed: { label: "Appeal dismissed", tone: "red" },
};

const ACTIVE = ["open", "under_review", "awaiting_evidence"];
const DECIDED = ["upheld", "dismissed", "resolved"];

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

function CategoryBadge({ category }) {
  const m = DISPUTE_CATEGORIES[category] || { label: category || "—", tone: "slate" };
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

function StatusBadge({ status }) {
  const m = DISPUTE_STATUS[status] || { label: status || "—", tone: "slate" };
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

/* ------------------------------------------------- shared detail sections --- */

function DisputeFacts({ dispute }) {
  return (
    <div className="space-y-4">
      <KVGrid
        cols={2}
        items={[
          { label: "Category", value: <CategoryBadge category={dispute.category} /> },
          { label: "Status", value: <StatusBadge status={dispute.status} /> },
          { label: "Subject", value: dispute.subjectName || "—" },
          { label: "Institution", value: dispute.institution || "—" },
          { label: "Opened by", value: dispute.openedBy || "—" },
          { label: "Opened on", value: fmtDateTime(dispute.createdAt) },
          { label: "Lead authority", value: (dispute.leadAuthority || "—").toUpperCase() },
          {
            label: "Credential",
            value: <span className="break-all font-mono text-[12px]">{shortHash(dispute.credentialHash)}</span>,
          },
        ]}
      />
      <div>
        <div className="text-[11px] font-medium text-slate-400">Description</div>
        <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px] leading-snug text-slate-700">
          {dispute.description || "—"}
        </p>
      </div>
      {dispute.resolution && (
        <div>
          <div className="text-[11px] font-medium text-slate-400">
            Decision {dispute.decidedBy ? `— ${dispute.decidedBy}` : ""} {dispute.decidedAt ? `· ${fmtDateTime(dispute.decidedAt)}` : ""}
          </div>
          <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px] leading-snug text-slate-700">
            {dispute.resolution}
          </p>
        </div>
      )}
      {dispute.appeal?.openedAt && (
        <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3">
          <div className="text-[12px] font-bold text-violet-700">Appeal</div>
          <p className="mt-1 text-[12.5px] leading-snug text-slate-700">{dispute.appeal.reason}</p>
          <div className="mt-1 text-[11px] text-slate-500">
            Lodged {fmtDateTime(dispute.appeal.openedAt)} by {dispute.appeal.openedBy || "—"}
          </div>
          {dispute.appeal.resolution && (
            <div className="mt-2 border-t border-violet-100 pt-2">
              <div className="text-[11px] font-semibold text-slate-600">
                Appeal outcome — {DISPUTE_STATUS[dispute.status]?.label || dispute.status}
              </div>
              <p className="mt-0.5 text-[12.5px] leading-snug text-slate-700">{dispute.appeal.resolution}</p>
              <div className="mt-1 text-[11px] text-slate-500">
                Decided {fmtDateTime(dispute.appeal.decidedAt)} by {dispute.appeal.decidedBy || "—"}
              </div>
            </div>
          )}
        </div>
      )}
      <div>
        <div className="mb-2 text-[12px] font-bold text-slate-900">Case history</div>
        <CaseTimeline events={dispute.events} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------- authority mode --- */

const AUTHORITY_TABS = [
  { label: "All", match: () => true },
  { label: "Open", match: (s) => s === "open" },
  { label: "Under review", match: (s) => s === "under_review" },
  { label: "Awaiting evidence", match: (s) => s === "awaiting_evidence" },
  { label: "Decided", match: (s) => [...DECIDED, "appeal_upheld", "appeal_dismissed"].includes(s) },
  { label: "Appealed", match: (s) => s === "appealed" },
];

function AuthorityDisputes({ token, role }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("All");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null); // { kind: "evidence" | "decide" | "appeal", outcome? }
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await api.disputeQueue(token);
      const list = res.disputes || [];
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

  const tabs = AUTHORITY_TABS.map((t) => ({
    label: t.label,
    count: rows.filter((d) => t.match(d.status)).length,
  }));

  const filtered = useMemo(() => {
    const t = AUTHORITY_TABS.find((x) => x.label === tab) || AUTHORITY_TABS[0];
    const q = query.trim().toLowerCase();
    return rows.filter((d) => {
      if (!t.match(d.status)) return false;
      if (!q) return true;
      const cat = DISPUTE_CATEGORIES[d.category]?.label || d.category || "";
      return [d.subjectName, d.institution, d.credentialHash, d.category, cat]
        .some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [rows, tab, query]);

  const pg = usePager(filtered, 10, [tab, query]);

  function openDetail(d) {
    setSelected(d);
    setForm(null);
    setNote("");
    setModalError(null);
  }

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    setModalError(null);
    try {
      await fn();
      const fresh = await load();
      if (fresh && selected) {
        const upd = fresh.find((d) => d.id === selected.id);
        if (upd) setSelected(upd);
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
    { key: "createdAt", label: "Opened", render: (d) => fmtDate(d.createdAt) },
    { key: "category", label: "Category", render: (d) => <CategoryBadge category={d.category} /> },
    {
      key: "subjectName",
      label: "Subject / Institution",
      render: (d) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate font-medium text-slate-700">{d.subjectName || "—"}</span>
          <span className="block truncate text-[11px] text-slate-400">{d.institution || "—"}</span>
        </span>
      ),
    },
    { key: "openedBy", label: "Opened by", render: (d) => <span className="break-all">{d.openedBy || "—"}</span> },
    { key: "status", label: "Status", render: (d) => <StatusBadge status={d.status} /> },
  ];

  const st = selected?.status;
  const canAppealDecide = st === "appealed" && (role === "zaqa" || role === "admin");
  const noteRequired = form && form.kind !== "evidence";
  const noteOk = !noteRequired || note.trim().length >= 3;

  const FORM_COPY = {
    evidence: { title: "Request further evidence", cta: "Request evidence", tone: "orange", hint: "Optional note to the person who opened the dispute." },
    decide: { title: "Record the decision", cta: form?.outcome === "upheld" ? "Confirm — uphold" : "Confirm — dismiss", tone: form?.outcome === "upheld" ? "green" : "red", hint: "Required — this resolution is sent to the opener and appended to the case history." },
    appeal: { title: "Decide the appeal", cta: form?.outcome === "appeal_upheld" ? "Confirm — uphold appeal" : "Confirm — dismiss appeal", tone: form?.outcome === "appeal_upheld" ? "green" : "red", hint: "Required — explains why the original decision stands or is overturned." },
  };

  const footer = !selected ? null : form ? (
    <>
      <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={() => { setForm(null); setNote(""); setModalError(null); }}>
        Cancel
      </ActionBtn>
      <ActionBtn
        tone={FORM_COPY[form.kind].tone}
        disabled={busy || !noteOk}
        className="disabled:opacity-50"
        onClick={() => {
          if (form.kind === "evidence") run(() => api.setDisputeStatus(token, selected.id, "awaiting_evidence", note.trim()));
          else if (form.kind === "decide") run(() => api.decideDispute(token, selected.id, form.outcome, note.trim()));
          else run(() => api.decideDisputeAppeal(token, selected.id, form.outcome, note.trim()));
        }}
      >
        {busy ? "Working…" : FORM_COPY[form.kind].cta}
      </ActionBtn>
    </>
  ) : (
    <>
      {st === "open" && (
        <ActionBtn tone="blue" disabled={busy} className="disabled:opacity-50" onClick={() => run(() => api.setDisputeStatus(token, selected.id, "under_review"))}>
          {busy ? "Working…" : "Start review"}
        </ActionBtn>
      )}
      {st === "under_review" && (
        <ActionBtn tone="softorange" disabled={busy} className="disabled:opacity-50" onClick={() => setForm({ kind: "evidence" })}>
          Request evidence
        </ActionBtn>
      )}
      {st === "awaiting_evidence" && (
        <ActionBtn tone="softblue" disabled={busy} className="disabled:opacity-50" onClick={() => run(() => api.setDisputeStatus(token, selected.id, "under_review"))}>
          {busy ? "Working…" : "Resume review"}
        </ActionBtn>
      )}
      {ACTIVE.includes(st) && (
        <>
          <ActionBtn tone="green" disabled={busy} className="disabled:opacity-50" onClick={() => setForm({ kind: "decide", outcome: "upheld" })}>
            Uphold
          </ActionBtn>
          <ActionBtn tone="softred" disabled={busy} className="disabled:opacity-50" onClick={() => setForm({ kind: "decide", outcome: "dismissed" })}>
            Dismiss
          </ActionBtn>
        </>
      )}
      {canAppealDecide && (
        <>
          <ActionBtn tone="green" disabled={busy} className="disabled:opacity-50" onClick={() => setForm({ kind: "appeal", outcome: "appeal_upheld" })}>
            Uphold appeal
          </ActionBtn>
          <ActionBtn tone="softred" disabled={busy} className="disabled:opacity-50" onClick={() => setForm({ kind: "appeal", outcome: "appeal_dismissed" })}>
            Dismiss appeal
          </ActionBtn>
        </>
      )}
      {st === "appealed" && !canAppealDecide && (
        <span className="text-[12px] text-slate-400">Appeals are decided by ZAQA.</span>
      )}
      {!ACTIVE.includes(st) && st !== "appealed" && (
        <span className="text-[12px] text-slate-400">This case is closed — read-only.</span>
      )}
    </>
  );

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox
          value={query}
          onChange={setQuery}
          placeholder="Search subject, institution, hash or category…"
          className="w-full sm:w-80"
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="id"
          loading={loading}
          onRowClick={openDetail}
          emptyText="No disputes in your queue — cases are routed here automatically by category."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Dispute case"
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
        footer={footer}
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <DisputeFacts dispute={selected} />
            {form && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1.5 text-[12.5px] font-bold text-slate-900">{FORM_COPY[form.kind].title}</div>
                <textarea
                  rows={3}
                  className={inputCls}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={form.kind === "evidence" ? "What evidence is needed?" : "Resolution / reasoning…"}
                />
                <div className="mt-1 text-[11px] text-slate-400">{FORM_COPY[form.kind].hint}</div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------- holder mode --- */

function HolderDisputes({ token }) {
  const [rows, setRows] = useState([]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  // raise-dispute form
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [credentialHash, setCredentialHash] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // appeal form (inside detail modal)
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, c] = await Promise.all([api.myDisputes(token), api.myCredentials(token)]);
      const list = d.disputes || [];
      setRows(list);
      setCreds(c.credentials || []);
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

  const descOk = description.trim().length >= 10;
  const canSubmit = credentialHash && category && descOk && !submitting;

  async function submitDispute() {
    if (!canSubmit) return;
    setSubmitting(true);
    setFormError(null);
    try {
      await api.openDispute(token, { credentialHash, category, description: description.trim() });
      setRaiseOpen(false);
      setCredentialHash("");
      setCategory("");
      setDescription("");
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitAppeal() {
    if (busy || appealReason.trim().length < 3 || !selected) return;
    setBusy(true);
    setModalError(null);
    try {
      await api.appealDispute(token, selected.id, appealReason.trim());
      const fresh = await load();
      const upd = fresh && fresh.find((d) => d.id === selected.id);
      if (upd) setSelected(upd);
      setAppealOpen(false);
      setAppealReason("");
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const columns = [
    { key: "createdAt", label: "Opened", render: (d) => fmtDate(d.createdAt) },
    { key: "category", label: "Category", render: (d) => <CategoryBadge category={d.category} /> },
    {
      key: "institution",
      label: "Credential",
      render: (d) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate font-medium text-slate-700">{d.subjectName || "—"}</span>
          <span className="block truncate text-[11px] text-slate-400">{d.institution || "—"}</span>
        </span>
      ),
    },
    { key: "status", label: "Status", render: (d) => <StatusBadge status={d.status} /> },
  ];

  const canAppeal = selected && DECIDED.includes(selected.status) && !selected.appeal?.openedAt;

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
        <div className="text-[13px] text-slate-500">
          {rows.length
            ? `You have ${rows.length} dispute case${rows.length > 1 ? "s" : ""}.`
            : "Raise a dispute when something about one of your credentials is wrong or contested."}
        </div>
        <ToolButton
          icon="alert"
          tone="border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100"
          onClick={() => { setRaiseOpen(true); setFormError(null); }}
        >
          Raise dispute
        </ToolButton>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="id"
          loading={loading}
          onRowClick={(d) => { setSelected(d); setAppealOpen(false); setAppealReason(""); setModalError(null); }}
          emptyText="You haven't raised any disputes yet. Use “Raise dispute” to open a case on one of your credentials."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      {/* raise-dispute modal */}
      <Modal
        open={raiseOpen}
        onClose={() => !submitting && setRaiseOpen(false)}
        title="Raise a dispute"
        footer={
          <>
            <ActionBtn tone="outline" disabled={submitting} className="disabled:opacity-50" onClick={() => setRaiseOpen(false)}>
              Cancel
            </ActionBtn>
            <ActionBtn tone="blue" disabled={!canSubmit} className="disabled:opacity-50" onClick={submitDispute}>
              {submitting ? "Submitting…" : "Submit dispute"}
            </ActionBtn>
          </>
        }
      >
        <ErrorBanner error={formError} />
        <div className="space-y-4">
          <Field label="Credential" required hint="The dispute is routed to the responsible authority based on the credential and category.">
            <select className={inputCls} value={credentialHash} onChange={(e) => setCredentialHash(e.target.value)}>
              <option value="">Select a credential…</option>
              {creds.map((c) => (
                <option key={c.credentialHash} value={c.credentialHash}>
                  {c.qualification || "Credential"} — {c.institution || "Unknown institution"}
                </option>
              ))}
            </select>
            {creds.length === 0 && !loading && (
              <span className="mt-1 block text-[11px] text-amber-600">
                You have no credentials yet — a dispute must reference one of your credentials.
              </span>
            )}
          </Field>
          <Field label="Category" required>
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select a category…</option>
              {Object.entries(DISPUTE_CATEGORIES).map(([k, m]) => (
                <option key={k} value={k}>{m.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Description" required hint={descOk ? "Explain the issue clearly — this becomes the opening entry of the case file." : "At least 10 characters."}>
            <textarea
              rows={4}
              className={inputCls}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is wrong, and what outcome are you seeking?"
            />
          </Field>
        </div>
      </Modal>

      {/* detail modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="My dispute"
        badge={selected ? <StatusBadge status={selected.status} /> : null}
        width="max-w-2xl"
        footer={
          selected && (appealOpen ? (
            <>
              <ActionBtn tone="outline" disabled={busy} className="disabled:opacity-50" onClick={() => { setAppealOpen(false); setAppealReason(""); }}>
                Cancel
              </ActionBtn>
              <ActionBtn tone="purple" disabled={busy || appealReason.trim().length < 3} className="disabled:opacity-50" onClick={submitAppeal}>
                {busy ? "Submitting…" : "Submit appeal"}
              </ActionBtn>
            </>
          ) : canAppeal ? (
            <ActionBtn tone="softpurple" onClick={() => setAppealOpen(true)}>Appeal this decision</ActionBtn>
          ) : (
            <span className="text-[12px] text-slate-400">
              {selected.status === "appealed"
                ? "Your appeal is with ZAQA."
                : ACTIVE.includes(selected.status)
                ? "Your case is with the responsible authority."
                : selected.appeal?.openedAt
                ? "The appeal decision is final."
                : "No actions available."}
            </span>
          ))
        }
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <DisputeFacts dispute={selected} />
            {appealOpen && (
              <div className="rounded-lg border border-slate-200 p-3">
                <div className="mb-1.5 text-[12.5px] font-bold text-slate-900">Appeal this decision</div>
                <textarea
                  rows={3}
                  className={inputCls}
                  value={appealReason}
                  onChange={(e) => setAppealReason(e.target.value)}
                  placeholder="Why should the decision be reconsidered?"
                />
                <div className="mt-1 text-[11px] text-slate-400">
                  Appeals escalate to ZAQA. One appeal is allowed per case.
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ---------------------------------------------------------------- export --- */

export default function DisputesWorkspace({ token, role, mode = "authority" }) {
  if (mode === "holder") return <HolderDisputes token={token} />;
  return <AuthorityDisputes token={token} role={role} />;
}
