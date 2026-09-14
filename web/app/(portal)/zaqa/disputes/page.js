"use client";

// ZAQA disputes: two case sources share this page.
//   1. Routed dispute cases (Dispute model) whose lead authority is ZAQA — full workflow.
//   2. Graduate correction requests raised directly on a credential — these are what the
//      Case Management list tags as "Dispute"; they used to open onto an empty queue here.
// A ?hash= deep link (from Case Management) lands on the matching correction request.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import PortalShell from "../../../../components/portal/shell";
import DisputesWorkspace from "../../../../components/portal/DisputesWorkspace";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, StatusTabs, SearchBox, DataTable, Pagination, usePager, Modal, ErrorBanner, ActionBtn, KVGrid,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

function CorrectionRequests({ token, initialHash }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [d, v] = await Promise.all([
        api.zaqaDisputes(token),
        api.zaqaValidationList(token).catch(() => ({ credentials: [] })),
      ]);
      const byHash = new Map((v.credentials || []).map((c) => [c.credentialHash, c]));
      const list = (d.disputes || []).map((r) => ({ ...(byHash.get(r.credentialHash) || {}), ...r }));
      setRows(list);
      return list;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  // Deep link from Case Management: open the matching request once loaded.
  useEffect(() => {
    if (initialHash && rows.length && !selected) {
      const m = rows.find((r) => r.credentialHash === initialHash);
      if (m) setSelected(m);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHash, rows]);

  async function resolve() {
    if (!selected || busy) return;
    setBusy(true);
    setModalError(null);
    try {
      await api.zaqaResolveDispute(token, selected.credentialHash);
      await load();
      setSelected(null);
    } catch (err) {
      setModalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const filtered = rows.filter((r) =>
    !q || `${r.subjectName || ""} ${r.institution || ""} ${r.qualification || ""} ${r.message || ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const pg = usePager(filtered, 10, [q]);

  const columns = [
    { key: "requestedAt", label: "Raised", tdClass: "whitespace-nowrap", render: (r) => fmtDate(r.requestedAt) },
    {
      key: "subjectName", label: "Holder / Institution",
      render: (r) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate font-medium text-slate-700">{r.subjectName || "—"}</span>
          <span className="block truncate text-[11px] text-slate-400">{r.institution || "—"}</span>
        </span>
      ),
    },
    { key: "qualification", label: "Qualification", render: (r) => r.qualification || "—" },
    { key: "message", label: "Request", render: (r) => <span className="block max-w-[320px] truncate">{r.message || "—"}</span> },
    { key: "status", label: "Status", render: () => <Badge tone="purple" dot>Open</Badge> },
  ];

  return (
    <div>
      <ErrorBanner error={error} onRetry={load} />
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox value={q} onChange={setQ} placeholder="Search holder, institution, qualification…" className="w-full sm:w-80" />
        <span className="ml-auto text-[12px] text-slate-400">{filtered.length} open correction request{filtered.length === 1 ? "" : "s"}</span>
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={pg.rows}
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          loading={loading}
          onRowClick={(r) => { setSelected(r); setModalError(null); }}
          emptyText="No open correction requests — graduates raise these from their credential wallet."
          footer={<Pagination {...pg.props} />}
        />
      </div>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Correction request"
        badge={selected ? <Badge tone="purple" dot>Open</Badge> : null}
        width="max-w-2xl"
        footer={
          selected && (
            <>
              <ActionBtn tone="outline" onClick={() => setSelected(null)}>Close</ActionBtn>
              <ActionBtn tone="green" icon="check" disabled={busy} className="disabled:opacity-50" onClick={resolve}>
                {busy ? "Resolving…" : "Mark resolved"}
              </ActionBtn>
            </>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <ErrorBanner error={modalError} className="mb-0" />
            <KVGrid
              cols={2}
              items={[
                { label: "Holder", value: selected.subjectName || "—" },
                { label: "Institution", value: selected.institution || "—" },
                { label: "Qualification", value: selected.qualification || "—" },
                { label: "ZQF level", value: selected.zqfLevel != null ? `Level ${selected.zqfLevel}` : "—" },
                { label: "Raised on", value: fmtDateTime(selected.requestedAt) },
                { label: "Credential status", value: selected.status || "—" },
                { label: "ZAQA validation", value: selected.zaqaValidation || "—" },
                { label: "ZAQA reference", value: selected.zaqaRef || "Not yet assigned" },
              ]}
            />
            <div>
              <div className="text-[11px] font-medium text-slate-400">What the graduate asked to correct</div>
              <p className="mt-1 rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px] leading-snug text-slate-700">
                {selected.message || "—"}
              </p>
            </div>
            <p className="rounded-lg bg-blue-50 p-3 text-[12px] leading-snug text-blue-800">
              The issuing institution resolves a correction by issuing a corrected credential that replaces this one.
              Mark the request resolved once the corrected credential has been received, or if the request is withdrawn.
            </p>
            <div>
              <div className="mb-2 text-[12px] font-bold text-slate-900">Credential history</div>
              <CaseTimeline events={selected.events} />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function DisputesInner() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const params = useSearchParams();
  const hash = params.get("hash");
  const [tab, setTab] = useState(hash ? "Correction Requests" : "Routed Disputes");
  const [counts, setCounts] = useState({ routed: 0, corrections: 0 });

  useEffect(() => {
    if (!token) return;
    Promise.all([
      api.disputeQueue(token).catch(() => ({ disputes: [] })),
      api.zaqaDisputes(token).catch(() => ({ disputes: [] })),
    ]).then(([r, c]) =>
      setCounts({
        routed: (r.disputes || []).filter((d) => !["upheld", "dismissed", "resolved", "appeal_upheld", "appeal_dismissed"].includes(d.status)).length,
        corrections: (c.disputes || []).length,
      })
    );
  }, [token]);

  if (!ready) return null;
  return (
    <PortalShell portal="zaqa" active="disputes" title="Disputes & Appeals">
      <StatusTabs
        variant="pill"
        tabs={[
          { label: "Routed Disputes", count: counts.routed },
          { label: "Correction Requests", count: counts.corrections },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "Routed Disputes" ? (
        <DisputesWorkspace token={token} role={user.role} mode="authority" />
      ) : (
        <CorrectionRequests token={token} initialHash={hash} />
      )}
    </PortalShell>
  );
}

export default function ZaqaDisputesPage() {
  return (
    <Suspense fallback={null}>
      <DisputesInner />
    </Suspense>
  );
}
