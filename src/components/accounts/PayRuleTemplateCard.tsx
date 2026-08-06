"use client";

import { UserPlus } from "lucide-react";
import {
  WA_SITE_WORKER_TEMPLATE_NAME,
  formatConditionSummary,
  partitionPayRuleConditionsForDisplay,
  type PayRuleCondition,
  type PayRuleTemplate,
} from "@/lib/pay-rule-templates";
import { getWaSiteWorkerDisplayLine } from "@/lib/default-pay-rules";
import { cn } from "@/lib/utils";

type ConditionCategory = "pay_rate" | "allowance" | "leave";

const CATEGORY_STYLES: Record<
  ConditionCategory,
  { badge: string; item: string; label: string }
> = {
  pay_rate: {
    badge: "bg-blue-100 text-blue-800",
    item: "border-blue-100 bg-blue-50/80 text-blue-950",
    label: "Pay Rates",
  },
  allowance: {
    badge: "bg-amber-100 text-amber-900",
    item: "border-amber-100 bg-amber-50/80 text-amber-950",
    label: "Allowances",
  },
  leave: {
    badge: "bg-emerald-100 text-emerald-800",
    item: "border-emerald-100 bg-emerald-50/80 text-emerald-950",
    label: "Leave Rules",
  },
};

function formatReadOnlyConditionLine(
  template: PayRuleTemplate,
  condition: PayRuleCondition
): string {
  if (template.name === WA_SITE_WORKER_TEMPLATE_NAME) {
    const line = getWaSiteWorkerDisplayLine(condition.sort_order);
    if (line) return line;
  }
  return formatConditionSummary(condition);
}

function ConditionCategorySection({
  category,
  template,
  conditions,
}: {
  category: ConditionCategory;
  template: PayRuleTemplate;
  conditions: PayRuleCondition[];
}) {
  const styles = CATEGORY_STYLES[category];

  if (conditions.length === 0) return null;

  return (
    <div>
      <span
        className={cn(
          "mb-2 inline-flex rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
          styles.badge
        )}
      >
        {styles.label}
      </span>
      <ul className="space-y-2">
        {conditions.map((condition) => (
          <li
            key={condition.id}
            className={cn("rounded-lg border px-3 py-2 text-sm leading-snug", styles.item)}
          >
            {formatReadOnlyConditionLine(template, condition)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface PayRuleTemplateCardProps {
  template: PayRuleTemplate;
  assignedCount: number;
  onAssign: () => void;
}

export default function PayRuleTemplateCard({
  template,
  assignedCount,
  onAssign,
}: PayRuleTemplateCardProps) {
  const { payRates, allowances, leaveRules } = partitionPayRuleConditionsForDisplay(template);

  return (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-lg font-semibold text-slate-900">{template.name}</h4>
          <span className="mt-1 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
            Seeded template
          </span>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
          {assignedCount} worker{assignedCount === 1 ? "" : "s"} assigned
        </span>
      </div>

      <div className="mt-4 space-y-4">
        <ConditionCategorySection
          category="pay_rate"
          template={template}
          conditions={payRates}
        />
        <ConditionCategorySection
          category="allowance"
          template={template}
          conditions={allowances}
        />
        <ConditionCategorySection
          category="leave"
          template={template}
          conditions={leaveRules}
        />
      </div>

      <div className="mt-5 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onAssign}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          <UserPlus className="h-4 w-4" />
          Assign to Workers
        </button>
      </div>
    </article>
  );
}
