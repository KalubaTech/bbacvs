"use client";

// Public, searchable National Qualifications Register (no login required).
// Searches the ZAQA register by title / reference / field, filterable by
// NQF level, qualification type and sub-framework.

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Badge, DataTable, ErrorBanner, Pagination, SearchBox, SelectPill, KVGrid } from "../../../components/portal/kit";

const TYPE_LABEL = { full: "Full qualification", part: "Part qualification", micro_credential: "Micro-credential" };
const SUB_LABEL = { general: "General education", tevet: "TEVET", higher_ed: "Higher education" };
const STATUS_TONE = { registered: "green", superseded: "amber", suspended: "orange", deregistered: "red", expired: "slate" };

export default function PublicRegister() {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [type, setType] = useState("");
  const [sub, setSub] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, pages: 1 });
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (level) params.set("nqfLevel", level);
      if (type) params.set("qualificationType", type);
      if (sub) params.set("subFramework", sub);
      const res = await api.searchQualifications(`?${params.toString()}`);
      // Paginated shape when filters are present; tolerate a bare array.
      setData(Array.isArray(res) ? { items: res, total: res.length, pages: 1 } : res);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [q, level, type, sub, page]);

  useEffect(() => {
    const t = setTimeout(load, q ? 300 : 0); // debounce typing
    return () => clearTimeout(t);
  }, [load, q]);

  useEffect(() => {
    setPage(1);
  }, [q, level, type, sub]);

  const columns = [
    {
      key: "referenceId",
      label: "Reference",
      render: (r) => <span className="font-mono text-[12px] font-semibold text-slate-800">{r.referenceId}</span>,
    },
    { key: "title", label: "Qualification", render: (r) => <span className="font-medium text-slate-800">{r.title}</span> },
    { key: "nqfLevel", label: "NQF level", render: (r) => (r.nqfLevel ? <Badge tone="blue">Level {r.nqfLevel}</Badge> : "—") },
    { key: "qualificationType", label: "Type", render: (r) => TYPE_LABEL[r.qualificationType] || r.qualificationType || "—" },
    { key: "awardingBody", label: "Awarding body", render: (r) => r.awardingBody || "—" },
    {
      key: "status",
      label: "Status",
      render: (r) => <Badge tone={STATUS_TONE[r.status] || "slate"}>{(r.status || "").replace(/_/g, " ")}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">National Qualifications Register</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-500">
          Search qualifications registered on the Zambia Qualifications Framework. Every entry shows its
          NQF level, awarding body and current registration status.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        <SearchBox
          className="w-full sm:w-80"
          placeholder="Search by title, reference or field…"
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
      </div>

      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white shadow-card">
        <DataTable
          columns={columns}
          rows={data.items || []}
          rowKey="referenceId"
          activeKey={selected?.referenceId}
          onRowClick={(r) => setSelected(selected?.referenceId === r.referenceId ? null : r)}
          loading={loading}
          emptyText="No qualifications match your search."
          footer={
            <Pagination
              summary={`${data.total ?? (data.items || []).length} qualification(s)`}
              page={page}
              pages={data.pages || 1}
              onPageChange={setPage}
            />
          }
        />
      </div>

      {selected && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{selected.title}</h2>
              <div className="mt-1 font-mono text-[12px] text-slate-500">{selected.referenceId}</div>
            </div>
            <Badge tone={STATUS_TONE[selected.status] || "slate"}>{(selected.status || "").replace(/_/g, " ")}</Badge>
          </div>
          <KVGrid
            className="mt-4"
            cols={3}
            items={[
              { label: "NQF level", value: selected.nqfLevel ? `Level ${selected.nqfLevel}` : "—" },
              { label: "Framework version", value: selected.frameworkVersion || "—" },
              { label: "Type", value: TYPE_LABEL[selected.qualificationType] || "—" },
              { label: "Sub-framework", value: SUB_LABEL[selected.subFramework] || selected.subFramework || "—" },
              { label: "Credit value", value: selected.creditValue ?? "—" },
              { label: "Field of education", value: selected.fieldOfEducation || "—" },
              { label: "Awarding body", value: selected.awardingBody || "—" },
              { label: "Registered", value: selected.registrationDate ? new Date(selected.registrationDate).toLocaleDateString() : "—" },
              { label: "RPL available", value: selected.rplAvailable ? "Yes" : "No" },
            ]}
          />
          {Array.isArray(selected.learningOutcomes) && selected.learningOutcomes.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Learning outcomes</div>
              <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[13px] text-slate-600">
                {selected.learningOutcomes.map((o, i) => (
                  <li key={i}>{o}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-4 border-t border-slate-100 pt-4 text-[13px] text-slate-500">
            Hold a credential for this qualification?{" "}
            <Link href="/verify" className="font-semibold text-[#12275c] underline">
              Verify it here
            </Link>
            .
          </div>
        </div>
      )}
    </div>
  );
}
