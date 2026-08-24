import type { PlantAsset, PlantPrestart } from "./supabase";
import { localIsoDate } from "./timesheet-utils";

export function getPlantPrestartDisplayTitle(
  prestart: PlantPrestart,
  plant: PlantAsset[]
): string {
  const asset = plant.find((row) => row.id === prestart.plant_id);
  const unit = asset?.unit_number ?? "Unknown unit";
  const descriptor = [asset?.make, asset?.model].filter(Boolean).join(" ");
  return descriptor ? `${unit} - ${descriptor}` : unit;
}

export function formatPrestartSubmittedTime(iso: string): string {
  const date = new Date(iso);
  const datePart = date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const timePart = date
    .toLocaleTimeString("en-AU", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
  return `${datePart}, ${timePart}`;
}

/** @alias formatPrestartSubmittedTime */
export const formatPlantPrestartDisplayDateTime = formatPrestartSubmittedTime;

export type PlantPrestartDashboardStatus = "passed" | "defect" | "failed";

export function getPlantPrestartDashboardStatus(
  prestart: PlantPrestart
): PlantPrestartDashboardStatus {
  if (!prestart.has_defect) return "passed";

  const comments = (prestart.defect_comments ?? "").toLowerCase();
  const status = (prestart.defect_status ?? "").toLowerCase();
  if (
    status === "failed" ||
    comments.includes("out of service") ||
    comments.includes("tagged out") ||
    comments.includes("failed")
  ) {
    return "failed";
  }

  return "defect";
}

export function getPlantPrestartStatusLabel(
  prestart: PlantPrestart
): "Passed" | "Defect" | "Failed" {
  const status = getPlantPrestartDashboardStatus(prestart);
  if (status === "passed") return "Passed";
  if (status === "failed") return "Failed";
  return "Defect";
}

export function sortPlantPrestartsNewestFirst(
  prestarts: PlantPrestart[]
): PlantPrestart[] {
  return [...prestarts].sort((left, right) => {
    const leftTime = new Date(left.submitted_at ?? left.created_at).getTime();
    const rightTime = new Date(right.submitted_at ?? right.created_at).getTime();
    return rightTime - leftTime;
  });
}

export function getPlantPrestartSubmittedIsoDate(prestart: PlantPrestart): string {
  return localIsoDate(new Date(prestart.submitted_at ?? prestart.created_at));
}

export function isPrestartSubmittedOnDate(
  prestart: PlantPrestart,
  isoDate: string
): boolean {
  const submittedAt = prestart.submitted_at ?? prestart.created_at;
  return localIsoDate(new Date(submittedAt)) === isoDate;
}

export function filterPlantPrestartsForDate(
  prestarts: PlantPrestart[],
  isoDate: string = localIsoDate()
): PlantPrestart[] {
  return prestarts.filter((row) => isPrestartSubmittedOnDate(row, isoDate));
}

export function getPrestartDefectLabel(prestart: PlantPrestart): string {
  const summary = prestart.defect_summary?.trim();
  if (summary) {
    return summary.length > 28 ? `${summary.slice(0, 28)}…` : summary;
  }

  const comment = prestart.defect_comments?.trim();
  if (comment) {
    const firstLine = comment.split(/[\n.,;]/)[0]?.trim() ?? comment;
    return firstLine.length > 28 ? `${firstLine.slice(0, 28)}…` : firstLine;
  }

  const checkData = prestart.check_data ?? {};
  for (const [key, value] of Object.entries(checkData)) {
    if (key.startsWith("_")) continue;
    if (String(value).toLowerCase() === "defect") {
      const label = key.replace(/_/g, " ");
      return label.length > 28 ? `${label.slice(0, 28)}…` : label;
    }
  }

  return "Defect flagged";
}

export function getLatestPrestartByPlant(
  prestarts: PlantPrestart[]
): Map<string, PlantPrestart> {
  const map = new Map<string, PlantPrestart>();
  for (const row of prestarts) {
    const existing = map.get(row.plant_id);
    if (!existing) {
      map.set(row.plant_id, row);
      continue;
    }
    const existingTime = new Date(
      existing.submitted_at ?? existing.created_at
    ).getTime();
    const rowTime = new Date(row.submitted_at ?? row.created_at).getTime();
    if (rowTime > existingTime) {
      map.set(row.plant_id, row);
    }
  }
  return map;
}

/** Calendar pinned-column label for the most recent pre-start (AU date + relative). */
export function formatLastPrestartColumnLabel(
  prestart: PlantPrestart | undefined | null
): { dateLabel: string; relativeLabel: string | null } {
  if (!prestart) {
    return { dateLabel: "No Pre-Start", relativeLabel: null };
  }

  const submittedAt = new Date(prestart.submitted_at ?? prestart.created_at);
  if (Number.isNaN(submittedAt.getTime())) {
    return { dateLabel: "No Pre-Start", relativeLabel: null };
  }

  const dateLabel = submittedAt.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const today = localIsoDate();
  const submittedIso = localIsoDate(submittedAt);
  if (submittedIso === today) {
    return { dateLabel, relativeLabel: "Today" };
  }

  const yesterday = localIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));
  if (submittedIso === yesterday) {
    return { dateLabel, relativeLabel: "Yesterday" };
  }

  return { dateLabel, relativeLabel: null };
}

