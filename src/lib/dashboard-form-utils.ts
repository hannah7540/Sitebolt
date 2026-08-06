import type { Worker } from "@/lib/supabase";
import type { PlantPrestart } from "@/lib/supabase";
import type { PlantAsset } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";

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
  return "Toolbox talk";
}

export function countSafetyWalkOpenHazards(form: SiteFormSubmission): number {
  let count = 0;
  if (form.form_data.hazards_to_report === "yes") count += 1;

  for (const [key, value] of Object.entries(form.form_data)) {
    if (key.endsWith("_photo_url")) continue;
    if (value === "no") count += 1;
  }

  return count;
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
