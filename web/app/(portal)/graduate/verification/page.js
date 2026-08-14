"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PortalShell from "../../../../components/portal/shell";
import Icon from "../../../../components/portal/icons";
import {
  Badge, StatCard, StatRow, SectionCard, SelectPill, SearchBox, ToolButton,
  DataTable, Pagination, usePager, ErrorBanner, exportCSV,
} from "../../../../components/portal/kit";
import { usePortalGuard, fmtDateTime } from "../../../../components/portal/auth";
import { api } from "../../../../lib/api";

const shortHash = (h) => (h && h.length > 18 ? `${h.slice(0, 10)}…${h.slice(-6)}` : h || "—");

function resultTone(result) {
  const r = String(result || "").toLowerCase();
  if (/verified|valid|ok|pass/.test(r)) return "green";
  if (/revoked|invalid|fail|not_found|tampered|mismatch/.test(r)) return "red";
  return "amber";
}

const nice = (s) => String(s ?? "—").replace(/_/g, " ");

export default function GraduateVerificationPage() {
  const { ready, token } = usePortalGuard(["holder"]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState("");
  const [mode, setMode] = useState("");
  const [result, setResult] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setEvents((await api.myVerificationActivity(token)).verifications || []);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { if (ready) load(); }, [ready, load]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return {
      total: events.length,
      thisMonth: events.filter((e) => e.at && new Date(e.at).getTime() >= monthStart).length,
      online: events.filter((e) => e.mode === "online").length,
      offline: events.filter((e) => e.mode === "offline").length,
    };
  }, [events]);

  const resultOptions = useMemo(
    () => [...new Set(events.map((e) => String(e.result || "")).filter(Boolean))].map((r) => ({ value: r, label: nice(r) })),
    [events]
  );

  const rows = useMemo(() => {
    return events.filter((e) => {
      if (mode && e.mode !== mode) return false;
      if (result && String(e.result) !== result) return false;
      return !q || `${e.qualification || ""} ${e.credentialHash} ${e.result}`.toLowerCase().includes(q.toLowerCase());
    });
  }, [events, q, mode, result]);

  const pg = usePager(rows, 10, [q, mode, result]);

  const columns = [
    {
      key: "at", label: "When", tdClass: "whitespace-nowrap",
      render: (r) => fmtDateTime(r.at), csv: (r) => r.at || "",
    },
    {
      key: "qualification",
      label: "Credential",
      render: (r) => (
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <Icon name="file" className="h-3.5 w-3.5" />
          </span>
          <span className="block leading-tight">
            <span className="block font-medium text-slate-700">{r.qualification || "—"}</span>
            <span className="block font-mono text-[10.5px] text-slate-400">{shortHash(r.credentialHash)}</span>
          </span>
        </span>
      ),
      csv: (r) => r.qualification || r.credentialHash,
    },
    {
      key: "mode", label: "Mode",
      render: (r) => (
        <Badge tone={r.mode === "offline" ? "purple" : "softblue"} icon={r.mode === "offline" ? "qr" : "link"}>
          {r.mode === "offline" ? "Offline (QR)" : "Online"}
        </Badge>
      ),
      csv: (r) => r.mode || "",
    },
    {
      key: "result", label: "Result",
      render: (r) => <Badge tone={resultTone(r.result)} dot>{nice(r.result)}</Badge>,
      csv: (r) => r.result || "",
    },
    {
      key: "latencyMs", label: "Latency", tdClass: "whitespace-nowrap",
      render: (r) => (r.latencyMs != null ? `${r.latencyMs} ms` : "—"),
      csv: (r) => (r.latencyMs != null ? r.latencyMs : ""),
    },
  ];

  if (!ready) return null;

  return (
    <PortalShell
      portal="graduate"
      active="verification"
      title="Verification Activity"
      subtitle="Every time someone checks one of your credentials — online or by scanning your signed QR — it is recorded here."
      actions={
        <>
          <ToolButton icon="download" onClick={() => exportCSV("verification-activity", columns, rows)}>
            Export CSV
          </ToolButton>
          <ToolButton icon="refresh" aria-label="Refresh" onClick={load} />
        </>
      }
    >
      <ErrorBanner error={error} onRetry={load} />

      <StatRow cols={4}>
        <StatCard icon="shieldCheck" iconTone="softblue" label="Total Verification Checks" value={String(stats.total)} sub="Across all your credentials" />
        <StatCard icon="calendar" iconTone="softgreen" label="This Month" value={String(stats.thisMonth)} sub="Since the 1st" />
        <StatCard icon="link" iconTone="purple" label="Online Checks" value={String(stats.online)} sub="Via the verify page" />
        <StatCard icon="qr" iconTone="amber" label="Offline QR Scans" value={String(stats.offline)} sub="Signed QR verification" />
      </StatRow>

      <SectionCard
        pad="p-0"
        title="Verification Events"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <SelectPill
              label="Mode"
              value={mode}
              onChange={setMode}
              options={[
                { value: "online", label: "Online" },
                { value: "offline", label: "Offline (QR)" },
              ]}
            />
            {resultOptions.length > 0 && (
              <SelectPill label="Result" value={result} onChange={setResult} options={resultOptions} />
            )}
            <SearchBox className="w-56" placeholder="Search events..." value={q} onChange={setQ} />
          </div>
        }
      >
        <DataTable
          rowKey={null}
          loading={loading}
          emptyText="No verification activity yet — checks appear here as soon as someone verifies one of your credentials."
          columns={columns}
          rows={pg.rows}
          footer={<Pagination {...pg.props} className="border-t border-slate-100" />}
        />
      </SectionCard>
    </PortalShell>
  );
}
