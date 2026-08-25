import {
  isSupabaseConfigured,
  resolveSwmsDocumentUrl,
  resolveSwmsDocumentDate,
  resolveSwmsAssigneeName,
  resolveSwmsSigningToken,
  createSwmsSigningToken,
  getSwmsSigningUrl as buildSwmsSigningUrl,
  isValidSwmsId,
  fetchSwmsDocumentRecords,
  fetchSwmsDocumentRecordsByIds,
  insertSwmsDocumentRecord,
  insertSwmsAssignmentRecords,
  fetchSwmsAssignmentRecords,
  fetchSwmsAssignmentRecordsForWorker,
  fetchSwmsAssignmentRecordsForSwms,
  fetchSwmsAssignmentRecordByToken,
  signSwmsAssignmentRecord,
  updateSwmsDocumentArchiveState,
  updateSwmsDocumentFields,
  resetSwmsAssignmentRecord,
  deleteSwmsDocumentCascade,
  resolveSwmsIsArchived,
  resolveSwmsDocumentStatus,
  resolveSwmsScope,
  resolveSwmsVersion,
  resolveSwmsTargetId,
  type SwmsDocumentRecord,
  type SwmsAssignmentRecord,
  type SwmsAssigneeType,
  type SwmsAssignmentStatus,
  type SwmsViewFilter,
  type SwmsAdminTabFilter,
  type SwmsScope,
} from "./supabase";

export type {
  SwmsAssigneeType,
  SwmsAssignmentStatus,
  SwmsViewFilter,
  SwmsAdminTabFilter,
  SwmsScope,
};
export type SwmsAssignment = SwmsAssignmentRecord;

export interface SwmsDocument extends SwmsDocumentRecord {
  swms_id?: string | null;
  doc_id?: string | null;
  assignments?: SwmsAssignment[];
}

export interface SwmsDocumentSummary extends SwmsDocument {
  totalAssigned: number;
  signedCount: number;
  pendingCount: number;
}

export {
  isValidSwmsId,
  insertSwmsDocumentRecord,
  insertSwmsAssignmentRecords,
  createSwmsSigningToken,
  resolveSwmsTargetId,
  resolveSwmsScope,
  resolveSwmsVersion,
};

export type SwmsArchiveItem = {
  id?: string | null;
  swms_id?: string | null;
  doc_id?: string | null;
  _id?: string | null;
  swmsId?: string | null;
  title?: string | null;
  document_date?: string | null;
  issue_date?: string | null;
  date?: string | null;
  file_url?: string | null;
  doc_url?: string | null;
};

export function incrementSwmsVersion(version: string): string {
  const trimmed = version.trim();
  const match = trimmed.match(/^v?(\d+)\.(\d+)$/i);
  if (match) {
    const major = parseInt(match[1], 10) + 1;
    return `v${major}.0`;
  }
  const numeric = trimmed.match(/^(\d+)$/);
  if (numeric) {
    return `v${parseInt(numeric[1], 10) + 1}.0`;
  }
  return "v2.0";
}

export function formatSwmsVersionLabel(version: string | null | undefined): string {
  const value = resolveSwmsVersion({ version });
  return value.startsWith("v") ? value : `v${value}`;
}

export function matchesSwmsListItem(
  left: SwmsArchiveItem & { title?: string | null },
  right: SwmsArchiveItem & { title?: string | null }
): boolean {
  const leftId = resolveSwmsTargetId(left);
  const rightId = resolveSwmsTargetId(right);
  if (leftId && rightId && leftId === rightId) return true;

  const leftTitle = String(left.title ?? "").trim();
  const rightTitle = String(right.title ?? "").trim();
  if (leftTitle && rightTitle && leftTitle === rightTitle) return true;

  return false;
}

export function isSwmsItemArchived(
  item:
    | {
        is_archived?: boolean | null;
        status?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!item) return false;
  return Boolean(item.is_archived || item.status === "Archived");
}

export function applyOptimisticSwmsArchiveState(
  documents: SwmsDocumentSummary[],
  item: SwmsDocumentSummary,
  targetArchived: boolean
): SwmsDocumentSummary[] {
  const targetId = resolveSwmsTargetId(item) || item.id;
  const targetTitle = item.title;

  return documents.map((row) =>
    (targetId && (row.id === targetId || resolveSwmsTargetId(row) === targetId)) ||
    (targetTitle && row.title === targetTitle)
      ? {
          ...row,
          is_archived: targetArchived,
          status: targetArchived ? "Archived" : "Active",
        }
      : row
  );
}

