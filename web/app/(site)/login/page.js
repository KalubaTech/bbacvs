"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { setAuth } from "../../../lib/auth";
import { Button, Field, Alert } from "../../../components/ui";
import Icon from "../../../components/portal/icons";

const HOME = {
  admin: "/admin", zaqa: "/zaqa/applications", hea: "/hea/dashboard", teveta: "/teveta/dashboard",
  ecz: "/ecz/dashboard", issuer: "/institution", holder: "/graduate",
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { accessToken, user } = await api.login(email, password);
      setAuth(accessToken, user);
      router.push(HOME[user.role] || "/");
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
        <h1 className="mt-5 text-2xl font-bold text-slate-900">Welcome back</h1>
        <p className="mt-1 text-[13px] text-slate-500">Sign in to your BBACVS account</p>
      </div>

      <form
        onSubmit={onSubmit}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-card"
      >
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@institution.zm" />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={loading} className="w-full">Sign in</Button>
      </form>

      <p className="mt-5 text-center text-[13px] text-slate-500">
        Graduate without an account?{" "}
        <Link href="/register" className="font-semibold text-brand hover:underline">Create one</Link>
      </p>
      <p className="mt-1 text-center text-[13px] text-slate-500">
        An institution?{" "}
        <Link href="/register-institution" className="font-semibold text-brand hover:underline">Register &amp; get accredited</Link>
      </p>
    </div>
  );
}
