import Link from "next/link";

// Banner shown on the legacy functional portals pointing to the redesigned UI.
export default function NewUiBanner({ href, name }) {
  return (
    <Link
      href={href}
      className="mb-5 flex items-center justify-between gap-3 rounded-xl border border-brand/20 bg-gradient-to-r from-brand-50 to-teal-50 px-4 py-3 transition hover:shadow-cardhover"
    >
      <span className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
          </svg>
        </span>
        <span>
          <span className="block text-sm font-bold text-slate-800">The new {name} portal experience is here</span>
          <span className="block text-xs text-slate-500">
            Redesigned dashboards, queues and detail views. This classic page remains available for live operations.
          </span>
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-brand px-3.5 py-2 text-xs font-semibold text-white">
        Open new UI
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
    </Link>
  );
}
