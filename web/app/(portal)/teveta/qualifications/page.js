"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import QualificationsWorkflow from "../../../../components/portal/QualificationsWorkflow";
import {
  Badge, TabBar, SearchBox, SelectPill, DataTable, Pagination,
  KVGrid, Modal, ErrorBanner,
} from "../../../../components/portal/kit";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

// Register status → display label / tone.
const STATUS_LABELS = {
  registered: "Active",
  submitted: "Pending",
  under_review: "Pending",
  suspended: "Suspended",
  expired: "Retired",
  deregistered: "Retired",
};
const STATUS_TONES = { Active: "green", Pending: "amber", Suspended: "red", Retired: "slate" };
const LEVEL_TONES = {
  1: "slate", 2: "blue", 3: "green", 4: "amber", 5: "purple",
  6: "purple", 7: "indigo", 8: "indigo", 9: "violet", 10: "violet",
};
const TYPE_LABELS = { full: "Full Qualification", part: "Part Qualification", micro_credential: "Micro-credential" };

const statusLabel = (q) => STATUS_LABELS[q.status] || q.status || "—";

function TevetRegister({ token }) {
  const [q, setQ] = useState("");
  const [level, setLevel] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ subFramework: "tevet", page: String(page) });
      if (q.trim()) params.set("q", q.trim());
      if (level) params.set("nqfLevel", level);
      const r = await api.searchQualifications(`?${params.toString()}`);
      setData({ items: r.items || [], total: r.total || 0, page: r.page || 1, pages: r.pages || 1 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, q, level, page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <SearchBox
          className="w-full sm:w-80"
          placeholder="Search by code, title, trade, awarding body..."
          value={q}
          onChange={(v) => { setQ(v); setPage(1); }}
        />
        <SelectPill
          label="NQF Level"
          value={level}
          onChange={(v) => { setLevel(v); setPage(1); }}
          options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ value: String(n), label: `Level ${n}` }))}
        />
      </div>
      <ErrorBanner error={error} onRetry={load} />
      <DataTable
        rowKey="id"
        onRowClick={(r) => setSelected(r)}
        loading={loading}
        emptyText="No qualifications on the TEVET register match this filter."
        columns={[
          { key: "referenceId", label: "Code", render: (r) => <span className="font-semibold text-slate-800">{r.referenceId || "—"}</span> },
          { key: "title", label: "Official Title" },
          { key: "fieldOfEducation", label: "Trade Area", render: (r) => r.fieldOfEducation || "—" },
          {
            key: "nqfLevel", label: "NQF Level",
            render: (r) => <Badge tone={LEVEL_TONES[r.nqfLevel] || "slate"}>{r.nqfLevel != null ? `Level ${r.nqfLevel}` : "—"}</Badge>,
          },
          { key: "awardingBody", label: "Awarding Body", render: (r) => r.awardingBody || "—" },
          { key: "qualificationType", label: "Type", render: (r) => TYPE_LABELS[r.qualificationType] || r.qualificationType || "—" },
          {
            key: "status", label: "Status",
            render: (r) => { const l = statusLabel(r); return <Badge tone={STATUS_TONES[l] || "slate"}>{l}</Badge>; },
          },
          { key: "registrationDate", label: "Registered On", render: (r) => fmtDate(r.registrationDate) },
        ]}
        rows={data.items}
        footer={
          <Pagination
            summary={`${data.total} qualification${data.total === 1 ? "" : "s"} · page ${data.page} of ${data.pages}`}
            page={data.page}
            pages={data.pages}
            onPageChange={setPage}
            className="border-t border-slate-100"
          />
        }
      />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.title || "Qualification"}
        badge={
          selected ? (
            <Badge tone={STATUS_TONES[statusLabel(selected)] || "slate"}>{statusLabel(selected)}</Badge>
          ) : null
        }
        width="max-w-xl"
      >
        {selected && (
          <KVGrid
            cols={2}
            items={[
              { label: "Qualification Code", value: selected.referenceId || "Draft" },
              { label: "Version", value: selected.qualificationVersion || 1 },
              { label: "Trade Area", value: selected.fieldOfEducation || "—" },
              { label: "NQF Level", value: selected.nqfLevel != null ? `Level ${selected.nqfLevel}` : "—" },
              { label: "Awarding Body", value: selected.awardingBody || "—" },
              { label: "Type", value: TYPE_LABELS[selected.qualificationType] || selected.qualificationType || "—" },
              { label: "Credit Value", value: selected.creditValue ?? "—" },
              { label: "Sub-framework", value: "TEVET" },
              { label: "Registered On", value: fmtDate(selected.registrationDate) },
              { label: "Expiry / Renewal", value: fmtDate(selected.expiryDate) },
            ]}
          />
        )}
      </Modal>
    </div>
  );
}

export default function TevetaQualificationsPage() {
  const { ready, user, token } = usePortalGuard(["teveta"]);
  const [tab, setTab] = useState("Registration Applications");

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="qualifications"
      title="TEVETA Portal – Qualifications"
      subtitle="Review qualification registration applications and browse the national TEVET register. Institutions propose qualifications; TEVETA recommends them to ZAQA."
    >
      <div className="mb-4">
        <TabBar
          tabs={["Registration Applications", "TEVET Register"]}
          active={tab}
          onChange={setTab}
          accent="border-orange-500 text-orange-600"
        />
      </div>
      {tab === "Registration Applications" ? (
        <QualificationsWorkflow token={token} role={user.role} mode="authority" />
      ) : (
        <TevetRegister token={token} />
      )}
    </PortalShell>
  );
}
