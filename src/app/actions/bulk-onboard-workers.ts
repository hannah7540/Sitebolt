"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getInvalidBulkOnboardingFields,
  normalizeBulkOnboardingWorker,
  serializeBulkOnboardingVocs,
  workerDisplayName,
  type BulkOnboardingWorker,
} from "@/lib/bulk-onboarding";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { canManageOrganisation, DEFAULT_WORKER_SECURITY_ROLE, normalizeSecurityRole } from "@/lib/security-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  filterRowsByOrganisationStrict,
  isOrganisationColumnMissing,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import {
  buildWorkerNameFields,
  computeWorkerStatusFromExpiries,
  formatWorkerBsb,
  nullIfBlankWorkerDate,
  sanitizeWorkerWritePayload,
} from "@/lib/worker-utils";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";
import { assignDefaultPayRuleToWorkerAdmin } from "@/lib/worker-pay-rule-assignment";
import { syncPublicHolidaysForWorker } from "@/lib/public-holiday-sync";
import { companyInductionMatchesState } from "@/lib/worker-induction-auto-assign";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";
import { isSilicaOptionalForWorker } from "@/lib/silica-onboarding";

export type BulkOnboardResult = {
  error: string | null;
  imported: number;
  invited: number;
  inviteErrors: string[];
  succeededEmails: string[];
  failedEmails: string[];
  successCount: number;
  failedCount: number;
};

const BULK_ONBOARD_CHUNK_SIZE = 10;

function emptyBulkResult(error: string | null): BulkOnboardResult {
  return {
    error,
    imported: 0,
    invited: 0,
    inviteErrors: [],
    succeededEmails: [],
    failedEmails: [],
    successCount: 0,
    failedCount: 0,
  };
}

type BulkWorkerOutcome = {
  email: string;
  displayName: string;
  workerId: string | null;
  imported: boolean;
  invited: boolean;
  error: string | null;
};

async function insertWorkerVocs(
  admin: SupabaseClient,
  workerId: string,
  worker: BulkOnboardingWorker
): Promise<string | null> {
  const extraVocs = serializeBulkOnboardingVocs(worker.vocs).map((voc) => ({
    worker_id: workerId,
    title: voc.title || voc.voc_type || "VOC",
    voc_type: voc.voc_type || voc.title || "VOC",
    name: voc.title || voc.voc_type || "VOC",
    issuing_org: voc.issuing_org || null,
    issue_date: nullIfBlankWorkerDate(voc.issue_date),
    expiry_date: nullIfBlankWorkerDate(voc.expiry_date),
    document_url: voc.document_url,
  }));

  const licenceNumber = worker.drivers_licence_number.trim();
  const licenceClass = worker.drivers_licence_class.trim();
  const licenceExpiry = nullIfBlankWorkerDate(worker.drivers_licence_expiry);
  const licenceDoc = worker.drivers_licence_photo_url?.trim() || null;
  const hasLicence = Boolean(licenceNumber || licenceClass || licenceExpiry || licenceDoc);

  const rows = [
    {
      worker_id: workerId,
      title: "White Card",
      voc_type: "White Card",
      name: "White Card",
      issuing_org: worker.white_card_number.trim() || null,
      issue_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
      expiry_date: null,
      document_url: worker.white_card_doc_url?.trim() || null,
    },
    {
      worker_id: workerId,
      title: "Silica Awareness",
      voc_type: "Silica Awareness",
      name: "Silica Awareness",
      issuing_org: worker.silica_cert_number.trim() || null,
      issue_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
      expiry_date: null,
      document_url: worker.silica_cert_doc_url?.trim() || null,
    },
    ...(hasLicence
      ? [
          {
            worker_id: workerId,
            title: "Driver's Licence",
            voc_type: "Driver's Licence",
            name: "Driver's Licence",
            issuing_org: [licenceNumber, licenceClass].filter(Boolean).join(" · ") || null,
            issue_date: null,
            expiry_date: licenceExpiry,
            document_url: licenceDoc,
          },
        ]
      : []),
    ...extraVocs,
  ];

  const attempts = [
    rows,
    rows.map(({ name: _name, voc_type: _vocType, ...row }) => row),
    rows.map(({ name: _name, ...row }) => row),
  ];

  let lastError: string | null = null;
  for (const payload of attempts) {
    const { error } = await admin.from("worker_vocs").insert(payload);
    if (!error) return null;
    lastError = error.message;
    const lower = error.message.toLowerCase();
    if (
      !lower.includes("column") &&
      !lower.includes("schema cache") &&
      !lower.includes("could not find")
    ) {
      break;
    }
  }

  return lastError ?? "Unable to save compliance ticket records.";
}

