"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, AvatarName, StatCard, StatRow, SectionCard, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ActionBtn, PanelHeader, ErrorBanner,
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
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
        {label} <span className="text-red-500">*</span>
      </label>
      {children}
    </div>
  );
}

function CreateUserPanel({ form, setForm, roles, saving, error, onSave, onCancel }) {
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  return (
    <div>
      <PanelHeader title="Create User" />
      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <div className="mb-3 text-[12px] font-bold text-slate-800">Account Information</div>
        <div className="space-y-3">
          <Field label="Full Name">
            <input className={INPUT_CLS} value={form.name} onChange={set("name")} placeholder="Jane Banda" />
          </Field>
          <Field label="Email Address">
            <input className={INPUT_CLS} type="email" value={form.email} onChange={set("email")} placeholder="officer@teveta.org.zm" />
          </Field>
          <Field label="Password">
            <input className={INPUT_CLS} type="password" value={form.password} onChange={set("password")} placeholder="min 8 characters" />
          </Field>
          <Field label="Role">
            <select className={INPUT_CLS} value={form.role} onChange={set("role")} disabled={roles.length === 1}>
              {roles.map((r) => (
                <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      {error && <div className="mb-3 text-[12px] font-medium text-red-600">{error}</div>}

      <div className="grid grid-cols-2 gap-2.5">
        <ActionBtn tone="outline" full onClick={onCancel}>Cancel</ActionBtn>
        <ActionBtn tone="orange" full disabled={saving} onClick={onSave}>
          {saving ? "Saving…" : "Save User"}
        </ActionBtn>
      </div>
    </div>
  );
}

const EMPTY_FORM = { name: "", email: "", password: "", role: "teveta" };

export default function TevetaUsersPage() {
  const { ready, token } = usePortalGuard(["teveta"]);
  const [q, setQ] = useState("");
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState(["teveta"]);
  const [form, setForm] = useState(EMPTY_FORM);
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  async function saveUser() {
    setPanelError(null);
    if (!form.name || !form.email || !form.password) {
      setPanelError("Name, email and password are required.");
      return;
    }
    setSaving(true);
    try {
      await api.createUser(token, form);
      setForm({ ...EMPTY_FORM, role: roles[0] || "teveta" });
      await load();
    } catch (err) {
      setPanelError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function removeUser(u) {
    if (!confirm(`Remove ${u.name || u.email}? This cannot be undone.`)) return;
    setBusy(u.id);
    setError(null);
    try { await api.deleteUser(token, u.id); await load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const rows = users.filter(
    (u) => !q || ((u.name || "") + u.email + (u.roleLabel || "")).toLowerCase().includes(q.toLowerCase())
  );
  const pg = usePager(rows, 10, [q]);

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
  const newest = users.length ? fmtDate(users[0].createdAt) : "—";

  if (!ready) return null;

  return (
    <PortalShell
      portal="teveta"
      active="users"
      title="TEVETA Portal – Users & Officers"
      panel={
        <CreateUserPanel
          form={form}
          setForm={setForm}
          roles={roles}
          saving={saving}
          error={panelError}
          onSave={saveUser}
          onCancel={() => { setForm({ ...EMPTY_FORM, role: roles[0] || "teveta" }); setPanelError(null); }}
        />
      }
      panelWidth="w-[380px]"
    >
      <StatRow cols={3}>
        <StatCard icon="users" iconTone="softblue" label="Total Users" value={String(users.length)} sub="Manageable by your seat" />
        <StatCard icon="users" iconTone="purple" label="Role Groups" value={String(Object.keys(roleCounts).length)} sub="Roles in use" />
        <StatCard icon="clock" iconTone="amber" label="Newest Account" value={newest} sub="Most recently created" />
      </StatRow>

      <ErrorBanner error={error} onRetry={load} />

      <div className="mb-5 rounded-xl border border-slate-200 bg-white shadow-card">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-800">Users ({users.length})</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 px-4 py-3">
          <SearchBox className="w-72" placeholder="Search users..." value={q} onChange={setQ} />
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="id"
          loading={loading}
          emptyText="No users yet."
          columns={[
            { key: "name", label: "Name", render: (r) => <AvatarName name={r.name || r.email} /> },
            { key: "email", label: "Email" },
            {
              key: "role", label: "Role",
              render: (r) => <Badge tone={ROLE_TONE[r.role] || "slate"}>{r.roleLabel || r.role}</Badge>,
            },
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
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

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
    </PortalShell>
  );
}
