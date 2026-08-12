"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, Avatar, AvatarName, KV, KVGrid, SectionCard, Timeline,
  ActionBtn, TONES,
} from "../../../../components/portal/kit";
import { Donut, CHART } from "../../../../components/portal/charts";
import { api } from "../../../../lib/api";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../../components/portal/auth";

const STATUS_META = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Pending Review", tone: "blue" },
  validated: { label: "Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Returned / Suspicious", tone: "amber" },
  suspended: { label: "Suspended", tone: "orange" },
  under_dispute: { label: "Under Dispute", tone: "purple" },
};

const RISK_META = {
  low: { label: "Low Risk", cls: "text-emerald-600", color: CHART.green, tone: "green" },
  medium: { label: "Medium Risk", cls: "text-amber-600", color: CHART.amber, tone: "amber" },
  high: { label: "High Risk", cls: "text-orange-600", color: CHART.orange, tone: "orange" },
  critical: { label: "Critical Risk", cls: "text-red-600", color: CHART.red, tone: "red" },
};

// Static decorative list — evidence uploads have no backend counterpart.
const EVIDENCE = [
  { title: "Degree Certificate", file: "certificate.pdf" },
  { title: "Academic Transcript", file: "transcript.pdf" },
  { title: "Institution Verification Letter", file: "verification_letter.pdf" },
  { title: "Digital Signature Report", file: "signature_report.json" },
];

function checkIcon(rule) {
  const r = (rule || "").toLowerCase();
  if (r.includes("issuer registered")) return "bank";
  if (r.includes("status active")) return "registry";
  if (r.includes("authorised")) return "shieldCheck";
  if (r.includes("programme")) return "award";
  if (r.includes("zqf")) return "layers";
  if (r.includes("title")) return "fileText";
  if (r.includes("year")) return "calendar";
  if (r.includes("duplicate")) return "users";
  if (r.includes("anchor") || r.includes("signature")) return "edit";
  return "search";
}

