import { cn } from "@/lib/utils";
import { isWorkerStateRegion } from "@/lib/worker-state-region";

interface WorkerStateRegionBadgeProps {
  state: string | null | undefined;
  className?: string;
}

export default function WorkerStateRegionBadge({
  state,
  className,
}: WorkerStateRegionBadgeProps) {
  if (!state || !isWorkerStateRegion(state)) return null;

  return (
    <span
      className={cn(
        "rounded bg-slate-100 px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-slate-700",
        className
      )}
    >
      {state}
    </span>
  );
}
