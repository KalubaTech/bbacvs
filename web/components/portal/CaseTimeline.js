"use client";

// Renders an append-only `events[]` history (the API's regulatory audit trail)
// as a vertical timeline, including explainable-decision metadata:
// status transitions (from → to), the rule applied, evidence considered,
// responsible officer and NQF policy version.

import { Badge, Timeline } from "./kit";
import { fmtDateTime } from "./auth";

// action suffix → timeline dot state
function stateFor(action = "") {
  const a = action.toLowerCase();
  if (/reject|revok|suspend|dismiss|refus|not_recognised|deregist|withdraw/.test(a)) return "error";
  if (/approv|validat|register|issued|recognis|reinstat|uphold|upheld|accredit|trust/.test(a)) return "done";
  if (/dispute|appeal|suspicious|awaiting/.test(a)) return "warn";
  return "current";
}

// "credential.zaqa_decision" → "ZAQA decision"; "application.status_changed" → "Status changed"
function humanize(action = "") {
  const verb = action.split(".").pop().replace(/_/g, " ");
  const label = verb.charAt(0).toUpperCase() + verb.slice(1);
  return label.replace(/\bzaqa\b/i, "ZAQA").replace(/\bnqf\b/i, "NQF").replace(/\brpl\b/i, "RPL");
}

const nice = (s) => String(s ?? "").replace(/_/g, " ");

export default function CaseTimeline({ events, emptyText = "No history recorded yet." }) {
  const list = Array.isArray(events) ? events : [];
  if (list.length === 0) {
    return <div className="py-4 text-center text-[12.5px] text-slate-400">{emptyText}</div>;
  }
  // newest first for reading; the API appends chronologically
  const items = [...list].reverse().map((e) => ({
    title: humanize(e.action),
    time: fmtDateTime(e.at),
    state: stateFor(e.action),
    sub: (
      <span className="block space-y-1">
        {e.meta?.from && e.meta?.to && (
          <span className="block">
            <Badge tone="slate">{nice(e.meta.from)}</Badge>
            <span className="mx-1.5 text-slate-400">→</span>
            <Badge tone={stateFor(e.action) === "error" ? "red" : stateFor(e.action) === "done" ? "green" : "blue"}>
              {nice(e.meta.to)}
            </Badge>
          </span>
        )}
        {e.note && <span className="block text-slate-600">{e.note}</span>}
        {e.meta?.rule && (
          <span className="block text-[11px] text-slate-500">
            <span className="font-semibold">Rule:</span> {String(e.meta.rule)}
          </span>
        )}
        {e.meta?.evidence && (
          <span className="block text-[11px] text-slate-500">
            <span className="font-semibold">Evidence:</span>{" "}
            {Array.isArray(e.meta.evidence) ? e.meta.evidence.join(", ") : String(e.meta.evidence)}
          </span>
        )}
        {e.meta?.result && (
          <span className="block text-[11px] text-slate-500">
            <span className="font-semibold">Result:</span> {nice(e.meta.result)}
          </span>
        )}
        <span className="block text-[11px] text-slate-400">
          {e.actor && e.actor !== "system" ? `${e.actor} (${e.actorRole || "user"})` : "System"}
          {e.meta?.policyVersion ? ` · Policy ${e.meta.policyVersion}` : ""}
        </span>
      </span>
    ),
  }));
  return <Timeline items={items} />;
}
