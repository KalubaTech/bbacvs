"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, ActionBtn, KVRow, CheckItem, Timeline, PanelHeader,
} from "../../../../components/portal/kit";

const QR_ICON = {
  ok: { icon: "checkCircle", cls: "text-emerald-500" },
  warn: { icon: "alertCircle", cls: "text-amber-500" },
  no: { icon: "xCircle", cls: "text-red-500" },
};

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

function qrState(c) {
  if (c.status === "revoked") return "no";
  return c.anchorTx ? "ok" : "warn";
}

function DetailPanel({ cert, busy, onDownload }) {
  if (!cert) {
    return <div className="py-10 text-center text-[13px] text-slate-400">No certificate selected.</div>;
  }
  const st = displayStatus(cert);
  return (
    <div>
      <PanelHeader title="Certificate Details" badge={<Badge tone={st.tone} dot>{st.label}</Badge>} />

      <div className="mb-4">
        <div className="text-[11px] text-slate-400">Credential Hash</div>
        <div className="flex items-center gap-1.5 break-all text-[13px] font-bold text-slate-900">
          {cert.credentialHash}
          <button className="shrink-0 text-slate-400 hover:text-slate-600" aria-label="Copy credential hash">
            <Icon name="clipboard" className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <SectionCard title="Candidate Profile" className="mb-4">
        <div className="flex items-start gap-3">
          <Avatar name={cert.subjectName || "?"} size="h-10 w-10" />
          <div className="min-w-0 leading-tight">
            <div className="text-[13px] font-semibold text-slate-800">{cert.subjectName}</div>
            <div className="mt-0.5 text-[12px] text-slate-500">NRC: {cert.holderNationalId || "—"}</div>
            <div className="break-all text-[12px] text-slate-500">DID: {cert.holderDID || "—"}</div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Qualification Summary" className="mb-4">
        <KVRow label="Qualification" value={cert.qualification} />
        <KVRow label="Exam Year" value={cert.graduationYear || "—"} />
        <KVRow label="Awarding Body" value={cert.institution || "Examinations Council of Zambia"} />
        <KVRow label="Type" value={cert.credentialType || "—"} />
        <KVRow label="ZQF Level" value={cert.zqfLevel ? `ZQF ${cert.zqfLevel}` : "—"} />
      </SectionCard>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <SectionCard title="Issuance History">
          <Timeline
            items={[
              cert.zaqaValidatedAt && {
                title: "ZAQA Validated", sub: cert.zaqaRef ? `Ref: ${cert.zaqaRef}` : "by ZAQA",
                time: fmtDateTime(cert.zaqaValidatedAt), state: "done",
              },
              { title: "Certificate Issued", sub: `by ${cert.institution || "ECZ"}`, time: fmtDateTime(cert.issuedAt), state: "done" },
            ].filter(Boolean)}
          />
        </SectionCard>
        <SectionCard title="Correction Requests">
          {cert.correctionRequest?.message ? (
            <div className="leading-tight">
              <div className="flex items-center gap-2">
                <Badge tone={cert.correctionRequest.status === "open" ? "amber" : "slate"}>{cert.correctionRequest.status}</Badge>
              </div>
              <p className="mt-2 text-[12px] text-slate-600">{cert.correctionRequest.message}</p>
              <div className="mt-1 text-[11px] text-slate-400">{fmtDateTime(cert.correctionRequest.requestedAt)}</div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center py-4 text-center">
              <Icon name="print" className="mb-2 h-6 w-6 text-slate-300" />
              <div className="text-[12px] text-slate-500">No correction requests for this certificate.</div>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Verification Readiness" className="mb-4">
        <CheckItem state={cert.anchorTx ? "ok" : "warn"} label="Anchored On-Chain" meta={cert.anchorTx ? `${cert.anchorTx.slice(0, 14)}…` : "Not anchored"} />
        <CheckItem
          state={cert.zaqaValidation === "validated" ? "ok" : cert.zaqaValidation === "pending" ? "warn" : "pending"}
          label="ZAQA Sync Status"
          meta={cert.zaqaValidatedAt ? `Validated ${fmtDate(cert.zaqaValidatedAt)}` : (cert.zaqaValidation || "draft")}
        />
        <div className="flex items-center justify-between gap-2 py-1.5">
          <span className="text-[12.5px] text-slate-700">CID</span>
          <span className="max-w-[180px] truncate text-[12px] font-semibold text-slate-800">{cert.cid || "—"}</span>
        </div>
        <ActionBtn tone="outline" full className="mt-2">View Verification Log</ActionBtn>
      </SectionCard>

      <SectionCard title="Certificate Preview" className="mb-4">
        <div className="flex flex-col items-center rounded-lg border border-slate-200 bg-slate-50 py-6">
          <Icon name="qr" className="h-16 w-16 text-slate-400" />
          <div className="mt-2 text-[11px] text-slate-400">Scan to verify certificate authenticity</div>
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="green" icon="print" full>Reprint</ActionBtn>
        <ActionBtn tone="orange" icon="alert" full>Suspend Record</ActionBtn>
        <ActionBtn tone="outline" icon="download" full disabled={busy} onClick={() => onDownload(cert.credentialHash)}>
          {busy ? "Downloading…" : "Download PDF"}
        </ActionBtn>
        <ActionBtn tone="outline" full>View Verification Log</ActionBtn>
      </div>
    </div>
  );
}

export default function EczCertificatesPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.myIssued(token);
      setCreds(res.credentials || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onDownload(hash) {
    setBusy(true);
    try {
      openBlob(await api.downloadPDF(token, hash), `credential-${hash.slice(0, 10)}.pdf`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  const rows = creds.filter(
    (c) => !q ||
      ((c.credentialHash || "") + (c.subjectName || "") + (c.holderNationalId || "") + (c.institution || "") + (c.qualification || ""))
        .toLowerCase().includes(q.toLowerCase())
  );
  const selected = creds.find((c) => c.credentialHash === sel) || rows[0] || creds[0] || null;

  const validated = creds.filter((c) => c.zaqaValidation === "validated").length;
  const pendingIssue = creds.filter((c) => c.status === "pending").length;
  const awaitingZaqa = creds.filter((c) => c.zaqaValidation === "pending").length;
  const revoked = creds.filter((c) => c.status === "revoked").length;

  return (
    <PortalShell
      portal="ecz"
      active="certificates"
      title="ECZ Portal – Certificate Register"
      subtitle="Manage issued certificates and track verification readiness for BBACVS qualifications."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="darkgreen" icon="plus">Issue Certificate</ActionBtn>
          <ActionBtn tone="outline">
            More Actions
            <Icon name="chevronDown" className="h-3.5 w-3.5 text-slate-400" />
          </ActionBtn>
        </>
      }
      panel={<DetailPanel cert={selected} busy={busy} onDownload={onDownload} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        <StatCard icon="file" iconTone="softgreen" label="Certificates Issued" value={creds.length} sub="All ECZ records" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Ready for Verification" value={validated} sub="ZAQA validated" />
        <StatCard icon="clock" iconTone="amber" label="Pending Issuance" value={pendingIssue} sub="Awaiting anchoring" />
        <StatCard icon="print" iconTone="softblue" label="Awaiting ZAQA" value={awaitingZaqa} sub="In validation queue" />
        <StatCard icon="shield" iconTone="softred" label="Revoked Records" value={revoked} sub="On-chain revocations" />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-96" placeholder="Search certificates by hash, learner, NRC..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <div className="ml-auto flex items-center gap-2.5">
            <ToolButton icon="download">Export</ToolButton>
            <ToolButton icon="refresh" onClick={load} />
          </div>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
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
            { key: "school", label: "School", render: (r) => r.institution || "—" },
            { key: "issued", label: "Issue Date", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "qr", label: "QR Ready", thClass: "text-center", tdClass: "text-center",
              render: (r) => {
                const s = QR_ICON[qrState(r)];
                return <Icon name={s.icon} className={`inline h-4 w-4 ${s.cls}`} />;
              },
            },
            {
              key: "status", label: "Status",
              render: (r) => {
                const st = displayStatus(r);
                return <Badge tone={st.tone}>{st.label}</Badge>;
              },
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <Pagination summary={`Showing ${rows.length} of ${creds.length} certificates`} page={1} pages={1} />
      </div>
    </PortalShell>
  );
}
