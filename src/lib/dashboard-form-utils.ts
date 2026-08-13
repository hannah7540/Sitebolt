import type { Worker } from "@/lib/supabase";
import type { PlantPrestart } from "@/lib/supabase";
import type { PlantAsset } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  getHeavyVehicleInspectionWarning,
  getServiceWarning,
} from "@/lib/plant-utils";

export function getSiteFormSubmitterName(
  form: SiteFormSubmission,
  workers: Worker[]
): string {
  const worker = workers.find((row) => row.id === form.worker_id);
  if (worker) return getWorkerDisplayName(worker, "Unknown submitter");

  const attendeeMatch = form.attendees.find(
    (attendee) => attendee.worker_id === form.worker_id
  );
  if (attendeeMatch?.worker_name) return attendeeMatch.worker_name;

  return "Unknown submitter";
}

export function formatSiteFormTime(formTime: string | null): string {
  if (!formTime) return "";
  return formTime.slice(0, 5);
}

export function getDailyPrestartCompletionCount(form: SiteFormSubmission): number {
  const assignedCount = form.attendees.filter((attendee) => attendee.present).length;
  const additionalCount = form.additional_workers?.length ?? 0;
  return assignedCount + additionalCount;
}

export function getToolboxTalkTopic(form: SiteFormSubmission): string {
  const subject = form.form_data.toolbox_subject;
  if (typeof subject === "string" && subject.trim()) return subject.trim();
  return form.title?.trim() || "Toolbox talk";
}

export function getToolboxTalkNotes(form: SiteFormSubmission): string {
  const comments = form.form_data.comments_points_raised;
  if (typeof comments === "string" && comments.trim()) return comments.trim();
  return form.notes?.trim() ?? "";
}

export function getToolboxTalkAttendeeCount(form: SiteFormSubmission): number {
  const assignedCount = form.attendees.filter((attendee) => attendee.present).length;
  const additionalCount = form.additional_workers?.length ?? 0;
  return assignedCount + additionalCount;
}

export function getToolboxTalkSignedOffLabel(form: SiteFormSubmission): string {
  const signedNames = form.attendees
    .filter((attendee) => attendee.present && attendee.signature_url)
    .map((attendee) => attendee.worker_name.trim())
    .filter(Boolean);
  const additionalNames =
    form.additional_workers?.map((worker) => worker.name.trim()).filter(Boolean) ?? [];
  const names = [...signedNames, ...additionalNames];

  if (names.length === 0) {
    const presentOnly = form.attendees
      .filter((attendee) => attendee.present)
      .map((attendee) => attendee.worker_name.trim())
      .filter(Boolean);
    if (presentOnly.length === 0) return "None";
    if (presentOnly.length <= 3) return presentOnly.join(", ");
    return `${presentOnly.slice(0, 3).join(", ")} +${presentOnly.length - 3} more`;
  }

  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3} more`;
}

export function countSafetyWalkOpenHazards(form: SiteFormSubmission): number {
  return hasSafetyWalkOpenHazards(form) ? 1 : 0;
}

function isAffirmativeValue(value: unknown): boolean {
  if (value === true) return true;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "yes" || normalized === "true";
}

function isExplicitNegativeValue(value: unknown): boolean {
  if (value === false) return true;
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  return normalized === "no" || normalized === "false";
}

/** True when the hazards-to-report field is explicitly Yes/true. */
export function isSafetyWalkHazardReported(form: SiteFormSubmission): boolean {
  return isAffirmativeValue(form.form_data.hazards_to_report);
}

/** True when a reported hazard action item has been marked resolved. */
export function isSafetyWalkHazardActionResolved(form: SiteFormSubmission): boolean {
  const workflowStatus = String(form.status ?? "")
    .trim()
    .toLowerCase();
  if (workflowStatus === "resolved" || workflowStatus === "closed") {
    return true;
  }

  const data = form.form_data;
  if (isAffirmativeValue(data.hazard_action_resolved)) return true;
  if (isAffirmativeValue(data.hazards_resolved)) return true;
  if (typeof data.hazard_resolved_at === "string" && data.hazard_resolved_at.trim()) {
    return true;
  }

  return false;
}

/**
 * Open hazards exist only when hazards_to_report is explicitly Yes/true
 * and the associated action item is still unresolved.
 */
export function hasSafetyWalkOpenHazards(form: SiteFormSubmission): boolean {
  const hazardFlag = form.form_data.hazards_to_report;

  if (isExplicitNegativeValue(hazardFlag)) return false;
  if (!isAffirmativeValue(hazardFlag)) return false;
  if (isSafetyWalkHazardActionResolved(form)) return false;

  return true;
}

export function isSafetyWalkViewed(form: SiteFormSubmission): boolean {
  return form.is_viewed === true;
}

/** @alias isSafetyWalkViewed */
export function isSiteFormViewed(form: SiteFormSubmission): boolean {
  return isSafetyWalkViewed(form);
}

export function getWorkerOnsiteStatus(
  workerId: string,
  siteForms: SiteFormSubmission[],
  leaveRequests: Array<{
    worker_id: string;
    status: string;
    first_date: string;
    last_date: string;
  }>,
  todayIso: string
): string {
  for (const request of leaveRequests) {
    if (request.worker_id !== workerId) continue;
    const status = String(request.status ?? "").trim().toLowerCase();
    if (status !== "pending" && status !== "approved") continue;
    if (request.first_date <= todayIso && request.last_date >= todayIso) {
      return "On Leave";
    }
  }

  const checkedInToday = siteForms.some((form) => {
    if (form.form_type !== "daily_prestart" || form.form_date !== todayIso) return false;
    return form.attendees.some(
      (attendee) => attendee.worker_id === workerId && attendee.present
    );
  });
  if (checkedInToday) return "On Site";

  return "Off Site";
}

export function getPlantComplianceStatusLabel(plant: PlantAsset): string {
  if (plant.heavy_vehicle_check_required) {
    const warning = getHeavyVehicleInspectionWarning(plant);
    if (warning === "overdue") return "HV Check Overdue";
    if (warning === "due_soon") return "HV Check Due Soon";
    return "HV Check Current";
  }

  const serviceWarning = getServiceWarning(plant);
  if (serviceWarning === "overdue") return "Service Overdue";
  if (serviceWarning === "due_soon") return "Service Due Soon";

  return "Compliant";
}

export function getSafetyWalkInspectorNotes(form: SiteFormSubmission): string {
  const description = form.form_data.description_of_works;
  const parts = [
    typeof description === "string" ? description.trim() : "",
    form.notes?.trim() ?? "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function getSafetyWalkWorkflowStatusLabel(form: SiteFormSubmission): string {
  if (hasSafetyWalkOpenHazards(form)) return "Open";
  if (isSafetyWalkHazardReported(form) && isSafetyWalkHazardActionResolved(form)) {
    return "Resolved";
  }
  return form.status?.trim() || "Completed";
}

export function getPlantPrestartUnitLabel(
  prestart: PlantPrestart,
  plant: PlantAsset[]
): string {
  const match = plant.find((asset) => asset.id === prestart.plant_id);
  return match?.unit_number ?? "Unknown unit";
}

export function mergePlantPrestartLists(
  ...lists: PlantPrestart[][]
): PlantPrestart[] {
  const seen = new Set<string>();
  const merged: PlantPrestart[] = [];

  for (const list of lists) {
    for (const row of list) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
  }

  return merged.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}
