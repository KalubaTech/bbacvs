"use client";

import { useState, useEffect } from "react";
import { api, openBlob } from "../../../lib/api";
import { Button, Alert } from "../../../components/ui";
import Icon from "../../../components/portal/icons";
import { Badge } from "../../../components/portal/kit";
import QrScanner from "../../../components/QrScanner";
import { syncIssuerKeys, verifyOfflineLocal, getCachedKeys } from "../../../lib/offline";

// icon: "ok" (check) | "wait" (clock — pending/under-review) | "bad" (cross — failed/negative)
const STATES = {
  VERIFIED: { cls: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-800", label: "Verified", ok: true, icon: "ok" },
  OFFLINE_VERIFIED: { cls: "border-emerald-200 bg-emerald-50", dot: "bg-emerald-500", text: "text-emerald-800", label: "Verified offline", ok: true, icon: "ok" },
  REVOKED: { cls: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-800", label: "Revoked", icon: "bad" },
  SUSPENDED: { cls: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-800", label: "Suspended — under review", icon: "bad" },
  SUSPICIOUS: { cls: "border-amber-200 bg-amber-50", dot: "bg-amber-500", text: "text-amber-900", label: "Suspicious — under review", icon: "wait" },
  UNDER_DISPUTE: { cls: "border-amber-200 bg-amber-50", dot: "bg-amber-500", text: "text-amber-900", label: "Under dispute", icon: "wait" },
  REJECTED: { cls: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-800", label: "Rejected by ZAQA", icon: "bad" },
  PENDING_ZAQA_VALIDATION: { cls: "border-amber-200 bg-amber-50", dot: "bg-amber-500", text: "text-amber-900", label: "Awaiting ZAQA validation", icon: "wait" },
  UNKNOWN_ISSUER: { cls: "border-amber-200 bg-amber-50", dot: "bg-amber-500", text: "text-amber-900", label: "Unknown issuer", icon: "wait" },
  NOT_FOUND: { cls: "border-slate-200 bg-slate-50", dot: "bg-slate-400", text: "text-slate-700", label: "Not found", icon: "bad" },
  TAMPERED: { cls: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-800", label: "Tampered", icon: "bad" },
  INVALID: { cls: "border-red-200 bg-red-50", dot: "bg-red-500", text: "text-red-800", label: "Invalid signature", icon: "bad" },
  NO_KEYS: { cls: "border-slate-200 bg-slate-50", dot: "bg-slate-400", text: "text-slate-700", label: "No cached keys", icon: "bad" },
};

// The three status glyphs (check / clock / cross).
const STATUS_ICON = {
  ok: <path d="M5 13l4 4L19 7" />,
  wait: <path d="M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z" />,
  bad: <path d="M6 6l12 12M18 6L6 18" />,
};

function decodeQR(raw) {
  // QR now carries raw JSON; older QRs were base64-wrapped — try both.
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(atob(raw)); } catch {}
  return null;
}

export default function VerifyPage() {
  const [tab, setTab] = useState("paste");
  const [hash, setHash] = useState("");
  const [payload, setPayload] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [keyCount, setKeyCount] = useState(0);
  const [verifiedHash, setVerifiedHash] = useState(null);
  const [certBusy, setCertBusy] = useState(false);

  useEffect(() => {
    syncIssuerKeys().then((m) => setKeyCount(Object.keys(m).length)).catch(() => {
      const c = getCachedKeys();
      if (c) setKeyCount(Object.keys(c.map).length);
    });
    const h = new URLSearchParams(window.location.search).get("hash");
    if (h) { setHash(h); runOnline(h); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runOnline(h) {
    const target = (h ?? hash).trim();
    if (!target) return;
    setError(null); setResult(null); setLoading(true);
    try { setResult({ ...(await api.verifyOnline(target)), mode: "online" }); setVerifiedHash(target); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function downloadCertificate() {
    if (!verifiedHash) return;
    setCertBusy(true); setError(null);
    try { openBlob(await api.downloadVerificationCertificate(verifiedHash), `ZAQA-verification-${verifiedHash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setCertBusy(false); }
  }

  function onScan(raw) {
    setError(null); setResult(null);
    const p = decodeQR(raw);
    if (!p || !p.sig) { setError("That QR isn't a BBACVS credential."); return; }
    setPayload(p);
  }

  function runOffline() {
    if (!payload) return;
    const r = verifyOfflineLocal(payload);
    if (r.reason && (r.status === "NO_KEYS" || r.status === "UNKNOWN_ISSUER")) setError(r.reason);
    setResult({ status: r.status, mode: "offline", credential: r.institution ? { institution: r.institution } : null });
  }

  function reset() { setPayload(null); setResult(null); setError(null); }

  // Prefer the combined display status (on-chain lifecycle + ZAQA state); fall back to raw status.
  const state = result ? STATES[result.displayStatus || result.status] || STATES.NOT_FOUND : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1b3a] text-white shadow-card">
          <Icon name="shieldCheck" className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Verify a credential</h1>
          <p className="mt-1 text-[13px] text-slate-500">Check authenticity against the national credential registry — online or offline.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-1 text-[13px] shadow-card">
        {["paste", "scan"].map((t) => (
          <button key={t} onClick={() => { setTab(t); reset(); }}
            className={`rounded-md px-4 py-1.5 font-semibold capitalize transition ${tab === t ? "bg-[#0d1b3a] text-white" : "text-slate-600 hover:bg-slate-50"}`}>
            {t === "paste" ? "Enter reference" : "Scan QR"}
          </button>
        ))}
      </div>

      {tab === "paste" && (
        <form onSubmit={(e) => { e.preventDefault(); runOnline(); }} className="card-pad flex flex-col gap-3 sm:flex-row">
          <input value={hash} onChange={(e) => setHash(e.target.value)} placeholder="Paste the credential reference from the certificate QR"
            className="input flex-1 text-sm" />
          <Button type="submit" loading={loading} disabled={!hash}>Verify</Button>
        </form>
      )}

      {tab === "scan" && (
        <div className="card-pad">
          {!payload ? (
            <>
              <QrScanner onDecode={onScan} />
              <p className="mt-3 text-xs text-slate-400">
                Offline keys cached: {keyCount} issuer{keyCount === 1 ? "" : "s"}.
              </p>
            </>
          ) : (
            <div>
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                Signed QR detected. Choose how to verify:
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <Button loading={loading} onClick={() => runOnline(payload.hash)} disabled={!payload.hash}>
                  Verify online
                </Button>
                <Button variant="secondary" onClick={runOffline}>Verify offline</Button>
                <Button variant="ghost" onClick={reset}>Scan another</Button>
              </div>
              {!payload.hash && <p className="mt-2 text-xs text-amber-700">This QR can only be verified offline.</p>}
            </div>
          )}
        </div>
      )}

      {error && <div className="mt-4"><Alert>{error}</Alert></div>}

      {result && state && (
        <div className={`mt-6 rounded-xl border p-6 shadow-card ${state.cls}`}>
          <div className="flex items-center gap-3">
            <span className={`flex h-10 w-10 items-center justify-center rounded-full ${state.dot}`}>
              <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {STATUS_ICON[state.icon] || STATUS_ICON.bad}
              </svg>
            </span>
            <div>
              <div className={`text-lg font-bold ${state.text}`}>{state.label}</div>
              <div className="text-xs text-slate-500">
                {result.mode === "offline" ? "Verified offline from a trusted issuer key" : "Verified against the national credential registry"}
              </div>
            </div>
          </div>

          {result.credential && (
            <dl className="mt-5 grid grid-cols-1 gap-3 border-t border-black/5 pt-4 sm:grid-cols-2">
              {result.credential.subjectName && <Item label="Graduate" value={result.credential.subjectName} />}
              {result.credential.qualification && <Item label="Qualification" value={result.credential.qualification} />}
              {result.credential.institution && <Item label="Institution" value={result.credential.institution} />}
              {result.credential.graduationYear && <Item label="Graduation year" value={result.credential.graduationYear} />}
              {result.credential.zqfLevel && <Item label="ZQF level" value={result.credential.zqfLevel} />}
              {result.credential.credentialType && <Item label="Type" value={cap(result.credential.credentialType)} />}
            </dl>
          )}

          {/* Governance status chain — issuer legitimacy + regulator standing + ZAQA validation */}
          {result.mode === "online" && (result.governance || result.credential?.zaqaValidation) && (
            <div className="mt-4 border-t border-black/5 pt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Governance status</div>
              <div className="flex flex-wrap gap-2">
                {result.governance && (
                  <>
                    <Chip ok={result.governance.onChainAuthorised}
                      label={result.governance.onChainAuthorised ? "Issuer authorised" : "Issuer not authorised"} />
                    {result.governance.regulator === "ECZ" ? (
                      <Chip ok label="ECZ secondary authority" />
                    ) : (
                      <Chip ok={result.governance.heaStatus === "approved"}
                        label={`HEA: ${result.governance.heaStatus || "—"}`} />
                    )}
                    <Chip ok={result.governance.zaqaTrusted}
                      label={result.governance.zaqaTrusted ? "ZAQA trusted issuer" : "Not in ZAQA registry"} />
                  </>
                )}
                <Chip ok={result.credential?.zaqaValidation === "validated"}
                  warn={result.credential?.zaqaValidation === "pending"}
                  label={`ZAQA validation: ${result.credential?.zaqaValidation || "pending"}`} />
                <Chip ok={result.status !== "REVOKED"} label={result.status === "REVOKED" ? "REVOKED" : "Not revoked"} />
              </div>

              {/* ZAQA verification certificate (only once nationally validated) */}
              {result.status === "VERIFIED" && result.credential?.zaqaValidation === "validated" && (
                <div className="mt-4">
                  <Button size="sm" onClick={downloadCertificate} loading={certBusy}>
                    Download ZAQA verification certificate
                  </Button>
                </div>
              )}
            </div>
          )}

          {result.mode === "offline" && state.ok && (
            <p className="mt-4 border-t border-black/5 pt-3 text-xs text-slate-500">
              Offline check confirms issuer authenticity + QR integrity. Revocation status requires a later online re-check.
            </p>
          )}

          {result.mode === "online" && result.issuedAt ? (
            <div className="mt-4 border-t border-black/5 pt-3 text-xs text-slate-500">
              Issued {new Date(result.issuedAt * 1000).toLocaleDateString()}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Item({ label, value }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Status chip: green when ok, amber when warn, red otherwise.
function Chip({ ok, warn, label }) {
  return (
    <Badge tone={ok ? "green" : warn ? "amber" : "red"} icon={ok ? "check" : warn ? "clock" : "x"}>
      {label}
    </Badge>
  );
}
