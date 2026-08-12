"use client";

import { useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, StatusTabs, TabBar, SearchBox, SelectPill, ToolButton,
  DataTable, Pagination, KVRow, ActionBtn,
} from "../../../../components/portal/kit";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

// Register status → design tab/badge label.
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

function statusLabel(q) {
  return STATUS_LABELS[q.status] || q.status || "—";
}

function reviewCycle(q) {
  if (!q.registrationDate || !q.expiryDate) return "—";
  const years = Math.round(
    (new Date(q.expiryDate) - new Date(q.registrationDate)) / (365.25 * 24 * 3600 * 1000)
  );
  return years > 0 ? `Every ${years} years` : "—";
}

function DetailPanel({ qual, detail, tab, setTab }) {
  const full = detail?.qualification;
  const versions = detail?.versions || [];
  const label = statusLabel(qual);
  const tiles = [
    { icon: "book", cls: "bg-orange-100 text-orange-600", value: `${full?.learningOutcomes?.length ?? 0} Outcomes`, label: "Learning Outcomes" },
    { icon: "clipboardCheck", cls: "bg-blue-100 text-blue-600", value: `${full?.assessmentCriteria?.length ?? 0} Criteria`, label: "Assessment Criteria" },
    { icon: "graduation", cls: "bg-emerald-100 text-emerald-600", value: full?.minEntryRequirements?.[0] || "—", label: "Entry Requirements", sub: full?.minEntryRequirements?.[1] },
    { icon: "chevronsRight", cls: "bg-purple-100 text-purple-600", value: full?.progressionRoutes?.[0] || "—", label: "Progression Routes", sub: full?.progressionRoutes?.[1] },
  ];

  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Qualification Details</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between gap-2">
        <Badge tone="outline" className="text-orange-600">{qual.referenceId || "Draft"}</Badge>
        <Badge tone={STATUS_TONES[label] || "slate"} dot>{label}</Badge>
      </div>
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-[14px] font-bold leading-snug text-slate-900">{qual.title}</h3>
        <span className="shrink-0 text-[11px] text-slate-400">Version {qual.qualificationVersion || 1}</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <ActionBtn tone="outline" icon="eye" full className="!px-2 text-[12px]">View Certificate Profile</ActionBtn>
        <ActionBtn tone="outline" icon="qr" full className="!px-2 text-[12px]">Download QR Code</ActionBtn>
      </div>

      <div className="mb-4 divide-y divide-slate-100 rounded-xl border border-slate-200 px-3.5 py-1">
        <KVRow label="Trade Area" value={qual.fieldOfEducation || "—"} />
        <KVRow label="NQF Level" value={qual.nqfLevel != null ? `Level ${qual.nqfLevel}` : "—"} />
        <KVRow label="Awarding Body" value={qual.awardingBody || "—"} />
        <KVRow label="Provider" value={qual.awardingBody || "—"} />
        <KVRow label="Certification Type" value={TYPE_LABELS[qual.qualificationType] || qual.qualificationType || "—"} />
        <KVRow label="Credit Value" value={qual.creditValue ?? "—"} />
        <KVRow label="Registration Date" value={fmtDate(qual.registrationDate)} />
        <KVRow label="Renewal Date" value={fmtDate(qual.expiryDate)} />
        <KVRow label="Status" value={<Badge tone={STATUS_TONES[label] || "slate"}>{label}</Badge>} />
        <KVRow label="Review Cycle" value={reviewCycle(qual)} />
      </div>

      <div className="mb-4">
        <TabBar
          tabs={["Overview", "Learning Outcomes", "Assessment", "Version History"]}
          active={tab}
          onChange={setTab}
          accent="border-orange-500 text-orange-600"
        />
      </div>

      <div className="mb-4">
        <div className="mb-1.5 text-[12.5px] font-semibold text-slate-800">Summary</div>
        <p className="text-[12px] leading-relaxed text-slate-600">
          {full?.purpose || "No summary has been provided for this qualification."}
        </p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 p-3">
            <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${t.cls}`}>
              <Icon name={t.icon} className="h-4 w-4" />
            </span>
            <div className="text-[12.5px] font-bold leading-snug text-slate-900">{t.value}</div>
            <div className="mt-0.5 text-[11px] text-slate-400">{t.label}</div>
            {t.sub && <div className="mt-0.5 text-[11px] text-slate-500">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <div className="text-[12.5px] font-semibold text-slate-800">Version History</div>
        </div>
        <div className="space-y-3">
          {versions.map((v, i) => (
            <div key={v.qualificationVersion ?? i} className="flex gap-3 rounded-xl border border-slate-100 p-3">
              <span className={`text-[13px] font-bold ${i === 0 ? "text-orange-600" : "text-slate-900"}`}>
                {v.qualificationVersion ?? 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {i === 0 && <Badge tone="green">Current</Badge>}
                </div>
                <div className={`text-[12px] text-slate-600 ${i === 0 ? "mt-1" : ""}`}>
                  Status: {statusLabel(v)}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-400">
                  {fmtDate(v.registrationDate || v.createdAt)}
                </div>
              </div>
            </div>
          ))}
          {versions.length === 0 && (
            <div className="rounded-xl border border-slate-100 p-3 text-[12px] text-slate-400">
              No version history available.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TevetaQualificationsPage() {
  const { ready, user } = usePortalGuard(["teveta"]);
  const [quals, setQuals] = useState([]);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState("All");
  const [panelTab, setPanelTab] = useState("Overview");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    if (!ready) return;
    api
      .searchQualifications("?subFramework=tevet")
      .then((r) => setQuals(r.qualifications || []))
      .catch((err) => setError(err.message));
  }, [ready]);

  const counts = useMemo(() => {
    const c = { All: quals.length, Active: 0, Pending: 0, Suspended: 0, Retired: 0 };
    for (const item of quals) {
      const l = statusLabel(item);
      if (c[l] != null) c[l]++;
    }
    return c;
  }, [quals]);

  const rows = quals.filter(
    (r) =>
      (tab === "All" || statusLabel(r) === tab) &&
      (!q ||
        `${r.referenceId || ""} ${r.title || ""} ${r.fieldOfEducation || ""} ${r.awardingBody || ""}`
          .toLowerCase()
          .includes(q.toLowerCase()))
  );
  const selected = rows.find((r) => String(r.id) === sel) || rows[0] || null;
  const selectedRef = selected?.referenceId;

  useEffect(() => {
    if (!selectedRef) {
      setDetail(null);
      return;
    }
    let gone = false;
    api
      .searchQualifications(`/${encodeURIComponent(selectedRef)}`)
      .then((r) => { if (!gone) setDetail(r); })
      .catch(() => { if (!gone) setDetail(null); });
    return () => { gone = true; };
  }, [selectedRef]);

  if (!ready) return null;

  const TABS = ["All", "Active", "Pending", "Suspended", "Retired"].map((label) => ({
    label,
    count: counts[label],
  }));

  return (
    <PortalShell
      portal="teveta"
      active="qualifications"
      user={{ name: user.name || user.email, sub: user.email }}
      title="TEVETA Portal – Trade Qualification & Certification Registry"
      subtitle="National registry of TVET and trade qualifications recognised in Zambia."
      actions={<ActionBtn tone="orange" icon="plus">Register New Qualification</ActionBtn>}
      panel={selected ? <DetailPanel qual={selected} detail={detail} tab={panelTab} setTab={setPanelTab} /> : null}
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        <StatCard icon="book" iconTone="orange" label="Total Qualifications" value={counts.All} sub="TEVET sub-framework register" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Active Qualifications" value={counts.Active} sub="Nationally registered" />
        <StatCard icon="clock" iconTone="amber" label="Pending Review" value={counts.Pending} sub="Awaiting registration" />
        <StatCard icon="pause" iconTone="softred" label="Suspended" value={counts.Suspended} sub="Register status: suspended" />
        <StatCard icon="archive" iconTone="slate" label="Retired" value={counts.Retired} sub="Expired or deregistered" />
      </StatRow>

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-4 shadow-card">
        <StatusTabs tabs={TABS} active={tab} onChange={setTab} variant="pill" />
        <SearchBox
          className="mb-3 w-full"
          placeholder="Search by code, title, trade, provider, awarding body..."
          value={q}
          onChange={setQ}
        />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SelectPill label="Trade Area" />
          <SelectPill label="NQF Level" />
          <SelectPill label="Awarding Body" />
          <SelectPill label="Provider" />
          <SelectPill label="Status" />
          <ToolButton icon="filter">More Filters</ToolButton>
          <button className="ml-auto text-[12px] font-semibold text-blue-600" onClick={() => { setQ(""); setTab("All"); }}>
            Reset
          </button>
        </div>
        {error && <div className="mb-2 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          activeKey={selected?.id ?? null}
          onRowClick={(r) => setSel(String(r.id))}
          columns={[
            { key: "referenceId", label: "Qualification Code", render: (r) => <span className="font-semibold text-slate-800">{r.referenceId || "—"}</span> },
            { key: "title", label: "Official Title" },
            { key: "fieldOfEducation", label: "Trade Area", render: (r) => r.fieldOfEducation || "—" },
            { key: "nqfLevel", label: "NQF Level", render: (r) => <Badge tone={LEVEL_TONES[r.nqfLevel] || "slate"}>{r.nqfLevel != null ? `Level ${r.nqfLevel}` : "—"}</Badge> },
            { key: "awardingBody", label: "Awarding Body", render: (r) => r.awardingBody || "—" },
            { key: "qualificationType", label: "Type", render: (r) => TYPE_LABELS[r.qualificationType] || r.qualificationType || "—" },
            { key: "status", label: "Status", render: (r) => { const l = statusLabel(r); return <Badge tone={STATUS_TONES[l] || "slate"}>{l}</Badge>; } },
            { key: "registrationDate", label: "Registered On", render: (r) => fmtDate(r.registrationDate) },
            { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
          footer={
            rows.length === 0 && (
              <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            )
          }
        />
        <Pagination
          summary={`Showing ${rows.length ? 1 : 0} to ${rows.length} of ${rows.length} qualifications`}
          page={1}
          pages={1}
        />
      </div>
    </PortalShell>
  );
}
