"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, openBlob } from "../../../../lib/api";
import { getToken, getUser } from "../../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../../components/ui";
import NewUiBanner from "../../../../components/NewUiBanner";
import { connectWallet, anchorCredential, currentAddress, hasMetaMask } from "../../../../lib/metamask";
import { IncomingApplications } from "../../../../components/digitize";
import { DisputeQueue } from "../../../../components/disputes";
import { ProposeQualification } from "../../../../components/qualifications";

const issueIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="4" width="18" height="14" rx="2" /><path d="M7 20h10M8 9h8M8 13h5" />
  </svg>
);

export default function IssuerPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", nationalId: "", holderEmail: "", qualification: "", graduationYear: 2026, credentialType: "degree", zqfLevel: 7 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(null);
  const [busy, setBusy] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const [programmes, setProgrammes] = useState([]);
  const [progName, setProgName] = useState("");
  const [progLevel, setProgLevel] = useState(7);

  const load = useCallback(async () => {
    try {
      setRows((await api.myIssued(getToken())).credentials);
      setProgrammes((await api.myProgrammes(getToken())).programmes);
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "issuer") { router.push("/login"); return; }
    api.issuerProfile(getToken()).then(setProfile).catch(() => {});
    currentAddress().then(setWallet).catch(() => {});
    load();
  }, [router, load]);

  const isMetaMask = profile?.signingMode === "metamask";
  const walletMatches = wallet && profile && wallet.toLowerCase() === profile.walletAddress.toLowerCase();
  // Higher-ed institutions must be HEA-approved to issue; suspended/pending blocks issuance.
  const heaBlocked = profile && profile.sector !== "secondary" && profile.heaStatus && profile.heaStatus !== "approved";

  async function connect() {
    setError(null);
    try { setWallet(await connectWallet()); }
    catch (err) { setError(err.message); }
  }

  async function issueViaMetaMask(body) {
    setStep("Preparing credential (sign + encrypt + IPFS)…");
    const prep = await api.prepare(getToken(), body);
    const addr = await connectWallet();
    setWallet(addr);
    if (addr.toLowerCase() !== prep.issuerAddress.toLowerCase()) {
      throw new Error("Wrong account selected in MetaMask. Please switch to your institution's registered wallet and try again.");
    }
    setStep("Confirm the anchoring transaction in MetaMask…");
    const txHash = await anchorCredential(prep.credentialRegistry, prep.credentialHash, prep.cidHash);
    setStep("Confirming on-chain…");
    return api.finalize(getToken(), prep.credentialHash, txHash);
  }

  async function onIssue(e) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true); setStep(null);
    try {
      const body = {
        holderEmail: form.holderEmail,
        claims: { name: form.name, nationalId: form.nationalId || undefined, qualification: form.qualification, graduationYear: Number(form.graduationYear) },
        credentialType: form.credentialType,
        zqfLevel: Number(form.zqfLevel),
      };
      setResult(isMetaMask ? await issueViaMetaMask(body) : await api.issue(getToken(), body));
      load();
    } catch (err) { setError(err.message?.replace(/\(action=.*/, "") || "Failed"); }
    finally { setLoading(false); setStep(null); }
  }

  async function onRevoke(hash) {
    if (!confirm("Revoke this credential? (reason: fraud detected)")) return;
    setBusy(hash);
    try { await api.revoke(getToken(), hash, 2); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onTranscript(hash) {
    setBusy(hash);
    try { openBlob(await api.downloadTranscript(getToken(), hash), `transcript-${hash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onSubmitZaqa(hash) {
    setBusy(hash);
    try { await api.submitToZaqa(getToken(), hash); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function onCreateProgramme(e) {
    e.preventDefault();
    if (!progName.trim()) return;
    setError(null);
    try { await api.createProgramme(getToken(), { name: progName, zqfLevel: Number(progLevel) }); setProgName(""); load(); }
    catch (err) { setError(err.message); }
  }
  async function onSubmitProgramme(id) {
    setBusy(id);
    try { await api.submitProgramme(getToken(), id); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function onDownloadAccreditation() {
    try { openBlob(await api.myAccreditationCertificate(getToken()), "accreditation-certificate.pdf"); }
    catch (err) { setError(err.message); }
  }

  const valLabel = (v) => ({
    draft: "draft", pending: "awaiting ZAQA", validated: "ZAQA validated",
    rejected: "rejected", suspicious: "flagged", suspended: "suspended", under_dispute: "disputed",
  }[v] || v);
  const valBadge = (v) =>
    v === "validated" ? "badge-green" : v === "rejected" || v === "suspended" ? "badge-red" :
    v === "suspicious" || v === "under_dispute" ? "badge-amber" : "badge-slate";

  return (
    <div>
      <NewUiBanner href="/institution" name="Institution" />
      <PageHeader icon={issueIcon} title="Issuer dashboard" />

      {/* HEA compliance banner */}
      {profile && profile.sector !== "secondary" && (
        <div className={`card-pad mb-6 flex flex-wrap items-center justify-between gap-3 ${heaBlocked ? "border-amber-300 bg-amber-50" : ""}`}>
          <div className="text-sm">
            <div className="font-medium text-slate-800">HEA compliance status</div>
            <div className="text-slate-500">
              {heaBlocked
                ? (profile.heaNote || "Your institution is not currently approved by the HEA to issue credentials.")
                : "Your institution is HEA-approved to issue higher-education credentials."}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={heaBlocked ? "badge-amber" : "badge-green"}>HEA: {profile.heaStatus || "approved"}</span>
            {profile.zaqaTrusted && <span className="badge-green">ZAQA trusted</span>}
            {!heaBlocked && (
              <Button size="sm" variant="secondary" onClick={onDownloadAccreditation}>HEA accreditation certificate</Button>
            )}
          </div>
        </div>
      )}

      {/* MetaMask connection banner */}
      {isMetaMask && (
        <div className="card-pad mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm">
            <div className="font-medium text-slate-800">MetaMask signing enabled</div>
            <div className="text-slate-500">Connect your registered institution wallet to sign issuance.</div>
          </div>
          {!hasMetaMask() ? (
            <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="btn-secondary btn-sm">Install MetaMask</a>
          ) : wallet ? (
            <span className={walletMatches ? "badge-green" : "badge-amber"}>
              {walletMatches ? "connected" : "wrong account selected"}
            </span>
          ) : (
            <Button size="sm" onClick={connect}>Connect MetaMask</Button>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Issue form */}
        <form onSubmit={onIssue} className="card-pad space-y-4 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Issue credential</h2>
          <Field label="Graduate name" value={form.name} onChange={set("name")} required placeholder="Nelson Chituli" />
          <Field label="NRC / Passport (optional)" value={form.nationalId} onChange={set("nationalId")} placeholder="123456/78/1"
            hint="Shown (masked) on the ZAQA verification certificate." />
          <Field label="Graduate email" type="email" value={form.holderEmail} onChange={set("holderEmail")} required
            placeholder="grad@example.com" hint="The graduate signs in with this email to see the credential." />
          <Field label="Qualification" value={form.qualification} onChange={set("qualification")} required placeholder="Bachelor of ICT" />
          <div className="grid grid-cols-3 gap-3">
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={form.credentialType} onChange={set("credentialType")}>
                <option value="diploma">Diploma</option>
                <option value="degree">Degree</option>
                <option value="masters">Master's</option>
                <option value="phd">PhD</option>
              </select>
            </label>
            <Field label="ZQF level" type="number" min="1" max="10" value={form.zqfLevel} onChange={set("zqfLevel")} required />
            <Field label="Grad. year" type="number" value={form.graduationYear} onChange={set("graduationYear")} required />
          </div>
          {error && <Alert>{error}</Alert>}
          {heaBlocked && <Alert kind="error">Issuing is disabled while your HEA status is “{profile.heaStatus}”.</Alert>}
          <Button type="submit" loading={loading} disabled={heaBlocked} className="w-full">
            {loading ? (step || "Working…") : isMetaMask ? "Issue & sign in MetaMask" : "Issue credential"}
          </Button>
          {result && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
              <p className="text-sm font-semibold text-emerald-800">Credential issued ✓</p>
              {result.qrImage && /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={result.qrImage} alt="Signed QR" className="mx-auto mt-3 h-52 w-52 rounded-lg border border-emerald-200 bg-white p-2" />
              )}
              <Link href={`/verify?hash=${result.credentialHash}`} className="mt-2 inline-block text-xs font-medium text-brand hover:underline">
                Verify this credential →
              </Link>
            </div>
          )}
        </form>

        {/* Issued list */}
        <div className="card-pad lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">Issued credentials</h2>
            <span className="badge-slate">{rows.length} total</span>
          </div>
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.credentialHash} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{r.subjectName}</div>
                    <div className="text-sm text-slate-500">{r.qualification} · {r.graduationYear}</div>
                  </div>
                  <span className={valBadge(r.zaqaValidation)}>{valLabel(r.zaqaValidation)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-4 text-xs">
                  <Link href={`/verify?hash=${r.credentialHash}`} className="font-medium text-brand hover:underline">verify</Link>
                  {r.zaqaValidation === "draft" && (
                    <button onClick={() => onSubmitZaqa(r.credentialHash)} disabled={busy === r.credentialHash}
                      className="font-medium text-brand hover:underline disabled:opacity-50">
                      {busy === r.credentialHash ? "submitting…" : "submit to ZAQA"}
                    </button>
                  )}
                  <button onClick={() => onTranscript(r.credentialHash)} disabled={busy === r.credentialHash}
                    className="font-medium text-slate-600 hover:underline disabled:opacity-50">transcript</button>
                  {r.status === "active" && (
                    <button onClick={() => onRevoke(r.credentialHash)} disabled={busy === r.credentialHash}
                      className="font-medium text-red-600 hover:underline disabled:opacity-50">
                      {busy === r.credentialHash ? "revoking…" : "revoke"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No credentials issued yet.</p>}
          </div>
        </div>
      </div>

      {/* Digitization requests from graduates */}
      <IncomingApplications />

      <DisputeQueue title="Disputes routed to your institution" />

      {/* Programmes — create & submit for HEA accreditation (higher-ed only) */}
      {profile && profile.sector !== "secondary" && (
        <div className="grid gap-6 lg:grid-cols-5">
          <form onSubmit={onCreateProgramme} className="card-pad space-y-4 lg:col-span-2">
            <h2 className="font-semibold text-slate-900">Add programme</h2>
            <p className="text-xs text-slate-500">Create a programme and submit it to the HEA for accreditation.</p>
            <Field label="Programme name" value={progName} onChange={(e) => setProgName(e.target.value)} placeholder="Bachelor of ICT" />
            <Field label="ZQF level" type="number" min="1" max="10" value={progLevel} onChange={(e) => setProgLevel(e.target.value)} />
            <Button type="submit" className="w-full">Add programme</Button>
          </form>
          <div className="card-pad lg:col-span-3">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-slate-900">Programmes</h2>
              <span className="badge-slate">{programmes.length} total</span>
            </div>
            <div className="space-y-3">
              {programmes.map((p) => (
                <div key={p.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900">{p.name}</div>
                    <div className="text-sm text-slate-500">{p.zqfLevel ? `ZQF ${p.zqfLevel}` : ""}{p.note ? ` · ${p.note}` : ""}</div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={p.status === "approved" ? "badge-green" : p.status === "rejected" ? "badge-red" : p.status === "pending" ? "badge-amber" : "badge-slate"}>{p.status}</span>
                    {p.status === "draft" && (
                      <button onClick={() => onSubmitProgramme(p.id)} disabled={busy === p.id}
                        className="text-xs font-medium text-brand hover:underline disabled:opacity-50">submit to HEA</button>
                    )}
                  </div>
                </div>
              ))}
              {programmes.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No programmes yet.</p>}
            </div>
          </div>
        </div>
      )}

      {/* NQF national register — propose qualifications (authority review → ZAQA registration) */}
      {profile && profile.sector !== "secondary" && <ProposeQualification />}
    </div>
  );
}
