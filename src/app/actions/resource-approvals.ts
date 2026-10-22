"use server";

import { revalidatePath, unstable_noStore as noStore } from "next/cache";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";
import {
  RESOURCE_APPROVAL_APPROVED,
  RESOURCE_APPROVAL_PENDING,
  textValue,
  type PendingResourceApproval,
  type ResourceApprovalKind,
} from "@/lib/resource-approval";
import { lookupSubcontractorIdForAuthUser } from "@/lib/subcontractor-auth";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatDateOnly } from "@/lib/scheduler-utils";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import { applyWorkerSwmsWorkflowRules } from "@/lib/worker-swms-auto-assign";
import { notifyWorkersOfSwmsAssignment } from "@/lib/swms-assignment-notify";
import { resolveActiveOrganisationId } from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";

const PLANT_TABLES = ["plant", "plant_equipment", "subcontractor_plant"] as const;
const WORKER_CALENDAR_TABLES = ["worker_calendar", "worker_calendar_events"] as const;
const PLANT_CALENDAR_TABLES = ["plant_calendar", "plant_calendar_events"] as const;

type ActionResult = { error: string | null };

async function requireUser(): Promise<{ user: User } | { error: string }> {
  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await session.auth.getUser();
  if (error) return { error: error.message };
  if (!user) return { error: "Not authenticated." };
  return { user };
}

function requireAdminClient(): { admin: SupabaseClient } | { error: string } {
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server configuration error." };
  }
  return { admin: createSupabaseAdminClient() };
}

async function requireAdminUser(
  admin: SupabaseClient,
  user: User
): Promise<string | null> {
  const match = await matchWorkerForAuthUser(admin, user);
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = normalizeSecurityRole(
    match?.securityRole ??
      (typeof profile?.role === "string" ? profile.role : null)
  );
  if (!canAccessAdminConsole(role)) {
    return "You do not have permission to approve resources.";
  }
  return null;
}

async function insertWithColumnRetry(
  admin: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await admin.from(table).insert([current]);
    if (!error) return null;
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    const lower = error.message.toLowerCase();
    if (lower.includes("duplicate") || lower.includes("unique")) return null;
    return error.message;
  }
  return `Could not insert into ${table}.`;
}

async function upsertWithColumnRetry(
  admin: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  onConflict: string
): Promise<string | null> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await admin.from(table).upsert(current, { onConflict });
    if (!error) return null;
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    const lower = error.message.toLowerCase();
    if (
      lower.includes("no unique") ||
      lower.includes("on conflict") ||
      lower.includes("constraint")
    ) {
      return insertWithColumnRetry(admin, table, current);
    }
    return error.message;
  }
  return `Could not upsert ${table}.`;
}

async function assertProjectAccess(
  admin: SupabaseClient,
  subcontractorId: string,
  projectId: string
): Promise<string | null> {
  const { data, error } = await admin
    .from("project_subcontractors")
    .select("project_id")
    .eq("subcontractor_id", subcontractorId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error && !/does not exist|schema cache/i.test(error.message) && !data) {
    const { data: sub } = await admin
      .from("subcontractors")
      .select("assigned_project_ids")
      .eq("id", subcontractorId)
      .maybeSingle();
    const assigned = (sub as { assigned_project_ids?: unknown } | null)
      ?.assigned_project_ids;
    if (Array.isArray(assigned) && assigned.map(textValue).includes(projectId)) {
      return null;
    }
    return error.message;
  }
  if (data) return null;
  const { data: sub } = await admin
    .from("subcontractors")
    .select("assigned_project_ids")
    .eq("id", subcontractorId)
    .maybeSingle();
  const assigned = (sub as { assigned_project_ids?: unknown } | null)
    ?.assigned_project_ids;
  if (Array.isArray(assigned) && assigned.map(textValue).includes(projectId)) {
    return null;
  }
  return "You do not have access to that project.";
}

