"use client";

// Suspension case workspace — built entirely on live data:
// zaqaCredentialsByStatus("suspended") ∪ zaqaValidationList("suspended"), deduped by hash.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton, DataTable,
  Pagination, usePager, KVGrid, PanelHeader, ActionBtn, Modal, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const REVOKE_REASONS = [
  { value: "1", label: "1 — Administrative error" },
  { value: "2", label: "2 — Fraud detected" },
  { value: "3", label: "3 — Regulatory action" },
  { value: "4", label: "4 — Holder request" },
  { value: "5", label: "5 — Other" },
];

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");
const riskLabel = (r) => (r ? r.charAt(0).toUpperCase() + r.slice(1) : "Unknown");
const RISK_TONE = { Critical: "red", High: "orange", Medium: "amber", Low: "green", Unknown: "slate" };
const RISK_COLORS = { Critical: CHART.red, High: CHART.orange, Medium: CHART.amber, Low: CHART.green, Unknown: CHART.slate };

export default function ZaqaSuspensionsPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [cases, setCases] = useState([]);
  const [suspendable, setSuspendable] = useState([]); // active credentials eligible for suspension
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  // modals
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendHash, setSuspendHash] = useState("");
  const [suspendReason, setSuspendReason] = useState("");
  const [reinstateOpen, setReinstateOpen] = useState(false);
  const [reinstateNote, setReinstateNote] = useState("");
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeReason, setRevokeReason] = useState("2");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [byCred, byVal, all] = await Promise.all([
        api.zaqaCredentialsByStatus(token, "suspended"),
        api.zaqaValidationList(token, "suspended"),
        api.zaqaValidationList(token),
      ]);
      const merged = new Map();
      for (const r of [...(byCred.credentials || []), ...(byVal.credentials || [])]) {
        merged.set(r.credentialHash, r);
      }
      setCases([...merged.values()]);
      setSuspendable(
        (all.credentials || []).filter(
          (c) => c.status === "active" && ["validated", "pending", "suspicious"].includes(c.zaqaValidation)
        )
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function suspend() {
    if (!suspendHash || suspendReason.trim().length < 3 || busy) return;
    setBusy("suspend");
    setError(null);
    try {
      await api.zaqaSuspend(token, suspendHash, suspendReason.trim());
      setSuspendOpen(false);
      setSuspendHash("");
      setSuspendReason("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function reinstate(c) {
    if (busy) return;
    setBusy(c.credentialHash);
    setError(null);
    try {
      await api.zaqaReinstate(token, c.credentialHash, reinstateNote);
      setReinstateOpen(false);
      setReinstateNote("");
      setSel(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function revoke(c) {
    if (busy) return;
    setBusy(c.credentialHash);
    setError(null);
    try {
      await api.zaqaRevoke(token, c.credentialHash, Number(revokeReason));
      setRevokeOpen(false);
      setSel(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const rows = cases.filter(
    (c) =>
      !q ||
      `${c.credentialHash} ${c.subjectName} ${c.qualification} ${c.institution} ${c.suspension?.reason || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);
  const selected = cases.find((c) => c.credentialHash === sel) || null;

  if (!ready) return null;

  const now = new Date();
  const thisMonth = cases.filter((c) => {
    const d = c.suspension?.suspendedAt ? new Date(c.suspension.suspendedAt) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const institutionsAffected = new Set(cases.map((c) => c.institution).filter(Boolean)).size;

  const riskCounts = {};
  for (const c of cases) {
    const r = riskLabel(c.validationReport?.risk);
    riskCounts[r] = (riskCounts[r] || 0) + 1;
  }
  const riskSegments = Object.entries(riskCounts).map(([label, value]) => ({
    label, value, color: RISK_COLORS[label] || CHART.slate,
  }));

  const columns = [
    {
      key: "credentialHash", label: "Credential",
      render: (r) => <span className="font-mono text-[12px] font-semibold text-blue-600">{shortHash(r.credentialHash)}</span>,
      csv: (r) => r.credentialHash,
    },
    { key: "subjectName", label: "Holder" },
    { key: "qualification", label: "Qualification" },
    { key: "institution", label: "Institution" },
    {
      key: "reason", label: "Suspension Reason",
      render: (r) => r.suspension?.reason || r.zaqaNote || "—",
      csv: (r) => r.suspension?.reason || r.zaqaNote || "",
    },
    {
      key: "suspendedAt", label: "Suspended On",
      render: (r) => fmtDate(r.suspension?.suspendedAt),
      csv: (r) => r.suspension?.suspendedAt || "",
    },
    {
      key: "suspendedBy", label: "Suspended By",
      render: (r) => r.suspension?.suspendedBy || "—",
      csv: (r) => r.suspension?.suspendedBy || "",
    },
    {
      key: "risk", label: "Risk",
      render: (r) => {
        const rl = riskLabel(r.validationReport?.risk);
        return <Badge tone={RISK_TONE[rl] || "slate"}>{rl}</Badge>;
      },
      csv: (r) => riskLabel(r.validationReport?.risk),
    },
  ];

  const panel = selected ? (
    <div>
      <PanelHeader
        title="Suspension Case"
        badge={<Badge tone="orange" dot>Suspended</Badge>}
        onClose={() => setSel(null)}
      />
      <div className="mb-4">
        <div className="text-[11px] text-slate-400">Credential</div>
        <div className="text-[13px] font-semibold text-slate-800">
          {selected.subjectName || "—"} — {selected.qualification || "—"}
        </div>
      </div>

      <SectionCard title="Case Facts" className="mb-4" pad="p-4">
        <KVGrid
          cols={2}
          items={[
            { label: "Holder", value: selected.subjectName || "—" },
            { label: "Institution", value: selected.institution || "—" },
            { label: "Qualification", value: selected.qualification || "—" },
            { label: "ZQF Level", value: selected.zqfLevel != null ? `Level ${selected.zqfLevel}` : "—" },
            { label: "Suspension Reason", value: selected.suspension?.reason || "—" },
            { label: "Suspended On", value: fmtDateTime(selected.suspension?.suspendedAt) },
            { label: "Suspended By", value: selected.suspension?.suspendedBy || "—" },
            { label: "ZAQA Reference", value: selected.zaqaRef || "Not assigned" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Case History" className="mb-4" pad="p-4">
        <CaseTimeline events={selected.events} />
      </SectionCard>

      <div className="space-y-2.5">
        <ActionBtn
          tone="green" icon="checkCircle" full
          disabled={!!busy}
          className="disabled:opacity-50"
          onClick={() => setReinstateOpen(true)}
        >
          Reinstate
        </ActionBtn>
        <ActionBtn
          tone="softred" icon="revoke" full
          disabled={!!busy}
          className="disabled:opacity-50"
          onClick={() => setRevokeOpen(true)}
        >
          Revoke On-Chain
        </ActionBtn>
      </div>
    </div>
  ) : null;

  return (
    <PortalShell
      portal="zaqa"
      active="suspensions"
      title="Suspensions"
      actions={
        <ActionBtn tone="navy" icon="pause" onClick={() => setSuspendOpen(true)}>
          Suspend a Credential
        </ActionBtn>
      }
      panel={panel}
      panelKey={selected?.credentialHash}
      panelWidth="w-[420px]"
    >
      <StatRow cols={4}>
        <StatCard icon="pause" iconTone="softred" label="Active Suspensions" value={loading ? "…" : cases.length} />
        <StatCard icon="clock" iconTone="amber" label="Suspended This Month" value={loading ? "…" : thisMonth} />
        <StatCard icon="bank" iconTone="purple" label="Institutions Affected" value={loading ? "…" : institutionsAffected} />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="Eligible To Suspend" value={loading ? "…" : suspendable.length} />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard title={`Suspended Credentials (${cases.length})`} className="mb-4" pad="px-4 pb-1 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search suspended credentials..." value={q} onChange={setQ} />
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-suspensions", columns, rows)}
            disabled={rows.length === 0}
            className="disabled:opacity-50"
          >
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          loading={loading}
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => setSel(r.credentialHash)}
          columns={columns}
          rows={pg.rows}
          emptyText="No suspended credentials."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Suspensions by Risk Level" pad="p-4">
          {cases.length ? (
            <div className="flex flex-col items-center gap-5 sm:flex-row">
              <Donut segments={riskSegments} size={140} thickness={18} centerTitle={String(cases.length)} centerSub="Total" />
              <Legend
                className="min-w-0 flex-1"
                items={riskSegments.map((s) => ({
                  label: s.label, color: s.color,
                  value: `${s.value} (${((s.value / cases.length) * 100).toFixed(1)}%)`,
                }))}
              />
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No suspended credentials.</div>
          )}
        </SectionCard>

        <SectionCard title="Suspensions by Institution" pad="p-4">
          {cases.length ? (
            <div className="space-y-2">
              {Object.entries(
                cases.reduce((m, c) => {
                  const k = c.institution || "Unknown";
                  m[k] = (m[k] || 0) + 1;
                  return m;
                }, {})
              )
                .sort(([, a], [, b]) => b - a)
                .map(([name, n]) => (
                  <div key={name} className="flex items-center justify-between gap-3 border-b border-slate-50 pb-1.5 last:border-0">
                    <span className="min-w-0 truncate text-[12.5px] text-slate-700">{name}</span>
                    <Badge tone="slate">{n}</Badge>
                  </div>
                ))}
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No suspended credentials.</div>
          )}
        </SectionCard>
      </div>

      {/* Suspend-a-credential modal */}
      <Modal
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        title="Suspend a Credential"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setSuspendOpen(false)}>Cancel</ActionBtn>
            <ActionBtn
              tone="orange" icon="pause"
              disabled={!!busy || !suspendHash || suspendReason.trim().length < 3}
              className="disabled:opacity-50"
              onClick={suspend}
            >
              {busy === "suspend" ? "Suspending…" : "Suspend"}
            </ActionBtn>
          </>
        }
      >
        <label className="mb-3 block">
          <span className="text-[11px] font-medium text-slate-400">
            Credential<span className="text-red-500"> *</span>
          </span>
          <select
            value={suspendHash}
            onChange={(e) => setSuspendHash(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Select an active credential…</option>
            {suspendable.map((c) => (
              <option key={c.credentialHash} value={c.credentialHash}>
                {(c.subjectName || "Unknown") + " — " + (c.qualification || "credential") + " (" + shortHash(c.credentialHash) + ")"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">
            Suspension reason<span className="text-red-500"> *</span>
          </span>
          <textarea
            rows={3}
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            maxLength={500}
            placeholder="Why is this credential being suspended?"
            className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </Modal>

      {/* Reinstate confirmation modal */}
      <Modal
        open={reinstateOpen && !!selected}
        onClose={() => setReinstateOpen(false)}
        title="Reinstate Credential"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setReinstateOpen(false)}>Cancel</ActionBtn>
            <ActionBtn
              tone="green" icon="checkCircle"
              disabled={!!busy}
              className="disabled:opacity-50"
              onClick={() => reinstate(selected)}
            >
              {busy ? "Reinstating…" : "Confirm Reinstatement"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          Lift the suspension on <span className="font-semibold">{selected?.subjectName}</span>&apos;s{" "}
          <span className="font-semibold">{selected?.qualification}</span>. It returns to{" "}
          {selected?.zaqaRef ? "validated status" : "the validation queue"} and both parties are notified.
        </p>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">Reinstatement note (optional)</span>
          <textarea
            rows={2}
            value={reinstateNote}
            onChange={(e) => setReinstateNote(e.target.value)}
            maxLength={500}
            placeholder="Recorded in the case history…"
            className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </Modal>

      {/* Revoke modal */}
      <Modal
        open={revokeOpen && !!selected}
        onClose={() => setRevokeOpen(false)}
        title="Revoke Credential On-Chain"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setRevokeOpen(false)}>Cancel</ActionBtn>
            <ActionBtn
              tone="red" icon="revoke"
              disabled={!!busy}
              className="disabled:opacity-50"
              onClick={() => revoke(selected)}
            >
              {busy ? "Revoking…" : "Revoke Permanently"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          Revoke <span className="font-semibold">{selected?.subjectName}</span>&apos;s{" "}
          <span className="font-semibold">{selected?.qualification}</span> on-chain. Every future verification
          immediately shows <span className="font-semibold text-red-600">REVOKED</span>. This cannot be undone.
        </p>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">
            Reason code<span className="text-red-500"> *</span>
          </span>
          <select
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {REVOKE_REASONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </label>
      </Modal>
    </PortalShell>
  );
}
