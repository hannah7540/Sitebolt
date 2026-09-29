"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardPlus,
  FileText,
  FolderKanban,
  Loader2,
  Plus,
  Search,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { fetchPlant, fetchWorkers, type PlantAsset, type Worker } from "@/lib/supabase";
import { fetchOrganizationFleet, type OrganizationFleetVehicle } from "@/lib/organization-fleet";
import { fetchAssets, type Asset } from "@/lib/assets";
import { fetchCustomFormTemplates, type CustomFormTemplate } from "@/lib/custom-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { isPlantArchived } from "@/lib/plant-archive";
import { isFleetArchived } from "@/lib/fleet-archive";
import { CONSOLE_OPEN_ADD_SEARCH_PARAM } from "@/lib/console-nav-routes";
import { cn } from "@/lib/utils";

type ResultGroup = "Projects" | "Fleet & Plant" | "Workers" | "Forms" | "Quick Actions";

interface PaletteItem {
  id: string;
  group: ResultGroup;
  label: string;
  hint?: string;
  href: string;
}

const QUICK_ACTIONS: PaletteItem[] = [
  {
    id: "qa-prestart",
    group: "Quick Actions",
    label: "New Pre-Start",
    hint: "Open daily pre-start",
    href: "/pre-start",
  },
  {
    id: "qa-itc",
    group: "Quick Actions",
    label: "New ITC",
    hint: "ITP / ITC register",
    href: "/admin/itc",
  },
  {
    id: "qa-fleet",
    group: "Quick Actions",
    label: "Add Fleet Asset",
    hint: "Organisation fleet",
    href: `/organisation/fleet?${CONSOLE_OPEN_ADD_SEARCH_PARAM}=1`,
  },
];

const GROUP_ORDER: ResultGroup[] = [
  "Quick Actions",
  "Projects",
  "Fleet & Plant",
  "Workers",
  "Forms",
];

const GROUP_ICONS: Record<ResultGroup, typeof Search> = {
  "Quick Actions": Zap,
  Projects: FolderKanban,
  "Fleet & Plant": Truck,
  Workers: Users,
  Forms: FileText,
};

