"use client";

import { useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, ToolButton,
  DataTable, Pagination, KVRow, ActionBtn, TONES,
} from "../../../../components/portal/kit";
import { usePortalGuard } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";

const KPIS = [
  { icon: "file", iconTone: "softblue", label: "Total Verification Events", value: "128", delta: "18%", deltaUp: true },
  { icon: "wallet", iconTone: "softgreen", label: "Employer Checks", value: "64", delta: "21%", deltaUp: true },
  { icon: "link", iconTone: "purple", label: "Shared Links Active", value: "6", delta: "2", deltaUp: true },
  { icon: "download", iconTone: "softblue", label: "Downloads This Month", value: "34", delta: "13%", deltaUp: true },
  { icon: "clock", iconTone: "softred", label: "Pending Actions", value: "5", delta: "5", deltaUp: false },
];

const CHANNEL_ICON = {
  "Employer Portal": "building",
  Email: "send",
  "Direct Organization": "user",
  "Shared Link": "link",
};

const STATUS_TONE = { Verified: "green", Viewed: "blue", Pending: "amber", Expired: "red" };

const EVENTS = [
  { reqId: "VER/2025/05/19/1042/00128", date: "May 19, 2025", time: "10:42 AM", credential: "GCE Advanced Level (2024)", org: "ACME Recruitment Ltd.", email: "hr@acmerecruit.com", channel: "Employer Portal", status: "Verified", location: "Lagos, Nigeria", source: "Employer Portal" },
  { reqId: "VER/2025/05/18/1521/00127", date: "May 18, 2025", time: "03:21 PM", credential: "Diploma in Education (2024)", org: "St. Mary's College", email: "admissions@stmarys.edu.ng", channel: "Email", status: "Verified", location: "Benin City, Nigeria", source: "Email Request" },
  { reqId: "VER/2025/05/17/1103/00126", date: "May 17, 2025", time: "11:03 AM", credential: "NYSC Certificate (2024)", org: "NYSC Certifcation Unit", email: "verify@nysc.gov.ng", channel: "Direct Organization", status: "Verified", location: "Abuja, Nigeria", source: "Direct Verification" },
  { reqId: "VER/2025/05/16/0915/00125", date: "May 16, 2025", time: "09:15 AM", credential: "School Certificate (2024)", org: "Bright Future Schools", email: "admin@brightfuture.edu.ng", channel: "Shared Link", status: "Viewed", location: "Port Harcourt, Nigeria", source: "Link Access" },
  { reqId: "VER/2025/05/15/1648/00124", date: "May 15, 2025", time: "04:48 PM", credential: "GCE Ordinary Level (2024)", org: "Global HR Solutions", email: "backgrounds@ghrs.com", channel: "Employer Portal", status: "Verified", location: "Lagos, Nigeria", source: "Employer Portal" },
  { reqId: "VER/2025/05/14/1427/00123", date: "May 14, 2025", time: "02:27 PM", credential: "B.Sc. Mathematics (2024)", org: "University of Lagos", email: "records@unilag.edu.ng", channel: "Email", status: "Verified", location: "Lagos, Nigeria", source: "Email Request" },
  { reqId: "VER/2025/05/13/1011/00122", date: "May 13, 2025", time: "10:11 AM", credential: "NYSC Certificate (2023)", org: "HR Dept. Zenith Bank", email: "hr@zenithbank.com", channel: "Employer Portal", status: "Pending", location: "Lagos, Nigeria", source: "Employer Portal" },
  { reqId: "VER/2025/05/12/0902/00121", date: "May 12, 2025", time: "09:02 AM", credential: "Diploma in Education (2024)", org: "Greenfield Academy", email: "office@greenfield.edu.ng", channel: "Shared Link", status: "Expired", location: "Ibadan, Nigeria", source: "Link Expired" },
];

