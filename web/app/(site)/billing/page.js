"use client";

// Billing portal — Invoices & quotations, Payments, Receipts.
// Graduates and institutions see documents billed to them and can declare payments;
// institutions and ZAQA also raise invoices (institutions collect validation fees from
// graduates on behalf of ZAQA) and confirm declared payments, which issues the receipt.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api, openBlob } from "../../../lib/api";
import { getToken, getUser } from "../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../components/ui";
import { Badge, SectionCard } from "../../../components/portal/kit";

const billIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 3h14v18l-2-1.5L15 21l-2-1.5L11 21l-2-1.5L7 21l-2-1.5V3z" />
    <path d="M9 8h6M9 12h6" />
  </svg>
);

const BILLERS = ["issuer", "zaqa", "admin"];
const money = (n) => `K${Number(n || 0).toLocaleString()}`;
const when = (d) => new Date(d).toLocaleDateString();

function StatusBadge({ status }) {
  const tone =
    status === "paid" || status === "confirmed" ? "green"
    : status === "cancelled" || status === "rejected" ? "red"
    : status === "quotation" || status === "draft" || status === "converted" ? "slate"
    : "amber";
  return <Badge tone={tone} dot>{status}</Badge>;
}

const TH = "px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500";
const TD = "px-3.5 py-3 text-[13px] text-slate-600";

function TableShell({ children, minWidth, empty, showEmpty }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className={`w-full ${minWidth} border-collapse text-left`}>{children}</table>
      {showEmpty && <p className="py-6 text-center text-[13px] text-slate-400">{empty}</p>}
    </div>
  );
}

