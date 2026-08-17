"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PortalShell from "../../../components/portal/shell";
import Icon from "../../../components/portal/icons";
import {
  Badge, Avatar, StatCard, StatRow, SectionCard, SelectPill, SearchBox,
  DataTable, Pagination, usePager, Modal, ErrorBanner, ActionBtn, KVGrid, PanelHeader,
} from "../../../components/portal/kit";
import CaseTimeline from "../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate, fmtDateTime } from "../../../components/portal/auth";
import { api, openBlob } from "../../../lib/api";

// Map credential state onto a wallet status badge.
function credStatus(c) {
  if (c.status === "revoked") return { key: "revoked", label: "Revoked", tone: "red" };
  if (c.status === "suspended") return { key: "attention", label: "Suspended", tone: "amber" };
  if (c.zaqaValidation === "validated") return { key: "verified", label: "Verified", tone: "green" };
  if (c.zaqaValidation === "rejected") return { key: "attention", label: "Rejected", tone: "red" };
  if (["suspicious", "under_dispute"].includes(c.zaqaValidation)) return { key: "attention", label: "Attention", tone: "amber" };
  return { key: "pending", label: "Pending", tone: "amber" };
}

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

function DetailPanel({ user, creds, cred, busy, error, onClose, onQR, onPDF, onCorrect }) {
  if (!cred) {
    const verified = creds.some((c) => c.zaqaValidation === "validated");
    return (
      <div>
        <h2 className="mb-4 text-[15px] font-bold text-slate-900">Credential Details</h2>
        <div className="mb-4 flex flex-col items-center rounded-xl border border-slate-200 p-4 text-center">
          <Avatar name={user.name || user.email} size="h-14 w-14" className="text-[16px]" />
          <div className="mt-2 text-[14px] font-bold text-slate-900">{user.name || user.email}</div>
          <div className="text-[12px] text-slate-500">{user.email}</div>
          {verified ? (
            <Badge tone="green" icon="shieldCheck" className="mt-1.5">Verified Graduate</Badge>
          ) : (
            <Badge tone="amber" icon="clock" className="mt-1.5">Verification Pending</Badge>
          )}
        </div>
        <p className="text-[12.5px] text-slate-400">Select a credential to see its full record and history.</p>
      </div>
    );
  }
  const s = credStatus(cred);
  const replacement = cred.supersededBy ? creds.find((c) => c.credentialHash === cred.supersededBy) : null;
  return (
    <div>
      <PanelHeader title="Credential Details" badge={<Badge tone={s.tone} dot>{s.label}</Badge>} onClose={onClose} />
      <ErrorBanner error={error} />

      {cred.supersededBy && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[12.5px] text-blue-800">
          This credential was replaced — see your newest credential
          {replacement ? ` (${replacement.qualification}, issued ${fmtDate(replacement.issuedAt)})` : ""}. The
          replacement carries the corrected details.
        </div>
      )}
      {cred.supersedes && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12.5px] text-emerald-800">
          This credential was issued as a correction and replaces an earlier record.
        </div>
      )}
      {cred.correctionRequest?.status === "open" && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800">
          <span className="font-bold">Correction request under review:</span> {cred.correctionRequest.message}
        </div>
      )}
      {cred.status === "suspended" && cred.suspension?.reason && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[12.5px] text-red-700">
          <span className="font-bold">Suspended:</span> {cred.suspension.reason}
        </div>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Qualification", value: cred.qualification },
            { label: "Institution", value: cred.institution },
            { label: "Graduation year", value: cred.graduationYear },
            { label: "ZQF level", value: cred.zqfLevel ? `Level ${cred.zqfLevel}` : "—" },
            { label: "Issued", value: fmtDate(cred.issuedAt) },
            {
              label: "ZAQA validation",
              value: cred.zaqaValidation === "validated"
                ? <Badge tone="green" icon="shieldCheck">Validated</Badge>
                : <Badge tone={s.tone}>{cred.zaqaValidation || "pending"}</Badge>,
            },
          ]}
        />
        <div className="mt-3 text-[11px] text-slate-400">
          Anchored in the national registry
        </div>
      </div>

      <div className="mb-4 space-y-2">
        <div className="text-[12.5px] font-bold text-slate-900">Actions</div>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn tone="outline" icon="qr" full disabled={busy === "qr"} onClick={() => onQR(cred)}>
            {busy === "qr" ? "Loading…" : "Show QR"}
          </ActionBtn>
          <ActionBtn tone="outline" icon="download" full disabled={busy === "pdf"} onClick={() => onPDF(cred)}>
            {busy === "pdf" ? "Preparing…" : "Download PDF"}
          </ActionBtn>
        </div>
        <Link href={`/verify?hash=${cred.credentialHash}`} className="block">
          <ActionBtn tone="outline" icon="shieldCheck" full>Verify online</ActionBtn>
        </Link>
        {cred.correctionRequest?.status === "open" ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-500">
            A correction request is already open on this credential — the institution will resolve it by issuing a
            corrected credential.
          </div>
        ) : (
          <ActionBtn tone="softorange" icon="edit" full onClick={() => onCorrect(cred)}>
            Request correction
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

export default function GraduateDashboardPage() {
  const { ready, user, token } = usePortalGuard(["holder"]);
  const [creds, setCreds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");
  const [sel, setSel] = useState(null);
  const [qr, setQr] = useState(null); // {cred, image}
  const [correctFor, setCorrectFor] = useState(null);
  const [correctMsg, setCorrectMsg] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setCreds((await api.myCredentials(token)).credentials || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  async function showQR(cred) {
    setBusy("qr");
    setPanelError(null);
    try {
      const d = await api.getQR(token, cred.credentialHash);
      setQr({ cred, image: d.qrImage });
    } catch (err) { setPanelError(err.message); }
    finally { setBusy(null); }
  }

  async function downloadPDF(cred) {
    setBusy("pdf");
    setPanelError(null);
    try {
      openBlob(await api.downloadPDF(token, cred.credentialHash), `credential-${cred.credentialHash.slice(0, 10)}.pdf`);
    } catch (err) { setPanelError(err.message); }
    finally { setBusy(null); }
  }

  function openCorrect(cred) {
    setCorrectFor(cred);
    setCorrectMsg("");
  }

  async function submitCorrection() {
    if (!correctMsg.trim()) return;
    setBusy("correct");
    try {
      await api.requestCorrection(token, correctFor.credentialHash, correctMsg.trim());
      setCorrectFor(null);
      await load();
    } catch (err) { setPanelError(err.message); setCorrectFor(null); }
    finally { setBusy(null); }
  }

  const stats = useMemo(() => {
    const m = { verified: 0, pending: 0, attention: 0, revoked: 0 };
    creds.forEach((c) => { m[credStatus(c).key] += 1; });
    return m;
  }, [creds]);

  const rows = useMemo(() => {
    return creds.filter((c) => {
      if (filter && credStatus(c).key !== filter) return false;
      return !q || `${c.credentialHash} ${c.qualification} ${c.institution} ${c.graduationYear}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [creds, q, filter]);

  const pg = usePager(rows, 8, [q, filter]);
  const selected = creds.find((c) => c.credentialHash === sel) || null;

  if (!ready) return null;

  const pct = (n) => (creds.length ? `${((n / creds.length) * 100).toFixed(0)}%` : "0%");
  const statusSummary = [
    { icon: "check", cls: "bg-emerald-500/20 text-emerald-300", count: stats.verified, label: "Verified", pct: pct(stats.verified) },
    { icon: "clock", cls: "bg-amber-500/20 text-amber-300", count: stats.pending, label: "Pending", pct: pct(stats.pending) },
    { icon: "alert", cls: "bg-orange-500/20 text-orange-300", count: stats.attention, label: "Attention", pct: pct(stats.attention) },
    { icon: "x", cls: "bg-red-500/20 text-red-300", count: stats.revoked, label: "Revoked", pct: pct(stats.revoked) },
  ];

  const firstName = (user.name || user.email || "").split(/[\s@]/)[0];

  return (
    <PortalShell
      portal="graduate"
      active="dashboard"
      title={`Welcome back, ${firstName}!`}
      panel={
        <DetailPanel
          user={user}
          creds={creds}
          cred={selected}
          busy={busy}
          error={panelError}
          onClose={() => { setSel(null); setPanelError(null); }}
          onQR={showQR}
          onPDF={downloadPDF}
          onCorrect={openCorrect}
        />
      }
      panelKey={selected?.credentialHash}
      panelWidth="w-[420px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      {/* KPI row */}
      <StatRow cols={4}>
        <StatCard icon="file" iconTone="softblue" label="Total Credentials" value={String(creds.length)} />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="Verified Credentials" value={String(stats.verified)} />
        <StatCard icon="clock" iconTone="amber" label="Pending Verification" value={String(stats.pending)} />
        <StatCard icon="alert" iconTone="softred" label="Requires Attention" value={String(stats.attention + stats.revoked)} />
      </StatRow>

      {/* Hero banner */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-6 rounded-2xl bg-gradient-to-r from-[#0c3b2e] to-[#14532d] p-6 text-white">
        <div className="flex max-w-md items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="wallet" className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-bold">Your Credential Wallet</h3>
            <p className="mt-1 text-[13px] text-emerald-100/80">
              Every credential below is blockchain-anchored — show its QR, download the official PDF, or ask your
              institution for a correction.
            </p>
          </div>
        </div>
        <div className="min-w-0">
          <div className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-emerald-100/70">
            Credential Status Summary
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {statusSummary.map((s) => (
              <div key={s.label} className="flex min-w-[64px] flex-col items-center text-center">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${s.cls}`}>
                  <Icon name={s.icon} className="h-4 w-4" />
                </span>
                <div className="mt-1.5 text-xl font-bold">{s.count}</div>
                <div className="text-[10.5px] leading-tight text-emerald-100/80">{s.label}</div>
                <div className="text-[10.5px] text-emerald-100/50">{s.pct}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Credentials table */}
      <SectionCard
        title="My Credentials"
        pad="p-0"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SelectPill
              label="Status"
              value={filter}
              onChange={setFilter}
              options={[
                { value: "verified", label: "Verified" },
                { value: "pending", label: "Pending" },
                { value: "attention", label: "Attention" },
                { value: "revoked", label: "Revoked" },
              ]}
            />
            <SearchBox className="w-56" placeholder="Search credentials..." value={q} onChange={setQ} />
          </div>
        }
      >
        <DataTable
          rowKey="credentialHash"
          activeKey={selected?.credentialHash}
          onRowClick={(r) => { setSel(r.credentialHash); setPanelError(null); }}
          loading={loading}
          emptyText="No credentials yet — apply for digitisation from the Apply page, or an institution can issue one to you directly."
          columns={[
            {
              key: "credentialHash",
              label: "Credential",
              render: (r) => (
                <span className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                    <Icon name="award" className="h-4 w-4" />
                  </span>
                  <span className="leading-tight">
                    <span className="block font-mono text-[12px] font-bold text-slate-800">{shortHash(r.credentialHash)}</span>
                    {r.supersededBy ? (
                      <span className="block text-[11px] font-semibold text-blue-600">Replaced — see newest credential</span>
                    ) : r.supersedes ? (
                      <span className="block text-[11px] text-emerald-600">Corrected reissue</span>
                    ) : (
                      <span className="block text-[11px] text-slate-400">Credential hash</span>
                    )}
                  </span>
                </span>
              ),
            },
            {
              key: "qualification",
              label: "Qualification",
              render: (r) => (
                <span className="block leading-tight">
                  <span className="block font-medium text-slate-700">{r.qualification}</span>
                  <span className="block text-[11px] text-slate-400">{r.graduationYear}</span>
                </span>
              ),
            },
            { key: "institution", label: "Issuer" },
            { key: "issued", label: "Issue Date", tdClass: "whitespace-nowrap", render: (r) => fmtDate(r.issuedAt) },
            {
              key: "status",
              label: "Status",
              render: (r) => {
                const s = credStatus(r);
                return (
                  <span className="flex items-center gap-1.5">
                    <Badge tone={s.tone}>{s.label}</Badge>
                    {r.correctionRequest?.status === "open" && <Badge tone="amber" icon="edit">Correction</Badge>}
                  </span>
                );
              },
            },
            {
              key: "actions",
              label: "Actions",
              render: (r) => (
                <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => { setSel(r.credentialHash); showQR(r); }}
                    aria-label="Show QR"
                    title="Show QR"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    QR
                  </button>
                  <button
                    onClick={() => { setSel(r.credentialHash); downloadPDF(r); }}
                    disabled={busy === "pdf"}
                    aria-label="Download PDF"
                    title="Download PDF"
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                  >
                    PDF
                  </button>
                </span>
              ),
            },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </SectionCard>

      {/* Security note */}
      <div className="mt-6 text-center text-[12px] text-slate-500">
        <Icon name="lock" className="mr-1 inline h-3.5 w-3.5 align-[-2px]" />
        Your credentials are secured with blockchain anchoring and tamper-proof verification.
      </div>

      {/* Signed QR modal */}
      <Modal
        open={!!qr}
        onClose={() => setQr(null)}
        title="Signed QR Code"
        footer={<ActionBtn tone="outline" onClick={() => setQr(null)}>Close</ActionBtn>}
      >
        {qr && (
          <div className="flex flex-col items-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qr.image} alt="Signed credential QR" className="h-64 w-64 rounded-lg border border-slate-200 bg-white p-2" />
            <div className="mt-3 text-[13px] font-semibold text-slate-800">{qr.cred.qualification}</div>
            <div className="text-[12px] text-slate-500">{qr.cred.institution} · {qr.cred.graduationYear}</div>
            <p className="mt-2 max-w-sm text-[11.5px] text-slate-400">
              Anyone can scan this QR to verify your credential — it carries a cryptographic signature and works even
              offline.
            </p>
          </div>
        )}
      </Modal>

      {/* Request correction modal */}
      <Modal
        open={!!correctFor}
        onClose={() => setCorrectFor(null)}
        title="Request a correction"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setCorrectFor(null)}>Cancel</ActionBtn>
            <ActionBtn tone="orange" icon="edit" disabled={busy === "correct" || !correctMsg.trim()} onClick={submitCorrection}>
              {busy === "correct" ? "Sending…" : "Send request"}
            </ActionBtn>
          </>
        }
      >
        <p className="mb-3 text-[13px] text-slate-600">
          Tell <span className="font-semibold">{correctFor?.institution}</span> what is wrong with your{" "}
          <span className="font-semibold">{correctFor?.qualification}</span> credential. If they agree, they will issue
          a corrected credential that replaces this one.
        </p>
        <label className="block">
          <span className="mb-1 block text-[12px] font-semibold text-slate-700">What needs correcting? *</span>
          <textarea
            rows={4}
            value={correctMsg}
            onChange={(e) => setCorrectMsg(e.target.value)}
            placeholder="e.g. My name is spelled incorrectly — it should read..."
            className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </label>
      </Modal>
    </PortalShell>
  );
}
