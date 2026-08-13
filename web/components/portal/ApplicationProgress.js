"use client";

// Visual case-progress bar for credential digitisation applications:
// shows the current stage, completed actions, and what happens next.

import { WorkflowSteps } from "./kit";

const STAGES = [
  { key: "submitted", label: "Submitted" },
  { key: "screening", label: "Screening" },
  { key: "under_review", label: "Records review" },
  { key: "decision_pending", label: "Decision" },
  { key: "issued", label: "Issued" },
];

const STAGE_INDEX = {
  submitted: 0,
  screening: 1,
  under_review: 2,
  awaiting_evidence: 2, // paused inside review
  decision_pending: 3,
  issued: 4,
  rejected: 3,
  withdrawn: 1,
};

export const NEXT_ACTION = {
  submitted: "Waiting for the institution to begin screening.",
  screening: "The institution is checking your application for completeness.",
  under_review: "The records office is verifying your credential against institutional records.",
  awaiting_evidence: "Action needed: the institution has asked you for more evidence — upload it below.",
  decision_pending: "Verification complete. Awaiting the issuing decision.",
  issued: "Your credential has been issued and forwarded to ZAQA for national validation.",
  rejected: "The application was refused — see the reason in the case history.",
  withdrawn: "You withdrew this application.",
};

export default function ApplicationProgress({ status }) {
  const idx = STAGE_INDEX[status] ?? 0;
  const failed = status === "rejected" || status === "withdrawn";
  const paused = status === "awaiting_evidence";
  const steps = STAGES.map((s, i) => ({
    label: s.label,
    state:
      i < idx ? "done"
      : i === idx
        ? failed ? "error" : paused ? "warn" : status === "issued" ? "done" : "current"
        : "pending",
    sub: i === idx && failed ? (status === "rejected" ? "Refused" : "Withdrawn") : i === idx && paused ? "Evidence needed" : undefined,
  }));
  return (
    <div>
      <WorkflowSteps steps={steps} />
      <p className={`mt-3 rounded-lg px-3 py-2 text-[12.5px] ${
        paused ? "bg-amber-50 text-amber-800" : failed ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-600"
      }`}>
        {NEXT_ACTION[status] || "—"}
      </p>
    </div>
  );
}
