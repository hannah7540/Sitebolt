import { cn } from "@/lib/utils";

interface WorkerApprenticeBadgeProps {
  className?: string;
}

export default function WorkerApprenticeBadge({ className }: WorkerApprenticeBadgeProps) {
  return (
    <span
      className={cn(
        "rounded bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700",
        className
      )}
    >
      Apprentice
    </span>
  );
}
