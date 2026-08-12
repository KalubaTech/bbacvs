"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SearchBox, ToolButton, DataTable,
  Pagination, TabBar, KVGrid, CheckItem, ActionBtn,
} from "../../../../components/portal/kit";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";

const MINI_NAV = [
  { icon: "dashboard", label: "Overview" },
  { icon: "book", label: "NQF Knowledge Base", active: true },
  { icon: "layers", label: "Framework Versions" },
  { icon: "fileText", label: "Level Descriptors" },
  { icon: "link", label: "Policy Mappings" },
  { icon: "award", label: "Micro-Credentials" },
  { icon: "clock", label: "Change History" },
];

// Static framework reference — the 10-level ZQF ladder (no backend counterpart).
const LEVELS = [
  { n: 10, name: "Doctoral Degree", desc: "Advanced knowledge creation", cls: "bg-purple-600" },
  { n: 9, name: "Master's Degree", desc: "Advanced knowledge", cls: "bg-violet-600" },
  { n: 8, name: "Postgraduate Diploma", desc: "Specialised knowledge", cls: "bg-indigo-600" },
  { n: 7, name: "Bachelor's Degree", desc: "Broad & integrated knowledge", cls: "bg-blue-600" },
  { n: 6, name: "Advanced Diploma", desc: "Specialised applied knowledge", cls: "bg-sky-600" },
  { n: 5, name: "Diploma", desc: "Applied knowledge", cls: "bg-teal-600" },
  { n: 4, name: "Certificate", desc: "Practical competence", cls: "bg-emerald-600" },
  { n: 3, name: "Trade Certificate", desc: "Basic occupational skills", cls: "bg-green-600" },
  { n: 2, name: "Basic Certificate", desc: "Foundational skills", cls: "bg-lime-600" },
  { n: 1, name: "Introductory", desc: "General awareness", cls: "bg-amber-500" },
];

const DESCRIPTOR_GROUPS = [
  { dot: "bg-purple-500", label: "Levels 8–10 Advanced Knowledge", meta: "3 levels" },
  { dot: "bg-blue-500", label: "Levels 5–7 Applied Knowledge", meta: "3 levels" },
  { dot: "bg-emerald-500", label: "Levels 1–4 Foundational Knowledge", meta: "4 levels" },
];

const STATUS_TONE = {
  registered: "green",
  suspended: "orange",
  expired: "slate",
  deregistered: "red",
  submitted: "blue",
  under_review: "amber",
  rejected: "red",
};

const TYPE_LABEL = { full: "Full", part: "Part", micro_credential: "Micro-credential" };