export function getSwmsDocumentUrl(
  doc:
    | {
        doc_url?: string | null;
        file_url?: string | null;
      }
    | null
    | undefined
): string {
  return resolveSwmsDocumentUrl(doc);
}

export function getSwmsDocumentDate(
  doc:
    | {
        document_date?: string | null;
        issue_date?: string | null;
        date?: string | null;
      }
    | null
    | undefined
): string {
  return resolveSwmsDocumentDate(doc);
}

export function getSwmsAssigneeName(
  assignment:
    | {
        assignee_name?: string | null;
        worker_name?: string | null;
        subcontractor_name?: string | null;
        name?: string | null;
      }
    | null
    | undefined
): string {
  return resolveSwmsAssigneeName(assignment);
}

export function getSwmsSigningToken(
  assignment:
    | {
        signing_token?: string | null;
        token?: string | null;
        signature_token?: string | null;
      }
    | null
    | undefined
): string {
  return resolveSwmsSigningToken(assignment);
}

export function isSwmsArchived(
  doc:
    | {
        is_archived?: boolean | null;
        status?: string | null;
      }
    | null
    | undefined
): boolean {
  return resolveSwmsIsArchived(doc);
}

export function getSwmsDocumentStatus(
  doc:
    | {
        is_archived?: boolean | null;
        status?: string | null;
      }
    | null
    | undefined
): string {
  return resolveSwmsDocumentStatus(doc);
}

export function filterSwmsDocumentsByView(
  documents: SwmsDocumentSummary[],
  view: SwmsViewFilter
): SwmsDocumentSummary[] {
  return documents.filter((item) => {
    const isArchived = isSwmsItemArchived(item);
    if (view === "archived") return isArchived;
    if (view === "active") return !isArchived;
    return true;
  });
}

export function filterSwmsDocumentsByAdminTab(
  documents: SwmsDocumentSummary[],
  tab: SwmsAdminTabFilter
): SwmsDocumentSummary[] {
  return documents.filter((item) => {
    const isArchived = isSwmsItemArchived(item);
    const scope = resolveSwmsScope(item);

    if (tab === "archived") return isArchived;
    if (isArchived) return false;
    if (tab === "company") return scope === "company";
    return scope === "site_specific";
  });
}

function toSwmsDocument(record: SwmsDocumentRecord): SwmsDocument {
  const documentUrl = resolveSwmsDocumentUrl(record);
  const documentDate = resolveSwmsDocumentDate(record);
  return {
    ...record,
    file_url: documentUrl,
    document_date: documentDate,
    is_archived: resolveSwmsIsArchived(record),
    status: resolveSwmsDocumentStatus(record),
    swms_scope: resolveSwmsScope(record),
    version: resolveSwmsVersion(record),
  };
}

export function getSwmsSigningUrl(
  tokenOrAssignment: Parameters<typeof buildSwmsSigningUrl>[0]
): string {
  return buildSwmsSigningUrl(tokenOrAssignment);
}

function summarizeSwms(doc: SwmsDocument): SwmsDocumentSummary {
  const assignments = doc.assignments ?? [];
  const signedCount = assignments.filter((row) => row.status === "Signed").length;
  return {
    ...doc,
    totalAssigned: assignments.length,
    signedCount,
    pendingCount: assignments.length - signedCount,
  };
}

