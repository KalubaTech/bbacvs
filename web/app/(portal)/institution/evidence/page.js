"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatusTabs, SearchBox, ToolButton, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, PanelHeader, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";

const ZAQA_META = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Pending ZAQA", tone: "blue" },
  validated: { label: "Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Flagged", tone: "amber" },
  under_dispute: { label: "Disputed", tone: "amber" },
  suspended: { label: "Suspended", tone: "red" },
};
const ZAQA_ORDER = Object.keys(ZAQA_META);

const CRED_STATUS_META = {
  active: { label: "Active", tone: "green" },
  revoked: { label: "Revoked", tone: "red" },
  suspended: { label: "Suspended", tone: "amber" },
  pending: { label: "Pending anchor", tone: "slate" },
};

const TYPE_OPTIONS = ["secondary", "diploma", "degree", "masters", "phd", "other"];
const TYPE_LABEL = { secondary: "Secondary", diploma: "Diploma", degree: "Degree", masters: "Master's", phd: "PhD", other: "Other" };

const CORRECTIONS_TAB = "Corrections requested";

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

// The API's 409 body carries a friendly message, but the client wrapper surfaces
// only the error code — translate it back for the officer.
const METAMASK_MSG =
  "This issuer signs with MetaMask — supersession requires server-held keys and is not available for MetaMask issuers yet.";

function ZaqaBadge({ v }) {
  const m = ZAQA_META[v] || { label: v || "—", tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

function DetailPanel({ cred, busy, error, onClose, onSubmitZaqa, onOpenCorrect }) {
  if (!cred) {
    return (
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Credential Details</h2>
        <p className="text-[12.5px] text-slate-400">Select a credential to inspect its trust record.</p>
      </div>
    );
  }
  const statusMeta = CRED_STATUS_META[cred.status] || { label: cred.status, tone: "slate" };
  return (
    <div>
      <PanelHeader title="Credential Details" badge={<ZaqaBadge v={cred.zaqaValidation} />} onClose={onClose} />
      <ErrorBanner error={error} />

      {cred.correctionRequest?.status === "open" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
          <div className="font-bold">Correction requested by the graduate</div>
          <div className="mt-0.5">{cred.correctionRequest.message}</div>
          <div className="mt-1 text-[11px] text-amber-700/80">
            Requested {fmtDateTime(cred.correctionRequest.requestedAt)} — issuing a corrected credential resolves this request.
          </div>
        </div>
      )}
      {cred.supersededBy && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600">
          This credential was revoked as an administrative error and replaced by{" "}
          <span className="font-mono font-semibold">{shortHash(cred.supersededBy)}</span>.
        </div>
      )}
      {cred.supersedes && (
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-[12.5px] text-slate-600">
          Issued as a correction superseding <span className="font-mono font-semibold">{shortHash(cred.supersedes)}</span>.
        </div>
      )}
      {cred.suspension?.reason && cred.status === "suspended" && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
          <span className="font-bold">Suspended:</span> {cred.suspension.reason}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Graduate", value: cred.subjectName },
            { label: "Qualification", value: cred.qualification },
            { label: "Graduation year", value: cred.graduationYear },
            { label: "ZQF level", value: cred.zqfLevel ? `Level ${cred.zqfLevel}` : "—" },
            { label: "Type", value: TYPE_LABEL[cred.credentialType] || cred.credentialType || "—" },
            { label: "Credential status", value: <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge> },
            { label: "Issued", value: fmtDate(cred.issuedAt) },
            { label: "ZAQA reference", value: cred.zaqaRef || "—" },
          ]}
        />
        <div className="mt-3 text-[11px] text-slate-400">
          Hash: <span className="break-all font-mono">{cred.credentialHash}</span>
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        {cred.zaqaValidation === "draft" && (
          <ActionBtn tone="blue" icon="send" full disabled={busy} onClick={() => onSubmitZaqa(cred)}>
            {busy ? "Working…" : "Submit to ZAQA"}
          </ActionBtn>
        )}
        {cred.status === "active" && (
          <ActionBtn tone="softorange" icon="edit" full disabled={busy} onClick={() => onOpenCorrect(cred)}>
            Issue corrected credential
          </ActionBtn>
        )}
        {cred.zaqaValidation !== "draft" && cred.status !== "active" && (
          <p className="text-[12px] text-slate-400">No actions are available for this credential in its current state.</p>
        )}
      </div>

      <div className="rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2.5 text-[12.5px] font-bold text-slate-800">Case History</div>
        <CaseTimeline events={cred.events} />
      </div>
    </div>
  );
}