async function assertOwnedWorker(
  admin: SupabaseClient,
  subcontractorId: string,
  workerId: string
): Promise<{ error: string | null; organisationId: string | null }> {
  const { data, error } = await admin
    .from("workers")
    .select("id, subcontractor_id, organisation_id")
    .eq("id", workerId)
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();
  if (error) return { error: error.message, organisationId: null };
  if (!data) {
    return { error: "That worker is not in your company register.", organisationId: null };
  }
  return {
    error: null,
    organisationId: textValue((data as { organisation_id?: unknown }).organisation_id) || null,
  };
}

async function assertOwnedPlant(
  admin: SupabaseClient,
  subcontractorId: string,
  plantId: string
): Promise<{ error: string | null; table: string | null; organisationId: string | null }> {
  for (const table of PLANT_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select("id, subcontractor_id, organisation_id")
      .eq("id", plantId)
      .eq("subcontractor_id", subcontractorId)
      .maybeSingle();
    if (error) continue;
    if (data) {
      return {
        error: null,
        table,
        organisationId:
          textValue((data as { organisation_id?: unknown }).organisation_id) || null,
      };
    }
  }
  return {
    error: "That plant item is not in your company register.",
    table: null,
    organisationId: null,
  };
}

async function resolveCallerSubcontractorId(
  admin: SupabaseClient,
  user: User,
  requestedId: string
): Promise<string | null> {
  const linked = await lookupSubcontractorIdForAuthUser(admin, user);
  if (linked && linked === requestedId) return linked;
  if (linked) return null;
  return null;
}

function stampOrgId(organisationId: string | null): string | null {
  const active = resolveActiveOrganisationId();
  return organisationId || active || null;
}

async function resolveApprovalOrganisationId(): Promise<string | null> {
  return (
    (await resolveActiveOrganisationIdFromCookies()) ||
    resolveActiveOrganisationId()
  );
}

function rowBelongsToActiveOrg(
  rowOrg: string | null,
  projectOrg: string | null,
  orgId: string
): boolean {
  if (rowOrg && rowOrg !== orgId) return false;
  if (projectOrg && projectOrg !== orgId) return false;
  return true;
}

async function syncWorkerCalendar(
  admin: SupabaseClient,
  input: {
    workerId: string;
    workerName: string;
    projectId: string;
    projectName: string;
    startDate: string;
  }
): Promise<void> {
  const payload = {
    worker_id: input.workerId,
    worker_name: input.workerName,
    project_id: input.projectId,
    project_name: input.projectName,
    start_date: input.startDate,
    event_date: input.startDate,
    end_date: null,
    status: "Assigned",
    event_type: "other",
    title: input.projectName || "Project assignment",
    notes: "Subcontractor assignment — no timesheet",
    requires_timesheet: false,
    is_subcontractor: true,
    source: "subcontractor_portal",
    approval_status: RESOURCE_APPROVAL_APPROVED,
  };
  for (const table of WORKER_CALENDAR_TABLES) {
    await insertWithColumnRetry(admin, table, payload);
  }
}

async function syncPlantCalendar(
  admin: SupabaseClient,
  input: {
    plantId: string;
    projectId: string;
    projectName: string;
    startDate: string;
  }
): Promise<void> {
  const payload = {
    plant_id: input.plantId,
    project_id: input.projectId,
    project_name: input.projectName,
    start_date: input.startDate,
    event_date: input.startDate,
    end_date: null,
    status: "Assigned",
    event_type: "other",
    title: input.projectName || "Project assignment",
    notes: "Subcontractor assignment — no timesheet",
    requires_timesheet: false,
    is_subcontractor: true,
    source: "subcontractor_portal",
    approval_status: RESOURCE_APPROVAL_APPROVED,
  };
  for (const table of PLANT_CALENDAR_TABLES) {
    await insertWithColumnRetry(admin, table, payload);
  }
}

