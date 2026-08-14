"use client";

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import RecognitionWorkspace from "../../../../components/portal/RecognitionWorkspace";
import ApplicationProgress from "../../../../components/portal/ApplicationProgress";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, TabBar, SectionCard, Modal, ErrorBanner, ActionBtn, ToolButton,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const TABS = ["Credential digitisation", "Recognition (RPL & more)"];

const STATUS_META = {
  submitted: { label: "Submitted", tone: "blue" },
  screening: { label: "Screening", tone: "amber" },
  under_review: { label: "Records review", tone: "orange" },
  awaiting_evidence: { label: "Awaiting your evidence", tone: "amber" },
  decision_pending: { label: "Decision pending", tone: "purple" },
  issued: { label: "Issued", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  withdrawn: { label: "Withdrawn", tone: "slate" },
};
const TERMINAL = ["issued", "rejected", "withdrawn"];

const TYPE_OPTIONS = [
  { value: "secondary", label: "Secondary" },
  { value: "diploma", label: "Diploma" },
  { value: "degree", label: "Degree" },
  { value: "masters", label: "Master's" },
  { value: "phd", label: "PhD" },
  { value: "other", label: "Other" },
];

function readFileBase64(f) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = reject;
    r.readAsDataURL(f);
  });
}

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-100";

/* ----------------------------------------------- inline evidence form --- */

function EvidenceForm({ app, token, onDone }) {
  const [message, setMessage] = useState("");
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!message.trim()) return;
    if (file && file.size > 6 * 1024 * 1024) { setError("File too large (max 6 MB)."); return; }
    setBusy(true);
    setError(null);
    try {
      const body = { message: message.trim() };
      if (file) {
        body.documentBase64 = await readFileBase64(file);
        body.documentName = file.name;
        body.documentMime = file.type || "application/octet-stream";
      }
      await api.addApplicationEvidence(token, app.id, body);
      onDone();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
      <div className="mb-1.5 text-[12.5px] font-bold text-amber-800">Provide the requested evidence</div>
      {app.note && <div className="mb-2 text-[12px] text-amber-800">Institution&apos;s request: {app.note}</div>}
      <ErrorBanner error={error} />
      <textarea
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Explain what you are providing... *"
        className={inputCls}
      />
      <input
        type="file"
        accept=".pdf,image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mt-2 block w-full text-[12px] text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-1.5 file:text-[12px] file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
      />
      {file && <div className="mt-1 text-[11px] text-slate-400">{file.name} · {(file.size / 1024).toFixed(0)} KB (replaces your previous upload)</div>}
      <ActionBtn tone="orange" icon="upload" className="mt-2.5" disabled={busy || !message.trim()}>
        {busy ? "Sending…" : "Send evidence"}
      </ActionBtn>
    </form>
  );
}

/* ------------------------------------------------------ digitisation --- */