export async function fetchSwmsDocuments(): Promise<SwmsDocumentSummary[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const docs = (await fetchSwmsDocumentRecords()).map(toSwmsDocument);
    const assignments = await fetchSwmsAssignmentRecords();

    const assignmentsBySwms = new Map<string, SwmsAssignment[]>();
    for (const assignment of assignments) {
      const list = assignmentsBySwms.get(assignment.swms_id) ?? [];
      list.push(assignment);
      assignmentsBySwms.set(assignment.swms_id, list);
    }

    return docs.map((doc) =>
      summarizeSwms({
        ...doc,
        assignments: assignmentsBySwms.get(doc.id) ?? [],
      })
    );
  } catch (error) {
    console.error(
      "fetchSwmsDocuments failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function fetchSwmsList(): Promise<SwmsDocumentSummary[]> {
  return fetchSwmsDocuments();
}

export async function fetchProjectSwmsDocuments(
  projectId: string
): Promise<SwmsDocumentSummary[]> {
  const trimmedProjectId = projectId.trim();
  if (!trimmedProjectId) return [];

  const all = await fetchSwmsDocuments();
  return all.filter(
    (doc) =>
      !isSwmsItemArchived(doc) &&
      resolveSwmsScope(doc) === "site_specific" &&
      doc.project_id === trimmedProjectId
  );
}

export async function createSwmsDocument(input: {
  title: string;
  documentDate?: string | null;
  fileUrl: string;
  fileName?: string | null;
  workerAssignments?: Array<{ id: string; name: string }>;
  subcontractorAssignments?: Array<{ id: string; name: string }>;
  projectId?: string | null;
  swmsScope?: SwmsScope;
  version?: string;
  masterSwmsId?: string | null;
  previousVersionId?: string | null;
}): Promise<{ error: string | null; document: SwmsDocumentSummary | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", document: null };
  }

  try {
    const trimmedProjectId = input.projectId?.trim() || null;
    const scope =
      input.swmsScope ?? (trimmedProjectId ? "site_specific" : "company");

    if (scope === "site_specific") {
      if (!trimmedProjectId) {
        return {
          error: "A target project is required for site-specific SWMS.",
          document: null,
        };
      }
      if (!isValidSwmsId(trimmedProjectId)) {
        return {
          error: "Select a valid project before saving the site-specific SWMS.",
          document: null,
        };
      }
    }

    const { doc, error: docError } = await insertSwmsDocumentRecord({
      title: input.title,
      documentDate: input.documentDate,
      uploadedUrl: input.fileUrl,
      fileName: input.fileName,
      projectId: trimmedProjectId,
      swmsScope: scope,
      version: input.version,
      masterSwmsId: input.masterSwmsId,
      previousVersionId: input.previousVersionId,
    });

    if (docError || !doc) {
      return { error: docError ?? "Failed to create SWMS document.", document: null };
    }

    if (!isValidSwmsId(doc.id)) {
      return {
        error: "SWMS document insert did not return a valid UUID.",
        document: null,
      };
    }

    const swmsId = doc.id.trim();
    const workerAssignments = input.workerAssignments ?? [];
    const subcontractorAssignments = input.subcontractorAssignments ?? [];

    const hasAssignments =
      workerAssignments.length > 0 || subcontractorAssignments.length > 0;

    if (hasAssignments) {
      const { error: assignmentError } = await insertSwmsAssignmentRecords({
        swmsId,
        workerAssignments: workerAssignments.map((worker) => ({
          id: worker.id,
          name: worker.name,
          signingToken: createSwmsSigningToken(),
        })),
        subcontractorAssignments: subcontractorAssignments.map((subcontractor) => ({
          id: subcontractor.id,
          name: subcontractor.name,
          signingToken: createSwmsSigningToken(),
        })),
      });

      if (assignmentError) {
        return { error: assignmentError, document: null };
      }
    }

    const full = await fetchSwmsDocuments();
    const created = full.find((row) => row.id === swmsId) ?? null;
    return { error: null, document: created };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create SWMS document.";
    console.error("createSwmsDocument failed:", error);
    return { error: message, document: null };
  }
}

export async function createCompanySwmsDocument(input: {
  title: string;
  documentDate?: string | null;
  fileUrl: string;
  fileName?: string | null;
}): Promise<{ error: string | null; document: SwmsDocumentSummary | null }> {
  return createSwmsDocument({
    ...input,
    swmsScope: "company",
    version: "1.0",
  });
}

export async function createSiteSpecificSwmsDocument(input: {
  title: string;
  documentDate?: string | null;
  fileUrl: string;
  fileName?: string | null;
  projectId: string;
  workerAssignments?: Array<{ id: string; name: string }>;
}): Promise<{ error: string | null; document: SwmsDocumentSummary | null }> {
  return createSwmsDocument({
    title: input.title,
    documentDate: input.documentDate,
    fileUrl: input.fileUrl,
    fileName: input.fileName,
    projectId: input.projectId,
    workerAssignments: input.workerAssignments,
    swmsScope: "site_specific",
    version: "1.0",
  });
}

