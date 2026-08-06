import type { LeaveRequestStatus } from "./supabase";

export const LEAVE_TYPES = [
  "Sick",
  "Leave",
  "Leave without pay",
  "RDO",
  "Flexi RDO",
  "Public Holiday",
] as const;

export type LeaveType = (typeof LEAVE_TYPES)[number];

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Inclusive calendar days between first and last date. */
export function calculateLeaveDays(firstDate: string, lastDate: string): number {
  if (!firstDate || !lastDate) return 0;
  const start = parseLocalDate(firstDate);
  const end = parseLocalDate(lastDate);
  if (end < start) return 0;
  const diffMs = end.getTime() - start.getTime();
  return Math.round(diffMs / 86400000) + 1;
}

export function formatLeaveDateRange(firstDate: string, lastDate: string): string {
  const opts: Intl.DateTimeFormatOptions = {
    day: "numeric",
    month: "short",
    year: "numeric",
  };
  const first = parseLocalDate(firstDate).toLocaleDateString("en-AU", opts);
  const last = parseLocalDate(lastDate).toLocaleDateString("en-AU", opts);
  if (firstDate === lastDate) return first;
  return `${first} – ${last}`;
}

export function leaveStatusMeta(status: LeaveRequestStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "approved":
      return { label: "Approved", badgeClass: "bg-emerald-100 text-emerald-800" };
    case "declined":
      return { label: "Rejected", badgeClass: "bg-red-100 text-red-800" };
    default:
      return { label: "Pending Review", badgeClass: "bg-amber-100 text-amber-800" };
  }
}

export function countPendingLeave(requests: { status: LeaveRequestStatus }[]): number {
  return requests.filter((r) => r.status === "pending").length;
}
