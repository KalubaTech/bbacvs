"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, openBlob } from "../../../../lib/api";
import { getToken, getUser } from "../../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../../components/ui";
import NewUiBanner from "../../../../components/NewUiBanner";
import { TeamCard, ActivityCard } from "../../../../components/manage";
import { IncomingApplications } from "../../../../components/digitize";
import { DisputeQueue } from "../../../../components/disputes";
import { QualificationQueue } from "../../../../components/qualifications";

const eczIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 3 3 6 3s6-2 6-3v-5" />
  </svg>
);

// ECZ secondary-school qualifications and their ZQF levels.
const CERT_TYPES = [
  { label: "Grade 12 School Certificate", zqf: 4 },
  { label: "Form 4 (Junior Secondary)", zqf: 3 },
  { label: "Form 6 / GCE A-Level", zqf: 4 },
];

export default function EczPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", holderEmail: "", qualification: CERT_TYPES[0].label, graduationYear: 2026 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try { setRows((await api.myIssued(getToken())).credentials); }
    catch (err) { setError(err.message); }
  }, []);

  async function transcript(hash) {
    setBusy(hash);
    try { openBlob(await api.downloadTranscript(getToken(), hash), `transcript-${hash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "ecz" && u.role !== "admin")) { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function onIssue(e) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true);
    try {
      const zqf = CERT_TYPES.find((c) => c.label === form.qualification)?.zqf || 4;
      const res = await api.issue(getToken(), {
        holderEmail: form.holderEmail,
        claims: { name: form.name, qualification: form.qualification, graduationYear: Number(form.graduationYear) },
        credentialType: "secondary",
        zqfLevel: zqf,
      });
      setResult(res);
      load();
    } catch (err) { setError(err.message?.replace(/\(action=.*/, "") || "Failed"); }
    finally { setLoading(false); }
  }

  async function onRevoke(hash) {
    if (!confirm("Revoke / correct this certificate?")) return;
    setBusy(hash);
    try { await api.revoke(getToken(), hash, 3); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <NewUiBanner href="/ecz/dashboard" name="ECZ" />
      <PageHeader
        icon={eczIcon}
        title="ECZ — Secondary certification"
      />

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Issue form */}
        <form onSubmit={onIssue} className="card-pad space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Issue school certificate</h2>
          <Field label="Candidate name" value={form.name} onChange={set("name")} required placeholder="Chanda Mwansa" />
          <Field label="Candidate email" type="email" value={form.holderEmail} onChange={set("holderEmail")} required
            placeholder="candidate@example.com" hint="The candidate signs in with this email to see the certificate." />
          <label className="block">
            <span className="label">Certificate type</span>
            <select className="input" value={form.qualification} onChange={set("qualification")}>
              {CERT_TYPES.map((c) => <option key={c.label} value={c.label}>{c.label} · ZQF {c.zqf}</option>)}
            </select>
          </label>
          <Field label="Examination year" type="number" value={form.graduationYear} onChange={set("graduationYear")} required />
          {error && <Alert>{error}</Alert>}
          <Button type="submit" loading={loading} className="w-full">
            {loading ? "Issuing…" : "Issue certificate"}
          </Button>
          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">Certificate issued ✓</p>
              {result.qrImage && /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={result.qrImage} alt="Signed QR" className="mx-auto mt-3 h-52 w-52 rounded-lg border border-emerald-200 bg-white p-2" />
              )}
              <Link href={`/verify?hash=${result.credentialHash}`} className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
                Verify this certificate →
              </Link>
            </div>
          )}
        </form>

        {/* Records */}
        <div className="card-pad lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Certification records</h2>
            <span className="badge-slate">{rows.length} total</span>
          </div>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.credentialHash} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{r.subjectName}</div>
                    <div className="text-sm text-slate-500">{r.qualification} · {r.graduationYear}{r.zqfLevel ? ` · ZQF ${r.zqfLevel}` : ""}</div>
                  </div>
                  <span className={r.status === "revoked" ? "badge-red" : r.status === "pending" ? "badge-amber" : "badge-green"}>{r.status}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <Link href={`/verify?hash=${r.credentialHash}`} className="font-medium text-brand hover:underline">verify</Link>
                  <button onClick={() => transcript(r.credentialHash)} disabled={busy === r.credentialHash}
                    className="font-medium text-slate-600 hover:underline disabled:opacity-50">transcript</button>
                  {r.status === "active" && (
                    <button onClick={() => onRevoke(r.credentialHash)} disabled={busy === r.credentialHash}
                      className="font-medium text-red-600 hover:underline disabled:opacity-50">
                      {busy === r.credentialHash ? "revoking…" : "revoke / correct"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No certificates issued yet.</p>}
          </div>
        </div>
      </div>

      <IncomingApplications />

      <QualificationQueue mode="authority" />

      <DisputeQueue title="Disputes routed to ECZ" />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TeamCard />
        <ActivityCard prefix="credential" title="ECZ activity — who changed what" />
      </div>
    </div>
  );
}
