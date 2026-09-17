import { getWorkerAssignedProjectIds, type Worker } from "@/lib/supabase";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  normalizeWorkerStateRegion,
} from "@/lib/worker-state-region";
import { toE164Phone } from "@/lib/sms-phone";

/** Restricted comms regions — never include QLD, VIC, SA, TAS, or NT. */
export const COMM_STATE_FILTER_OPTIONS = ["ACT", "NSW", "WA", "NZ"] as const;
export const PROJECT_STATE_OPTIONS = COMM_STATE_FILTER_OPTIONS;
export type ProjectStateTag = (typeof COMM_STATE_FILTER_OPTIONS)[number];

export type CommsTargetMode =
  | "by_state"
  | "by_project"
  | "selected_workers"
  | "all_workers";

export const COMMS_TARGET_MODE_LABELS: Record<CommsTargetMode, string> = {
  by_state: "Filter by State",
  by_project: "Filter by Project",
  selected_workers: "Select Worker",
  all_workers: "Send to All",
};

export const COMMS_TARGET_MODE_ORDER: CommsTargetMode[] = [
  "by_state",
  "by_project",
  "selected_workers",
  "all_workers",
];

function isActiveCommsWorker(worker: Worker): boolean {
  return !worker.is_revoked && !worker.is_archived;
}

function hasValidMobile(worker: Worker): boolean {
  return Boolean(toE164Phone(worker.phone));
}

function hasValidEmail(worker: Worker): boolean {
  const email = String(worker.email ?? "").trim();
  return email.includes("@") && !email.startsWith("@") && !email.endsWith("@");
}

export function eligibleCommsWorkers(
  workers: Worker[],
  channel: "sms" | "email"
): Worker[] {
  return workers.filter((worker) => {
    if (!isActiveCommsWorker(worker)) return false;
    return channel === "sms" ? hasValidMobile(worker) : hasValidEmail(worker);
  });
}

export function workerMatchesProjectIds(
  worker: Worker,
  projectIds: Set<string>,
  projects: DbProject[]
): boolean {
  if (projectIds.size === 0) return false;
  const assigned = getWorkerAssignedProjectIds(worker);
  if (assigned.some((id) => projectIds.has(id))) return true;
  return projects.some(
    (project) =>
      projectIds.has(project.id) &&
      (project.assigned_workers ?? []).includes(worker.id)
  );
}

export function resolveCommsRecipients(input: {
  mode: CommsTargetMode;
  workers: Worker[];
  projects: DbProject[];
  stateTags: ProjectStateTag[];
  projectIds: string[];
  workerIds?: string[];
  channel: "sms" | "email";
}): Worker[] {
  const eligible = eligibleCommsWorkers(input.workers, input.channel);

  if (input.mode === "all_workers") {
    return eligible;
  }

  if (input.mode === "selected_workers") {
    const ids = new Set((input.workerIds ?? []).filter(Boolean));
    if (ids.size === 0) return [];
    return eligible.filter((worker) => ids.has(worker.id));
  }

  if (input.mode === "by_state") {
    const allowed = new Set<string>(COMM_STATE_FILTER_OPTIONS);
    const tags = new Set(
      input.stateTags
        .map((tag) => normalizeWorkerStateRegion(tag))
        .filter((tag): tag is ProjectStateTag => Boolean(tag && allowed.has(tag)))
    );
    if (tags.size === 0) return [];
    return eligible.filter((worker) => {
      const state = normalizeWorkerStateRegion(worker.state);
      return Boolean(state && allowed.has(state) && tags.has(state));
    });
  }

  const projectIds = new Set(input.projectIds.filter(Boolean));
  const activeProjects = filterActiveProjects(input.projects);
  return eligible.filter((worker) =>
    workerMatchesProjectIds(worker, projectIds, activeProjects)
  );
}

export function formatCommsRecipientPreview(workers: Worker[]): string {
  const names = workers
    .map((worker) => getWorkerDisplayName(worker).trim())
    .filter(Boolean);
  if (names.length === 0) {
    return "Sending to 0 recipients";
  }
  const shown = names.slice(0, 3).join(", ");
  const extra = names.length > 3 ? ` +${names.length - 3} more` : "";
  return `Sending to ${names.length} recipients (${shown}${extra})`;
}
