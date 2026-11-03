import { Loader2 } from "lucide-react";

/** Instant navigation feedback for App Router `loading.tsx` and Suspense fallbacks. */
export default function RouteLoadingFallback({
  label = "Loading…",
  dense = false,
}: {
  label?: string;
  dense?: boolean;
}) {
  return (
    <div
      className={
        dense
          ? "flex items-center gap-2 py-6 text-sm text-slate-500"
          : "flex min-h-[40vh] flex-col items-center justify-center gap-4 px-4 py-12"
      }
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      <div className="w-full max-w-md space-y-3">
        <p className="text-center text-sm font-medium text-slate-600">{label}</p>
        <div className="h-3 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-slate-200" />
        <div className="mt-4 grid gap-2">
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
          <div className="h-10 animate-pulse rounded-lg bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

export function CalendarSkeleton({
  label = "Loading calendar…",
}: {
  label?: string;
}) {
  return (
    <div className="space-y-4" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        {label}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="grid grid-cols-[12rem_repeat(7,minmax(0,1fr))] gap-px bg-slate-100 p-px">
          {Array.from({ length: 32 }).map((_, index) => (
            <div
              key={index}
              className="h-14 animate-pulse bg-white"
              style={{ animationDelay: `${(index % 8) * 40}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function TableSkeleton({
  label = "Loading table…",
  rows = 8,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        {label}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={index}
            className="flex gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
          >
            <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
            <div className="h-4 flex-1 animate-pulse rounded bg-slate-100" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
