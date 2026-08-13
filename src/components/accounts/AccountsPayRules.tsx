"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, UserPlus } from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import PayRuleAssignWorkersModal from "@/components/accounts/PayRuleAssignWorkersModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  fetchPayRuleTemplateIdByName,
  type PayRuleTemplate,
} from "@/lib/pay-rule-templates";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { fetchAllWorkers, isSupabaseConfigured, type Worker } from "@/lib/supabase";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

/** Static pay rule display copy — rendered verbatim, no dynamic formatting. */
export const PAY_RULE_TEMPLATES = [
  {
    name: "WA Site Worker",
    rules: [
      "Base Hourly - First 8 hours worked Mon-Fri",
      "Overtime (1.5x) - After 8 hours worked Mon - Fri",
      "Overtime (1.5x) - All hours worked Sat & Sun",
      "Meal Allowance - 1 unit per day when net worked hours are ≥ 10 (breaks excluded)",
      "Personal Leave Pay - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Annual Leave Pay - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Annual Leave Loading - 1 flat rate = to 8 hours worked (automatically applied when someone has Annual leave booked)",
      "RDO Taken - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Leave without pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Public Holiday Pay - 1 flat rate. = to 8 hours worked (automatically applied when someone has this type of leave booked)",
    ],
  },
  {
    name: "NSW Site Worker",
    rules: [
      "Base Hourly - First 8 hours worked Mon-Fri",
      "Overtime (1.5x) - After 8 hours worked Mon - Fri",
      "Overtime (1.5x) - All hours worked Sat & Sun",
      "Site Allowance 2026 - 1 flat rate Mon - Sun",
      "AAC Productivity Allowance - all hours worked",
      "Travel NSW - daily amount 1 per day all week (exports as Travel NSW Apprentice when worker is an apprentice)",
      "Meal Allowance NSW 2025 - 1 unit per day when net worked hours are ≥ 10 (breaks excluded)",
      "HSR allowance - all hours worked Mon-Sun",
      "RDO Taken - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Personal Leave Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Annual Leave Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Annual Leave Loading - 1 flat rate = to 8 hours worked (automatically applied when someone has Annual leave booked)",
      "Leave Without Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Public Holiday Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
    ],
  },
  {
    name: "ACT Site Worker",
    rules: [
      "Base Hourly - First 8 hours worked Mon-Fri",
      "Overtime (1.5x) - After 8 hours worked Mon - Fri",
      "Overtime (1.5x) - All hours worked Sat & Sun",
      "Site Allowance 2026 - 1 flat rate Mon - Sun",
      "AAC Productivity Allowance - all hours worked",
      "Travel ACT - daily amount 1 per day all week",
      "Meal Allowance NSW 2025 - 1 unit per day when net worked hours are ≥ 10 (breaks excluded)",
      "HSR allowance - all hours worked Mon-Sun",
      "RDO Taken - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Personal Leave Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Annual Leave Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Annual Leave Loading - 1 flat rate = to 8 hours worked (automatically applied when someone has Annual leave booked)",
      "Leave Without Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Public Holiday Pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
    ],
  },
  {
    name: "NZ Site Worker",
    rules: [
      "Base Hourly - First 8 hours worked Mon-Fri",
      "Overtime (1.5x) - After 8 hours worked Mon - Fri",
      "Overtime (1.5x) - All hours worked Sat & Sun",
      "Meal Allowance - 1 unit per day when net worked hours are ≥ 10 (breaks excluded)",
      "Personal Leave Pay - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Annual Leave Pay - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Annual Leave Loading - 1 flat rate = to 8 hours worked (automatically applied when Annual leave booked)",
      "RDO Taken - 1 flat rate = to 8 hours worked (automatically applied when someone has this type of leave booked)",
      "Leave without pay - 1 flat rate (automatically applied when someone has this type of leave booked)",
      "Public Holiday Pay - 1 flat rate. = to 8 hours worked (automatically applied when someone has this type of leave booked)",
    ],
  },
] as const;

function isActiveWorker(worker: Worker): boolean {
  return !worker.is_revoked && !worker.is_archived && worker.status !== "Revoked";
}

function toAssignTemplate(name: string, supabaseId: string | null): PayRuleTemplate {
  return {
    id: supabaseId ?? `display-${name}`,
    name,
    conditions: [],
  };
}

