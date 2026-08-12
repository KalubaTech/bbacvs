import Link from "next/link";
import Icon from "../../../components/portal/icons";
import { SectionCard, KVRow, Badge } from "../../../components/portal/kit";

export const metadata = { title: "Instructions & Fees — BBACVS" };

const FEES = [
  { qualification: "Degree (Bachelor's, Master's, PhD)", fee: "K500" },
  { qualification: "Diploma", fee: "K200" },
  { qualification: "G12 / G7 / G9, Form 4 and Form 6", fee: "K50" },
];

function Step({ n, children }) {
  return (
    <li className="flex gap-3 py-1.5">
      <span className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-[#0d1b3a] text-[11px] font-bold text-white">
        {n}
      </span>
      <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">{children}</span>
    </li>
  );
}

function FeeList() {
  return (
    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 px-3.5 py-1">
      {FEES.map((f) => (
        <KVRow
          key={f.qualification}
          label={f.qualification}
          value={<Badge tone="green">{f.fee}</Badge>}
        />
      ))}
    </div>
  );
}

export default function InstructionsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0d1b3a] text-white shadow-card">
          <Icon name="info" className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">Instructions &amp; fees</h1>
          <p className="mt-1 text-[13px] text-slate-500">How qualifications are uploaded, validated and paid for on BBACVS.</p>
        </div>
      </div>

      {/* Institutions */}
      <SectionCard
        title="For institutions — uploading credentials"
        action={<Badge tone="blue">Issuers</Badge>}
      >
        <ol className="space-y-1">
          <Step n="1">Sign in to your institution portal (your institution must be accredited before issuing).</Step>
          <Step n="2">Enter the graduate&apos;s details and qualification, then issue the credential.</Step>
          <Step n="3">Submit the credential to ZAQA for national validation.</Step>
          <Step n="4">
            <span className="font-semibold text-slate-800">Collect the validation fee from the graduate on behalf of ZAQA</span>{" "}
            according to the fee schedule below, and remit it under your ZAQA billing arrangement.
          </Step>
          <Step n="5">Once ZAQA validates, the graduate can download the signed validation certificate.</Step>
        </ol>
        <div className="mt-4">
          <h3 className="mb-2 text-[13px] font-semibold text-slate-800">Fees charged on behalf of ZAQA</h3>
          <FeeList />
        </div>
      </SectionCard>

      {/* Graduates */}
      <SectionCard
        title="For graduates — applying for validation of qualification"
        action={<Badge tone="indigo">Graduates</Badge>}
      >
        <p className="mb-3 text-[13px] leading-relaxed text-slate-600">
          If your institution has not yet uploaded your credential, you can apply for validation yourself from your
          graduate portal:
        </p>
        <ol className="space-y-1">
          <Step n="1">
            <Link href="/register" className="font-semibold text-brand hover:underline">Create a graduate account</Link>{" "}
            (or sign in) and open &ldquo;My credentials&rdquo;.
          </Step>
          <Step n="2">
            Under <span className="font-semibold text-slate-800">Apply for validation of qualification</span>, select your awarding institution.
          </Step>
          <Step n="3">Enter the qualification details exactly as they appear on your certificate.</Step>
          <Step n="4">Upload a clear scan or photo of the certificate (PDF or image, up to 6&nbsp;MB).</Step>
          <Step n="5">Pay the applicable validation fee (below) to the awarding institution, which collects it on behalf of ZAQA.</Step>
          <Step n="6">The institution verifies your document and forwards it to ZAQA for national validation.</Step>
          <Step n="7">You are notified at each step; once validated, download your signed ZAQA certificate.</Step>
        </ol>
        <div className="mt-4">
          <h3 className="mb-2 text-[13px] font-semibold text-slate-800">Validation fees</h3>
          <FeeList />
        </div>
        <p className="mt-4 text-[12px] leading-relaxed text-slate-400">
          Note: the system automatically checks for existing records first — if your qualification has already been
          uploaded and validated, your request is linked to the existing record and no new application is needed.
        </p>
      </SectionCard>

      <div className="text-center">
        <Link
          href="/student"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#12275c] px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-[#1b3576]"
        >
          Go to my portal
        </Link>
      </div>
    </div>
  );
}
