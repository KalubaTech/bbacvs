"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { getToken } from "../lib/auth";
import { Button, Field, Alert } from "./ui";

const ROLE_LABEL = {
  admin: "Super administrator", zaqa: "ZAQA admin", hea: "HEA admin", teveta: "TEVETA admin", ecz: "ECZ admin",
};

// Role-scoped team management: list users the current admin manages + add / remove them.
export function TeamCard() {
  const [data, setData] = useState({ users: [], manageableRoles: [] });
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.listUsers(getToken());
      setData(d);
      setForm((f) => ({ ...f, role: f.role || d.manageableRoles?.[0] || "" }));
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add(e) {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      await api.createUser(getToken(), form);
      setForm({ name: "", email: "", password: "", role: form.role });
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function remove(id) {
    if (!confirm("Remove this user?")) return;
    try { await api.deleteUser(getToken(), id); load(); }
    catch (err) { setError(err.message); }
  }

  const multiRole = (data.manageableRoles || []).length > 1;

  return (
    <div className="card-pad">
      <h2 className="mb-4 font-semibold text-slate-900">Team &amp; users</h2>
      <form onSubmit={add} className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Jane Banda" />
        <Field label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required placeholder="jane@authority.gov.zm" />
        <Field label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required placeholder="min 8 characters" />
        {multiRole && (
          <label className="block">
            <span className="label">Role</span>
            <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {(data.manageableRoles || []).map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
            </select>
          </label>
        )}
        {error && <div className="sm:col-span-2"><Alert>{error}</Alert></div>}
        <div className="sm:col-span-2"><Button type="submit" loading={busy}>Add user</Button></div>
      </form>

      <div className="mt-5 space-y-2">
        {(data.users || []).map((u) => (
          <div key={u.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 p-3">
            <div className="min-w-0">
              <div className="font-medium text-slate-900">{u.name || u.email}</div>
              <div className="text-xs text-slate-500">{u.email} · {u.roleLabel}{u.self ? " · you" : ""}</div>
            </div>
            {!u.self && (
              <button onClick={() => remove(u.id)} className="shrink-0 text-xs font-medium text-red-600 hover:underline">remove</button>
            )}
          </div>
        ))}
        {(data.users || []).length === 0 && <p className="py-6 text-center text-sm text-slate-400">No users yet.</p>}
      </div>
    </div>
  );
}

// Accountability trail: who created or modified what (optionally filtered by action prefix).
export function ActivityCard({ prefix, title = "Activity — who changed what" }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  useEffect(() => {
    api.activity(getToken(), prefix).then((d) => setRows(d.activity || [])).catch((e) => setError(e.message));
  }, [prefix]);

  return (
    <div className="card-pad">
      <h2 className="mb-3 font-semibold text-slate-900">{title}</h2>
      {error && <Alert>{error}</Alert>}
      <div className="space-y-2">
        {rows.map((a, i) => (
          <div key={i} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-sm last:border-0">
            <div className="min-w-0">
              <div className="text-slate-800">{a.summary || a.action}</div>
              <div className="text-xs text-slate-500">{a.actor} · {a.role}</div>
            </div>
            <div className="shrink-0 text-xs text-slate-400">{new Date(a.at).toLocaleString()}</div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No activity recorded yet.</p>}
      </div>
    </div>
  );
}