async function insertApprovalNotification(
  admin: SupabaseClient,
  input: {
    subcontractorId: string;
    message: string;
    projectId: string;
    resourceId: string;
    kind: ResourceApprovalKind;
  }
): Promise<void> {
  const { data: sub } = await admin
    .from("subcontractors")
    .select("id, user_id, auth_user_id, email, contact_email")
    .eq("id", input.subcontractorId)
    .maybeSingle();
  const row = (sub ?? {}) as unknown as Record<string, unknown>;
  const authUserId =
    textValue(row.user_id) || textValue(row.auth_user_id) || null;

  let payload: Record<string, unknown> = {
    user_id: authUserId,
    recipient_id: authUserId,
    title: "Assignment approved",
    message: input.message,
    type: "approved",
    read: false,
    is_read: false,
    subcontractor_id: input.subcontractorId,
    metadata: {
      kind: input.kind,
      project_id: input.projectId,
      resource_id: input.resourceId,
      subcontractor_id: input.subcontractorId,
    },
  };

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await admin.from("notifications").insert([payload]);
    if (!error) return;
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }
    console.warn("[resource-approval] notification insert failed:", error.message);
    return;
  }
}

export async function requestSubcontractorWorkerAssignment(input: {
  subcontractorId: string;
  workerId: string;
  workerName: string;
  projectId: string;
  projectName: string;
}): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return adminClient;
  const { admin } = adminClient;

  const callerSubId = await resolveCallerSubcontractorId(
    admin,
    auth.user,
    input.subcontractorId
  );
  if (!callerSubId) return { error: "You cannot assign resources for that company." };

  const accessError = await assertProjectAccess(admin, callerSubId, input.projectId);
  if (accessError) return { error: accessError };
  const owner = await assertOwnedWorker(admin, callerSubId, input.workerId);
  if (owner.error) return { error: owner.error };

  const organisationId = stampOrgId(owner.organisationId);
  const now = new Date().toISOString();
  const startDate = formatDateOnly(new Date());

  const workerRowError = await upsertWithColumnRetry(
    admin,
    "project_workers",
    {
      project_id: input.projectId,
      worker_id: input.workerId,
      subcontractor_id: callerSubId,
      organisation_id: organisationId,
      approval_status: RESOURCE_APPROVAL_PENDING,
      updated_at: now,
    },
    "project_id,worker_id"
  );
  if (workerRowError) return { error: workerRowError };

  const assignmentError = await upsertWithColumnRetry(
    admin,
    "project_worker_assignments",
    {
      project_id: input.projectId,
      worker_id: input.workerId,
      worker_name: input.workerName,
      project_name: input.projectName,
      status: "Pending",
      start_date: startDate,
      end_date: null,
      approval_status: RESOURCE_APPROVAL_PENDING,
      subcontractor_id: callerSubId,
      organisation_id: organisationId,
      updated_at: now,
    },
    "project_id,worker_id"
  );
  if (assignmentError) return { error: assignmentError };

  revalidatePath("/subcontractor");
  revalidatePath(`/subcontractor/projects/${input.projectId}`);
  revalidatePath("/admin/dashboard");
  return { error: null };
}

