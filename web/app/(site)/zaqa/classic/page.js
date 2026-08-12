"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../../lib/api";
import { getToken, getUser } from "../../../../lib/auth";
import { Alert, PageHeader } from "../../../../components/ui";
import NewUiBanner from "../../../../components/NewUiBanner";
import { TeamCard, ActivityCard } from "../../../../components/manage";
import { DisputeQueue } from "../../../../components/disputes";
import { QualificationQueue } from "../../../../components/qualifications";

const zaqaIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z" /><path d="M9 12l2 2 4-4" />
  </svg>
);

const TABS = ["Oversight", "Registry", "NQF Register", "Validation", "Disputes", "Activity", "Team"];
const ROLE_LABEL = {
  admin: "Administrators", zaqa: "ZAQA", hea: "HEA", ecz: "ECZ", issuer: "Institutions", holder: "Graduates",
};

export default function ZaqaPage() {
  const router = useRouter();
  const [tab, setTab] = useState("Oversight");
  const [registry, setRegistry] = useState([]);
  const [creds, setCreds] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const [reg, val, dis, ov] = await Promise.all([
        api.zaqaRegistry(getToken()),
        api.zaqaValidationList(getToken()),
        api.disputeQueue(getToken()),
        api.zaqaOverview(getToken()),
      ]);
      setRegistry(reg.issuers);
      setCreds(val.credentials);
      setDisputes(dis.disputes.filter((d) => d.status === "open"));
      setOverview(ov);
      // Audit trail is best-effort (needs chain RPC); don't block the rest of the portal.
      api.audit(getToken()).then((a) => setAudit(a.events || [])).catch(() => {});
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || (u.role !== "zaqa" && u.role !== "admin")) { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function toggleTrust(i) {
    setBusy(i.id);
    try { await api.zaqaSetTrust(getToken(), i.id, !i.zaqaTrusted, ""); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }

  async function validate(hash, zaqaValidation) {
    setBusy(hash);
    try { await api.zaqaSetValidation(getToken(), hash, { zaqaValidation }); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  async function revoke(hash) {
    if (!confirm("Revoke this credential on-chain? Verification will immediately show REVOKED.")) return;
    setBusy(hash);
    try { await api.zaqaRevoke(getToken(), hash); load(); }
    catch (err) { setError(err.message); }
    finally { setBusy(null); }
  }
  const valBadge = (v) =>
    v === "validated" ? "badge-green" : v === "rejected" || v === "suspended" ? "badge-red" :
    v === "suspicious" || v === "under_dispute" ? "badge-amber" : "badge-slate";

  const trustedCount = registry.filter((i) => i.zaqaTrusted).length;
  const pendingVal = creds.filter((c) => c.zaqaValidation === "pending").length;

  return (
    <div>
      <NewUiBanner href="/zaqa/applications" name="ZAQA" />
      <PageHeader
        icon={zaqaIcon}
        title="ZAQA — National oversight"
      />

      {/* Stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Issuers" value={registry.length} />
        <Stat label="ZAQA-trusted" value={trustedCount} tone="green" />
        <Stat label="Pending validation" value={pendingVal} tone="amber" />
        <Stat label="Open disputes" value={disputes.length} tone={disputes.length ? "red" : "slate"} />
      </div>

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`shrink-0 border-b-2 px-4 py-2 text-sm font-medium transition ${
              tab === t ? "border-brand text-brand" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}>
            {t}{t === "Disputes" && disputes.length ? ` (${disputes.length})` : ""}
          </button>
        ))}
      </div>

      {/* Oversight — see all roles/accounts */}
      {tab === "Oversight" && (
        <div className="space-y-6">
          <div className="card-pad">
            <h2 className="mb-3 font-semibold text-slate-900">Accounts by role</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {["admin", "zaqa", "hea", "ecz", "issuer", "holder"].map((r) => (
                <div key={r} className="rounded-lg border border-slate-100 p-3 text-center">
                  <div className="text-xl font-bold text-brand">{overview?.roleCounts?.[r] || 0}</div>
                  <div className="text-xs text-slate-500">{ROLE_LABEL[r]}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="card-pad">
            <h2 className="mb-3 font-semibold text-slate-900">National totals</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-brand">{overview?.totals?.institutions ?? 0}</div>
                <div className="text-xs text-slate-500">Institutions</div>
              </div>
              <div className="rounded-lg border border-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-brand">{overview?.totals?.higherEd ?? 0}</div>
                <div className="text-xs text-slate-500">Higher education</div>
              </div>
              <div className="rounded-lg border border-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-brand">{overview?.totals?.credentials ?? 0}</div>
                <div className="text-xs text-slate-500">Credentials</div>
              </div>
              <div className="rounded-lg border border-slate-100 p-3 text-center">
                <div className="text-xl font-bold text-emerald-700">{overview?.totals?.validated ?? 0}</div>
                <div className="text-xs text-slate-500">ZAQA validated</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Registry */}
      {tab === "Registry" && (
        <div className="card-pad space-y-3">
          {registry.map((i) => (
            <div key={i.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 p-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{i.institution}</div>
                <div className="text-xs text-slate-500">{i.sector === "secondary" ? "Secondary (ECZ)" : "Higher education"}</div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span className={i.heaStatus === "approved" ? "badge-green" : "badge-amber"}>HEA: {i.heaStatus}</span>
                  <span className={i.onChain ? "badge-slate" : "badge-amber"}>{i.onChain ? "on-chain" : "pending chain"}</span>
                </div>
              </div>
              <button onClick={() => toggleTrust(i)} disabled={busy === i.id}
                className={`shrink-0 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                  i.zaqaTrusted ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {i.zaqaTrusted ? "✓ trusted" : "mark trusted"}
              </button>
            </div>
          ))}
          {registry.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No issuers in the registry.</p>}
        </div>
      )}

      {/* Validation */}
      {tab === "Validation" && (
        <div className="card-pad space-y-3">
          {creds.map((c) => (
            <div key={c.credentialHash} className="rounded-lg border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-900">{c.subjectName}</div>
                  <div className="text-sm text-slate-500">
                    {c.qualification} · {c.institution}{c.zqfLevel ? ` · ZQF ${c.zqfLevel}` : ""}
                  </div>
                  {c.zaqaRef && <div className="mono">{c.zaqaRef}</div>}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className={valBadge(c.zaqaValidation)}>{c.zaqaValidation}</span>
                  {c.validationReport && (
                    <span className={c.validationReport.risk === "low" ? "badge-green" : c.validationReport.risk === "medium" ? "badge-amber" : "badge-red"}>
                      risk: {c.validationReport.risk}
                    </span>
                  )}
                </div>
              </div>
              {/* Automated decision pack (§6): explainable checks + recommendation */}
              {c.validationReport && (
                <details className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs">
                  <summary className="cursor-pointer font-medium text-slate-700">
                    Automated checks — recommendation: {c.validationReport.recommendation}
                  </summary>
                  <ul className="mt-2 space-y-1">
                    {c.validationReport.checks.map((chk, i) => (
                      <li key={i} className={chk.pass ? "text-emerald-700" : "text-red-600"}>
                        {chk.pass ? "✓" : "✕"} {chk.rule}{chk.detail ? ` — ${chk.detail}` : ""}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <Link href={`/verify?hash=${c.credentialHash}`} className="font-medium text-brand hover:underline">verify</Link>
                {c.zaqaValidation !== "validated" && (
                  <button onClick={() => validate(c.credentialHash, "validated")} disabled={busy === c.credentialHash}
                    className="font-medium text-emerald-700 hover:underline disabled:opacity-50">validate</button>
                )}
                {c.zaqaValidation !== "suspicious" && (
                  <button onClick={() => validate(c.credentialHash, "suspicious")} disabled={busy === c.credentialHash}
                    className="font-medium text-amber-700 hover:underline disabled:opacity-50">flag suspicious</button>
                )}
                {c.zaqaValidation !== "suspended" && (
                  <button onClick={() => validate(c.credentialHash, "suspended")} disabled={busy === c.credentialHash}
                    className="font-medium text-amber-800 hover:underline disabled:opacity-50">suspend</button>
                )}
                {c.zaqaValidation !== "under_dispute" && (
                  <button onClick={() => validate(c.credentialHash, "under_dispute")} disabled={busy === c.credentialHash}
                    className="font-medium text-amber-700 hover:underline disabled:opacity-50">mark dispute</button>
                )}
                {c.zaqaValidation !== "rejected" && (
                  <button onClick={() => validate(c.credentialHash, "rejected")} disabled={busy === c.credentialHash}
                    className="font-medium text-red-600 hover:underline disabled:opacity-50">reject</button>
                )}
                <button onClick={() => revoke(c.credentialHash)} disabled={busy === c.credentialHash}
                  className="font-medium text-red-700 hover:underline disabled:opacity-50">revoke on-chain</button>
              </div>
            </div>
          ))}
          {creds.length === 0 && <p className="py-8 text-center text-sm text-slate-400">No credentials to validate.</p>}
        </div>
      )}

      {/* Disputes — routed queue (ZQF level / national recognition cases) */}
      {tab === "NQF Register" && <QualificationQueue mode="zaqa" />}

      {tab === "Disputes" && <DisputeQueue title="Disputes routed to ZAQA" />}

      {/* Audit — national issuance/validation activity log */}
      {tab === "Audit" && (
        <div className="card-pad">
          <h2 className="mb-3 font-semibold text-slate-900">National audit trail</h2>
          {audit.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-400">No audit events available yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[360px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-2 pr-4">#</th><th className="pb-2 pr-4">Event</th><th className="pb-2">Institution</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.slice(0, 100).map((e, i) => {
                    const wallet = (e.issuer || e.args?.issuer || "").toLowerCase();
                    const inst = registry.find((r) => (r.walletAddress || "").toLowerCase() === wallet);
                    return (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 pr-4 text-slate-500">{i + 1}</td>
                        <td className="py-2 pr-4"><span className="badge-slate">{e.event || "Credential issued"}</span></td>
                        <td className="py-2 text-slate-800">{inst?.institution || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Activity — accountability trail (who changed what) */}
      {tab === "Activity" && <ActivityCard />}

      {/* Team — manage ZAQA users */}
      {tab === "Team" && <TeamCard />}
    </div>
  );
}

function Stat({ label, value, tone = "slate" }) {
  const toneMap = {
    slate: "text-slate-900", green: "text-emerald-700", amber: "text-amber-700", red: "text-red-600",
  };
  return (
    <div className="card-pad py-4">
      <div className={`text-2xl font-bold ${toneMap[tone]}`}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
