import type { Worker } from "./supabase";
import type { CompanyCalendarDay } from "./company-calendar-days";
import {
  classifyLeavePeriod,
  resolveLeaveHoursPerDay,
  type LeaveDeductionBreakdown,
} from "./leave-deduction-engine";

/** @deprecated Leave entitlements are stored in external accounting software. */
export const WORKER_LEAVE_BALANCE_LEDGER_TABLE = "worker_leave_balance_ledger";

export async function fetchWorkerLeaveHoursPerDay(
  _workerId: string
): Promise<number> {
  return resolveLeaveHoursPerDay();
}

export async function resolveLeaveDeductionForWorker(input: {
  worker: Pick<Worker, "id" | "state" | "trade" | "worker_type" | "employment_type">;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
  calendarDays?: CompanyCalendarDay[];
}): Promise<LeaveDeductionBreakdown> {
  return classifyLeavePeriod({
    startDate: input.startDate,
    endDate: input.endDate,
    leaveType: input.leaveType,
    calendarDays: input.calendarDays ?? [],
    worker: input.worker,
    hoursPerDay: resolveLeaveHoursPerDay(),
  });
}

export async function deductApprovedLeaveBalance(_input: {
  workerId: string;
  leaveRequestId: string;
  leaveType?: string | null;
  breakdown: LeaveDeductionBreakdown;
}): Promise<{ error: string | null; deducted: boolean; balance: number }> {
  return { error: null, deducted: false, balance: 0 };
}
