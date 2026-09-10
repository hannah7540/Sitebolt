"use client";

import {
  formatLeaveDeductionBreakdown,
  type LeaveDeductionBreakdown,
} from "@/lib/leave-deduction-engine";

interface LeaveDeductionBreakdownCardProps {
  breakdown: LeaveDeductionBreakdown | null;
}

export default function LeaveDeductionBreakdownCard({
  breakdown,
}: LeaveDeductionBreakdownCardProps) {
  if (!breakdown || breakdown.calendarDays === 0) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
        Select a valid date range to calculate chargeable leave days.
      </div>
    );
  }

  const labels = formatLeaveDeductionBreakdown(breakdown);

  return (
    <div className="rounded-lg border border-orange-200 bg-orange-50/60 px-3 py-3 text-sm text-slate-800">
      <p className="font-semibold text-slate-900">{labels.totalPeriod}</p>
      <p className="mt-1 font-medium text-orange-800">{labels.chargeable}</p>
      <p className="mt-1 text-slate-600">{labels.excluded}</p>
      {breakdown.hoursPerDay > 0 && breakdown.effectiveDaysDeducted > 0 ? (
        <p className="mt-1 text-xs text-slate-500">
          {breakdown.effectiveHoursDeducted} hours at {breakdown.hoursPerDay} hrs/day
        </p>
      ) : null}
    </div>
  );
}
