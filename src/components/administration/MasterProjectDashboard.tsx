"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CalendarOff,
  ClipboardCheck,
  FileSignature,
  HardHat,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchWorkers, type Worker } from "@/lib/supabase";
import { fetchProjects } from "@/lib/project-resolver";
import {
  createEmptyMasterProjectDashboardData,
  fetchMasterProjectDashboardData,
  type MasterDashboardWidgetData,
  type MasterProjectDashboardData,
} from "@/lib/master-project-dashboard";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const WIDGETS: Array<{
  key: keyof MasterProjectDashboardData;
  title: string;
  empty: string;
  href?: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    key: "incidents",
    title: "Incidents",
    empty: "No incident reports yet.",
    href: "/admin/forms/incidents",
    icon: AlertTriangle,
    iconClassName: "text-red-500",
  },
  {
    key: "safetyWalks",
    title: "Safety Walks",
    empty: "No safety walks submitted yet.",
    icon: ShieldCheck,
    iconClassName: "text-orange-500",
  },
  {
    key: "toolboxTalks",
    title: "Toolbox Talks",
    empty: "No toolbox talks submitted yet.",
    icon: MessageSquare,
    iconClassName: "text-sky-600",
  },
  {
    key: "plantPrestarts",
    title: "Plant Pre-Starts",
    empty: "No plant pre-starts submitted yet.",
    icon: HardHat,
    iconClassName: "text-amber-500",
  },
  {
    key: "leaveRequests",
    title: "Leave Requests",
    empty: "No pending leave requests.",
    icon: CalendarOff,
    iconClassName: "text-violet-600",
  },
  {
    key: "incompleteInductions",
    title: "Incomplete Inductions",
    empty: "No incomplete inductions.",
    href: "/admin/forms/inductions",
    icon: ClipboardCheck,
    iconClassName: "text-emerald-600",
  },
  {
    key: "swmsWaitingSignOff",
    title: "SWMS Waiting Sign Off",
    empty: "No SWMS waiting for sign-off.",
    href: "/?view=admin-swms",
    icon: FileSignature,
    iconClassName: "text-orange-600",
  },
];

function WidgetCard({
  title,
  data,
  empty,
  href,
  icon: Icon,
  iconClassName,
}: {
  title: string;
  data: MasterDashboardWidgetData;
  empty: string;
  href?: string;
  icon: LucideIcon;
  iconClassName: string;
}) {
  const header = (
    <div className="mb-4 flex items-start gap-3">
      <Icon className={cn("h-9 w-9 shrink-0", iconClassName)} />
      <div className="min-w-0 flex-1">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        <p className="text-sm text-slate-500">{data.count} recorded</p>
      </div>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
        {data.count}
      </span>
    </div>
  );

  return (
    <section className={cn(cardClass, "flex h-full flex-col p-5")}>
      {href ? (
        <Link href={href} className="block hover:opacity-90">
          {header}
        </Link>
      ) : (
        header
      )}

      {data.count === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {empty}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2">
          {(data.items ?? []).map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
            >
              <p className="truncate font-semibold text-slate-900">{item.title}</p>
              {item.subtitle ? (
                <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MasterProjectDashboard() {
  const [data, setData] = useState<MasterProjectDashboardData>(
    createEmptyMasterProjectDashboardData()
  );
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchProjects();
      const workers: Worker[] = await fetchWorkers();
      const next = await fetchMasterProjectDashboardData(workers ?? []);
      setData(next);
    } catch (error) {
      console.warn("[master-dashboard] load failed:", error);
      setData(createEmptyMasterProjectDashboardData());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          Master <span className="text-orange-500">Project Dashboard</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Organisation-wide totals from the same tables used by project dashboard widgets.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading master dashboard…
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {WIDGETS.map((widget) => (
            <WidgetCard
              key={widget.key}
              title={widget.title}
              data={data[widget.key] ?? { count: 0, items: [] }}
              empty={widget.empty}
              href={widget.href}
              icon={widget.icon}
              iconClassName={widget.iconClassName}
            />
          ))}
        </div>
      )}
    </div>
  );
}
