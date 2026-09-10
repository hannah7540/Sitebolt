import { supabase, isSupabaseConfigured, type Worker } from "./supabase";
import {
  fetchCompanyCalendarDays,
  type CompanyCalendarDay,
} from "./company-calendar-days";
import {
  classifyLeavePeriod,
  isAnnualLeaveType,
  resolveLeaveHoursPerDay,
  type LeaveDeductionBreakdown,
} from "./leave-deduction-engine";
import { fetchWorkerLeavePayRuleCondition } from "./pay-rule-templates";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
} from "./supabase-errors";

export const WORKER_LEAVE_BALANCE_LEDGER_TABLE = "worker_leave_balance_ledger";

export async function fetchWorkerLeaveHoursPerDay(workerId: string): Promise<number> {
  if (!isSupabaseConfigured()) return resolveLeaveHoursPerDay();

  const { data, error } = await supabase
    .from("workers")
    .select("pay_rate_id,pay_rule_id")
    .eq("id", workerId)
    .maybeSingle();

  if (!error && data) {
    const rateId =
      (data as { pay_rate_id?: string | null }).pay_rate_id ??
      (data as { pay_rule_id?: string | null }).pay_rule_id;
    if (rateId) {
      const rateResult = await supabase
        .from("pay_rates")
        .select("leave_flat_hours")
        .eq("id", rateId)
        .maybeSingle();
      if (!rateResult.error) {
        return resolveLeaveHoursPerDay({
          leaveFlatHours: Number(
            (rateResult.data as { leave_flat_hours?: number } | null)?.leave_flat_hours
          ),
        });
      }
    }
  }

  const payRuleMatch = await fetchWorkerLeavePayRuleCondition(workerId, "Annual Leave");
  return resolveLeaveHoursPerDay({
    conditionName: payRuleMatch.condition?.condition_name,
  });
}

export async function resolveLeaveDeductionForWorker(input: {
  worker: Pick<Worker, "id" | "state" | "trade" | "worker_type" | "employment_type">;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  calendarDays?: CompanyCalendarDay[];
}): Promise<LeaveDeductionBreakdown> {
  const calendarDays =
    input.calendarDays ??
    (await fetchCompanyCalendarDays({
      startDate: input.startDate,
      endDate: input.endDate,
    }));
  const hoursPerDay = await fetchWorkerLeaveHoursPerDay(input.worker.id);

  return classifyLeavePeriod({
    startDate: input.startDate,
    endDate: input.endDate,
    leaveType: input.leaveType,
    calendarDays,
    worker: input.worker,
    hoursPerDay,
  });
}

export async function deductApprovedLeaveBalance(input: {
  workerId: string;
  leaveRequestId: string;
  leaveType?: string | null;
  breakdown: LeaveDeductionBreakdown;
}): Promise<{ error: string | null; deducted: boolean }> {
  if (!isSupabaseConfigured()) {
    return { error: null, deducted: false };
  }
  if (!isAnnualLeaveType(input.leaveType) || input.breakdown.effectiveDaysDeducted <= 0) {
    return { error: null, deducted: false };
  }

  const payload = {
    worker_id: input.workerId,
    leave_request_id: input.leaveRequestId,
    leave_type: input.breakdown.leaveType,
    days_delta: -input.breakdown.effectiveDaysDeducted,
    hours_delta: -input.breakdown.effectiveHoursDeducted,
    note: `Approved leave ${input.breakdown.startDate} to ${input.breakdown.endDate}`,
  };

  const { error } = await supabase
    .from(WORKER_LEAVE_BALANCE_LEDGER_TABLE)
    .upsert(payload, { onConflict: "leave_request_id" });

  if (!error) {
    return { error: null, deducted: true };
  }

  if (isSupabaseMissingColumnError(error) || isSupabaseSchemaOrConstraintError(error)) {
    const insertResult = await supabase
      .from(WORKER_LEAVE_BALANCE_LEDGER_TABLE)
      .insert([payload]);
    if (!insertResult.error) {
      return { error: null, deducted: true };
    }
    if (
      insertResult.error.message.toLowerCase().includes("duplicate") ||
      insertResult.error.code === "23505"
    ) {
      return { error: null, deducted: false };
    }
    return {
      error: toSupabaseRequestError(insertResult.error)?.message ?? insertResult.error.message,
      deducted: false,
    };
  }

  if (error.code === "23505" || error.message.toLowerCase().includes("duplicate")) {
    return { error: null, deducted: false };
  }

  return {
    error: toSupabaseRequestError(error)?.message ?? error.message,
    deducted: false,
  };
}
