"use client";

// NQF framework — configurational, not just informational. ZAQA edits level
// descriptors in place, drafts new framework versions (cloned from the one in
// force), and activates them; activation supersedes the previous version and
// remaps the national register, so registration/validation decisions from that
// moment are stamped with the new version automatically.

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  ActionBtn, Badge, StatCard, StatRow, SectionCard, ToolButton, DataTable,
  ErrorBanner, KVGrid, Modal, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const LEVEL_CLS = [
  "bg-amber-500", "bg-lime-600", "bg-green-600", "bg-emerald-600", "bg-teal-600",
  "bg-sky-600", "bg-blue-600", "bg-indigo-600", "bg-violet-600", "bg-purple-600",
];

const SUB_TONE = { general: "blue", tevet: "teal", higher_ed: "purple" };
const VERSION_TONE = { active: "green", draft: "amber", superseded: "slate" };

const EXPORT_COLUMNS = [
  { key: "level", label: "Level" },
  { key: "title", label: "Title" },
  { key: "knowledge", label: "Knowledge", csv: (l) => l.descriptors?.knowledge || "" },
  { key: "skills", label: "Skills", csv: (l) => l.descriptors?.skills || "" },
  { key: "autonomy", label: "Autonomy & Responsibility", csv: (l) => l.descriptors?.autonomyResponsibility || "" },
  { key: "typical", label: "Typical Qualifications", csv: (l) => (l.typicalQualifications || []).join("; ") },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] text-slate-700 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100";
const labelCls = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500";

