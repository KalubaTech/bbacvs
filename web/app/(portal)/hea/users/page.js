"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  SelectPill, DataTable, Pagination, ActionBtn, PanelHeader, Toggle, TONES,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_LABEL = {
  admin: "Super administrator", zaqa: "ZAQA admin", hea: "HEA admin", teveta: "TEVETA admin", ecz: "ECZ admin",
};
const ROLE_TONE = { admin: "purple", hea: "blue", zaqa: "indigo", teveta: "orange", ecz: "amber" };
const ROLE_COLOR = { admin: CHART.purple, hea: CHART.blue, zaqa: CHART.green, teveta: CHART.orange, ecz: CHART.amber };

// Static design chrome — per-permission toggles have no backend counterpart.
const PERMISSIONS = [
  { icon: "apps", title: "Accreditation Applications", desc: "Create, review and manage applications" },
  { icon: "registry", title: "Programme Accreditation", desc: "Review and manage programme accreditation" },
  { icon: "clipboardCheck", title: "Institutional Compliance", desc: "Access and manage compliance records" },
  { icon: "clipboard", title: "Site Inspections", desc: "Plan, conduct and manage inspections" },
  { icon: "chart", title: "Reports & Analytics", desc: "View and export analytics and reports" },
  { icon: "users", title: "User Management", desc: "Manage users, roles and permissions" },
];

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

