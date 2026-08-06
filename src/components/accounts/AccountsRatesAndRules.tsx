"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Save, UserPlus, X } from "lucide-react";
import AccountsNav from "@/components/accounts/AccountsNav";
import PayRateAssignWorkersModal from "@/components/accounts/PayRateAssignWorkersModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  createEmptyPayRateRuleFormValues,
  createPayRateRule,
  ensureNswSiteWorkerPayRule,
  fetchPayRatesAndRules,
  mapPayRateFormToInput,
  NSW_SITE_WORKER_PRESET_KEY,
  NSW_SITE_WORKER_RULE_NAME,
  parsePayRateFormNumber,
  payRateRuleToFormValues,
  updatePayRateRule,
  type PayRateRule,
  type PayRateRuleFormValues,
  type PayRateRuleInput,
} from "@/lib/pay-rates-and-rules";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { fetchAllWorkers, type Worker } from "@/lib/supabase";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
  }).format(value);
}

function isActiveWorker(worker: Worker): boolean {
  return !worker.is_revoked && !worker.is_archived && worker.status !== "Revoked";
}

function formatOvertimeSummary(rule: PayRateRule): string {
  const multiplier = rule.overtime_multiplier || 2;
  const threshold = rule.overtime_15_threshold_hours || 8;
  return `${multiplier}× after ${threshold} hrs / weekends`;
}

interface RateCardProps {
  rule: PayRateRule;
  onEdit: () => void;
  onAssign: () => void;
}

function RateCard({ rule, onEdit, onAssign }: RateCardProps) {
  const mealThreshold = rule.meal_allowance_threshold || 10;

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{rule.rule_name}</h4>
          {rule.preset_key === NSW_SITE_WORKER_PRESET_KEY ||
          rule.rule_name === NSW_SITE_WORKER_RULE_NAME ? (
            <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
              Pre-seeded preset
            </span>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 space-y-2.5 text-sm">
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Base Hourly Rate</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.base_hourly_rate)}/hr
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Overtime Multiplier</dt>
          <dd className="text-right font-semibold text-slate-900">
            {formatOvertimeSummary(rule)}
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Site Allowance 2026</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.site_allowance_hourly)}/hr
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">AAC Productivity Allowance</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.productivity_allowance_hourly)}/hr
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">HSR Allowance</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.hsr_allowance_hourly)}/hr
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Travel NSW</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.travel_allowance_daily)}/day
          </dd>
        </div>
        <div className="flex justify-between gap-3 border-b border-slate-100 pb-2">
          <dt className="text-slate-500">Apprentice Travel</dt>
          <dd className="font-semibold text-slate-900">
            {formatCurrency(rule.travel_apprentice_daily)}/day
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-500">Meal Allowance</dt>
          <dd className="text-right font-semibold text-slate-900">
            {formatCurrency(rule.meal_allowance_daily)}/day
            <span className="mt-0.5 block text-xs font-normal text-slate-500">
              triggered at ≥{mealThreshold} hrs
            </span>
          </dd>
        </div>
      </dl>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Pencil className="h-4 w-4" />
          Edit Rates
        </button>
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <UserPlus className="h-4 w-4" />
          Assign to Workers
        </button>
      </div>
    </article>
  );
}

interface PayRateFormModalProps {
  title: string;
  initial: PayRateRuleFormValues;
  saving: boolean;
  onClose: () => void;
  onSave: (input: PayRateRuleInput) => void;
}

