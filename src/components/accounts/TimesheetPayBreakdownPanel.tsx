"use client";

import { useMemo } from "react";
import type { AccountsTimesheetRow } from "@/lib/accounts-timesheets";
import {
  calculateTimesheetPay,
  formatPayCurrency,
  type TimesheetPayBreakdown,
} from "@/lib/calculateTimesheetPay";
import type { PayRateRule } from "@/lib/pay-rates-and-rules";
import { formatTimesheetHours } from "@/lib/timesheet-utils";
import { cn } from "@/lib/utils";

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
    });
  }, [payRule, timesheet]);

  if (!payRule) {
    return (
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        No pay rule assigned to this worker. Assign the NSW Site Worker rule under
        Accounts → Rates and Rules.
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
            Rule: {breakdown.rule_name} · {formatTimesheetHours(breakdown.daily_hours)} worked
          </p>
        </div>
        {breakdown.is_leave_day ? (
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            Leave day ({formatTimesheetHours(breakdown.base_hours)})
          </span>
        ) : breakdown.is_weekend ? (
          <span className="rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-semibold text-purple-800">
            Weekend (all hours at 2×)
          </span>
        ) : null}
      </div>

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
        detail={`${formatTimesheetHours(breakdown.daily_hours)} × ${formatPayCurrency(payRule.site_allowance_hourly)}/hr`}
        amount={breakdown.site_allowance_pay}
      />
      <BreakdownRow
        label="AAC Productivity Allowance"
        detail={`${formatTimesheetHours(breakdown.daily_hours)} × ${formatPayCurrency(payRule.productivity_allowance_hourly)}/hr`}
        amount={breakdown.productivity_allowance_pay}
      />
      <BreakdownRow
        label="HSR Allowance"
        detail={
          timesheet.worker_is_hsr
            ? `${formatTimesheetHours(breakdown.daily_hours)} × ${formatPayCurrency(payRule.hsr_allowance_hourly)}/hr`
            : "Not applicable for this worker"
        }
        amount={breakdown.hsr_allowance_pay}
      />
      <BreakdownRow
        label="Travel NSW"
        detail={
          breakdown.travel_allowance_pay > 0
            ? "Flat daily travel allowance"
            : breakdown.is_leave_day
              ? "Not applied on leave days"
              : "Not applicable"
        }
        amount={breakdown.travel_allowance_pay}
      />
      <BreakdownRow
        label="Meal Allowance NSW"
        detail={
          breakdown.meal_allowance_pay > 0
            ? `Triggered at ≥ ${formatTimesheetHours(payRule.overtime_20_threshold_hours)} daily`
            : `Requires ≥ ${formatTimesheetHours(payRule.overtime_20_threshold_hours)} daily hours`
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
