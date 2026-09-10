import type {
  SaveChecklistItemInput,
  WorkerItcChecklistEntryRow,
  WorkerItcPlanRow,
  WorkerItcRegisterRow,
} from "./worker-itc-admin-mutations";
import { ITC_NETWORK_ERROR } from "./itp-itc-payload";

async function readJson<T>(response: Response): Promise<{ data?: T; error: string | null }> {
  try {
    const payload = (await response.json()) as { error?: string } & T;
    if (!response.ok) {
      return { error: payload.error ?? "Request failed" };
    }
    return { data: payload, error: null };
  } catch {
    return { error: ITC_NETWORK_ERROR };
  }
}

export async function fetchWorkerItcPlan(
  projectId: string
): Promise<{ plan: WorkerItcPlanRow | null; error: string | null }> {
  try {
    const response = await fetch(
      `/api/worker/itc/plan?projectId=${encodeURIComponent(projectId)}`
    );
    const result = await readJson<{ plan: WorkerItcPlanRow | null }>(response);
    return { plan: result.data?.plan ?? null, error: result.error };
  } catch {
    return { plan: null, error: ITC_NETWORK_ERROR };
  }
}

export async function fetchWorkerItcRegister(
  projectId: string
): Promise<{ itcs: WorkerItcRegisterRow[]; error: string | null }> {
  try {
    const response = await fetch(
      `/api/worker/itc/register?projectId=${encodeURIComponent(projectId)}`
    );
    const result = await readJson<{ itcs: WorkerItcRegisterRow[] }>(response);
    return { itcs: result.data?.itcs ?? [], error: result.error };
  } catch {
    return { itcs: [], error: ITC_NETWORK_ERROR };
  }
}

export async function fetchWorkerItcDetail(itcId: string): Promise<{
  itc: WorkerItcRegisterRow | null;
  entries: WorkerItcChecklistEntryRow[];
  error: string | null;
}> {
  try {
    const response = await fetch(`/api/worker/itc/${encodeURIComponent(itcId)}`);
    const result = await readJson<{
      itc: WorkerItcRegisterRow | null;
      entries: WorkerItcChecklistEntryRow[];
    }>(response);
    return {
      itc: result.data?.itc ?? null,
      entries: result.data?.entries ?? [],
      error: result.error,
    };
  } catch {
    return { itc: null, entries: [], error: ITC_NETWORK_ERROR };
  }
}

export async function saveWorkerItcChecklist(input: {
  itcId: string;
  workerId: string;
  workerName: string;
  items: SaveChecklistItemInput[];
}): Promise<{ error: string | null }> {
  try {
    const response = await fetch("/api/worker/itc/checklist/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await readJson<{ ok?: boolean }>(response);
    return { error: result.error };
  } catch {
    return { error: ITC_NETWORK_ERROR };
  }
}

export async function completeWorkerItc(input: {
  itcId: string;
  workerId: string;
}): Promise<{ error: string | null }> {
  try {
    const response = await fetch(
      `/api/worker/itc/${encodeURIComponent(input.itcId)}/complete`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId: input.workerId }),
      }
    );
    const result = await readJson<{ ok?: boolean }>(response);
    return { error: result.error };
  } catch {
    return { error: ITC_NETWORK_ERROR };
  }
}

export async function uploadWorkerItcChecklistPhoto(input: {
  projectId: string;
  itcId: string;
  itemKey: string;
  file: File;
}): Promise<{ url: string | null; error: string | null }> {
  const formData = new FormData();
  formData.append("projectId", input.projectId);
  formData.append("itcId", input.itcId);
  formData.append("itemKey", input.itemKey);
  formData.append("file", input.file);

  try {
    const response = await fetch("/api/worker/itc/checklist/upload", {
      method: "POST",
      body: formData,
    });

    const result = await readJson<{ url?: string | null }>(response);
    return { url: result.data?.url ?? null, error: result.error };
  } catch {
    return { url: null, error: ITC_NETWORK_ERROR };
  }
}

export function getWorkerItcPinColor(status: string): string {
  if (status === "complete" || status === "completed") return "bg-emerald-500";
  if (status === "issue") return "bg-red-500";
  if (status === "in_progress" || status === "ongoing") return "bg-amber-400";
  return "bg-slate-400";
}

export function getWorkerItcStatusLabel(status: string): string {
  switch (status) {
    case "in_progress":
      return "In Progress";
    case "ongoing":
      return "Ongoing";
    case "complete":
    case "completed":
      return "Completed";
    case "issue":
      return "Issue";
    default:
      return "Not Started";
  }
}

export type {
  WorkerItcChecklistEntryRow,
  WorkerItcPlanRow,
  WorkerItcRegisterRow,
  SaveChecklistItemInput,
};