async function insertWorkerTags(
  admin: SupabaseClient,
  workerId: string,
  tagIds: string[],
  orgId: string
): Promise<string | null> {
  const uniqueIds = [
    ...new Set(tagIds.map((id) => String(id).trim()).filter(Boolean)),
  ];
  if (uniqueIds.length === 0) return null;

  let tagQuery = admin.from("tags").select("id").in("id", uniqueIds);
  tagQuery = withOrganisationScope(tagQuery, orgId);
  const { data: tagRows, error: tagError } = await tagQuery;
  if (tagError) return tagError.message;

  const allowed = new Set(
    (tagRows ?? []).map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean)
  );
  const rows = uniqueIds
    .filter((tag_id) => allowed.has(tag_id))
    .map((tag_id) => ({ worker_id: workerId, tag_id }));
  if (rows.length === 0) return null;

  const { error } = await admin.from("worker_tags").insert(rows);
  if (error && error.code !== "23505") return error.message;
  return null;
}

type CatalogRow = Record<string, unknown>;

type BulkComplianceCatalog = {
  swms: CatalogRow[];
  inductions: CatalogRow[];
};

function rowId(row: CatalogRow): string {
  return String(row.id ?? "").trim();
}

function rowText(row: CatalogRow, key: string): string {
  return String(row[key] ?? "").trim();
}

function isArchivedSwms(row: CatalogRow): boolean {
  return (
    row.is_archived === true ||
    String(row.status ?? "").trim().toLowerCase() === "archived"
  );
}

function isActiveInduction(row: CatalogRow): boolean {
  const status = String(row.status ?? "active").trim().toLowerCase();
  return !status || status === "active";
}

function signingToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

async function queryOrgRows(
  admin: SupabaseClient,
  table: string,
  selects: string[],
  orgId: string
): Promise<CatalogRow[]> {
  let applyScope = true;
  for (const select of selects) {
    let query = admin.from(table).select(select);
    if (applyScope) {
      query = withOrganisationScope(query, orgId);
    }
    const { data, error } = await query;
    if (!error) {
      const rows = (data ?? []) as unknown as CatalogRow[];
      return applyScope ? filterRowsByOrganisationStrict(rows, orgId) : rows;
    }

    const lower = error.message.toLowerCase();
    if (isOrganisationColumnMissing(error.message) && applyScope) {
      applyScope = false;
      continue;
    }
    if (lower.includes("column") || lower.includes("could not find the")) {
      continue;
    }
    if (
      lower.includes("does not exist") ||
      lower.includes("could not find the table")
    ) {
      return [];
    }
    console.warn(`[bulk-onboard] ${table} query failed:`, error.message);
    return [];
  }
  return [];
}

