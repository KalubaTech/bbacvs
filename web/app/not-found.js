import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="text-center">
        <div className="text-5xl font-extrabold tracking-tight text-slate-300">404</div>
        <h2 className="mt-2 text-lg font-bold text-slate-800">Page not found</h2>
        <p className="mt-1 text-sm text-slate-500">The page you are looking for does not exist or has moved.</p>
        <Link href="/" className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          Back to home
        </Link>
      </div>
    </div>
  );
}
