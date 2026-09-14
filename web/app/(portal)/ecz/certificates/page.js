"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, SelectPill,
  ToolButton, DataTable, Pagination, usePager, ActionBtn, KVRow, Modal,
  PanelHeader, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";

// Combined display status of a credential (chain status + ZAQA validation).
function displayStatus(c) {
  if (c.status === "revoked") return { label: "Revoked", tone: "red" };
  if (c.status === "pending") return { label: "Pending Issuance", tone: "amber" };
  if (c.zaqaValidation === "validated") return { label: "ZAQA Validated", tone: "green" };
  if (c.zaqaValidation === "pending") return { label: "Awaiting ZAQA", tone: "amber" };
  if (c.zaqaValidation === "rejected") return { label: "ZAQA Rejected", tone: "red" };
  if (c.zaqaValidation === "under_dispute") return { label: "Under Dispute", tone: "purple" };
  if (c.zaqaValidation === "suspicious") return { label: "Flagged", tone: "orange" };
  if (c.zaqaValidation === "suspended") return { label: "Suspended", tone: "red" };
  return { label: "Issued", tone: "green" };
}

// ECZ secondary-school qualifications and their ZQF levels.
const CERT_TYPES = [
  { label: "Grade 12 School Certificate", zqf: 4 },
  { label: "Form 4 (Junior Secondary)", zqf: 3 },
  { label: "Form 6 / GCE A-Level", zqf: 4 },
  { label: "Grade 9 Junior Secondary Certificate", zqf: 2 },
  { label: "Grade 7 Primary School Certificate", zqf: 1 },
];
const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100";
const EMPTY_FORM = { name: "", nationalId: "", holderEmail: "", qualification: CERT_TYPES[0].label, graduationYear: String(new Date().getFullYear()) };

const ZAQA_FILTERS = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Awaiting ZAQA" },
  { value: "validated", label: "Validated" },
  { value: "rejected", label: "Rejected" },
  { value: "suspicious", label: "Flagged" },
  { value: "suspended", label: "Suspended" },
  { value: "under_dispute", label: "Under Dispute" },
];

function DetailPanel({ cert, busyDownload, busySubmit, busy, onClose, onDownload, onSubmit, onTranscript, onRevoke }) {
  const st = displayStatus(cert);
  return (
    <div>
      <PanelHeader title="Certificate Details" badge={<Badge tone={st.tone} dot>{st.label}</Badge>} onClose={onClose} />

      <div className="mb-4">
        <div className="text-[11px] text-slate-400">Certificate</div>
        <div className="text-[13px] font-bold text-slate-900">
          {cert.subjectName || "—"} — {cert.qualification || "—"}
        </div>
      </div>

      <SectionCard title="Candidate Profile" className="mb-4">
        <div className="flex items-start gap-3">
          <Avatar name={cert.subjectName || "?"} size="h-10 w-10" />
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-slate-800">{cert.subjectName}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">NRC: {cert.holderNationalId || "—"}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Qualification Summary" className="mb-4">
        <KVRow label="Qualification" value={cert.qualification} />
        <KVRow label="Exam Year" value={cert.graduationYear || "—"} />
        <KVRow label="Awarding Body" value={cert.institution || "Examinations Council of Zambia"} />
        <KVRow label="Type" value={cert.credentialType || "—"} />
        <KVRow label="ZQF Level" value={cert.zqfLevel ? `ZQF ${cert.zqfLevel}` : "—"} />
        <KVRow
          label="Anchored On-chain"
          value={cert.anchorTx ? "Yes" : "Not anchored"}
        />
        {cert.zaqaRef ? <KVRow label="ZAQA Ref" value={cert.zaqaRef} /> : null}
      </SectionCard>

      {cert.correctionRequest?.message ? (
        <SectionCard title="Correction Request" className="mb-4">
          <Badge tone={cert.correctionRequest.status === "open" ? "amber" : "slate"}>{cert.correctionRequest.status}</Badge>
          <p className="mt-2 text-[12px] text-slate-600">{cert.correctionRequest.message}</p>
        </SectionCard>
      ) : null}

      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={cert.events} />
      </SectionCard>

      <div className="space-y-2.5">
        <ActionBtn
          tone="outline"
          icon="download"
          full
          disabled={busyDownload}
          onClick={() => onDownload(cert.credentialHash)}
        >
          {busyDownload ? "Downloading…" : "Download PDF"}
        </ActionBtn>
        {cert.zaqaValidation === "draft" && (
          <ActionBtn
            tone="darkgreen"
            icon="send"
            full
            disabled={busySubmit}
            onClick={() => onSubmit(cert.credentialHash)}
          >
            {busySubmit ? "Submitting…" : "Submit to ZAQA"}
          </ActionBtn>
        )}
        <ActionBtn tone="outline" icon="fileText" full disabled={busy === "transcript"} onClick={() => onTranscript(cert.credentialHash)}>
          {busy === "transcript" ? "Preparing…" : "Statement of Results (PDF)"}
        </ActionBtn>
        {cert.status === "active" && (
          <ActionBtn tone="softred" icon="revoke" full disabled={busy === "revoke"} onClick={() => onRevoke(cert)}>
            Revoke / Correct Certificate
          </ActionBtn>
        )}
      </div>
    </div>
  );
}

