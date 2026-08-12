"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, TabBar, SearchBox, SelectPill,
  ToolButton, DataTable, Pagination, KVGrid, KVRow, CheckItem, ActionBtn,
} from "../../../../components/portal/kit";
import { Donut, CHART } from "../../../../components/portal/charts";
import { api, openBlob } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

const STATUS_TONES = { approved: "green", pending: "amber", suspended: "red" };
const STATUS_LABELS = { approved: "Approved", pending: "Pending Review", suspended: "Suspended" };

const COMPLIANCE_ROWS = [
  ["Governance & Management", "90%"],
  ["Infrastructure & Facilities", "85%"],
  ["Training Delivery", "88%"],
  ["Assessment & QA", "83%"],
  ["Student Support Services", "84%"],
];

function shortId(id) {
  return String(id || "").slice(-8).toUpperCase();
}
function shortAddr(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
}

function PanelCard({ title, chip, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${className}`}>
      {title && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
          {chip}
        </div>
      )}
      {children}
    </div>
  );
}

function DetailPanel({ inst, tab, setTab, busy, onApprove, onReject, onViewDoc }) {
  const programmes = inst.accreditedPrograms || [];
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Provider Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-3 flex items-start gap-3">
        <Avatar name={inst.institution} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-bold text-slate-900">{inst.institution}</span>
            <Badge tone={STATUS_TONES[inst.heaStatus] || "slate"}>
              {STATUS_LABELS[inst.heaStatus] || inst.heaStatus}
            </Badge>
          </div>
          <div className="mt-0.5 text-[11.5px] text-slate-500">
            TEVET provider · {inst.selfRegistered ? "Self-registered" : "Registered by TEVETA"}
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Provider ID", value: shortId(inst.id) },
            { label: "Sector", value: "TEVET" },
            { label: "Wallet Address", value: shortAddr(inst.walletAddress) },
            {
              label: "On-chain",
              value: inst.onChain ? <Badge tone="green">Authorised</Badge> : <Badge tone="amber">Pending</Badge>,
            },
            { label: "Submitted Date", value: fmtDate(inst.createdAt) },
            { label: "Approved By", value: inst.approvedBy || "—" },
          ]}
        />
      </div>

      <div className="mb-4">
        <TabBar
          tabs={[
            "Overview",
            { label: "Documents", count: inst.hasAccreditationDoc ? 1 : 0 },
            "Site Visit",
            "History",
            "Notes",
          ]}
          active={tab}
          onChange={setTab}
          accent="border-orange-500 text-orange-600"
        />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2.5">
        <PanelCard title="Accredited Programmes" chip={<Badge tone="orange">{programmes.length}</Badge>}>
          {programmes.length > 0 ? (
            programmes.slice(0, 6).map((p) => <CheckItem key={p} label={p} />)
          ) : (
            <p className="text-[11.5px] leading-relaxed text-slate-500">
              No accredited programmes recorded yet.
            </p>
          )}
          {programmes.length > 6 && (
            <div className="mt-1 text-[11px] text-slate-400">+{programmes.length - 6} more</div>
          )}
        </PanelCard>
        <PanelCard title="Regulator Notes">
          <p className="text-[11.5px] leading-relaxed text-slate-600">
            {inst.heaNote || "No regulator notes recorded for this provider."}
          </p>
        </PanelCard>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <PanelCard title="Site Visit Status" chip={<Badge tone="amber">Scheduled</Badge>}>
          <KVRow label="Date" value="May 24, 2025" />
          <KVRow label="Lead Inspector" value="Mwansa Chileshe" />
          <button className="mt-2 block text-[11px] font-semibold text-blue-600">View Site Visit Plan</button>
        </PanelCard>
        <PanelCard title="Compliance Score">
          <div className="mb-2 flex justify-center">
            <Donut
              size={92}
              thickness={12}
              centerTitle="86%"
              centerSub="Compliant"
              segments={[
                { value: 86, color: CHART.green, label: "Compliant" },
                { value: 14, color: "#e2e8f0", label: "Gap" },
              ]}
            />
          </div>
          <div className="space-y-0.5">
            {COMPLIANCE_ROWS.map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-slate-500">{label}</span>
                <span className="shrink-0 font-semibold text-slate-800">{value}</span>
              </div>
            ))}
          </div>
        </PanelCard>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn
          tone="green"
          icon="check"
          full
          className="disabled:opacity-50"
          disabled={busy === inst.id}
          onClick={() => onApprove(inst.id)}
        >
          {busy === inst.id ? "Approving…" : "Recommend Approval"}
        </ActionBtn>
        <ActionBtn
          tone="outline"
          icon="fileText"
          full
          className="disabled:opacity-50"
          disabled={!inst.hasAccreditationDoc}
          onClick={() => onViewDoc(inst.id)}
        >
          View Accreditation Doc
        </ActionBtn>
        <ActionBtn tone="softpurple" icon="calendar" full>Schedule Site Visit</ActionBtn>
        <ActionBtn tone="softorange" full>Return Application</ActionBtn>
        <ActionBtn
          tone="red"
          icon="x"
          full
          className="col-span-2 disabled:opacity-50"
          disabled={busy === inst.id}
          onClick={() => onReject(inst.id)}
        >
          Reject Application
        </ActionBtn>
      </div>
    </div>
  );
}

export default function TevetaProgrammesPage() {
  const { ready, user, token } = usePortalGuard(["teveta"]);
  const [insts, setInsts] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [panelTab, setPanelTab] = useState("Overview");

  const load = useCallback(async () => {
    try {
      const [all, pend] = await Promise.all([api.tevetaInstitutions(token), api.tevetaPending(token)]);
      const byId = new Map();
      for (const i of [...(pend.pending || []), ...(all.institutions || [])]) {
        if (!byId.has(String(i.id))) byId.set(String(i.id), i);
      }
      setInsts([...byId.values()]);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function approve(id) {
    setBusy(id);
    setError(null);
    try {
      const r = await api.tevetaApprove(token, id);
      if (r.warning) setError(r.warning);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):");
    if (reason === null) return;
    setBusy(id);
    setError(null);
    try {
      await api.tevetaReject(token, id, reason);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function viewDoc(id) {
    try {
      openBlob(await api.accreditationDoc(token, "teveta", id));
    } catch (err) {
      setError(err.message);
    }
  }

  const rows = insts.filter(
    (r) =>
      !q ||
      `${r.institution || ""} ${r.heaStatus || ""} ${(r.accreditedPrograms || []).join(" ")}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const selected = rows.find((r) => String(r.id) === sel) || rows[0] || null;

  const counts = {
    total: insts.length,
    pending: insts.filter((i) => i.heaStatus === "pending").length,
    approved: insts.filter((i) => i.heaStatus === "approved").length,
    suspended: insts.filter((i) => i.heaStatus === "suspended").length,
    onChain: insts.filter((i) => i.onChain).length,
    selfReg: insts.filter((i) => i.selfRegistered).length,
  };

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="programmes"
      user={{ name: user.name || user.email, sub: user.email }}
      title="TEVETA Portal – Programme Accreditation"
      subtitle="Review and manage accreditation of TVET providers and their programmes."
      actions={
        <>
          <ActionBtn tone="orange" icon="plus">New Programme Application</ActionBtn>
          <SelectPill label="All Time" />
        </>
      }
      panel={
        selected ? (
          <DetailPanel
            inst={selected}
            tab={panelTab}
            setTab={setPanelTab}
            busy={busy}
            onApprove={approve}
            onReject={reject}
            onViewDoc={viewDoc}
          />
        ) : null
      }
      panelWidth="w-[420px]"
    >
      <StatRow cols={6}>
        <StatCard icon="fileText" iconTone="softblue" label="Registered Providers" value={counts.total} sub="TEVET institution registry" />
        <StatCard icon="clock" iconTone="amber" label="Pending Approval" value={counts.pending} sub="Awaiting TEVETA decision" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Approved Providers" value={counts.approved} sub="Accredited to issue" />
        <StatCard icon="pause" iconTone="softred" label="Suspended" value={counts.suspended} sub="Issuance suspended" />
        <StatCard icon="shieldCheck" iconTone="purple" label="On-chain Authorised" value={counts.onChain} sub="GovernanceSafe authorised" />
        <StatCard icon="inbox" iconTone="orange" label="Self-Registered" value={counts.selfReg} sub="Applied via public portal" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox
            className="w-80"
            placeholder="Search by provider, programme, status..."
            value={q}
            onChange={setQ}
          />
          <SelectPill label="All Provinces" />
          <SelectPill label="All Trade Areas" />
          <SelectPill label="All Statuses" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="refresh" onClick={load} />
        </div>
        {error && <div className="mb-2 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={selected?.id ?? null}
          onRowClick={(r) => setSel(String(r.id))}
          columns={[
            { key: "id", label: "Provider ID", render: (r) => <span className="font-semibold text-blue-600">{shortId(r.id)}</span> },
            { key: "institution", label: "Provider" },
            {
              key: "programmes",
              label: "Accredited Programmes",
              render: (r) => (
                <span className="block max-w-[260px] truncate">
                  {(r.accreditedPrograms || []).join(", ") || "—"}
                </span>
              ),
            },
            {
              key: "origin",
              label: "Origin",
              render: (r) => (
                <Badge tone={r.selfRegistered ? "blue" : "slate"}>
                  {r.selfRegistered ? "Self-registered" : "TEVETA-registered"}
                </Badge>
              ),
            },
            { key: "createdAt", label: "Submitted", render: (r) => fmtDate(r.createdAt) },
            {
              key: "onChain",
              label: "On-chain",
              render: (r) =>
                r.onChain ? (
                  <Badge tone="green" icon="check">Authorised</Badge>
                ) : (
                  <Badge tone="amber" icon="clock">Pending</Badge>
                ),
            },
            {
              key: "heaStatus",
              label: "Status",
              render: (r) => (
                <Badge tone={STATUS_TONES[r.heaStatus] || "slate"}>
                  {STATUS_LABELS[r.heaStatus] || r.heaStatus}
                </Badge>
              ),
            },
            { key: "action", label: "Action", render: () => <SelectPill label="View" className="!px-2.5 !py-1" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 && (
              <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            )
          }
        />
        <Pagination
          summary={`Showing ${rows.length ? 1 : 0} to ${rows.length} of ${rows.length} providers`}
          page={1}
          pages={1}
        />
      </div>
    </PortalShell>
  );
}