function haystack(...parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function matchesQuery(text: string, query: string): boolean {
  if (!query) return true;
  return text.includes(query);
}

function buildIndex(input: {
  projects: DbProject[];
  plant: PlantAsset[];
  fleet: OrganizationFleetVehicle[];
  workers: Worker[];
  assets: Asset[];
  forms: CustomFormTemplate[];
}): PaletteItem[] {
  const projects: PaletteItem[] = input.projects.map((project) => ({
    id: `project-${project.id}`,
    group: "Projects",
    label: project.name,
    hint: [project.project_code, project.location, project.state].filter(Boolean).join(" · "),
    href: `/projects/${project.id}`,
  }));

  const plant: PaletteItem[] = input.plant
    .filter((row) => !isPlantArchived(row))
    .map((row) => ({
      id: `plant-${row.id}`,
      group: "Fleet & Plant",
      label: row.name?.trim() || row.unit_number,
      hint: ["Plant", row.unit_number, row.make, row.model, row.category]
        .filter(Boolean)
        .join(" · "),
      href: `/organisation/plant?id=${encodeURIComponent(row.id)}&action=view`,
    }));

  const fleet: PaletteItem[] = input.fleet
    .filter((row) => !isFleetArchived(row))
    .map((row) => ({
      id: `fleet-${row.id}`,
      group: "Fleet & Plant",
      label: row.unit_number,
      hint: ["Fleet", row.registration, row.make, row.model].filter(Boolean).join(" · "),
      href: `/organisation/fleet?id=${encodeURIComponent(row.id)}&action=view`,
    }));

  const assets: PaletteItem[] = input.assets.map((row) => ({
    id: `asset-${row.id}`,
    group: "Fleet & Plant",
    label: row.name || row.asset_number,
    hint: ["Asset", row.asset_number, row.make, row.model].filter(Boolean).join(" · "),
    href: `/organisation/assets`,
  }));

  const workers: PaletteItem[] = input.workers.map((worker) => ({
    id: `worker-${worker.id}`,
    group: "Workers",
    label: getWorkerDisplayName(worker),
    hint: [worker.trade, worker.worker_code, worker.email].filter(Boolean).join(" · "),
    href: `/organisation/workers?id=${encodeURIComponent(worker.id)}&action=view`,
  }));

  const forms: PaletteItem[] = input.forms
    .filter((row) => row.is_active)
    .map((row) => ({
      id: `form-${row.id}`,
      group: "Forms",
      label: row.title,
      hint: "Organisation form template",
      href: "/organisation/forms",
    }));

  return [...QUICK_ACTIONS, ...projects, ...plant, ...fleet, ...assets, ...workers, ...forms];
}

interface CommandPaletteProps {
  onClose: () => void;
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PaletteItem[]>(QUICK_ACTIONS);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 20);
    return () => {
      document.body.style.overflow = "";
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        await fetchProjects();
        const [plant, fleet, workers, assets, formsResult] = await Promise.all([
          fetchPlant().catch(() => []),
          fetchOrganizationFleet().catch(() => []),
          fetchWorkers().catch(() => []),
          fetchAssets().catch(() => []),
          fetchCustomFormTemplates().catch(() => ({ data: [] as CustomFormTemplate[] })),
        ]);
        if (cancelled) return;
        setItems(
          buildIndex({
            projects: getCachedProjects(),
            plant: plant ?? [],
            fleet: fleet ?? [],
            workers: workers ?? [],
            assets: assets ?? [],
            forms: formsResult.data ?? [],
          })
        );
      } catch {
        if (!cancelled) setItems(QUICK_ACTIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const empty = needle.length === 0;
    const matched = items.filter((item) => {
      if (item.group === "Quick Actions") {
        return matchesQuery(haystack(item.label, item.hint), needle);
      }
      return matchesQuery(haystack(item.label, item.hint), needle);
    });

    const grouped = GROUP_ORDER.flatMap((group) => {
      const rows = matched.filter((item) => item.group === group);
      if (empty && group !== "Quick Actions") return rows.slice(0, 6);
      return rows.slice(0, 12);
    });

    return grouped;
  }, [items, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, items]);

  useEffect(() => {
    const selected = listRef.current?.querySelector("[data-selected='true']");
    selected?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex, filtered]);

  const selectItem = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((index) => (filtered.length === 0 ? 0 : (index + 1) % filtered.length));
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((index) =>
        filtered.length === 0 ? 0 : (index - 1 + filtered.length) % filtered.length
      );
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      selectItem(filtered[selectedIndex]);
    }
  };

  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/50 p-4 pt-[10vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="flex w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search projects, assets, fleet, workers, forms..."
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
            aria-label="Search projects, assets, fleet, workers, forms"
            autoComplete="off"
          />
          <kbd className="hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 sm:inline">
            ESC
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[min(420px,60vh)] overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-8 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Searching…
            </div>
          ) : filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No matching results.</p>
          ) : (
            GROUP_ORDER.map((group) => {
              const rows = filtered.filter((item) => item.group === group);
              if (rows.length === 0) return null;
              const Icon = GROUP_ICONS[group];
              return (
                <section key={group} className="px-2 pb-2">
                  <p className="flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <Icon className="h-3 w-3" />
                    {group}
                  </p>
                  <ul>
                    {rows.map((item) => {
                      runningIndex += 1;
                      const index = runningIndex;
                      const selected = index === selectedIndex;
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            data-selected={selected ? "true" : "false"}
                            onMouseEnter={() => setSelectedIndex(index)}
                            onClick={() => selectItem(item)}
                            className={cn(
                              "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left",
                              selected ? "bg-orange-50" : "hover:bg-slate-50"
                            )}
                          >
                            {group === "Quick Actions" ? (
                              item.id === "qa-fleet" ? (
                                <Plus className="h-4 w-4 shrink-0 text-orange-500" />
                              ) : (
                                <ClipboardPlus className="h-4 w-4 shrink-0 text-orange-500" />
                              )
                            ) : (
                              <Icon className="h-4 w-4 shrink-0 text-slate-400" />
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-slate-900">
                                {item.label}
                              </span>
                              {item.hint ? (
                                <span className="block truncate text-xs text-slate-500">
                                  {item.hint}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
