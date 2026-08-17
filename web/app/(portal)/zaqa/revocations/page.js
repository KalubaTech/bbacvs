"use client";

// Revocation case workspace — built on live data: zaqaCredentialsByStatus("revoked").
// Reason codes mirror the on-chain revocation registry (1–5).

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton, DataTable,
  Pagination, usePager, KVGrid, PanelHeader, ActionBtn, Modal, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const REASON_LABEL = {
  1: "Administrative error",
  2: "Fraud detected",
  3: "Regulatory action",
  4: "Holder request",
  5: "Other",
};
const REASON_COLORS = { 1: CHART.blue, 2: CHART.red, 3: CHART.purple, 4: CHART.amber, 5: CHART.slate };

const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-4)}` : "—");

function CopyHash({ hash }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex max-w-full items-center gap-1.5">
      <Link
        href={`/zaqa/validation?hash=${hash}`}
        className="break-all font-mono text-[11.5px] font-semibold text-blue-600 hover:underline"
      >
        {hash}
      </Link>
      <button
        type="button"
        aria-label="Copy replacement hash"
        className="shrink-0 text-slate-400 hover:text-slate-600"
        onClick={() => {
          navigator.clipboard?.writeText(hash).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Icon name="check" className="h-3.5 w-3.5 text-emerald-500" /> : <Icon name="file" className="h-3.5 w-3.5" />}
      </button>
    </span>
  );
}

export default function ZaqaRevocationsPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [cases, setCases] = useState([]);
  const [revocable, setRevocable] = useState([]); // active credentials for the "New revocation" modal
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  // "New revocation" modal
  const [revokeOpen, setRevokeOpen] = useState(false);
  const [revokeHash, setRevokeHash] = useState("");
  const [revokeReason, setRevokeReason] = useState("2");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [rev, all] = await Promise.all([
        api.zaqaCredentialsByStatus(token, "revoked"),
        api.zaqaValidationList(token),
      ]);
      setCases(rev.credentials || []);
      setRevocable((all.credentials || []).filter((c) => c.status === "active"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function revoke() {
    if (!revokeHash || busy) return;
    setBusy("revoke");
    setError(null);
    try {
      await api.zaqaRevoke(token, revokeHash, Number(revokeReason));
      setRevokeOpen(false);
      setRevokeHash("");
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
      `${c.credentialHash} ${c.subjectName} ${c.qualification} ${c.institution} ${REASON_LABEL[c.reasonCode] || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);
  const selected = cases.find((c) => c.credentialHash === sel) || null;

  if (!ready) return null;

  const fraudCount = cases.filter((c) => c.reasonCode === 2).length;
  const supersededCount = cases.filter((c) => c.supersededBy).length;

  const reasonCounts = {};
  for (const c of cases) {
    const k = c.reasonCode || 5;
    reasonCounts[k] = (reasonCounts[k] || 0) + 1;
  }
  const reasonSegments = Object.entries(reasonCounts).map(([code, value]) => ({
    label: REASON_LABEL[code] || `Code ${code}`,
    value,
    color: REASON_COLORS[code] || CHART.slate,
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
      key: "reasonCode", label: "Revocation Reason",
      render: (r) => <Badge tone={r.reasonCode === 2 ? "red" : "slate"}>{REASON_LABEL[r.reasonCode] || "—"}</Badge>,
      csv: (r) => REASON_LABEL[r.reasonCode] || "",
    },
    { key: "issuedAt", label: "Issued", render: (r) => fmtDate(r.issuedAt), csv: (r) => r.issuedAt || "" },
    {
      key: "supersededBy", label: "Superseded By",
      render: (r) => (r.supersededBy ? <span className="font-mono text-[11.5px]">{shortHash(r.supersededBy)}</span> : "—"),
      csv: (r) => r.supersededBy || "",
    },
  ];

  const panel = selected ? (
    <div>
      <PanelHeader
        title="Revocation Case"
        badge={<Badge tone="red" dot>Revoked</Badge>}
        onClose={() => setSel(null)}
      />
      <div className="mb-4">
        <div className="text-[11px] text-slate-400">Credential Hash</div>
        <div className="break-all font-mono text-[12px] font-semibold text-slate-800">{selected.credentialHash}</div>
      </div>

      <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3.5">
        <div className="text-[13px] font-bold text-red-700">
          Revoked — {REASON_LABEL[selected.reasonCode] || "reason not recorded"}
        </div>
        <div className="mt-0.5 text-[12px] text-red-600">
          The on-chain anchor is revoked; every verification now shows REVOKED.
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
            { label: "Reason Code", value: `${selected.reasonCode ?? "—"} — ${REASON_LABEL[selected.reasonCode] || "not recorded"}` },
            { label: "Issued", value: fmtDateTime(selected.issuedAt) },
            { label: "ZAQA Reference", value: selected.zaqaRef || "Not assigned" },
            { label: "Framework Version", value: selected.frameworkVersion || "—" },
          ]}
        />
        {selected.supersededBy && (
          <div className="mt-3 border-t border-slate-100 pt-3">
            <div className="text-[11px] font-medium text-slate-400">Replacement credential</div>
            <div className="mt-1">
              <CopyHash hash={selected.supersededBy} />
            </div>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Case History" pad="p-4">
        <CaseTimeline events={selected.events} />
      </SectionCard>
    </div>
  ) : null;

  return (
    <PortalShell
      portal="zaqa"
      active="revocations"
      title="Revocations"
      actions={
        <ActionBtn tone="navy" icon="plus" onClick={() => setRevokeOpen(true)}>
          New Revocation
        </ActionBtn>
      }
      panel={panel}
      panelKey={selected?.credentialHash}
      panelWidth="w-[420px]"
    >
      <StatRow cols={4}>
        <StatCard icon="revoke" iconTone="softred" label="Revoked Credentials" value={loading ? "…" : cases.length} sub="Revoked on-chain" />
        <StatCard icon="alert" iconTone="softred" label="Fraud Revocations" value={loading ? "…" : fraudCount} sub="Reason code 2" />
        <StatCard icon="refresh" iconTone="softblue" label="Superseded" value={loading ? "…" : supersededCount} sub="Replaced by a corrected credential" />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="Active Credentials" value={loading ? "…" : revocable.length} sub="Currently in good standing" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard title={`Revocation Cases (${cases.length})`} className="mb-4" pad="px-4 pb-1 pt-4">
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search revocation cases..." value={q} onChange={setQ} />
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-revocations", columns, rows)}
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
          emptyText="No revoked credentials."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Revocations by Reason" pad="p-4">
          {cases.length ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <Donut segments={reasonSegments} size={150} thickness={20} centerTitle={String(cases.length)} centerSub="Total" />
              <Legend
                className="min-w-0 flex-1"
                items={reasonSegments.map((s) => ({
                  label: s.label, color: s.color,
                  value: `${s.value} (${((s.value / cases.length) * 100).toFixed(1)}%)`,
                }))}
              />
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No revoked credentials.</div>
          )}
        </SectionCard>

        <SectionCard title="Revocations by Institution" pad="p-4">
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
            <div className="py-8 text-center text-[13px] text-slate-400">No revoked credentials.</div>
          )}
        </SectionCard>
      </div>

      {/* New revocation modal */}
      <Modal
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title="New Revocation"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setRevokeOpen(false)}>Cancel</ActionBtn>
            <ActionBtn
              tone="red" icon="revoke"
              disabled={!!busy || !revokeHash}
              className="disabled:opacity-50"
              onClick={revoke}
            >
              {busy === "revoke" ? "Revoking…" : "Revoke Permanently"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          Revoking is final: the anchor is revoked on-chain with the issuing institution&apos;s custodied key and
          cannot be undone. The holder and the institution are notified.
        </p>
        <label className="mb-3 block">
          <span className="text-[11px] font-medium text-slate-400">
            Credential<span className="text-red-500"> *</span>
          </span>
          <select
            value={revokeHash}
            onChange={(e) => setRevokeHash(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Select an active credential…</option>
            {revocable.map((c) => (
              <option key={c.credentialHash} value={c.credentialHash}>
                {(c.subjectName || "Unknown") + " — " + (c.qualification || "credential") + " (" + shortHash(c.credentialHash) + ")"}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-medium text-slate-400">
            Reason code<span className="text-red-500"> *</span>
          </span>
          <select
            value={revokeReason}
            onChange={(e) => setRevokeReason(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            {Object.entries(REASON_LABEL).map(([code, label]) => (
              <option key={code} value={code}>{`${code} — ${label}`}</option>
            ))}
          </select>
        </label>
        <p className="mt-2 text-[11.5px] text-slate-400">
          The reason code is recorded on-chain with the revocation and shown to verifiers.
        </p>
      </Modal>
    </PortalShell>
  );
}
