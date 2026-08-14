import { supabase, isSupabaseConfigured } from "./supabase";
import { normalizeLogicRule } from "./induction-form-logic";

export type InductionFormBlockType =
  | "section_header"
  | "rich_text"
  | "pdf_viewer"
  | "text_input"
  | "checkbox"
  | "multi_checkbox"
  | "radio"
  | "signature";

export interface InductionFormBlock {
  id: string;
  type: InductionFormBlockType;
  label: string;
  content?: string;
  options?: string[];
  pdfUrl?: string;
  required?: boolean;
}

export type InductionFormLogicAction =
  | "show"
  | "hide"
  | "make_mandatory"
  | "make_optional"
  | "block_submission";

export interface InductionFormLogicCondition {
  field: string;
  equals?: string | boolean | number | null;
  not_equals?: string | boolean | number | null;
}

export type InductionFormLogicWhen =
  | InductionFormLogicCondition
  | { or: InductionFormLogicCondition[] };

export interface InductionFormLogicRule {
  field_id?: string;
  action: InductionFormLogicAction;
  when: InductionFormLogicWhen;
  message?: string;
}

export interface InductionFormTemplate {
  id: string;
  title: string;
  description: string | null;
  form_type: "Induction";
  scope: "company" | "project";
  project_id: string | null;
  status: "active" | "draft";
  blocks: InductionFormBlock[];
  schema_fields: InductionFormBlock[];
  logic_rules: InductionFormLogicRule[];
  copied_from_id: string | null;
  is_system_template?: boolean;
  system_template_key?: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormWorkerAssignment {
  id: string;
  form_id: string;
  worker_id: string;
  project_id: string | null;
  status: "pending" | "in_progress" | "completed";
  assigned_at: string;
  completed_at: string | null;
  assigned_by: string | null;
  form_title?: string;
  worker_name?: string;
  project_name?: string;
  assigned_by_name?: string;
  schema_fields?: InductionFormBlock[];
  blocks?: InductionFormBlock[];
  logic_rules?: InductionFormLogicRule[];
  responses?: Record<string, unknown>;
  signature_url?: string | null;
}

export interface FormAssignmentTemplateRef {
  id: string;
  title?: string | null;
  name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
}

export interface FormAssignmentWorkerRef {
  id: string;
  full_name?: string | null;
  name?: string | null;
  worker_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  assigned_project_id?: string | null;
  assigned_project_name?: string | null;
}

export interface FormAssignmentAssignedByRef {
  id?: string | null;
  full_name?: string | null;
  name?: string | null;
}

/** Columns allowed on form_worker_assignments write payloads. */
export const FORM_WORKER_ASSIGNMENT_SAVE_COLUMNS = [
  "form_id",
  "form_template_id",
  "template_id",
  "form_title",
  "title",
  "worker_id",
  "worker_name",
  "project_id",
  "project_name",
  "assigned_by",
  "assigned_by_id",
  "assigned_by_name",
  "status",
  "assigned_at",
  "updated_at",
] as const;

/** Alias/metadata columns stripped automatically when absent from the DB schema. */
const OPTIONAL_FORM_WORKER_ASSIGNMENT_COLUMNS = [
  "form_template_id",
  "template_id",
  "form_title",
  "title",
  "worker_name",
  "project_name",
  "assigned_by_id",
  "assigned_by_name",
] as const;

function stripUndefinedFromRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function stripNullAndUndefinedFromRecord(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(
      ([, value]) => value !== undefined && value !== null
    )
  );
}

function pickAssignmentSaveColumns(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    FORM_WORKER_ASSIGNMENT_SAVE_COLUMNS.filter((key) => key in record).map((key) => [
      key,
      record[key],
    ])
  );
}

import { getWorkerDisplayName } from "./worker-utils";

export function resolveWorkerDisplayName(worker: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  name?: string | null;
  worker_name?: string | null;
}): string {
  return getWorkerDisplayName(worker, "Worker");
}

export function resolveFormTemplateTitle(template: FormAssignmentTemplateRef): string {
  return (
    template.title?.trim() ||
    template.name?.trim() ||
    "Untitled Form"
  );
}

export function resolveFormTemplateId(template: FormAssignmentTemplateRef): string {
  const id = String(template.id ?? "").trim();
  if (!id) {
    throw new Error("Form template id is required for worker assignment.");
  }
  return id;
}

function resolveAssignmentProjectId(
  worker: FormAssignmentWorkerRef,
  template: FormAssignmentTemplateRef
): string | null {
  return worker.project_id || template.project_id || null;
}

function resolveAssignmentProjectName(
  worker: FormAssignmentWorkerRef,
  template: FormAssignmentTemplateRef
): string | null {
  return worker.project_name || template.project_name || null;
}

function resolveAssignedByName(
  assignedBy?: FormAssignmentAssignedByRef | null
): string {
  return (
    assignedBy?.full_name?.trim() ||
    assignedBy?.name?.trim() ||
    "Admin"
  );
}

/** Canonical write status for newly assigned induction forms. */
export const NEW_FORM_WORKER_ASSIGNMENT_STATUS = "Pending" as const;

/** Canonical write status when a worker completes an induction. */
export const COMPLETED_FORM_WORKER_ASSIGNMENT_STATUS = "Completed" as const;

const OUTSTANDING_ASSIGNMENT_STATUS_VALUES = [
  "pending",
  "Pending",
  "in_progress",
  "In Progress",
] as const;

export function resolveNewAssignmentWriteStatus(): typeof NEW_FORM_WORKER_ASSIGNMENT_STATUS {
  return NEW_FORM_WORKER_ASSIGNMENT_STATUS;
}

function finalizeAssignmentWritePayload(
  row: Record<string, unknown>
): Record<string, unknown> {
  const formId = String(row.form_id ?? row.form_template_id ?? row.template_id ?? "").trim();
  const payload = stripNullAndUndefinedFromRecord({ ...row });

  if (formId) {
    payload.form_id = formId;
    payload.form_template_id = formId;
    payload.template_id = formId;
  }

  payload.status = resolveNewAssignmentWriteStatus();

  if (!payload.form_title) {
    payload.form_title = "Induction Form";
  }

  return payload;
}

function normalizeAssignmentStatus(
  value: unknown
): FormWorkerAssignment["status"] {
  const status = String(value ?? "pending")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (status === "in_progress") return "in_progress";
  if (status === "completed") return "completed";
  return "pending";
}

export function isOutstandingAssignmentStatus(value: unknown): boolean {
  const normalized = normalizeAssignmentStatus(value);
  return normalized === "pending" || normalized === "in_progress";
}

export function isCompletedAssignmentStatus(value: unknown): boolean {
  return normalizeAssignmentStatus(value) === "completed";
}

export interface FormTemplateCompletionSummary {
  total: number;
  completed: number;
  pending: number;
  completionRate: number;
}

export function summarizeFormTemplateAssignments(
  assignments: FormWorkerAssignment[]
): FormTemplateCompletionSummary {
  const total = assignments.length;
  const completed = assignments.filter((row) => isCompletedAssignmentStatus(row.status)).length;
  const pending = total - completed;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, completed, pending, completionRate };
}