function ValidationInner() {
  const { ready, user, token } = usePortalGuard(["zaqa"]);
  const searchParams = useSearchParams();
  const hashParam = searchParams.get("hash");
  const [creds, setCreds] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await api.zaqaValidationList(token);
      setCreds(res.credentials || []);
    } catch (err) {
      setError(err.message);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  const cred =
    creds.find((c) => c.credentialHash === hashParam) ||
    creds.find((c) => c.zaqaValidation === "pending") ||
    creds[0] ||
    null;

  async function setStatus(zaqaValidation) {
    if (!cred || busy) return;
    setBusy(zaqaValidation);
    setError(null);
    try {
      await api.zaqaSetValidation(token, cred.credentialHash, { zaqaValidation });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  async function revoke() {
    if (!cred || busy) return;
    if (!confirm("Revoke this credential on-chain? Verification will immediately show REVOKED.")) return;
    setBusy("revoke");
    setError(null);
    try {
      await api.zaqaRevoke(token, cred.credentialHash);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  if (!ready) return null;

  const report = cred?.validationReport || null;
  const checks = report?.checks || [];
  const passed = checks.filter((c) => c.pass).length;
  const failed = checks.length - passed;
  const risk = RISK_META[report?.risk] || null;
  const status = STATUS_META[cred?.zaqaValidation] || { label: cred?.zaqaValidation || "—", tone: "slate" };
  const decided = cred && ["validated", "rejected", "suspended"].includes(cred.zaqaValidation);

  const workflow = cred
    ? [
        { title: "Credential Submitted", time: fmtDate(cred.issuedAt), state: "done" },
        {
          title: "Automated Validation",
          time: report ? fmtDate(report.ranAt) : undefined,
          sub: report ? `Risk: ${report.risk}` : "Pending",
          state: report ? "done" : "pending",
        },
        {
          title: "Officer Review",
          sub: cred.zaqaValidation === "pending" ? "In Progress" : "Completed",
          state: cred.zaqaValidation === "pending" ? "current" : "done",
        },
        {
          title: "ZAQA Decision",
          sub: decided || cred.zaqaValidation === "under_dispute" ? status.label : "Pending",
          state: decided ? "done" : cred.zaqaValidation === "under_dispute" ? "warn" : "pending",
        },
      ]
    : [];

  const panel = (
    <div>
      <h2 className="mb-4 text-[15px] font-bold text-slate-900">Validation Workflow</h2>
      {cred ? <Timeline items={workflow} /> : <p className="text-[12.5px] text-slate-400">No credential selected.</p>}

      <SectionCard title="Officer Review" className="mt-5" pad="p-4">
        <AvatarName name={user.name || user.email} sub="ZAQA Officer" />
        <div className="mt-3 grid grid-cols-1 gap-3">
          <KV label="Checks Last Run" value={report ? fmtDateTime(report.ranAt) : "—"} />
          <KV label="Current Status" value={status.label} />
        </div>
        <div className="mt-3">
          <div className="text-[11px] font-medium text-slate-400">Officer Notes</div>
          <div className="mt-1 rounded-lg border border-slate-200 p-2.5 text-[12.5px] leading-snug text-slate-700">
            {cred?.zaqaNote || "No officer notes recorded for this credential."}
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Action Center" className="mt-4" pad="p-4">
        <div className="space-y-2.5">
          <ActionBtn tone="green" full disabled={!cred || !!busy} className="disabled:opacity-50" onClick={() => setStatus("validated")}>
            {busy === "validated" ? "Approving…" : "Approve"}
          </ActionBtn>
          <ActionBtn tone="orange" full disabled={!cred || !!busy} className="disabled:opacity-50" onClick={() => setStatus("suspicious")}>
            {busy === "suspicious" ? "Returning…" : "Return for Clarification"}
          </ActionBtn>
          <ActionBtn tone="red" full disabled={!cred || !!busy} className="disabled:opacity-50" onClick={() => setStatus("rejected")}>
            {busy === "rejected" ? "Rejecting…" : "Reject"}
          </ActionBtn>
          <ActionBtn tone="softred" full disabled={!cred || !!busy} className="disabled:opacity-50" onClick={() => setStatus("under_dispute")}>
            {busy === "under_dispute" ? "Escalating…" : "Escalate to Senior Officer"}
          </ActionBtn>
          <ActionBtn tone="red" icon="alert" full disabled={!cred || !!busy} className="disabled:opacity-50" onClick={revoke}>
            {busy === "revoke" ? "Revoking…" : "Revoke On-Chain"}
          </ActionBtn>
        </div>
      </SectionCard>
    </div>
  );

  return (
    <PortalShell
      portal="zaqa"
      active="validation"
      title="ZAQA Portal – Validation Review"
      subtitle="Automated Qualification Validation Workflow / One-Click ZAQA Validation"
      user={{ name: user.name || user.email, sub: user.email }}
      actions={
        <Link
          href="/zaqa/applications"
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-[13px] font-semibold text-slate-700 transition hover:bg-slate-50"
        >
          <Icon name="chevronLeft" className="h-4 w-4" />
          Back to Queue
        </Link>
      }
      panel={panel}
      panelWidth="w-[380px]"
    >
      {error && <div className="mb-3 text-[12.5px] font-medium text-red-600">{error}</div>}
      {!cred ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-[13px] text-slate-400 shadow-card">
          No credentials submitted for validation yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
          {/* Left column */}
          <div className="space-y-4">
            <SectionCard title="Applicant & Credential Summary" pad="p-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="flex gap-3">
                  <Avatar name={cred.subjectName || "?"} size="h-12 w-12" />
                  <div className="min-w-0 leading-tight">
                    <div className="text-[13px] font-bold text-slate-900">{cred.subjectName || "—"}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">Credential Holder</div>
                    <div className="truncate text-[11px] text-slate-500">{cred.institution || "—"}</div>
                  </div>
                </div>
                <div className="leading-tight">
                  <div className="text-[11px] text-slate-400">Credential</div>
                  <div className="mt-0.5 text-[13px] font-bold text-blue-600">{cred.qualification || "—"}</div>
                  <div className="mt-0.5 text-[11px] text-slate-500">Type: {cred.credentialType || "—"}</div>
                  <div className="text-[11px] text-slate-500">Issued: {fmtDate(cred.issuedAt)}</div>
                  <div className="truncate text-[11px] text-slate-500">Hash: {cred.credentialHash}</div>
                </div>
                <div className="leading-tight">
                  <Badge tone={status.tone} dot>{status.label}</Badge>
                  <div className="mt-2.5 space-y-2.5">
                    <KV label="ZAQA Reference" value={cred.zaqaRef || "Not yet assigned"} />
                    <KV label="Submitted On" value={fmtDateTime(cred.issuedAt)} />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Qualification Details" pad="p-4">
              <KVGrid
                cols={3}
                items={[
                  { label: "Qualification Title", value: cred.qualification || "—" },
                  { label: "Institution", value: cred.institution || "—" },
                  { label: "Date Issued", value: fmtDate(cred.issuedAt) },
                  { label: "Credential Type", value: cred.credentialType || "—" },
                  { label: "Country", value: "Zambia" },
                  { label: "ZQF Level", value: cred.zqfLevel != null ? `Level ${cred.zqfLevel}` : "Not assigned" },
                  { label: "On-chain Status", value: cred.status || "—" },
                  { label: "ZAQA Reference", value: cred.zaqaRef || "—" },
                  { label: "ZAQA Note", value: cred.zaqaNote || "—" },
                ]}
              />
            </SectionCard>

            {checks.length > 0 ? (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {checks.map((c) => (
                  <div key={c.rule} className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-card">
                    <div className="flex items-start justify-between gap-2">
                      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${c.pass ? TONES.softblue : TONES.softred}`}>
                        <Icon name={checkIcon(c.rule)} className="h-4 w-4" />
                      </span>
                      <Badge tone={c.pass ? "green" : "red"}>{c.pass ? "Pass" : "Fail"}</Badge>
                    </div>
                    <div className="mt-2 text-[12.5px] font-semibold text-slate-800">{c.rule}</div>
                    <div className="mt-0.5 text-[11px] leading-snug text-slate-500">{c.detail || "—"}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5 text-center text-[12.5px] text-slate-400 shadow-card">
                No automated validation report yet — checks run when the credential is submitted to ZAQA.
              </div>
            )}

            {report && (
              <div className="flex items-start justify-between gap-4 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                <div className="flex gap-3">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                    <Icon name="sparkle" className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-[13px] font-bold text-slate-900">Explainable Decision</div>
                    <p className="mt-1 text-[12.5px] leading-snug text-slate-600">
                      {passed} of {checks.length} automated checks passed. Risk classified as {report.risk}.
                      The engine recommends: {report.recommendation}
                    </p>
                  </div>
                </div>
                <Badge tone={risk ? `soft${risk.tone === "green" ? "green" : "red"}` : "slate"} className="shrink-0">
                  Recommendation: {report.recommendation.split(" ")[0]}
                </Badge>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <SectionCard title="Risk Assessment" pad="p-4">
                {report ? (
                  <div className="flex items-center gap-5">
                    <Donut
                      size={130}
                      thickness={16}
                      centerTitle={`${passed}/${checks.length}`}
                      centerSub="checks passed"
                      segments={[
                        { value: passed, color: CHART.green, label: "Passed" },
                        ...(failed > 0 ? [{ value: failed, color: risk?.color || CHART.red, label: "Failed" }] : []),
                      ]}
                    />
                    <div className="min-w-0">
                      <div className={`text-[15px] font-bold ${risk?.cls || "text-slate-600"}`}>{risk?.label || report.risk}</div>
                      <p className="mt-1 text-[12px] leading-snug text-slate-500">
                        {failed === 0
                          ? "All automated checks passed for this credential."
                          : `${failed} check${failed > 1 ? "s" : ""} failed — review before validating.`}
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="py-6 text-center text-[12.5px] text-slate-400">No risk assessment available.</p>
                )}
              </SectionCard>
              <SectionCard title="Rule Summary" pad="p-4">
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { label: "Passed", value: passed, cls: "bg-emerald-50 text-emerald-700" },
                    { label: "Failed", value: failed, cls: "bg-red-50 text-red-600" },
                    { label: "Total Checks", value: checks.length, cls: "bg-blue-50 text-blue-700" },
                    { label: "Risk Level", value: report ? report.risk : "—", cls: "bg-amber-50 text-amber-700" },
                  ].map((t) => (
                    <div key={t.label} className={`rounded-lg p-3 ${t.cls}`}>
                      <div className="text-xl font-bold capitalize">{t.value}</div>
                      <div className="text-[11px] font-semibold">{t.label}</div>
                    </div>
                  ))}
                </div>
              </SectionCard>
            </div>
          </div>

          {/* Right mini-column */}
          <div className="space-y-4">
            <SectionCard title="Decision Summary" pad="p-4">
              {report ? (
                <>
                  <div
                    className={`rounded-lg border p-3 ${
                      report.risk === "low"
                        ? "border-emerald-200 bg-emerald-50"
                        : report.risk === "medium"
                        ? "border-amber-200 bg-amber-50"
                        : "border-red-200 bg-red-50"
                    }`}
                  >
                    <div className="text-[11px] font-semibold text-slate-600">Recommended Decision</div>
                    <div className="mt-0.5 text-[14px] font-extrabold text-slate-800">{report.recommendation}</div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-[12px] text-slate-500">Checks Passed</span>
                    <span className="text-[12px] font-semibold text-slate-800">{passed} / {checks.length}</span>
                  </div>
                  <div className="mt-1.5 flex justify-end">
                    <Badge tone={risk?.tone || "slate"}>{risk?.label || report.risk}</Badge>
                  </div>
                </>
              ) : (
                <p className="py-4 text-center text-[12.5px] text-slate-400">Awaiting automated report.</p>
              )}
              <div className="mt-3 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[12px] text-slate-500">Current Status</span>
                  <Badge tone={status.tone} dot>{status.label}</Badge>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Evidence & Documents" pad="p-3">
              <div className="space-y-2">
                {EVIDENCE.map((d) => (
                  <div key={d.file} className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-2.5 py-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${TONES.softred}`}>
                      <Icon name="fileText" className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="truncate text-[12px] font-medium text-slate-700">{d.title}</div>
                      <div className="truncate text-[10.5px] text-slate-400">{d.file}</div>
                    </div>
                    <ActionBtn tone="outline" className="!px-2.5 !py-1 !text-[11px]">View</ActionBtn>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      )}
    </PortalShell>
  );
}

export default function ZaqaValidationPage() {
  return (
    <Suspense fallback={null}>
      <ValidationInner />
    </Suspense>
  );
}
