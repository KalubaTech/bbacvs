// Append-only history helper. Every regulatory state change pushes an event —
// records are versioned forward, never rewritten (spec: preserve historical
// records through amendments/suspensions/revocations instead of overwriting).
//
// Convention for `action` strings: "<entity>.<verb>" in past tense where
// natural, e.g. "credential.suspended", "application.status_changed",
// "dispute.appealed", "institution.accreditation_approved".
//
// Convention for `meta`: structured decision context —
//   { from, to }               – status transition
//   { rule, evidence, result } – explainable decision components
//   { policyVersion }          – NQF framework version applied
//   { officer }                – responsible officer (also in `actor`)

/** Build an event entry from the authenticated request. */
export function makeEvent(req, action, note, meta) {
  return {
    at: new Date(),
    actor: req?.user?.email || "system",
    actorRole: req?.user?.role || "system",
    action,
    note: note || undefined,
    meta: meta || undefined,
  };
}

/** Push an event onto a document's `events` array (caller saves). */
export function pushEvent(doc, req, action, note, meta) {
  if (!Array.isArray(doc.events)) doc.events = [];
  doc.events.push(makeEvent(req, action, note, meta));
  return doc;
}