function assignmentMatchesFormTemplateId(
  assignment: FormWorkerAssignment | Record<string, unknown>,
  formTemplateId: string
): boolean {
  return resolveAssignmentFormTemplateId(assignment) === formTemplateId;
}

export async function fetchFormTemplateAssignments(
  formTemplateId: string
): Promise<{ assignments: FormWorkerAssignment[]; error: string | null }> {
  const templateId = formTemplateId.trim();
  if (!templateId) {
    return { assignments: [], error: "Form template id is required." };
  }

  if (!isSupabaseConfigured()) {
    return {
      assignments: readLocalAssignments()
        .filter((row) => assignmentMatchesFormTemplateId(row, templateId))
        .sort(
          (a, b) =>
            new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
        ),
      error: null,
    };
  }

  try {
    let query = supabase
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .select("*")
      .eq("form_id", templateId)
      .order("assigned_at", { ascending: false });

    let { data, error } = await query;

    if (error) {
      const fallback = await supabase
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("*")
        .or(
          `form_id.eq.${templateId},form_template_id.eq.${templateId},template_id.eq.${templateId}`
        )
        .order("assigned_at", { ascending: false });

      data = fallback.data;
      error = fallback.error;
    }

    if (error) {
      if (isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
        return {
          assignments: readLocalAssignments().filter((row) =>
            assignmentMatchesFormTemplateId(row, templateId)
          ),
          error: null,
        };
      }
      return {
        assignments: readLocalAssignments().filter((row) =>
          assignmentMatchesFormTemplateId(row, templateId)
        ),
        error: formatAssignmentQueryError("load form assignments from", error),
      };
    }

    return {
      assignments: mapAssignmentQueryRows(data),
      error: null,
    };
  } catch (cause) {
    return {
      assignments: readLocalAssignments().filter((row) =>
        assignmentMatchesFormTemplateId(row, templateId)
      ),
      error: formatFormWorkerAssignmentSaveError(cause),
    };
  }
}

export async function remindFormWorkerAssignment(
  assignmentId: string
): Promise<{ error: string | null }> {
  const id = assignmentId.trim();
  if (!id) {
    return { error: "Assignment id is required." };
  }

  const now = new Date().toISOString();
  const payload = {
    status: resolveNewAssignmentWriteStatus(),
    assigned_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured()) {
    const rows = readLocalAssignments();
    const index = rows.findIndex((row) => row.id === id);
    if (index === -1) {
      return { error: "Assignment not found." };
    }
    rows[index] = {
      ...rows[index],
      status: "pending",
      assigned_at: now,
      completed_at: null,
    };
    writeLocalAssignments(rows);
    return { error: null };
  }

  try {
    const { error } = await supabase
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .update(payload)
      .eq("id", id);

    if (error) {
      return {
        error: formatAssignmentQueryError("send assignment reminder in", error),
      };
    }

    return { error: null };
  } catch (cause) {
    return { error: formatFormWorkerAssignmentSaveError(cause) };
  }
}

export interface FetchOutstandingAssignmentsInput {
  workerId: string;
  workerName?: string | null;
  profileFullName?: string | null;
  userMetadataFullName?: string | null;
  alternateNames?: string[];
  /** When true, return all pending rows if the user-specific query is empty (dev default). */
  devFallback?: boolean;
}

function isOutstandingAssignmentsDevFallbackEnabled(
  input: FetchOutstandingAssignmentsInput
): boolean {
  if (input.devFallback === false) return false;
  if (input.devFallback === true) return true;
  return process.env.NODE_ENV === "development";
}

export function resolveAssignmentFormTemplateId(
  assignment: Pick<FormWorkerAssignment, "form_id"> | Record<string, unknown>
): string {
  const record = assignment as Record<string, unknown>;
  return String(
    record.form_id ?? record.form_template_id ?? record.template_id ?? ""
  ).trim();
}

export function resolveFetchOutstandingIdentityNames(
  input: FetchOutstandingAssignmentsInput
): string[] {
  const names = new Set<string>();
  for (const name of [
    input.workerName,
    input.profileFullName,
    input.userMetadataFullName,
    ...(input.alternateNames ?? []),
  ]) {
    const trimmed = name?.trim();
    if (trimmed) names.add(trimmed.toLowerCase());
  }
  return Array.from(names);
}

function mapAssignmentQueryRows(data: unknown[] | null): FormWorkerAssignment[] {
  return dedupeFormWorkerAssignments(
    (data ?? []).map((row) =>
      mapFormWorkerAssignmentRow(row as Record<string, unknown>)
    )
  );
}