// ---- raise an invoice / quotation (billers) ---------------------------------
function CreateInvoice({ onCreated }) {
  const [fees, setFees] = useState([]);
  const [form, setForm] = useState({ kind: "invoice", billedToEmail: "", description: "", amount: "" });
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.feeSchedule().then((d) => setFees(d.fees)).catch(() => {}); }, []);

  function preset(f) {
    setForm((s) => ({ ...s, description: `Qualification validation fee — ${f.qualification}`, amount: String(f.amount) }));
  }

  async function submit(e) {
    e.preventDefault();
    setMsg(null); setErr(null); setBusy(true);
    try {
      const { invoice } = await api.createInvoice(getToken(), {
        kind: form.kind,
        billedToEmail: form.billedToEmail,
        lines: [{ description: form.description, qty: 1, unitAmount: Number(form.amount) }],
      });
      setMsg(`${invoice.kind === "quotation" ? "Quotation" : "Invoice"} ${invoice.number} raised for ${money(invoice.total)}.`);
      setForm({ kind: "invoice", billedToEmail: "", description: "", amount: "" });
      onCreated();
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  }

  return (
    <SectionCard title="Raise an invoice or quotation">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-slate-400">
          Validation fees are collected from graduates on behalf of ZAQA per the published fee schedule.
        </p>
        {fees.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {fees.map((f) => (
              <button key={f.code} type="button" onClick={() => preset(f)}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[12.5px] font-medium text-slate-600 transition hover:bg-slate-50">
                {f.qualification} — {money(f.amount)}
              </button>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label">Document type</span>
            <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="invoice">Invoice</option>
              <option value="quotation">Quotation</option>
            </select>
          </label>
          <Field label="Billed to (account email)" type="email" required value={form.billedToEmail}
            onChange={(e) => setForm({ ...form, billedToEmail: e.target.value })} placeholder="graduate@example.com" />
          <Field label="Description" required value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Qualification validation fee — Degree" />
          <Field label="Amount (ZMW)" type="number" min="0" step="0.01" required value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="500" />
        </div>
        {msg && <Alert kind="success">{msg}</Alert>}
        {err && <Alert>{err}</Alert>}
        <Button type="submit" loading={busy}>Raise {form.kind}</Button>
      </form>
    </SectionCard>
  );
}

// ---- invoices & quotations tab ----------------------------------------------
function InvoicesTab({ user, reloadKey, onChanged }) {
  const isBiller = BILLERS.includes(user.role);
  const [mine, setMine] = useState([]);
  const [issued, setIssued] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const t = getToken();
      setMine((await api.myInvoices(t)).invoices);
      if (isBiller) setIssued((await api.issuedInvoices(t)).invoices);
    } catch (e) { setErr(e.message); }
  }, [isBiller]);
  useEffect(() => { load(); }, [load, reloadKey]);

  async function act(fn, id) {
    setBusy(id); setErr(null);
    try { await fn(getToken(), id); await load(); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  async function declarePayment(inv) {
    const method = window.prompt("Payment method: cash, mobile_money, bank_transfer, card or other", "mobile_money");
    if (!method) return;
    const reference = window.prompt("Transaction / deposit reference (optional)", "") || "";
    setBusy(inv.id); setErr(null);
    try { await api.payInvoice(getToken(), inv.id, method.trim(), reference.trim()); await load(); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const Table = ({ rows, own }) => (
    <TableShell minWidth="min-w-[640px]" empty="Nothing here yet." showEmpty={rows.length === 0}>
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/60">
          <th className={TH}>Number</th>
          <th className={TH}>{own ? "From" : "Billed to"}</th>
          <th className={TH}>Description</th>
          <th className={TH}>Total</th>
          <th className={TH}>Status</th>
          <th className={TH}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id} className="border-b border-slate-100 align-top transition last:border-0 hover:bg-slate-50/70">
            <td className={`${TD} font-semibold text-slate-800`}>
              {i.number}
              <div className="text-[11px] font-normal text-slate-400">{i.kind} · {when(i.createdAt)}</div>
            </td>
            <td className={TD}>{own ? i.issuedByOrg : `${i.billedToName || ""} (${i.billedToEmail})`}</td>
            <td className={TD}>{i.lines.map((l) => l.description).join("; ")}</td>
            <td className={`${TD} font-semibold text-slate-800`}>{money(i.total)}</td>
            <td className={TD}><StatusBadge status={i.status} /></td>
            <td className={TD}>
              <div className="flex flex-wrap gap-1.5">
                {own && i.kind === "invoice" && i.status === "issued" && (
                  <Button size="sm" onClick={() => declarePayment(i)} loading={busy === i.id}>Pay / declare payment</Button>
                )}
                {!own && i.kind === "quotation" && i.status === "issued" && (
                  <Button size="sm" variant="secondary" onClick={() => act(api.convertQuotation, i.id)} loading={busy === i.id}>Convert to invoice</Button>
                )}
                {!own && i.status === "issued" && (
                  <Button size="sm" variant="danger" onClick={() => act(api.cancelInvoice, i.id)} loading={busy === i.id}>Cancel</Button>
                )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );

  return (
    <div className="space-y-6">
      {err && <Alert>{err}</Alert>}
      {isBiller && <CreateInvoice onCreated={() => { load(); onChanged(); }} />}
      <SectionCard title="Billed to me" action={<Badge tone="slate">{mine.length}</Badge>}>
        <Table rows={mine} own />
      </SectionCard>
      {isBiller && (
        <SectionCard
          title={`Raised by ${user.role === "issuer" ? "my institution" : "ZAQA"}`}
          action={<Badge tone="slate">{issued.length}</Badge>}
        >
          <Table rows={issued} own={false} />
        </SectionCard>
      )}
    </div>
  );
}

// ---- payments tab -----------------------------------------------------------
function PaymentsTab({ user, reloadKey, onChanged }) {
  const isBiller = BILLERS.includes(user.role);
  const [mine, setMine] = useState([]);
  const [received, setReceived] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    try {
      const t = getToken();
      setMine((await api.myPayments(t)).payments);
      if (isBiller) setReceived((await api.receivedPayments(t)).payments);
    } catch (e) { setErr(e.message); }
  }, [isBiller]);
  useEffect(() => { load(); }, [load, reloadKey]);

  async function confirm(id) {
    setBusy(id); setErr(null);
    try { await api.confirmPayment(getToken(), id); await load(); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }
  async function reject(id) {
    const note = window.prompt("Reason for not confirming this payment (shown to the payer):", "");
    if (note === null) return;
    setBusy(id); setErr(null);
    try { await api.rejectPayment(getToken(), id, note); await load(); onChanged(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const Table = ({ rows, actions }) => (
    <TableShell minWidth="min-w-[560px]" empty="No payments yet." showEmpty={rows.length === 0}>
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/60">
          <th className={TH}>Payment</th>
          <th className={TH}>Invoice</th>
          <th className={TH}>Amount</th>
          <th className={TH}>Method / reference</th>
          <th className={TH}>Status</th>
          {actions && <th className={TH}>Actions</th>}
        </tr>
      </thead>
      <tbody>
        {rows.map((p) => (
          <tr key={p.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/70">
            <td className={`${TD} font-semibold text-slate-800`}>
              {p.number}
              <div className="text-[11px] font-normal text-slate-400">{when(p.createdAt)}{p.declaredByEmail ? ` · ${p.declaredByEmail}` : ""}</div>
            </td>
            <td className={TD}>{p.invoiceNumber}</td>
            <td className={`${TD} font-semibold text-slate-800`}>{money(p.amount)}</td>
            <td className={TD}>{p.method?.replace(/_/g, " ")}{p.reference ? ` · ${p.reference}` : ""}</td>
            <td className={TD}>
              <StatusBadge status={p.status} />
              {p.status === "rejected" && p.decisionNote && (
                <div className="mt-0.5 text-[11px] text-red-600">{p.decisionNote}</div>
              )}
            </td>
            {actions && (
              <td className={TD}>
                {p.status === "pending" && (
                  <div className="flex gap-1.5">
                    <Button size="sm" onClick={() => confirm(p.id)} loading={busy === p.id}>Confirm</Button>
                    <Button size="sm" variant="danger" onClick={() => reject(p.id)} loading={busy === p.id}>Reject</Button>
                  </div>
                )}
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </TableShell>
  );

  return (
    <div className="space-y-6">
      {err && <Alert>{err}</Alert>}
      <SectionCard title="Payments I declared" action={<Badge tone="slate">{mine.length}</Badge>}>
        <Table rows={mine} actions={false} />
      </SectionCard>
      {isBiller && (
        <SectionCard title="Payments awaiting my confirmation" action={<Badge tone="slate">{received.length}</Badge>}>
          <p className="mb-3 text-xs text-slate-400">Confirming a payment marks the invoice paid and issues the official receipt.</p>
          <Table rows={received} actions />
        </SectionCard>
      )}
    </div>
  );
}

// ---- receipts tab -----------------------------------------------------------
function ReceiptsTab({ user, reloadKey }) {
  const isBiller = BILLERS.includes(user.role);
  const [mine, setMine] = useState([]);
  const [issued, setIssued] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const t = getToken();
        setMine((await api.myReceipts(t)).receipts);
        if (isBiller) setIssued((await api.issuedReceipts(t)).receipts);
      } catch (e) { setErr(e.message); }
    })();
  }, [isBiller, reloadKey]);

  async function download(r) {
    setBusy(r.id); setErr(null);
    try { openBlob(await api.receiptPDF(getToken(), r.id), `${r.number}.pdf`); }
    catch (e) { setErr(e.message); }
    finally { setBusy(null); }
  }

  const Table = ({ rows }) => (
    <TableShell minWidth="min-w-[560px]" empty="No receipts yet." showEmpty={rows.length === 0}>
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50/60">
          <th className={TH}>Receipt</th>
          <th className={TH}>Invoice</th>
          <th className={TH}>Paid by</th>
          <th className={TH}>Amount</th>
          <th className={TH}>Download</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/70">
            <td className={`${TD} font-semibold text-slate-800`}>
              {r.number}
              <div className="text-[11px] font-normal text-slate-400">{when(r.createdAt)} · {r.issuedByOrg}</div>
            </td>
            <td className={TD}>{r.invoiceNumber}</td>
            <td className={TD}>{r.paidByName || r.paidByEmail}</td>
            <td className={`${TD} font-semibold text-slate-800`}>{money(r.amount)}</td>
            <td className={TD}>
              <Button size="sm" variant="secondary" onClick={() => download(r)} loading={busy === r.id}>PDF</Button>
            </td>
          </tr>
        ))}
      </tbody>
    </TableShell>
  );

  return (
    <div className="space-y-6">
      {err && <Alert>{err}</Alert>}
      <SectionCard title="My receipts" action={<Badge tone="slate">{mine.length}</Badge>}>
        <Table rows={mine} />
      </SectionCard>
      {isBiller && (
        <SectionCard
          title={`Receipts issued by ${user.role === "issuer" ? "my institution" : "ZAQA"}`}
          action={<Badge tone="slate">{issued.length}</Badge>}
        >
          <Table rows={issued} />
        </SectionCard>
      )}
    </div>
  );
}

export default function BillingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("invoices");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.push("/login"); return; }
    setUser(u);
  }, [router]);

  if (!user) return null;
  const bump = () => setReloadKey((k) => k + 1);

  const TABS = [
    { id: "invoices", label: "Invoices & quotations" },
    { id: "payments", label: "Payments" },
    { id: "receipts", label: "Receipts" },
  ];

  return (
    <div>
      <PageHeader
        icon={billIcon}
        title="Billing"
        subtitle="Invoices & quotations, payments and receipts — validation fees per the published ZAQA fee schedule."
      />
      <div className="mb-5 flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2 text-[13px] transition ${
              tab === t.id
                ? "border-[#0d1b3a] font-semibold text-[#0d1b3a]"
                : "border-transparent font-medium text-slate-500 hover:text-slate-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "invoices" && <InvoicesTab user={user} reloadKey={reloadKey} onChanged={bump} />}
      {tab === "payments" && <PaymentsTab user={user} reloadKey={reloadKey} onChanged={bump} />}
      {tab === "receipts" && <ReceiptsTab user={user} reloadKey={reloadKey} />}
    </div>
  );
}
