import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyWorkerInductionWorkflowRulesAdmin,
  applyWorkerInductionWorkflowRulesForWorker,
  type InductionAutoAssignResult,
} from "@/lib/worker-induction-auto-assign";
import {
  applyWorkerSwmsWorkflowRulesAdmin,
  applyWorkerSwmsWorkflowRulesForWorker,
  type SwmsAutoAssignResult,
} from "@/lib/worker-swms-auto-assign";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export type WorkerAssignmentEngineInput = {
  workerId: string;
  /** Worker state/region (NSW, WA, ACT, NZ). Runs company induction matching. */
  state?: string | null;
  syncCompanyFromWorkerState?: boolean;
  projectIds?: Array<string | null | undefined>;
  projectNames?: Record<string, string | null | undefined>;
  includeExistingProjects?: boolean;
  /** Company-wide SWMS (not site-specific). Default false on project moves. */
  assignCompanySwms?: boolean;
};

export type WorkerAssignmentEngineResult = {
  inductions: InductionAutoAssignResult;
  swms: SwmsAutoAssignResult;
};

function emptyInductions(warnings: string[] = []): InductionAutoAssignResult {
  return { companyAssigned: 0, projectAssigned: 0, skipped: 0, warnings };
}

function emptySwms(warnings: string[] = []): SwmsAutoAssignResult {
  return { companyAssigned: 0, projectAssigned: 0, skipped: 0, warnings };
}

/**
 * Central assignment engine:
 * - Site-specific SWMS for each target project → swms_assignments (status Pending)
 * - Company inductions matching worker state
 * - Project inductions linked to target_project_id
 *
 * Callers are idempotent: existing assignments are skipped (pre-check + unique index).
 */
export async function applyAutomaticWorkerAssignments(
  admin: SupabaseClient,
  input: WorkerAssignmentEngineInput
): Promise<WorkerAssignmentEngineResult> {
  const workerId = input.workerId.trim();
  if (!workerId) {
    const warning = ["Missing worker id."];
    return {
      inductions: emptyInductions(warning),
      swms: emptySwms(warning),
    };
  }

  const inductions = await applyWorkerInductionWorkflowRulesAdmin(admin, workerId, {
    state: input.state,
    syncCompanyFromWorkerState: input.syncCompanyFromWorkerState,
    projectIds: input.projectIds,
    projectNames: input.projectNames,
    includeExistingProjects: input.includeExistingProjects,
  });

  const swms = await applyWorkerSwmsWorkflowRulesAdmin(admin, workerId, {
    assignCompanySwms: input.assignCompanySwms === true,
    projectIds: input.projectIds,
    includeExistingProjects: input.includeExistingProjects,
  });

  return { inductions, swms };
}

/** Onboarding completion: state company induction + project induction + company/site SWMS. */
export async function onWorkerOnboardingCompleted(
  admin: SupabaseClient,
  workerId: string,
  input?: {
    state?: string | null;
    projectIds?: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
  }
): Promise<WorkerAssignmentEngineResult> {
  return applyAutomaticWorkerAssignments(admin, {
    workerId,
    state: input?.state || undefined,
    syncCompanyFromWorkerState: true,
    projectIds: input?.projectIds,
    projectNames: input?.projectNames,
    includeExistingProjects: true,
    assignCompanySwms: true,
  });
}

/** Admin assigns/moves a worker onto a project: site SWMS + project + state inductions. */
export async function onWorkerProjectAssigned(
  admin: SupabaseClient,
  workerId: string,
  input: {
    projectIds: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
    state?: string | null;
  }
): Promise<WorkerAssignmentEngineResult> {
  return applyAutomaticWorkerAssignments(admin, {
    workerId,
    state: input.state,
    syncCompanyFromWorkerState: input.state === undefined,
    projectIds: input.projectIds,
    projectNames: input.projectNames,
    includeExistingProjects: false,
    assignCompanySwms: false,
  });
}

export async function applyAutomaticWorkerAssignmentsWithAdmin(
  input: WorkerAssignmentEngineInput
): Promise<WorkerAssignmentEngineResult> {
  if (!isSupabaseAdminConfigured()) {
    const warning = ["SUPABASE_SERVICE_ROLE_KEY is not configured."];
    return {
      inductions: emptyInductions(warning),
      swms: emptySwms(warning),
    };
  }
  const admin = createSupabaseAdminClient();
  return applyAutomaticWorkerAssignments(admin, input);
}

/** Browser entry — uses authenticated auto-assign APIs. */
export async function applyAutomaticWorkerAssignmentsForWorker(
  input: WorkerAssignmentEngineInput
): Promise<WorkerAssignmentEngineResult> {
  const workerId = input.workerId.trim();
  const empty: WorkerAssignmentEngineResult = {
    inductions: emptyInductions(),
    swms: emptySwms(),
  };
  if (!workerId) return empty;

  if (typeof window !== "undefined") {
    try {
      const response = await fetch("/api/workers/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId,
          state: input.state ?? null,
          syncCompanyFromWorkerState: input.syncCompanyFromWorkerState === true,
          projectIds: input.projectIds ?? [],
          projectNames: input.projectNames ?? {},
          includeExistingProjects: input.includeExistingProjects === true,
          assignCompanySwms: input.assignCompanySwms === true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | WorkerAssignmentEngineResult
        | { error?: string }
        | null;
      if (!response.ok) {
        console.warn(
          "[worker-assignment] API assignment skipped:",
          payload && "error" in payload ? payload.error : payload
        );
        return empty;
      }
      return {
        inductions:
          payload && "inductions" in payload ? payload.inductions : empty.inductions,
        swms: payload && "swms" in payload ? payload.swms : empty.swms,
      };
    } catch (cause) {
      console.warn("[worker-assignment] client workflow failed:", cause);
      return empty;
    }
  }

  const [inductions, swms] = await Promise.all([
    applyWorkerInductionWorkflowRulesForWorker(workerId, {
      state: input.state,
      syncCompanyFromWorkerState: input.syncCompanyFromWorkerState,
      projectIds: input.projectIds,
      projectNames: input.projectNames,
      includeExistingProjects: input.includeExistingProjects,
    }),
    applyWorkerSwmsWorkflowRulesForWorker(workerId, {
      assignCompanySwms: input.assignCompanySwms,
      projectIds: input.projectIds,
      includeExistingProjects: input.includeExistingProjects,
    }),
  ]);

  return { inductions, swms };
}
