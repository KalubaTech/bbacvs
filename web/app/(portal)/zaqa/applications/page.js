"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, StatusTabs, SearchBox, ToolButton, DataTable,
  KV, WorkflowSteps, CheckItem, ActionBtn, SectionCard,
} from "../../../../components/portal/kit";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";

const STATUS_META = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Under Review", tone: "blue" },
  validated: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Returned", tone: "amber" },
  suspended: { label: "Suspended", tone: "orange" },
  under_dispute: { label: "Disputed", tone: "purple" },
};

// Design tab labels mapped onto real zaqaValidation statuses.
const TAB_DEFS = [
  { label: "Submitted", status: null }, // everything submitted to ZAQA
  { label: "Under Review", status: "pending" },
  { label: "Approved", status: "validated" },
  { label: "Returned", status: "suspicious" },
  { label: "Suspended", status: "suspended" },
  { label: "Rejected", status: "rejected" },
  { label: "Disputed", status: "under_dispute" },
];

function statusBadge(v) {
  const m = STATUS_META[v] || { label: v || "—", tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

function shortHash(h) {
  return h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—";
}

function workflowSteps(app) {
  const decided = ["validated", "rejected", "suspended"].includes(app.zaqaValidation);
  const decisionLabel = STATUS_META[app.zaqaValidation]?.label || "Pending";
  return [
    { label: "Submitted", sub: fmtDate(app.issuedAt), state: "done" },
    {
      label: "Automated Checks",
      sub: app.validationReport ? `Risk: ${app.validationReport.risk}` : "Pending",
      state: app.validationReport ? "done" : "pending",
    },
    {
      label: "Under Review",
      sub: app.zaqaValidation === "pending" ? "In progress" : "Completed",
      state: app.zaqaValidation === "pending" ? "current" : "done",
    },
    {
      label: "Decision",
      sub: decided || app.zaqaValidation === "under_dispute" ? decisionLabel : "Pending",
      state: decided ? "done" : app.zaqaValidation === "under_dispute" ? "warn" : "pending",
    },
  ];
}

function DetailPanel({ app, activity }) {
  if (!app) {
    return (
      <div>
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Application Details</h2>
        <p className="text-[13px] text-slate-400">No application selected.</p>
      </div>
    );
  }
  const auditRows = activity.filter(
    (e) => e.summary && app.subjectName && e.summary.includes(app.subjectName)
  ).slice(0, 8);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Application Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <div className="text-[11px] text-slate-400">Credential Hash</div>
          <div className="flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
            {shortHash(app.credentialHash)}
            <Icon name="file" className="h-3.5 w-3.5 text-slate-400" />
          </div>
        </div>
        {statusBadge(app.zaqaValidation)}
      </div>

      <div className="mb-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 p-3.5">
        <div className="flex gap-2.5">
          <Avatar name={app.subjectName || "?"} size="h-9 w-9" />
          <div className="min-w-0 leading-tight">
            <div className="text-[11px] text-slate-400">Holder</div>
            <div className="truncate text-[12.5px] font-semibold text-slate-800">{app.subjectName || "—"}</div>
            <div className="truncate text-[11px] text-slate-500">{app.credentialType || "credential"}</div>
          </div>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-slate-400">Issuing Institution</div>
          <div className="mt-0.5 flex items-center gap-1 text-[12.5px] font-semibold text-slate-800">
            {app.institution || "—"} <Icon name="link" className="h-3 w-3 text-blue-500" />
          </div>
          <div className="text-[11px] text-slate-500">Zambia</div>
        </div>
        <div className="leading-tight">
          <div className="text-[11px] text-slate-400">Qualification</div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-slate-800">{app.qualification || "—"}</div>
          <div className="text-[11px] text-slate-500">
            {app.zqfLevel != null ? `ZQF Level ${app.zqfLevel}` : "ZQF level not set"}
          </div>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-3 gap-x-3 gap-y-4 rounded-xl border border-slate-200 p-3.5">
        <div>
          <div className="text-[11px] text-slate-400">Current Status</div>
          <div className="mt-1">{statusBadge(app.zaqaValidation)}</div>
        </div>
        <KV label="On-chain Status" value={app.status || "—"} />
        <KV label="Credential Type" value={app.credentialType || "—"} />
        <KV label="Submitted" value={fmtDateTime(app.issuedAt)} />
        <KV label="ZAQA Reference" value={app.zaqaRef || "—"} />
        <KV
          label="Risk Level"
          value={app.validationReport ? app.validationReport.risk : "not assessed"}
        />
        {app.zaqaNote ? <KV className="col-span-3" label="ZAQA Note" value={app.zaqaNote} /> : null}
      </div>

      <SectionCard title="Application Workflow" className="mb-4" pad="p-4">
        <WorkflowSteps steps={workflowSteps(app)} />
      </SectionCard>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-1.5 text-[12px] font-semibold text-slate-800">Automated Checks</div>
          {app.validationReport ? (
            <>
              {app.validationReport.checks.map((c) => (
                <CheckItem key={c.rule} state={c.pass ? "ok" : "missing"} label={c.rule} />
              ))}
              <div className="mt-1.5 text-[11px] text-slate-500">
                Recommendation: {app.validationReport.recommendation}
              </div>
            </>
          ) : (
            <div className="py-2 text-[11.5px] text-slate-400">No automated report yet.</div>
          )}
        </div>
        <div className="rounded-xl border border-slate-200 p-3">
          <div className="mb-1.5 text-[12px] font-semibold text-slate-800">Communication History</div>
          <div className="space-y-2.5">
            {[
              app.validationReport
                ? [fmtDateTime(app.validationReport.ranAt), "Automated checks run", "by System"]
                : null,
              [fmtDateTime(app.issuedAt), "Credential submitted", `for ${app.subjectName || "holder"}`],
            ]
              .filter(Boolean)
              .map(([t, a, b], i) => (
                <div key={i} className="flex gap-2">
                  <Icon name="clock" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300" />
                  <div className="leading-tight">
                    <div className="text-[11px] text-slate-400">{t}</div>
                    <div className="text-[12px] font-medium text-slate-700">{a}</div>
                    <div className="text-[11px] text-slate-500">{b}</div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="mb-4">
        <div className="mb-2 text-[13px] font-bold text-slate-900">Audit History</div>
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60">
                {["Date & Time", "Action", "Performed By", "Details"].map((h) => (
                  <th key={h} className="px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {auditRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-[11.5px] text-slate-400">
                    No audit events for this credential yet.
                  </td>
                </tr>
              ) : (
                auditRows.map((e, i) => (
                  <tr key={i} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 text-[11.5px] text-slate-600">{fmtDateTime(e.at)}</td>
                    <td className="px-3 py-2 text-[11.5px] text-slate-600">{e.action}</td>
                    <td className="px-3 py-2 text-[11.5px] text-slate-600">{e.actor}</td>
                    <td className="px-3 py-2 text-[11.5px] text-slate-600">{e.summary}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex justify-end gap-2.5">
        <ActionBtn tone="outline">Close</ActionBtn>
        <Link
          href={`/zaqa/validation?hash=${app.credentialHash}`}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#12275c] px-3.5 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1b3576]"
        >
          <Icon name="fileText" className="h-4 w-4" />
          View Full Application
        </Link>
      </div>
    </div>
  );
}

export default function ZaqaApplicationsPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [tab, setTab] = useState("Submitted");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [creds, setCreds] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.zaqaValidationList(token);
      setCreds(res.credentials || []);
      // Accountability trail is best-effort — don't block the queue on it.
      api.activity(token).then((a) => setActivity(a.activity || [])).catch(() => {});
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const counts = {};
  for (const c of creds) counts[c.zaqaValidation] = (counts[c.zaqaValidation] || 0) + 1;
  const tabs = TAB_DEFS.map((t) => ({
    label: t.label,
    count: t.status ? counts[t.status] || 0 : creds.length,
  }));
  const activeStatus = TAB_DEFS.find((t) => t.label === tab)?.status || null;

  const rows = creds.filter((c) => {
    if (activeStatus && c.zaqaValidation !== activeStatus) return false;
    if (!q) return true;
    const hay = `${c.subjectName || ""} ${c.institution || ""} ${c.qualification || ""} ${c.credentialHash || ""}`;
    return hay.toLowerCase().includes(q.toLowerCase());
  });
  const selected = rows.find((c) => c.credentialHash === sel) || rows[0] || null;

  return (
    <PortalShell
      portal="zaqa"
      active="applications"
      title="ZAQA Portal – Applications"
      subtitle="Manage and track credential evaluation applications through the ZAQA verification process."
      user={{ name: user.name || user.email, sub: user.email }}
      panel={<DetailPanel app={selected} activity={activity} />}
      panelWidth="w-[620px]"
    >
      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-80"
            placeholder="Search by holder, institution, qualification or hash"
            value={q}
            onChange={setQ}
          />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <span className="ml-auto text-[12px] text-slate-500">
            Showing {rows.length} of {creds.length} applications
          </span>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={[
            {
              key: "credentialHash",
              label: "Credential #",
              render: (r) => <span className="font-semibold text-blue-600">{shortHash(r.credentialHash)}</span>,
            },
            { key: "subjectName", label: "Holder", render: (r) => r.subjectName || "—" },
            { key: "institution", label: "Institution", render: (r) => r.institution || "—" },
            { key: "qualification", label: "Qualification", render: (r) => r.qualification || "—" },
            { key: "status", label: "Status", render: (r) => statusBadge(r.zaqaValidation) },
            { key: "issuedAt", label: "Submitted On", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "zqfLevel",
              label: "ZQF Level",
              render: (r) => (r.zqfLevel != null ? `Level ${r.zqfLevel}` : "—"),
            },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <div className="flex items-center justify-between py-3">
          <span className="text-[12px] text-slate-500">
            Showing {rows.length} of {creds.length} applications
          </span>
        </div>
      </div>
    </PortalShell>
  );
}