export default function ZaqaNqfPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [versions, setVersions] = useState([]);
  const [viewCode, setViewCode] = useState(null); // version being viewed/edited; null = in force
  const [framework, setFramework] = useState(null);
  const [levels, setLevels] = useState([]);
  const [subFrameworks, setSubFrameworks] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [policiesError, setPoliciesError] = useState(null);
  const [selLevel, setSelLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // modals
  const [editLevel, setEditLevel] = useState(null); // level doc being edited
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [newVersion, setNewVersion] = useState(null); // {code,title,gazetteRef,notes} form
  const [policyForm, setPolicyForm] = useState(null); // {key,value,description}
  const [busy, setBusy] = useState(false);
  const [modalError, setModalError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPoliciesError(null);
    try {
      const all = (await api.nqfFrameworks()).frameworks || [];
      setVersions(all);
      const active = all.find((v) => v.status === "active");
      const code = viewCode || active?.code || all[0]?.code;
      if (code) {
        const full = await api.nqfFramework(code);
        setFramework(full.version);
        const lv = (full.levels || []).sort((a, b) => b.level - a.level); // 10 → 1 ladder
        setLevels(lv);
        setSubFrameworks(full.subFrameworks || []);
        setSelLevel((s) => s ?? lv[0]?.level ?? null);
      } else {
        setFramework(null);
        setLevels([]);
        setSubFrameworks([]);
      }
      try {
        setPolicies((await api.nqfPolicies(token)).policies || []);
      } catch (perr) {
        setPoliciesError(perr.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, viewCode]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const selected = levels.find((l) => l.level === selLevel) || null;
  const isDraft = framework?.status === "draft";

  async function run(fn) {
    setBusy(true);
    setModalError(null);
    try {
      await fn();
      await load();
      return true;
    } catch (err) {
      setModalError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function saveLevel() {
    const ok = await run(() =>
      api.nqfUpdateLevel(token, editLevel.level, {
        version: framework.code,
        title: editLevel.title,
        descriptors: {
          knowledge: editLevel.knowledge,
          skills: editLevel.skills,
          autonomyResponsibility: editLevel.autonomyResponsibility,
        },
        typicalQualifications: editLevel.typical
          .split("\n").map((s) => s.trim()).filter(Boolean),
      })
    );
    if (ok) setEditLevel(null);
  }

  async function createVersion() {
    const ok = await run(() =>
      api.nqfCreateFramework(token, {
        code: newVersion.code.trim(),
        title: newVersion.title.trim(),
        gazetteRef: newVersion.gazetteRef.trim(),
        notes: newVersion.notes.trim(),
      })
    );
    if (ok) {
      setNewVersion(null);
      setViewCode(newVersion.code.trim()); // jump into the draft for editing
    }
  }

  async function activate(code) {
    if (!window.confirm(`Bring ${code} into force? The current version is superseded and every registered qualification is remapped to ${code}.`)) return;
    const ok = await run(() => api.nqfActivateFramework(token, code));
    if (ok) {
      setViewCode(null);
      setVersionsOpen(false);
    }
  }

  async function savePolicy() {
    let value = policyForm.value;
    try { value = JSON.parse(policyForm.value); } catch { /* keep as string */ }
    const ok = await run(() =>
      api.nqfSetPolicy(token, { key: policyForm.key.trim(), value, description: policyForm.description.trim() })
    );
    if (ok) setPolicyForm(null);
  }

  return (
    <PortalShell
      portal="zaqa"
      active="nqf"
      title="NQF Framework"
      actions={
        <>
          <ToolButton icon="layers" onClick={() => setVersionsOpen(true)}>Versions</ToolButton>
          <ToolButton
            icon="download"
            onClick={() => exportCSV(`nqf-${framework?.code || "framework"}-levels`, EXPORT_COLUMNS, [...levels].sort((a, b) => a.level - b.level))}
            disabled={levels.length === 0}
            className="disabled:opacity-50"
          >
            Export
          </ToolButton>
        </>
      }
    >
      <ErrorBanner error={error} onRetry={load} />

      {/* Version header — data only */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        {framework ? (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-2xl font-extrabold tracking-tight text-slate-900">{framework.code}</span>
              <Badge tone={VERSION_TONE[framework.status] || "slate"} dot>
                {framework.status === "active" ? "In force" : framework.status}
              </Badge>
              {viewCode && framework.status !== "active" && (
                <button
                  type="button"
                  onClick={() => setViewCode(null)}
                  className="text-[12px] font-semibold text-blue-700 underline"
                >
                  Back to version in force
                </button>
              )}
            </div>
            <KVGrid
              cols={3}
              className="min-w-[280px]"
              items={[
                { label: "Gazette", value: framework.gazetteRef || "—" },
                { label: "Effective", value: fmtDate(framework.effectiveFrom) },
                { label: "Versions", value: versions.length },
              ]}
            />
          </div>
        ) : (
          <div className="py-4 text-center text-[13px] text-slate-400">
            {loading ? "Loading…" : "No framework version configured."}
          </div>
        )}
      </div>

      <StatRow cols={4}>
        <StatCard icon="layers" iconTone="softblue" label="Framework Versions" value={loading ? "…" : String(versions.length)} />
        <StatCard icon="scale" iconTone="softgreen" label="Levels Defined" value={loading ? "…" : `${levels.length}/10`} />
        <StatCard icon="map" iconTone="purple" label="Sub-frameworks" value={loading ? "…" : String(subFrameworks.length)} />
        <StatCard icon="book" iconTone="amber" label="Policy Values" value={loading ? "…" : String(policies.length)} />
      </StatRow>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        {/* Level ladder */}
        <SectionCard title="Level Ladder" pad="p-3">
          {levels.length ? (
            <div className="space-y-1.5">
              {levels.map((l) => (
                <button
                  key={l.level}
                  type="button"
                  onClick={() => setSelLevel(l.level)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition ${
                    selLevel === l.level ? "bg-blue-50 ring-1 ring-blue-200" : "hover:bg-slate-50"
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
                      LEVEL_CLS[l.level - 1] || "bg-slate-500"
                    }`}
                  >
                    {l.level}
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[13px] font-bold text-slate-800">{l.title}</span>
                    {(l.typicalQualifications || [])[0] && (
                      <span className="block truncate text-[11px] text-slate-400">
                        {l.typicalQualifications.join(" · ")}
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center text-[13px] text-slate-400">
              {loading ? "Loading levels…" : "No level descriptors for this version."}
            </div>
          )}
        </SectionCard>

        {/* Selected level descriptors — editable */}
        <SectionCard
          title={selected ? selected.title : "Level Descriptors"}
          pad="p-4"
          action={
            selected && framework && (
              <div className="flex items-center gap-2">
                <Badge tone="softblue">{framework.code} · Level {selected.level}</Badge>
                <ToolButton
                  icon="edit"
                  onClick={() =>
                    setEditLevel({
                      level: selected.level,
                      title: selected.title || "",
                      knowledge: selected.descriptors?.knowledge || "",
                      skills: selected.descriptors?.skills || "",
                      autonomyResponsibility: selected.descriptors?.autonomyResponsibility || "",
                      typical: (selected.typicalQualifications || []).join("\n"),
                    })
                  }
                >
                  Edit
                </ToolButton>
              </div>
            )
          }
        >
          {selected ? (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                {[
                  { label: "Knowledge", text: selected.descriptors?.knowledge },
                  { label: "Skills", text: selected.descriptors?.skills },
                  { label: "Autonomy & Responsibility", text: selected.descriptors?.autonomyResponsibility },
                ].map((d) => (
                  <div key={d.label} className="rounded-lg border border-slate-100 bg-slate-50/60 p-3.5">
                    <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{d.label}</div>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-700">{d.text || "—"}</p>
                  </div>
                ))}
              </div>
              {(selected.typicalQualifications || []).length > 0 && (
                <div className="mt-4 border-t border-slate-100 pt-3 text-[12.5px] text-slate-600">
                  <span className="font-semibold">Typical qualifications:</span>{" "}
                  {selected.typicalQualifications.join(", ")}
                </div>
              )}
            </>
          ) : (
            <div className="py-10 text-center text-[13px] text-slate-400">Select a level.</div>
          )}
        </SectionCard>
      </div>

      {/* Sub-frameworks */}
      <SectionCard title="Sub-frameworks & Appropriate Authorities" className="mb-4" pad="p-4">
        {subFrameworks.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {subFrameworks.map((sf) => (
              <div key={sf.code} className="rounded-lg border border-slate-100 p-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-bold text-slate-900">{sf.name}</span>
                  <Badge tone={SUB_TONE[sf.code] || "slate"}>
                    Levels {sf.levelRange?.min ?? "—"}–{sf.levelRange?.max ?? "—"}
                  </Badge>
                </div>
                <div className="mt-1 text-[12px] text-slate-500">Authority: {sf.authority}</div>
                {(sf.typicalQualifications || []).length > 0 && (
                  <div className="mt-1.5 text-[11.5px] text-slate-400">{sf.typicalQualifications.join(" · ")}</div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-[13px] text-slate-400">
            {loading ? "Loading…" : "No sub-frameworks defined."}
          </div>
        )}
      </SectionCard>

      {/* Effective-dated policy values */}
      <SectionCard
        title="Policy Values (effective today)"
        pad="p-0"
        action={<ToolButton icon="edit" onClick={() => setPolicyForm({ key: "", value: "", description: "" })}>Set policy</ToolButton>}
      >
        {policiesError && <div className="px-4 pt-3"><ErrorBanner error={policiesError} onRetry={load} /></div>}
        <DataTable
          dense
          loading={loading && !policies.length && !policiesError}
          rowKey="key"
          emptyText="No policy values set yet."
          columns={[
            {
              key: "key", label: "Policy Key",
              render: (r) => <span className="font-mono text-[12px] font-semibold text-slate-800">{r.key}</span>,
            },
            {
              key: "value", label: "Current Value",
              render: (r) => (
                <Badge tone="softblue">{typeof r.value === "object" ? JSON.stringify(r.value) : String(r.value)}</Badge>
              ),
            },
            { key: "description", label: "Description", render: (r) => r.description || "—" },
            { key: "effectiveFrom", label: "Effective From", render: (r) => fmtDate(r.effectiveFrom) },
            { key: "setBy", label: "Set By", render: (r) => r.setBy || "—" },
            { key: "versions", label: "History", render: (r) => `${r.versions} version${r.versions === 1 ? "" : "s"}` },
          ]}
          rows={policies}
        />
      </SectionCard>

      {/* ---- Edit level descriptors ---- */}
      <Modal
        open={!!editLevel}
        onClose={() => setEditLevel(null)}
        title={editLevel ? `Edit Level ${editLevel.level} — ${framework?.code}` : ""}
        width="max-w-2xl"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setEditLevel(null)} disabled={busy}>Cancel</ActionBtn>
            <ActionBtn tone="blue" onClick={saveLevel} disabled={busy}>{busy ? "Saving…" : "Save descriptors"}</ActionBtn>
          </>
        }
      >
        {editLevel && (
          <div className="space-y-3">
            <ErrorBanner error={modalError} />
            {!isDraft && (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                Editing the version in force takes effect immediately. For a gazetted revision, draft a new version instead.
              </div>
            )}
            <div>
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={editLevel.title} onChange={(e) => setEditLevel({ ...editLevel, title: e.target.value })} />
            </div>
            {[
              ["knowledge", "Knowledge"],
              ["skills", "Skills"],
              ["autonomyResponsibility", "Autonomy & Responsibility"],
            ].map(([k, label]) => (
              <div key={k}>
                <label className={labelCls}>{label}</label>
                <textarea
                  rows={3}
                  className={inputCls}
                  value={editLevel[k]}
                  onChange={(e) => setEditLevel({ ...editLevel, [k]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className={labelCls}>Typical qualifications (one per line)</label>
              <textarea
                rows={3}
                className={inputCls}
                value={editLevel.typical}
                onChange={(e) => setEditLevel({ ...editLevel, typical: e.target.value })}
              />
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Versions manager ---- */}
      <Modal
        open={versionsOpen}
        onClose={() => setVersionsOpen(false)}
        title="Framework Versions"
        width="max-w-2xl"
        footer={
          <ActionBtn tone="blue" onClick={() => setNewVersion({ code: "", title: "", gazetteRef: "", notes: "" })}>
            New version
          </ActionBtn>
        }
      >
        <ErrorBanner error={modalError} />
        <div className="space-y-2">
          {versions.map((v) => (
            <div key={v.code} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3.5 py-2.5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-bold text-slate-900">{v.code}</span>
                  <Badge tone={VERSION_TONE[v.status] || "slate"} dot>
                    {v.status === "active" ? "In force" : v.status}
                  </Badge>
                </div>
                <div className="text-[11.5px] text-slate-500">
                  {v.gazetteRef || "No gazette reference"} · {v.effectiveFrom ? `Effective ${fmtDate(v.effectiveFrom)}` : "No effective date"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ActionBtn
                  tone="outline"
                  onClick={() => { setViewCode(v.code); setVersionsOpen(false); setSelLevel(null); }}
                >
                  {v.status === "draft" ? "Edit draft" : "View"}
                </ActionBtn>
                {v.status === "draft" && (
                  <ActionBtn tone="darkgreen" onClick={() => activate(v.code)} disabled={busy}>
                    Activate
                  </ActionBtn>
                )}
              </div>
            </div>
          ))}
          {versions.length === 0 && <div className="py-6 text-center text-[13px] text-slate-400">No versions yet.</div>}
        </div>
      </Modal>

      {/* ---- New version ---- */}
      <Modal
        open={!!newVersion}
        onClose={() => setNewVersion(null)}
        title="Draft New Framework Version"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setNewVersion(null)} disabled={busy}>Cancel</ActionBtn>
            <ActionBtn
              tone="blue"
              onClick={createVersion}
              disabled={busy || !newVersion?.code.trim() || !newVersion?.title.trim()}
            >
              {busy ? "Creating…" : "Create draft"}
            </ActionBtn>
          </>
        }
      >
        {newVersion && (
          <div className="space-y-3">
            <ErrorBanner error={modalError} />
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Levels, sub-frameworks and progression rules are cloned from {framework?.code || "the version in force"}. Edit the draft, then activate it to bring it into force.
            </div>
            <div>
              <label className={labelCls}>Code (e.g. ZM-NQF-2027)</label>
              <input className={inputCls} value={newVersion.code} onChange={(e) => setNewVersion({ ...newVersion, code: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label className={labelCls}>Title</label>
              <input className={inputCls} value={newVersion.title} onChange={(e) => setNewVersion({ ...newVersion, title: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Gazette reference</label>
              <input className={inputCls} value={newVersion.gazetteRef} onChange={(e) => setNewVersion({ ...newVersion, gazetteRef: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <textarea rows={2} className={inputCls} value={newVersion.notes} onChange={(e) => setNewVersion({ ...newVersion, notes: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>

      {/* ---- Set policy ---- */}
      <Modal
        open={!!policyForm}
        onClose={() => setPolicyForm(null)}
        title="Set Policy Value"
        footer={
          <>
            <ActionBtn tone="outline" onClick={() => setPolicyForm(null)} disabled={busy}>Cancel</ActionBtn>
            <ActionBtn tone="blue" onClick={savePolicy} disabled={busy || !policyForm?.key.trim() || !policyForm?.value.trim()}>
              {busy ? "Saving…" : "Set value"}
            </ActionBtn>
          </>
        }
      >
        {policyForm && (
          <div className="space-y-3">
            <ErrorBanner error={modalError} />
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
              Append-only: a new effective-dated record is created; earlier values remain for historical decisions.
            </div>
            <div>
              <label className={labelCls}>Key</label>
              <input
                className={inputCls}
                placeholder="e.g. rpl.max_credit_percent"
                value={policyForm.key}
                onChange={(e) => setPolicyForm({ ...policyForm, key: e.target.value })}
                list="policy-keys"
              />
              <datalist id="policy-keys">
                {policies.map((p) => <option key={p.key} value={p.key} />)}
              </datalist>
            </div>
            <div>
              <label className={labelCls}>Value (number, text or JSON)</label>
              <input className={inputCls} value={policyForm.value} onChange={(e) => setPolicyForm({ ...policyForm, value: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input className={inputCls} value={policyForm.description} onChange={(e) => setPolicyForm({ ...policyForm, description: e.target.value })} />
            </div>
          </div>
        )}
      </Modal>
    </PortalShell>
  );
}
