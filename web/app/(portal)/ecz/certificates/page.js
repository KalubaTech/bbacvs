"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, SelectPill,
  ToolButton, DataTable, Pagination, usePager, ActionBtn, KVRow,
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

const ZAQA_FILTERS = [
  { value: "draft", label: "Draft" },
  { value: "pending", label: "Awaiting ZAQA" },
  { value: "validated", label: "Validated" },
  { value: "rejected", label: "Rejected" },
  { value: "suspicious", label: "Flagged" },
  { value: "suspended", label: "Suspended" },
  { value: "under_dispute", label: "Under Dispute" },
];

function DetailPanel({ cert, busyDownload, busySubmit, onClose, onDownload, onSubmit }) {
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
        <Link
          href="/ecz/classic"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-emerald-700"
        >
          <Icon name="plus" className="h-4 w-4" />
          Issue Certificate
        </Link>
      }
      panel={
        selected ? (
          <DetailPanel
            cert={selected}
            busyDownload={busyDownload}
            busySubmit={busySubmit}
            onClose={() => setSel(null)}
            onDownload={onDownload}
            onSubmit={onSubmit}
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
    </PortalShell>
  );
}
