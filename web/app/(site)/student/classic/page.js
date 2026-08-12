"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api, openBlob } from "../../../../lib/api";
import { getToken, getUser } from "../../../../lib/auth";
import { Button, Alert, PageHeader } from "../../../../components/ui";
import NewUiBanner from "../../../../components/NewUiBanner";
import { ApplyDigitization } from "../../../../components/digitize";
import { promptDispute } from "../../../../components/disputes";

const gradIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 10L12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1 2.7 3 6 3s6-2 6-3v-5" />
  </svg>
);

export default function StudentPage() {
  const router = useRouter();
  const [rows, setRows] = useState([]);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.myCredentials(getToken())).credentials); }
    catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "holder") { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function showQR(hash) {
    if (qr?.hash === hash) { setQr(null); return; }
    try { setQr({ hash, image: (await api.getQR(getToken(), hash)).qrImage }); }
    catch (err) { setError(err.message); }
  }

  async function downloadPDF(hash) {
    setBusy(hash);
    try {
      const blob = await api.downloadPDF(getToken(), hash);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `credential-${hash.slice(0, 10)}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  // Corrections and disputes both open a routed dispute case (spec §11/§30): the system
  // sends it to the responsible authority automatically based on the category chosen.
  function raiseDispute(hash) { promptDispute(hash, load); }

  async function downloadCertificate(hash) {
    setBusy(hash);
    try { openBlob(await api.downloadVerificationCertificate(hash), `ZAQA-verification-${hash.slice(0, 10)}.pdf`); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  const valBadge = (v) =>
    v === "validated" ? "badge-green" : v === "rejected" ? "badge-red" : "badge-amber";

  return (
    <div>
      <NewUiBanner href="/graduate" name="Graduate" />
      <PageHeader
        icon={gradIcon}
        title="My credentials"
      />
      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      <div className="grid gap-4 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.credentialHash} className="card overflow-hidden">
            <div className="bg-brand-gradient px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">{r.qualification}</div>
                  <div className="text-xs text-white/80">{r.institution}</div>
                </div>
                <span className={r.status === "revoked" ? "badge-red" : "badge bg-white/20 text-white"}>{r.status}</span>
              </div>
            </div>
            <div className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-xs text-slate-500">Graduation year</div>
                  <div className="font-medium text-slate-800">{r.graduationYear}{r.zqfLevel ? ` · ZQF ${r.zqfLevel}` : ""}</div>
                </div>
                <span className={valBadge(r.zaqaValidation)} title="ZAQA final national validation">
                  ZAQA: {r.zaqaValidation || "pending"}
                </span>
              </div>
              {r.correctionRequest?.status === "open" && (
                <p className="mt-2 text-xs text-amber-700">Correction request submitted — under review.</p>
              )}
              {qr?.hash === r.credentialHash && /* eslint-disable-next-line @next/next/no-img-element */ (
                <img src={qr.image} alt="Signed QR" className="mt-4 h-56 w-56 rounded-lg border border-slate-200 bg-white p-2" />
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => showQR(r.credentialHash)}>
                  {qr?.hash === r.credentialHash ? "Hide QR" : "Show QR"}
                </Button>
                <Button size="sm" onClick={() => downloadPDF(r.credentialHash)} loading={busy === r.credentialHash}>
                  Download PDF
                </Button>
                <Link href={`/verify?hash=${r.credentialHash}`} className="btn-ghost btn-sm">Verify</Link>
                {r.zaqaValidation === "validated" && (
                  <Button size="sm" variant="secondary" onClick={() => downloadCertificate(r.credentialHash)} loading={busy === r.credentialHash}>
                    ZAQA certificate
                  </Button>
                )}
                <button onClick={() => raiseDispute(r.credentialHash)} disabled={busy === r.credentialHash}
                  className="btn-ghost btn-sm text-slate-500">Correction / dispute</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {rows.length === 0 && (
        <div className="card-pad mt-2 text-center">
          <p className="text-sm text-slate-500">
            No credentials yet. Apply below to digitize a paper credential, or an institution can issue one to you directly.
          </p>
        </div>
      )}

      <ApplyDigitization />
    </div>
  );
}
