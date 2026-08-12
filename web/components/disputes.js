"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { getToken } from "../lib/auth";
import { Alert } from "./ui";

export const DISPUTE_CATEGORIES = [
  { key: "award_details", label: "My details / award data (handled by the institution)" },
  { key: "ecz_result", label: "Examination result or marks (handled by ECZ)" },
  { key: "programme_accreditation", label: "Programme accreditation (handled by HEA)" },
  { key: "institution_compliance", label: "Institution compliance (handled by HEA)" },
  { key: "zqf_level", label: "ZQF level / national recognition (handled by ZAQA)" },
  { key: "other", label: "Other (handled by ZAQA)" },
];

// Prompt-driven dispute opener shared by the graduate portal.
export async function promptDispute(credentialHash, onDone) {
  const menu = DISPUTE_CATEGORIES.map((c, i) => `${i + 1}. ${c.label}`).join("\n");
  const pick = prompt(`What is the dispute about?\n${menu}\n\nEnter a number (1-${DISPUTE_CATEGORIES.length}):`);
  if (!pick) return;
  const cat = DISPUTE_CATEGORIES[parseInt(pick, 10) - 1];
  if (!cat) { alert("Invalid choice."); return; }
  const description = prompt("Describe the issue:");
  if (!description) return;
  try {
    await api.openDispute(getToken(), { credentialHash, category: cat.key, description });
    alert("Dispute opened. It has been routed to the responsible authority.");
    onDone?.();
  } catch (e) { alert(e.message); }
}

const CAT_LABEL = Object.fromEntries(DISPUTE_CATEGORIES.map((c) => [c.key, c.label.split(" (")[0]]));

// Authority-side dispute queue: shows only cases routed to the signed-in authority.
export function DisputeQueue({ title = "Disputes routed to you" }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try { setRows((await api.disputeQueue(getToken())).disputes); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resolve(id) {
    const resolution = prompt("Resolution / decision:");
    if (!resolution) return;
    setBusy(id);
    try { await api.resolveDispute(getToken(), id, resolution); load(); }
    catch (e) { setError(e.message); }
    finally { setBusy(null); }
  }

  const open = rows.filter((d) => d.status === "open");

  return (
    <div className="card-pad mt-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-slate-900">{title}</h2>
        {open.length > 0 && <span className="badge-red">{open.length} open</span>}
      </div>
      {error && <div className="mb-3"><Alert>{error}</Alert></div>}
      <div className="space-y-3">
        {rows.map((d) => (
          <div key={d.id} className="rounded-lg border border-slate-100 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-slate-900">{d.subjectName || "—"} · {d.institution || "—"}</div>
                <div className="text-sm text-slate-600">“{d.description}”</div>
                <div className="mt-1 text-xs text-slate-400">{CAT_LABEL[d.category] || d.category} · opened by {d.openedBy}</div>
                {d.resolution && <div className="mt-1 text-xs text-emerald-700">Resolution: {d.resolution}</div>}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={d.status === "open" ? "badge-amber" : "badge-green"}>{d.status}</span>
                {d.status === "open" && (
                  <button onClick={() => resolve(d.id)} disabled={busy === d.id}
                    className="text-xs font-medium text-brand hover:underline disabled:opacity-50">resolve</button>
                )}
              </div>
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="py-6 text-center text-sm text-slate-400">No disputes routed to you.</p>}
      </div>
    </div>
  );
}
