"use client";

// Shared bits for the HEA regulatory pages (compliance / cases / enforcement).
// Lives inside the hea route segment on purpose — it is HEA-portal-specific.

import { useState } from "react";
import { Modal, ActionBtn } from "../../../components/portal/kit";

export const STATUS_LABEL = { pending: "Under Review", approved: "Approved", suspended: "Suspended" };
export const STATUS_TONE = { pending: "amber", approved: "green", suspended: "red" };
export const SECTOR_LABEL = { higher_ed: "Higher Education", university: "University", college: "College" };

// "institution.accreditation_approved" → "Accreditation approved"
export function humanizeAction(action = "") {
  const verb = action.split(".").pop().replace(/_/g, " ");
  const label = verb.charAt(0).toUpperCase() + verb.slice(1);
  return label.replace(/\bzaqa\b/i, "ZAQA").replace(/\bnqf\b/i, "NQF");
}

export function actionTone(action = "") {
  const a = action.toLowerCase();
  if (/reject|revok|suspend|deregist/.test(a)) return "red";
  if (/approv|register|reinstat|accredit|trust/.test(a)) return "green";
  return "blue";
}

export function lastEvent(inst) {
  const ev = inst.events || [];
  return ev.length ? ev[ev.length - 1] : null;
}

// Suspend / reinstate / re-note dialog around PATCH /api/hea/institutions/:id/status.
export function StatusActionModal({ open, title, description, actionLabel, tone = "red", noteRequired, initialNote = "", busy, onClose, onSubmit }) {
  const [note, setNote] = useState(initialNote);
  const disabled = busy || (noteRequired && !note.trim());
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <ActionBtn tone="outline" onClick={onClose}>Cancel</ActionBtn>
          <ActionBtn tone={tone} disabled={disabled} onClick={() => onSubmit(note.trim())}>
            {busy ? "Working…" : actionLabel}
          </ActionBtn>
        </>
      }
    >
      {description && <p className="mb-3 text-[12.5px] leading-relaxed text-slate-600">{description}</p>}
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
        Note {noteRequired ? <span className="text-red-500">*</span> : "(optional)"}
      </label>
      <textarea
        rows={4}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={300}
        placeholder="Reason recorded on the institution's audit trail…"
        className="w-full rounded-lg border border-slate-200 p-2.5 text-[13px] text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-100"
      />
      <div className="mt-1 text-right text-[11px] text-slate-400">{note.length}/300</div>
    </Modal>
  );
}
