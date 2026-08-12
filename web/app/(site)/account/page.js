"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { getToken, getUser, getAuth, setAuth } from "../../../lib/auth";
import { Button, Field, Alert, PageHeader } from "../../../components/ui";
import { Badge, SectionCard, Avatar, KVGrid } from "../../../components/portal/kit";

const ROLE_LABEL = {
  admin: "Platform super administrator",
  zaqa: "ZAQA — national qualifications authority",
  hea: "HEA — higher education regulator",
  teveta: "TEVETA — TEVET regulator",
  ecz: "ECZ — secondary certification authority",
  issuer: "Institution issuing officer",
  holder: "Graduate",
};

const accountIcon = (
  <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
  </svg>
);

export default function AccountPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [name, setName] = useState("");
  const [personal, setPersonal] = useState({ phone: "", nationalId: "", address: "" });
  const [inst, setInst] = useState({ contactEmail: "", contactPhone: "", physicalAddress: "", website: "" });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [nameMsg, setNameMsg] = useState(null);
  const [instMsg, setInstMsg] = useState(null);
  const [pwMsg, setPwMsg] = useState(null);
  const [error, setError] = useState(null);
  const [savingName, setSavingName] = useState(false);
  const [savingInst, setSavingInst] = useState(false);
  const [savingPw, setSavingPw] = useState(false);

  const load = useCallback(async () => {
    try {
      const { profile } = await api.myProfile(getToken());
      setProfile(profile);
      setName(profile.name || "");
      setPersonal({
        phone: profile.phone || "",
        nationalId: profile.nationalId || "",
        address: profile.address || "",
      });
      if (profile.institution) {
        setInst({
          contactEmail: profile.institution.contactEmail || "",
          contactPhone: profile.institution.contactPhone || "",
          physicalAddress: profile.institution.physicalAddress || "",
          website: profile.institution.website || "",
        });
      }
    } catch (err) { setError(err.message); }
  }, []);

  useEffect(() => {
    if (!getUser()) { router.push("/login"); return; }
    load();
  }, [router, load]);

  async function saveName(e) {
    e.preventDefault();
    setNameMsg(null); setError(null); setSavingName(true);
    try {
      const { accessToken, user } = await api.updateProfile(getToken(), { name, ...personal });
      // Refresh the stored session so the nav + future requests carry the new name.
      setAuth(accessToken || getAuth()?.accessToken, user);
      setNameMsg("Profile updated.");
      load();
    } catch (err) { setError(err.message); }
    finally { setSavingName(false); }
  }

  async function saveInstitution(e) {
    e.preventDefault();
    setInstMsg(null); setError(null); setSavingInst(true);
    try {
      await api.updateInstitutionProfile(getToken(), inst);
      setInstMsg("Institution profile updated.");
      load();
    } catch (err) { setError(err.message); }
    finally { setSavingInst(false); }
  }

  async function savePassword(e) {
    e.preventDefault();
    setPwMsg(null); setError(null);
    if (pw.next !== pw.confirm) { setError("New passwords do not match."); return; }
    setSavingPw(true);
    try {
      await api.changePassword(getToken(), pw.current, pw.next);
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg("Password changed.");
    } catch (err) { setError(err.message); }
    finally { setSavingPw(false); }
  }

  if (!profile) {
    return (
      <div>
        <PageHeader icon={accountIcon} title="My account" />
        {error ? <Alert>{error}</Alert> : <p className="py-8 text-center text-[13px] text-slate-400">Loading…</p>}
      </div>
    );
  }

  const accreditationTone =
    profile.institution?.status === "approved" ? "green"
    : profile.institution?.status === "suspended" ? "red"
    : "amber";

  return (
    <div>
      <PageHeader icon={accountIcon} title="My account" />

      {error && <div className="mb-4"><Alert>{error}</Alert></div>}

      {/* Identity header */}
      <div className="mb-6 flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-card">
        <Avatar name={profile.name || profile.email} size="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold text-slate-900">{profile.name || profile.email}</div>
          <div className="truncate text-[13px] text-slate-500">{profile.email}</div>
        </div>
        <Badge tone="softblue">{ROLE_LABEL[profile.role] || profile.role}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Profile */}
        <SectionCard title="Profile" className="self-start">
          <KVGrid
            cols={2}
            items={[
              { label: "Email", value: profile.email },
              { label: "Role", value: ROLE_LABEL[profile.role] || profile.role },
              { label: "Member since", value: profile.memberSince ? new Date(profile.memberSince).toLocaleDateString() : "—" },
              ...(profile.institution
                ? [
                    { label: "Institution", value: profile.institution.name },
                    {
                      label: "Accreditation status",
                      value: <Badge tone={accreditationTone} dot>{profile.institution.status}</Badge>,
                    },
                  ]
                : []),
            ]}
          />
          <p className="mt-4 text-xs text-slate-400">
            Your email and role are fixed — identity and access are controlled by your authority.
            Contact your administrator to change them.
          </p>

          {/* Update display name + personal details */}
          <form onSubmit={saveName} className="mt-5 space-y-3 border-t border-slate-100 pt-4">
            <Field label="Display name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Your name" />
            {profile.role === "holder" && (
              <>
                <Field label="Phone" value={personal.phone}
                  onChange={(e) => setPersonal({ ...personal, phone: e.target.value })} placeholder="+260 …" />
                <Field label="NRC / passport number" value={personal.nationalId}
                  onChange={(e) => setPersonal({ ...personal, nationalId: e.target.value })}
                  hint="Used to pre-fill validation applications; shown on your ZAQA certificate." />
                <Field label="Postal / physical address" value={personal.address}
                  onChange={(e) => setPersonal({ ...personal, address: e.target.value })} placeholder="Address" />
              </>
            )}
            {nameMsg && <Alert kind="success">{nameMsg}</Alert>}
            <Button type="submit" loading={savingName}>Save profile</Button>
          </form>
        </SectionCard>

        {/* Institution contact profile (institution officers) */}
        {profile.institution && (profile.role === "issuer" || profile.role === "ecz") && (
          <SectionCard title="Institution profile" className="self-start">
            <form onSubmit={saveInstitution} className="space-y-3">
              <p className="text-xs text-slate-400">
                Public contact details for {profile.institution.name}. Accreditation status and sector are
                controlled by your regulator and cannot be changed here.
              </p>
              <Field label="Contact email" type="email" value={inst.contactEmail}
                onChange={(e) => setInst({ ...inst, contactEmail: e.target.value })} placeholder="registry@institution.edu.zm" />
              <Field label="Contact phone" value={inst.contactPhone}
                onChange={(e) => setInst({ ...inst, contactPhone: e.target.value })} placeholder="+260 …" />
              <Field label="Physical address" value={inst.physicalAddress}
                onChange={(e) => setInst({ ...inst, physicalAddress: e.target.value })} placeholder="Campus address" />
              <Field label="Website" value={inst.website}
                onChange={(e) => setInst({ ...inst, website: e.target.value })} placeholder="https://…" />
              {instMsg && <Alert kind="success">{instMsg}</Alert>}
              <Button type="submit" loading={savingInst}>Save institution profile</Button>
            </form>
          </SectionCard>
        )}

        {/* Change password */}
        <SectionCard title="Password" className="self-start">
          <form onSubmit={savePassword} className="space-y-4">
            <Field label="Current password" type="password" value={pw.current}
              onChange={(e) => setPw({ ...pw, current: e.target.value })} required placeholder="••••••••" />
            <Field label="New password" type="password" value={pw.next}
              onChange={(e) => setPw({ ...pw, next: e.target.value })} required placeholder="min 8 characters" />
            <Field label="Confirm new password" type="password" value={pw.confirm}
              onChange={(e) => setPw({ ...pw, confirm: e.target.value })} required placeholder="repeat new password" />
            {pwMsg && <Alert kind="success">{pwMsg}</Alert>}
            <Button type="submit" loading={savingPw}>Change password</Button>
            <p className="text-xs text-slate-400">
              Use at least 8 characters. If you were issued a default password (e.g. a seeded
              authority account), change it here on first login.
            </p>
          </form>
        </SectionCard>
      </div>
    </div>
  );
}