/** Fetch all outstanding rows — select('*') only, no FK join or worker/project filters. */
async function fetchAllPendingFormWorkerAssignmentRows(): Promise<{
  assignments: FormWorkerAssignment[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .select("*")
    .in("status", [...OUTSTANDING_ASSIGNMENT_STATUS_VALUES])
    .order("assigned_at", { ascending: false });

  if (error) {
    return {
      assignments: [],
      error: formatAssignmentQueryError("load outstanding assignments from", error),
    };
  }

  return { assignments: mapAssignmentQueryRows(data), error: null };
}

function mergeAssignmentWithTemplate(
  assignment: FormWorkerAssignment,
  template: InductionFormTemplate | null | undefined
): FormWorkerAssignment {
  if (!template) return assignment;

  return {
    ...assignment,
    form_id: assignment.form_id || template.id,
    form_title: assignment.form_title ?? template.title,
    schema_fields: assignment.schema_fields?.length
      ? assignment.schema_fields
      : template.schema_fields,
    blocks: assignment.blocks?.length ? assignment.blocks : template.blocks,
    logic_rules: assignment.logic_rules?.length
      ? assignment.logic_rules
      : template.logic_rules,
  };
}

function hydrateAssignmentFromLocalForms(
  assignment: FormWorkerAssignment
): FormWorkerAssignment {
  if (assignment.schema_fields?.length || assignment.blocks?.length) {
    return assignment;
  }

  const template = readLocalForms().find((row) => row.id === assignment.form_id) ?? null;
  return mergeAssignmentWithTemplate(assignment, template);
}

async function hydrateFormWorkerAssignmentsWithTemplates(
  assignments: FormWorkerAssignment[]
): Promise<FormWorkerAssignment[]> {
  if (assignments.length === 0) return assignments;

  const needsHydration = assignments.filter(
    (row) =>
      !row.schema_fields?.length &&
      !row.blocks?.length &&
      resolveAssignmentFormTemplateId(row)
  );

  if (needsHydration.length === 0) {
    return assignments;
  }

  if (!isSupabaseConfigured()) {
    return assignments.map(hydrateAssignmentFromLocalForms);
  }

  const formIds = Array.from(
    new Set(
      needsHydration
        .map((row) => resolveAssignmentFormTemplateId(row))
        .filter(Boolean)
    )
  );

  if (formIds.length === 0) {
    return assignments;
  }

  const { data, error } = await supabase
    .from(INDUCTION_FORM_TEMPLATES_TABLE)
    .select("*")
    .in("id", formIds);

  if (error) {
    console.warn("hydrateFormWorkerAssignmentsWithTemplates failed:", error.message);
    return assignments.map(hydrateAssignmentFromLocalForms);
  }

  const templateById = new Map(
    (data ?? []).map((row) => [
      String((row as Record<string, unknown>).id),
      normalizeForm(row as Record<string, unknown>),
    ])
  );

  return assignments.map((assignment) => {
    const templateId = resolveAssignmentFormTemplateId(assignment);
    return mergeAssignmentWithTemplate(assignment, templateById.get(templateId));
  });
}

async function enrichFormWorkerAssignmentsWithProjectNames(
  assignments: FormWorkerAssignment[]
): Promise<FormWorkerAssignment[]> {
  const needsName = assignments.filter(
    (row) => row.project_id?.trim() && !row.project_name?.trim()
  );
  if (needsName.length === 0) return assignments;

  const lookupKeys = Array.from(
    new Set(needsName.map((row) => row.project_id!.trim()))
  );
  const nameByKey = new Map<string, string>();

  if (isSupabaseConfigured()) {
    const { data: byId } = await supabase
      .from("projects")
      .select("id, slug, project_name")
      .in("id", lookupKeys);

    for (const row of byId ?? []) {
      const record = row as {
        id?: string;
        slug?: string | null;
        project_name?: string | null;
      };
      const label =
        record.project_name?.trim() ||
        record.slug?.trim() ||
        record.id?.trim() ||
        "";
      if (record.id && label) nameByKey.set(record.id, label);
      if (record.slug && label) nameByKey.set(record.slug, label);
    }

    const unresolved = lookupKeys.filter((key) => !nameByKey.has(key));
    if (unresolved.length > 0) {
      const { data: bySlug } = await supabase
        .from("projects")
        .select("id, slug, project_name")
        .in("slug", unresolved);

      for (const row of bySlug ?? []) {
        const record = row as {
          id?: string;
          slug?: string | null;
          project_name?: string | null;
        };
        const label =
          record.project_name?.trim() ||
          record.slug?.trim() ||
          record.id?.trim() ||
          "";
        if (record.id && label) nameByKey.set(record.id, label);
        if (record.slug && label) nameByKey.set(record.slug, label);
      }
    }
  }

  return assignments.map((assignment) => {
    if (assignment.project_name?.trim() || !assignment.project_id?.trim()) {
      return assignment;
    }
    const resolved = nameByKey.get(assignment.project_id.trim());
    if (!resolved) return assignment;
    return { ...assignment, project_name: resolved };
  });
}

export function resolveAssignmentProjectLabel(
  assignment: Pick<FormWorkerAssignment, "project_id" | "project_name">
): string | null {
  const label = assignment.project_name?.trim();
  if (label) return label;
  const projectId = assignment.project_id?.trim();
  return projectId || null;
}

function filterAssignmentsForWorker(
  assignments: FormWorkerAssignment[],
  input: FetchOutstandingAssignmentsInput
): FormWorkerAssignment[] {
  return dedupeFormWorkerAssignments(
    assignments.filter(
      (row) =>
        matchesWorkerAssignmentIdentity(row, input) &&
        isOutstandingAssignmentStatus(row.status)
    )
  );
}

function resolveOutstandingAssignmentsWithFallbacks(
  allPending: FormWorkerAssignment[],
  input: FetchOutstandingAssignmentsInput
): FormWorkerAssignment[] {
  const filtered = filterAssignmentsForWorker(allPending, input);
  if (filtered.length > 0) {
    return filtered;
  }

  const localMatches = filterLocalOutstandingAssignments(input);
  if (localMatches.length > 0) {
    return localMatches;
  }

  if (isOutstandingAssignmentsDevFallbackEnabled(input) && allPending.length > 0) {
    console.info(
      "fetchOutstandingWorkerFormAssignments: using dev fallback (all pending assignments)."
    );
    return allPending;
  }

  if (isOutstandingAssignmentsDevFallbackEnabled(input)) {
    const allLocal = readLocalAssignments().filter((row) =>
      isOutstandingAssignmentStatus(row.status)
    );
    if (allLocal.length > 0) {
      console.info(
        "fetchOutstandingWorkerFormAssignments: using dev fallback (all pending local assignments)."
      );
      return dedupeFormWorkerAssignments(allLocal);
    }
  }

  return [];
}

export function matchesWorkerAssignmentIdentity(
  row: Pick<FormWorkerAssignment, "worker_id" | "worker_name">,
  input: FetchOutstandingAssignmentsInput
): boolean {
  if (row.worker_id === input.workerId) return true;

  const rowName = row.worker_name?.trim().toLowerCase();
  if (!rowName) return false;

  for (const targetName of resolveFetchOutstandingIdentityNames(input)) {
    if (
      rowName === targetName ||
      rowName.includes(targetName) ||
      targetName.includes(rowName)
    ) {
      return true;
    }
  }

  return false;
}

function filterLocalOutstandingAssignments(
  input: FetchOutstandingAssignmentsInput
): FormWorkerAssignment[] {
  return readLocalAssignments().filter(
    (row) =>
      matchesWorkerAssignmentIdentity(row, input) &&
      isOutstandingAssignmentStatus(row.status)
  );
}

function dedupeFormWorkerAssignments(
  rows: FormWorkerAssignment[]
): FormWorkerAssignment[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function mapFormWorkerAssignmentRow(record: Record<string, unknown>): FormWorkerAssignment {
  const joined = record[INDUCTION_FORM_TEMPLATES_TABLE] as Record<string, unknown> | null;
  const template = joined ? normalizeForm(joined) : null;

  return {
    id: String(record.id),
    form_id: String(record.form_id ?? record.form_template_id ?? record.template_id ?? ""),
    worker_id: String(record.worker_id),
    project_id: record.project_id ? String(record.project_id) : null,
    status: normalizeAssignmentStatus(record.status),
    assigned_at: String(record.assigned_at ?? new Date().toISOString()),
    completed_at: record.completed_at ? String(record.completed_at) : null,
    assigned_by: record.assigned_by ? String(record.assigned_by) : null,
    form_title: record.form_title
      ? String(record.form_title)
      : record.title
        ? String(record.title)
        : template?.title,
    worker_name: record.worker_name ? String(record.worker_name) : undefined,
    project_name: record.project_name ? String(record.project_name) : undefined,
    assigned_by_name: record.assigned_by_name
      ? String(record.assigned_by_name)
      : undefined,
    schema_fields: template?.schema_fields,
    blocks: template?.blocks,
    logic_rules: template?.logic_rules,
    responses:
      record.responses && typeof record.responses === "object"
        ? (record.responses as Record<string, unknown>)
        : undefined,
    signature_url: record.signature_url ? String(record.signature_url) : null,
  };
}
export function sanitizeFormWorkerAssignmentRow(input: {
  template: FormAssignmentTemplateRef;
  worker: FormAssignmentWorkerRef;
  assignedBy?: FormAssignmentAssignedByRef | null;
  assignedAt?: string;
}): Record<string, unknown> {
  const now = input.assignedAt ?? new Date().toISOString();
  const formId = resolveFormTemplateId(input.template);
  const formTitle = resolveFormTemplateTitle(input.template);
  const projectId = resolveAssignmentProjectId(input.worker, input.template);
  const projectName = resolveAssignmentProjectName(input.worker, input.template);
  const assignedById = input.assignedBy?.id?.trim() || null;

  const draft: Record<string, unknown> = {
    form_template_id: formId,
    form_id: formId,
    template_id: formId,
    form_title: formTitle,
    worker_id: String(input.worker.id).trim(),
    worker_name: resolveWorkerDisplayName(input.worker),
    status: resolveNewAssignmentWriteStatus(),
    assigned_at: now,
  };

  if (projectId) {
    draft.project_id = projectId;
  }
  if (projectName) {
    draft.project_name = projectName;
  }
  if (assignedById) {
    draft.assigned_by = assignedById;
    draft.assigned_by_id = assignedById;
  }
  const assignedByName = resolveAssignedByName(input.assignedBy);
  if (assignedByName) {
    draft.assigned_by_name = assignedByName;
  }

  return finalizeAssignmentWritePayload(
    stripNullAndUndefinedFromRecord(pickAssignmentSaveColumns(draft))
  );
}

export function formatFormWorkerAssignmentSaveError(cause: unknown): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    return `Could not assign form to workers. ${String((cause as { message: string }).message)}`;
  }
  if (cause instanceof Error) {
    return `Could not assign form to workers. ${cause.message}`;
  }
  return "Could not assign form to workers. Please try again.";
}

