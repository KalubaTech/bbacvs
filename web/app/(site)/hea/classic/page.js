"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, openBlob } from "../../../../lib/api";
import { getToken, getUser } from "../../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../../components/ui";
import NewUiBanner from "../../../../components/NewUiBanner";
import { TeamCard, ActivityCard } from "../../../../components/manage";
import { DisputeQueue } from "../../../../components/disputes";
import { QualificationQueue } from "../../../../components/qualifications";

const heaIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21h18M6 21V9l6-4 6 4v12M10 21v-6h4v6" />
  </svg>
);

export default function HeaPage() {
  const router = useRouter();
  const [institutions, setInstitutions] = useState([]);
  const [pending, setPending] = useState([]);
  const [pendingProgs, setPendingProgs] = useState([]);
  const [monitoring, setMonitoring] = useState(null);
  const [form, setForm] = useState({ institution: "", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try {
      setInstitutions((await api.heaInstitutions(getToken())).institutions);
      setPending((await api.heaPending(getToken())).pending);
      setPendingProgs((await api.pendingProgrammes(getToken())).programmes);
      setMonitoring(await api.heaMonitoring(getToken()));
    } catch (err) { setError(err.message); }
  }, []);

  async function approveProg(id) {
    setBusy(id);
    try { await api.approveProgramme(getToken(), id); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function rejectProg(id) {
    const reason = prompt("Reason for rejection (optional):") ?? null;
    if (reason === null) return;
    setBusy(id);
    try { await api.rejectProgramme(getToken(), id, reason); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function accreditationCert(id) {
    try { openBlob(await api.heaAccreditationCertificate(getToken(), id)); }
    catch (err) { setError(err.message); }
  }

  async function approve(id) {
    setBusy(id);
    try { const r = await api.heaApprove(getToken(), id); if (r.warning) setError(r.warning); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):") ?? null;
    if (reason === null) return;
    setBusy(id);
    try { await api.heaReject(getToken(), id, reason); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function viewDoc(id) {
    try { openBlob(await api.accreditationDoc(getToken(), "hea", id)); }
    catch (err) { setError(err.message); }
  }
  async function editPrograms(inst) {
    const current = (inst.accreditedPrograms || []).join(", ");
    const input = prompt("Accredited programs (comma-separated):", current);
    if (input === null) return;
    const list = input.split(",").map((s) => s.trim()).filter(Boolean);
    setBusy(inst.id);
    try { await api.heaSetPrograms(getToken(), inst.id, list); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "hea" && u.role !== "admin")) { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function onRegister(e) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true);
    try {
      const res = await api.heaRegister(getToken(), form);
      setResult(res);
      setForm({ institution: "", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "" });
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function setStatus(id, heaStatus) {
    const note = heaStatus === "suspended" ? (prompt("Suspension reason (optional):") || "") : "";
    setBusy(id);
    try { await api.heaSetStatus(getToken(), id, heaStatus, note); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <NewUiBanner href="/hea/dashboard" name="HEA" />
      <PageHeader
        icon={heaIcon}
        title="HEA — Higher Education Authority"
      />

      {/* Pending approvals (self-registered institutions) */}
      {pending.length > 0 && (
        <div className="card-pad mb-6 border-amber-300 bg-amber-50/60">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Pending approval</h2>
            <span className="badge-amber">{pending.length} awaiting review</span>
          </div>
          <div className="space-y-3">
            {pending.map((i) => (
              <div key={i.id} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{i.institution}</div>
                  </div>
                  <span className="badge-amber shrink-0">self-registered</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {i.hasAccreditationDoc && (
                    <button onClick={() => viewDoc(i.id)} className="font-medium text-brand hover:underline">view accreditation</button>
                  )}
                  <button onClick={() => approve(i.id)} disabled={busy === i.id}
                    className="font-medium text-emerald-700 hover:underline disabled:opacity-50">
                    {busy === i.id ? "approving…" : "approve"}
                  </button>
                  <button onClick={() => reject(i.id)} disabled={busy === i.id}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50">reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Programme accreditation queue */}
      {pendingProgs.length > 0 && (
        <div className="card-pad mb-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Programmes awaiting accreditation</h2>
            <span className="badge-amber">{pendingProgs.length}</span>
          </div>
          <div className="space-y-3">
            {pendingProgs.map((p) => (
              <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{p.name}</div>
                  <div className="text-sm text-slate-500">{p.institution}{p.zqfLevel ? ` · ZQF ${p.zqfLevel}` : ""}</div>
                </div>
                <div className="flex shrink-0 gap-3 text-xs">
                  <button onClick={() => approveProg(p.id)} disabled={busy === p.id}
                    className="font-medium text-emerald-700 hover:underline disabled:opacity-50">accredit</button>
                  <button onClick={() => rejectProg(p.id)} disabled={busy === p.id}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50">reject</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Register institution */}
        <form onSubmit={onRegister} className="card-pad space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Register HE institution</h2>
          <p className="text-xs text-slate-500">Onboards the institution as an authorised on-chain issuer (~30–60s) and creates its issuing-officer login.</p>
          <Field label="Institution name" value={form.institution} onChange={set("institution")} required placeholder="Mulungushi University" />
          <Field label="Issuing officer name" value={form.officerName} onChange={set("officerName")} required placeholder="Jane Banda" />
          <Field label="Officer login email" type="email" value={form.officerEmail} onChange={set("officerEmail")} required placeholder="registrar@mu.zm" />
          <Field label="Officer password" type="password" value={form.officerPassword} onChange={set("officerPassword")} required placeholder="min 8 characters" />
          <Field label="Institution MetaMask address (optional)" value={form.metamaskAddress} onChange={set("metamaskAddress")}
            placeholder="0x… — leave blank for server-signed"
            hint="If set, the institution signs its own anchoring transactions in MetaMask." />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full">
            {loading ? "Registering on-chain…" : "Register institution"}
          </Button>
          {result && (
            <Alert kind="success">
              <div className="font-semibold">✓ {result.issuer.institution} registered</div>
              <div className="mt-1 text-xs">HEA: {result.issuer.heaStatus} · officer {result.officer.email}</div>
            </Alert>
          )}
        </form>

        {/* Registry */}
        <div className="card-pad lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Institution registry</h2>
            <span className="badge-slate">{institutions.length} institutions</span>
          </div>
          <div className="space-y-3">
            {institutions.map((i) => (
              <div key={i.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{i.institution}</div>
                    {i.accreditedPrograms?.length > 0 && (
                      <div className="mt-1 text-xs text-slate-500">Programs: {i.accreditedPrograms.join(", ")}</div>
                    )}
                    {i.heaNote && <div className="mt-1 text-xs text-amber-700">{i.heaNote}</div>}
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={i.heaStatus === "approved" ? "badge-green" : i.heaStatus === "suspended" ? "badge-red" : "badge-amber"}>{i.heaStatus}</span>
                    <span className={i.onChain ? "badge-slate" : "badge-amber"}>{i.onChain ? "on-chain" : "pending chain"}</span>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-xs">
                  {i.hasAccreditationDoc && (
                    <button onClick={() => viewDoc(i.id)} className="font-medium text-brand hover:underline">accreditation</button>
                  )}
                  <button onClick={() => editPrograms(i)} disabled={busy === i.id}
                    className="font-medium text-slate-600 hover:underline disabled:opacity-50">programs</button>
                  {i.heaStatus === "approved" && (
                    <button onClick={() => accreditationCert(i.id)}
                      className="font-medium text-brand hover:underline">accreditation cert</button>
                  )}
                  {i.heaStatus !== "approved" && (
                    <button onClick={() => setStatus(i.id, "approved")} disabled={busy === i.id}
                      className="font-medium text-emerald-700 hover:underline disabled:opacity-50">approve</button>
                  )}
                  {i.heaStatus !== "suspended" && (
                    <button onClick={() => setStatus(i.id, "suspended")} disabled={busy === i.id}
                      className="font-medium text-red-600 hover:underline disabled:opacity-50">suspend</button>
                  )}
                </div>
              </div>
            ))}
            {institutions.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No institutions registered yet.</p>}
          </div>
        </div>
      </div>

      {/* Monitoring */}
      {monitoring && (
        <div className="card-pad mt-6">
          <h2 className="mb-4 font-semibold text-slate-900">Higher-education issuance monitoring</h2>
          {monitoring.summary.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No higher-education credentials issued yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-4">Institution</th>
                    <th className="pb-2 pr-4">Issued</th>
                    <th className="pb-2 pr-4">Active</th>
                    <th className="pb-2">Revoked</th>
                  </tr>
                </thead>
                <tbody>
                  {monitoring.summary.map((s) => (
                    <tr key={s.institution} className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-medium text-slate-800">{s.institution}</td>
                      <td className="py-2 pr-4">{s.total}</td>
                      <td className="py-2 pr-4 text-emerald-700">{s.active}</td>
                      <td className="py-2 text-red-600">{s.revoked}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <QualificationQueue mode="authority" />

      <DisputeQueue title="Disputes routed to HEA" />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TeamCard />
        <ActivityCard prefix="hea" title="HEA activity — who changed what" />
      </div>
    </div>
  );
}
