"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, ProgressBar, TabBar, KVRow, KVGrid, FileRow, ActionBtn,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

// Programme accreditation status → design's "ZAQA Status" column.
const STATUS_META = {
  draft: { label: "Draft", tone: "slate", completeness: 60 },
  pending: { label: "Submitted", tone: "blue", completeness: 100 },
  approved: { label: "Approved", tone: "green", completeness: 100 },
  rejected: { label: "Returned", tone: "red", completeness: 100 },
};

const PANEL_TABS = ["Overview", "Files", "Checklist", "Provenance", "Signature", "Sharing", "Communication Log"];

function PanelSection({ title, action, children, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-3.5 ${className}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[12.5px] font-bold text-slate-800">{title}</div>
        {action && <button className="text-[11px] font-semibold text-blue-600 hover:underline">{action}</button>}
      </div>
      {children}
    </div>
  );
}

function PackagePanel({ pkg, officer, onSubmit, busy }) {
  const [tab, setTab] = useState("Overview");
  if (!pkg) {
    return (
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Package Details</h2>
        <p className="text-[12.5px] text-slate-400">No records yet. Create programmes from the classic workbench to build evidence packages.</p>
      </div>
    );
  }
  const meta = STATUS_META[pkg.status] || STATUS_META.draft;
  const complete = meta.completeness === 100;
  return (
    <div>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Package Details</h2>
        <Badge tone={meta.tone} dot>{meta.label}</Badge>
      </div>
      <div className="mb-3">
        <div className="flex items-center gap-1.5 text-[15px] font-bold text-slate-900">
          {pkg.name}
          <Icon name="clipboard" className="h-3.5 w-3.5 text-slate-400" />
        </div>
        <div className="text-[12px] text-slate-500">Programme Accreditation</div>
      </div>

      <div className="mb-4 overflow-x-auto [scrollbar-width:none]">
        <TabBar tabs={PANEL_TABS} active={tab} onChange={setTab} accent="border-emerald-600 text-emerald-700" />
      </div>

      <div className="space-y-3">
        <PanelSection title="Overview">
          <KVRow label="Programme" value={pkg.name} />
          <KVRow label="Institution" value={pkg.institution || "—"} />
          <KVRow label="ZQF Level" value={pkg.zqfLevel ? `Level ${pkg.zqfLevel}` : "—"} />
          <KVRow label="Qualification Ref" value={pkg.qualificationRef || "—"} />
          <KVRow label="Evidence Type" value="Programme Accreditation" />
          <KVRow label="Date Compiled" value={fmtDate(pkg.createdAt)} />
          <KVRow label="Assigned Officer" value={officer || "—"} />
          {pkg.note ? <KVRow label="Regulator Note" value={pkg.note} /> : null}
          <div
            className={`mt-2 flex items-center gap-2.5 rounded-lg border p-2.5 ${
              complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <Icon
              name={complete ? "checkCircle" : "clock"}
              className={`h-4 w-4 shrink-0 ${complete ? "text-emerald-600" : "text-amber-600"}`}
            />
            <span className={`flex-1 text-[11.5px] leading-snug ${complete ? "text-emerald-700" : "text-amber-700"}`}>
              {complete
                ? "Package Complete — This programme has been submitted for regulator review."
                : "Package Incomplete — This programme is still a draft and has not been submitted."}
            </span>
            <span className={`text-[13px] font-bold ${complete ? "text-emerald-700" : "text-amber-700"}`}>
              {meta.completeness}%
            </span>
          </div>
        </PanelSection>

        <PanelSection title="Attached Files" action="View All">
          <div className="space-y-2">
            <FileRow name="Self Evaluation Report.pdf" size="2.4 MB" />
            <FileRow name="Course List.xlsx" size="340 KB" tone="softgreen" />
            <FileRow name="Validation Matrix.docx" size="1.1 MB" tone="softblue" />
            <FileRow name="Staff Qualifications.pdf" size="1.6 MB" />
          </div>
        </PanelSection>

        <PanelSection title="Validation Checklist" action="View Full Checklist">
          <ProgressBar value={meta.completeness} tone={complete ? "green" : "amber"} />
          <div className="mt-1.5 text-[11.5px] text-slate-500">
            {complete ? "12 / 12 completed" : "Draft — submit to complete"}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="green">{complete ? "12 Completed" : "8 Completed"}</Badge>
            <Badge tone="softblue">{complete ? "0 In Progress" : "4 In Progress"}</Badge>
            <Badge tone="softred">0 Missing</Badge>
            <Badge tone="slate">0 Not Applicable</Badge>
          </div>
        </PanelSection>

        <PanelSection title="Provenance Summary" action="View Details">
          <KVGrid
            cols={2}
            items={[
              { label: "Documents Disclosed", value: "4" },
              { label: "Data Sources", value: "2" },
              { label: "Collected By", value: officer || "—" },
              { label: "Origin Day", value: fmtDate(pkg.createdAt) },
              { label: "Origin System", value: "Institution SIS" },
              { label: "Chain of Custody", value: "Complete ✓" },
            ]}
          />
        </PanelSection>

        <PanelSection title="Digital Signature" action="View Signature Details">
          <KVRow label="Signed By" value={officer || "—"} />
          <KVRow label="Role" value="Institution Admin" />
          <KVRow label="Signed On" value={fmtDate(pkg.createdAt)} />
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Badge tone="green" icon="shieldCheck">Digitally Signed</Badge>
            <Badge tone="green">✓ Valid Signature</Badge>
          </div>
        </PanelSection>

        <PanelSection title="Secure Sharing" action="View Sharing Details">
          <KVRow label="Status" value="Not Shared" />
          <KVRow label="Access" value="None" />
          <KVRow label="Expiry" value="—" />
          <ActionBtn tone="outline" icon="share" className="mt-2 !px-2.5 !py-1.5 !text-[12px]">
            Share Securely
          </ActionBtn>
        </PanelSection>

        <PanelSection title="Communication Log with ZAQA" action="View Full Log">
          <div className="space-y-2.5">
            {[
              {
                icon: pkg.status === "draft" ? "clock" : "check",
                cls: pkg.status === "draft" ? "bg-amber-100 text-amber-600" : "bg-emerald-100 text-emerald-600",
                text: pkg.status === "draft"
                  ? `Programme drafted — awaiting submission`
                  : `Programme ${STATUS_META[pkg.status]?.label.toLowerCase() || pkg.status} — ${pkg.name}`,
                time: fmtDateTime(pkg.createdAt),
              },
              { icon: "send", cls: "bg-blue-100 text-blue-600", text: `Programme created — ${pkg.name}`, time: fmtDateTime(pkg.createdAt) },
            ].map((l, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${l.cls}`}>
                  <Icon name={l.icon} className="h-3 w-3" />
                </span>
                <div className="min-w-0 leading-tight">
                  <div className="text-[12px] font-medium text-slate-700">{l.text}</div>
                  <div className="mt-0.5 text-[11px] text-slate-400">{l.time}</div>
                </div>
              </div>
            ))}
          </div>
        </PanelSection>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <ActionBtn
          tone="darkgreen"
          icon="send"
          full
          disabled={pkg.status !== "draft" || busy === pkg.id}
          onClick={() => onSubmit(pkg.id)}
          className={pkg.status !== "draft" ? "opacity-50" : ""}
        >
          {busy === pkg.id ? "Sending…" : "Send to ZAQA"}
        </ActionBtn>
        <ActionBtn tone="orange" full>Request More Evidence</ActionBtn>
        <ActionBtn tone="outline" icon="download" full>Download Summary</ActionBtn>
        <ActionBtn tone="outline" icon="chevronDown" full />
      </div>
    </div>
  );
}

