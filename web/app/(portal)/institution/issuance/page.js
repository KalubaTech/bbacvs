"use client";

// Credential issuance workbench (replaces the classic issuer page): issue a credential —
// server-signed or via the institution's own MetaMask wallet — then manage what has been
// issued: submit to ZAQA, download the transcript, verify, revoke.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import {
  Badge, StatCard, StatRow, SectionCard, StatusTabs, SearchBox, ToolButton, DataTable, Pagination, usePager,
  KVGrid, PanelHeader, ActionBtn, Modal, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api, openBlob } from "../../../../lib/api";
import { connectWallet, anchorCredential, currentAddress, hasMetaMask } from "../../../../lib/metamask";

const ZAQA_META = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Awaiting ZAQA", tone: "blue" },
  validated: { label: "ZAQA Validated", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
  suspicious: { label: "Flagged", tone: "amber" },
  suspended: { label: "Suspended", tone: "red" },
  under_dispute: { label: "Disputed", tone: "purple" },
};
const TYPES = [
  { value: "diploma", label: "Diploma", zqf: 6 },
  { value: "degree", label: "Degree", zqf: 7 },
  { value: "masters", label: "Master's", zqf: 9 },
  { value: "phd", label: "PhD", zqf: 10 },
  { value: "other", label: "Certificate / Other", zqf: 5 },
];
const REGULATOR = { higher_ed: "HEA", tevet: "TEVETA", secondary: "ECZ" };
const REVOKE_REASONS = [
  { code: 1, label: "Administrative error" },
  { code: 2, label: "Fraud detected" },
  { code: 3, label: "Regulatory action" },
  { code: 4, label: "Holder request" },
  { code: 5, label: "Other" },
];
const INPUT =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";
const EMPTY_FORM = { name: "", nationalId: "", holderEmail: "", qualification: "", graduationYear: String(new Date().getFullYear()), credentialType: "degree", zqfLevel: "7" };

function Field({ label, required, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-700">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function DetailPanel({ cred, busy, error, onClose, onSubmit, onTranscript, onRevoke }) {
  if (!cred) {
    return (
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Credential Details</h2>
        <p className="text-[12.5px] text-slate-400">Select an issued credential to see its record, or issue a new one.</p>
      </div>
    );
  }
  const z = ZAQA_META[cred.zaqaValidation] || { label: cred.zaqaValidation || "—", tone: "slate" };
  return (
    <div>
      <PanelHeader title="Credential Details" badge={<Badge tone={z.tone} dot>{z.label}</Badge>} onClose={onClose} />
      <ErrorBanner error={error} />
      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Graduate", value: cred.subjectName || "—" },
            { label: "Graduate email", value: cred.holderEmail || "—" },
            { label: "Qualification", value: cred.qualification || "—" },
            { label: "Type", value: cred.credentialType || "—" },
            { label: "Graduation year", value: cred.graduationYear || "—" },
            { label: "ZQF level", value: cred.zqfLevel != null ? `Level ${cred.zqfLevel}` : "—" },
            { label: "Issued", value: fmtDate(cred.issuedAt) },
            { label: "On-chain status", value: cred.status || "—" },
            { label: "ZAQA reference", value: cred.zaqaRef || "Not yet assigned" },
          ]}
        />
      </div>
      <div className="mb-4 space-y-2">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        {cred.zaqaValidation === "draft" && (
          <ActionBtn tone="darkgreen" icon="send" full disabled={busy === "submit"} onClick={() => onSubmit(cred)}>
            {busy === "submit" ? "Submitting…" : "Submit to ZAQA for validation"}
          </ActionBtn>
        )}
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn tone="outline" icon="fileText" full disabled={busy === "transcript"} onClick={() => onTranscript(cred)}>
            {busy === "transcript" ? "Preparing…" : "Transcript PDF"}
          </ActionBtn>
          <Link href={`/verify?hash=${cred.credentialHash}`} className="block">
            <ActionBtn tone="outline" icon="shieldCheck" full>Verify</ActionBtn>
          </Link>
        </div>
        {cred.status === "active" && (
          <ActionBtn tone="softred" icon="revoke" full disabled={busy === "revoke"} onClick={() => onRevoke(cred)}>
            Revoke credential
          </ActionBtn>
        )}
      </div>
      <div className="rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2.5 text-[12.5px] font-bold text-slate-800">Credential History</div>
        <CaseTimeline events={cred.events} />
      </div>
    </div>
  );
}

