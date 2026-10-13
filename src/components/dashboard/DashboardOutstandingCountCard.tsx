"use client";

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface DashboardOutstandingCountCardProps {
  title: string;
  count: number;
  icon: LucideIcon;
  iconClassName?: string;
  onClick: () => void;
  extra?: ReactNode;
}

export default function DashboardOutstandingCountCard({
  title,
  count,
  icon: Icon,
  iconClassName,
  onClick,
  extra,
}: DashboardOutstandingCountCardProps) {
  return (
    <section className={cn(cardClass, "flex h-full flex-col p-5")}>
      {extra ? <div className="mb-2 flex items-start justify-end">{extra}</div> : null}
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[10rem] flex-1 flex-col items-start justify-between rounded-xl text-left transition hover:bg-orange-50/40"
      >
        <div className="flex w-full items-start justify-between gap-3">
          <Icon className={cn("h-9 w-9 shrink-0", iconClassName ?? "text-orange-600")} />
          <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
        </div>
        <div className="mt-6">
          <p className="text-sm font-semibold text-slate-500">{title}</p>
          <p className="mt-1 text-5xl font-bold tracking-tight text-slate-900">{count}</p>
          <p className="mt-2 text-xs text-slate-500">Click to view the full list</p>
        </div>
      </button>
    </section>
  );
}