export default function EczCertificatesPage() {
  const { ready, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [zaqaFilter, setZaqaFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyDownload, setBusyDownload] = useState(false);
  const [busySubmit, setBusySubmit] = useState(false);
  const [busy, setBusy] = useState(null);
  // issue modal
  const [issueOpen, setIssueOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [issueError, setIssueError] = useState(null);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const [revokeFor, setRevokeFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.myIssued(token);
      setCreds(res.credentials || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onDownload(hash) {
    setBusyDownload(true);
    setError(null);
    try {
      openBlob(await api.downloadPDF(token, hash), `credential-${hash.slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyDownload(false);
    }
  }

  async function onSubmit(hash) {
    setBusySubmit(true);
    setError(null);
    try {
      await api.submitToZaqa(token, hash);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusySubmit(false);
    }
  }

  async function issue() {
    if (busy) return;
    setBusy("issue");
    setIssueError(null);
    setResult(null);
    try {
      const zqf = CERT_TYPES.find((c) => c.label === form.qualification)?.zqf || 4;
      const res = await api.issue(token, {
        holderEmail: form.holderEmail.trim(),
        claims: {
          name: form.name.trim(),
          nationalId: form.nationalId.trim() || undefined,
          qualification: form.qualification,
          graduationYear: Number(form.graduationYear),
        },
        credentialType: "secondary",
        zqfLevel: zqf,
      });
      setResult(res);
      setForm(EMPTY_FORM);
      await load();
      if (res?.credentialHash) setSel(res.credentialHash);
    } catch (err) {
      setIssueError(err.message?.replace(/\(action=.*/, "") || "Issuance failed");
    } finally {
      setBusy(null);
    }
  }

  async function transcript(hash) {
    setBusy("transcript"); setError(null);
    try { openBlob(await api.downloadTranscript(token, hash), `statement-${hash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function revoke() {
    if (!revokeFor) return;
    setBusy("revoke"); setError(null);
    try { await api.revoke(token, revokeFor.credentialHash, 3); setRevokeFor(null); await load(); }
    catch (err) { setError(err.message); setRevokeFor(null); }
    finally { setBusy(null); }
  }

  const rows = creds.filter((c) => {
    if (zaqaFilter && (c.zaqaValidation || "draft") !== zaqaFilter) return false;
    return (
      !q ||
      ((c.credentialHash || "") + (c.subjectName || "") + (c.holderNationalId || "") + (c.institution || "") + (c.qualification || ""))
        .toLowerCase()
        .includes(q.toLowerCase())
    );
  });
  const pg = usePager(rows, 10, [q, zaqaFilter]);
  const selected = creds.find((c) => c.credentialHash === sel) || null;

  const validated = creds.filter((c) => c.zaqaValidation === "validated").length;
  const pendingIssue = creds.filter((c) => c.status === "pending").length;
  const awaitingZaqa = creds.filter((c) => c.zaqaValidation === "pending").length;
  const revoked = creds.filter((c) => c.status === "revoked").length;

  const csvCols = [
    { key: "credentialHash", label: "Credential Hash" },
    { key: "subjectName", label: "Learner" },
    { key: "holderNationalId", label: "NRC" },
    { key: "qualification", label: "Qualification" },
    { key: "graduationYear", label: "Exam Year" },
    { key: "status", label: "Status" },
    { key: "zaqaValidation", label: "ZAQA State", csv: (r) => r.zaqaValidation || "draft" },
    { key: "issuedAt", label: "Issued", csv: (r) => fmtDate(r.issuedAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="certificates"
      title="ECZ Portal – Certificate Register"
      actions={
        <ActionBtn tone="darkgreen" icon="plus" onClick={() => { setIssueOpen(true); setResult(null); setIssueError(null); }}>
          Issue Certificate
        </ActionBtn>
      }
      panel={
        selected ? (
          <DetailPanel
            cert={selected}
            busyDownload={busyDownload}
            busySubmit={busySubmit}
            busy={busy}
            onClose={() => setSel(null)}
            onDownload={onDownload}
            onSubmit={onSubmit}
            onTranscript={transcript}
            onRevoke={setRevokeFor}
          />
        ) : null
      }
      panelKey={selected?.credentialHash}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="file" iconTone="softgreen" label="Certificates Issued" value={String(creds.length)} />
        <StatCard icon="checkCircle" iconTone="softgreen" label="ZAQA Validated" value={String(validated)} />
        <StatCard icon="clock" iconTone="amber" label="Pending Issuance" value={String(pendingIssue)} />
        <StatCard icon="send" iconTone="softblue" label="Awaiting ZAQA" value={String(awaitingZaqa)} />
        <StatCard icon="revoke" iconTone="softred" label="Revoked Records" value={String(revoked)} />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-96" placeholder="Search certificates by hash, learner, NRC..." value={q} onChange={setQ} />
          <SelectPill label="ZAQA State" value={zaqaFilter} onChange={setZaqaFilter} options={ZAQA_FILTERS} />
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton icon="download" onClick={() => exportCSV("ecz-certificate-register", csvCols, rows)}>Export</ToolButton>
            <ToolButton icon="refresh" onClick={load} aria-label="Refresh" />
          </div>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          loading={loading}
          emptyText="No certificates match this filter."
          columns={[
            {
              key: "no", label: "Certificate",
              render: (r) => <span className="font-semibold text-emerald-700">{r.credentialHash?.slice(0, 14)}…</span>,
            },
            {
              key: "learner", label: "Learner",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-medium text-slate-700">{r.subjectName}</span>
                  <span className="block text-[11px] text-slate-400">NRC: {r.holderNationalId || "—"}</span>
                </span>
              ),
            },
            { key: "qualification", label: "Qualification" },
            { key: "year", label: "Exam Year", render: (r) => r.graduationYear || "—" },
            { key: "issued", label: "Issue Date", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "status", label: "Status",
              render: (r) => {
                const st = displayStatus(r);
                return <Badge tone={st.tone}>{st.label}</Badge>;
              },
            },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      {/* Issue school certificate */}
      <Modal
        open={issueOpen}
        onClose={() => busy !== "issue" && setIssueOpen(false)}
        title="Issue school certificate"
        width="max-w-xl"
        footer={
          result ? (
            <ActionBtn tone="outline" onClick={() => { setIssueOpen(false); setResult(null); }}>Done</ActionBtn>
          ) : (
            <>
              <ActionBtn tone="outline" disabled={busy === "issue"} onClick={() => setIssueOpen(false)}>Cancel</ActionBtn>
              <ActionBtn
                tone="darkgreen"
                icon="award"
                disabled={busy === "issue" || !form.name.trim() || !form.holderEmail.trim()}
                className="disabled:opacity-50"
                onClick={issue}
              >
                {busy === "issue" ? "Issuing…" : "Issue certificate"}
              </ActionBtn>
            </>
          )
        }
      >
        <ErrorBanner error={issueError} />
        {result ? (
          <div className="flex flex-col items-center rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <Icon name="checkCircle" className="h-8 w-8 text-emerald-600" />
            <div className="mt-1 text-[14px] font-bold text-emerald-800">Certificate issued and anchored</div>
            {result.qrImage && /* eslint-disable-next-line @next/next/no-img-element */ (
              <img src={result.qrImage} alt="Signed QR" className="mt-3 h-48 w-48 rounded-lg border border-emerald-200 bg-white p-2" />
            )}
            <Link href={`/verify?hash=${result.credentialHash}`} className="mt-2 text-[12px] font-semibold text-emerald-700 underline">Verify this certificate →</Link>
          </div>
        ) : (
          <div className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Candidate name <span className="text-red-500">*</span></span>
              <input className={INPUT} value={form.name} onChange={set("name")} placeholder="Chanda Mwansa" />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Candidate email <span className="text-red-500">*</span></span>
              <input className={INPUT} type="email" value={form.holderEmail} onChange={set("holderEmail")} placeholder="candidate@example.com" />
              <span className="mt-1 block text-[11px] text-slate-400">The candidate signs in with this email to see the certificate.</span>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">NRC (optional)</span>
              <input className={INPUT} value={form.nationalId} onChange={set("nationalId")} placeholder="123456/78/1" />
            </label>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-700">Certificate type</span>
                <select className={INPUT} value={form.qualification} onChange={set("qualification")}>
                  {CERT_TYPES.map((c) => <option key={c.label} value={c.label}>{c.label} · ZQF {c.zqf}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-[12px] font-semibold text-slate-700">Examination year</span>
                <input className={INPUT} type="number" min="1950" max="2100" value={form.graduationYear} onChange={set("graduationYear")} />
              </label>
            </div>
          </div>
        )}
      </Modal>

      {/* Revoke / correct */}
      <Modal
        open={!!revokeFor}
        onClose={() => setRevokeFor(null)}
        title="Revoke certificate"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setRevokeFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="red" icon="revoke" disabled={busy === "revoke"} className="disabled:opacity-50" onClick={revoke}>
              {busy === "revoke" ? "Revoking…" : "Revoke on-chain"}
            </ActionBtn>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">
          Revoking <span className="font-semibold">{revokeFor?.subjectName}</span>&apos;s{" "}
          <span className="font-semibold">{revokeFor?.qualification}</span> is permanent (reason recorded: regulatory
          action). Verification will immediately show REVOKED; issue a fresh certificate for the corrected record.
        </p>
      </Modal>
    </PortalShell>
  );
}