async function resolveProjectMatchKeys(
  admin: SupabaseClient,
  projectIds: string[]
): Promise<Map<string, Set<string>>> {
  const unique = [...new Set(projectIds.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, Set<string>>();
  for (const id of unique) {
    map.set(id, new Set([id]));
  }
  if (unique.length === 0) return map;

  const { data, error } = await admin
    .from("projects")
    .select("id, slug")
    .or(unique.map((id) => `id.eq.${id},slug.eq.${id}`).join(","));
  if (error || !data) return map;

  for (const id of unique) {
    const keys = map.get(id) ?? new Set([id]);
    for (const row of data as Array<{ id?: string; slug?: string }>) {
      const projectId = String(row.id ?? "").trim();
      const slug = String(row.slug ?? "").trim();
      if (projectId === id || slug === id) {
        if (projectId) keys.add(projectId);
        if (slug) keys.add(slug);
      }
    }
    map.set(id, keys);
  }
  return map;
}

async function loadBulkComplianceCatalog(
  admin: SupabaseClient,
  orgId: string
): Promise<BulkComplianceCatalog> {
  const [swmsDocuments, legacySwms, inductions, legacyInductions] = await Promise.all([
    queryOrgRows(
      admin,
      "swms_documents",
      [
        "id, title, project_id, swms_scope, is_archived, status, state, organisation_id",
        "id, title, project_id, swms_scope, is_archived, status, organisation_id",
        "id, title, project_id, is_archived, status, organisation_id",
        "id, title, project_id, status, organisation_id",
        "id, title, project_id, organisation_id",
      ],
      orgId
    ),
    queryOrgRows(
      admin,
      "swms",
      [
        "id, title, project_id, swms_scope, is_archived, status, state, organisation_id",
        "id, title, project_id, status, organisation_id",
        "id, title, project_id",
      ],
      orgId
    ),
    queryOrgRows(
      admin,
      "induction_form_templates",
      [
        "id, title, project_id, scope, status, system_template_key, state, jurisdiction, organisation_id",
        "id, title, project_id, scope, status, system_template_key, state, organisation_id",
        "id, title, project_id, scope, status, organisation_id",
        "id, title, project_id, scope, organisation_id",
      ],
      orgId
    ),
    queryOrgRows(
      admin,
      "inductions",
      [
        "id, title, project_id, scope, status, state, organisation_id",
        "id, title, project_id, scope, status, organisation_id",
        "id, title, project_id, organisation_id",
      ],
      orgId
    ),
  ]);

  const swmsById = new Map<string, CatalogRow>();
  for (const row of [...swmsDocuments, ...legacySwms]) {
    const id = rowId(row);
    if (id) swmsById.set(id, row);
  }
  const inductionsById = new Map<string, CatalogRow>();
  for (const row of [...inductions, ...legacyInductions]) {
    const id = rowId(row);
    if (id) inductionsById.set(id, row);
  }

  return {
    swms: [...swmsById.values()],
    inductions: [...inductionsById.values()],
  };
}

function matchingSwmsForWorker(
  catalog: BulkComplianceCatalog,
  state: ReturnType<typeof normalizeWorkerStateRegion>,
  projectKeys: Set<string>
): CatalogRow[] {
  return catalog.swms.filter((row) => {
    if (!rowId(row) || isArchivedSwms(row)) return false;
    const docProject = rowText(row, "project_id");
    const docState = normalizeWorkerStateRegion(rowText(row, "state"));
    if (docProject) return projectKeys.has(docProject);
    if (docState) return Boolean(state) && docState === state;
    const scope = rowText(row, "swms_scope").toLowerCase();
    return !scope || scope === "company";
  });
}

function matchingInductionsForWorker(
  catalog: BulkComplianceCatalog,
  state: ReturnType<typeof normalizeWorkerStateRegion>,
  projectKeys: Set<string>
): CatalogRow[] {
  return catalog.inductions.filter((row) => {
    if (!rowId(row) || !isActiveInduction(row)) return false;
    const scope = rowText(row, "scope").toLowerCase();
    const rowProject = rowText(row, "project_id");
    if (scope === "project" || rowProject) {
      return Boolean(rowProject) && projectKeys.has(rowProject);
    }
    if (!state) return false;
    return companyInductionMatchesState(
      rowText(row, "title"),
      rowText(row, "system_template_key") || null,
      state,
      rowText(row, "state") || rowText(row, "jurisdiction") || null
    );
  });
}

async function insertRowsWithFallback(
  admin: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[]
): Promise<string | null> {
  if (rows.length === 0) return null;

  let payload = rows.map((row) => ({ ...row }));
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await admin.from(table).insert(payload);
    if (!error) return null;

    const lower = error.message.toLowerCase();
    if (
      lower.includes("duplicate key") ||
      lower.includes("unique constraint") ||
      lower.includes("already exists") ||
      error.code === "23505"
    ) {
      return null;
    }
    if (
      (lower.includes("does not exist") || lower.includes("could not find the table")) &&
      lower.includes(table)
    ) {
      return null;
    }

    const missing = parseMissingColumnFromError(error.message);
    if (missing && payload.some((row) => missing in row)) {
      payload = payload.map((row) => stripMissingColumn(row, missing));
      continue;
    }
    return error.message;
  }
  return `Unable to insert ${table} rows.`;
}

function isUuid(value: string | null | undefined): boolean {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value
      )
  );
}

