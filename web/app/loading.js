export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-slate-400">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-transparent" />
        <span className="text-sm font-medium">Loading…</span>
      </div>
    </div>
  );
}
