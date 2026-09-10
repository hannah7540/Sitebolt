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

export function getPrestartDefectNotes(prestart: PlantPrestart): string {
  return (
    prestart.defect_notes?.trim() ||
    prestart.defect_comments?.trim() ||
    prestart.defect_summary?.trim() ||
    ""
  );
}

function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed) && !trimmed.startsWith("blob:")) return false;
  const lower = trimmed.toLowerCase();
  return (
    lower.includes("prestart-uploads") ||
    lower.includes("/storage/") ||
    /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(lower) ||
    lower.includes("defect")
  );
}

export function collectPrestartDefectPhotoUrls(prestart: PlantPrestart): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && isLikelyImageUrl(value)) {
      urls.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) add(item);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      add(record.url ?? record.src ?? record.photo_url ?? record.defect_photo_url);
    }
  };

  add(prestart.defect_photo_url);
  const checkData = prestart.check_data ?? {};
  for (const [key, value] of Object.entries(checkData)) {
    if (key.startsWith("_") && !/photo|image|defect/i.test(key)) continue;
    if (/photo|image|defect|attachment/i.test(key) || typeof value === "string") {
      add(value);
    }
  }

  return Array.from(urls);
}

export function isActiveDashboardDefect(prestart: PlantPrestart): boolean {
  if (prestart.defect_reviewed === true) return false;
  if (prestart.defect_ignored === true) return false;
  if (prestart.defect_reviewed == null && prestart.is_read === true) return false;
  if (prestart.defect_status === "Resolved" && !prestart.has_defect) return false;
  if (prestart.cleared_at && !prestart.has_defect) return false;
  if (prestart.has_defect) return true;
  return getPrestartDefectNotes(prestart).length > 0;
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
  if (prestart.defect_ignored) return false;
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
  if (prestart.defect_ignored) return false;
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