async function assignBulkWorkerComplianceDirect(
  admin: SupabaseClient,
  input: {
    workerId: string;
    orgId: string;
    worker: BulkOnboardingWorker;
    catalog: BulkComplianceCatalog;
    projectKeys: Set<string>;
    assignedById: string | null;
  }
): Promise<string | null> {
  const state = normalizeWorkerStateRegion(input.worker.state);
  const projectName = input.worker.assigned_project_name?.trim() || "";
  const workerName = workerDisplayName(input.worker);
  const swmsDocs = matchingSwmsForWorker(input.catalog, state, input.projectKeys);
  const inductionDocs = matchingInductionsForWorker(
    input.catalog,
    state,
    input.projectKeys
  );

  const swmsRows = swmsDocs.map((doc) => {
    const token = signingToken();
    const swmsId = rowId(doc);
    const docProject = rowText(doc, "project_id") || null;
    return {
      swms_id: swmsId,
      assignee_type: "worker",
      assignee_id: input.workerId,
      worker_id: input.workerId,
      assignee_name: workerName,
      worker_name: workerName,
      name: workerName,
      signing_token: token,
      token,
      signature_token: token,
      status: "Pending",
      project_id: docProject,
      organisation_id: input.orgId,
    };
  });

  const inductionRows = inductionDocs.map((doc) => {
    const formId = rowId(doc);
    const title = rowText(doc, "title") || "Induction";
    const docProject = rowText(doc, "project_id") || null;
    return {
      form_id: formId,
      form_template_id: formId,
      template_id: formId,
      induction_id: formId,
      form_title: title,
      title,
      worker_id: input.workerId,
      worker_name: workerName,
      status: "Pending",
      assigned_at: new Date().toISOString(),
      assigned_by: input.assignedById,
      assigned_by_id: input.assignedById,
      assigned_by_name: "SiteBolt Bulk Onboarding",
      project_id: docProject,
      project_name: projectName || null,
      organisation_id: input.orgId,
    };
  });

  try {
    const swmsError = await insertRowsWithFallback(admin, "swms_assignments", swmsRows);
    if (swmsError) return `SWMS assignment failed: ${swmsError}`;

    const inductionError = await insertRowsWithFallback(
      admin,
      "form_worker_assignments",
      inductionRows
    );
    if (inductionError) return `Induction assignment failed: ${inductionError}`;

    const aliasSwms = swmsDocs.map((doc) => ({
      worker_id: input.workerId,
      swms_id: rowId(doc),
      status: "Pending",
      organisation_id: input.orgId,
    }));
    const aliasInductions = inductionDocs.map((doc) => ({
      worker_id: input.workerId,
      induction_id: rowId(doc),
      form_id: rowId(doc),
      status: "Pending",
      organisation_id: input.orgId,
    }));
    await insertRowsWithFallback(admin, "worker_swms", aliasSwms);
    await insertRowsWithFallback(admin, "worker_inductions", aliasInductions);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Assignment insert failed.";
    return message;
  }

  return null;
}