export function groupPrestartsByPlantDate(
  prestarts: PlantPrestart[]
): Map<string, PlantPrestart[]> {
  const map = new Map<string, PlantPrestart[]>();
  for (const row of prestarts) {
    const dateKey = localIsoDate(new Date(row.submitted_at ?? row.created_at));
    const key = `${row.plant_id}:${dateKey}`;
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

export function formatPrestartHours(value: number | null | undefined): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded.toLocaleString()} hrs`;
}

/** Latest pre-start still has an open defect (not cleared). */
export function hasOpenPrestartDefect(prestart: PlantPrestart | undefined): boolean {
  if (!prestart || prestart.cleared_at) return false;
  if (prestart.defect_status === "Resolved") return false;
  if (prestart.has_defect) return true;
  if (prestart.defect_summary?.trim()) return true;
  if (prestart.defect_comments?.trim()) return true;

  const checkData = prestart.check_data ?? {};
  for (const [key, value] of Object.entries(checkData)) {
    if (key.startsWith("_")) continue;
    if (String(value).toLowerCase() === "defect") return true;
  }

  return false;
}

export interface PlantCalendarHeaderAlerts {
  defectText: string | null;
  hoursUntilService: number | null;
  isServiceDueSoon: boolean;
}

export function getPlantCalendarHeaderAlerts(
  asset: PlantAsset,
  latestPrestart: PlantPrestart | undefined
): PlantCalendarHeaderAlerts {
  const serviceDueHours =
    latestPrestart?.next_service_due ?? asset.next_service_hours ?? null;
  const currentHours =
    latestPrestart?.current_reading ?? asset.current_hours ?? null;

  let hoursUntilService: number | null = null;
  let isServiceDueSoon = false;

  if (serviceDueHours != null && currentHours != null) {
    hoursUntilService = serviceDueHours - currentHours;
    isServiceDueSoon = hoursUntilService <= 100;
  }

  const defectFlagged = hasOpenPrestartDefect(latestPrestart);
  const defectText = defectFlagged
    ? latestPrestart
      ? getPrestartDefectLabel(latestPrestart)
      : "Pre-Start Defect"
    : null;

  return {
    defectText,
    hoursUntilService,
    isServiceDueSoon,
  };
}

/** Show defect on calendar grid (includes resolved historical defects). */
export function isCalendarDefectPrestart(prestart: PlantPrestart): boolean {
  if (prestart.has_defect) return true;
  if (prestart.defect_status === "Resolved") return true;
  if (
    prestart.cleared_at &&
    (prestart.defect_summary?.trim() || prestart.defect_comments?.trim())
  ) {
    return true;
  }
  return false;
}

export function isResolvedPrestartDefect(prestart: PlantPrestart): boolean {
  return (
    prestart.defect_status === "Resolved" ||
    Boolean(prestart.cleared_at && !prestart.has_defect)
  );
}

export function applyResolvedPrestartPatch(
  prestart: PlantPrestart,
  resolutionNotes?: string
): PlantPrestart {
  const resolvedAt = new Date().toISOString();
  return {
    ...prestart,
    has_defect: false,
    defect_status: "Resolved",
    defect_resolved_at: resolvedAt,
    cleared_at: resolvedAt,
    repair_notes: resolutionNotes?.trim() || prestart.repair_notes,
  };
}
