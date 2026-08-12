"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, SelectPill,
  DataTable, Pagination, ActionBtn, Toggle, TONES,
} from "../../../../components/portal/kit";
import { Donut, Legend, CHART } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_TONE = { admin: "blue", zaqa: "teal", hea: "indigo", teveta: "cyan", ecz: "orange" };
const ROLE_COLORS = [CHART.blue, CHART.green, CHART.amber, CHART.red, CHART.purple, CHART.teal];

// Decorative permissions matrix (no backend counterpart).
const PERMISSIONS = [
  { icon: "apps", title: "Applications", sub: "Create, view and manage applications", on: true },
  { icon: "registry", title: "Qualification Registry", sub: "Access and manage qualification records", on: true },
  { icon: "queue", title: "Validation Queue", sub: "Validate and process applications", on: true },
  { icon: "clock", title: "Disputes", sub: "Manage and resolve disputes", on: false },
  { icon: "reports", title: "Reports", sub: "View and export reports", on: true },
];

function Field({ label, required, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-400">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <span className="relative mt-1 block">
        <input
          type={type}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </span>
    </label>
  );
}

function DetailPanel({ roles, onSave, busy }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(roles[0] || "zaqa");

  function reset() {
    setName(""); setEmail(""); setPassword(""); setRole(roles[0] || "zaqa");
  }

  return (
    <div>
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">Create User</h2>

      <div className="mb-2 text-[12px] font-semibold text-slate-800">Account Information</div>
      <div className="space-y-3">
        <Field label="Full Name" required value={name} onChange={setName} placeholder="e.g. Bwalya Phiri" />
        <Field label="Email Address" required value={email} onChange={setEmail} placeholder="name@zaqa.gov.zm" />
        <Field label="Password" required type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />
        <label className="block">
          <span className="block text-[11px] font-medium text-slate-400">
            Role<span className="text-red-500"> *</span>
          </span>
          <span className="relative mt-1 block">
            <select
              className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {roles.map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
            <Icon name="chevronDown" className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
          </span>
        </label>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
        <div>
          <div className="text-[12px] font-semibold text-slate-800">Status</div>
          <div className="text-[11px] text-slate-500">Active — User can access the system</div>
        </div>
        <Toggle on />
      </div>

      <div className="mt-5 flex items-center justify-between gap-2">
        <div>
          <div className="text-[12px] font-semibold text-slate-800">Permissions</div>
          <div className="text-[11px] text-slate-400">Assign permissions for the selected role.</div>
        </div>
        <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-slate-600">
          Select All
          <input type="checkbox" className="rounded border-slate-300" readOnly />
        </label>
      </div>
      <div className="mt-2 space-y-2">
        {PERMISSIONS.map((p) => (
          <div key={p.title} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES.softblue}`}>
              <Icon name={p.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-[12.5px] font-medium text-slate-700">{p.title}</div>
              <div className="truncate text-[11px] text-slate-400">{p.sub}</div>
            </div>
            <input type="checkbox" className="rounded border-slate-300" checked={p.on} readOnly />
          </div>
        ))}
      </div>

      <div className="mt-5 flex justify-end gap-2.5">
        <ActionBtn tone="outline" onClick={reset}>Cancel</ActionBtn>
        <ActionBtn
          tone="navy"
          disabled={busy || !name || !email || !password}
          className={busy || !name || !email || !password ? "opacity-50" : ""}
          onClick={async () => {
            const ok = await onSave({ name, email, password, role });
            if (ok) reset();
          }}
        >
          {busy ? "Saving…" : "Save User"}
        </ActionBtn>
      </div>
    </div>
  );
}

export default function ZaqaUsersPage() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const [users, setUsers] = useState([]);
  const [manageableRoles, setManageableRoles] = useState(["zaqa"]);
  const [activity, setActivity] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api.listUsers(token);
      setUsers(res.users || []);
      if (res.manageableRoles?.length) setManageableRoles(res.manageableRoles);
    } catch (err) { setError(err.message); }
    // Account-activity trail is best-effort.
    api.activity(token, "user.").then((a) => setActivity(a.activity || [])).catch(() => {});
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function createUser(body) {
    setBusy("create");
    try { await api.createUser(token, body); await load(); return true; }
    catch (err) { setError(err.message); return false; }
    finally { setBusy(null); }
  }

  async function removeUser(u) {
    if (!confirm(`Remove ${u.name || u.email} from the platform?`)) return;
    setBusy(u.id);
    try { await api.deleteUser(token, u.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  if (!ready) return null;

  const rows = users.filter(
    (u) => !q || `${u.name} ${u.email} ${u.roleLabel}`.toLowerCase().includes(q.toLowerCase())
  );

  const now = new Date();
  const addedThisMonth = users.filter((u) => {
    const d = u.createdAt ? new Date(u.createdAt) : null;
    return d && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const roleCounts = {};
  for (const u of users) {
    const label = u.roleLabel || u.role;
    roleCounts[label] = (roleCounts[label] || 0) + 1;
  }
  const roleSegments = Object.entries(roleCounts).map(([label, value], i) => ({
    label, value, color: ROLE_COLORS[i % ROLE_COLORS.length],
  }));

  return (
    <PortalShell
      portal="zaqa"
      active="users"
      title="ZAQA Portal – User Administration"
      subtitle="Manage user accounts, roles, permissions and access to the BBACVS platform."
      user={{ name: user.name || user.email, sub: user.email }}
      actions={<ActionBtn tone="navy" icon="plus">Add New User</ActionBtn>}
      panel={<DetailPanel roles={manageableRoles} onSave={createUser} busy={busy === "create"} />}
      panelWidth="w-[380px]"
    >
      <StatRow cols={4}>
        <StatCard icon="users" iconTone="softblue" label="Total Users" value={users.length} sub="Accounts you manage" />
        <StatCard icon="user" iconTone="softgreen" label="Active Users" value={users.length} sub="All accounts enabled" />
        <StatCard icon="clock" iconTone="amber" label="Added This Month" value={addedThisMonth} sub="New accounts" />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={Object.keys(roleCounts).length} sub="Roles in use" />
      </StatRow>

      {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}

      <SectionCard title={`Users (${users.length})`} pad="p-0" className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-72" placeholder="Search users..." value={q} onChange={setQ} />
          <SelectPill label="Filter" />
          <SelectPill label="Export" />
        </div>
        <DataTable
          rowKey="id"
          columns={[
            { key: "name", label: "Name", render: (r) => <AvatarName name={r.name || r.email} /> },
            { key: "email", label: "Email" },
            { key: "role", label: "Role", render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{r.roleLabel || r.role}</Badge> },
            { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
            { key: "status", label: "Status", render: (r) => <Badge tone={r.self ? "blue" : "green"} dot>{r.self ? "You" : "Active"}</Badge> },
            {
              key: "menu", label: "Actions",
              render: (r) =>
                r.self ? (
                  <Icon name="dots" className="h-4 w-4 text-slate-300" />
                ) : (
                  <button
                    aria-label={`Remove ${r.email}`}
                    disabled={busy === r.id}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-50"
                    onClick={(e) => { e.stopPropagation(); removeUser(r); }}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                ),
            },
          ]}
          rows={rows}
        />
        {rows.length === 0 && (
          <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
        )}
        <Pagination summary={`Showing ${rows.length} of ${users.length} users`} page={1} pages={1} />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution" pad="p-4">
          {users.length ? (
            <div className="flex items-center gap-6">
              <Donut
                size={150}
                thickness={20}
                centerTitle={String(users.length)}
                centerSub="Total"
                segments={roleSegments}
              />
              <Legend
                className="min-w-0 flex-1"
                items={roleSegments.map((s) => ({
                  label: s.label, color: s.color,
                  value: `${s.value} (${((s.value / users.length) * 100).toFixed(1)}%)`,
                }))}
              />
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
          )}
          <button className="mt-3 text-[12px] font-semibold text-blue-600">View role analytics →</button>
        </SectionCard>

        <SectionCard
          title="Recent Account Activity"
          pad="p-4"
          action={<button className="text-[12px] font-semibold text-blue-600">View all</button>}
        >
          {activity.length ? (
            <div className="space-y-3.5">
              {activity.slice(0, 6).map((a, i) => {
                const isRemove = (a.action || "").includes("remove");
                return (
                  <div key={i} className="flex gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONES[isRemove ? "amber" : "green"]}`}>
                      <Icon name={isRemove ? "pause" : "plus"} className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[13px] font-semibold text-slate-800">
                          {isRemove ? "User account removed" : "New user account created"}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">{fmtDateTime(a.at)}</span>
                      </div>
                      <div className="mt-0.5 text-[12px] text-slate-500">{a.summary}{a.actor ? ` — by ${a.actor}` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">No records yet.</div>
          )}
        </SectionCard>
      </div>
    </PortalShell>
  );
}