function DigitisationTab({ token }) {
  const [institutions, setInstitutions] = useState([]);
  const [apps, setApps] = useState([]);
  const [loadingApps, setLoadingApps] = useState(true);
  const [form, setForm] = useState({
    targetIssuerId: "", qualification: "", graduationYear: "", credentialType: "degree", zqfLevel: "7", nationalId: "",
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [listError, setListError] = useState(null);
  const [ok, setOk] = useState(null);
  const [busy, setBusy] = useState(false);
  const [withdrawing, setWithdrawing] = useState(null);
  const [withdrawFor, setWithdrawFor] = useState(null);
  const [historyFor, setHistoryFor] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const load = useCallback(async () => {
    setLoadingApps(true);
    setListError(null);
    try { setApps((await api.myApplications(token)).applications || []); }
    catch (err) { setListError(err.message); }
    finally { setLoadingApps(false); }
  }, [token]);

  useEffect(() => {
    api.approvedInstitutions()
      .then((d) => {
        setInstitutions(d.institutions || []);
        setForm((f) => ({ ...f, targetIssuerId: f.targetIssuerId || d.institutions?.[0]?.id || "" }));
      })
      .catch((err) => setError(err.message));
    load();
  }, [load]);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!form.targetIssuerId) { setError("Select the awarding institution."); return; }
    if (!form.qualification.trim()) { setError("Enter the qualification name."); return; }
    if (!form.graduationYear) { setError("Enter your graduation year."); return; }
    if (!file) { setError("Attach a scan/photo of your credential."); return; }
    if (file.size > 6 * 1024 * 1024) { setError("File too large (max 6 MB)."); return; }
    setBusy(true);
    try {
      const data = await readFileBase64(file);
      const res = await api.applyDigitization(token, {
        targetIssuerId: form.targetIssuerId,
        qualification: form.qualification.trim(),
        graduationYear: Number(form.graduationYear),
        credentialType: form.credentialType,
        zqfLevel: Number(form.zqfLevel),
        nationalId: form.nationalId || undefined,
        document: { name: file.name, mime: file.type || "application/octet-stream", data },
      });
      setOk(res.existing ? res.message : "Application submitted. The institution has been notified to verify it.");
      setFile(null);
      setForm((f) => ({ ...f, qualification: "", graduationYear: "" }));
      load();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function withdraw() {
    const app = withdrawFor;
    setWithdrawing(app.id);
    setListError(null);
    try {
      await api.withdrawApplication(token, app.id);
      setWithdrawFor(null);
      await load();
    } catch (err) { setListError(err.message); setWithdrawFor(null); }
    finally { setWithdrawing(null); }
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      {/* Apply form */}
      <SectionCard title="Apply for credential digitisation" className="xl:col-span-2" pad="p-4">
        <p className="mb-4 text-[12px] leading-snug text-slate-500">
          Have an existing paper qualification validated and issued digitally. The awarding institution verifies your
          upload, issues a blockchain-anchored credential, and forwards it to ZAQA for national validation.
        </p>
        <form onSubmit={submit} className="space-y-3.5">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Awarding institution *</span>
            <select className={inputCls} value={form.targetIssuerId} onChange={set("targetIssuerId")}>
              {institutions.length === 0 && <option value="">No institutions available</option>}
              {institutions.map((i) => (
                <option key={i.id} value={i.id}>{i.institution}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Qualification *</span>
            <input className={inputCls} value={form.qualification} onChange={set("qualification")} placeholder="e.g. Bachelor of ICT" />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Type *</span>
              <select className={inputCls} value={form.credentialType} onChange={set("credentialType")}>
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">ZQF level</span>
              <select className={inputCls} value={form.zqfLevel} onChange={set("zqfLevel")}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-semibold text-slate-700">Year *</span>
              <input type="number" min="1960" max="2100" className={inputCls} value={form.graduationYear} onChange={set("graduationYear")} placeholder="2020" />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">NRC / Passport (optional)</span>
            <input className={inputCls} value={form.nationalId} onChange={set("nationalId")} placeholder="123456/78/1" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Upload your credential (PDF or image) *</span>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full text-[12.5px] text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-50 file:px-3 file:py-2 file:text-[12.5px] file:font-medium file:text-emerald-700 hover:file:bg-emerald-100"
            />
            {file && <span className="mt-1 block text-[11px] text-slate-400">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
          </label>
          <ErrorBanner error={error} />
          {ok && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
              {ok}
            </div>
          )}
          <ActionBtn tone="darkgreen" icon="send" full disabled={busy}>
            {busy ? "Submitting…" : "Submit application"}
          </ActionBtn>
        </form>
      </SectionCard>

      {/* My applications */}
      <SectionCard
        title="My applications"
        className="xl:col-span-3"
        pad="p-4"
        action={<ToolButton icon="refresh" aria-label="Refresh" onClick={load} />}
      >
        <ErrorBanner error={listError} onRetry={load} />
        {loadingApps && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        )}
        {!loadingApps && apps.length === 0 && (
          <div className="py-12 text-center text-[13px] text-slate-400">
            No applications yet — submit one with the form to get started.
          </div>
        )}
        <div className="space-y-4">
          {!loadingApps &&
            apps.map((a) => {
              const m = STATUS_META[a.status] || { label: a.status, tone: "slate" };
              return (
                <div key={a.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[13.5px] font-bold text-slate-900">{a.qualification}</div>
                      <div className="text-[12px] text-slate-500">
                        {a.institution} · {a.graduationYear} · applied {fmtDate(a.createdAt)}
                      </div>
                    </div>
                    <Badge tone={m.tone} dot>{m.label}</Badge>
                  </div>
                  <div className="mt-3.5">
                    <ApplicationProgress status={a.status} />
                  </div>
                  {a.status === "rejected" && a.note && (
                    <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
                      <span className="font-semibold">Reason:</span> {a.note}
                    </div>
                  )}
                  {a.status === "awaiting_evidence" && <EvidenceForm app={a} token={token} onDone={load} />}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <ToolButton icon="clock" onClick={() => setHistoryFor(a)}>Case history</ToolButton>
                    {!TERMINAL.includes(a.status) && (
                      <ToolButton
                        icon="x"
                        onClick={() => setWithdrawFor(a)}
                        disabled={withdrawing === a.id}
                        className="text-red-600 hover:bg-red-50"
                      >
                        {withdrawing === a.id ? "Withdrawing…" : "Withdraw"}
                      </ToolButton>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </SectionCard>

      {/* Case history modal */}
      <Modal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={historyFor ? `Case history — ${historyFor.qualification}` : "Case history"}
        footer={<ActionBtn tone="outline" onClick={() => setHistoryFor(null)}>Close</ActionBtn>}
      >
        {historyFor && <CaseTimeline events={historyFor.events} />}
      </Modal>

      {/* Withdraw confirmation */}
      <Modal
        open={!!withdrawFor}
        onClose={() => setWithdrawFor(null)}
        title="Withdraw application"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setWithdrawFor(null)}>Keep application</ActionBtn>
            <ActionBtn tone="red" icon="x" disabled={!!withdrawing} onClick={withdraw}>
              {withdrawing ? "Withdrawing…" : "Withdraw"}
            </ActionBtn>
          </>
        }
      >
        <p className="text-[13px] text-slate-600">
          Withdraw your application for{" "}
          <span className="font-semibold">{withdrawFor?.qualification} ({withdrawFor?.graduationYear})</span> at{" "}
          <span className="font-semibold">{withdrawFor?.institution}</span>? The case will be closed and the
          institution will stop processing it.
        </p>
      </Modal>
    </div>
  );
}

/* --------------------------------------------------------------- page --- */

export default function GraduateApplyPage() {
  const { ready, user, token } = usePortalGuard(["holder"]);
  const [tab, setTab] = useState(TABS[0]);

  if (!ready) return null;

  return (
    <PortalShell
      portal="graduate"
      active="apply"
      title="Apply for Credential"
      subtitle="Digitise an existing paper qualification, or open a recognition case (RPL, credit transfer, foreign qualification, micro-credential)."
    >
      <div className="mb-5">
        <TabBar tabs={TABS} active={tab} onChange={setTab} accent="border-emerald-600 text-emerald-700" />
      </div>
      {tab === TABS[0] ? (
        <DigitisationTab token={token} />
      ) : (
        <RecognitionWorkspace token={token} role={user.role} mode="holder" />
      )}
    </PortalShell>
  );
}