async function insertWorkerProfile(
  admin: SupabaseClient,
  orgId: string,
  worker: BulkOnboardingWorker
): Promise<{ workerId: string | null; error: string | null }> {
  const names = buildWorkerNameFields(worker.first_name, worker.last_name);
  const licenceExpiry = nullIfBlankWorkerDate(worker.drivers_licence_expiry);
  let payload: Record<string, unknown> = sanitizeWorkerWritePayload({
    ...names,
    organisation_id: orgId,
    email: worker.email.trim().toLowerCase(),
    phone: worker.phone.trim() || null,
    dob: nullIfBlankWorkerDate(worker.dob),
    address_line_1: worker.address_line_1.trim() || null,
    address_line_2: worker.address_line_2.trim() || null,
    suburb: worker.suburb.trim() || null,
    postcode: worker.postcode.trim() || null,
    state: worker.state.trim() || null,
    emergency_contact: worker.emergency_contact.trim() || worker.emergency_contact_name.trim() || null,
    emergency_contact_name: worker.emergency_contact_name.trim() || null,
    emergency_contact_relationship: worker.emergency_contact_relationship.trim() || null,
    emergency_contact_phone: worker.emergency_contact_phone.trim() || null,
    emergency_contact_number: worker.emergency_contact_phone.trim() || null,
    bank_name: worker.bank_name.trim() || null,
    bank_account_name: worker.bank_account_name.trim() || names.full_name || null,
    bank_bsb: formatWorkerBsb(worker.bank_bsb),
    bank_account_number: worker.bank_account_number.replace(/\s+/g, "") || null,
    super_fund: worker.super_fund.trim() || null,
    super_member_number: worker.super_member_number.trim() || null,
    tfn: worker.tfn.replace(/\s+/g, "") || null,
    white_card_number: worker.white_card_number.trim() || null,
    white_card_issue_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
    white_card_date: nullIfBlankWorkerDate(worker.white_card_issue_date),
    white_card_provided: true,
    white_card_photo_url: null,
    white_card_doc_url: worker.white_card_doc_url?.trim() || null,
    white_card_file_url: worker.white_card_doc_url?.trim() || null,
    silica_cert_number: worker.silica_cert_number.trim() || null,
    silica_cert_issue_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
    silica_cert_date: nullIfBlankWorkerDate(worker.silica_cert_issue_date),
    silica_cert_provided: true,
    silica_cert_photo_url: null,
    silica_cert_doc_url: worker.silica_cert_doc_url?.trim() || null,
    silica_cert_file_url: worker.silica_cert_doc_url?.trim() || null,
    drivers_licence_number: worker.drivers_licence_number.trim() || null,
    drivers_licence_class: worker.drivers_licence_class.trim() || null,
    drivers_licence_expiry: licenceExpiry,
    drivers_licence_photo_url: worker.drivers_licence_photo_url?.trim() || null,
    assigned_project_id: worker.assigned_project_id?.trim() || null,
    assigned_project_name: worker.assigned_project_name?.trim() || null,
    assigned_project_ids: worker.assigned_project_id?.trim()
      ? [worker.assigned_project_id.trim()]
      : [],
    project_id: worker.assigned_project_id?.trim() || null,
    security_role: DEFAULT_WORKER_SECURITY_ROLE,
    status: computeWorkerStatusFromExpiries([
      licenceExpiry,
      ...serializeBulkOnboardingVocs(worker.vocs).map((voc) => voc.expiry_date),
    ]),
    onboarding_completed: true,
    invite_status: "pending",
    worker_category: "internal",
  });

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await admin
      .from("workers")
      .insert([payload])
      .select("id")
      .single();

    if (!error) {
      return { workerId: data?.id ?? null, error: null };
    }

    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in payload) {
      payload = stripMissingColumn(payload, missing);
      continue;
    }

    return { workerId: null, error: error.message };
  }

  return { workerId: null, error: "Unable to insert worker profile." };
}

