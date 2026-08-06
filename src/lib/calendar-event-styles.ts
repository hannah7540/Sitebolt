import type { WorkerCalendarEvent } from "./worker-calendar-events";

export type CalendarLeaveKind =
  | "sick"
  | "personal"
  | "carers"
  | "holiday_pending"
  | "holiday_approved"
  | "public_holiday"
  | "rdo"
  | "flexi_rdo"
  | "leave_without_pay"
  | "other";

export interface CalendarLeaveTypeOption {
  kind: CalendarLeaveKind;
  label: string;
  displayCode: string;
  bgColor: string;
  textColor: string;
}

export const RDO_EVENT_STYLE = {
  displayCode: "RDO",
  bgColor: "linear-gradient(to right, #f59e0b, #9333ea)",
  textColor: "#ffffff",
  className: "bg-gradient-to-r from-amber-500 to-purple-600",
} as const;

export const LEAVE_TYPE_OPTIONS: CalendarLeaveTypeOption[] = [
  {
    kind: "sick",
    label: "Sick Leave",
    displayCode: "SICK",
    bgColor: "#dc2626",
    textColor: "#ffffff",
  },
  {
    kind: "personal",
    label: "Personal Leave",
    displayCode: "PL",
    bgColor: "#dc2626",
    textColor: "#ffffff",
  },
  {
    kind: "carers",
    label: "Carers Leave",
    displayCode: "CL",
    bgColor: "#dc2626",
    textColor: "#ffffff",
  },
  {
    kind: "holiday_approved",
    label: "Annual Leave / Holiday",
    displayCode: "L",
    bgColor: "#000000",
    textColor: "#ffffff",
  },
  {
    kind: "public_holiday",
    label: "Public Holiday",
    displayCode: "PH",
    bgColor: "#6366f1",
    textColor: "#ffffff",
  },
  {
    kind: "other",
    label: "Other",
    displayCode: "OTHER",
    bgColor: "#64748b",
    textColor: "#ffffff",
  },
  {
    kind: "rdo",
    label: "RDO",
    displayCode: "RDO",
    bgColor: "#9333ea",
    textColor: "#ffffff",
  },
  {
    kind: "flexi_rdo",
    label: "Flexi RDO",
    displayCode: "F-RDO",
    bgColor: "#0d9488",
    textColor: "#ffffff",
  },
  {
    kind: "leave_without_pay",
    label: "Leave Without Pay",
    displayCode: "LWOP",
    bgColor: "#64748b",
    textColor: "#ffffff",
  },
];

export const HOLIDAY_PENDING_STYLE = {
  kind: "holiday_pending" as const,
  displayCode: "L",
  bgColor: "#EF4444",
  textColor: "#FFFFFF",
};

export const HOLIDAY_APPROVED_STYLE = {
  kind: "holiday_approved" as const,
  displayCode: "L",
  bgColor: "#000000",
  textColor: "#FFFFFF",
};

export function getLeaveTypeOption(
  kind: CalendarLeaveKind
): CalendarLeaveTypeOption {
  return (
    LEAVE_TYPE_OPTIONS.find((option) => option.kind === kind) ?? {
      kind: "other",
      label: "Other",
      displayCode: "OTHER",
      bgColor: "#64748b",
      textColor: "#ffffff",
    }
  );
}

export interface CalendarEventPresentation {
  label: string;
  className?: string;
  style?: { backgroundColor?: string; color?: string };
}

export function getCalendarEventPresentation(
  event: WorkerCalendarEvent
): CalendarEventPresentation {
  const label = event.display_code?.trim() || (event.event_type === "RDO" ? "RDO" : "L");

  if (event.event_type === "RDO") {
    if (event.leave_kind === "flexi_rdo") {
      return {
        label: event.display_code?.trim() || "F-RDO",
        style: {
          backgroundColor: event.bg_color ?? "#0d9488",
          color: event.text_color ?? "#ffffff",
        },
      };
    }

    if (event.bg_color && !event.bg_color.includes("gradient")) {
      return {
        label,
        style: {
          backgroundColor: event.bg_color,
          color: event.text_color ?? "#ffffff",
        },
      };
    }
    return {
      label,
      className: RDO_EVENT_STYLE.className,
      style: { color: event.text_color ?? RDO_EVENT_STYLE.textColor },
    };
  }

  if (event.event_type === "Holiday Pending") {
    return {
      label: HOLIDAY_PENDING_STYLE.displayCode,
      style: {
        backgroundColor: event.bg_color ?? HOLIDAY_PENDING_STYLE.bgColor,
        color: event.text_color ?? HOLIDAY_PENDING_STYLE.textColor,
      },
    };
  }

  if (event.event_type === "Holiday Approved") {
    return {
      label: HOLIDAY_APPROVED_STYLE.displayCode,
      style: {
        backgroundColor: event.bg_color ?? HOLIDAY_APPROVED_STYLE.bgColor,
        color: event.text_color ?? HOLIDAY_APPROVED_STYLE.textColor,
      },
    };
  }

  if (event.bg_color) {
    return {
      label,
      style: {
        backgroundColor: event.bg_color,
        color: event.text_color ?? "#ffffff",
      },
    };
  }

  const kind = event.leave_kind as CalendarLeaveKind | null;
  if (kind === "holiday_pending") {
    return {
      label: HOLIDAY_PENDING_STYLE.displayCode,
      style: {
        backgroundColor: HOLIDAY_PENDING_STYLE.bgColor,
        color: HOLIDAY_PENDING_STYLE.textColor,
      },
    };
  }

  const preset = kind ? getLeaveTypeOption(kind) : null;
  if (preset) {
    return {
      label: preset.displayCode,
      style: {
        backgroundColor: preset.bgColor,
        color: preset.textColor,
      },
    };
  }

  return {
    label,
    style: { backgroundColor: "#64748b", color: "#ffffff" },
  };
}

export const CALENDAR_LEGEND_ITEMS = [
  {
    key: "project",
    label: "Project Assignment",
    className: "bg-blue-600/80 border border-blue-500 text-white",
    sample: "Project",
  },
  {
    key: "rdo",
    label: "RDO",
    className: RDO_EVENT_STYLE.className + " text-white",
    sample: "RDO",
  },
  {
    key: "flexi-rdo",
    label: "Flexi RDO",
    style: { backgroundColor: "#0d9488", color: "#ffffff" },
    sample: "F-RDO",
  },
  {
    key: "lwop",
    label: "Leave Without Pay",
    style: { backgroundColor: "#64748b", color: "#ffffff" },
    sample: "LWOP",
  },
  {
    key: "sick",
    label: "SICK",
    style: { backgroundColor: "#dc2626", color: "#ffffff" },
    sample: "SICK",
  },
  {
    key: "pl",
    label: "PL",
    style: { backgroundColor: "#dc2626", color: "#ffffff" },
    sample: "PL",
  },
  {
    key: "cl",
    label: "CL",
    style: { backgroundColor: "#dc2626", color: "#ffffff" },
    sample: "CL",
  },
  {
    key: "l-pending",
    label: "L (Pending)",
    style: { backgroundColor: "#EF4444", color: "#FFFFFF" },
    sample: "L",
  },
  {
    key: "l-approved",
    label: "L (Approved)",
    style: { backgroundColor: "#000000", color: "#FFFFFF" },
    sample: "L",
  },
] as const;
