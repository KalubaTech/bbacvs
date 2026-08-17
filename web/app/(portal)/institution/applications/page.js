"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatusTabs, SelectPill, SearchBox, ToolButton, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, PanelHeader, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import ApplicationProgress from "../../../../components/portal/ApplicationProgress";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";

const STATUS_META = {
  submitted: { label: "Submitted", tone: "blue" },
  screening: { label: "Screening", tone: "amber" },
  under_review: { label: "Records review", tone: "orange" },
  awaiting_evidence: { label: "Awaiting evidence", tone: "amber" },
  decision_pending: { label: "Decision pending", tone: "purple" },
  issued: { label: "Issued", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
};
const STATUS_ORDER = Object.keys(STATUS_META);

// Legal review-workflow transitions (mirrors the API's TRANSITIONS map).
const CAN_SCREEN = ["submitted"];
const CAN_REVIEW = ["submitted", "screening", "awaiting_evidence"];
const CAN_REQUEST_EVIDENCE = ["screening", "under_review"];
const CAN_DECISION = ["under_review"];
const CAN_ISSUE = ["submitted", "screening", "under_review", "decision_pending"];
const CAN_REJECT = ["submitted", "screening", "under_review", "awaiting_evidence", "decision_pending"];

const TYPE_LABEL = { secondary: "Secondary", diploma: "Diploma", degree: "Degree", masters: "Master's", phd: "PhD", other: "Other" };

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

function DetailPanel({ app, busy, error, onClose, onViewDoc, onAction, onIssue, onEvidence, onReject }) {
  if (!app) {
    return (
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Application Details</h2>
        <p className="text-[12.5px] text-slate-400">Select an application to review the case.</p>
      </div>
    );
  }
  const s = app.status;
  return (
    <div>
      <PanelHeader title="Application Details" badge={<StatusBadge status={s} />} onClose={onClose} />
      <ErrorBanner error={error} />

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Applicant", value: app.applicantName || "—" },
            { label: "Email", value: <span className="break-all">{app.applicantEmail || "—"}</span> },
            { label: "Qualification", value: app.qualification },
            { label: "Graduation year", value: app.graduationYear },
            { label: "Credential type", value: TYPE_LABEL[app.credentialType] || app.credentialType || "—" },
            { label: "ZQF level", value: app.zqfLevel ? `Level ${app.zqfLevel}` : "—" },
            { label: "Received", value: fmtDate(app.createdAt) },
            { label: "Last updated", value: fmtDate(app.updatedAt) },
          ]}
        />
        {app.note ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            <span className="font-semibold">Case note:</span> {app.note}
          </div>
        ) : null}
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2.5 text-[12.5px] font-bold text-slate-800">Case Progress</div>
        <ApplicationProgress status={s} />
      </div>

      {app.hasDocument && (
        <ActionBtn tone="outline" icon="file" full className="mb-4" onClick={() => onViewDoc(app.id)}>
          View uploaded document
        </ActionBtn>
      )}

      {/* Action bar — only legal transitions for the current status are shown. */}
      {(CAN_SCREEN.includes(s) || CAN_REVIEW.includes(s) || CAN_REQUEST_EVIDENCE.includes(s) ||
        CAN_DECISION.includes(s) || CAN_ISSUE.includes(s) || CAN_REJECT.includes(s)) && (
        <div className="mb-4 space-y-2">
          <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
          {CAN_SCREEN.includes(s) && (
            <ActionBtn tone="softblue" icon="clipboardCheck" full disabled={busy} onClick={() => onAction(app, "screening")}>
              Begin screening
            </ActionBtn>
          )}
          {CAN_REVIEW.includes(s) && (
            <ActionBtn tone="softblue" icon="search" full disabled={busy} onClick={() => onAction(app, "under_review")}>
              Start records review
            </ActionBtn>
          )}
          {CAN_REQUEST_EVIDENCE.includes(s) && (
            <ActionBtn tone="softorange" icon="upload" full disabled={busy} onClick={() => onEvidence(app)}>
              Request more evidence
            </ActionBtn>
          )}
          {CAN_DECISION.includes(s) && (
            <ActionBtn tone="softpurple" icon="scale" full disabled={busy} onClick={() => onAction(app, "decision_pending")}>
              Mark ready for decision
            </ActionBtn>
          )}
          {CAN_ISSUE.includes(s) && (
            <ActionBtn tone="green" icon="award" full disabled={busy} onClick={() => onIssue(app)}>
              Verify & issue credential
            </ActionBtn>
          )}
          {CAN_REJECT.includes(s) && (
            <ActionBtn tone="softred" icon="x" full disabled={busy} onClick={() => onReject(app)}>
              Reject
            </ActionBtn>
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2.5 text-[12.5px] font-bold text-slate-800">Case History</div>
        <CaseTimeline events={app.events} />
      </div>
    </div>
  );
}

export default function InstitutionApplicationsPage() {
  const { ready, token } = usePortalGuard(["issuer"]);
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sel, setSel] = useState(null);
  // Modals
  const [evidenceFor, setEvidenceFor] = useState(null);
  const [evidenceNote, setEvidenceNote] = useState("");
  const [rejectFor, setRejectFor] = useState(null);
  const [rejectReason, setRejectReason] = useState("");
  const [issueFor, setIssueFor] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setApps((await api.incomingApplications(token)).applications || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Replace one application in the list from an API response.
  function patch(updated) {
    setApps((list) => list.map((a) => (a.id === updated.id ? updated : a)));
  }

  async function run(fn) {
    setBusy(true);
    setPanelError(null);
    try {
      const res = await fn();
      if (res?.application) patch(res.application);
      return true;
    } catch (err) {
      setPanelError(err.message === "invalid_transition" ? "That step is no longer valid for this case — it may have moved on. Refresh and try again." : err.message);
      return false;
    } finally { setBusy(false); }
  }

  const moveTo = (app, status, note) => run(() => api.setApplicationStatus(token, app.id, status, note ?? ""));

  async function viewDoc(id) {
    setPanelError(null);
    try { openBlob(await api.applicationDocument(token, id)); }
    catch (err) { setPanelError(err.message); }
  }

  async function submitEvidenceRequest() {
    if (!evidenceNote.trim()) return;
    const ok = await moveTo(evidenceFor, "awaiting_evidence", evidenceNote.trim());
    if (ok) { setEvidenceFor(null); setEvidenceNote(""); }
  }

  async function submitReject() {
    if (!rejectReason.trim()) return;
    const ok = await run(() => api.rejectApplication(token, rejectFor.id, rejectReason.trim()));
    if (ok) { setRejectFor(null); setRejectReason(""); }
  }

  async function submitIssue() {
    const ok = await run(() => api.verifyIssueApplication(token, issueFor.id));
    if (ok) setIssueFor(null);
  }

  const counts = useMemo(
    () => apps.reduce((m, a) => ((m[a.status] = (m[a.status] || 0) + 1), m), {}),
    [apps]
  );
  const tabs = [
    { label: "All", count: apps.length },
    ...STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label, count: counts[s] || 0 })),
  ];
  const LABEL_TO_STATUS = Object.fromEntries(STATUS_ORDER.map((s) => [STATUS_META[s].label, s]));

  const rows = useMemo(() => {
    const want = LABEL_TO_STATUS[tab];
    return apps.filter((a) => {
      if (want && a.status !== want) return false;
      if (type && a.credentialType !== type) return false;
      return !q || `${a.applicantName} ${a.applicantEmail} ${a.qualification} ${a.graduationYear}`.toLowerCase().includes(q.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apps, tab, q, type]);

  const pg = usePager(rows, 10, [tab, q, type]);
  const selected = apps.find((a) => a.id === sel) || null;

  const columns = [
    {
      key: "applicantName",
      label: "Applicant",
      render: (r) => (
        <span className="block leading-tight">
          <span className="block font-semibold text-slate-800">{r.applicantName}</span>
          <span className="block text-[11px] text-slate-400">{r.applicantEmail}</span>
        </span>
      ),
      csv: (r) => r.applicantName,
    },
    { key: "qualification", label: "Qualification" },
    { key: "graduationYear", label: "Year" },
    {
      key: "credentialType", label: "Type",
      render: (r) => TYPE_LABEL[r.credentialType] || r.credentialType || "—",
      csv: (r) => r.credentialType || "",
    },
    {
      key: "createdAt", label: "Received", tdClass: "whitespace-nowrap",
      render: (r) => fmtDateTime(r.createdAt), csv: (r) => r.createdAt || "",
    },
    { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} />, csv: (r) => r.status },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="applications"
      title="Graduate Applications"
      actions={
        <>
          <ToolButton icon="download" onClick={() => exportCSV("graduate-applications", columns, rows)}>
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" aria-label="Refresh" onClick={load} />
        </>
      }
      panel={
        <DetailPanel
          app={selected}
          busy={busy}
          error={panelError}
          onClose={() => { setSel(null); setPanelError(null); }}
          onViewDoc={viewDoc}
          onAction={moveTo}
          onIssue={setIssueFor}
          onEvidence={(a) => { setEvidenceFor(a); setEvidenceNote(""); }}
          onReject={(a) => { setRejectFor(a); setRejectReason(""); }}
        />
      }
      panelKey={selected?.id}
      panelWidth="w-[440px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search applicant, email, qualification..." value={q} onChange={setQ} />
          <SelectPill
            label="Type"
            value={type}
            onChange={setType}
            options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
          />
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => { setSel(r.id); setPanelError(null); }}
          loading={loading}
          emptyText="No applications match this view."
          columns={columns}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      {/* Request more evidence */}
      <Modal
        open={!!evidenceFor}
        onClose={() => setEvidenceFor(null)}
        title="Request more evidence"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setEvidenceFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="orange" disabled={busy || !evidenceNote.trim()} onClick={submitEvidenceRequest}>
              {busy ? "Sending…" : "Send request"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          The case moves to <Badge tone="amber">Awaiting evidence</Badge> and{" "}
          <span className="font-semibold">{evidenceFor?.applicantName}</span> is notified with your note. They can
          then upload additional proof from their portal.
        </p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-700">What evidence do you need? *</span>
          <textarea
            rows={4}
            value={evidenceNote}
            onChange={(e) => setEvidenceNote(e.target.value)}
            placeholder="e.g. Please upload a clearer scan of the certificate including the registrar's signature."
            className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </Modal>

      {/* Reject */}
      <Modal
        open={!!rejectFor}
        onClose={() => setRejectFor(null)}
        title="Reject application"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setRejectFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="red" disabled={busy || !rejectReason.trim()} onClick={submitReject}>
              {busy ? "Rejecting…" : "Reject application"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          This refuses <span className="font-semibold">{rejectFor?.applicantName}</span>&apos;s application for{" "}
          <span className="font-semibold">{rejectFor?.qualification}</span>. The reason is recorded on the case and
          sent to the applicant.
        </p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-700">Reason *</span>
          <textarea
            rows={3}
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="e.g. No matching record was found in the institutional register for this name and year."
            className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </Modal>

      {/* Verify & issue confirmation */}
      <Modal
        open={!!issueFor}
        onClose={() => setIssueFor(null)}
        title="Verify & issue credential"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setIssueFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="green" icon="award" disabled={busy} onClick={submitIssue}>
              {busy ? "Issuing…" : "Confirm & issue"}
            </ActionBtn>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">
          You confirm that <span className="font-semibold">{issueFor?.applicantName}</span>&apos;s{" "}
          <span className="font-semibold">{issueFor?.qualification} ({issueFor?.graduationYear})</span> has been
          verified against institutional records. A blockchain-anchored credential will be issued and forwarded to
          ZAQA for national validation. This cannot be undone.
        </p>
      </Modal>
    </PortalShell>
  );
}
