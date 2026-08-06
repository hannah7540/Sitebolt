import type { CalendarLeaveKind } from "./calendar-event-styles";
import {
  getLeaveTypeOption,
  HOLIDAY_APPROVED_STYLE,
  HOLIDAY_PENDING_STYLE,
} from "./calendar-event-styles";
import type { WorkerCalendarEventType } from "./worker-calendar-events";

export function normalizeLeaveTypeLabel(leaveType?: string | null): string {
  const raw = String(leaveType ?? "Annual Leave")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!raw) return "Annual Leave";
  if (raw.includes("sick")) return "Sick Leave";
  if (raw.includes("carer")) return "Carers Leave";
  if (raw.includes("personal")) return "Personal Leave";
  if (raw.includes("public holiday") || (raw.includes("public") && raw.includes("holiday"))) {
    return "Public Holiday";
  }
  if (raw.includes("annual") || (raw.includes("holiday") && !raw.includes("public"))) {
    return "Annual Leave";
  }
  if (raw === "leave") return "Leave";
  if (raw.includes("without pay") || raw.includes("unpaid")) return "Leave without pay";
  if (raw.includes("flexi") && raw.includes("rdo")) return "Flexi RDO";
  if (raw === "rdo") return "RDO";
  return "Annual Leave";
}

export const PUBLIC_HOLIDAY_EVENT_STYLE = {
  displayCode: "PH",
  bgColor: "#6366f1",
  textColor: "#ffffff",
  className: "bg-indigo-600",
} as const;

export const FLEXI_RDO_EVENT_STYLE = {
  displayCode: "F-RDO",
  bgColor: "#0d9488",
  textColor: "#ffffff",
  className: "bg-teal-600",
} as const;

export const LEAVE_WITHOUT_PAY_EVENT_STYLE = {
  displayCode: "LWOP",
  bgColor: "#64748b",
  textColor: "#ffffff",
  className: "bg-slate-500",
} as const;

export const RDO_LEAVE_EVENT_STYLE = {
  displayCode: "RDO",
  bgColor: "#9333ea",
  textColor: "#ffffff",
  className: "bg-gradient-to-r from-purple-600 to-teal-500",
} as const;

export type LeaveAttendanceCategory =
  | "on_site"
  | "rdo"
  | "flexi_rdo"
  | "leave_without_pay"
  | "public_holiday"
  | "other_leave"
  | "pending_leave";

export function mapLeaveTypeToCalendarKind(
  leaveType?: string | null
): CalendarLeaveKind {
  const sanitized = normalizeLeaveTypeLabel(leaveType);

  switch (sanitized) {
    case "Public Holiday":
      return "public_holiday";
    case "RDO":
      return "rdo";
    case "Flexi RDO":
      return "flexi_rdo";
    case "Leave without pay":
      return "leave_without_pay";
    case "Sick Leave":
    case "Sick":
      return "sick";
    case "Personal Leave":
      return "personal";
    case "Carers Leave":
      return "carers";
    case "Annual Leave":
    case "Leave":
      return "holiday_approved";
    default:
      return "other";
  }
}

export function classifyLeaveAttendance(
  leaveType?: string | null,
  status?: string | null
): LeaveAttendanceCategory {
  if (status && String(status).trim().toLowerCase() === "pending") {
    return "pending_leave";
  }

  const sanitized = normalizeLeaveTypeLabel(leaveType);
  switch (sanitized) {
    case "Public Holiday":
      return "public_holiday";
    case "RDO":
      return "rdo";
    case "Flexi RDO":
      return "flexi_rdo";
    case "Leave without pay":
      return "leave_without_pay";
    case "Annual Leave":
    case "Leave":
    case "Sick Leave":
    case "Sick":
    case "Personal Leave":
    case "Carers Leave":
      return "other_leave";
    default:
      return "other_leave";
  }
}

export function isLeaveRequestOnDate(
  startDate: string,
  endDate: string,
  dateIso: string
): boolean {
  return startDate <= dateIso && endDate >= dateIso;
}