export async function requestSubcontractorPlantAssignment(input: {
  subcontractorId: string;
  plantId: string;
  projectId: string;
  projectName: string;
}): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return adminClient;
  const { admin } = adminClient;

  const callerSubId = await resolveCallerSubcontractorId(
    admin,
    auth.user,
    input.subcontractorId
  );
  if (!callerSubId) return { error: "You cannot assign resources for that company." };

  const accessError = await assertProjectAccess(admin, callerSubId, input.projectId);
  if (accessError) return { error: accessError };
  const owner = await assertOwnedPlant(admin, callerSubId, input.plantId);
  if (owner.error || !owner.table) return { error: owner.error };

  const organisationId = stampOrgId(owner.organisationId);
  const now = new Date().toISOString();

  let plantPayload: Record<string, unknown> = {
    approval_status: RESOURCE_APPROVAL_PENDING,
    pending_project_id: input.projectId,
    assigned_project_id: input.projectId,
    assigned_project_name: input.projectName,
    updated_at: now,
  };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { error } = await admin
      .from(owner.table)
      .update(plantPayload)
      .eq("id", input.plantId);
    if (!error) break;
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in plantPayload) {
      plantPayload = stripMissingColumn(plantPayload, missing);
      continue;
    }
    return { error: error.message };
  }

  const junctionError = await upsertWithColumnRetry(
    admin,
    "project_plant_assignments",
    {
      plant_id: input.plantId,
      project_id: input.projectId,
      project_name: input.projectName,
      status: "Pending",
      start_date: formatDateOnly(new Date()),
      end_date: null,
      approval_status: RESOURCE_APPROVAL_PENDING,
      subcontractor_id: callerSubId,
      organisation_id: organisationId,
      updated_at: now,
    },
    "project_id,plant_id"
  );
  if (junctionError) return { error: junctionError };

  revalidatePath("/subcontractor");
  revalidatePath(`/subcontractor/projects/${input.projectId}`);
  revalidatePath("/admin/dashboard");
  return { error: null };
}