function DetailPanel({ form, setForm, roles, saving, error, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div>
      <PanelHeader title="Create User" />

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-3 text-[12px] font-bold text-slate-800">Account Information</div>
        <div className="space-y-3">
          <Field label="Full Name" required>
            <input className={INPUT_CLS} value={form.name} onChange={set("name")} placeholder="Jane Banda" />
          </Field>
          <Field label="Email Address" required>
            <input className={INPUT_CLS} type="email" value={form.email} onChange={set("email")} placeholder="officer@hea.gov.zm" />
          </Field>
          <Field label="Password" required>
            <input className={INPUT_CLS} type="password" value={form.password} onChange={set("password")} placeholder="min 8 characters" />
          </Field>
          <Field label="Role" required>
            <select className={INPUT_CLS} value={form.role} onChange={set("role")}>
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
              ))}
            </select>
          </Field>
          <div>
            <div className="mb-1 text-[11px] font-semibold text-slate-500">Status</div>
            <div className="flex items-center gap-2.5">
              <Toggle on />
              <span className="text-[12px] text-slate-600">
                <span className="font-semibold text-slate-800">Active</span> — User can access the system
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-0.5 flex items-center justify-between gap-2">
          <div className="text-[12px] font-bold text-slate-800">Permissions</div>
          <button className="text-[11px] font-semibold text-blue-600 hover:underline">Select All</button>
        </div>
        <div className="mb-2.5 text-[11px] text-slate-400">Permissions follow the assigned role.</div>
        <div className="space-y-1.5">
          {PERMISSIONS.map((p) => (
            <label key={p.title} className="flex items-start gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
              <input type="checkbox" defaultChecked className="mt-1 rounded border-slate-300" />
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                <Icon name={p.icon} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 leading-tight">
                <span className="block text-[12.5px] font-semibold text-slate-700">{p.title}</span>
                <span className="block text-[11px] text-slate-400">{p.desc}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {error && <div className="mb-3 text-[12px] font-medium text-red-600">{error}</div>}

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="outline" full onClick={onCancel}>Cancel</ActionBtn>
        <ActionBtn tone="navy" full disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save User"}
        </ActionBtn>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "hea" };

export default function HeaUsersPage() {
  const { ready, user, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(["hea"]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.listUsers(token);
      setUsers(r.users || []);
      if (r.manageableRoles?.length) {
        setRoles(r.manageableRoles);
        setForm((f) => (r.manageableRoles.includes(f.role) ? f : { ...f, role: r.manageableRoles[0] }));
      }
    } catch (err) { setError(err.message); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function saveUser() {
    setSaving(true); setPanelError(null);
    try {
      await api.createUser(token, form);
      setForm({ ...EMPTY_FORM, role: roles[0] || "hea" });
      await load();
    } catch (err) { setPanelError(err.message); }
    finally { setSaving(false); }
  }

  async function removeUser(u) {
    if (!confirm(`Remove ${u.name || u.email}? This cannot be undone.`)) return;
    setBusy(u.id); setError(null);
    try { await api.deleteUser(token, u.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const rows = users.filter(
    (u) => !q || ((u.name || "") + u.email + (u.roleLabel || "")).toLowerCase().includes(q.toLowerCase())
  );

  const roleCounts = users.reduce((m, u) => {
    m[u.role] = (m[u.role] || 0) + 1;
    return m;
  }, {});
  const roleDist = Object.entries(roleCounts).map(([role, value]) => ({
    label: ROLE_LABEL[role] || role,
    value,
    color: ROLE_COLOR[role] || CHART.slate,
    pct: users.length ? `${((value / users.length) * 100).toFixed(1)}%` : "0%",
  }));

  const activity = [...users]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 4)
    .map((u) => ({
      icon: "plus",
      tone: "green",
      title: "User account created",
      desc: `${u.name || u.email} (${u.roleLabel || u.role})`,
      time: fmtDate(u.createdAt),
    }));

  return (
    <PortalShell
      portal="hea"
      active="users"
      title="HEA Portal – User Management & Roles"
      subtitle="Manage HEA user accounts, roles and permissions across the HEA Portal."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="plus">Add New User</ActionBtn>}
      panel={
        <DetailPanel
          form={form}
          setForm={setForm}
          roles={roles}
          saving={saving}
          error={panelError}
          onSave={saveUser}
          onCancel={() => { setForm({ ...EMPTY_FORM, role: roles[0] || "hea" }); setPanelError(null); }}
        />
      }
      panelWidth="w-[380px]"
    >
      <StatRow cols={4}>
        <StatCard icon="users" iconTone="softblue" label="Total Users" value={String(users.length)} />
        <StatCard icon="user" iconTone="softgreen" label="Active Users" value={String(users.length)} sub="All accounts active" />
        <StatCard icon="clock" iconTone="amber" label="Pending Approvals" value="0" sub="None waiting" />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={String(Object.keys(roleCounts).length)} sub="Roles in use" />
      </StatRow>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search users..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <SelectPill label="Export" />
          <ToolButton icon="refresh" className="ml-auto" onClick={load} />
        </div>
        {error && <div className="px-4 pb-2 text-[12px] font-medium text-red-600">{error}</div>}
        <DataTable
          rowKey="id"
          columns={[
            { key: "name", label: "Name", render: (r) => <AvatarName name={r.name || r.email} /> },
            { key: "email", label: "Email" },
            {
              key: "role", label: "Role",
              render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{r.roleLabel || r.role}</Badge>,
            },
            { key: "status", label: "Status", render: () => <Badge tone="green" dot>Active</Badge> },
            { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
            {
              key: "actions", label: "Actions",
              render: (r) =>
                r.self ? (
                  <span className="text-[11px] text-slate-400">You</span>
                ) : (
                  <button
                    className="rounded-lg border border-red-200 bg-red-50 p-1.5 text-red-600 hover:bg-red-100 disabled:opacity-50"
                    aria-label={`Remove ${r.email}`}
                    disabled={busy === r.id}
                    onClick={(e) => { e.stopPropagation(); removeUser(r); }}
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                ),
            },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="border-b border-slate-100 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${users.length} users`} page={1} pages={1} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard
          title="Role Distribution"
          action={<button className="text-[12px] font-semibold text-blue-600 hover:underline">View role analytics →</button>}
        >
          {roleDist.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut
                size={160}
                thickness={22}
                centerTitle={String(users.length)}
                centerSub="Total"
                segments={roleDist.map((r) => ({ value: r.value, color: r.color, label: r.label }))}
              />
              <Legend
                className="min-w-[210px] flex-1"
                items={roleDist.map((r) => ({ label: r.label, color: r.color, value: `${r.value} (${r.pct})` }))}
              />
            </div>
          )}
        </SectionCard>
        <SectionCard
          title="Recent Account Activity"
          action={<button className="text-[12px] font-semibold text-blue-600 hover:underline">View all</button>}
        >
          {activity.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No account activity yet.</div>
          ) : (
            <div className="space-y-3">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES[a.tone]}`}>
                    <Icon name={a.icon} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">{a.title}</span>
                      <span className="shrink-0 text-[11px] text-slate-400">{a.time}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{a.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}
