"use client";

import { useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import { usePortalGuard } from "../../../../components/portal/auth";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, SelectPill, TabBar, Toggle, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";

const KPIS = [
  { icon: "users", iconTone: "softblue", label: "Total Users", value: "28", delta: "12%", deltaUp: true, deltaText: "vs last 30 days" },
  { icon: "checkCircle", iconTone: "softgreen", label: "Active Users", value: "23", delta: "15%", deltaUp: true, deltaText: "vs last 30 days" },
  { icon: "clock", iconTone: "amber", label: "Pending Approvals", value: "3", delta: "25%", deltaUp: false, deltaText: "vs last 30 days" },
  { icon: "shield", iconTone: "purple", label: "Role Groups", value: "6", sub: "No change" },
  { icon: "shieldCheck", iconTone: "softblue", label: "Last Security Review", value: "May 6, 2025", sub: "20 days ago" },
];

const ROLE_TONE = {
  "Institution Admin": "purple",
  "Records Officer": "blue",
  "Examinations Officer": "cyan",
  "Quality Assurance Officer": "green",
  "Verification Officer": "orange",
  "Support Officer": "amber",
};

const STATUS_CLS = { Active: "bg-emerald-500 text-emerald-700", Inactive: "bg-red-500 text-red-600", Pending: "bg-amber-500 text-amber-700" };

const USERS = [
  { name: "Phiri, Barbrah", email: "barbrah.phiri@chikuniss.edu.zm", department: "Administration", role: "Institution Admin", status: "Active", login: "May 15, 2025 09:24 AM" },
  { name: "Mbewe, Collins", email: "collins.mbewe@chikuniss.edu.zm", department: "Records Office", role: "Records Officer", status: "Active", login: "May 15, 2025 08:11 AM" },
  { name: "Kabwe, Miriam", email: "miriam.kabwe@chikuniss.edu.zm", department: "Examinations", role: "Examinations Officer", status: "Active", login: "May 14, 2025 03:47 PM" },
  { name: "Daka, Lawrence", email: "lawrence.daka@chikuniss.edu.zm", department: "Quality Assurance", role: "Quality Assurance Officer", status: "Active", login: "May 14, 2025 02:16 PM" },
  { name: "Mulenga, Joseph", email: "joseph.mulenga@chikuniss.edu.zm", department: "Admissions", role: "Verification Officer", status: "Active", login: "May 14, 2025 11:02 AM" },
  { name: "Chilufya, Grace", email: "grace.chilufya@chikuniss.edu.zm", department: "Administration", role: "Support Officer", status: "Active", login: "May 13, 2025 04:33 PM" },
  { name: "Zulu, Patrick", email: "patrick.zulu@chikuniss.edu.zm", department: "Finance", role: "Records Officer", status: "Inactive", login: "May 3, 2025 10:21 AM" },
  { name: "Namubiru, Sheila", email: "sheila.namubiru@chikuniss.edu.zm", department: "Examinations", role: "Examinations Officer", status: "Pending", login: "—" },
];

const ROLE_SEGMENTS = [
  { label: "Institution Admin", value: 2, color: CHART.purple, pct: "7%" },
  { label: "Records Officer", value: 6, color: CHART.blue, pct: "21%" },
  { label: "Examinations Officer", value: 6, color: CHART.teal, pct: "21%" },
  { label: "Quality Assurance Officer", value: 4, color: CHART.green, pct: "14%" },
  { label: "Verification Officer", value: 5, color: CHART.orange, pct: "18%" },
  { label: "Support Officer", value: 5, color: CHART.amber, pct: "18%" },
];

const ACCOUNT_ACTIVITY = [
  { icon: "plus", cls: "bg-emerald-100 text-emerald-600", title: "New user created", sub: "Sheila Namubiru was added as Examinations Officer", time: "May 15, 2025 09:02 AM" },
  { icon: "edit", cls: "bg-blue-100 text-blue-600", title: "Role updated", sub: "Joseph Mulenga's role changed to Verification Officer", time: "May 14, 2025 02:45 PM" },
  { icon: "pause", cls: "bg-red-100 text-red-600", title: "User deactivated", sub: "Patrick Zulu was deactivated", time: "May 13, 2025 10:21 AM" },
];

const PERMISSIONS = [
  "Dashboard Access",
  "Results Import (View)",
  "Learner Records (View)",
  "Evidence for ZAQA (View)",
  "ZAQA Verification Requests",
  "Audit & Reports (View)",
  "Corrections & Replacements (View)",
  "Certificate Register (View)",
  "Disputes (View)",
];

function Field({ label, required, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-slate-500">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

function UserPanel({ user }) {
  const [tab, setTab] = useState("User Details");
  return (
    <div>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Create / Edit User</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>
      <p className="mb-4 text-[12px] text-slate-500">Add a new user or update existing user details.</p>

      <div className="mb-4">
        <TabBar tabs={["User Details", "Permissions", "Activity"]} active={tab} onChange={setTab} />
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-3 text-[12.5px] font-bold text-slate-800">Account Details</div>
        <div className="space-y-3">
          <Field label="Full Name" required>
            <input className={INPUT_CLS} value={user.name} readOnly />
          </Field>
          <Field label="Email Address" required>
            <input className={INPUT_CLS} value={user.email} readOnly />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Phone Number">
              <input className={INPUT_CLS} value="+260 97 345 6789" readOnly />
            </Field>
            <Field label="Employee / Staff ID">
              <input className={INPUT_CLS} value="STAFF-0412" readOnly />
            </Field>
          </div>
          <Field label="Department">
            <button className={`${INPUT_CLS} flex items-center justify-between text-left`}>
              {user.department}
              <Icon name="chevronDown" className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </Field>
          <Field label="Role" required>
            <button className={`${INPUT_CLS} flex items-center justify-between text-left`}>
              {user.role}
              <Icon name="chevronDown" className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </Field>
          <div>
            <div className="mb-1.5 text-[11px] font-semibold text-slate-500">Account Status</div>
            <div className="flex items-center gap-2.5">
              <Toggle on={user.status === "Active"} />
              <span className="text-[12px] text-slate-600">Active — User can sign in and access the portal</span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[12.5px] font-bold text-slate-800">Permissions ({user.role})</div>
            <div className="mt-0.5 text-[11px] text-slate-500">Select the permissions this role will have in the system.</div>
          </div>
          <button className="shrink-0 text-[11px] font-semibold text-blue-600 hover:underline">Select All</button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
          {PERMISSIONS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-[12px] text-slate-600">
              <input type="checkbox" className="rounded border-slate-300" checked readOnly />
              <span className="leading-tight">{p}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2.5">
        <ActionBtn tone="outline">Cancel</ActionBtn>
        <ActionBtn tone="darkgreen">Save User</ActionBtn>
      </div>
    </div>
  );
}

export default function InstitutionUsersPage() {
  const { ready, user } = usePortalGuard(["issuer"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState("grace.chilufya@chikuniss.edu.zm");
  if (!ready) return null;
  const rows = USERS.filter(
    (u) => !q || (u.name + u.email + u.role + u.department).toLowerCase().includes(q.toLowerCase())
  );
  const selected = USERS.find((u) => u.email === sel) || USERS[0];

  return (
    <PortalShell
      portal="institution"
      active="users"
      title={
        <span className="inline-flex items-center gap-2.5">
          Institution Portal – User Management & Roles
          <Badge tone="slate">Sample data</Badge>
        </span>
      }
      subtitle="Manage institutional users, assign roles, and control access to BBACVS portal features."
      user={{ name: user.name || user.email, sub: user.email }}
      panel={<UserPanel user={selected} />}
      panelWidth="w-[400px]"
    >
      <StatRow cols={5}>
        {KPIS.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </StatRow>

      <SectionCard pad="p-0" className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox
            className="w-96"
            placeholder="Search by name, email, role, department..."
            value={q}
            onChange={setQ}
          />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="download">Export</ToolButton>
          <ToolButton icon="refresh" aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="email"
          activeKey={sel}
          onRowClick={(r) => setSel(r.email)}
          columns={[
            { key: "check", label: "", thClass: "w-8", render: () => <input type="checkbox" className="rounded border-slate-300" onClick={(e) => e.stopPropagation()} readOnly /> },
            {
              key: "name",
              label: "Full Name",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar name={r.name} size="h-7 w-7" />
                  <span className="font-medium text-slate-700">{r.name}</span>
                </span>
              ),
            },
            { key: "email", label: "Email" },
            { key: "department", label: "Department" },
            { key: "role", label: "Role", render: (r) => <Badge tone={ROLE_TONE[r.role]}>{r.role}</Badge> },
            {
              key: "status",
              label: "Status",
              render: (r) => {
                const cls = STATUS_CLS[r.status];
                return (
                  <span className={`inline-flex items-center gap-1.5 text-[12px] font-semibold ${cls.split(" ")[1]}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${cls.split(" ")[0]}`} />
                    {r.status}
                  </span>
                );
              },
            },
            { key: "login", label: "Last Login", tdClass: "whitespace-nowrap" },
            { key: "menu", label: "Actions", render: () => <Icon name="dots" className="h-4 w-4 text-slate-400" /> },
          ]}
          rows={rows}
        />
        <div className="flex items-center border-t border-slate-100">
          <Pagination className="flex-1" summary="Showing 1 to 8 of 28 users" page={1} pages={4} />
          <SelectPill label="10 / page" className="mr-3.5" />
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution" action={<ToolButton>View all roles</ToolButton>}>
          <div className="flex flex-wrap items-center justify-center gap-6 py-2">
            <Donut segments={ROLE_SEGMENTS} size={160} thickness={22} centerTitle="28" centerSub="Total Users" />
            <Legend
              className="min-w-[220px]"
              items={ROLE_SEGMENTS.map((s) => ({ label: s.label, color: s.color, value: `${s.value} (${s.pct})` }))}
            />
          </div>
        </SectionCard>

        <SectionCard
          title="Recent Account Activity"
          action={<button className="text-[12px] font-semibold text-blue-600 hover:underline">View all</button>}
        >
          <div className="space-y-3.5">
            {ACCOUNT_ACTIVITY.map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${a.cls}`}>
                  <Icon name={a.icon} className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="text-[12.5px] font-semibold text-slate-800">{a.title}</div>
                  <div className="mt-0.5 text-[12px] text-slate-500">{a.sub}</div>
                </div>
                <span className="shrink-0 text-[11px] text-slate-400">{a.time}</span>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>
    </PortalShell>
  );
}
