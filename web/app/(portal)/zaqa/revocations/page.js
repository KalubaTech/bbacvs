"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, TabBar, KVRow, ActionBtn, Toggle, TONES,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_TONE = { "Under Review": "amber", Revoked: "red" };

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");
const caseStatus = (c) => (c.status === "revoked" ? "Revoked" : "Under Review");
const caseReason = (c) =>
  c.zaqaNote || (c.status === "revoked" ? "Revoked on-chain by ZAQA" : "Rejected in national validation");

function CardLink({ children }) {
  return <button className="text-[12px] font-semibold text-blue-600 hover:underline">{children}</button>;
}

function FieldLabel({ children, required }) {
  return (
    <div className="mb-1 text-[11px] font-medium text-slate-500">
      {children}
      {required && <span className="text-red-500"> *</span>}
    </div>
  );
}

function FakeInput({ value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700">
      {value}
    </div>
  );
}

function FakeTextarea({ value }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12.5px] leading-relaxed text-slate-700">
      {value}
    </div>
  );
}

function activityIcon(action = "") {
  if (action.includes("revoke")) return { icon: "alert", tone: "red" };
  if (action.includes("validated")) return { icon: "check", tone: "green" };
  if (action.includes("rejected") || action.includes("suspended") || action.includes("suspicious")) return { icon: "alert", tone: "amber" };
  return { icon: "file", tone: "blue" };
}

