"use client";

// User administration — accounts the signed-in officer may manage. The role
// options come from the API's manageableRoles (ZAQA officers may create zaqa
// seats; platform admins see every governance role).

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ActionBtn, Modal, ErrorBanner, exportCSV, TONES,
} from "../../../../components/portal/kit";
import { Donut, Legend, CHART } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_TONE = { admin: "blue", zaqa: "teal", hea: "indigo", teveta: "cyan", ecz: "orange" };
const ROLE_COLORS = [CHART.blue, CHART.green, CHART.amber, CHART.red, CHART.purple, CHART.teal];

function Field({ label, required, value, onChange, type = "text", placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium text-slate-400">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      <input
        type={type}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export default function ZaqaUsersPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [users, setUsers] = useState([]);
  const [manageableRoles, setManageableRoles] = useState(["zaqa"]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  // create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("zaqa");
  const [createError, setCreateError] = useState(null);
  // delete modal
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers(token);
      setUsers(res.users || []);
      if (res.manageableRoles?.length) {
        setManageableRoles(res.manageableRoles);
        setRole((r) => (res.manageableRoles.includes(r) ? r : res.manageableRoles[0]));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // Account-activity trail is best-effort.
    api.activity(token, "user.").then((a) => setActivity(a.activity || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function createUser() {
    if (busy || !name || !email || !password) return;
    setBusy("create");
    setCreateError(null);
    try {
      await api.createUser(token, { name, email, password, role });
      setCreateOpen(false);
      setName("");
      setEmail("");
      setPassword("");
      await load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function removeUser(u) {
    if (busy) return;
    setBusy(u.id);
    setError(null);
    try {
      await api.deleteUser(token, u.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  const rows = users.filter(
    (u) => !q || `${u.name} ${u.email} ${u.roleLabel || u.role}`.toLowerCase().includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);

  if (!ready) return null;

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

  const columns = [
    { key: "name", label: "Name", render: (r) => <AvatarName name={r.name || r.email} />, csv: (r) => r.name || "" },
    { key: "email", label: "Email" },
    {
      key: "role", label: "Role",
      render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{r.roleLabel || r.role}</Badge>,
      csv: (r) => r.roleLabel || r.role || "",
    },
    { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt), csv: (r) => r.createdAt || "" },
    {
      key: "status", label: "Status",
      render: (r) => <Badge tone={r.self ? "blue" : "green"} dot>{r.self ? "You" : "Active"}</Badge>,
      csv: (r) => (r.self ? "You" : "Active"),
    },
    {
      key: "menu", label: "Actions",
      render: (r) =>
        r.self ? (
          <span className="text-[11px] text-slate-300">—</span>
        ) : (
          <button
            aria-label={`Remove ${r.email}`}
            disabled={busy === r.id}
            className="text-slate-400 hover:text-red-600 disabled:opacity-50"
            onClick={(e) => {
              e.stopPropagation();
              setDeleting(r);
            }}
          >
            <Icon name="trash" className="h-4 w-4" />
          </button>
        ),
      csv: () => "",
    },
  ];

  return (
    <PortalShell
      portal="zaqa"
      active="users"
      title="User Administration"
      actions={
        <ActionBtn tone="navy" icon="plus" onClick={() => { setCreateError(null); setCreateOpen(true); }}>
          Add New User
        </ActionBtn>
      }
    >
      <StatRow cols={4}>
        <StatCard icon="users" iconTone="softblue" label="Total Users" value={loading ? "…" : users.length} />
        <StatCard icon="clock" iconTone="amber" label="Added This Month" value={loading ? "…" : addedThisMonth} />
        <StatCard icon="user" iconTone="purple" label="Role Groups" value={loading ? "…" : Object.keys(roleCounts).length} />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="Roles You May Create" value={loading ? "…" : manageableRoles.length} sub={manageableRoles.join(", ").toUpperCase()} />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <SectionCard title={`Users (${users.length})`} pad="p-0" className="mb-5">
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-72" placeholder="Search users..." value={q} onChange={setQ} />
          <ToolButton
            icon="download"
            onClick={() => exportCSV("zaqa-users", columns.filter((c) => c.key !== "menu"), rows)}
            disabled={rows.length === 0}
            className="disabled:opacity-50"
          >
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          loading={loading}
          rowKey="id"
          columns={columns}
          rows={pg.rows}
          emptyText="No users found."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution" pad="p-4">
          {users.length ? (
            <div className="flex flex-col items-center gap-6 sm:flex-row">
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
            <div className="py-8 text-center text-[13px] text-slate-400">No users yet.</div>
          )}
        </SectionCard>

        <SectionCard title="Recent Account Activity" pad="p-4">
          {activity.length ? (
            <div className="space-y-3.5">
              {activity.slice(0, 6).map((a, i) => {
                const isRemove = (a.action || "").includes("remove") || (a.action || "").includes("delete");
                return (
                  <div key={i} className="flex gap-3">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${TONES[isRemove ? "amber" : "green"]}`}>
                      <Icon name={isRemove ? "trash" : "plus"} className="h-4 w-4" />
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
            <div className="py-8 text-center text-[13px] text-slate-400">No account activity recorded yet.</div>
          )}
        </SectionCard>
      </div>

      {/* Create-user modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Add New User"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setCreateOpen(false)}>Cancel</ActionBtn>
            <ActionBtn
              tone="navy"
              disabled={busy === "create" || !name || !email || !password}
              className="disabled:opacity-50"
              onClick={createUser}
            >
              {busy === "create" ? "Saving…" : "Create User"}
            </ActionBtn>
          </>
        }
      >
        {createError && <div className="mb-3 text-[12.5px] font-medium text-red-600">{createError}</div>}
        <div className="space-y-3">
          <Field label="Full Name" required value={name} onChange={setName} placeholder="e.g. Bwalya Phiri" />
          <Field label="Email Address" required type="email" value={email} onChange={setEmail} placeholder="name@zaqa.gov.zm" />
          <Field label="Password" required type="password" value={password} onChange={setPassword} placeholder="Min. 8 characters" />
          <label className="block">
            <span className="block text-[11px] font-medium text-slate-400">
              Role<span className="text-red-500"> *</span>
            </span>
            <select
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {manageableRoles.map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
          </label>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Remove User"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setDeleting(null)}>Cancel</ActionBtn>
            <ActionBtn
              tone="red"
              icon="trash"
              disabled={!!busy}
              className="disabled:opacity-50"
              onClick={() => removeUser(deleting)}
            >
              {busy ? "Removing…" : "Remove"}
            </ActionBtn>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">
          Remove <span className="font-semibold">{deleting?.name || deleting?.email}</span> (
          {deleting?.roleLabel || deleting?.role}) from the platform? They immediately lose access; this does not
          affect any records they created.
        </p>
      </Modal>
    </PortalShell>
  );
}