export async function listPendingResourceApprovals(): Promise<PendingResourceApproval[]> {
  noStore();
  const auth = await requireUser();
  if ("error" in auth) return [];
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return [];
  const { admin } = adminClient;
  const denied = await requireAdminUser(admin, auth.user);
  if (denied) return [];

  const orgId = await resolveApprovalOrganisationId();

  const pending: PendingResourceApproval[] = [];

  const { data: workerRows } = await admin
    .from("project_workers")
    .select("id, project_id, worker_id, subcontractor_id, organisation_id, approval_status")
    .eq("approval_status", RESOURCE_APPROVAL_PENDING);

  const workerIds = [
    ...new Set((workerRows ?? []).map((row) => textValue((row as { worker_id?: unknown }).worker_id))),
  ].filter(Boolean);
  const projectIds = [
    ...new Set((workerRows ?? []).map((row) => textValue((row as { project_id?: unknown }).project_id))),
  ].filter(Boolean);

  const { data: assignmentRows } = await admin
    .from("project_worker_assignments")
    .select(
      "id, project_id, worker_id, worker_name, project_name, subcontractor_id, organisation_id, approval_status"
    )
    .eq("approval_status", RESOURCE_APPROVAL_PENDING);

  for (const row of assignmentRows ?? []) {
    const record = row as unknown as Record<string, unknown>;
    const rowOrg = textValue(record.organisation_id) || null;
    if (orgId && rowOrg && rowOrg !== orgId) continue;
    const projectId = textValue(record.project_id);
    const workerId = textValue(record.worker_id);
    if (!projectId || !workerId) continue;
    projectIds.push(projectId);
    workerIds.push(workerId);
    pending.push({
      id: `worker:${textValue(record.id) || `${projectId}:${workerId}`}`,
      kind: "worker",
      resourceId: workerId,
      resourceName: textValue(record.worker_name) || "Worker",
      projectId,
      projectName: textValue(record.project_name) || "Project",
      subcontractorId: textValue(record.subcontractor_id) || null,
      approvalStatus: RESOURCE_APPROVAL_PENDING,
    });
  }

  for (const row of workerRows ?? []) {
    const record = row as unknown as Record<string, unknown>;
    const rowOrg = textValue(record.organisation_id) || null;
    if (orgId && rowOrg && rowOrg !== orgId) continue;
    const projectId = textValue(record.project_id);
    const workerId = textValue(record.worker_id);
    if (!projectId || !workerId) continue;
    if (pending.some((item) => item.kind === "worker" && item.resourceId === workerId && item.projectId === projectId)) {
      continue;
    }
    pending.push({
      id: `worker:${textValue(record.id) || `${projectId}:${workerId}`}`,
      kind: "worker",
      resourceId: workerId,
      resourceName: "Worker",
      projectId,
      projectName: "Project",
      subcontractorId: textValue(record.subcontractor_id) || null,
      approvalStatus: RESOURCE_APPROVAL_PENDING,
    });
  }

  const uniqueWorkerIds = [...new Set(workerIds.filter(Boolean))];
  if (uniqueWorkerIds.length > 0) {
    const { data: workers } = await admin
      .from("workers")
      .select("id, full_name, worker_name, first_name, last_name, email")
      .in("id", uniqueWorkerIds);
    const names = new Map(
      (workers ?? []).map((row) => {
        const record = row as unknown as Record<string, unknown>;
        const name =
          textValue(record.full_name) ||
          textValue(record.worker_name) ||
          [textValue(record.first_name), textValue(record.last_name)].filter(Boolean).join(" ") ||
          textValue(record.email) ||
          "Worker";
        return [textValue(record.id), name] as const;
      })
    );
    for (const item of pending) {
      if (item.kind === "worker") {
        item.resourceName = names.get(item.resourceId) || item.resourceName;
      }
    }
  }

  const plantSelect =
    "id, make, model, unit_number, serial_number, assigned_project_id, pending_project_id, assigned_project_name, organisation_id, subcontractor_id, approval_status";
  const { data: primaryPlantRows } = await admin
    .from("plant")
    .select(plantSelect)
    .eq("approval_status", RESOURCE_APPROVAL_PENDING);

  for (const table of PLANT_TABLES) {
    const { data: plantRows, error } =
      table === "plant"
        ? { data: primaryPlantRows, error: null }
        : await admin
            .from(table)
            .select(plantSelect)
            .eq("approval_status", RESOURCE_APPROVAL_PENDING);
    if (error) continue;
    for (const row of plantRows ?? []) {
      const record = row as unknown as Record<string, unknown>;
      const rowOrg = textValue(record.organisation_id) || null;
      if (orgId && rowOrg && rowOrg !== orgId) continue;
      const projectId =
        textValue(record.pending_project_id) || textValue(record.assigned_project_id);
      if (!projectId) continue;
      if (
        pending.some(
          (item) =>
            item.kind === "plant" &&
            item.resourceId === textValue(record.id) &&
            item.projectId === projectId
        )
      ) {
        continue;
      }
      pending.push({
        id: `plant:${textValue(record.id)}:${projectId}`,
        kind: "plant",
        resourceId: textValue(record.id),
        resourceName:
          [textValue(record.make), textValue(record.model), textValue(record.unit_number)]
            .filter(Boolean)
            .join(" ") || "Plant",
        projectId,
        projectName: textValue(record.assigned_project_name) || "Project",
        subcontractorId: textValue(record.subcontractor_id) || null,
        approvalStatus: RESOURCE_APPROVAL_PENDING,
      });
    }
  }

  const { data: plantAssignmentRows } = await admin
    .from("project_plant_assignments")
    .select(
      "id, plant_id, project_id, project_name, subcontractor_id, organisation_id, approval_status"
    )
    .eq("approval_status", RESOURCE_APPROVAL_PENDING);
  for (const row of plantAssignmentRows ?? []) {
    const record = row as unknown as Record<string, unknown>;
    const rowOrg = textValue(record.organisation_id) || null;
    if (orgId && rowOrg && rowOrg !== orgId) continue;
    const projectId = textValue(record.project_id);
    const plantId = textValue(record.plant_id);
    if (!projectId || !plantId) continue;
    if (
      pending.some(
        (item) =>
          item.kind === "plant" && item.resourceId === plantId && item.projectId === projectId
      )
    ) {
      continue;
    }
    pending.push({
      id: `plant:${textValue(record.id) || `${plantId}:${projectId}`}`,
      kind: "plant",
      resourceId: plantId,
      resourceName: "Plant",
      projectId,
      projectName: textValue(record.project_name) || "Project",
      subcontractorId: textValue(record.subcontractor_id) || null,
      approvalStatus: RESOURCE_APPROVAL_PENDING,
    });
  }

  const uniqueProjectIds = [...new Set(pending.map((item) => item.projectId))];
  const projectOrgs = new Map<string, string | null>();
  if (uniqueProjectIds.length > 0) {
    let projectSelect = "id, project_name, name, organisation_id";
    let { data: projects, error: projectError } = await admin
      .from("projects")
      .select(projectSelect)
      .in("id", uniqueProjectIds);
    if (projectError && /organisation_id/i.test(projectError.message)) {
      projectSelect = "id, project_name, name";
      ({ data: projects, error: projectError } = await admin
        .from("projects")
        .select(projectSelect)
        .in("id", uniqueProjectIds));
    }
    const names = new Map(
      (projects ?? []).map((row) => {
        const record = row as unknown as Record<string, unknown>;
        const id = textValue(record.id);
        projectOrgs.set(id, textValue(record.organisation_id) || null);
        return [
          id,
          textValue(record.project_name) || textValue(record.name) || "Project",
        ] as const;
      })
    );
    for (const item of pending) {
      item.projectName = names.get(item.projectId) || item.projectName;
    }
  }

  if (!orgId) return pending;
  return pending.filter((item) =>
    rowBelongsToActiveOrg(null, projectOrgs.get(item.projectId) ?? null, orgId)
  );
}