export async function updateSwmsDocument(
  id: string,
  input: {
    title?: string;
    documentDate?: string | null;
    fileUrl?: string;
  }
): Promise<{ error: string | null }> {
  return updateSwmsDocumentFields(id, {
    title: input.title,
    documentDate: input.documentDate,
    uploadedUrl: input.fileUrl,
  });
}

export async function ensureSwmsWorkerAssignments(
  swmsId: string,
  workers: Array<{ id: string; name: string }>
): Promise<{ error: string | null; created: number }> {
  if (!isValidSwmsId(swmsId)) {
    return { error: "A valid SWMS document id is required.", created: 0 };
  }

  const existing = await fetchSwmsAssignmentRecordsForSwms(swmsId);
  const existingWorkerIds = new Set(
    existing
      .filter((row) => row.assignee_type === "worker")
      .map((row) => row.assignee_id)
  );

  const missing = workers.filter((worker) => !existingWorkerIds.has(worker.id));
  if (missing.length === 0) {
    return { error: null, created: 0 };
  }

  const { error } = await insertSwmsAssignmentRecords({
    swmsId,
    workerAssignments: missing.map((worker) => ({
      id: worker.id,
      name: worker.name,
      signingToken: createSwmsSigningToken(),
    })),
    subcontractorAssignments: [],
  });

  return { error, created: error ? 0 : missing.length };
}

export async function pushSwmsToProject(input: {
  masterSwms: SwmsDocumentSummary;
  projectId: string;
  projectWorkers: Array<{ id: string; name: string }>;
}): Promise<{ error: string | null; document: SwmsDocumentSummary | null }> {
  const fileUrl = getSwmsDocumentUrl(input.masterSwms);
  if (!fileUrl) {
    return { error: "Master SWMS is missing a document file.", document: null };
  }

  const { error, document } = await createSwmsDocument({
    title: input.masterSwms.title,
    documentDate: getSwmsDocumentDate(input.masterSwms),
    fileUrl,
    projectId: input.projectId,
    swmsScope: "site_specific",
    version: resolveSwmsVersion(input.masterSwms),
    masterSwmsId: input.masterSwms.id,
    workerAssignments: input.projectWorkers,
  });

  return { error, document };
}

export async function sendSwmsNewVersion(input: {
  swms: SwmsDocumentSummary;
  projectWorkers?: Array<{ id: string; name: string }>;
}): Promise<{ error: string | null; document: SwmsDocumentSummary | null }> {
  const fileUrl = getSwmsDocumentUrl(input.swms);
  if (!fileUrl) {
    return { error: "SWMS is missing a document file.", document: null };
  }

  const { error: archiveError } = await updateSwmsDocumentArchiveState(input.swms, true);
  if (archiveError) {
    return { error: archiveError, document: null };
  }

  const nextVersion = incrementSwmsVersion(resolveSwmsVersion(input.swms));
  const scope = resolveSwmsScope(input.swms);
  const workers =
    input.projectWorkers ??
    (input.swms.assignments ?? [])
      .filter((row) => row.assignee_type === "worker")
      .map((row) => ({
        id: row.assignee_id,
        name: getSwmsAssigneeName(row),
      }));

  const { error, document } = await createSwmsDocument({
    title: input.swms.title,
    documentDate: new Date().toISOString().slice(0, 10),
    fileUrl,
    projectId: input.swms.project_id,
    swmsScope: scope,
    version: nextVersion,
    masterSwmsId: input.swms.master_swms_id ?? (scope === "company" ? input.swms.id : null),
    previousVersionId: input.swms.id,
    workerAssignments: scope === "site_specific" ? workers : [],
  });

  return { error, document };
}

export async function sendSwmsSignatureReminder(
  assignment: SwmsAssignment
): Promise<{ error: string | null; signingUrl: string }> {
  const signingUrl = getSwmsSigningUrl(assignment);
  if (!signingUrl) {
    return { error: "Signing link is unavailable for this assignment.", signingUrl: "" };
  }

  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(signingUrl);
    } catch {
      return {
        error: "Could not copy signing link. Open the link manually.",
        signingUrl,
      };
    }
  }

  return { error: null, signingUrl };
}

