"use client";

// GovernanceSafe co-signing (D09): issuer authorisations proposed by ZAQA that need a second
// regulator's confirmation. The co-signer checks the call read from the chain in their own
// wallet, then confirms with MetaMask — the BBACVS API never holds their key.
import { useCallback, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { hasMetaMask, connectWallet, currentAddress, readSafeProposal, cosignSafeProposal } from "../../lib/metamask";
import { SectionCard, Badge, ActionBtn, ErrorBanner, KVGrid } from "./kit";
import { fmtDateTime } from "./auth";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export default function GovernanceCosign({ token, canSign = true }) {
  const [cfg, setCfg] = useState(null);
  const [rows, setRows] = useState(null);
  const [account, setAccount] = useState(null);
  const [onchain, setOnchain] = useState({}); // safeTxId -> wallet-side view
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [c, p] = await Promise.all([api.governanceConfig(token), api.governanceProposals(token)]);
      setCfg(c); setRows(p.proposals);
    } catch (e) { setError(e.message); setRows([]); }
  }, [token]);

  useEffect(() => { load(); currentAddress().then(setAccount).catch(() => {}); }, [load]);

  // Wallet-side reads, once a wallet is connected.
  useEffect(() => {
    if (!account || !cfg || !rows) return;
    Promise.all(rows.filter((r) => r.status === "awaiting_cosign").map(async (r) =>
      [r.safeTxId, await readSafeProposal(cfg.governanceSafe, r.safeTxId, account)]))
      .then((pairs) => setOnchain(Object.fromEntries(pairs)))
      .catch((e) => setError(e.message));
  }, [account, cfg, rows]);

  async function connect() {
    try { setAccount(await connectWallet()); } catch (e) { setError(e.message); }
  }

  async function cosign(r) {
    setBusy(r.safeTxId); setError(null); setNotice(null);
    try {
      const tx = await cosignSafeProposal(cfg.governanceSafe, r.safeTxId);
      await api.syncGovernanceProposal(token, r.safeTxId);
      setNotice(`Co-signed proposal #${r.safeTxId} (${short(tx)}). ${r.institution} is now authorised on-chain.`);
      await load();
    } catch (e) { setError(e.shortMessage || e.message); }
    finally { setBusy(null); }
  }

  const open = (rows || []).filter((r) => r.status === "awaiting_cosign");
  const done = (rows || []).filter((r) => r.status === "executed");

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onRetry={load} />
      {notice && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-800">{notice}</div>}

      {cfg && (
        <SectionCard title="Key custody">
          {cfg.mode === "server" ? (
            <p className="text-sm text-amber-800">
              Prototype custody: this platform currently holds two of the three GovernanceSafe owner keys and approves issuer
              authorisations on its own. Approvals are therefore <strong>not</strong> independently co-signed by a second regulator.
            </p>
          ) : (
            <p className="text-sm text-slate-700">
              ZAQA proposes each issuer authorisation. It takes effect only after ECZ or HEA confirms it from their own wallet.
              The platform never holds the co-signer&apos;s key.
            </p>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-3 text-[13px] text-slate-600">
            <span>GovernanceSafe {short(cfg.governanceSafe)}</span>
            {account ? <Badge tone="blue">Wallet {short(account)}</Badge> : canSign && (
              <ActionBtn tone="navy" onClick={connect} disabled={!hasMetaMask()}>
                {hasMetaMask() ? "Connect MetaMask" : "MetaMask not found"}
              </ActionBtn>
            )}
          </div>
        </SectionCard>
      )}

      <SectionCard title={`Awaiting co-signature (${open.length})`}>
        {rows === null ? <p className="text-sm text-slate-500">Loading…</p> : !open.length ? (
          <p className="text-sm text-slate-500">No proposals are waiting for a co-signature.</p>
        ) : (
          <ul className="space-y-3">
            {open.map((r) => {
              const w = onchain[r.safeTxId];
              const call = w?.call || r.chain?.call;
              const matches = call ? call.account.toLowerCase() === r.walletAddress.toLowerCase() : null;
              return (
                <li key={r.safeTxId} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold text-slate-800">{r.institution}</div>
                    <Badge tone="amber">Proposal #{r.safeTxId} · {(w?.confirmations ?? r.chain?.confirmations ?? 1)}/2 confirmations</Badge>
                  </div>
                  <KVGrid className="mt-2" items={[
                    { label: "Proposed", value: fmtDateTime(r.proposedAt) },
                    { label: "On-chain call", value: call ? `${call.method}(${short(call.account)}, "${call.institution}")` : "—" },
                    { label: "Institution wallet", value: short(r.walletAddress) },
                    { label: "Confirmed by", value: (r.chain?.confirmedBy || []).filter((o) => o.confirmed).map((o) => o.label).join(", ") || "—" },
                  ]} />
                  {matches === false && (
                    <p className="mt-2 text-sm font-semibold text-red-700">The on-chain call grants a different address than this institution&apos;s wallet. Do not co-sign.</p>
                  )}
                  {canSign && account && w && (
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      {!w.isOwner ? <span className="text-sm text-slate-500">This wallet is not a GovernanceSafe owner.</span>
                        : w.youConfirmed ? <span className="text-sm text-slate-500">You have already confirmed this proposal.</span>
                        : (
                          <ActionBtn tone="green" disabled={busy === r.safeTxId || matches === false} onClick={() => cosign(r)}>
                            {busy === r.safeTxId ? "Waiting for MetaMask…" : "Co-sign with MetaMask"}
                          </ActionBtn>
                        )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      {done.length > 0 && (
        <SectionCard title="Executed">
          <ul className="divide-y divide-slate-100 text-sm">
            {done.map((r) => (
              <li key={r.safeTxId} className="flex flex-wrap justify-between gap-2 py-2">
                <span className="text-slate-800">{r.institution}</span>
                <span className="text-slate-500">#{r.safeTxId} · authorised {fmtDateTime(r.executedAt)}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}
    </div>
  );
}