async function processBulkWorker(input: {
  admin: SupabaseClient;
  orgId: string;
  worker: BulkOnboardingWorker;
  catalog: Awaited<ReturnType<typeof loadBulkComplianceCatalog>>;
  projectKeys: Set<string>;
  assignedById: string | null;
}): Promise<BulkWorkerOutcome> {
  const displayName = workerDisplayName(input.worker);
  const email = input.worker.email.trim().toLowerCase();

  const inserted = await insertWorkerProfile(input.admin, input.orgId, input.worker);
  if (inserted.error || !inserted.workerId) {
    return {
      email,
      displayName,
      workerId: null,
      imported: false,
      invited: false,
      error: inserted.error ?? `Failed to create ${displayName}.`,
    };
  }

  const workerId = inserted.workerId;

  const vocError = await insertWorkerVocs(input.admin, workerId, input.worker);
  if (vocError) {
    return {
      email,
      displayName,
      workerId,
      imported: true,
      invited: false,
      error: `Created ${displayName} but could not save tickets: ${vocError}`,
    };
  }

  const tagError = await insertWorkerTags(
    input.admin,
    workerId,
    input.worker.tag_ids ?? [],
    input.orgId
  );
  if (tagError) {
    return {
      email,
      displayName,
      workerId,
      imported: true,
      invited: false,
      error: `Created ${displayName} but could not save tags: ${tagError}`,
    };
  }

  try {
    await assignDefaultPayRuleToWorkerAdmin(input.admin, workerId, input.worker.state);
  } catch (cause) {
    console.warn("[bulk-onboard] pay rule assignment skipped:", cause);
  }

  try {
    const assignmentError = await assignBulkWorkerComplianceDirect(input.admin, {
      workerId,
      orgId: input.orgId,
      worker: input.worker,
      catalog: input.catalog,
      projectKeys: input.projectKeys,
      assignedById: input.assignedById,
    });
    if (assignmentError) {
      console.warn("[bulk-onboard] SWMS/induction assignment skipped:", assignmentError);
    }
  } catch (cause) {
    console.warn("[bulk-onboard] SWMS/induction assignment failed:", cause);
  }

  try {
    await syncPublicHolidaysForWorker(workerId);
  } catch (cause) {
    console.warn("[bulk-onboard] public holiday sync skipped:", cause);
  }

  return {
    email,
    displayName,
    workerId,
    imported: true,
    invited: false,
    error: null,
  };
}

async function sendBulkWorkerInvite(
  worker: BulkOnboardingWorker,
  workerId: string
): Promise<BulkWorkerOutcome> {
  const displayName = workerDisplayName(worker);
  const email = worker.email.trim().toLowerCase();
  const invite = await sendWorkerInviteEmailViaResend(worker.email, { workerId });
  if (!invite.success) {
    return {
      email,
      displayName,
      workerId,
      imported: true,
      invited: false,
      error: `${displayName}: ${invite.error ?? "Invite email failed."}`,
    };
  }
  return {
    email,
    displayName,
    workerId,
    imported: true,
    invited: true,
    error: null,
  };
}