function DetailBlock({ title, action, children }) {
  return (
    <div className="border-t border-slate-100 pt-3.5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-semibold text-slate-800">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export default function ZaqaNqfPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [tab, setTab] = useState("Overview");
  const [quals, setQuals] = useState([]);
  const [inboxCount, setInboxCount] = useState(0);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const [reg, inbox] = await Promise.all([
        api.searchQualifications(""),
        api.qualificationInbox(token).catch(() => ({ qualifications: [] })),
      ]);
      setQuals(reg.qualifications || []);
      setInboxCount((inbox.qualifications || []).length);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const rows = quals.filter(
    (e) =>
      !q ||
      `${e.referenceId || ""} ${e.title || ""} ${e.nqfLevel || ""} ${e.awardingBody || ""}`
        .toLowerCase()
        .includes(q.toLowerCase())
  );
  const registeredCount = quals.filter((e) => e.status === "registered").length;

  return (
    <PortalShell
      portal="zaqa"
      active="nqf"
      title="ZAQA Portal – NQF Knowledge Base"
      subtitle="Manage National Qualifications Framework versions, levels, descriptors, policies and mappings."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="outline" icon="download">Export Framework</ActionBtn>
          <ActionBtn tone="navy" icon="plus">Add Version</ActionBtn>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[200px_1fr_360px]">
        {/* Left mini-nav */}
        <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-card xl:self-start">
          {MINI_NAV.map((item) => (
            <button
              key={item.label}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-medium transition ${
                item.active ? "bg-blue-50 text-blue-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Icon name={item.icon} className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Center column */}
        <div className="min-w-0">
          <StatRow cols={4}>
            <StatCard icon="layers" iconTone="softblue" label="Framework Versions" value="1" sub="ZQF 10-level framework" />
            <StatCard icon="checkCircle" iconTone="softgreen" label="Active Levels" value="10/10" sub="All levels defined" />
            <StatCard
              icon="award"
              iconTone="purple"
              label="Registered Qualifications"
              value={registeredCount}
              sub={`${quals.length} on the national register`}
            />
            <StatCard
              icon="queue"
              iconTone="orange"
              label="Workflow Inbox"
              value={inboxCount}
              sub="Proposals awaiting review"
            />
          </StatRow>

          {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}

          <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
            <SectionCard title="NQF 10-Level Framework" pad="p-4">
              <div className="space-y-2">
                {LEVELS.map((l) => (
                  <div key={l.n} className="flex items-center gap-3">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${l.cls}`}>
                      {l.n}
                    </span>
                    <div className="min-w-0 leading-tight">
                      <div className="text-[13px] font-bold text-slate-800">{l.name}</div>
                      <div className="text-[11px] text-slate-400">{l.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <ActionBtn tone="outline" full className="mt-4">View Full Framework Map</ActionBtn>
            </SectionCard>

            <SectionCard pad="p-0">
              <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
                <SearchBox className="min-w-0 flex-1" placeholder="Search the national register..." value={q} onChange={setQ} />
                <ToolButton icon="filter">Filter</ToolButton>
                <ToolButton icon="download">Export</ToolButton>
              </div>
              <DataTable
                dense
                rowKey="id"
                activeKey={sel}
                onRowClick={(r) => setSel(r.id)}
                columns={[
                  {
                    key: "referenceId",
                    label: "Reference ID",
                    render: (r) => <span className="font-semibold text-blue-600">{r.referenceId || "—"}</span>,
                  },
                  { key: "nqfLevel", label: "Level", render: (r) => (r.nqfLevel != null ? r.nqfLevel : "—") },
                  { key: "title", label: "Qualification Title", render: (r) => r.title || "—" },
                  {
                    key: "registrationDate",
                    label: "Registered",
                    render: (r) => fmtDate(r.registrationDate || r.effectiveDate),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => (
                      <Badge tone={STATUS_TONE[r.status] || "slate"}>
                        {(r.status || "—").replace(/_/g, " ")}
                      </Badge>
                    ),
                  },
                  { key: "qualificationType", label: "Type", render: (r) => TYPE_LABEL[r.qualificationType] || r.qualificationType || "—" },
                  { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
                ]}
                rows={rows}
                footer={
                  rows.length === 0 ? (
                    <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
                  ) : null
                }
              />
              <Pagination summary={`Showing ${rows.length} of ${quals.length} entries`} page={1} pages={1} />
            </SectionCard>
          </div>
        </div>

        {/* Right details column */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-card xl:self-start">
          <div className="mb-3 flex items-start justify-between gap-3">
            <h2 className="text-[15px] font-bold text-slate-900">NQF Version Details</h2>
            <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
              <Icon name="x" className="h-[18px] w-[18px]" />
            </button>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xl font-extrabold text-slate-900">ZQF v1</span>
            <Badge tone="green">Active</Badge>
            <Badge tone="outline">Latest Version</Badge>
          </div>
          <div className="mb-3 text-[12px] text-slate-500">10-level national framework</div>

          <TabBar
            tabs={["Overview", "Descriptors", "Mappings", "Policies", "History"]}
            active={tab}
            onChange={setTab}
          />

          <div className="mt-4 space-y-3.5">
            <div>
              <div className="mb-2 text-[12.5px] font-semibold text-slate-800">Register Summary</div>
              <KVGrid
                cols={2}
                items={[
                  { label: "Registered Qualifications", value: String(registeredCount) },
                  { label: "Proposals in Workflow", value: String(inboxCount) },
                ]}
              />
            </div>

            <DetailBlock
              title="Level Descriptors"
              action={<ActionBtn tone="outline" className="!px-2.5 !py-1 !text-[11px]">Edit Descriptor</ActionBtn>}
            >
              <div className="mb-2 text-[11px] text-slate-400">10 levels defined</div>
              <div className="space-y-2">
                {DESCRIPTOR_GROUPS.map((g) => (
                  <div key={g.label} className="flex items-center gap-2.5">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${g.dot}`} />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-700">{g.label}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{g.meta}</span>
                  </div>
                ))}
              </div>
              <button className="mt-2 text-[11px] font-semibold text-blue-600">View all level descriptors →</button>
            </DetailBlock>

            <DetailBlock
              title="Progression Rules"
              action={<button className="text-[11px] font-semibold text-blue-600">Edit Rules</button>}
            >
              <CheckItem label="Must meet level outcomes to progress" />
              <CheckItem label="Credit accumulation allowed across levels" />
              <CheckItem label="RPL permitted up to Level 6" />
            </DetailBlock>

            <DetailBlock title="Framework Mappings">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] text-slate-500">
                  {quals.length} register entries mapped to framework levels
                </span>
                <ActionBtn tone="outline" className="shrink-0 !px-2.5 !py-1 !text-[11px]">View Mappings</ActionBtn>
              </div>
            </DetailBlock>

            <DetailBlock title="Micro-Credential Policy">
              <div className="flex items-center gap-2">
                <span className="text-[12.5px] font-semibold text-blue-600">Policy: MC-Policy-v1</span>
                <Badge tone="green">Active</Badge>
              </div>
              <div className="mt-1 flex items-center justify-between gap-3">
                <span className="text-[12px] text-slate-500">Aligned with ZQF v1</span>
                <ActionBtn tone="outline" className="shrink-0 !px-2.5 !py-1 !text-[11px]">View Policy</ActionBtn>
              </div>
            </DetailBlock>
          </div>

          <div className="mt-5 flex items-center gap-2.5 border-t border-slate-100 pt-4">
            <ActionBtn tone="outline">Edit Descriptor</ActionBtn>
            <ActionBtn tone="navy">Publish Update</ActionBtn>
            <ActionBtn tone="outline" className="!px-2.5"><Icon name="dotsH" className="h-4 w-4" /></ActionBtn>
          </div>
        </div>
      </div>
    </PortalShell>
  );
}