const LOCAL_FORMS_KEY = "sitebolt_induction_forms_local";
const LOCAL_ASSIGNMENTS_KEY = "sitebolt_form_worker_assignments_local";

/** Canonical Supabase table for induction form templates. */
export const INDUCTION_FORM_TEMPLATES_TABLE = "induction_form_templates";
export const FORM_WORKER_ASSIGNMENTS_TABLE = "form_worker_assignments";

/** Columns allowed on induction_form_templates write payloads (unknown keys are stripped). */
export const INDUCTION_FORM_SAVE_COLUMNS = [
  "title",
  "description",
  "form_type",
  "scope_type",
  "scope",
  "project_id",
  "project_name",
  "company_logo_url",
  "blocks",
  "schema_fields",
  "logic_rules",
  "copied_from_id",
  "status",
  "is_active",
  "updated_at",
] as const;

export type InductionFormSaveInput = {
  id?: string;
  title: string;
  description?: string | null;
  scope: "company" | "project";
  project_id?: string | null;
  status: "active" | "draft";
  blocks?: InductionFormBlock[];
  schema_fields?: InductionFormBlock[];
  logic_rules?: InductionFormLogicRule[] | unknown;
  copied_from_id?: string | null;
  scope_type?: string | null;
  project_name?: string | null;
  company_logo_url?: string | null;
  is_active?: boolean;
};

const OPTIONAL_INDUCTION_FORM_DB_COLUMNS = [
  "schema_fields",
  "logic_rules",
  "scope_type",
  "project_name",
  "company_logo_url",
  "is_active",
] as const;

function omitUndefinedEntries(
  record: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function pickSaveColumns(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    INDUCTION_FORM_SAVE_COLUMNS.filter((key) => key in record).map((key) => [
      key,
      record[key],
    ])
  );
}

export function formatInductionFormSaveError(
  operation: "create" | "update",
  cause: unknown
): string {
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = String((cause as { message: string }).message);
    return `Could not ${operation} induction form. ${message}`;
  }
  if (cause instanceof Error) {
    return `Could not ${operation} induction form. ${cause.message}`;
  }
  return `Could not ${operation} induction form. Please try again.`;
}

/** Build a whitelisted Supabase payload with blocks/schema_fields kept in sync. */
export function sanitizeInductionFormSavePayload(
  input: InductionFormSaveInput,
  options?: { updatedAt?: string }
): Record<string, unknown> {
  const now = options?.updatedAt ?? new Date().toISOString();
  const formBlocks = sanitizeInductionFormBlocks(resolveInductionFormBlocks(input));
  const logicRules = resolveInductionFormLogicRules(input);

  const payload = omitUndefinedEntries(
    pickSaveColumns({
      title: input.title.trim(),
      description: input.description?.trim() || null,
      form_type: "Induction",
      scope_type: input.scope_type ?? input.scope,
      scope: input.scope,
      project_id: input.scope === "project" ? input.project_id ?? null : null,
      project_name: input.project_name ?? null,
      company_logo_url: input.company_logo_url ?? null,
      blocks: formBlocks,
      schema_fields: formBlocks,
      logic_rules: logicRules,
      copied_from_id: input.copied_from_id ?? null,
      status: input.status,
      is_active: input.is_active ?? input.status === "active",
      updated_at: now,
    })
  );

  payload.title = input.title.trim();
  payload.description = input.description?.trim() || null;
  payload.form_type = "Induction";
  payload.scope = input.scope;
  payload.project_id = input.scope === "project" ? input.project_id ?? null : null;
  payload.status = input.status;
  payload.blocks = formBlocks;
  payload.schema_fields = formBlocks;
  payload.logic_rules = logicRules;
  payload.copied_from_id = input.copied_from_id ?? null;
  payload.updated_at = now;

  return payload;
}

export function formatInductionFormQueryError(
  operation: string,
  error: { message: string }
): string {
  return `Failed to ${operation} ${INDUCTION_FORM_TEMPLATES_TABLE}: ${error.message}`;
}

function formatAssignmentQueryError(
  operation: string,
  error: { message: string }
): string {
  return `Failed to ${operation} ${FORM_WORKER_ASSIGNMENTS_TABLE}: ${error.message}`;
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    lower.includes(col) &&
    (lower.includes("could not find") ||
      lower.includes("schema cache") ||
      lower.includes("does not exist") ||
      (lower.includes("column") && lower.includes(col)))
  );
}

/** Resolve form blocks from either blocks or schema_fields (prefers non-empty). */
export function resolveInductionFormBlocks(
  source:
    | Pick<InductionFormTemplate, "blocks" | "schema_fields">
    | Record<string, unknown>
    | null
    | undefined
): InductionFormBlock[] {
  if (!source) return [];

  const schemaRaw =
    "schema_fields" in source ? source.schema_fields : undefined;
  const blocksRaw = "blocks" in source ? source.blocks : undefined;

  const fromSchema = Array.isArray(schemaRaw) ? schemaRaw : null;
  const fromBlocks = Array.isArray(blocksRaw) ? blocksRaw : null;

  if (fromSchema && fromSchema.length > 0) {
    return fromSchema
      .map((block, index) => normalizeBlock(block, index))
      .filter((block): block is InductionFormBlock => block !== null);
  }
  if (fromBlocks && fromBlocks.length > 0) {
    return fromBlocks
      .map((block, index) => normalizeBlock(block, index))
      .filter((block): block is InductionFormBlock => block !== null);
  }
  if (fromSchema) {
    return fromSchema
      .map((block, index) => normalizeBlock(block, index))
      .filter((block): block is InductionFormBlock => block !== null);
  }
  if (fromBlocks) {
    return fromBlocks
      .map((block, index) => normalizeBlock(block, index))
      .filter((block): block is InductionFormBlock => block !== null);
  }
  return [];
}

function readLocalForms(): InductionFormTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_FORMS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((row) =>
      normalizeForm(
        row && typeof row === "object" ? (row as Record<string, unknown>) : {}
      )
    );
  } catch {
    return [];
  }
}

function writeLocalForms(forms: InductionFormTemplate[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_FORMS_KEY, JSON.stringify(forms));
}