const FILTERS = [
  { label: "Date Range", value: "May 1, 2025 – May 31, 2025" },
  { label: "Credential Type", value: "All Credentials" },
  { label: "Status", value: "All Statuses" },
  { label: "Channel", value: "All Channels" },
];

function EventPanel({ ev, cred, busy, onDownloadCredential, onDownloadCertificate }) {
  // Download Center — wired to the graduate's first real credential.
  const downloads = [
    {
      key: "credential", icon: "file", tone: "softblue", label: "Credential (Official PDF)",
      sub: cred ? cred.qualification : "Original credential issued by BBACVS",
      btn: "Download Credential", onClick: onDownloadCredential, wired: true,
    },
    { key: "receipt", icon: "shieldCheck", tone: "softgreen", label: "Verification Receipt", sub: "Official verification record (PDF)", btn: "Download Receipt" },
    { key: "summary", icon: "share", tone: "purple", label: "Shareable Summary", sub: "Credential summary for sharing", btn: "Download Summary" },
    {
      key: "certificate", icon: "award", tone: "amber", label: "Verification Certificate",
      sub: cred ? `ZAQA certificate — ${cred.qualification}` : "BBACVS verification certificate",
      btn: "Download Certificate", onClick: onDownloadCertificate, wired: true,
    },
  ];

  return (
    <div>
      <SectionCard
        title="Verification Event Details"
        action={<Badge tone={STATUS_TONE[ev.status]} dot>{ev.status}</Badge>}
        className="mb-4"
      >
        <KVRow label="Request ID" value={ev.reqId} />
        <KVRow label="Date & Time" value={`${ev.date} ${ev.time} WAT`} />
        <KVRow label="Credential" value={ev.credential} />
        <KVRow label="Verified By" value={`${ev.org} — ${ev.email}`} />
        <KVRow label="Channel" value={ev.channel} />
        <KVRow label="Location / Source" value={`${ev.location} — ${ev.source}`} />
        <div className="flex items-baseline justify-between gap-3 py-1.5">
          <span className="text-[12px] text-slate-500">Status</span>
          <Badge tone={STATUS_TONE[ev.status]}>{ev.status}</Badge>
        </div>
        <KVRow label="Verification Method" value="Automated + Manual Review" />
        <KVRow label="IP Address" value="197.210.45.18" />
        <KVRow label="Notes" value="All details matched successfully." />
        <ActionBtn tone="outline" icon="fileText" full className="mt-3">
          View Verification Log
        </ActionBtn>
      </SectionCard>

      <SectionCard
        title="Download Center"
        action={<span className="text-[11px] text-slate-400">{cred ? "Your latest credential" : "No credential yet"}</span>}
        className="mb-4"
      >
        <div className="space-y-2.5">
          {downloads.map((d) => (
            <div key={d.key} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[d.tone]}`}>
                <Icon name={d.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="truncate text-[12px] font-bold text-slate-800">{d.label}</div>
                <div className="truncate text-[10.5px] text-slate-400">{d.sub}</div>
              </div>
              <button
                onClick={d.onClick}
                disabled={!d.onClick || (d.wired && (!cred || busy === d.key))}
                className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                {busy === d.key ? "Downloading…" : d.btn}
              </button>
            </div>
          ))}
        </div>
      </SectionCard>

      <ActionBtn tone="softred" icon="x" full>Disable Shared Link</ActionBtn>
    </div>
  );
}

export default function GraduateVerificationPage() {
  const { ready, user, token } = usePortalGuard(["holder"]);
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sel, setSel] = useState(EVENTS[0].reqId);

  useEffect(() => {
    if (!ready || !token) return;
    api.myCredentials(token)
      .then((res) => setCreds(res.credentials || []))
      .catch((err) => setError(err.message));
  }, [ready, token]);

  if (!ready) return null;

  const cred = creds[0] || null;
  const selected = EVENTS.find((e) => e.reqId === sel) || EVENTS[0];

  async function onDownloadCredential() {
    if (!cred) return;
    setBusy("credential");
    try { openBlob(await api.downloadPDF(token, cred.credentialHash), `credential-${cred.credentialHash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onDownloadCertificate() {
    if (!cred) return;
    setBusy("certificate");
    try { openBlob(await api.downloadVerificationCertificate(cred.credentialHash), `ZAQA-verification-${cred.credentialHash.slice(0, 10)}.pdf`); }
    catch (err) { alert(err.message); }
    finally { setBusy(null); }
  }

  return (
    <PortalShell
      portal="graduate"
      active="verification"
      title={
        <span className="inline-flex items-center gap-2.5">
          Graduate Portal – Verification Activity & Downloads
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      subtitle="Track verification activity, view requests, and download your credentials and verification records."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="outline" icon="download">Export Activity</ActionBtn>}
      panel={
        <EventPanel
          ev={selected}
          cred={cred}
          busy={busy}
          onDownloadCredential={onDownloadCredential}
          onDownloadCertificate={onDownloadCertificate}
        />
      }
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        {KPIS.map((k) => (
          <StatCard key={k.label} {...k} deltaText="vs last 30 days" />
        ))}
      </StatRow>

      {/* Filter bar */}
      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-card">
        {FILTERS.map((f) => (
          <div key={f.label}>
            <div className="mb-1 text-[11px] font-semibold text-slate-400">{f.label}</div>
            <SelectPill label={f.value} />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <ToolButton>Reset</ToolButton>
          <ToolButton icon="filter">Filter</ToolButton>
        </div>
      </div>

      <SectionCard pad="p-0">
        {error && <p className="px-4 pt-3 text-[12px] font-medium text-red-600">{error}</p>}
        <DataTable
          rowKey="reqId"
          activeKey={sel}
          onRowClick={(r) => setSel(r.reqId)}
          columns={[
            { key: "check", label: "", thClass: "w-8", render: () => <input type="checkbox" className="rounded border-slate-300" onClick={(e) => e.stopPropagation()} readOnly /> },
            {
              key: "date",
              label: "Date & Time",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-medium text-slate-700">{r.date}</span>
                  <span className="block text-[11px] text-slate-400">{r.time}</span>
                </span>
              ),
            },
            {
              key: "credential",
              label: "Credential",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Icon name="file" className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium text-slate-700">{r.credential}</span>
                </span>
              ),
            },
            {
              key: "org",
              label: "Verified By",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-medium text-slate-700">{r.org}</span>
                  <span className="block text-[11px] text-slate-400">{r.email}</span>
                </span>
              ),
            },
            {
              key: "channel",
              label: "Channel",
              render: (r) => (
                <span className="flex items-center gap-1.5 whitespace-nowrap">
                  <Icon name={CHANNEL_ICON[r.channel]} className="h-3.5 w-3.5 text-slate-400" />
                  {r.channel}
                </span>
              ),
            },
            { key: "status", label: "Status", render: (r) => <Badge tone={STATUS_TONE[r.status]}>{r.status}</Badge> },
            {
              key: "location",
              label: "Location / Request Source",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block text-slate-600">{r.location}</span>
                  <span className="block text-[11px] text-slate-400">{r.source}</span>
                </span>
              ),
            },
            {
              key: "actions",
              label: "Actions",
              render: () => (
                <span className="flex items-center gap-2.5 text-slate-400">
                  <Icon name="eye" className="h-4 w-4 hover:text-slate-600" />
                  <Icon name="download" className="h-4 w-4 hover:text-slate-600" />
                </span>
              ),
            },
          ]}
          rows={EVENTS}
        />
        <div className="flex items-center border-t border-slate-100">
          <Pagination className="flex-1" summary="Showing 1 to 8 of 128 verification events" page={1} pages={16} />
          <SelectPill label="10 / page" className="mr-3.5" />
        </div>
      </SectionCard>
    </PortalShell>
  );
}
