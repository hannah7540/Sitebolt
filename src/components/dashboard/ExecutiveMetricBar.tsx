"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ClipboardCheck, FolderKanban, Loader2 } from "lucide-react";
import {
  fetchExecutiveMetrics,
  type ExecutiveMetrics,
} from "@/lib/executive-metrics";
import { cn } from "@/lib/utils";

const EMPTY: ExecutiveMetrics = {
  activeProjects: 0,
  equipmentTotal: 0,
  equipmentCurrent: 0,
  equipmentOverdue: 0,
  actionRequired: 0,
};

export default function ExecutiveMetricBar() {
  const [metrics, setMetrics] = useState<ExecutiveMetrics>(EMPTY);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const next = await fetchExecutiveMetrics();
        if (!cancelled) setMetrics(next);
      } catch {
        if (!cancelled) setMetrics(EMPTY);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const compliancePct =
    metrics.equipmentTotal === 0
      ? 100
      : Math.round((metrics.equipmentCurrent / metrics.equipmentTotal) * 100);
  const complianceTone =
    metrics.equipmentTotal === 0
      ? "ok"
      : metrics.equipmentOverdue === 0
        ? "ok"
        : compliancePct >= 70
          ? "warn"
          : "bad";
  const actionTone = metrics.actionRequired === 0 ? "ok" : "warn";

  return (
    <div className="grid grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white md:grid-cols-3">
      <MetricCard
        icon={FolderKanban}
        label="Active Projects"
        value={loading ? null : String(metrics.activeProjects)}
        pill={`${metrics.activeProjects === 1 ? "project" : "projects"} in progress`}
        tone="neutral"
      />
      <MetricCard
        icon={ClipboardCheck}
        label="Equipment Compliance"
        value={
          loading ? null : `${metrics.equipmentCurrent}/${metrics.equipmentTotal}`
        }
        pill={
          metrics.equipmentOverdue === 0
            ? "Daily pre-starts current"
            : `${metrics.equipmentOverdue} overdue`
        }
        tone={complianceTone}
      />
      <MetricCard
        icon={AlertTriangle}
        label="Action Required"
        value={loading ? null : String(metrics.actionRequired)}
        pill="Pending ITP/ITC signoffs or open NCRs"
        tone={actionTone}
        last
      />
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  pill,
  tone,
  last = false,
}: {
  icon: typeof FolderKanban;
  label: string;
  value: string | null;
  pill: string;
  tone: "neutral" | "ok" | "warn" | "bad";
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3.5 md:px-5",
        !last && "border-b border-slate-200 md:border-b-0 md:border-r"
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {label}
        </p>
        <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight text-slate-900">
          {value ?? <Loader2 className="h-5 w-5 animate-spin text-orange-500" />}
        </p>
        <span
          className={cn(
            "mt-2 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
            tone === "ok" && "bg-emerald-50 text-emerald-700",
            tone === "warn" && "bg-amber-50 text-amber-800",
            tone === "bad" && "bg-red-50 text-red-700",
            tone === "neutral" && "bg-slate-100 text-slate-600"
          )}
        >
          {pill}
        </span>
      </div>
    </div>
  );
}