export async function approveResourceAssignment(input: {
  kind: ResourceApprovalKind;
  resourceId: string;
  projectId: string;
  projectName?: string;
  resourceName?: string;
  subcontractorId?: string | null;
}): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return adminClient;
  const { admin } = adminClient;
  const denied = await requireAdminUser(admin, auth.user);
  if (denied) return { error: denied };

  const orgId = await resolveApprovalOrganisationId();
  if (!orgId) return { error: "No active organisation selected." };

  const now = new Date().toISOString();
  const startDate = formatDateOnly(new Date());
  const projectName = input.projectName?.trim() || "the project";
  const resourceName = input.resourceName?.trim() || (input.kind === "plant" ? "plant" : "worker");

  if (input.kind === "worker") {
    await admin
      .from("project_workers")
      .update({ approval_status: RESOURCE_APPROVAL_APPROVED, updated_at: now })
      .eq("worker_id", input.resourceId)
      .eq("project_id", input.projectId);

    await admin
      .from("project_worker_assignments")
      .update({
        approval_status: RESOURCE_APPROVAL_APPROVED,
        status: "Active",
        updated_at: now,
      })
      .eq("worker_id", input.resourceId)
      .eq("project_id", input.projectId);

    const { data: worker } = await admin
      .from("workers")
      .select("id, full_name, worker_name, assigned_project_ids, organisation_id, subcontractor_id")
      .eq("id", input.resourceId)
      .maybeSingle();
    const workerRow = (worker ?? {}) as unknown as Record<string, unknown>;
    const existingIds = Array.isArray(workerRow.assigned_project_ids)
      ? workerRow.assigned_project_ids.map(textValue).filter(Boolean)
      : [];
    if (!existingIds.includes(input.projectId)) existingIds.push(input.projectId);

    let workerUpdate: Record<string, unknown> = {
      assigned_project_id: input.projectId,
      assigned_project_ids: existingIds,
      assigned_project_name: projectName,
      updated_at: now,
    };
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const { error } = await admin
        .from("workers")
        .update(workerUpdate)
        .eq("id", input.resourceId);
      if (!error) break;
      const missing = parseMissingColumnFromError(error.message);
      if (missing && missing in workerUpdate) {
        workerUpdate = stripMissingColumn(workerUpdate, missing);
        continue;
      }
      break;
    }

    await syncWorkerCalendar(admin, {
      workerId: input.resourceId,
      workerName: resourceName,
      projectId: input.projectId,
      projectName,
      startDate,
    });

    try {
      await applyWorkerSwmsWorkflowRules(admin, {
        workerId: input.resourceId,
        projectIds: [input.projectId],
      });
      await notifyWorkersOfSwmsAssignment(admin, {
        workerIds: [input.resourceId],
        swmsTitle: `SWMS — ${projectName}`,
      });
    } catch (cause) {
      console.warn("[resource-approval] SWMS trigger failed:", cause);
    }

    const subcontractorId =
      input.subcontractorId || textValue(workerRow.subcontractor_id) || null;
    if (subcontractorId) {
      await insertApprovalNotification(admin, {
        subcontractorId,
        message: `Your worker ${resourceName} has been approved for ${projectName}.`,
        projectId: input.projectId,
        resourceId: input.resourceId,
        kind: "worker",
      });
    }
  } else {
    for (const table of PLANT_TABLES) {
      let plantUpdate: Record<string, unknown> = {
        approval_status: RESOURCE_APPROVAL_APPROVED,
        assigned_project_id: input.projectId,
        assigned_project_name: projectName,
        pending_project_id: null,
        updated_at: now,
      };
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { error } = await admin
          .from(table)
          .update(plantUpdate)
          .eq("id", input.resourceId);
        if (!error) break;
        const missing = parseMissingColumnFromError(error.message);
        if (missing && missing in plantUpdate) {
          plantUpdate = stripMissingColumn(plantUpdate, missing);
          continue;
        }
        break;
      }
    }

    await admin
      .from("project_plant_assignments")
      .update({
        approval_status: RESOURCE_APPROVAL_APPROVED,
        status: "Assigned",
        updated_at: now,
      })
      .eq("plant_id", input.resourceId)
      .eq("project_id", input.projectId);

    await syncPlantCalendar(admin, {
      plantId: input.resourceId,
      projectId: input.projectId,
      projectName,
      startDate,
    });

    if (input.subcontractorId) {
      await insertApprovalNotification(admin, {
        subcontractorId: input.subcontractorId,
        message: `Your plant ${resourceName} has been approved for ${projectName}.`,
        projectId: input.projectId,
        resourceId: input.resourceId,
        kind: "plant",
      });
    }
  }

  revalidatePath("/admin/dashboard");
  revalidatePath("/");
  revalidatePath("/subcontractor");
  revalidatePath(`/subcontractor/projects/${input.projectId}`);
  return { error: null };
}

