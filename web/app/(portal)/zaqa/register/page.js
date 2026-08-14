"use client";

// Governance view of the National Qualifications Register. Unlike the public
// register (app/(site)/qualifications), ZAQA may query ANY status — including
// superseded versions — and can open the full amendment/version history of an
// entry, each version with its complete regulatory event timeline.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, DataTable, ErrorBanner, Pagination, SearchBox, SelectPill, KVGrid,
  SectionCard, Modal, ActionBtn,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const TYPE_LABEL = { full: "Full qualification", part: "Part qualification", micro_credential: "Micro-credential" };
const SUB_LABEL = { general: "General education", tevet: "TEVET", higher_ed: "Higher education" };
const STATUS_TONE = {
  registered: "green", superseded: "amber", suspended: "orange",
  deregistered: "red", expired: "slate", under_review: "blue", submitted: "blue",
  rejected: "red", draft: "slate",
};
// Governance may query any lifecycle status the register records publicly or not.
const STATUS_OPTIONS = ["registered", "suspended", "superseded", "deregistered", "expired"];

const niceStatus = (s) => (s || "—").replace(/_/g, " ");

export default function ZaqaRegisterPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [sub, setSub] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // detail modal
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(null);

  // The shared api client sends no Authorization header on register searches, but
  // governance-only statuses (e.g. superseded) require the ZAQA token — so this
  // page queries the endpoint directly with the bearer token.
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) }); // always paginated shape
      if (q.trim()) params.set("q", q.trim());
      if (level) params.set("nqfLevel", level);
      if (type) params.set("qualificationType", type);
      if (sub) params.set("subFramework", sub);
      if (status) params.set("status", status);
      const res = await fetch(`${BASE}/api/qualifications?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Could not load the register");
      }
      const body = await res.json();
      setData(Array.isArray(body) ? { items: body, total: body.length, page: 1, pages: 1 } : body);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, q, level, type, sub, status, page]);

  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(load, q ? 300 : 0); // debounce typing
    return () => clearTimeout(t);
  }, [ready, load, q]);

  useEffect(() => {
    setPage(1);
  }, [q, level, type, sub, status]);

  function openDetail(row) {
    setSelected(row);
    setHistory(null);
    setHistoryError(null);
    api
      .qualificationHistory(row.referenceId, token)
      .then((h) => setHistory(h.versions || []))
      .catch((err) => setHistoryError(err.message));
  }

  if (!ready) return null;

  const columns = [
    {
      key: "referenceId", label: "Reference",
      render: (r) => <span className="font-mono text-[12px] font-semibold text-slate-800">{r.referenceId || "—"}</span>,
    },
    { key: "title", label: "Qualification", render: (r) => <span className="font-medium text-slate-800">{r.title}</span> },
    { key: "nqfLevel", label: "NQF level", render: (r) => (r.nqfLevel ? <Badge tone="blue">Level {r.nqfLevel}</Badge> : "—") },
    { key: "qualificationType", label: "Type", render: (r) => TYPE_LABEL[r.qualificationType] || r.qualificationType || "—" },
    { key: "subFramework", label: "Sub-framework", render: (r) => SUB_LABEL[r.subFramework] || r.subFramework || "—" },
    { key: "awardingBody", label: "Awarding body", render: (r) => r.awardingBody || "—" },
    { key: "qualificationVersion", label: "Version", render: (r) => `v${r.qualificationVersion || 1}` },
    {
      key: "status", label: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{niceStatus(r.status)}</Badge>,
    },
  ];

  return (
    <PortalShell
      portal="zaqa"
      active="register"
      title="National Register"
      subtitle="Governance view of the National Qualifications Register — every lifecycle status, with full version history."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox
          className="w-full sm:w-80"
          placeholder="Search by title, reference, field or awarding body…"
          value={q}
          onChange={setQ}
        />
        <SelectPill
          label="NQF level"
          value={level}
          onChange={setLevel}
          options={Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `Level ${i + 1}` }))}
        />
        <SelectPill
          label="Type"
          value={type}
          onChange={setType}
          options={Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <SelectPill
          label="Sub-framework"
          value={sub}
          onChange={setSub}
          options={Object.entries(SUB_LABEL).map(([value, label]) => ({ value, label }))}
        />
        <SelectPill
          label="Status"
          value={status}
          onChange={setStatus}
          options={STATUS_OPTIONS.map((s) => ({ value: s, label: niceStatus(s) }))}
        />
      </div>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={data.items || []}
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={openDetail}
          loading={loading}
          emptyText="No qualifications match your search."
          footer={
            <Pagination
              summary={`${data.total ?? (data.items || []).length} qualification(s)`}
              page={data.page || page}
              pages={data.pages || 1}
              onPageChange={setPage}
            />
          }
        />
      </div>

      {/* Detail + version-history modal */}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title || "Qualification"}
        badge={selected && <Badge tone={STATUS_TONE[selected.status] || "slate"}>{niceStatus(selected.status)}</Badge>}
        width="max-w-2xl"
        footer={<ActionBtn tone="outline" onClick={() => setSelected(null)}>Close</ActionBtn>}
      >
        {selected && (
          <div className="space-y-4">
            <div className="font-mono text-[12px] text-slate-500">{selected.referenceId || "No reference assigned"}</div>
            <KVGrid
              cols={3}
              items={[
                { label: "NQF level", value: selected.nqfLevel ? `Level ${selected.nqfLevel}` : "—" },
                {
                  label: "Mapped level",
                  value: selected.currentMappedLevel ? `Level ${selected.currentMappedLevel}` : "—",
                },
                { label: "Framework version", value: selected.frameworkVersion || "—" },
                { label: "Type", value: TYPE_LABEL[selected.qualificationType] || selected.qualificationType || "—" },
                { label: "Sub-framework", value: SUB_LABEL[selected.subFramework] || selected.subFramework || "—" },
                { label: "Field of education", value: selected.fieldOfEducation || "—" },
                { label: "Credit value", value: selected.creditValue ?? "—" },
                { label: "Awarding body", value: selected.awardingBody || "—" },
                { label: "Qualification version", value: `v${selected.qualificationVersion || 1}` },
                { label: "Registered", value: fmtDate(selected.registrationDate) },
                { label: "Effective", value: fmtDate(selected.effectiveDate) },
                { label: "Expires", value: fmtDate(selected.expiryDate) },
              ]}
            />

            <SectionCard title="Version History" pad="p-4">
              {historyError && <div className="text-[12.5px] font-medium text-red-600">{historyError}</div>}
              {!history && !historyError && (
                <div className="py-3 text-center text-[12.5px] text-slate-400">Loading version history…</div>
              )}
              {history && history.length === 0 && (
                <div className="py-3 text-center text-[12.5px] text-slate-400">No recorded versions.</div>
              )}
              {history && history.length > 0 && (
                <div className="space-y-4">
                  {history.map((v) => (
                    <div key={v.id} className="rounded-lg border border-slate-100 p-3.5">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-bold text-slate-900">
                          v{v.qualificationVersion} {v.referenceId ? `· ${v.referenceId}` : ""}
                        </span>
                        <Badge tone={STATUS_TONE[v.status] || "slate"}>{niceStatus(v.status)}</Badge>
                        {v.frameworkVersion && <Badge tone="outline">{v.frameworkVersion}</Badge>}
                      </div>
                      <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11.5px] text-slate-500 sm:grid-cols-3">
                        <span>Registered: {fmtDate(v.registrationDate)}</span>
                        <span>Effective: {fmtDate(v.effectiveDate)}</span>
                        <span>Expires: {fmtDate(v.expiryDate)}</span>
                      </div>
                      <CaseTimeline events={v.events} emptyText="No events recorded for this version." />
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