function PayRateFormModal({
  title,
  initial,
  saving,
  onClose,
  onSave,
}: PayRateFormModalProps) {
  const [form, setForm] = useState<PayRateRuleFormValues>(initial);

  useEffect(() => {
    setForm(initial);
  }, [initial]);

  const setNumber = (key: keyof PayRateRuleFormValues, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: value === "" ? 0 : parsePayRateFormNumber(value),
    }));
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="rule-name" className={labelClass}>
              Rule Name
            </label>
            <input
              id="rule-name"
              value={form.ruleName}
              onChange={(event) =>
                setForm((current) => ({ ...current, ruleName: event.target.value }))
              }
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="base-hourly-rate" className={labelClass}>
              Base Hourly Rate ($/hr)
            </label>
            <input
              id="base-hourly-rate"
              type="number"
              min={0}
              step={0.01}
              value={form.baseHourlyRate}
              onChange={(event) => setNumber("baseHourlyRate", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="overtime-multiplier" className={labelClass}>
              Overtime Multiplier (×)
            </label>
            <input
              id="overtime-multiplier"
              type="number"
              min={1}
              step={0.1}
              value={form.overtimeMultiplier}
              onChange={(event) => setNumber("overtimeMultiplier", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="ot-threshold" className={labelClass}>
              Overtime Threshold (hrs)
            </label>
            <input
              id="ot-threshold"
              type="number"
              min={0}
              step={0.25}
              value={form.overtime15ThresholdHours}
              onChange={(event) =>
                setNumber("overtime15ThresholdHours", event.target.value)
              }
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="saturday-rate" className={labelClass}>
              Saturday Rate ($/hr)
            </label>
            <input
              id="saturday-rate"
              type="number"
              min={0}
              step={0.01}
              value={form.saturdayRate}
              onChange={(event) => setNumber("saturdayRate", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="sunday-rate" className={labelClass}>
              Sunday Rate ($/hr)
            </label>
            <input
              id="sunday-rate"
              type="number"
              min={0}
              step={0.01}
              value={form.sundayRate}
              onChange={(event) => setNumber("sundayRate", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="public-holiday-rate" className={labelClass}>
              Public Holiday Rate ($/hr)
            </label>
            <input
              id="public-holiday-rate"
              type="number"
              min={0}
              step={0.01}
              value={form.publicHolidayRate}
              onChange={(event) => setNumber("publicHolidayRate", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="leave-flat-hours" className={labelClass}>
              Leave Flat Hours
            </label>
            <input
              id="leave-flat-hours"
              type="number"
              min={0}
              step={0.25}
              value={form.leaveFlatHours}
              onChange={(event) => setNumber("leaveFlatHours", event.target.value)}
              className={inputClass}
            />
          </div>

          <div className="sm:col-span-2 border-t border-slate-200 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              Allowances
            </p>
          </div>

          <div>
            <label htmlFor="site-allowance" className={labelClass}>
              Site Allowance 2026 ($/hr)
            </label>
            <input
              id="site-allowance"
              type="number"
              min={0}
              step={0.01}
              value={form.siteAllowanceHourly}
              onChange={(event) => setNumber("siteAllowanceHourly", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="productivity-allowance" className={labelClass}>
              AAC Productivity Allowance ($/hr)
            </label>
            <input
              id="productivity-allowance"
              type="number"
              min={0}
              step={0.01}
              value={form.productivityAllowanceHourly}
              onChange={(event) =>
                setNumber("productivityAllowanceHourly", event.target.value)
              }
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="hsr-allowance" className={labelClass}>
              HSR Allowance ($/hr)
            </label>
            <input
              id="hsr-allowance"
              type="number"
              min={0}
              step={0.01}
              value={form.hsrAllowanceHourly}
              onChange={(event) => setNumber("hsrAllowanceHourly", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="travel-nsw" className={labelClass}>
              Travel NSW ($/day)
            </label>
            <input
              id="travel-nsw"
              type="number"
              min={0}
              step={0.01}
              value={form.travelAllowanceDaily}
              onChange={(event) => setNumber("travelAllowanceDaily", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="apprentice-travel" className={labelClass}>
              Apprentice Travel ($/day)
            </label>
            <input
              id="apprentice-travel"
              type="number"
              min={0}
              step={0.01}
              value={form.travelApprenticeDaily}
              onChange={(event) => setNumber("travelApprenticeDaily", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="meal-allowance" className={labelClass}>
              Meal Allowance ($/day)
            </label>
            <input
              id="meal-allowance"
              type="number"
              min={0}
              step={0.01}
              value={form.mealAllowanceDaily}
              onChange={(event) => setNumber("mealAllowanceDaily", event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="meal-threshold" className={labelClass}>
              Meal Trigger Threshold (hrs)
            </label>
            <input
              id="meal-threshold"
              type="number"
              min={0}
              step={0.25}
              value={form.mealAllowanceThreshold}
              onChange={(event) =>
                setNumber("mealAllowanceThreshold", event.target.value)
              }
              className={inputClass}
            />
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSave(mapPayRateFormToInput(form))}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Rates
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AccountsRatesAndRules() {
  const [rules, setRules] = useState<PayRateRule[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [savingRule, setSavingRule] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
  const [editingRule, setEditingRule] = useState<PayRateRule | null>(null);
  const [assigningRule, setAssigningRule] = useState<PayRateRule | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const loadData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    const [rulesResult, workersResult, projectList] = await Promise.all([
      fetchPayRatesAndRules(),
      fetchAllWorkers(),
      fetchProjects(),
    ]);

    let nextRules = rulesResult.rules;

    if (nextRules.length === 0 && !rulesResult.error) {
      const preset = await ensureNswSiteWorkerPayRule();
      if (preset.rule) {
        nextRules = [preset.rule];
      } else if (preset.error) {
        console.warn("[AccountsRatesAndRules] NSW preset ensure failed:", preset.error);
      }
    }

    setRules(nextRules);
    setWorkers(workersResult.workers.filter(isActiveWorker));
    setProjects(projectList.length > 0 ? projectList : getCachedProjects());

    if (rulesResult.error?.includes("Pay rates table is missing")) {
      setFetchError(rulesResult.error);
    } else if (workersResult.error) {
      setFetchError(workersResult.error);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleSaveRule = async (input: PayRateRuleInput) => {
    setSavingRule(true);

    const result =
      formMode === "edit" && editingRule
        ? await updatePayRateRule(editingRule.id, input)
        : await createPayRateRule(input);

    setSavingRule(false);

    if (result.error || !result.rule) {
      showError(result.error ?? "Failed to save pay rate rule.");
      return;
    }

    showSuccess(`Saved "${result.rule.rule_name}".`);
    setFormMode(null);
    setEditingRule(null);
    await loadData();
  };

  return (
    <div className="space-y-6">
      <AccountsNav />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">
            Accounts <span className="text-orange-500">Rates and Rules</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Pay rate rules from <code className="text-xs">pay_rates_and_rules</code> — assign to
            workers by project.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingRule(null);
            setFormMode("create");
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700"
        >
          <Plus className="h-4 w-4" />
          Add Pay Rate Rule
        </button>
      </div>

      {fetchError ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {fetchError}
        </div>
      ) : null}

      <div className={cn(cardClass, "overflow-hidden")}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Pay Rates</h3>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 px-4 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading pay rates…
          </div>
        ) : rules.length === 0 ? (
          <p className="px-4 py-12 text-center text-sm text-slate-500">
            No pay rate rules found. Run migrations 073–076 in Supabase or add a rule.
          </p>
        ) : (
          <div className="grid gap-4 p-4 lg:grid-cols-2 xl:grid-cols-3">
            {rules.map((rule) => (
              <RateCard
                key={rule.id}
                rule={rule}
                onEdit={() => {
                  setEditingRule(rule);
                  setFormMode("edit");
                }}
                onAssign={() => setAssigningRule(rule)}
              />
            ))}
          </div>
        )}
      </div>

      {formMode ? (
        <PayRateFormModal
          title={formMode === "create" ? "Add Pay Rate Rule" : "Edit Rates"}
          initial={
            formMode === "edit" && editingRule
              ? payRateRuleToFormValues(editingRule)
              : createEmptyPayRateRuleFormValues()
          }
          saving={savingRule}
          onClose={() => {
            setFormMode(null);
            setEditingRule(null);
          }}
          onSave={(input) => void handleSaveRule(input)}
        />
      ) : null}

      {assigningRule ? (
        <PayRateAssignWorkersModal
          rule={assigningRule}
          workers={workers}
          projects={projects}
          onClose={() => setAssigningRule(null)}
          onAssigned={(count) => {
            showSuccess(`Assigned to ${count} worker(s).`);
            void loadData();
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
