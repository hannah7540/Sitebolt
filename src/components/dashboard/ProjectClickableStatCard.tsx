"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ProjectClickableStatCardProps {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  value: string | number;
  subtitle?: string;
  onClick?: () => void;
  className?: string;
}

export default function ProjectClickableStatCard({
  icon: Icon,
  iconClassName,
  label,
  value,
  subtitle,
  onClick,
  className,
}: ProjectClickableStatCardProps) {
  const interactive = Boolean(onClick);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        cardClass,
        "flex w-full items-center gap-4 p-6 text-left transition",
        interactive && "cursor-pointer hover:border-orange-300 hover:bg-orange-50/30",
        !interactive && "cursor-default",
        className
      )}
    >
      <Icon className={cn("h-10 w-10 shrink-0", iconClassName ?? "text-orange-500")} />
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-500">{label}</p>
        <h2 className="text-2xl font-bold text-slate-900">{value}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {interactive ? (
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      ) : null}
    </button>
  );
}
