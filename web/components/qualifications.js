"use client";

// NQF qualification-registration workflow UI (spec §7) — shared across portals.
// Manual chain: institution proposes → appropriate authority (HEA / TEVETA / ECZ) recommends →
// ZAQA takes the national registration decision and assigns the reference ID.
import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { getToken } from "../lib/auth";
import { Button, Field, Alert } from "./ui";

const SUBFRAMEWORK_LABEL = { higher_ed: "Higher Education", tevet: "TEVET", general: "General Education" };

const statusBadge = (s) =>
  s === "registered" ? "badge-green"
  : s === "rejected" ? "badge-red"
  : "badge-amber";

function QualificationMeta({ q }) {
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
      <span>NQF Level {q.nqfLevel}</span>
      <span>{SUBFRAMEWORK_LABEL[q.subFramework] || q.subFramework}</span>
      {q.creditValue ? <span>{q.creditValue} credits</span> : null}
      <span>{q.awardingBody}</span>
      {q.referenceId && <span className="font-medium text-slate-700">{q.referenceId}</span>}
    </div>
  );
}

// ---- institution side: propose + track --------------------------------------
export function ProposeQualification() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({
    title: "", nqfLevel: "7", qualificationType: "full", fieldOfEducation: "",
    purpose: "", learningOutcomes: "", minEntryRequirements: "", creditValue: "",
  });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try { setRows((await api.myQualifications(getToken())).qualifications); }
    catch { /* institution may not have proposals yet */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submit(e) {
    e.preventDefault();
    setMsg(null); setErr(null); setBusy(true);
    try {
      const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
      await api.proposeQualification(getToken(), {
        title: form.title,
        nqfLevel: Number(form.nqfLevel),
        qualificationType: form.qualificationType,
        fieldOfEducation: form.fieldOfEducation,
        purpose: form.purpose,
        learningOutcomes: lines(form.learningOutcomes),
        minEntryRequirements: lines(form.minEntryRequirements),
        ...(form.creditValue ? { creditValue: Number(form.creditValue) } : {}),
      });
      setMsg("Proposal submitted to your sub-framework authority for review.");
      setForm({ title: "", nqfLevel: "7", qualificationType: "full", fieldOfEducation: "", purpose: "", learningOutcomes: "", minEntryRequirements: "", creditValue: "" });
      load();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <section className="mt-8">
      <div className="grid gap-6 lg:grid-cols-5">
        <form onSubmit={submit} className="card-pad space-y-3 lg:col-span-3">
          <h2 className="font-semibold text-slate-900">Register a qualification on the national NQF register</h2>
          <p className="text-xs text-slate-400">
            Reviewed manually by your sub-framework authority (HEA / TEVETA / ECZ), then registered by ZAQA.
            The registered NQF level — not the proposed one — is inherited by your programmes and credentials.
          </p>
          <Field label="Qualification title" required value={form.title} onChange={set("title")} placeholder="Bachelor of Information and Communication Technology" />
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="label">Proposed NQF level</span>
              <select className="input" value={form.nqfLevel} onChange={set("nqfLevel")}>
                {Array.from({ length: 10 }, (_, i) => i + 1).map((l) => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="label">Type</span>
              <select className="input" value={form.qualificationType} onChange={set("qualificationType")}>
                <option value="full">Full qualification</option>
                <option value="part">Part qualification</option>
                <option value="micro_credential">Micro-credential</option>
              </select>
            </label>
            <Field label="Credit value" type="number" min="1" value={form.creditValue} onChange={set("creditValue")} placeholder="480" />
          </div>
          <Field label="Field of education" value={form.fieldOfEducation} onChange={set("fieldOfEducation")} placeholder="Information and Communication Technology" />
          <label className="block">
            <span className="label">Purpose</span>
            <textarea className="input" rows={2} value={form.purpose} onChange={set("purpose")} placeholder="What the qualification prepares graduates for" />
          </label>
          <label className="block">
            <span className="label">Learning outcomes (one per line)</span>
            <textarea className="input" rows={3} value={form.learningOutcomes} onChange={set("learningOutcomes")} placeholder={"Design and implement software systems\nApply research methods to ICT problems"} />
          </label>
          <label className="block">
            <span className="label">Minimum entry requirements (one per line)</span>
            <textarea className="input" rows={2} value={form.minEntryRequirements} onChange={set("minEntryRequirements")} placeholder="Grade 12 certificate with credits in Mathematics and English" />
          </label>
          {msg && <Alert kind="success">{msg}</Alert>}
          {err && <Alert>{err}</Alert>}
          <Button type="submit" loading={busy}>Submit for authority review</Button>
        </form>

        <div className="card-pad lg:col-span-2">
          <h2 className="mb-3 font-semibold text-slate-900">My qualification submissions</h2>
          <div className="space-y-3">
            {rows.map((q) => (
              <div key={q.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="text-sm font-medium text-slate-800">{q.title}</div>
                  <span className={statusBadge(q.status)}>{q.status.replace(/_/g, " ")}</span>
                </div>
                <QualificationMeta q={q} />
                {q.events?.length > 0 && (
                  <div className="mt-1.5 text-[11px] text-slate-400">
                    Latest: {q.events[q.events.length - 1].action} — {q.events[q.events.length - 1].note}
                  </div>
                )}
              </div>
            ))}
            {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No submissions yet.</p>}
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- authority / ZAQA side: review queue ------------------------------------
// mode "authority" → recommend/reject (HEA, TEVETA, ECZ).
// mode "zaqa"      → register (national decision, may correct the level) / reject.
export function QualificationQueue({ mode = "authority" }) {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.qualificationInbox(getToken())).qualifications); }
    catch (e) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id, fn) {
    setBusy(id); setErr(null);
    try { await fn(); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }
  const recommend = (q) => act(q.id, () => api.recommendQualification(getToken(), q.id, ""));
  const reject = (q) => {
    const reason = prompt("Reason for rejection (sent to the institution):");
    if (!reason) return;
    act(q.id, () => api.rejectQualification(getToken(), q.id, reason));
  };
  const register = (q) => {
    const lvl = prompt(`Confirm NQF level for national registration (proposed: ${q.nqfLevel}):`, String(q.nqfLevel));
    if (lvl === null) return;
    act(q.id, () => api.registerQualification(getToken(), q.id, { nqfLevel: Number(lvl) }));
  };

  // ZAQA acts on recommended (under_review) proposals; authorities on newly submitted ones.
  const actionable = (q) => (mode === "zaqa" ? q.status === "under_review" : q.status === "submitted");

  return (
    <section className="card-pad mt-8">
      <h2 className="font-semibold text-slate-900">
        {mode === "zaqa" ? "National registration decisions (NQF register)" : "Qualification proposals for review"}
      </h2>
      <p className="mb-3 text-xs text-slate-400">
        {mode === "zaqa"
          ? "Proposals recommended by the appropriate authority. Registering assigns the national reference ID, fixes the NQF level and anchors the registration fingerprint."
          : "Course/programme designs proposed by your institutions. Recommending forwards them to ZAQA for the national registration decision."}
      </p>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <div className="space-y-3">
        {rows.map((q) => (
          <div key={q.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-800">{q.title}</div>
                <QualificationMeta q={q} />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={statusBadge(q.status)}>{q.status.replace(/_/g, " ")}</span>
                <button className="btn-ghost btn-sm" onClick={() => setOpenId(openId === q.id ? null : q.id)}>
                  {openId === q.id ? "Hide details" : "Details"}
                </button>
                {actionable(q) && mode === "authority" && (
                  <Button size="sm" onClick={() => recommend(q)} loading={busy === q.id}>Recommend to ZAQA</Button>
                )}
                {actionable(q) && mode === "zaqa" && (
                  <Button size="sm" onClick={() => register(q)} loading={busy === q.id}>Register nationally</Button>
                )}
                {actionable(q) && (
                  <Button size="sm" variant="danger" onClick={() => reject(q)} loading={busy === q.id}>Reject</Button>
                )}
              </div>
            </div>
            {openId === q.id && (
              <dl className="mt-3 grid gap-2 border-t border-slate-100 pt-3 text-xs text-slate-600 sm:grid-cols-2">
                <div><dt className="font-semibold text-slate-500">Purpose</dt><dd>{q.purpose || "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Field</dt><dd>{q.fieldOfEducation || "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Learning outcomes</dt>
                  <dd>{(q.learningOutcomes || []).length ? <ul className="list-disc pl-4">{q.learningOutcomes.map((o, i) => <li key={i}>{o}</li>)}</ul> : "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Entry requirements</dt>
                  <dd>{(q.minEntryRequirements || []).length ? <ul className="list-disc pl-4">{q.minEntryRequirements.map((o, i) => <li key={i}>{o}</li>)}</ul> : "—"}</dd></div>
                <div><dt className="font-semibold text-slate-500">Framework version</dt><dd>{q.frameworkVersion}</dd></div>
                <div><dt className="font-semibold text-slate-500">Notional hours / credits</dt><dd>{q.notionalHours || "—"} / {q.creditValue || "—"}</dd></div>
              </dl>
            )}
          </div>
        ))}
        {rows.length === 0 && <p className="py-4 text-center text-sm text-slate-400">No proposals waiting.</p>}
      </div>
    </section>
  );
}
