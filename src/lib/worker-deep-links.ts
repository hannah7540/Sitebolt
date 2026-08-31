/** Deep-link targets for worker dashboard push / in-app routing. */

export type WorkerDeepLinkTarget =
  | { type: "dashboard" }
  | { type: "swms"; assignmentId?: string | null }
  | { type: "induction"; assignmentId?: string | null }
  | { type: "forms_hub" }
  | { type: "timesheets" }
  | { type: "leave" }
  | { type: "details" }
  | { type: "itcs" };

export function parseWorkerDeepLink(
  raw: Record<string, string | null | undefined> | URLSearchParams | null | undefined
): WorkerDeepLinkTarget | null {
  if (!raw) return null;

  const get = (key: string): string | null => {
    if (raw instanceof URLSearchParams) {
      const value = raw.get(key);
      return value?.trim() || null;
    }
    const value = raw[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  const open = (get("open") ?? get("deep_link") ?? get("target") ?? "").toLowerCase();
  if (!open) return null;

  const id = get("id") ?? get("assignmentId") ?? get("assignment_id");

  switch (open) {
    case "swms":
    case "swms_sign":
    case "swms-signoff":
      return { type: "swms", assignmentId: id };
    case "induction":
    case "inductions":
    case "form_assignment":
      return { type: "induction", assignmentId: id };
    case "forms":
    case "forms_hub":
    case "safety":
      return { type: "forms_hub" };
    case "timesheet":
    case "timesheets":
      return { type: "timesheets" };
    case "leave":
      return { type: "leave" };
    case "details":
    case "profile":
      return { type: "details" };
    case "itc":
    case "itcs":
      return { type: "itcs" };
    case "dashboard":
    case "home":
      return { type: "dashboard" };
    default:
      return null;
  }
}

export function buildWorkerDeepLinkPath(
  target: WorkerDeepLinkTarget,
  workerId?: string | null
): string {
  const params = new URLSearchParams();
  if (workerId) params.set("worker_id", workerId);

  switch (target.type) {
    case "swms":
      params.set("open", "swms");
      if (target.assignmentId) params.set("id", target.assignmentId);
      break;
    case "induction":
      params.set("open", "induction");
      if (target.assignmentId) params.set("id", target.assignmentId);
      break;
    case "forms_hub":
      params.set("open", "forms_hub");
      break;
    case "timesheets":
      params.set("open", "timesheets");
      break;
    case "leave":
      params.set("open", "leave");
      break;
    case "details":
      params.set("open", "details");
      break;
    case "itcs":
      params.set("open", "itcs");
      break;
    default:
      break;
  }

  const query = params.toString();
  return query ? `/worker-dashboard?${query}` : "/worker-dashboard";
}

/** Prefer pending SWMS / inductions at the top of the worker feed. */
export function prioritizeWorkerDashboardWidgets(
  widgetIds: string[],
  options: { pendingSwms: number; pendingInductions: number }
): string[] {
  const urgent: string[] = [];
  if (options.pendingSwms > 0) urgent.push("swms");
  if (options.pendingInductions > 0) urgent.push("inductions");

  if (urgent.length === 0) return widgetIds;

  const seen = new Set<string>();
  const result: string[] = [];

  for (const id of urgent) {
    if (widgetIds.includes(id) && !seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  for (const id of widgetIds) {
    if (!seen.has(id)) {
      result.push(id);
      seen.add(id);
    }
  }

  return result;
}
