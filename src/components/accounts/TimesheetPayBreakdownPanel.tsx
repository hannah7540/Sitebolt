"use client";

import { useMemo } from "react";
import {
  timesheetHasResolvablePayRule,
  type AccountsTimesheetRow,
} from "@/lib/accounts-timesheets";
import {
  calculateTimesheetPay,
  formatPayCurrency,
  type TimesheetPayBreakdown,
} from "@/lib/calculateTimesheetPay";
import type { PayRateRule } from "@/lib/pay-rates-and-rules";
import { resolveTravelPayrollCategory } from "@/lib/worker-pay-rule-assignment";
import {
  MEAL_ALLOWANCE_HOURS_THRESHOLD,
  PAYROLL_MEAL_ALLOWANCE_CATEGORY,
  resolveMealAllowanceThreshold,
} from "@/lib/meal-allowance";
import { cn } from "@/lib/utils";
import { formatTimesheetHours } from "@/lib/timesheet-utils";

interface TimesheetPayBreakdownPanelProps {
  timesheet: AccountsTimesheetRow;
  payRule: PayRateRule | null;
}

function BreakdownRow({
  label,
  detail,
  amount,
  highlight = false,
}: {
  label: string;
  detail?: string;
  amount: number;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-100 py-2 last:border-b-0">
      <div>
        <p className="text-sm font-medium text-slate-800">{label}</p>
        {detail ? <p className="text-xs text-slate-500">{detail}</p> : null}
      </div>
      <p
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          highlight ? "text-emerald-700" : "text-slate-900"
        )}
      >
        {formatPayCurrency(amount)}
      </p>
    </div>
  );
}

export default function TimesheetPayBreakdownPanel({
  timesheet,
  payRule,
}: TimesheetPayBreakdownPanelProps) {
  const breakdown = useMemo<TimesheetPayBreakdown | null>(() => {
    if (!payRule) return null;
    return calculateTimesheetPay(timesheet, payRule, {
      hsrApplicable: timesheet.worker_is_hsr ?? false,
      isApprentice: timesheet.worker_is_apprentice ?? false,
      hasCompanyVehicle: timesheet.worker_has_company_vehicle ?? false,
    });
  }, [payRule, timesheet]);

  const travelLabel = resolveTravelPayrollCategory(
    timesheet.worker_is_apprentice ?? false,
    timesheet.worker_state
  );
  const mealThreshold = payRule
    ? resolveMealAllowanceThreshold(payRule.meal_allowance_threshold)
    : MEAL_ALLOWANCE_HOURS_THRESHOLD;

  if (!payRule) {
    if (timesheetHasResolvablePayRule(timesheet)) {
      return null;
    }

    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No pay rule assigned to this worker. Set the worker&apos;s state/region on their
        profile — the matching pay rule is assigned automatically.
      </div>
    );
  }

  if (!breakdown) return null;

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-slate-900">Gross Pay Breakdown</h4>
          <p className="text-xs text-slate-500">
            Rule: {breakdown.rule_name} · {formatTimesheetHours(breakdown.daily_hours)} total
            {breakdown.work_hours > 0
              ? ` (${formatTimesheetHours(breakdown.work_hours)} work`
              : ""}
            {breakdown.leave_hours > 0
              ? `${breakdown.work_hours > 0 ? ", " : " ("}${formatTimesheetHours(breakdown.leave_hours)} leave`
              : ""}
            {(breakdown.work_hours > 0 || breakdown.leave_hours > 0) ? ")" : ""}
          </p>
        </div>
        {breakdown.is_mixed_day ? (
          <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-xs font-semibold text-indigo-800">
            Mixed day
          </span>
        ) : breakdown.is_leave_day ? (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            Leave day ({formatTimesheetHours(breakdown.leave_hours)})
          </span>
        ) : breakdown.is_weekend ? (
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
            Weekend (all hours at 2×)
          </span>
        ) : null}
      </div>

      {breakdown.line_items.length > 0 ? (
        <div className="mb-4 rounded-lg border border-slate-200 bg-white p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Line Items
          </p>
          {breakdown.line_items.map((item) => (
            <BreakdownRow
              key={`${item.category}-${item.label}`}
              label={item.label}
              detail={`${formatTimesheetHours(item.hours)} × ${formatPayCurrency(item.rate)}/hr`}
              amount={item.amount}
            />
          ))}
        </div>
      ) : null}

      <BreakdownRow
        label="Base pay"
        detail={`${formatTimesheetHours(breakdown.base_hours)} × ${formatPayCurrency(payRule.base_hourly_rate)}/hr`}
        amount={breakdown.base_pay}
      />
      <BreakdownRow
        label="Overtime pay"
        detail={
          breakdown.overtime_hours > 0
            ? `${formatTimesheetHours(breakdown.overtime_hours)} × ${formatPayCurrency(payRule.base_hourly_rate)}/hr × ${payRule.overtime_multiplier}`
            : "No overtime hours"
        }
        amount={breakdown.overtime_pay}
      />
      <BreakdownRow
        label="Site Allowance 2026"
        detail={
          breakdown.work_hours > 0
            ? `${formatTimesheetHours(breakdown.work_hours)} × ${formatPayCurrency(payRule.site_allowance_hourly)}/hr`
            : "Applied to work hours only"
        }
        amount={breakdown.site_allowance_pay}
      />
      <BreakdownRow
        label="AAC Productivity Allowance"
        detail={
          breakdown.work_hours > 0
            ? `${formatTimesheetHours(breakdown.work_hours)} × ${formatPayCurrency(payRule.productivity_allowance_hourly)}/hr`
            : "Applied to work hours only"
        }
        amount={breakdown.productivity_allowance_pay}
      />
      <BreakdownRow
        label="HSR Allowance"
        detail={
          timesheet.worker_is_hsr && breakdown.work_hours > 0
            ? `${formatTimesheetHours(breakdown.work_hours)} × ${formatPayCurrency(payRule.hsr_allowance_hourly)}/hr`
            : "Not applicable for this worker"
        }
        amount={breakdown.hsr_allowance_pay}
      />
      <BreakdownRow
        label={travelLabel}
        detail={
          timesheet.worker_has_company_vehicle
            ? "Excluded — worker has assigned company vehicle"
            : breakdown.travel_allowance_pay > 0
              ? "Flat daily travel allowance"
              : breakdown.is_leave_day
                ? "Not applied on leave-only days"
                : "Not applicable"
        }
        amount={breakdown.travel_allowance_pay}
      />
      <BreakdownRow
        label={PAYROLL_MEAL_ALLOWANCE_CATEGORY}
        detail={
          breakdown.meal_allowance_pay > 0
            ? `Applied — net work hours ≥ ${mealThreshold.toFixed(0)} (breaks excluded)`
            : breakdown.is_leave_day
              ? "Not applied on leave-only days"
              : `Requires ≥ ${mealThreshold.toFixed(0)} net work hours (breaks excluded)`
        }
        amount={breakdown.meal_allowance_pay}
      />

      <div className="mt-3 flex items-center justify-between border-t border-slate-200 pt-3">
        <p className="text-sm font-bold text-slate-900">Total gross pay</p>
        <p className="text-base font-bold tabular-nums text-emerald-700">
          {formatPayCurrency(breakdown.total_gross_pay)}
        </p>
      </div>
    </div>
  );
}
