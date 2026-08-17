"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatusTabs, SearchBox, ToolButton, DataTable, Pagination, usePager,
  Modal, ErrorBanner, ActionBtn, KVGrid, PanelHeader,
} from "../../../../components/portal/kit";
import CaseTimeline from "../../../../components/portal/CaseTimeline";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const STATUS_META = {
  draft: { label: "Draft", tone: "slate" },
  pending: { label: "Submitted", tone: "blue" },
  approved: { label: "Accredited", tone: "green" },
  rejected: { label: "Returned", tone: "red" },
};
const STATUS_ORDER = Object.keys(STATUS_META);

function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, tone: "slate" };
  return <Badge tone={m.tone} dot>{m.label}</Badge>;
}

function DetailPanel({ p, busy, error, onClose, onSubmit }) {
  if (!p) {
    return (
      <div>
        <h2 className="mb-3 text-[15px] font-bold text-slate-900">Programme Details</h2>
        <p className="text-[12.5px] text-slate-400">Select a programme to see its accreditation case.</p>
      </div>
    );
  }
  return (
    <div>
      <PanelHeader title="Programme Details" badge={<StatusBadge status={p.status} />} onClose={onClose} />
      <ErrorBanner error={error} />

      <div className="mb-4 rounded-xl border border-slate-200 p-3.5">
        <KVGrid
          cols={2}
          items={[
            { label: "Programme", value: p.name },
            { label: "Institution", value: p.institution || "—" },
            { label: "ZQF level", value: p.zqfLevel ? `Level ${p.zqfLevel}` : "—" },
            { label: "Registered qualification", value: p.qualificationRef || "Not linked" },
            { label: "Created", value: fmtDate(p.createdAt) },
            { label: "Status", value: <StatusBadge status={p.status} /> },
          ]}
        />
        {p.note ? (
          <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
            <span className="font-semibold">Regulator note:</span> {p.note}
          </div>
        ) : null}
      </div>

      {p.status === "draft" && (
        <ActionBtn tone="blue" icon="send" full className="mb-4" disabled={busy} onClick={() => onSubmit(p)}>
          {busy ? "Submitting…" : "Submit for accreditation"}
        </ActionBtn>
      )}

      <div className="rounded-xl border border-slate-200 p-3.5">
        <div className="mb-2.5 text-[12.5px] font-bold text-slate-800">Case History</div>
        <CaseTimeline events={p.events} />
      </div>
    </div>
  );
}