export default function InstitutionIssuancePage() {
  const { ready, token } = usePortalGuard(["issuer"]);
  const [profile, setProfile] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);

  // issue modal
  const [issueOpen, setIssueOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(null);
  const [issueError, setIssueError] = useState(null);
  const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // revoke modal
  const [revokeFor, setRevokeFor] = useState(null);
  const [revokeReason, setRevokeReason] = useState(2);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [mine, prof] = await Promise.all([api.myIssued(token), api.issuerProfile(token).catch(() => null)]);
      setCreds(mine.credentials || []);
      if (prof) setProfile(prof);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => {
    if (ready) {
      load();
      currentAddress().then(setWallet).catch(() => {});
    }
  }, [ready, load]);

  const isMetaMask = profile?.signingMode === "metamask";
  const walletMatches = wallet && profile?.walletAddress && wallet.toLowerCase() === profile.walletAddress.toLowerCase();
  const regulator = REGULATOR[profile?.sector] || "HEA";
  // Institutions must be approved by their own regulator (HEA for higher education, TEVETA for
  // TEVET institutions) before they may issue; secondary certification runs through ECZ.
  const blocked = profile && profile.sector !== "secondary" && profile.heaStatus && profile.heaStatus !== "approved";

  async function connect() {
    setIssueError(null);
    try { setWallet(await connectWallet()); }
    catch (err) { setIssueError(err.message); }
  }

  async function issueViaMetaMask(body) {
    setStep("Preparing credential (sign + encrypt + IPFS)…");
    const prep = await api.prepare(token, body);
    const addr = await connectWallet();
    setWallet(addr);
    if (addr.toLowerCase() !== prep.issuerAddress.toLowerCase()) {
      throw new Error("Wrong account selected in MetaMask. Switch to your institution's registered wallet and try again.");
    }
    setStep("Confirm the anchoring transaction in MetaMask…");
    const txHash = await anchorCredential(prep.credentialRegistry, prep.credentialHash, prep.cidHash);
    setStep("Confirming on-chain…");
    return api.finalize(token, prep.credentialHash, txHash);
  }

  async function issue() {
    if (busy) return;
    setBusy("issue");
    setIssueError(null);
    setResult(null);
    try {
      const body = {
        holderEmail: form.holderEmail.trim(),
        claims: {
          name: form.name.trim(),
          nationalId: form.nationalId.trim() || undefined,
          qualification: form.qualification.trim(),
          graduationYear: Number(form.graduationYear),
        },
        credentialType: form.credentialType,
        zqfLevel: Number(form.zqfLevel),
      };
      const res = isMetaMask ? await issueViaMetaMask(body) : await api.issue(token, body);
      setResult(res);
      setForm(EMPTY_FORM);
      await load();
      if (res?.credentialHash) setSel(res.credentialHash);
    } catch (err) {
      setIssueError(err.message?.replace(/\(action=.*/, "") || "Issuance failed");
    } finally {
      setBusy(null);
      setStep(null);
    }
  }

  async function submitZaqa(cred) {
    setBusy("submit"); setPanelError(null);
    try { await api.submitToZaqa(token, cred.credentialHash); await load(); }
    catch (err) { setPanelError(err.message); }
    finally { setBusy(null); }
  }
  async function transcript(cred) {
    setBusy("transcript"); setPanelError(null);
    try { openBlob(await api.downloadTranscript(token, cred.credentialHash), `transcript-${cred.credentialHash.slice(0, 10)}.pdf`); }
    catch (err) { setPanelError(err.message); }
    finally { setBusy(null); }
  }
  async function revoke() {
    if (!revokeFor) return;
    setBusy("revoke"); setPanelError(null);
    try { await api.revoke(token, revokeFor.credentialHash, Number(revokeReason)); setRevokeFor(null); await load(); }
    catch (err) { setPanelError(err.message); setRevokeFor(null); }
    finally { setBusy(null); }
  }

  const counts = useMemo(() => creds.reduce((m, c) => { const k = c.zaqaValidation || "draft"; m[k] = (m[k] || 0) + 1; return m; }, {}), [creds]);
  const tabs = [
    { label: "All", count: creds.length },
    { label: "Draft", count: counts.draft || 0 },
    { label: "Awaiting ZAQA", count: counts.pending || 0 },
    { label: "ZAQA Validated", count: counts.validated || 0 },
    { label: "Revoked", count: creds.filter((c) => c.status === "revoked").length },
  ];
  const rows = useMemo(() => creds.filter((c) => {
    if (tab === "Draft" && (c.zaqaValidation || "draft") !== "draft") return false;
    if (tab === "Awaiting ZAQA" && c.zaqaValidation !== "pending") return false;
    if (tab === "ZAQA Validated" && c.zaqaValidation !== "validated") return false;
    if (tab === "Revoked" && c.status !== "revoked") return false;
    return !q || `${c.subjectName} ${c.qualification} ${c.graduationYear} ${c.holderEmail || ""}`.toLowerCase().includes(q.toLowerCase());
  }), [creds, tab, q]);
  const pg = usePager(rows, 10, [tab, q]);
  const selected = creds.find((c) => c.credentialHash === sel) || null;

  if (!ready) return null;

  const columns = [
    { key: "subjectName", label: "Graduate", render: (r) => (
      <span className="block leading-tight">
        <span className="block font-semibold text-slate-800">{r.subjectName}</span>
        <span className="block text-[11px] text-slate-400">{r.holderEmail || ""}</span>
      </span>
    ) },
    { key: "qualification", label: "Qualification", render: (r) => (
      <span className="block leading-tight">
        <span className="block text-slate-700">{r.qualification}</span>
        <span className="block text-[11px] text-slate-400">{r.credentialType || ""}{r.zqfLevel != null ? ` · ZQF ${r.zqfLevel}` : ""}</span>
      </span>
    ) },
    { key: "graduationYear", label: "Year", render: (r) => r.graduationYear || "—" },
    { key: "issuedAt", label: "Issued", tdClass: "whitespace-nowrap", csv: (r) => fmtDate(r.issuedAt), render: (r) => fmtDate(r.issuedAt) },
    { key: "status", label: "On-chain", render: (r) => <Badge tone={r.status === "revoked" ? "red" : r.status === "active" ? "outline" : "amber"}>{r.status}</Badge> },
    { key: "zaqaValidation", label: "ZAQA", csv: (r) => ZAQA_META[r.zaqaValidation]?.label || r.zaqaValidation, render: (r) => {
      const z = ZAQA_META[r.zaqaValidation] || { label: r.zaqaValidation || "—", tone: "slate" };
      return <Badge tone={z.tone} dot>{z.label}</Badge>;
    } },
  ];

  return (
    <PortalShell
      portal="institution"
      active="issuance"
      title="Credential Issuance"
      actions={
        <ActionBtn tone="blue" icon="plus" disabled={!!blocked} className="disabled:opacity-50" onClick={() => { setIssueOpen(true); setResult(null); setIssueError(null); }}>
          Issue Credential
        </ActionBtn>
      }
      panel={
        <DetailPanel
          cred={selected}
          busy={busy}
          error={panelError}
          onClose={() => { setSel(null); setPanelError(null); }}
          onSubmit={submitZaqa}
          onTranscript={transcript}
          onRevoke={(c) => { setRevokeFor(c); setRevokeReason(2); }}
        />
      }
      panelKey={selected?.credentialHash}
      panelWidth="w-[420px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      <StatRow cols={5}>
        <StatCard icon="award" iconTone="softblue" label="Credentials Issued" value={loading ? "…" : String(creds.length)} />
        <StatCard icon="fileText" iconTone="slate" label="Drafts (not sent to ZAQA)" value={loading ? "…" : String(counts.draft || 0)} />
        <StatCard icon="clock" iconTone="amber" label="Awaiting ZAQA" value={loading ? "…" : String(counts.pending || 0)} />
        <StatCard icon="checkCircle" iconTone="softgreen" label="ZAQA Validated" value={loading ? "…" : String(counts.validated || 0)} />
        <StatCard icon="revoke" iconTone="softred" label="Revoked" value={loading ? "…" : String(creds.filter((c) => c.status === "revoked").length)} />
      </StatRow>

      {/* Regulator + signing status strip */}
      {profile && (
        <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-card ${blocked ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
          <div className="min-w-0 text-[13px]">
            <div className="font-semibold text-slate-800">
              {profile.sector === "secondary" ? "ECZ certification authority" : `${regulator} accreditation status`}
            </div>
            <div className="text-[12px] text-slate-500">
              {blocked
                ? (profile.heaNote || `Your institution is not currently approved by ${regulator} to issue credentials.`)
                : profile.sector === "secondary"
                ? "Secondary certificates are issued under the Examinations Council of Zambia."
                : `Your institution is ${regulator}-approved to issue ${profile.sector === "tevet" ? "TEVET" : "higher-education"} credentials.`}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={blocked ? "amber" : "green"}>{regulator}: {profile.heaStatus || "approved"}</Badge>
            {profile.zaqaTrusted && <Badge tone="softgreen" icon="shieldCheck">ZAQA trusted</Badge>}
            {isMetaMask && (
              !hasMetaMask() ? (
                <a href="https://metamask.io/download/" target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-blue-600 hover:underline">Install MetaMask</a>
              ) : wallet ? (
                <Badge tone={walletMatches ? "green" : "amber"} icon="wallet">{walletMatches ? "Wallet connected" : "Wrong wallet selected"}</Badge>
              ) : (
                <ActionBtn tone="outline" icon="wallet" className="!py-1.5" onClick={connect}>Connect MetaMask</ActionBtn>
              )
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-80" placeholder="Search graduate, qualification, year…" value={q} onChange={setQ} />
          <ToolButton icon="download" onClick={() => exportCSV("issued-credentials", columns, rows)} disabled={!rows.length} className="disabled:opacity-50">Export CSV</ToolButton>
          <ToolButton icon="refresh" className="ml-auto" onClick={load} aria-label="Refresh" />
        </div>
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => { setSel(r.credentialHash); setPanelError(null); }}
          loading={loading}
          columns={columns}
          rows={pg.rows}
          emptyText="No credentials issued yet — use “Issue Credential” to anchor the first one."
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      {/* Issue modal */}
      <Modal
        open={issueOpen}
        onClose={() => busy !== "issue" && setIssueOpen(false)}
        title="Issue credential"
        width="max-w-2xl"
        footer={
          result ? (
            <ActionBtn tone="outline" onClick={() => { setIssueOpen(false); setResult(null); }}>Done</ActionBtn>
          ) : (
            <>
              <ActionBtn tone="outline" disabled={busy === "issue"} onClick={() => setIssueOpen(false)}>Cancel</ActionBtn>
              <ActionBtn
                tone="blue"
                icon="award"
                disabled={busy === "issue" || !form.name.trim() || !form.holderEmail.trim() || !form.qualification.trim()}
                className="disabled:opacity-50"
                onClick={issue}
              >
                {busy === "issue" ? (step || "Issuing…") : isMetaMask ? "Issue & sign in MetaMask" : "Issue credential"}
              </ActionBtn>
            </>
          )
        }
      >
        <ErrorBanner error={issueError} />
        {result ? (
          <div className="flex flex-col items-center rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
            <Icon name="checkCircle" className="h-8 w-8 text-emerald-600" />
            <div className="mt-1 text-[14px] font-bold text-emerald-800">Credential issued and anchored</div>
            {result.qrImage && /* eslint-disable-next-line @next/next/no-img-element */ (
              <img src={result.qrImage} alt="Signed QR" className="mt-3 h-48 w-48 rounded-lg border border-emerald-200 bg-white p-2" />
            )}
            <p className="mt-2 max-w-sm text-[12px] text-emerald-800/80">
              The graduate can now see it in their wallet. Submit it to ZAQA from the credential&apos;s detail panel to start national validation.
            </p>
            <Link href={`/verify?hash=${result.credentialHash}`} className="mt-2 text-[12px] font-semibold text-emerald-700 underline">Verify this credential →</Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Graduate name" required><input className={INPUT} value={form.name} onChange={set("name")} placeholder="Nelson Chituli" /></Field>
            <Field label="Graduate email" required hint="The graduate signs in with this email to see the credential.">
              <input className={INPUT} type="email" value={form.holderEmail} onChange={set("holderEmail")} placeholder="grad@example.com" />
            </Field>
            <Field label="NRC / Passport (optional)" hint="Shown masked on the ZAQA verification certificate.">
              <input className={INPUT} value={form.nationalId} onChange={set("nationalId")} placeholder="123456/78/1" />
            </Field>
            <Field label="Qualification" required><input className={INPUT} value={form.qualification} onChange={set("qualification")} placeholder="Bachelor of ICT" /></Field>
            <Field label="Credential type">
              <select className={INPUT} value={form.credentialType} onChange={(e) => setForm((f) => ({ ...f, credentialType: e.target.value, zqfLevel: String(TYPES.find((t) => t.value === e.target.value)?.zqf || f.zqfLevel) }))}>
                {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="ZQF level" required>
                <select className={INPUT} value={form.zqfLevel} onChange={set("zqfLevel")}>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => <option key={l} value={l}>Level {l}</option>)}
                </select>
              </Field>
              <Field label="Graduation year" required>
                <input className={INPUT} type="number" min="1950" max="2100" value={form.graduationYear} onChange={set("graduationYear")} />
              </Field>
            </div>
            {(profile?.accreditedPrograms || []).length > 0 && (
              <div className="sm:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-[11.5px] text-slate-500">
                Accredited programmes on your {regulator} record: {profile.accreditedPrograms.join(", ")}. Issuing outside this list fails the programme check in ZAQA&apos;s automated validation.
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Revoke modal */}
      <Modal
        open={!!revokeFor}
        onClose={() => setRevokeFor(null)}
        title="Revoke credential"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setRevokeFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="red" icon="revoke" disabled={busy === "revoke"} className="disabled:opacity-50" onClick={revoke}>
              {busy === "revoke" ? "Revoking…" : "Revoke on-chain"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          Revoking <span className="font-semibold">{revokeFor?.subjectName}</span>&apos;s{" "}
          <span className="font-semibold">{revokeFor?.qualification}</span> is permanent — verification will immediately show REVOKED.
          To fix a mistake in the details, prefer <Link href="/institution/evidence" className="font-semibold text-blue-600 underline">issuing a corrected credential</Link> instead.
        </p>
        <Field label="Reason">
          <select className={INPUT} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)}>
            {REVOKE_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
          </select>
        </Field>
      </Modal>
    </PortalShell>
  );
}
