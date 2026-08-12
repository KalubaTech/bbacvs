"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { getToken, getUser } from "../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../components/ui";
import { TeamCard, ActivityCard } from "../../../components/manage";
import { Badge, StatCard, StatRow, SectionCard, Avatar } from "../../../components/portal/kit";

const shieldIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3l7 3v6c0 4.5-3 8.5-7 9.7C8 20.5 5 16.5 5 12V6l7-3z" /><path d="M9 12l2 2 4-4" />
  </svg>
);

export default function AdminPage() {
  const router = useRouter();
  const [issuers, setIssuers] = useState([]);
  const [form, setForm] = useState({ institution: "", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const load = useCallback(async () => {
    try { setIssuers((await api.listIssuers(getToken())).issuers); }
    catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    const u = getUser();
    if (!u || u.role !== "admin") { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function onRegister(e) {
    e.preventDefault();
    setError(null); setResult(null); setLoading(true);
    try {
      const res = await api.createIssuer(getToken(), form);
      setResult(res);
      setForm({ institution: "", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "" });
      load();
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const onChainCount = issuers.filter((i) => i.onChain).length;

  return (
    <div>
      <PageHeader
        icon={shieldIcon}
        title="Platform administration"
      />

      <StatRow cols={3}>
        <StatCard icon="bank" iconTone="softblue" label="Registered institutions" value={issuers.length} />
        <StatCard icon="shieldCheck" iconTone="softgreen" label="Authorised on-chain" value={onChainCount} />
        <StatCard icon="clock" iconTone="amber" label="Pending authorisation" value={issuers.length - onChainCount} />
      </StatRow>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Register form */}
        <SectionCard title="Register new issuer" className="self-start lg:col-span-2">
          <form onSubmit={onRegister} className="space-y-4">
            <Field label="Institution name" value={form.institution} onChange={set("institution")} required placeholder="Mulungushi University" />
            <Field label="Issuing officer name" value={form.officerName} onChange={set("officerName")} required placeholder="Jane Banda" />
            <Field label="Officer login email" type="email" value={form.officerEmail} onChange={set("officerEmail")} required placeholder="registrar@mu.zm" />
            <Field label="Officer password" type="password" value={form.officerPassword} onChange={set("officerPassword")} required placeholder="min 8 characters" />
            <Field label="Institution MetaMask address (optional)" value={form.metamaskAddress} onChange={set("metamaskAddress")}
              placeholder="0x… — leave blank for server-signed"
              hint="If set, the institution signs its own anchoring transactions in MetaMask (this address gets ISSUER_ROLE)." />
            {error && <Alert>{error}</Alert>}
            <Button type="submit" loading={loading} className="w-full">
              {loading ? "Registering on-chain…" : "Register issuer"}
            </Button>
            {result && (
              <Alert kind="success">
                <div className="font-semibold">✓ {result.issuer.institution} registered</div>
                <div className="mt-1 text-xs">officer {result.officer.email}</div>
              </Alert>
            )}
          </form>
        </SectionCard>

        {/* Registry */}
        <SectionCard
          title="Issuer registry"
          action={<Badge tone="slate">{issuers.length} institutions</Badge>}
          className="self-start lg:col-span-3"
        >
          <div className="space-y-2.5">
            {issuers.map((i) => (
              <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 px-3 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <Avatar name={i.institution} />
                  <div className="truncate text-[13px] font-semibold text-slate-800">{i.institution}</div>
                </div>
                <Badge tone={i.onChain ? "green" : "amber"} dot>
                  {i.onChain ? "Authorised" : "Pending"}
                </Badge>
              </div>
            ))}
            {issuers.length === 0 && (
              <p className="py-8 text-center text-[13px] text-slate-400">No issuers registered yet.</p>
            )}
          </div>
        </SectionCard>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <TeamCard />
        <ActivityCard title="System activity — who changed what" />
      </div>
    </div>
  );
}
