import Link from "next/link";
import Icon from "../../components/portal/icons";
import { Badge } from "../../components/portal/kit";

const FEATURES = [
  {
    icon: "shieldCheck", tone: "bg-emerald-50 text-emerald-600", title: "Tamper-proof",
    body: "Every credential is anchored in a tamper-proof national registry — it cannot be forged or altered.",
  },
  {
    icon: "bolt", tone: "bg-blue-50 text-blue-600", title: "Instant verification",
    body: "Employers verify authenticity, issuer status and revocation in seconds, with no login required.",
  },
  {
    icon: "award", tone: "bg-violet-50 text-violet-600", title: "ZAQA validated",
    body: "ZQF levels are validated by ZAQA, giving each qualification final national recognition.",
  },
  {
    icon: "qr", tone: "bg-amber-50 text-amber-600", title: "Offline QR",
    body: "Cryptographically signed QR codes verify issuer authenticity even without an internet connection.",
  },
];

const PORTALS = [
  {
    href: "/zaqa", title: "ZAQA", tag: "National oversight", tone: "purple", icon: "audit",
    body: "Top governance layer. Maintains the national trusted-issuer registry, validates ZQF levels, and gives final national validation.",
  },
  {
    href: "/hea", title: "HEA", tag: "HE regulator", tone: "teal", icon: "bank",
    body: "Regulates colleges and universities: registers recognised institutions, approves or suspends their issuing rights, and monitors higher-education credentials.",
  },
  {
    href: "/ecz", title: "ECZ", tag: "Secondary certs", tone: "green", icon: "clipboardCheck",
    body: "Examinations Council of Zambia. Issues Grade 12 / Form 4 & 6 certificates directly as signed, anchored QR credentials.",
  },
  {
    href: "/teveta", title: "TEVETA", tag: "TEVET regulator", tone: "orange", icon: "settings",
    body: "Regulates technical, vocational and trades training providers and oversees their TEVET credentials.",
  },
  {
    href: "/institution", title: "Colleges & Universities", tag: "Degree issuers", tone: "blue", icon: "building",
    body: "Issue diplomas, degrees, master's and PhDs as W3C Verifiable Credentials — signed, encrypted, pinned to IPFS, anchored on Ethereum.",
  },
  {
    href: "/graduate", title: "Graduate", tag: "Self-sovereign", tone: "indigo", icon: "graduation",
    body: "Own your credentials. Download the signed QR + PDF, check validation status, and present them to any verifier.",
  },
];

const ICON_TONE = {
  purple: "bg-purple-50 text-purple-600",
  teal: "bg-teal-50 text-teal-600",
  green: "bg-emerald-50 text-emerald-600",
  orange: "bg-orange-50 text-orange-600",
  blue: "bg-blue-50 text-blue-600",
  indigo: "bg-indigo-50 text-indigo-600",
};

const STEPS = [
  { n: "1", t: "Issue", d: "A university/college issues a degree (HEA-approved), or ECZ issues a secondary certificate — cryptographically signed and encrypted." },
  { n: "2", t: "Validate", d: "HEA confirms institution & programme compliance; ZAQA validates the ZQF level and grants final national recognition." },
  { n: "3", t: "Secure", d: "The credential is secured in a tamper-proof national registry and the graduate receives a signed QR certificate." },
  { n: "4", t: "Verify", d: "An employer scans the QR — the system shows issuer, ZQF level, HEA/ECZ recognition, ZAQA validation and revocation state." },
];

export default function Home() {
  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="overflow-hidden rounded-2xl bg-[#0d1b3a] px-6 py-10 text-white shadow-xl sm:px-12 sm:py-14">
        <div className="max-w-3xl">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <Icon name="shieldCheck" className="h-6 w-6" />
            </span>
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight">BBACVS</div>
              <div className="text-[11px] font-bold tracking-widest text-emerald-400">CREDENTIAL VERIFICATION</div>
            </div>
          </div>
          <h1 className="mt-6 text-3xl font-bold leading-tight tracking-tight sm:text-5xl">
            Tamper-proof academic credentials for Zambia
          </h1>
          <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-300 sm:text-base">
            Every credential is secured in a tamper-proof national registry, and cryptographically
            signed QR codes enable instant online and offline verification by any employer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/verify"
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-5 py-2.5 text-[13px] font-semibold text-[#0d1b3a] shadow-sm transition hover:bg-emerald-300"
            >
              <Icon name="shieldCheck" className="h-4 w-4" />
              Verify a credential
            </Link>
            <Link
              href="/qualifications"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            >
              <Icon name="search" className="h-4 w-4" />
              Search qualifications
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-lg border border-white/20 bg-white/10 px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-white/20"
            >
              Access portal
            </Link>
          </div>
          <div className="mt-8 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11px] font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Secure · Tamper-proof · Nationally verifiable
          </div>
        </div>
      </section>

      {/* Feature row */}
      <section className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex items-center gap-2.5">
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${f.tone}`}>
                <Icon name={f.icon} className="h-[18px] w-[18px]" />
              </span>
              <div className="text-sm font-bold text-slate-900">{f.title}</div>
            </div>
            <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500">{f.body}</p>
          </div>
        ))}
      </section>

      {/* Portals */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Governance layers &amp; portals</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">Each role in the national credential chain has its own portal.</p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {PORTALS.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="group rounded-xl border border-slate-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-cardhover"
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[p.tone]}`}>
                  <Icon name={p.icon} className="h-5 w-5" />
                </span>
                <Badge tone={p.tone}>{p.tag}</Badge>
              </div>
              <h3 className="mt-3.5 text-sm font-bold text-slate-900 group-hover:text-[#12275c]">{p.title}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{p.body}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-slate-400 group-hover:text-[#12275c]">
                Open portal <Icon name="chevronRight" className="h-3.5 w-3.5" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">How it works</h2>
          <p className="mt-0.5 text-[13px] text-slate-500">From issuance to employer verification in four steps.</p>
        </div>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="rounded-xl border border-slate-200 bg-white p-4 shadow-card">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#0d1b3a] text-[13px] font-bold text-white">
                {s.n}
              </div>
              <h3 className="mt-3.5 text-sm font-bold text-slate-900">{s.t}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-500">{s.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