function readLocalAssignments(): FormWorkerAssignment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_ASSIGNMENTS_KEY);
    return raw ? (JSON.parse(raw) as FormWorkerAssignment[]) : [];
  } catch {
    return [];
  }
}

function writeLocalAssignments(rows: FormWorkerAssignment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_ASSIGNMENTS_KEY, JSON.stringify(rows));
}

function normalizeBlock(raw: unknown, index: number): InductionFormBlock | null {
  try {
    if (!raw || typeof raw !== "object") return null;
    const row = raw as Record<string, unknown>;
    const type = (row.type as InductionFormBlockType) ?? "text_input";
    return {
      id: String(row.id ?? `block-${index}`),
      type,
      label: String(row.label ?? "Field"),
      content: row.content ? String(row.content) : "",
      options:
        type === "multi_checkbox" || type === "radio"
          ? sanitizeBlockOptions(row.options)
          : Array.isArray(row.options)
            ? row.options.map(String)
            : [],
      pdfUrl: row.pdfUrl ? String(row.pdfUrl) : undefined,
      required: row.required === true,
    };
  } catch {
    return null;
  }
}

/** Trim and drop empty option strings while preserving order. */
export function sanitizeBlockOptions(options: unknown): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map((value) => String(value ?? "").trim())
    .filter(Boolean);
}

/** Sanitize option-bearing blocks before persisting to Supabase. */
export function sanitizeInductionFormBlocks(
  blocks: InductionFormBlock[]
): InductionFormBlock[] {
  return blocks.map((block) => {
    if (block.type !== "multi_checkbox" && block.type !== "radio") {
      return block;
    }
    return {
      ...block,
      options: sanitizeBlockOptions(block.options),
    };
  });
}

/** Resolve logic rules from stored JSON without throwing on malformed entries. */
export function resolveInductionFormLogicRules(
  source: { logic_rules?: unknown } | Record<string, unknown> | null | undefined
): InductionFormLogicRule[] {
  if (!source) return [];
  const raw = "logic_rules" in source ? source.logic_rules : undefined;
  if (!Array.isArray(raw)) return [];

  try {
    return raw
      .map((rule) => normalizeLogicRule(rule))
      .filter((rule): rule is InductionFormLogicRule => rule !== null);
  } catch {
    return [];
  }
}