export async function listSubcontractorApprovedAlerts(): Promise<
  Array<{ id: string; message: string }>
> {
  const auth = await requireUser();
  if ("error" in auth) return [];
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return [];
  const { admin } = adminClient;
  const subcontractorId = await lookupSubcontractorIdForAuthUser(admin, auth.user);
  if (!subcontractorId) return [];

  const { data, error } = await admin
    .from("notifications")
    .select("id, message, type, read, is_read, user_id, recipient_id, subcontractor_id, metadata")
    .eq("type", "approved")
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];

  return (data as unknown as Record<string, unknown>[])
    .filter((row) => {
      const read = row.read === true || row.is_read === true;
      if (read) return false;
      if (textValue(row.user_id) === auth.user.id) return true;
      if (textValue(row.recipient_id) === auth.user.id) return true;
      if (textValue(row.subcontractor_id) === subcontractorId) return true;
      const metadata = row.metadata as unknown as Record<string, unknown> | null;
      return textValue(metadata?.subcontractor_id) === subcontractorId;
    })
    .map((row) => ({
      id: textValue(row.id),
      message: textValue(row.message) || "A resource was approved.",
    }))
    .filter((row) => row.id);
}

export async function dismissSubcontractorApprovedAlert(
  notificationId: string
): Promise<ActionResult> {
  const auth = await requireUser();
  if ("error" in auth) return auth;
  const adminClient = requireAdminClient();
  if ("error" in adminClient) return adminClient;
  const { admin } = adminClient;
  const id = notificationId.trim();
  if (!id) return { error: "Missing notification." };

  let payload: Record<string, unknown> = { read: true, is_read: true };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { error } = await admin.from("notifications").update(payload).eq("id", id);
    if (!error) return { error: null };
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }
    return { error: error.message };
  }
  return { error: null };
}
