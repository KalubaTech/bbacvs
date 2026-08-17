"use client";

import { useEffect, useState, useCallback } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ActionBtn, PanelHeader, Modal, ErrorBanner,
  exportCSV, TONES,
} from "../../../../components/portal/kit";
import { CHART, Donut, Legend } from "../../../../components/portal/charts";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const ROLE_LABEL = {
  admin: "Super administrator", zaqa: "ZAQA admin", hea: "HEA admin", teveta: "TEVETA admin", ecz: "ECZ admin",
};
const ROLE_TONE = { admin: "purple", hea: "blue", zaqa: "indigo", teveta: "orange", ecz: "amber" };
const ROLE_COLOR = { admin: CHART.purple, hea: CHART.blue, zaqa: CHART.green, teveta: CHART.orange, ecz: CHART.amber };

const INPUT_CLS =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";

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

function UserForm({ form, setForm, roles }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
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
      <div className="rounded-lg bg-slate-50 p-2.5 text-[11px] text-slate-500">
        Permissions follow the assigned role.
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "hea" };

export default function HeaUsersPage() {
  const { ready, token } = usePortalGuard(["hea"]);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(["hea"]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.listUsers(token);
      setUsers(r.users || []);
      if (r.manageableRoles?.length) {
        setRoles(r.manageableRoles);
        setForm((f) => (r.manageableRoles.includes(f.role) ? f : { ...f, role: r.manageableRoles[0] }));
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function saveUser() {
    setSaving(true); setPanelError(null);
    try {
      await api.createUser(token, form);
      setForm({ ...EMPTY_FORM, role: roles[0] || "hea" });
      setModalOpen(false);
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

  function resetForm() {
    setForm({ ...EMPTY_FORM, role: roles[0] || "hea" });
    setPanelError(null);
  }

  if (!ready) return null;

  const rows = users.filter(
    (u) => !q || ((u.name || "") + u.email + (u.roleLabel || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pager = usePager(rows, 10, [q]);

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

  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const recentCount = users.filter((u) => u.createdAt && new Date(u.createdAt).getTime() >= cutoff).length;

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

  const columns = [
    { key: "name", label: "Name", csv: (r) => r.name || r.email, render: (r) => <AvatarName name={r.name || r.email} /> },
    { key: "email", label: "Email" },
    {
      key: "role", label: "Role", csv: (r) => r.roleLabel || r.role,
      render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{r.roleLabel || r.role}</Badge>,
    },
    { key: "createdAt", label: "Created", csv: (r) => fmtDate(r.createdAt), render: (r) => fmtDate(r.createdAt) },
    {
      key: "actions", label: "Actions", csv: () => "",
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
  ];

  return (
    <PortalShell
      portal="hea"
      active="users"
      title="HEA Portal – User Management & Roles"
      actions={
        <ActionBtn tone="navy" icon="plus" onClick={() => setModalOpen(true)}>
          Add New User
        </ActionBtn>
      }
      panel={
        <div>
          <PanelHeader title="Create User" />
          <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
            <div className="mb-3 text-[12px] font-bold text-slate-800">Account Information</div>
            <UserForm form={form} setForm={setForm} roles={roles} />
          </div>
          {panelError && !modalOpen && <div className="mb-3 text-[12px] font-medium text-red-600">{panelError}</div>}
          <div className="grid grid-cols-2 gap-2.5">
            <ActionBtn tone="outline" full onClick={resetForm}>Cancel</ActionBtn>
            <ActionBtn tone="navy" full disabled={saving} onClick={saveUser}>
              {saving ? "Saving…" : "Save User"}
            </ActionBtn>
          </div>
        </div>
      }
      panelWidth="w-[380px]"
    >
      <StatRow cols={4}>
        <StatCard icon="users" iconTone="softblue" label="Total Users" value={String(users.length)} />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={String(Object.keys(roleCounts).length)} />
        <StatCard icon="plus" iconTone="softgreen" label="Added – Last 30 Days" value={String(recentCount)} />
        <StatCard
          icon="user"
          iconTone="amber"
          label="Newest Account"
          value={users.length ? fmtDate([...users].sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))[0].createdAt) : "—"}
        />
      </StatRow>

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-80" placeholder="Search users..." value={q} onChange={setQ} />
          <ToolButton icon="download" onClick={() => exportCSV("hea-users", columns, rows)}>Export</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load}>Refresh</ToolButton>
        </div>
        <div className="px-4">
          <ErrorBanner error={error} onRetry={load} />
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          columns={columns}
          rows={pager.rows}
          emptyText="No users found."
          footer={<Pagination {...pager.props} className="border-t border-slate-100" />}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SectionCard title="Role Distribution">
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
        <SectionCard title="Recent Account Activity">
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

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Add New User"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setModalOpen(false)}>Cancel</ActionBtn>
            <ActionBtn tone="navy" disabled={saving} onClick={saveUser}>
              {saving ? "Saving…" : "Save User"}
            </ActionBtn>
          </>
        }
      >
        <UserForm form={form} setForm={setForm} roles={roles} />
        {panelError && <div className="mt-3 text-[12px] font-medium text-red-600">{panelError}</div>}
      </Modal>
    </PortalShell>
  );
}