export default function InstitutionEvidencePage() {
  const { ready, token } = usePortalGuard(["issuer"]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [certBusy, setCertBusy] = useState(false);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  // Correction (supersede) modal
  const [correctFor, setCorrectFor] = useState(null);
  const [form, setForm] = useState({});
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCreds((await api.myIssued(token)).credentials || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function submitZaqa(cred) {
    setBusy(true);
    setPanelError(null);
    try {
      await api.submitToZaqa(token, cred.credentialHash);
      await load();
    } catch (err) { setPanelError(err.message); }
    finally { setBusy(false); }
  }

  function openCorrect(cred) {
    setCorrectFor(cred);
    setPanelError(null);
    setForm({
      subjectName: cred.subjectName || "",
      qualification: cred.qualification || "",
      graduationYear: String(cred.graduationYear || ""),
      zqfLevel: cred.zqfLevel ? String(cred.zqfLevel) : "",
      credentialType: cred.credentialType || "other",
    });
  }

  async function submitCorrect() {
    setBusy(true);
    setPanelError(null);
    try {
      await api.supersedeCredential(token, correctFor.credentialHash, {
        subjectName: form.subjectName.trim(),
        qualification: form.qualification.trim(),
        graduationYear: Number(form.graduationYear),
        ...(form.zqfLevel ? { zqfLevel: Number(form.zqfLevel) } : {}),
        credentialType: form.credentialType,
      });
      setCorrectFor(null);
      await load();
    } catch (err) {
      setPanelError(err.message === "metamask_unsupported" ? METAMASK_MSG : err.message);
      setCorrectFor(null);
    } finally { setBusy(false); }
  }

  async function downloadAccreditation() {
    setCertBusy(true);
    setError(null);
    try { openBlob(await api.myAccreditationCertificate(token), "accreditation-certificate.pdf"); }
    catch (err) { setError(err.message); }
    finally { setCertBusy(false); }
  }

  const counts = useMemo(() => {
    const m = creds.reduce((acc, c) => {
      const s = c.zaqaValidation || "draft";
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});
    m.__corrections = creds.filter((c) => c.correctionRequest?.status === "open").length;
    return m;
  }, [creds]);

  const tabs = [
    { label: "All", count: creds.length },
    ...ZAQA_ORDER.map((s) => ({ label: ZAQA_META[s].label, count: counts[s] || 0 })),
    { label: CORRECTIONS_TAB, count: counts.__corrections },
  ];
  const LABEL_TO_ZAQA = Object.fromEntries(ZAQA_ORDER.map((s) => [ZAQA_META[s].label, s]));

  const rows = useMemo(() => {
    return creds.filter((c) => {
      if (tab === CORRECTIONS_TAB) {
        if (c.correctionRequest?.status !== "open") return false;
      } else if (tab !== "All") {
        if ((c.zaqaValidation || "draft") !== LABEL_TO_ZAQA[tab]) return false;
      }
      return !q || `${c.subjectName} ${c.qualification} ${c.graduationYear} ${c.credentialHash}`.toLowerCase().includes(q.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creds, tab, q]);

  const pg = usePager(rows, 10, [tab, q]);
  const selected = creds.find((c) => c.credentialHash === sel) || null;

  const columns = [
    {
      key: "subjectName",
      label: "Graduate",
      render: (r) => (
        <span className="block leading-tight">
          <span className="block font-semibold text-slate-800">{r.subjectName}</span>
          <span className="block font-mono text-[10.5px] text-slate-400">{shortHash(r.credentialHash)}</span>
        </span>
      ),
      csv: (r) => r.subjectName,
    },
    { key: "qualification", label: "Qualification" },
    { key: "graduationYear", label: "Year" },
    {
      key: "status", label: "Status",
      render: (r) => {
        const m = CRED_STATUS_META[r.status] || { label: r.status, tone: "slate" };
        return <Badge tone={m.tone}>{m.label}</Badge>;
      },
      csv: (r) => r.status,
    },
    {
      key: "zaqaValidation", label: "ZAQA Validation",
      render: (r) => (
        <span className="flex items-center gap-1.5">
          <ZaqaBadge v={r.zaqaValidation} />
          {r.correctionRequest?.status === "open" && <Badge tone="amber" icon="edit">Correction</Badge>}
        </span>
      ),
      csv: (r) => r.zaqaValidation || "draft",
    },
    {
      key: "issuedAt", label: "Issued", tdClass: "whitespace-nowrap",
      render: (r) => fmtDate(r.issuedAt), csv: (r) => r.issuedAt || "",
    },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="evidence"
      title="Evidence & ZAQA Requests"
      actions={
        <>
          <ToolButton icon="award" onClick={downloadAccreditation} disabled={certBusy} className={certBusy ? "opacity-50" : ""}>
            {certBusy ? "Preparing…" : "Download accreditation certificate"}
          </ToolButton>
          <ToolButton icon="download" onClick={() => exportCSV("credentials-trust", columns, rows)}>
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" aria-label="Refresh" onClick={load} />
        </>
      }
      panel={
        <DetailPanel
          cred={selected}
          busy={busy}
          error={panelError}
          onClose={() => { setSel(null); setPanelError(null); }}
          onSubmitZaqa={submitZaqa}
          onOpenCorrect={openCorrect}
        />
      }
      panelKey={selected?.credentialHash}
      panelWidth="w-[440px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search graduate, qualification, hash..." value={q} onChange={setQ} />
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => { setSel(r.credentialHash); setPanelError(null); }}
          loading={loading}
          emptyText="No credentials match this view."
          columns={columns}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      {/* Issue corrected credential */}
      <Modal
        open={!!correctFor}
        onClose={() => setCorrectFor(null)}
        title="Issue corrected credential"
        width="max-w-xl"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setCorrectFor(null)}>Cancel</ActionBtn>
            <ActionBtn
              tone="orange"
              icon="edit"
              disabled={busy || !form.subjectName?.trim() || !form.qualification?.trim() || !form.graduationYear}
              onClick={submitCorrect}
            >
              {busy ? "Issuing…" : "Issue corrected credential"}
            </ActionBtn>
          </>
        }
      >
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
          The current credential will be <span className="font-bold">revoked on-chain as an administrative error</span>{" "}
          and replaced by a new credential with the corrected details below. The two records stay linked, the graduate
          is notified, and any open correction request is resolved. A previously validated credential will require
          ZAQA revalidation.
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Graduate name *</span>
            <input
              value={form.subjectName || ""}
              onChange={set("subjectName")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Qualification *</span>
            <input
              value={form.qualification || ""}
              onChange={set("qualification")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Graduation year *</span>
              <input
                type="number"
                min="1960"
                max="2100"
                value={form.graduationYear || ""}
                onChange={set("graduationYear")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">ZQF level</span>
              <select
                value={form.zqfLevel || ""}
                onChange={set("zqfLevel")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Credential type</span>
              <select
                value={form.credentialType || "other"}
                onChange={set("credentialType")}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
          </div>
          {correctFor?.correctionRequest?.status === "open" && (
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              <span className="font-semibold">Graduate&apos;s request:</span> {correctFor.correctionRequest.message}
            </div>
          )}
        </div>
      </Modal>
    </PortalShell>
  );
}