function DetailPanel({ c, officer, onRevoke, busy }) {
  const [tab, setTab] = useState("Case Details");
  const status = caseStatus(c);
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Revocation Review</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <div className="text-[13px] font-bold text-slate-900">Case: {shortHash(c.credentialHash)}</div>
        <Badge tone={STATUS_TONE[status]} dot>{status}</Badge>
      </div>

      <div className="mb-4">
        <TabBar tabs={["Case Details", "Evidence", "History"]} active={tab} onChange={setTab} />
      </div>

      <SectionCard title="Revocation Information" className="mb-4">
        <div className="divide-y divide-slate-100">
          <KVRow label="Credential Hash" value={shortHash(c.credentialHash)} />
          <div className="flex items-center justify-between gap-3 py-1.5">
            <span className="text-[12px] text-slate-500">Holder</span>
            <AvatarName name={c.subjectName || "Unknown"} />
          </div>
          <KVRow label="Qualification" value={c.qualification || "—"} />
          <KVRow label="Institution" value={c.institution || "—"} />
          <KVRow label="ZQF Level" value={c.zqfLevel ? `ZQF ${c.zqfLevel}` : "—"} />
        </div>
      </SectionCard>

      <div className="mb-4 space-y-3.5">
        <div>
          <FieldLabel required>Revocation Reason</FieldLabel>
          <FakeInput value={caseReason(c)} />
        </div>
        <div>
          <FieldLabel>Detailed Description</FieldLabel>
          <FakeTextarea
            value={
              c.zaqaNote ||
              (c.status === "revoked"
                ? "This credential has been revoked on-chain. Every future verification immediately shows REVOKED."
                : "This credential was rejected in national validation and is awaiting a final revocation decision.")
            }
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel required>Issued Date</FieldLabel>
            <FakeInput value={fmtDate(c.issuedAt)} />
          </div>
          <div>
            <FieldLabel required>Approval Level</FieldLabel>
            <FakeInput value="ZAQA National" />
          </div>
        </div>
        <div>
          <FieldLabel>Reviewing Officer</FieldLabel>
          <div className="rounded-lg border border-slate-200 px-3 py-2">
            <AvatarName name={officer.name} sub={officer.sub} />
          </div>
        </div>
      </div>

      <SectionCard title="Notifications" className="mb-4">
        <div className="space-y-2.5">
          {[`Notify Issuer (${c.institution || "—"})`, `Notify Holder (${c.subjectName || "—"})`].map((label) => (
            <div key={label} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[12.5px] text-slate-700">{label}</span>
              <Toggle on />
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-2 gap-2">
        <ActionBtn
          tone="navy" icon="check"
          disabled={busy || c.status === "revoked"}
          className={busy || c.status === "revoked" ? "opacity-50" : ""}
          onClick={() => onRevoke(c)}
        >
          {busy ? "Revoking…" : c.status === "revoked" ? "Already Revoked" : "Confirm Revocation"}
        </ActionBtn>
        <ActionBtn tone="outline" icon="file">Save Draft Decision</ActionBtn>
        <ActionBtn tone="softblue" icon="refresh">Reopen Investigation</ActionBtn>
        <ActionBtn tone="softred" icon="trash">Dismiss Case</ActionBtn>
      </div>
    </div>
  );
}

export default function ZaqaRevocationsPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [creds, setCreds] = useState([]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.zaqaValidationList(token);
      setCreds(res.credentials || []);
    } catch (err) { setError(err.message); }
    // Activity trail is best-effort; don't block the page.
    api.activity(token, "zaqa.").then((a) => setActivity(a.activity || [])).catch(() => {});
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function revoke(c) {
    if (!confirm("Revoke this credential on-chain? Verification will immediately show REVOKED.")) return;
    setBusy(c.credentialHash);
    try { await api.zaqaRevoke(token, c.credentialHash); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const cases = creds.filter((c) => c.status === "revoked" || c.zaqaValidation === "rejected");
  const revokedCount = cases.filter((c) => c.status === "revoked").length;
  const pendingCount = cases.length - revokedCount;
  const appealsCount = creds.filter((c) => c.zaqaValidation === "under_dispute").length;

  const rows = cases.filter(
    (c) =>
      !q ||
      `${c.credentialHash} ${c.subjectName} ${c.qualification} ${c.institution} ${c.zaqaNote}`
        .toLowerCase().includes(q.toLowerCase())
  );
  const selected = cases.find((c) => c.credentialHash === sel) || rows[0] || null;

  const donutSegments = [
    { label: "Revoked on-chain", value: revokedCount, color: CHART.red },
    { label: "Rejected — pending revocation", value: pendingCount, color: CHART.orange },
  ].filter((s) => s.value > 0);
  const donutLegend = donutSegments.map((s) => ({
    label: s.label, color: s.color,
    value: `${s.value} (${cases.length ? ((s.value / cases.length) * 100).toFixed(1) : 0}%)`,
  }));

  return (
    <PortalShell
      portal="zaqa"
      active="revocations"
      title="ZAQA Portal – Revocations"
      subtitle="Manage credential revocations, review cases, and track enforcement actions across the BBACVS platform."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="plus">New Revocation Case</ActionBtn>}
      panel={
        selected ? (
          <DetailPanel
            c={selected}
            officer={{ name: user.name || user.email, sub: user.email }}
            onRevoke={revoke}
            busy={busy === selected.credentialHash}
          />
        ) : null
      }
      panelWidth="w-[400px]"
    >
      <StatRow cols={4}>
        <StatCard icon="revoke" iconTone="softred" label="Revoked Credentials" value={revokedCount} sub="Revoked on-chain" />
        <StatCard icon="clock" iconTone="amber" label="Pending Revocation Review" value={pendingCount} sub="Rejected, not yet revoked" />
        <StatCard icon="scale" iconTone="purple" label="Under Dispute" value={appealsCount} sub="Disputed credentials" />
        <StatCard icon="file" iconTone="softblue" label="Credentials Tracked" value={creds.length} sub="All submitted to ZAQA" />
      </StatRow>

      {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}

      <SectionCard title={`Revocation Cases (${cases.length})`} className="mb-4" pad="px-4 pb-1 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-72" placeholder="Search revocation cases..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={[
            { key: "credentialHash", label: "Credential", render: (r) => <span className="font-semibold text-blue-600">{shortHash(r.credentialHash)}</span> },
            { key: "subjectName", label: "Holder", render: (r) => <AvatarName name={r.subjectName || "Unknown"} /> },
            { key: "qualification", label: "Qualification" },
            { key: "institution", label: "Institution" },
            { key: "reason", label: "Revocation Reason", render: (r) => caseReason(r) },
            { key: "issuedAt", label: "Issued", render: (r) => fmtDate(r.issuedAt) },
            { key: "zqfLevel", label: "ZQF Level", render: (r) => (r.zqfLevel ? <Badge tone="softblue">ZQF {r.zqfLevel}</Badge> : "—") },
            { key: "status", label: "Status", render: (r) => { const s = caseStatus(r); return <Badge tone={STATUS_TONE[s]}>{s}</Badge>; } },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${cases.length} cases`} page={1} pages={1} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Revocation Case Status" action={<CardLink>View full analytics →</CardLink>}>
          {cases.length ? (
            <div className="flex items-center gap-6">
              <Donut segments={donutSegments} size={150} thickness={20} centerTitle={String(cases.length)} centerSub="Total" />
              <Legend className="flex-1" items={donutLegend} />
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Recent ZAQA Activity" action={<CardLink>View all</CardLink>}>
          {activity.length ? (
            <div className="space-y-3.5">
              {activity.slice(0, 6).map((a, i) => {
                const ic = activityIcon(a.action);
                return (
                  <div key={i} className="flex gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[ic.tone]}`}>
                      <Icon name={ic.icon} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-slate-800">{a.action}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(a.at)}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-slate-500">{a.summary}{a.actor ? ` — ${a.actor}` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}