export async function submitBulkOnboarding(
  rawWorkers: BulkOnboardingWorker[]
): Promise<BulkOnboardResult> {
  if (!isSupabaseAdminConfigured()) {
    return emptyBulkResult("Server admin client is not configured.");
  }

  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return emptyBulkResult("Active organisation is required.");
  }

  const session = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await session.auth.getUser();
  if (authError) {
    return emptyBulkResult(authError.message);
  }
  if (!user) {
    return emptyBulkResult("Not authenticated.");
  }

  const admin = createSupabaseAdminClient();
  const { data: actorRow } = await admin
    .from("workers")
    .select("id, security_role")
    .eq("email", user.email ?? "")
    .maybeSingle();

  const actorWorkerId = String((actorRow as { id?: string } | null)?.id ?? "").trim();
  const assignedById = isUuid(actorWorkerId)
    ? actorWorkerId
    : isUuid(user.id)
      ? user.id
      : null;

  const role = normalizeSecurityRole(
    (actorRow as { security_role?: string } | null)?.security_role
  );
  if (!canManageOrganisation(role)) {
    return emptyBulkResult("Forbidden.");
  }

  if (!Array.isArray(rawWorkers) || rawWorkers.length === 0) {
    return emptyBulkResult("No workers to import.");
  }

  const workers = rawWorkers.map((worker) => normalizeBulkOnboardingWorker(worker));
  const silicaOptional = isSilicaOptionalForWorker({ organisationId: orgId });
  for (const worker of workers) {
    const invalid = getInvalidBulkOnboardingFields(worker, silicaOptional);
    if (invalid.length > 0) {
      return emptyBulkResult(
        `${workerDisplayName(worker)} still has incomplete fields.`
      );
    }
  }

  const emails = workers.map((worker) => worker.email.trim().toLowerCase());
  const { data: existingRows, error: existingError } = await admin
    .from("workers")
    .select("email")
    .eq("organisation_id", orgId)
    .in("email", emails);

  if (existingError) {
    return emptyBulkResult(existingError.message);
  }

  const existing = (existingRows ?? [])
    .map((row) => String((row as { email?: string }).email ?? "").trim().toLowerCase())
    .filter(Boolean);
  if (existing.length > 0) {
    return emptyBulkResult(
      `These emails already exist in this organisation: ${existing.join(", ")}.`
    );
  }

  const [catalog, projectKeyMap] = await Promise.all([
    loadBulkComplianceCatalog(admin, orgId),
    resolveProjectMatchKeys(
      admin,
      workers.map((worker) => worker.assigned_project_id ?? "")
    ),
  ]);

  const outcomes: BulkWorkerOutcome[] = [];

  for (let offset = 0; offset < workers.length; offset += BULK_ONBOARD_CHUNK_SIZE) {
    const chunk = workers.slice(offset, offset + BULK_ONBOARD_CHUNK_SIZE);
    const insertSettled = await Promise.allSettled(
      chunk.map((worker) => {
        const assignedProjectId = worker.assigned_project_id?.trim() || "";
        return processBulkWorker({
          admin,
          orgId,
          worker,
          catalog,
          assignedById,
          projectKeys:
            projectKeyMap.get(assignedProjectId) ??
            new Set(assignedProjectId ? [assignedProjectId] : []),
        });
      })
    );

    const insertedOutcomes: Array<{
      worker: BulkOnboardingWorker;
      outcome: BulkWorkerOutcome;
    }> = [];

    insertSettled.forEach((result, index) => {
      const worker = chunk[index];
      const email = worker.email.trim().toLowerCase();
      const displayName = workerDisplayName(worker);
      if (result.status === "fulfilled") {
        insertedOutcomes.push({ worker, outcome: result.value });
        return;
      }
      outcomes.push({
        email,
        displayName,
        workerId: null,
        imported: false,
        invited: false,
        error:
          result.reason instanceof Error
            ? result.reason.message
            : `Failed to process ${displayName}.`,
      });
    });

    const readyToInvite = insertedOutcomes.filter(
      (row) => row.outcome.imported && row.outcome.workerId
    );
    const inviteSettled = await Promise.allSettled(
      readyToInvite.map((row) =>
        sendBulkWorkerInvite(row.worker, row.outcome.workerId as string)
      )
    );

    const invitedByEmail = new Map<string, BulkWorkerOutcome>();
    inviteSettled.forEach((result, index) => {
      const row = readyToInvite[index];
      if (result.status === "fulfilled") {
        invitedByEmail.set(row.outcome.email, result.value);
        return;
      }
      invitedByEmail.set(row.outcome.email, {
        ...row.outcome,
        invited: false,
        error:
          result.reason instanceof Error
            ? `${row.outcome.displayName}: ${result.reason.message}`
            : `${row.outcome.displayName}: Invite email failed.`,
      });
    });

    for (const row of insertedOutcomes) {
      outcomes.push(invitedByEmail.get(row.outcome.email) ?? row.outcome);
    }
  }

  const succeededEmails = outcomes
    .filter((outcome) => outcome.imported && outcome.invited)
    .map((outcome) => outcome.email);
  const failedEmails = [
    ...new Set(
      outcomes
        .filter((outcome) => !(outcome.imported && outcome.invited))
        .map((outcome) => outcome.email)
    ),
  ];
  const inviteErrors = outcomes
    .filter((outcome) => outcome.error)
    .map((outcome) => outcome.error as string);
  const imported = outcomes.filter((outcome) => outcome.imported).length;
  const invited = outcomes.filter((outcome) => outcome.invited).length;
  const successCount = outcomes.filter((outcome) => outcome.imported && outcome.invited).length;
  const failedCount = workers.length - successCount;

  revalidatePath("/organisation/workers");
  revalidatePath("/organisation/onboarding/bulk");

  return {
    error:
      successCount === 0
        ? inviteErrors[0] ?? "Bulk onboarding failed."
        : failedCount > 0
          ? `Imported ${imported} worker${imported === 1 ? "" : "s"}; ${failedCount} need attention.`
          : null,
    imported,
    invited,
    inviteErrors,
    succeededEmails,
    failedEmails,
    successCount,
    failedCount,
  };
}