export async function resetSwmsAssignmentSignatures(
  swmsId: string,
  workerIds: string[]
): Promise<{ error: string | null; resetCount: number }> {
  const assignments = await fetchSwmsAssignmentRecordsForSwms(swmsId);
  const workerIdSet = new Set(workerIds);
  let resetCount = 0;
  let lastError: string | null = null;

  for (const assignment of assignments) {
    if (
      assignment.assignee_type !== "worker" ||
      !workerIdSet.has(assignment.assignee_id)
    ) {
      continue;
    }

    const { error } = await resetSwmsAssignmentRecord({
      assignmentId: assignment.id,
      signingToken: createSwmsSigningToken(),
    });

    if (error) {
      lastError = error;
      continue;
    }
    resetCount += 1;
  }

  return { error: lastError, resetCount };
}

export async function fetchSwmsAssignmentsForWorker(
  workerId: string
): Promise<Array<SwmsAssignment & { swms?: SwmsDocument }>> {
  try {
    if (!isSupabaseConfigured()) return [];

    const rows = await fetchSwmsAssignmentRecordsForWorker(workerId);
    if (rows.length === 0) return [];

    const swmsIds = Array.from(new Set(rows.map((row) => row.swms_id)));
    const docsById = await fetchSwmsDocumentRecordsByIds(swmsIds);

    return rows
      .filter((row) => {
        const doc = docsById.get(row.swms_id);
        return doc ? !resolveSwmsIsArchived(doc) : false;
      })
      .map((row) => ({
        ...row,
        swms: docsById.has(row.swms_id)
          ? toSwmsDocument(docsById.get(row.swms_id)!)
          : undefined,
      }));
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentsForWorker failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function fetchSwmsAssignmentByToken(
  token: string
): Promise<(SwmsAssignment & { swms?: SwmsDocument }) | null> {
  try {
    const assignment = await fetchSwmsAssignmentRecordByToken(token);
    if (!assignment) return null;

    const docsById = await fetchSwmsDocumentRecordsByIds([assignment.swms_id]);
    const doc = docsById.get(assignment.swms_id);

    return {
      ...assignment,
      swms: doc ? toSwmsDocument(doc) : undefined,
    };
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentByToken failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function signSwmsAssignment(input: {
  token: string;
  signatureUrl: string;
  acknowledgedRisks?: boolean;
}): Promise<{ error: string | null }> {
  return signSwmsAssignmentRecord(input);
}

export function countPendingSwmsAssignments(
  assignments: Array<Pick<SwmsAssignment, "status">>
): number {
  return assignments.filter((row) => row.status === "Pending").length;
}

export async function archiveSwmsDocument(
  item: SwmsArchiveItem
): Promise<{ error: string | null }> {
  return updateSwmsDocumentArchiveState(item, true);
}

export async function unarchiveSwmsDocument(
  item: SwmsArchiveItem
): Promise<{ error: string | null }> {
  return updateSwmsDocumentArchiveState(item, false);
}

export async function toggleArchiveSWMS(
  item: SwmsArchiveItem,
  targetArchived: boolean
): Promise<{ error: string | null }> {
  return updateSwmsDocumentArchiveState(item, targetArchived);
}

export async function deleteSwmsDocument(
  id: string
): Promise<{ error: string | null }> {
  return deleteSwmsDocumentCascade(id);
}

export interface SwmsWorkerSignOffRow {
  workerId: string;
  workerName: string;
  assignment: SwmsAssignment | null;
  status: SwmsAssignmentStatus | "Not Assigned";
  signedAt: string | null;
}

export function buildSwmsWorkerSignOffMatrix(
  projectWorkers: Array<{ id: string; name: string }>,
  assignments: SwmsAssignment[]
): SwmsWorkerSignOffRow[] {
  const assignmentByWorker = new Map<string, SwmsAssignment>();
  for (const assignment of assignments) {
    if (assignment.assignee_type !== "worker") continue;
    assignmentByWorker.set(assignment.assignee_id, assignment);
  }

  return projectWorkers.map((worker) => {
    const assignment = assignmentByWorker.get(worker.id) ?? null;
    if (!assignment) {
      return {
        workerId: worker.id,
        workerName: worker.name,
        assignment: null,
        status: "Not Assigned" as const,
        signedAt: null,
      };
    }

    return {
      workerId: worker.id,
      workerName: worker.name,
      assignment,
      status: assignment.status,
      signedAt: assignment.signed_at,
    };
  });
}
