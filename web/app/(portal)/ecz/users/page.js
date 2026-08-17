"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ActionBtn, Modal, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";

const ROLE_COLORS = [CHART.green, CHART.blue, CHART.teal, CHART.purple, CHART.amber, CHART.red];
const ROLE_TONES = { admin: "purple", zaqa: "blue", hea: "teal", teveta: "amber", ecz: "green" };

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100";

function Field({ label, value, onChange, type = "text", placeholder }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-slate-500">
        {label}
        <span className="text-red-500">*</span>
      </label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={INPUT_CLS}
      />
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "ecz" };

export default function EczUsersPage() {
  const { ready, user, token } = usePortalGuard(["ecz"]);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [manageableRoles, setManageableRoles] = useState(["ecz"]);
  const [activity, setActivity] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.listUsers(token);
      setUsers(res.users || []);
      if (res.manageableRoles?.length) {
        setManageableRoles(res.manageableRoles);
        setForm((f) => (res.manageableRoles.includes(f.role) ? f : { ...f, role: res.manageableRoles[0] }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
      setForm({ ...EMPTY_FORM, role: manageableRoles[0] || "ecz" });
      setModalOpen(false);
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
    setError(null);
    try { await api.deleteUser(token, u.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setDeleting(null); }
  }

  const rows = users.filter(
    (u) => !q || ((u.name || "") + (u.email || "") + (u.roleLabel || u.role || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);

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

  const csvCols = [
    { key: "name", label: "Name", csv: (r) => r.name || "" },
    { key: "email", label: "Email" },
    { key: "role", label: "Role", csv: (r) => r.roleLabel || r.role },
    { key: "createdAt", label: "Created", csv: (r) => fmtDate(r.createdAt) },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="ecz"
      active="users"
      title="ECZ Portal – User Management & Roles"
      actions={
        <>
          <ActionBtn tone="darkgreen" icon="plus" onClick={() => { setFormError(null); setModalOpen(true); }}>
            Add New User
          </ActionBtn>
          <ToolButton icon="download" onClick={() => exportCSV("ecz-users", csvCols, rows)}>
            Export Users
          </ToolButton>
        </>
      }
    >
      <StatRow cols={4}>
        <StatCard icon="users" iconTone="softgreen" label="Total Users" value={String(users.length)} sub="Manageable by ECZ" />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={String(roleEntries.length)} sub="Across ECZ Portal" />
        <StatCard icon="clock" iconTone="amber" label="Newest Account" value={newest} sub="Most recently created" />
        <StatCard icon="shield" iconTone="softblue" label="Your Account" value={(user.role || "ecz").toUpperCase()} sub={user.email} />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-full sm:w-96" placeholder="Search by name, email or role..." value={q} onChange={setQ} />
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          emptyText="No users yet."
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
            { key: "createdAt", label: "Created", render: (r) => fmtDate(r.createdAt) },
            {
              key: "actions", label: "Actions",
              render: (r) =>
                !r.self ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(r); }}
                    disabled={deleting === r.id}
                    className="text-red-400 hover:text-red-600 disabled:opacity-50"
                    aria-label={`Remove ${r.email}`}
                  >
                    <Icon name="trash" className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-[11px] text-slate-400">You</span>
                ),
            },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution">
          {users.length === 0 ? (
            <div className="py-10 text-center text-[13px] text-slate-400">No records yet.</div>
          ) : (
            <div className="flex flex-wrap items-center gap-6">
              <Donut segments={roleSegments} centerTitle={String(users.length)} centerSub="Users" />
              <Legend items={roleLegend} className="min-w-[180px] flex-1" />
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Create User"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setModalOpen(false)}>Cancel</ActionBtn>
            <ActionBtn tone="darkgreen" disabled={busy} onClick={onSave}>
              {busy ? "Saving…" : "Save User"}
            </ActionBtn>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Full Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Full name" />
          <Field label="Email Address" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="user@ecz.gov.zm" />
          <Field label="Password" type="password" value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="Min. 8 characters" />
          <div>
            <div className="mb-1 text-[11px] font-medium text-slate-500">
              Role<span className="text-red-500">*</span>
            </div>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              disabled={manageableRoles.length === 1}
              className={INPUT_CLS}
            >
              {manageableRoles.map((r) => (
                <option key={r} value={r}>{r.toUpperCase()}</option>
              ))}
            </select>
          </div>
          {formError && <div className="text-[13px] font-medium text-red-600">{formError}</div>}
        </div>
      </Modal>
    </PortalShell>
  );
}