export default function AccountsPayRules() {
  const [templateIdsByName, setTemplateIdsByName] = useState<Record<string, string>>({});
  const [loadingTemplateIds, setLoadingTemplateIds] = useState(true);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [assigningTemplateName, setAssigningTemplateName] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const loadTemplateIds = useCallback(async () => {
    setLoadingTemplateIds(true);

    if (!isSupabaseConfigured()) {
      setTemplateIdsByName({});
      setLoadingTemplateIds(false);
      return;
    }

    const entries = await Promise.all(
      PAY_RULE_TEMPLATES.map(async (template) => {
        const result = await fetchPayRuleTemplateIdByName(template.name);
        return [template.name, result.id ?? ""] as const;
      })
    );

    const map: Record<string, string> = {};
    for (const [name, id] of entries) {
      if (id) map[name] = id;
    }
    setTemplateIdsByName(map);
    setLoadingTemplateIds(false);
  }, []);

  useEffect(() => {
    void loadTemplateIds();
  }, [loadTemplateIds]);

  useEffect(() => {
    let cancelled = false;

    async function loadWorkersAndProjects() {
      const [workersResult, projectList] = await Promise.all([
        fetchAllWorkers(),
        fetchProjects(),
      ]);

      if (cancelled) return;

      setWorkers(workersResult.workers.filter(isActiveWorker));
      setProjects(projectList.length > 0 ? projectList : getCachedProjects());

      if (workersResult.error) {
        console.error("[AccountsPayRules] Failed to fetch workers:", workersResult.error);
      }
    }

    void loadWorkersAndProjects();

    return () => {
      cancelled = true;
    };
  }, []);

  const workerCountByTemplateName = useMemo(() => {
    const map = new Map<string, number>();

    for (const template of PAY_RULE_TEMPLATES) {
      const supabaseId = templateIdsByName[template.name];
      if (!supabaseId) {
        map.set(template.name, 0);
        continue;
      }

      let count = 0;
      for (const worker of workers) {
        if (worker.pay_rule_template_id === supabaseId) count += 1;
      }
      map.set(template.name, count);
    }

    return map;
  }, [templateIdsByName, workers]);

  const assigningTemplate = assigningTemplateName
    ? toAssignTemplate(
        assigningTemplateName,
        templateIdsByName[assigningTemplateName] ?? null
      )
    : null;

  return (
    <div className="space-y-6">
      <AccountsNav />

      <div>
        <h2 className="text-2xl font-bold text-slate-900">
          Accounts <span className="text-orange-500">Pay Rules</span>
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          View pay rule templates and assign them to workers by project.
        </p>
      </div>

      <div className={cn(cardClass, "overflow-hidden")}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Pay Rule Templates</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            WA Site Worker, NSW Site Worker, ACT Site Worker, and NZ Site Worker.
          </p>
        </div>

        <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
          {PAY_RULE_TEMPLATES.map((template) => (
            <article
              key={template.name}
              className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-lg font-semibold text-slate-900">{template.name}</h4>
                  <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                    Seeded template
                  </span>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                  {loadingTemplateIds ? (
                    <Loader2 className="inline h-3 w-3 animate-spin text-slate-400" />
                  ) : (
                    <>
                      {workerCountByTemplateName.get(template.name) ?? 0} worker
                      {(workerCountByTemplateName.get(template.name) ?? 0) === 1 ? "" : "s"}{" "}
                      assigned
                    </>
                  )}
                </span>
              </div>

              <ul className="mt-4 space-y-2">
                {template.rules.map((rule) => (
                  <li
                    key={rule}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-snug text-slate-900"
                  >
                    {rule}
                  </li>
                ))}
              </ul>

              <div className="mt-5 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setAssigningTemplateName(template.name)}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
                >
                  <UserPlus className="h-4 w-4" />
                  Assign to Workers
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>

      {assigningTemplate ? (
        <PayRuleAssignWorkersModal
          template={assigningTemplate}
          workers={workers}
          projects={projects}
          onClose={() => setAssigningTemplateName(null)}
          onAssigned={(count, templateName) => {
            showSuccess(`Assigned ${templateName} to ${count} worker${count === 1 ? "" : "s"}.`);
            void fetchAllWorkers().then((workersResult) => {
              if (!workersResult.error) {
                setWorkers(workersResult.workers.filter(isActiveWorker));
              }
            });
          }}
          onError={showError}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