export default function InstitutionProgrammesPage() {
  const { ready, token } = usePortalGuard(["issuer"]);
  const [programmes, setProgrammes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panelError, setPanelError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("All");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(null);
  // New-programme modal state
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [name, setName] = useState("");
  const [level, setLevel] = useState("");
  const [qualSearch, setQualSearch] = useState("");
  const [qualMatches, setQualMatches] = useState([]);
  const [qualSearching, setQualSearching] = useState(false);
  const [pickedQual, setPickedQual] = useState(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setProgrammes((await api.myProgrammes(token)).programmes || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  // Registered-qualification quick lookup for the New programme modal (debounced).
  useEffect(() => {
    if (!creating || pickedQual) return;
    const term = qualSearch.trim();
    if (term.length < 2) { setQualMatches([]); return; }
    let stop = false;
    setQualSearching(true);
    const t = setTimeout(() => {
      api.searchQualifications(`?q=${encodeURIComponent(term)}&status=registered&limit=8`)
        .then((d) => { if (!stop) setQualMatches(d.items || d.qualifications || []); })
        .catch(() => { if (!stop) setQualMatches([]); })
        .finally(() => { if (!stop) setQualSearching(false); });
    }, 300);
    return () => { stop = true; clearTimeout(t); };
  }, [creating, qualSearch, pickedQual]);

  function openCreate() {
    setCreating(true);
    setCreateError(null);
    setName("");
    setLevel("");
    setQualSearch("");
    setQualMatches([]);
    setPickedQual(null);
  }

  async function submitCreate() {
    if (!name.trim()) return;
    setBusy(true);
    setCreateError(null);
    try {
      await api.createProgramme(token, {
        name: name.trim(),
        ...(pickedQual
          ? { qualificationId: pickedQual.id }
          : level
            ? { zqfLevel: Number(level) }
            : {}),
      });
      setCreating(false);
      await load();
    } catch (err) { setCreateError(err.message); }
    finally { setBusy(false); }
  }

  async function submitForAccreditation(p) {
    setBusy(true);
    setPanelError(null);
    try {
      await api.submitProgramme(token, p.id);
      await load();
    } catch (err) { setPanelError(err.message); }
    finally { setBusy(false); }
  }

  const counts = useMemo(
    () => programmes.reduce((m, p) => ((m[p.status] = (m[p.status] || 0) + 1), m), {}),
    [programmes]
  );
  const tabs = [
    { label: "All", count: programmes.length },
    ...STATUS_ORDER.map((s) => ({ label: STATUS_META[s].label, count: counts[s] || 0 })),
  ];
  const LABEL_TO_STATUS = Object.fromEntries(STATUS_ORDER.map((s) => [STATUS_META[s].label, s]));

  const rows = useMemo(() => {
    return programmes.filter((p) => {
      if (tab !== "All" && p.status !== LABEL_TO_STATUS[tab]) return false;
      return !q || `${p.name} ${p.qualificationRef || ""} ${p.status}`.toLowerCase().includes(q.toLowerCase());
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programmes, tab, q]);

  const pg = usePager(rows, 10, [tab, q]);
  const selected = programmes.find((p) => p.id === sel) || null;

  if (!ready) return null;

  return (
    <PortalShell
      portal="institution"
      active="programmes"
      title="Programmes"
      actions={
        <>
          <ActionBtn tone="blue" icon="plus" onClick={openCreate}>New programme</ActionBtn>
          <ToolButton icon="refresh" aria-label="Refresh" onClick={load} />
        </>
      }
      panel={
        <DetailPanel
          p={selected}
          busy={busy}
          error={panelError}
          onClose={() => { setSel(null); setPanelError(null); }}
          onSubmit={submitForAccreditation}
        />
      }
      panelKey={selected?.id}
      panelWidth="w-[420px]"
    >
      <ErrorBanner error={error} onRetry={load} />

      <div className="rounded-xl border border-slate-200 bg-white px-4 pt-1 shadow-card">
        <StatusTabs tabs={tabs} active={tab} onChange={setTab} />
        <div className="mb-4 flex flex-wrap items-center gap-2.5">
          <SearchBox className="w-full sm:w-72" placeholder="Search programme or qualification ref..." value={q} onChange={setQ} />
        </div>
        <DataTable
          rowKey="id"
          activeKey={selected?.id}
          onRowClick={(r) => { setSel(r.id); setPanelError(null); }}
          loading={loading}
          emptyText="No programmes yet — create one to get started."
          columns={[
            { key: "name", label: "Programme", render: (r) => <span className="font-semibold text-slate-800">{r.name}</span> },
            { key: "zqfLevel", label: "ZQF Level", render: (r) => (r.zqfLevel ? `Level ${r.zqfLevel}` : "—") },
            { key: "qualificationRef", label: "Registered Qualification", render: (r) => r.qualificationRef || "—" },
            { key: "status", label: "Status", render: (r) => <StatusBadge status={r.status} /> },
            { key: "note", label: "Regulator Note", tdClass: "text-slate-500", render: (r) => r.note || "—" },
            { key: "createdAt", label: "Created", tdClass: "whitespace-nowrap", render: (r) => fmtDate(r.createdAt) },
          ]}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </div>

      {/* New programme */}
      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="New programme"
        width="max-w-xl"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setCreating(false)}>Cancel</ActionBtn>
            <ActionBtn tone="blue" icon="plus" disabled={busy || !name.trim()} onClick={submitCreate}>
              {busy ? "Creating…" : "Create draft"}
            </ActionBtn>
          </>
        }
      >
        <ErrorBanner error={createError} />
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Programme name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Bachelor of Information & Communications Technology"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </label>

          <div>
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">Link a registered qualification (optional)</span>
            <p className="mb-2 text-[11.5px] text-slate-500">
              If the programme delivers a nationally registered qualification, link it — the ZQF level is then
              inherited from the national register.
            </p>
            {pickedQual ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                <div className="min-w-0 text-[12.5px] text-emerald-800">
                  <span className="font-bold">{pickedQual.referenceId}</span> — {pickedQual.title}
                  <span className="ml-1.5 text-emerald-700/80">
                    (Level {pickedQual.currentMappedLevel || pickedQual.nqfLevel})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => { setPickedQual(null); setQualSearch(""); }}
                  className="shrink-0 text-[12px] font-semibold text-emerald-700 underline hover:text-emerald-800"
                >
                  Unlink
                </button>
              </div>
            ) : (
              <>
                <SearchBox
                  placeholder="Search the national register by title or reference..."
                  value={qualSearch}
                  onChange={setQualSearch}
                />
                {qualSearching && <div className="mt-1.5 text-[11.5px] text-slate-400">Searching the register…</div>}
                {!qualSearching && qualSearch.trim().length >= 2 && qualMatches.length === 0 && (
                  <div className="mt-1.5 text-[11.5px] text-slate-400">No registered qualifications match.</div>
                )}
                {qualMatches.length > 0 && (
                  <div className="mt-1.5 max-h-44 overflow-y-auto rounded-lg border border-slate-200">
                    {qualMatches.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { setPickedQual(m); setQualMatches([]); }}
                        className="flex w-full items-baseline justify-between gap-3 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate text-[12.5px] text-slate-700">
                          <span className="font-semibold">{m.referenceId}</span> — {m.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          Level {m.currentMappedLevel || m.nqfLevel}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-slate-700">ZQF level</span>
            {pickedQual ? (
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12.5px] text-slate-500">
                Inherited from the linked qualification (Level {pickedQual.currentMappedLevel || pickedQual.nqfLevel}).
              </div>
            ) : (
              <select
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Not set</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((l) => (
                  <option key={l} value={l}>Level {l}</option>
                ))}
              </select>
            )}
          </label>
        </div>
      </Modal>
    </PortalShell>
  );
}