function normalizeForm(row: Record<string, unknown>): InductionFormTemplate {
  const blocks = resolveInductionFormBlocks(row);
  const logic_rules = resolveInductionFormLogicRules(row);

  return {
    id: String(row.id),
    title: String(row.title ?? "Untitled Induction"),
    description: row.description ? String(row.description) : null,
    form_type: "Induction",
    scope: row.scope === "project" ? "project" : "company",
    project_id: row.project_id ? String(row.project_id) : null,
    status: row.status === "active" ? "active" : "draft",
    blocks,
    schema_fields: blocks,
    logic_rules,
    copied_from_id: row.copied_from_id ? String(row.copied_from_id) : null,
    is_system_template: row.is_system_template === true,
    system_template_key: row.system_template_key ? String(row.system_template_key) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export function createEmptyInductionBlock(type: InductionFormBlockType): InductionFormBlock {
  const id = `block-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const base = { id, type, label: "New field", required: false };
  switch (type) {
    case "section_header":
      return { ...base, label: "Section title", content: "" };
    case "rich_text":
      return { ...base, label: "Information", content: "Enter policy text…" };
    case "pdf_viewer":
      return { ...base, label: "Site safety rules PDF", pdfUrl: "" };
    case "checkbox":
      return { ...base, label: "I acknowledge the above", content: "" };
    case "multi_checkbox":
      return { ...base, label: "Select all that apply", options: ["Option 1", "Option 2"] };
    case "radio":
      return { ...base, label: "Select one option", options: ["Yes", "No"] };
    case "signature":
      return { ...base, label: "Worker signature" };
    default:
      return { ...base, label: "Short answer question", content: "" };
  }
}

export function formatInductionFormUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export async function fetchInductionForms(): Promise<{
  forms: InductionFormTemplate[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      forms: readLocalForms().sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      ),
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(INDUCTION_FORM_TEMPLATES_TABLE)
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    const fallback = readLocalForms().sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
    const queryError = isMissingTableError(error.message, INDUCTION_FORM_TEMPLATES_TABLE)
      ? null
      : formatInductionFormQueryError("load forms from", error);
    if (queryError) {
      console.warn("fetchInductionForms failed:", error.message);
    }
    return { forms: fallback, error: queryError };
  }

  return {
    forms: (data ?? []).map((row) => normalizeForm(row as Record<string, unknown>)),
    error: null,
  };
}

export async function saveInductionForm(
  input: InductionFormSaveInput
): Promise<{ error: string | null; form?: InductionFormTemplate }> {
  try {
    const now = new Date().toISOString();
    const payload = sanitizeInductionFormSavePayload(input, { updatedAt: now });
    const formBlocks = payload.blocks as InductionFormBlock[];
    const logicRules = payload.logic_rules as InductionFormLogicRule[];

    if (!isSupabaseConfigured()) {
      const forms = readLocalForms();
      const localRecord = {
        title: String(payload.title),
        description: payload.description ? String(payload.description) : null,
        form_type: "Induction" as const,
        scope: (payload.scope as InductionFormTemplate["scope"]) ?? "company",
        project_id: payload.project_id ? String(payload.project_id) : null,
        status: (payload.status as InductionFormTemplate["status"]) ?? "draft",
        blocks: formBlocks,
        schema_fields: formBlocks,
        logic_rules: logicRules,
        copied_from_id: payload.copied_from_id ? String(payload.copied_from_id) : null,
        updated_at: now,
      };

      if (input.id) {
        const index = forms.findIndex((row) => row.id === input.id);
        const updated: InductionFormTemplate = {
          ...(index >= 0
            ? forms[index]
            : {
                id: input.id,
                created_at: now,
                form_type: "Induction",
                copied_from_id: localRecord.copied_from_id,
              }),
          ...localRecord,
          id: input.id,
          form_type: "Induction",
          created_at: index >= 0 ? forms[index].created_at : now,
        };
        if (index >= 0) forms[index] = updated;
        else forms.unshift(updated);
        writeLocalForms(forms);
        return { error: null, form: updated };
      }

      const created: InductionFormTemplate = {
        id: `local-form-${Date.now()}`,
        ...localRecord,
        form_type: "Induction",
        created_at: now,
      };
      forms.unshift(created);
      writeLocalForms(forms);
      return { error: null, form: created };
    }

    async function persistToSupabase(
      savePayload: Record<string, unknown>
    ): Promise<{
      data: Record<string, unknown> | null;
      error: { message: string } | null;
    }> {
      let current: Record<string, unknown> = { ...savePayload };

      for (let attempt = 0; attempt <= OPTIONAL_INDUCTION_FORM_DB_COLUMNS.length; attempt++) {
        try {
          const result = input.id
            ? await supabase
                .from(INDUCTION_FORM_TEMPLATES_TABLE)
                .update(current)
                .eq("id", input.id)
                .select("*")
                .single()
            : await supabase
                .from(INDUCTION_FORM_TEMPLATES_TABLE)
                .insert([current])
                .select("*")
                .single();

          if (!result.error && result.data) {
            return { data: result.data as Record<string, unknown>, error: null };
          }

          if (!result.error) {
            return {
              data: null,
              error: { message: input.id ? "Update failed" : "Create failed" },
            };
          }

          const columnToDrop = OPTIONAL_INDUCTION_FORM_DB_COLUMNS.find(
            (column) =>
              isMissingColumnError(result.error!.message, column) && column in current
          );
          if (!columnToDrop) {
            return { data: null, error: result.error };
          }

          const next = { ...current };
          delete next[columnToDrop];
          current = next;
        } catch (cause) {
          return {
            data: null,
            error: {
              message: formatInductionFormSaveError(
                input.id ? "update" : "create",
                cause
              ),
            },
          };
        }
      }

      return { data: null, error: { message: "Save failed after column fallback." } };
    }

    const { data, error } = await persistToSupabase(payload);

    if (error || !data) {
      return {
        error: error
          ? formatInductionFormSaveError(input.id ? "update" : "create", error)
          : input.id
            ? "Update failed"
            : "Create failed",
      };
    }
    return { error: null, form: normalizeForm(data) };
  } catch (cause) {
    return {
      error: formatInductionFormSaveError(input.id ? "update" : "create", cause),
    };
  }
}

export async function duplicateInductionForm(
  formId: string
): Promise<{ error: string | null; form?: InductionFormTemplate }> {
  try {
    const { forms, error: fetchError } = await fetchInductionForms();
    if (fetchError) return { error: fetchError };
    const source = forms.find((row) => row.id === formId);
    if (!source) return { error: "Form not found." };

    const sourceBlocks = resolveInductionFormBlocks(source);
    const copiedBlocks = sourceBlocks.map((block) => ({
      ...block,
      id: createEmptyInductionBlock(block.type).id,
    }));

    return await saveInductionForm({
      title: `${source.title} (Copy)`,
      description: source.description,
      scope: source.scope,
      project_id: source.project_id,
      status: "draft",
      blocks: copiedBlocks,
      schema_fields: copiedBlocks,
      logic_rules: resolveInductionFormLogicRules(source).map((rule) => ({ ...rule })),
      copied_from_id: source.id,
      is_active: false,
    });
  } catch (cause) {
    return { error: formatInductionFormSaveError("create", cause) };
  }
}

export async function deleteInductionForm(formId: string): Promise<{ error: string | null }> {
  try {
    if (!isSupabaseConfigured()) {
      writeLocalForms(readLocalForms().filter((row) => row.id !== formId));
      writeLocalAssignments(readLocalAssignments().filter((row) => row.form_id !== formId));
      return { error: null };
    }

    const { error } = await supabase
      .from(INDUCTION_FORM_TEMPLATES_TABLE)
      .delete()
      .eq("id", formId);

    return {
      error: error ? formatInductionFormQueryError("delete from", error) : null,
    };
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? `Could not delete induction form. ${cause.message}`
          : "Could not delete induction form. Please try again.",
    };
  }
}

function isOnConflictTargetError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("on conflict") ||
    lower.includes("no unique or exclusion constraint") ||
    lower.includes("conflict target") ||
    (lower.includes("unique constraint") && lower.includes("form_template_id"))
  );
}

const FORM_WORKER_ASSIGNMENT_CONFLICT_TARGETS = [
  "form_template_id,worker_id",
  "form_id,worker_id",
] as const;

async function fetchExistingAssignmentWorkerIds(
  formId: string,
  workerIds: string[]
): Promise<Set<string>> {
  if (workerIds.length === 0) return new Set();

  try {
    const { data, error } = await supabase
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .select("worker_id")
      .eq("form_id", formId)
      .in("worker_id", workerIds);

    if (error) {
      console.warn("fetchExistingAssignmentWorkerIds failed:", error.message);
      return new Set();
    }

    return new Set((data ?? []).map((row) => String(row.worker_id)));
  } catch {
    return new Set();
  }
}

function filterWorkersWithoutExistingAssignment(
  formId: string,
  workers: FormAssignmentWorkerRef[]
): { workers: FormAssignmentWorkerRef[]; skipped: number } {
  const existing = readLocalAssignments();
  const assignedIds = new Set(
    existing
      .filter((row) => row.form_id === formId)
      .map((row) => row.worker_id)
  );
  const workersToAssign = workers.filter((worker) => !assignedIds.has(worker.id));
  return {
    workers: workersToAssign,
    skipped: workers.length - workersToAssign.length,
  };
}

export async function assignFormToWorkers(input: {
  template: FormAssignmentTemplateRef;
  workers: FormAssignmentWorkerRef[];
  assignedBy?: FormAssignmentAssignedByRef | null;
}): Promise<{ error: string | null; assigned: number; skipped: number }> {
  if (input.workers.length === 0) {
    return { error: "Select at least one worker.", assigned: 0, skipped: 0 };
  }

  try {
    const now = new Date().toISOString();
    let workersToAssign = input.workers;
    let skipped = 0;

    if (!isSupabaseConfigured()) {
      const filtered = filterWorkersWithoutExistingAssignment(
        input.template.id,
        input.workers
      );
      workersToAssign = filtered.workers;
      skipped = filtered.skipped;
    } else {
      const existingIds = await fetchExistingAssignmentWorkerIds(
        input.template.id,
        input.workers.map((worker) => worker.id)
      );
      workersToAssign = input.workers.filter((worker) => !existingIds.has(worker.id));
      skipped = input.workers.length - workersToAssign.length;
    }

    if (workersToAssign.length === 0) {
      return {
        error: null,
        assigned: 0,
        skipped,
      };
    }

    const rows = workersToAssign.map((worker) =>
      sanitizeFormWorkerAssignmentRow({
        template: input.template,
        worker,
        assignedBy: input.assignedBy,
        assignedAt: now,
      })
    );

    const formTitle = resolveFormTemplateTitle(input.template);

    if (!isSupabaseConfigured()) {
      const existing = readLocalAssignments();
      let assigned = 0;
      for (const row of rows) {
        const formId = String(row.form_id);
        const workerId = String(row.worker_id);
        if (existing.some((entry) => entry.form_id === formId && entry.worker_id === workerId)) {
          skipped += 1;
          continue;
        }
        existing.push({
          id: `local-assign-${workerId}-${Date.now()}`,
          form_id: formId,
          worker_id: workerId,
          project_id: row.project_id ? String(row.project_id) : null,
          status: normalizeAssignmentStatus(row.status),
          assigned_at: String(row.assigned_at ?? now),
          completed_at: null,
          assigned_by: row.assigned_by ? String(row.assigned_by) : null,
          form_title: row.form_title ? String(row.form_title) : formTitle,
          worker_name: row.worker_name ? String(row.worker_name) : undefined,
          project_name: row.project_name ? String(row.project_name) : undefined,
          assigned_by_name: row.assigned_by_name ? String(row.assigned_by_name) : undefined,
        });
        assigned += 1;
      }
      writeLocalAssignments(existing);
      return { error: null, assigned, skipped };
    }

    async function persistAssignments(
      payloadRows: Record<string, unknown>[]
    ): Promise<{ data: { id: string }[] | null; error: { message: string } | null }> {
      let currentRows = payloadRows.map((row) =>
        finalizeAssignmentWritePayload(stripNullAndUndefinedFromRecord({ ...row }))
      );

      for (let attempt = 0; attempt <= OPTIONAL_FORM_WORKER_ASSIGNMENT_COLUMNS.length; attempt++) {
        for (const onConflict of FORM_WORKER_ASSIGNMENT_CONFLICT_TARGETS) {
          try {
            const { data, error } = await supabase
              .from(FORM_WORKER_ASSIGNMENTS_TABLE)
              .upsert(currentRows, {
                onConflict,
                ignoreDuplicates: true,
              })
              .select("id");

            if (!error) {
              return { data: (data ?? []) as { id: string }[], error: null };
            }

            const columnToDrop = OPTIONAL_FORM_WORKER_ASSIGNMENT_COLUMNS.find((column) =>
              currentRows.some(
                (row) =>
                  isMissingColumnError(error.message, column) && column in row
              )
            );
            if (columnToDrop) {
          currentRows = currentRows.map((row) => {
            const next = stripNullAndUndefinedFromRecord({ ...row });
            delete next[columnToDrop];
            return next;
          });
              break;
            }

            if (isOnConflictTargetError(error.message)) {
              continue;
            }

            return { data: null, error };
          } catch (cause) {
            return {
              data: null,
              error: { message: formatFormWorkerAssignmentSaveError(cause) },
            };
          }
        }

        const columnToDrop = OPTIONAL_FORM_WORKER_ASSIGNMENT_COLUMNS.find((column) =>
          currentRows.some((row) => column in row)
        );
        if (!columnToDrop) {
          break;
        }

          currentRows = currentRows.map((row) => {
            const next = stripNullAndUndefinedFromRecord({ ...row });
            delete next[columnToDrop];
            return next;
          });
      }

      return {
        data: null,
        error: { message: "Save failed after removing unsupported assignment columns." },
      };
    }

    const { data, error } = await persistAssignments(rows);

    if (error) {
      return {
        error: formatAssignmentQueryError("assign workers in", error),
        assigned: 0,
        skipped,
      };
    }

    return {
      error: null,
      assigned: data?.length ?? rows.length,
      skipped,
    };
  } catch (cause) {
    return {
      error: formatFormWorkerAssignmentSaveError(cause),
      assigned: 0,
      skipped: 0,
    };
  }
}

export async function fetchOutstandingWorkerFormAssignments(
  input: FetchOutstandingAssignmentsInput | string
): Promise<{ assignments: FormWorkerAssignment[]; error: string | null }> {
  const params: FetchOutstandingAssignmentsInput =
    typeof input === "string" ? { workerId: input } : input;
  const workerId = params.workerId.trim();

  if (!workerId) {
    return { assignments: [], error: "Worker id is required." };
  }

  if (!isSupabaseConfigured()) {
    const allLocal = readLocalAssignments().filter((row) =>
      isOutstandingAssignmentStatus(row.status)
    );
    const resolved = resolveOutstandingAssignmentsWithFallbacks(allLocal, params);
    return {
      assignments: resolved.map(hydrateAssignmentFromLocalForms),
      error: null,
    };
  }

  try {
    const pendingResult = await fetchAllPendingFormWorkerAssignmentRows();

    if (pendingResult.error) {
      if (isMissingTableError(pendingResult.error, FORM_WORKER_ASSIGNMENTS_TABLE)) {
        const allLocal = readLocalAssignments().filter((row) =>
          isOutstandingAssignmentStatus(row.status)
        );
        return {
          assignments: resolveOutstandingAssignmentsWithFallbacks(allLocal, params).map(
            hydrateAssignmentFromLocalForms
          ),
          error: null,
        };
      }

      console.warn("fetchOutstandingWorkerFormAssignments failed:", pendingResult.error);
      const allLocal = readLocalAssignments().filter((row) =>
        isOutstandingAssignmentStatus(row.status)
      );
      return {
        assignments: resolveOutstandingAssignmentsWithFallbacks(allLocal, params).map(
          hydrateAssignmentFromLocalForms
        ),
        error: pendingResult.error,
      };
    }

    const resolved = resolveOutstandingAssignmentsWithFallbacks(
      pendingResult.assignments,
      params
    );
    const hydrated = await hydrateFormWorkerAssignmentsWithTemplates(resolved);
    const enriched = await enrichFormWorkerAssignmentsWithProjectNames(hydrated);

    return { assignments: enriched, error: null };
  } catch (cause) {
    const allLocal = readLocalAssignments().filter((row) =>
      isOutstandingAssignmentStatus(row.status)
    );
    return {
      assignments: resolveOutstandingAssignmentsWithFallbacks(allLocal, params).map(
        hydrateAssignmentFromLocalForms
      ),
      error: formatFormWorkerAssignmentSaveError(cause),
    };
  }
}

export async function fetchWorkerFormAssignments(
  workerId: string,
  status?: "pending" | "in_progress" | "completed"
): Promise<FormWorkerAssignment[]> {
  if (!isSupabaseConfigured()) {
    return readLocalAssignments().filter((row) => {
      if (row.worker_id !== workerId) return false;
      if (!status) return true;
      if (status === "pending") return isOutstandingAssignmentStatus(row.status);
      return row.status === status;
    });
  }

  let query = supabase
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .select(`*, ${INDUCTION_FORM_TEMPLATES_TABLE}(title, blocks, schema_fields, logic_rules)`)
    .eq("worker_id", workerId)
    .order("assigned_at", { ascending: false });

  if (status) {
    if (status === "pending") {
      query = query.in("status", [...OUTSTANDING_ASSIGNMENT_STATUS_VALUES]);
    } else if (status === "completed") {
      query = query.in("status", ["completed", COMPLETED_FORM_WORKER_ASSIGNMENT_STATUS]);
    } else {
      query = query.in("status", [status, "In Progress"]);
    }
  }

  const { data, error } = await query;

  if (error) {
    if (!isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
      console.warn("fetchWorkerFormAssignments failed:", error.message);
    }
    return readLocalAssignments().filter((row) => {
      if (row.worker_id !== workerId) return false;
      if (!status) return true;
      if (status === "pending") return isOutstandingAssignmentStatus(row.status);
      return row.status === status;
    });
  }

  return (data ?? []).map((row) =>
    mapFormWorkerAssignmentRow(row as Record<string, unknown>)
  );
}

export interface FetchWorkerInductionAssignmentsInput {
  workerId: string;
  workerEmail?: string | null;
  workerFullName?: string | null;
}

export function matchesWorkerInductionAssignment(
  row: FormWorkerAssignment,
  input: FetchWorkerInductionAssignmentsInput
): boolean {
  if (row.worker_id === input.workerId) return true;

  const email = input.workerEmail?.trim().toLowerCase();
  const rowEmail = (row as FormWorkerAssignment & { worker_email?: string }).worker_email;
  if (email && rowEmail && rowEmail.trim().toLowerCase() === email) {
    return true;
  }

  return matchesWorkerAssignmentIdentity(row, {
    workerId: input.workerId,
    workerName: input.workerFullName,
    profileFullName: input.workerFullName,
  });
}

export function assignmentStatusLabel(status: FormWorkerAssignment["status"]): string {
  const normalized = normalizeAssignmentStatus(status);
  if (normalized === "completed") return "Completed";
  if (normalized === "in_progress") return "In Progress";
  return "Pending";
}

export function assignmentStatusBadgeClass(status: FormWorkerAssignment["status"]): string {
  const normalized = normalizeAssignmentStatus(status);
  if (normalized === "completed") return "bg-emerald-100 text-emerald-800";
  if (normalized === "in_progress") return "bg-blue-100 text-blue-800";
  return "bg-orange-100 text-orange-800";
}

export async function fetchWorkerInductionAssignments(
  input: FetchWorkerInductionAssignmentsInput
): Promise<{ assignments: FormWorkerAssignment[]; error: string | null }> {
  const workerId = input.workerId.trim();
  if (!workerId) {
    return { assignments: [], error: "Worker id is required." };
  }

  const sortNewest = (rows: FormWorkerAssignment[]) =>
    [...rows].sort(
      (a, b) => new Date(b.assigned_at).getTime() - new Date(a.assigned_at).getTime()
    );

  if (!isSupabaseConfigured()) {
    const filtered = sortNewest(
      readLocalAssignments().filter((row) => matchesWorkerInductionAssignment(row, input))
    );
    const hydrated = await hydrateFormWorkerAssignmentsWithTemplates(filtered);
    return { assignments: hydrated, error: null };
  }

  try {
    let merged: FormWorkerAssignment[] = [];

    const { data: byWorkerId, error: byWorkerIdError } = await supabase
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .select("*")
      .eq("worker_id", workerId)
      .order("assigned_at", { ascending: false });

    if (byWorkerIdError) {
      if (isMissingTableError(byWorkerIdError.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
        const filtered = sortNewest(
          readLocalAssignments().filter((row) => matchesWorkerInductionAssignment(row, input))
        );
        const hydrated = await hydrateFormWorkerAssignmentsWithTemplates(filtered);
        return { assignments: hydrated, error: null };
      }
    } else {
      merged = mapAssignmentQueryRows(byWorkerId);
    }

    const fullName = input.workerFullName?.trim();
    if (fullName) {
      const { data: byName } = await supabase
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("*")
        .ilike("worker_name", fullName)
        .order("assigned_at", { ascending: false });
      merged = dedupeFormWorkerAssignments([
        ...merged,
        ...mapAssignmentQueryRows(byName),
      ]);
    }

    const email = input.workerEmail?.trim();
    if (email) {
      const { data: byEmail, error: byEmailError } = await supabase
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("*")
        .eq("worker_email", email)
        .order("assigned_at", { ascending: false });

      if (!byEmailError) {
        merged = dedupeFormWorkerAssignments([
          ...merged,
          ...mapAssignmentQueryRows(byEmail),
        ]);
      }
    }

    const filtered = sortNewest(
      merged.filter((row) => matchesWorkerInductionAssignment(row, input))
    );
    const hydrated = await hydrateFormWorkerAssignmentsWithTemplates(filtered);

    return {
      assignments: hydrated,
      error: byWorkerIdError
        ? formatAssignmentQueryError("load worker induction assignments from", byWorkerIdError)
        : null,
    };
  } catch (cause) {
    const filtered = sortNewest(
      readLocalAssignments().filter((row) => matchesWorkerInductionAssignment(row, input))
    );
    const hydrated = await hydrateFormWorkerAssignmentsWithTemplates(filtered);
    return {
      assignments: hydrated,
      error: formatFormWorkerAssignmentSaveError(cause),
    };
  }
}

export function filterInductionForms(
  forms: InductionFormTemplate[],
  query: string,
  projectId?: string | null
): InductionFormTemplate[] {
  const needle = query.trim().toLowerCase();
  return forms.filter((form) => {
    if (projectId && form.project_id !== projectId) return false;
    if (!needle) return true;
    return (
      form.title.toLowerCase().includes(needle) ||
      (form.description?.toLowerCase().includes(needle) ?? false) ||
      (form.project_id?.toLowerCase().includes(needle) ?? false)
    );
  });
}

export function assignmentDueLabel(assignedAt: string): string {
  return formatInductionFormUpdatedAt(assignedAt);
}

export async function fetchInductionFormById(
  formId: string
): Promise<{ form: InductionFormTemplate | null; error: string | null }> {
  if (!formId.trim()) {
    return { form: null, error: "Form id is required." };
  }

  if (!isSupabaseConfigured()) {
    return {
      form: readLocalForms().find((row) => row.id === formId) ?? null,
      error: null,
    };
  }

  const { data, error } = await supabase
    .from(INDUCTION_FORM_TEMPLATES_TABLE)
    .select("*")
    .eq("id", formId)
    .maybeSingle();

  if (error) {
    const local = readLocalForms().find((row) => row.id === formId) ?? null;
    const queryError = isMissingTableError(error.message, INDUCTION_FORM_TEMPLATES_TABLE)
      ? null
      : formatInductionFormQueryError("load form from", error);
    return { form: local, error: queryError };
  }

  if (!data) {
    return {
      form: readLocalForms().find((row) => row.id === formId) ?? null,
      error: null,
    };
  }

  return { form: normalizeForm(data as Record<string, unknown>), error: null };
}

export function extractInductionSignatureUrl(
  blocks: InductionFormBlock[],
  answers: Record<string, unknown>
): string | null {
  for (const block of blocks) {
    if (block.type !== "signature") continue;
    const value = answers[block.id];
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return null;
}

export async function completeFormWorkerAssignment(
  assignmentId: string,
  input?: {
    responses?: Record<string, unknown>;
    signature_url?: string | null;
  }
): Promise<{ error: string | null }> {
  if (!assignmentId.trim()) {
    return { error: "Assignment id is required." };
  }

  const now = new Date().toISOString();
  const responses = input?.responses ?? {};
  const signatureUrl = input?.signature_url ?? null;

  const basePayload = stripNullAndUndefinedFromRecord({
    status: COMPLETED_FORM_WORKER_ASSIGNMENT_STATUS,
    completed_at: now,
    updated_at: now,
    responses,
    signature_url: signatureUrl,
  });

  if (!isSupabaseConfigured()) {
    const rows = readLocalAssignments();
    const index = rows.findIndex((row) => row.id === assignmentId);
    if (index < 0) return { error: "Assignment not found." };
    rows[index] = {
      ...rows[index],
      status: "completed",
      completed_at: now,
      responses,
      signature_url: signatureUrl,
    };
    writeLocalAssignments(rows);
    return { error: null };
  }

  try {
    const optionalCompletionColumns = ["responses", "signature_url"] as const;
    let payload: Record<string, unknown> = { ...basePayload };

    for (let attempt = 0; attempt <= optionalCompletionColumns.length; attempt++) {
      const { error } = await supabase
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .update(payload)
        .eq("id", assignmentId);

      if (!error) {
        return { error: null };
      }

      const columnToDrop = optionalCompletionColumns.find(
        (column) =>
          isMissingColumnError(error.message, column) && column in payload
      );
      if (!columnToDrop) {
        return {
          error: formatAssignmentQueryError("complete assignment in", error),
        };
      }

      const next = { ...payload };
      delete next[columnToDrop];
      payload = next;
    }

    return { error: "Could not complete induction assignment." };
  } catch (cause) {
    return {
      error:
        cause instanceof Error
          ? `Could not complete induction assignment. ${cause.message}`
          : "Could not complete induction assignment.",
    };
  }
}