export default function InstitutionEvidencePage() {
  const { ready, user, token } = usePortalGuard(["issuer"]);
  const [programmes, setProgrammes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setError(null);
      const res = await api.myProgrammes(token);
      setProgrammes(res.programmes || []);
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function onSubmit(id) {
    setBusy(id);
    try { await api.submitProgramme(token, id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const counts = programmes.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {});
  const kpis = [
    { icon: "folder", iconTone: "softblue", label: "Evidence Packages", value: String(programmes.length), sub: "All programmes" },
    { icon: "clock", iconTone: "orange", label: "Draft Packages", value: String(counts.draft || 0), sub: "Not yet submitted" },
    { icon: "send", iconTone: "softgreen", label: "Submitted for Review", value: String(counts.pending || 0), sub: "Awaiting regulator" },
    { icon: "alert", iconTone: "softred", label: "Returned / Rejected", value: String(counts.rejected || 0), sub: "Need clarification" },
    { icon: "checkCircle", iconTone: "softgreen", label: "Approved Programmes", value: String(counts.approved || 0), sub: "Accredited" },
  ];

  const rows = programmes.filter(
    (p) => !q || `${p.id} ${p.name} ${p.qualificationRef || ""} ${p.status}`.toLowerCase().includes(q.toLowerCase())
  );
  const selected = rows.find((p) => p.id === sel) || rows[0] || null;
  const officer = user.name || user.email;

  return (
    <PortalShell
      portal="institution"
      active="evidence"
      title="Institution Portal – Evidence Submission & ZAQA Requests"
      subtitle="Manage evidence packages and respond to ZAQA requests related to accreditation, qualification validation, and credential verification."
      user={{ name: user.name || user.email, sub: user.email }}
      panel={<PackagePanel pkg={selected} officer={officer} onSubmit={onSubmit} busy={busy} />}
      panelWidth="w-[420px]"
    >
      <StatRow cols={5}>
        {kpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard
        title="Evidence Packages"
        pad="p-0"
        action={
          <div className="flex items-center gap-2">
            <ActionBtn tone="darkgreen" icon="folder">Compile Package</ActionBtn>
            <ActionBtn tone="outline" icon="send">Send to ZAQA</ActionBtn>
            <SelectPill label="More Actions" />
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox
            className="w-96"
            placeholder="Search by programme name, qualification, status..."
            value={q}
            onChange={setQ}
          />
          <SelectPill label="Status: All" />
          <SelectPill label="Evidence Type: All" />
          <SelectPill label="Date Range" />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
        </div>
        {error && <p className="px-4 pb-2 text-[12px] font-medium text-red-600">{error}</p>}
        {rows.length ? (
          <DataTable
            rowKey="id"
            activeKey={selected?.id}
            onRowClick={(r) => setSel(r.id)}
            columns={[
              { key: "check", label: "", thClass: "w-8", render: () => <input type="checkbox" className="rounded border-slate-300" onClick={(e) => e.stopPropagation()} readOnly /> },
              {
                key: "id",
                label: "Package ID",
                render: (r) => (
                  <span className="block leading-tight">
                    <span className="block font-semibold text-blue-600">{String(r.id).slice(-10).toUpperCase()}</span>
                    <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">ACCREDITATION</span>
                  </span>
                ),
              },
              { key: "name", label: "Learner / Programme" },
              { key: "qualification", label: "Qualification", render: (r) => r.qualificationRef || r.name },
              { key: "evidenceType", label: "Evidence Type", render: () => "Programme Accreditation" },
              {
                key: "completeness",
                label: "Completeness",
                render: (r) => {
                  const v = (STATUS_META[r.status] || STATUS_META.draft).completeness;
                  return (
                    <span className="flex items-center gap-2">
                      <ProgressBar value={v} className="w-20" />
                      <span className="text-[12px] font-semibold text-slate-700">{v}%</span>
                    </span>
                  );
                },
              },
              {
                key: "status",
                label: "ZAQA Status",
                render: (r) => {
                  const m = STATUS_META[r.status] || STATUS_META.draft;
                  return <Badge tone={m.tone}>{m.label}</Badge>;
                },
              },
              { key: "officer", label: "Assigned Officer", render: () => officer },
              { key: "updated", label: "Last Updated", tdClass: "whitespace-nowrap", render: (r) => fmtDateTime(r.createdAt) },
              { key: "menu", label: "", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
            ]}
            rows={rows}
          />
        ) : (
          <div className="border-t border-slate-100 px-4 py-10 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <div className="flex items-center border-t border-slate-100">
          <Pagination
            className="flex-1"
            summary={`Showing ${rows.length ? 1 : 0} to ${rows.length} of ${programmes.length} packages`}
            page={1}
            pages={1}
          />
          <SelectPill label="10 / page" className="mr-3.5" />
        </div>
      </SectionCard>
    </PortalShell>
  );
}
