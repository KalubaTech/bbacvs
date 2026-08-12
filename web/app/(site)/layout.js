import Nav from "../../components/Nav";

export default function SiteLayout({ children }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Nav />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10">{children}</main>
      <footer className="mt-auto bg-[#0d1b3a] text-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-7 text-center text-xs sm:flex-row sm:justify-between sm:gap-2 sm:px-6 sm:text-left">
          <span className="font-semibold tracking-tight">
            BBACVS <span className="font-normal text-slate-400">· National Academic Credential Verification</span>
          </span>
          <span className="inline-flex items-center gap-2 text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Secure · Tamper-proof · Nationally verifiable
          </span>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-[11px] text-slate-400">
          © 2026 Zambia University College of Technology
        </div>
      </footer>
    </div>
  );
}