export function resolveLeaveCalendarPresentation(options: {
  leaveType?: string | null;
  status: "pending" | "approved";
}): {
  event_type: WorkerCalendarEventType;
  display_code: string;
  bg_color: string;
  text_color: string;
  leave_kind: CalendarLeaveKind;
  leave_status: "Pending" | "Approved";
} {
  const kind = mapLeaveTypeToCalendarKind(options.leaveType);
  const isPending = options.status === "pending";

  if (kind === "public_holiday") {
    return {
      event_type: "Leave",
      display_code: PUBLIC_HOLIDAY_EVENT_STYLE.displayCode,
      bg_color: PUBLIC_HOLIDAY_EVENT_STYLE.bgColor,
      text_color: PUBLIC_HOLIDAY_EVENT_STYLE.textColor,
      leave_kind: "public_holiday",
      leave_status: isPending ? "Pending" : "Approved",
    };
  }

  if (kind === "rdo") {
    return {
      event_type: isPending ? "Leave" : "RDO",
      display_code: RDO_LEAVE_EVENT_STYLE.displayCode,
      bg_color: RDO_LEAVE_EVENT_STYLE.bgColor,
      text_color: RDO_LEAVE_EVENT_STYLE.textColor,
      leave_kind: "rdo",
      leave_status: isPending ? "Pending" : "Approved",
    };
  }

  if (kind === "flexi_rdo") {
    return {
      event_type: isPending ? "Leave" : "RDO",
      display_code: FLEXI_RDO_EVENT_STYLE.displayCode,
      bg_color: FLEXI_RDO_EVENT_STYLE.bgColor,
      text_color: FLEXI_RDO_EVENT_STYLE.textColor,
      leave_kind: "flexi_rdo",
      leave_status: isPending ? "Pending" : "Approved",
    };
  }

  if (kind === "leave_without_pay") {
    return {
      event_type: "Leave",
      display_code: LEAVE_WITHOUT_PAY_EVENT_STYLE.displayCode,
      bg_color: LEAVE_WITHOUT_PAY_EVENT_STYLE.bgColor,
      text_color: LEAVE_WITHOUT_PAY_EVENT_STYLE.textColor,
      leave_kind: "leave_without_pay",
      leave_status: isPending ? "Pending" : "Approved",
    };
  }

  if (isPending) {
    const preset =
      kind === "sick" ||
      kind === "personal" ||
      kind === "carers" ||
      kind === "other"
        ? getLeaveTypeOption(kind)
        : HOLIDAY_PENDING_STYLE;

    return {
      event_type: "Holiday Pending",
      display_code: preset.displayCode,
      bg_color: preset.bgColor,
      text_color: preset.textColor,
      leave_kind: kind === "holiday_approved" ? "holiday_pending" : kind,
      leave_status: "Pending",
    };
  }

  const preset =
    kind === "holiday_approved"
      ? HOLIDAY_APPROVED_STYLE
      : getLeaveTypeOption(kind);

  return {
    event_type: kind === "holiday_approved" ? "Holiday Approved" : "Leave",
    display_code: preset.displayCode,
    bg_color: preset.bgColor,
    text_color: preset.textColor,
    leave_kind: kind === "holiday_approved" ? "holiday_approved" : kind,
    leave_status: "Approved",
  };
}

export function leaveTypeBadgeClass(category: LeaveAttendanceCategory): string {
  switch (category) {
    case "public_holiday":
      return "bg-indigo-100 text-indigo-800 ring-indigo-200";
    case "rdo":
      return "bg-purple-100 text-purple-800 ring-purple-200";
    case "flexi_rdo":
      return "bg-teal-100 text-teal-800 ring-teal-200";
    case "leave_without_pay":
      return "bg-slate-200 text-slate-700 ring-slate-300";
    case "pending_leave":
      return "bg-amber-100 text-amber-800 ring-amber-200";
    case "other_leave":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    default:
      return "bg-blue-100 text-blue-800 ring-blue-200";
  }
}

export function leaveTypeBadgeLabel(category: LeaveAttendanceCategory): string {
  switch (category) {
    case "on_site":
      return "On Site";
    case "public_holiday":
      return "Public Holiday";
    case "rdo":
      return "RDO";
    case "flexi_rdo":
      return "Flexi RDO";
    case "leave_without_pay":
      return "Leave Without Pay";
    case "pending_leave":
      return "Pending Leave";
    case "other_leave":
      return "Approved Leave";
    default:
      return "On Site";
  }
}

/** Badge styling for a raw leave_type string (forms, tables, pending cards). */
export function leaveTypeDisplayBadge(leaveType?: string | null): {
  label: string;
  badgeClass: string;
} {
  const label = normalizeLeaveTypeLabel(leaveType);
  const category = classifyLeaveAttendance(label, "approved");
  return {
    label,
    badgeClass: leaveTypeBadgeClass(category),
  };
}
