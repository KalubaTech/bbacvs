"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { setAuth } from "../../../lib/auth";
import { Button, Field, Alert } from "../../../components/ui";
import Icon from "../../../components/portal/icons";

// Graduate (holder) self-registration. The holderDID links credentials issued to them.
export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await api.register(form);
      setAuth(accessToken, user);
      router.push("/student");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
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
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Create graduate account</h1>
        <p className="mt-1 text-[13px] text-slate-500">Credentials issued to your email will appear here</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card"
      >
        <div className="border-b border-slate-100 pb-3">
          <h2 className="text-sm font-semibold text-slate-800">Your details</h2>
          <p className="mt-0.5 text-[12px] text-slate-400">Use the email your institution has on record.</p>
        </div>
        <Field label="Full name" value={form.name} onChange={set("name")} required placeholder="Nelson Chituli" />
        <Field label="Email" type="email" value={form.email} onChange={set("email")} required placeholder="you@example.com" />
        <Field label="Password" type="password" value={form.password} onChange={set("password")} required placeholder="min 8 characters" />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">Create account</Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-brand hover:underline">Sign in</Link>
      </p>
    </div>
  );
}
