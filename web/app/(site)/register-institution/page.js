"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Button, Field, Alert } from "../../../components/ui";
import Icon from "../../../components/portal/icons";

export default function RegisterInstitutionPage() {
  const [form, setForm] = useState({
    institution: "", sector: "higher_ed", officerName: "", officerEmail: "", officerPassword: "", metamaskAddress: "",
  });
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  function readFileBase64(f) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
  }

  async function onSubmit(e) {
    e.preventDefault();
    setError(null); setResult(null);
    if (!file) { setError("Please attach your HEA/TEVETA accreditation certificate."); return; }
    if (file.size > 6 * 1024 * 1024) { setError("File too large (max 6 MB)."); return; }
    setLoading(true);
    try {
      const data = await readFileBase64(file);
      const res = await api.registerInstitution({
        institution: form.institution,
        sector: form.sector,
        officerName: form.officerName,
        officerEmail: form.officerEmail,
        officerPassword: form.officerPassword,
        metamaskAddress: form.metamaskAddress || undefined,
        accreditation: { name: file.name, mime: file.type || "application/octet-stream", data },
      });
      setResult(res);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-md">
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center shadow-card">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Icon name="check" className="h-6 w-6" strokeWidth={2.5} />
          </div>
          <h1 className="mt-4 text-xl font-bold text-slate-900">Registration submitted</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
            <span className="font-semibold text-slate-700">{result.institution}</span> is now pending review by the{" "}
            <span className="font-semibold">{result.reviewedBy}</span>. Once approved, your institution is authorised
            on-chain and your officer account ({result.officer.email}) can start issuing credentials.
          </p>
          <Link href="/login" className="btn-primary mt-6 inline-flex">Go to sign in</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0d1b3a] text-white shadow-card">
            <Icon name="shieldCheck" className="h-6 w-6" />
          </span>
          <div className="text-left leading-tight">
            <div className="text-lg font-extrabold tracking-tight text-slate-900">BBACVS</div>
            <div className="text-[11px] font-bold tracking-widest text-emerald-500">CREDENTIAL VERIFICATION</div>
          </div>
        </div>
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Register your institution</h1>
        <p className="mt-1 text-[13px] text-slate-500">Accreditation is reviewed by your regulator before you can issue.</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-semibold text-slate-800">Institution</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">The legal name and regulatory sector of your institution.</p>
        </div>
        <Field label="Institution name" value={form.institution} onChange={set("institution")} required placeholder="Mulungushi University" />
        <label className="block">
          <span className="label">Institution type</span>
          <select className="input" value={form.sector} onChange={set("sector")}>
            <option value="higher_ed">University / College — regulated by the HEA</option>
            <option value="tevet">TEVET (technical / vocational / trades) — regulated by TEVETA</option>
          </select>
          <span className="mt-1 block text-xs text-slate-400">
            Your application is reviewed manually by the selected regulator before you can issue credentials.
          </span>
        </label>

        <div className="border-b border-slate-100 pb-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-800">Issuing officer</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">This account signs in and issues credentials for the institution.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Officer name" value={form.officerName} onChange={set("officerName")} required placeholder="Jane Banda" />
          <Field label="Officer email" type="email" value={form.officerEmail} onChange={set("officerEmail")} required placeholder="registrar@mu.zm" />
        </div>
        <Field label="Officer password" type="password" value={form.officerPassword} onChange={set("officerPassword")} required placeholder="min 8 characters" />

        <div className="border-b border-slate-100 pb-3 pt-2">
          <h2 className="text-sm font-semibold text-slate-800">Accreditation &amp; signing</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">Proof of accreditation and an optional on-chain signing address.</p>
        </div>
        <label className="block">
          <span className="label">Accreditation certificate (PDF or image)</span>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand hover:file:bg-brand-100" />
          {file && <span className="mt-1 block text-xs text-slate-400">{file.name} · {(file.size / 1024).toFixed(0)} KB</span>}
        </label>
        <Field label="Institution MetaMask address (optional)" value={form.metamaskAddress} onChange={set("metamaskAddress")}
          placeholder="0x… — leave blank for server-signed"
          hint="If set, you sign your own anchoring transactions in MetaMask." />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">
          {loading ? "Submitting…" : "Submit for approval"}
        </Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        Already registered? <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
