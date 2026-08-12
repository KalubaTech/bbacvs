"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  ToolButton, DataTable, Pagination, ActionBtn,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";

const ROLE_COLORS = [CHART.green, CHART.blue, CHART.teal, CHART.purple, CHART.amber, CHART.red];
const ROLE_TONES = { admin: "purple", zaqa: "blue", hea: "teal", teveta: "amber", ecz: "green" };

const PERMISSIONS = [
  { label: "Dashboard Access", on: true },
  { label: "Learner Records - View", on: true },
  { label: "Results Import", on: true },
  { label: "Certificate Register", on: true },
  { label: "ZAQA Verification Requests", on: true },
  { label: "Evidence for ZAQA", on: true },
  { label: "Corrections & Replacements", on: true },
  { label: "Audit & Reports", on: true },
  { label: "User Management & Roles", on: false },
  { label: "Settings", on: true },
];

function Field({ label, required, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-400">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </div>
  );
}

function UserFormPanel({ form, setForm, roles, busy, error, onSave }) {
  return (
    <div>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-bold text-slate-900">Create User</h2>
        <button className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <Icon name="x" className="h-[18px] w-[18px]" />
        </button>
      </div>

      <SectionCard title="Account Details" className="mb-4">
        <div className="space-y-3">
          <Field label="Full Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" />
          <Field label="Email Address" required type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="user@ecz.gov.zm" />
          <Field label="Password" required type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="Min. 8 characters" />
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-400">
              Role<span className="text-red-500">*</span>
            </div>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Permissions"
        action={<button className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800">Select All</button>}
        className="mb-4"
      >
        <div className="mb-2 text-[11px] text-slate-400">Select permissions for this role</div>
        <div className="space-y-1">
          {PERMISSIONS.map((p) => (
            <div key={p.label} className="flex items-center gap-2.5 py-1">
              <span
                className={`flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded border ${
                  p.on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"
                }`}
              >
                {p.on && <Icon name="check" className="h-2.5 w-2.5" strokeWidth={3} />}
              </span>
              <span className="text-[12.5px] text-slate-700">{p.label}</span>
            </div>
          ))}
        </div>
      </SectionCard>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="flex justify-end gap-2.5">
        <ActionBtn tone="outline" onClick={() => setForm({ name: "", email: "", password: "", role: form.role })}>Cancel</ActionBtn>
        <ActionBtn tone="darkgreen" disabled={busy} onClick={onSave}>
          {busy ? "Saving…" : "Save User"}
        </ActionBtn>
      </div>
    </div>
  );
}

export default function EczUsersPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  const [users, setUsers] = useState([]);
  const [manageableRoles, setManageableRoles] = useState(["ecz"]);
  const [activity, setActivity] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "ecz" });
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.listUsers(token);
      setUsers(res.users || []);
      if (res.manageableRoles?.length) {
        setManageableRoles(res.manageableRoles);
        setForm((f) => (res.manageableRoles.includes(f.role) ? f : { ...f, role: res.manageableRoles[0] }));
      }
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    try {
      const act = await api.activity(token, "user");
      setActivity((act.activity || []).slice(0, 6));
    } catch {
      setActivity([]);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function onSave() {
    setFormError(null);
    if (!form.name || !form.email || !form.password) {
      setFormError("Name, email and password are required.");
      return;
    }
    setBusy(true);
    try {
      await api.createUser(token, form);
      setForm({ name: "", email: "", password: "", role: form.role });
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(u) {
    if (!confirm(`Remove ${u.name || u.email} from the ECZ portal?`)) return;
    setDeleting(u.id);
    try { await api.deleteUser(token, u.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeleting(null); }
  }

  if (!ready) return null;

  const rows = users.filter(
    (u) => !q || ((u.name || "") + (u.email || "") + (u.roleLabel || u.role || "")).toLowerCase().includes(q.toLowerCase())
  );

  const roleCounts = {};
  for (const u of users) {
    const k = u.roleLabel || u.role;
    roleCounts[k] = (roleCounts[k] || 0) + 1;
  }
  const roleEntries = Object.entries(roleCounts);
  const roleSegments = roleEntries.map(([label, value], i) => ({ label, value, color: ROLE_COLORS[i % ROLE_COLORS.length] }));
  const roleLegend = roleSegments.map((s) => ({
    label: s.label, color: s.color,
    value: `${s.value} (${users.length ? ((s.value / users.length) * 100).toFixed(1) : 0}%)`,
  }));
  const newest = users.length ? fmtDate(users[0].createdAt) : "—";

  return (
    <PortalShell
      portal="ecz"
      active="users"
      title="ECZ Portal – User Management & Roles"
      subtitle="Manage ECZ portal users, roles, permissions and access for BBACVS and ZAQA integration."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <>
          <ActionBtn tone="darkgreen" icon="plus">Add New User</ActionBtn>
          <ActionBtn tone="outline" icon="download">Export Users</ActionBtn>
        </>
      }
      panel={
        <UserFormPanel
          form={form}
          setForm={setForm}
          roles={manageableRoles}
          busy={busy}
          error={formError}
          onSave={onSave}
        />
      }
      panelWidth="w-[380px]"
    >
      <StatRow cols={5}>
        <StatCard icon="users" iconTone="softgreen" label="Total Users" value={users.length} sub="Manageable by ECZ" />
        <StatCard icon="checkCircle" iconTone="softgreen" label="Active Users" value={users.length} sub="All accounts active" />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={roleEntries.length} sub="Across ECZ Portal" />
        <StatCard icon="clock" iconTone="amber" label="Newest Account" value={newest} sub="Most recently created" />
        <StatCard icon="shield" iconTone="softblue" label="Your Account" value={(user.role || "ecz").toUpperCase()} sub={user.email} />
      </StatRow>

      {error && <div className="mb-3 text-[13px] font-medium text-red-600">{error}</div>}

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-96" placeholder="Search by name, email or role..." value={q} onChange={setQ} />
          <ToolButton icon="filter">Filter</ToolButton>
          <ToolButton icon="refresh" onClick={load} />
        </div>
        <DataTable
          rowKey="id"
          activeKey={sel}
          onRowClick={(r) => setSel(r.id)}
          columns={[
            {
              key: "name", label: "Full Name",
              render: (r) => (
                <span className="flex items-center gap-2">
                  <Avatar name={r.name || r.email} size="h-7 w-7" />
                  <span className="font-medium text-slate-700">{r.name || "—"}</span>
                  {r.self && <Badge tone="blue">You</Badge>}
                </span>
              ),
            },
            { key: "email", label: "Email Address" },
            {
              key: "role", label: "Role",
              render: (r) => <Badge tone={ROLE_TONES[r.role] || "slate"}>{r.roleLabel || r.role}</Badge>,
            },
            {
              key: "status", label: "Status",
              render: () => <Badge tone="green" dot>Active</Badge>,
            },
            { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
            {
              key: "actions", label: "Actions",
              render: (r) => (
                <span className="flex items-center gap-2.5">
                  {!r.self ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                      disabled={deleting === r.id}
                      className="text-red-400 hover:text-red-600 disabled:opacity-50"
                      aria-label={`Remove ${r.email}`}
                    >
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  ) : (
                    <Icon name="dots" className="h-4 w-4 text-slate-300" />
                  )}
                </span>
              ),
            },
          ]}
          rows={rows}
          footer={
            rows.length === 0 ? (
              <div className="px-4 py-8 text-center text-[13px] text-slate-400">No records yet.</div>
            ) : null
          }
        />
        <div className="flex items-center justify-between gap-3 pr-3.5">
          <Pagination summary={`Showing ${rows.length} of ${users.length} users`} page={1} pages={1} className="flex-1" />
          <SelectPill label="10 / page" />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution">
          {users.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex items-center gap-6">
              <Donut segments={roleSegments} centerTitle={String(users.length)} centerSub="Users" />
              <Legend items={roleLegend} className="flex-1" />
            </div>
          )}
        </SectionCard>
        <SectionCard title="Recent Account Activity">
          {activity.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No recent account activity.</div>
          ) : (
            <div className="space-y-3.5">
              {activity.map((a, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    a.action === "user.remove" ? "bg-red-100 text-red-600" : "bg-emerald-100 text-emerald-600"
                  }`}>
                    <Icon name={a.action === "user.remove" ? "x" : "plus"} className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1 leading-tight">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-slate-800">
                        {a.action === "user.create" ? "New user created" : a.action === "user.remove" ? "User removed" : a.action}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(a.at)}</span>
                    </div>
                    <div className="mt-0.5 text-[12px] text-slate-500">{a.summary} — by {a.actor}</div>
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
