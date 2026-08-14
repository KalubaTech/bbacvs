"use client";

// NQF knowledge base — rendered entirely from the live framework store:
// current version (nqfCurrentFramework), its levels + descriptors + sub-frameworks
// (/api/nqf/frameworks/:code) and the effective-dated policy values (/api/nqf/policies).

import { useCallback, useEffect, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import {
  Badge, StatCard, StatRow, SectionCard, ToolButton, DataTable, ErrorBanner,
  KVGrid, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDate } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

const LEVEL_CLS = [
  "bg-amber-500", "bg-lime-600", "bg-green-600", "bg-emerald-600", "bg-teal-600",
  "bg-sky-600", "bg-blue-600", "bg-indigo-600", "bg-violet-600", "bg-purple-600",
];

const SUB_TONE = { general: "blue", tevet: "teal", higher_ed: "purple" };

const EXPORT_COLUMNS = [
  { key: "level", label: "Level" },
  { key: "title", label: "Title" },
  { key: "knowledge", label: "Knowledge", csv: (l) => l.descriptors?.knowledge || "" },
  { key: "skills", label: "Skills", csv: (l) => l.descriptors?.skills || "" },
  {
    key: "autonomy", label: "Autonomy & Responsibility",
    csv: (l) => l.descriptors?.autonomyResponsibility || "",
  },
  {
    key: "typical", label: "Typical Qualifications",
    csv: (l) => (l.typicalQualifications || []).join("; "),
  },
];

export default function ZaqaNqfPage() {
  const { ready, token } = usePortalGuard(["zaqa"]);
  const [framework, setFramework] = useState(null); // current NQFVersion
  const [versionsCount, setVersionsCount] = useState(null);
  const [levels, setLevels] = useState([]);
  const [subFrameworks, setSubFrameworks] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [policiesError, setPoliciesError] = useState(null);
  const [selLevel, setSelLevel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPoliciesError(null);
    try {
      const [cur, all] = await Promise.all([api.nqfCurrentFramework(), api.nqfFrameworks()]);
      const fw = cur.framework;
      setFramework(fw);
      setVersionsCount((all.frameworks || []).length);
      if (fw?.code) {
        const res = await fetch(`${BASE}/api/nqf/frameworks/${encodeURIComponent(fw.code)}`);
        if (res.ok) {
          const full = await res.json();
          const lv = (full.levels || []).sort((a, b) => b.level - a.level); // 10 → 1 ladder
          setLevels(lv);
          setSubFrameworks(full.subFrameworks || []);
          setSelLevel((s) => s ?? lv[0]?.level ?? null);
        }
      }
      // Policies are governance-gated; the shared client has no method for them,
      // so fetch directly with the bearer token. Failure here shouldn't hide the framework.
      try {
        const pres = await fetch(`${BASE}/api/nqf/policies`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!pres.ok) throw new Error("Could not load policy values");
        setPolicies((await pres.json()).policies || []);
      } catch (perr) {
        setPoliciesError(perr.message);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return null;

  const selected = levels.find((l) => l.level === selLevel) || null;

  return (
    <PortalShell
      portal="zaqa"
      active="nqf"
      title="NQF Framework"
      subtitle="The national framework in force: versions, level descriptors, sub-frameworks and effective-dated policy values."
      actions={
        <ToolButton
          icon="download"
          onClick={() => exportCSV(`nqf-${framework?.code || "framework"}-levels`, EXPORT_COLUMNS, [...levels].sort((a, b) => a.level - b.level))}
          disabled={levels.length === 0}
          className="disabled:opacity-50"
        >
          Export Framework
        </ToolButton>
      }
    >
      <ErrorBanner error={error} onRetry={load} />

      {/* Current framework version, prominently */}
      <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        {framework ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-2xl font-extrabold tracking-tight text-slate-900">{framework.code}</span>
                <Badge tone={framework.status === "active" ? "green" : "slate"} dot>
                  {framework.status === "active" ? "In force" : framework.status}
                </Badge>
              </div>
              <div className="mt-1 text-[13px] text-slate-600">{framework.title}</div>
              {framework.notes && <div className="mt-1 max-w-2xl text-[12px] text-slate-400">{framework.notes}</div>}
            </div>
            <KVGrid
              cols={3}
              className="min-w-[280px]"
              items={[
                { label: "Gazette reference", value: framework.gazetteRef || "—" },
                { label: "Effective from", value: fmtDate(framework.effectiveFrom) },
                { label: "Framework versions", value: versionsCount ?? "—" },
              ]}
            />
          </div>
        ) : (
          <div className="py-4 text-center text-[13px] text-slate-400">
            {loading ? "Loading the framework in force…" : "No framework version configured."}
          </div>
        )}
      </div>

      <StatRow cols={4}>
        <StatCard icon="layers" iconTone="softblue" label="Framework Versions" value={loading ? "…" : String(versionsCount ?? 0)} sub="Effective-dated editions" />
        <StatCard icon="scale" iconTone="softgreen" label="Levels Defined" value={loading ? "…" : `${levels.length}/10`} sub={framework ? `Under ${framework.code}` : ""} />
        <StatCard icon="map" iconTone="purple" label="Sub-frameworks" value={loading ? "…" : String(subFrameworks.length)} sub="General · TEVET · Higher ed" />
        <StatCard icon="book" iconTone="amber" label="Policy Values" value={loading ? "…" : String(policies.length)} sub="Effective-dated policy keys" />
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
              {loading ? "Loading levels…" : "No level descriptors found for this framework."}
            </div>
          )}
        </SectionCard>

        {/* Selected level descriptors */}
        <SectionCard
          title={selected ? selected.title : "Level Descriptors"}
          pad="p-4"
          action={selected && framework && <Badge tone="softblue">{framework.code} · Level {selected.level}</Badge>}
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
            <div className="py-10 text-center text-[13px] text-slate-400">Select a level to read its descriptors.</div>
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
            {loading ? "Loading…" : "No sub-frameworks defined for this version."}
          </div>
        )}
      </SectionCard>

      {/* Effective-dated policy values */}
      <SectionCard title="Policy Values (effective today)" pad="p-0">
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
    </PortalShell>
  );
}
