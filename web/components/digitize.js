"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { api, openBlob } from "../lib/api";
import { getToken } from "../lib/auth";
import { Button, Field, Alert } from "./ui";

function readFileBase64(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

const APP_BADGE = { issued: "badge-green", rejected: "badge-red", submitted: "badge-amber" };
const APP_LABEL = { issued: "verified & sent to ZAQA", rejected: "rejected", submitted: "awaiting institution" };

// Graduate: apply to digitize an existing credential + track applications.
export function ApplyDigitization() {
  const [institutions, setInstitutions] = useState([]);
  const [apps, setApps] = useState([]);
  const [form, setForm] = useState({ targetIssuerId: "", qualification: "", graduationYear: 2020, credentialType: "degree", zqfLevel: 7, nationalId: "" });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try { setApps((await api.myApplications(getToken())).applications); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => {
    api.approvedInstitutions().then((d) => {
      setInstitutions(d.institutions);
      setForm((f) => ({ ...f, targetIssuerId: f.targetIssuerId || d.institutions?.[0]?.id || "" }));
    }).catch(() => {});
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!form.targetIssuerId) { setError("Select the awarding institution."); return; }
    if (!file) { setError("Attach a scan/photo of your credential."); return; }
    if (file.size > 6 * 1024 * 1024) { setError("File too large (max 6 MB)."); return; }
    setBusy(true);
    try {
      const data = await readFileBase64(file);
      const res = await api.applyDigitization(getToken(), {
        targetIssuerId: form.targetIssuerId, qualification: form.qualification,
        graduationYear: Number(form.graduationYear), credentialType: form.credentialType,
        zqfLevel: Number(form.zqfLevel), nationalId: form.nationalId || undefined,
        document: { name: file.name, mime: file.type || "application/octet-stream", data },
      });
      setOk(res.existing ? res.message : "Application submitted. The institution has been notified to verify it.");
      setFile(null);
      setForm({ ...form, qualification: "" });
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-5">
      <form onSubmit={submit} className="card-pad space-y-4 lg:col-span-2">
        <h2 className="font-semibold text-slate-900">Apply for validation of qualification</h2>
        <p className="text-xs text-slate-500">
          Apply to have your existing qualification validated and issued digitally. The awarding institution verifies
          your upload and forwards it to ZAQA for national validation. Fees apply —{" "}
          <Link href="/instructions" className="font-medium text-brand hover:underline">see instructions &amp; fees</Link>.
        </p>
        <label className="block">
          <span className="label">Awarding institution</span>
          <select className="input" value={form.targetIssuerId} onChange={set("targetIssuerId")}>
            {institutions.length === 0 && <option value="">No institutions available</option>}
            {institutions.map((i) => <option key={i.id} value={i.id}>{i.institution}</option>)}
          </select>
        </label>
        <Field label="Qualification" value={form.qualification} onChange={set("qualification")} required placeholder="Bachelor of ICT" />
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="label">Type</span>
            <select className="input" value={form.credentialType} onChange={set("credentialType")}>
              <option value="diploma">Diploma</option><option value="degree">Degree</option>
              <option value="masters">Master's</option><option value="phd">PhD</option>
              <option value="secondary">Secondary</option>
            </select>
          </label>
          <Field label="ZQF" type="number" min="1" max="10" value={form.zqfLevel} onChange={set("zqfLevel")} />
          <Field label="Year" type="number" value={form.graduationYear} onChange={set("graduationYear")} required />
        </div>
        <Field label="NRC / Passport (optional)" value={form.nationalId} onChange={set("nationalId")} placeholder="123456/78/1" />
        <label className="block">
          <span className="label">Upload your credential (PDF or image)</span>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand-100" />
          {file && <span className="mt-1 block text-xs text-slate-400">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
        </label>
        {error && <Alert>{error}</Alert>}
        {ok && <Alert kind="success">{ok}</Alert>}
        <Button type="submit" loading={busy} className="w-full">Submit application</Button>
      </form>

      <div className="card-pad lg:col-span-3">
        <h2 className="mb-4 font-semibold text-slate-900">My validation applications</h2>
        <div className="space-y-3">
          {apps.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{a.qualification}</div>
                  <div className="text-sm text-slate-500">{a.institution} · {a.graduationYear}</div>
                </div>
                <span className={APP_BADGE[a.status] || "badge-slate"}>{APP_LABEL[a.status] || a.status}</span>
              </div>
              {a.status === "issued" && a.credentialHash && (
                <div className="mt-2 text-xs text-slate-500">Issued — see it under “My credentials” above; awaiting ZAQA validation.</div>
              )}
              {a.status === "rejected" && a.note && <div className="mt-2 text-xs text-red-700">{a.note}</div>}
            </div>
          ))}
          {apps.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No applications yet.</p>}
        </div>
      </div>
    </div>
  );
}

// Institution (issuer/ECZ): review incoming digitization requests, verify & forward to ZAQA.
export function IncomingApplications() {
  const [apps, setApps] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setApps((await api.incomingApplications(getToken())).applications); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function viewDoc(id) {
    try { openBlob(await api.applicationDocument(getToken(), id)); }
    catch (e) { setError(e.message); }
  }
  async function verifyIssue(id) {
    setBusy(id);
    try { await api.verifyIssueApplication(getToken(), id); load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }
  async function reject(id) {
    const reason = prompt("Reason for rejection (optional):") ?? null;
    if (reason === null) return;
    setBusy(id);
    try { await api.rejectApplication(getToken(), id, reason); load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  const pending = apps.filter((a) => a.status === "submitted");

  return (
    <div className="card-pad mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">Validation applications</h2>
        {pending.length > 0 && <span className="badge-amber">{pending.length} awaiting</span>}
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div className="space-y-3">
        {apps.map((a) => (
          <div key={a.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{a.applicantName} <span className="text-xs font-normal text-slate-400">({a.applicantEmail})</span></div>
                <div className="text-sm text-slate-500">{a.qualification} · {a.graduationYear}{a.zqfLevel ? ` · ZQF ${a.zqfLevel}` : ""}</div>
              </div>
              <span className={APP_BADGE[a.status] || "badge-slate"}>{a.status === "issued" ? "forwarded to ZAQA" : a.status}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-4 text-xs">
              {a.hasDocument && <button onClick={() => viewDoc(a.id)} className="font-medium text-brand hover:underline">view upload</button>}
              {a.status === "submitted" && (
                <>
                  <button onClick={() => verifyIssue(a.id)} disabled={busy === a.id}
                    className="font-medium text-emerald-700 hover:underline disabled:opacity-50">
                    {busy === a.id ? "issuing…" : "verify & forward to ZAQA"}
                  </button>
                  <button onClick={() => reject(a.id)} disabled={busy === a.id}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50">reject</button>
                </>
              )}
              {a.status === "issued" && a.credentialHash && (
                <Link href={`/verify?hash=${a.credentialHash}`} className="font-medium text-brand hover:underline">verify</Link>
              )}
            </div>
          </div>
        ))}
        {apps.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No digitization requests yet.</p>}
      </div>
    </div>
  );
}
